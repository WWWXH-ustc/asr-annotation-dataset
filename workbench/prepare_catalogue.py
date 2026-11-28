#!/usr/bin/env python3
"""Build local workbench manifests from the published XLSX guide."""
import argparse
import json
import re
from datetime import time, timedelta
from pathlib import Path, PurePosixPath

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent


def seconds(value):
    if isinstance(value, timedelta):
        return value.total_seconds()
    if isinstance(value, time):
        return (value.hour * 60 + value.minute) * 60 + value.second + value.microsecond / 1e6
    return float(value) * 86400


def prepare(guide):
    book = load_workbook(guide, read_only=True, data_only=True)
    try:
        rows = book['音频明细'].values
        headers = next(rows)
        candidates, acquisitions, videos, subtitles, domains = [], [], [], [], {}
        for values in rows:
            row = dict(zip(headers, values))
            identity = row['素材编号']
            if not identity:
                continue
            media_path = PurePosixPath(row['ZIP 内相对路径'])
            domain = row['领域编号']
            if not re.fullmatch(r'V[0-9]{3,}', identity) or not re.fullmatch(r'D[0-9]{2}|YUE', domain):
                raise ValueError(f'Unexpected sample or domain ID: {identity}, {domain}')
            if media_path.parts != ('音频', domain, f'{identity}.audio.m4a'):
                raise ValueError(f'Unexpected audio path: {media_path}')
            domains[domain] = row['领域']
            base = f'raw/{domain}/{identity}/{identity}'
            url = row.get('视频 URL') or row.get('来源链接')
            duration = seconds(row['原音时长'])
            scene = row.get('场景') or ''
            language = 'ai-zh' if 'AI' in (row.get('字幕来源') or '') else 'zh'
            candidates.append(dict(
                candidate_id=identity, domain_id=domain, title=row['素材标题'],
                subfield=row['子领域'], subfield_id=row.get('子领域编号'),
                platform='B站', source_url=url, publisher=row.get('发布者'),
                original_duration_sec=duration, scene_label=scene,
                scene_category='classroom' if domain == 'D04' else 'meeting' if domain != 'YUE' else 'other',
                accent_group={'广式粤语':'GZ', '港式粤语':'HK'}.get(row.get('粤语口音')),
                topic_tags=(row.get('主题标签') or '').split('、') if row.get('主题标签') else [],
            ))
            acquisitions.append(dict(
                candidate_id=identity, status='verified', raw_path=base+'.audio.m4a',
                file_size_bytes=round(row['大小（MiB）'] * 1048576), decode_check='passed',
                probe=dict(duration_sec=duration, codec_name=row.get('编码'),
                           sample_rate_hz=row.get('采样率（Hz）'), channels=row.get('声道数')),
            ))
            videos.append(dict(candidate_id=identity,status='verified',video_path=base+'.video.mp4'))
            srt = base+'.srt'
            subtitles.append(dict(candidate_id=identity,subtitle_path=srt,tracks=[dict(subtitle_path=srt,lan=language)]))
    finally:
        book.close()
    if not candidates or len({r['candidate_id'] for r in candidates}) != len(candidates):
        raise ValueError('The audio guide must contain unique, nonempty sample IDs')
    manifests = ROOT / 'manifests'
    manifests.mkdir(exist_ok=True)
    (ROOT / 'logs').mkdir(exist_ok=True)
    for name, records in [('candidates',candidates),('acquisitions',acquisitions),('video_acquisitions',videos)]:
        (manifests / f'{name}.jsonl').write_text(
            ''.join(json.dumps(record,ensure_ascii=False)+'\n' for record in records), encoding='utf-8')
    config = {'domains': [{'id': domain, 'name': name} for domain, name in sorted(domains.items()) if domain != 'YUE']}
    (manifests/'project_config.json').write_text(json.dumps(config,ensure_ascii=False),encoding='utf-8')
    (ROOT/'logs/subtitle_availability.json').write_text(json.dumps(subtitles),encoding='utf-8')
    print(f'{len(candidates)} samples registered')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('guide', type=Path)
    prepare(parser.parse_args().guide)
