#!/usr/bin/env python3
"""Local media catalogue and candidate review. Only manifest-registered files are served."""
import argparse
from html import escape
from datetime import datetime
from threading import Lock
import json
import mimetypes
import pathlib
import re
import shutil
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = pathlib.Path(__file__).resolve().parents[1]
STATIC = pathlib.Path(__file__).resolve().parent / 'dist'
REVIEW_LOCK = Lock()
REVIEW_STATES = {'active', 'candidate_archive', 'excluded'}


def read_jsonl(name):
    p = ROOT / 'manifests' / (name + '.jsonl')
    return [json.loads(line) for line in p.read_text(encoding='utf-8').splitlines() if line.strip()] if p.exists() else []


def review_overrides():
    path = ROOT / 'manifests/candidate_review.json'
    return json.loads(path.read_text(encoding='utf-8')) if path.is_file() else {}


def archive_targets(candidate):
    identity = candidate['candidate_id']
    url = urlsplit(candidate['source_url'])
    if not re.fullmatch(r'V[0-9]{3,}', identity) or url.scheme not in ('http', 'https') or not url.hostname:
        raise ValueError('Candidate must have a valid source URL')
    raw = ROOT / 'raw'
    folders = []
    for path in raw.glob(f'*/{identity}'):
        if path.is_symlink() or path.resolve() != path or not path.is_dir():
            raise ValueError('Unexpected archive path')
        folders.append(path)
    frames = []
    for directory in ('caption_frames', 'classroom_frames', 'cantonese6_frames'):
        for path in (ROOT / 'logs' / directory).glob(f'{identity}_*.jpg'):
            if path.is_symlink() or path.resolve() != path or not path.is_file():
                raise ValueError('Unexpected preview path')
            frames.append(path)
    return folders, frames


def remove_archive_files(targets):
    folders, frames = targets
    for folder in folders:
        shutil.rmtree(folder)
    for frame in frames:
        frame.unlink(missing_ok=True)


def save_reviews(changes):
    path = ROOT / 'manifests/candidate_review.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(changes, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def update_review(identity, status, reason):
    with REVIEW_LOCK:
        candidate = next((row for row in read_jsonl('candidates') if row['candidate_id'] == identity), None)
        audio = next((row for row in read_jsonl('acquisitions')
                      if row['candidate_id'] == identity and row['status'] == 'verified'), None)
        if candidate is None or audio is None:
            return None
        changes = review_overrides()
        local_audio = safe_file(audio.get('raw_path'))
        if status != 'candidate_archive' and not local_audio:
            raise FileNotFoundError('Download the source again before restoring it')
        result = {'library_status': status, 'archive_reason': reason if status != 'active' else None,
                  'link_only': status == 'candidate_archive'}
        targets = archive_targets(candidate) if result['link_only'] else None
        if status == 'active' and candidate.get('library_status', 'active') == 'active':
            changes.pop(identity, None)
        else:
            changes[identity] = {**result, 'reviewed_at': datetime.now().astimezone().isoformat()}
        save_reviews(changes)
        if targets is not None:
            remove_archive_files(targets)
        return result



def safe_file(relative):
    if not relative:
        return None
    p = (ROOT / relative).resolve()
    return p if p.is_relative_to(ROOT) and p.is_file() else None


def pending_candidates_page():
    config = json.loads((ROOT / 'manifests/project_config.json').read_text(encoding='utf-8'))
    domains = {domain['id']: domain['name'] for domain in config['domains']}
    verified = {row['candidate_id'] for row in read_jsonl('acquisitions') if row['status'] == 'verified'}
    candidates = [
        row for row in read_jsonl('candidates')
        if row.get('acquisition_batch') == 'sources30_20261109'
        and row.get('screening_status') != 'rejected'
        and row.get('library_status') != 'candidate_archive'
        and row['candidate_id'] not in verified
    ]
    candidates.sort(key=lambda row: (row['domain_id'], row['candidate_id']))
    items = []
    for row in candidates:
        minutes, seconds = divmod(row['original_duration_sec'], 60)
        url = row['source_url']
        link = escape(row['title'])
        if urlsplit(url).scheme == 'https' and urlsplit(url).hostname == 'www.bilibili.com':
            link = f'<a href="{escape(url)}" target="_blank" rel="noopener noreferrer">{link} ↗</a>'
        items.append(
            f"<tr><td>{escape(domains[row['domain_id']])}</td>"
            f"<td>{escape(row['candidate_id'])}</td><td>{escape(row['subfield'])}</td>"
            f"<td>{link}</td><td>{minutes:02d}:{seconds:02d}</td></tr>"
        )
    return f"""<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>11 月 9 日待下载候选 · 声谱</title><link rel="stylesheet" href="/style.css">
<main><p><a href="/">← 返回媒体工作台</a></p>
<h1>11 月 9 日待下载候选 · {len(candidates)} 条</h1>
<p>本轮已保存平台字幕。点击标题可打开原视频试听。</p>
<div class="panel pending-table"><table>
<thead><tr><th>领域</th><th>编号</th><th>子领域</th><th>原视频及分集</th><th>时长</th></tr></thead>
<tbody>{''.join(items)}</tbody></table></div></main></html>"""


def catalogue():
    config = json.loads((ROOT / 'manifests/project_config.json').read_text(encoding='utf-8'))
    candidates = {c['candidate_id']: c for c in read_jsonl('candidates')}
    audios = {a['candidate_id']: a for a in read_jsonl('acquisitions') if a['status'] == 'verified'}
    videos = {v['candidate_id']: v for v in read_jsonl('video_acquisitions') if v['status'] == 'verified'}
    subtitle_log = ROOT / 'logs/subtitle_availability.json'
    subtitles = {s['candidate_id']: s for s in json.loads(subtitle_log.read_text())} if subtitle_log.exists() else {}
    frame_log = ROOT / 'logs/video_caption_frame_checks.json'
    frames = {s['candidate_id']: s for s in json.loads(frame_log.read_text())} if frame_log.exists() else {}
    overrides = review_overrides()
    recommendations_path = ROOT / 'manifests/recommended_subtitle_windows.json'
    recommendations = json.loads(recommendations_path.read_text()) if recommendations_path.exists() else {}
    items, files = [], {}
    for identity in sorted(audios.keys() | (recommendations.keys() & candidates.keys())):
        audio = audios.get(identity, {})
        probe = audio.get('probe', {})
        c = {**candidates[identity], **overrides.get(identity, {})}
        video = videos.get(identity, {})
        files[(identity, 'audio')] = safe_file(audio.get('raw_path'))
        files[(identity, 'video')] = safe_file(video.get('video_path'))
        link_only = c.get('link_only', False) or identity not in audios
        subtitle = safe_file(video.get('subtitle_path') or subtitles.get(identity, {}).get('subtitle_path'))
        subtitle_record = subtitles.get(identity, {})
        selected_track = next((t for t in subtitle_record.get('tracks', []) if t.get('subtitle_path') == subtitle_record.get('subtitle_path')), {})
        language = selected_track.get('lan') or ('zh-TW' if identity == 'V021' else 'zh')
        subtitle_label = '中文 · 平台AI字幕' if language.startswith('ai-') else ('繁体中文 · 平台字幕' if language == 'zh-TW' else '中文 · 平台字幕')
        ranking_path = ROOT / 'logs' / f'{identity}_subtitle_window_ranking.json'
        ranking = json.loads(ranking_path.read_text()) if ranking_path.exists() else {}
        files[(identity, 'subtitle')] = subtitle
        samples = frames.get(identity, {}).get('samples', [])
        files[(identity, 'poster')] = next((safe_file(s['frame_path']) for s in samples if safe_file(s['frame_path'])), None)
        if link_only:
            for kind in ('audio', 'video', 'subtitle', 'poster'):
                files[(identity, kind)] = None
            subtitle = None
        items.append({
            'id': identity, 'domain_id': c['domain_id'], 'title': c['title'], 'publisher': c.get('publisher'),
            'library_status': 'excluded' if identity not in audios else c.get('library_status', 'active'),
            'archive_reason': c.get('archive_reason'), 'link_only': link_only,
            'acquisition_batch': c.get('acquisition_batch'), 'subfield': c.get('subfield'), 'subfield_id': c.get('subfield_id'), 'accent_group': c.get('accent_group'),
            'platform': c['platform'], 'source_url': c['source_url'], 'published_at': c.get('published_at'),
            'duration_sec': probe.get('duration_sec', c.get('original_duration_sec')), 'topics': c.get('classification_tags', c.get('topic_tags', [])),
            'scene': c.get('scene_label', c.get('expected_scene_from_page', '待核验')), 'notes': c.get('notes', ''),
            'scene_category': c.get('scene_category', 'other'),
            'audio': {**probe, 'bytes': audio.get('file_size_bytes'), 'url': f'/media/{identity}/audio' if files[(identity, 'audio')] else None},
            'video': {'url': f'/media/{identity}/video' if files[(identity, 'video')] else None,
                      'width': video.get('width'), 'height': video.get('height'), 'codec': video.get('video_codec'), 'bytes': video.get('file_size_bytes')},
            'poster_url': f'/media/{identity}/poster' if files[(identity, 'poster')] else None,
            'subtitle_url': f'/captions/{identity}.vtt' if subtitle else None,
            'subtitle_download_url': f'/media/{identity}/subtitle' if subtitle else None,
            'subtitle_status': subtitle_label if subtitle else ('画面字幕（抽样已见）' if c.get('caption_visual_status')=='dialogue_text_observed' else '暂无本地字幕'),
            'subtitle_language': language.removeprefix('ai-'),
            'subtitle_windows': recommendations.get(identity, ranking.get('windows', []) if subtitle else []),
            'verified': not link_only and audio.get('decode_check') == 'passed', 'listening_status': '待试听',
        })
    return {'domains': config['domains'], 'items': items}, files


class Handler(BaseHTTPRequestHandler):
    server_version = 'ASRMedia/1.0'

    def log_message(self, fmt, *args):
        if args and str(args[0]).startswith(('GET /media/', 'HEAD /media/')):
            return
        super().log_message(fmt, *args)

    def do_HEAD(self):
        self.handle_request(True)

    def do_GET(self):
        self.handle_request(False)

    def do_POST(self):
        if self.path != '/api/candidate-review':
            return self.send_error(404)
        host = f'127.0.0.1:{self.server.server_port}'
        if self.headers.get('Host') != host or self.headers.get('Origin') != f'http://{host}':
            return self.send_error(403)
        if self.headers.get_content_type() != 'application/json':
            return self.send_error(415)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 4096:
                return self.send_error(400)
            payload = json.loads(self.rfile.read(length))
            identity, status = payload['id'], payload['status']
            reason = payload.get('reason', '')
            if not isinstance(identity, str) or not re.fullmatch(r'V\d{3,}', identity):
                return self.send_error(400)
            if not isinstance(status, str) or status not in REVIEW_STATES:
                return self.send_error(400)
            if not isinstance(reason, str) or len(reason) > 200:
                return self.send_error(400)
        except (ValueError, TypeError, KeyError, AttributeError):
            return self.send_error(400)
        try:
            result = update_review(identity, status, reason.strip())
        except FileNotFoundError:
            return self.send_error(409, 'Local media must be downloaded again')
        except (OSError, ValueError):
            return self.send_error(500)
        if result is None:
            return self.send_error(404)
        return self.bytes_response(json.dumps(result, ensure_ascii=False).encode(), 'application/json; charset=utf-8')

    def bytes_response(self, data, mime, head=False):
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        if not head:
            self.wfile.write(data)

    def send_file(self, file, head=False, mime=None):
        size = file.stat().st_size
        start, end, partial = 0, size - 1, False
        requested = self.headers.get('Range')
        if requested:
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested.strip())
            if not match or (not match[1] and not match[2]):
                return self.range_error(size)
            if not match[1]:
                count = int(match[2])
                if count == 0:
                    return self.range_error(size)
                start = max(0, size-count)
            else:
                start = int(match[1])
                end = min(int(match[2]), size-1) if match[2] else size-1
            if start >= size or end < start:
                return self.range_error(size)
            partial = True
        length = max(0, end-start+1)
        self.send_response(206 if partial else 200)
        self.send_header('Content-Type', mime or mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(length))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if partial:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        if not head:
            try:
                with file.open('rb') as source:
                    source.seek(start)
                    while length:
                        data = source.read(min(length, 256*1024))
                        if not data:
                            break
                        self.wfile.write(data)
                        length -= len(data)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def range_error(self, size):
        self.send_response(416)
        self.send_header('Content-Range', f'bytes */{size}')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def handle_request(self, head):
        path = urlsplit(self.path).path
        try:
            if path == '/pending-candidates':
                return self.bytes_response(pending_candidates_page().encode(), 'text/html; charset=utf-8', head)
            if path == '/api/library':
                data, _ = catalogue()
                return self.bytes_response(json.dumps(data, ensure_ascii=False).encode(), 'application/json; charset=utf-8', head)
            if path.startswith(('/media/', '/captions/')):
                _, files = catalogue()
                if path.startswith('/captions/'):
                    identity = path.removeprefix('/captions/').removesuffix('.vtt')
                    p = files.get((identity, 'subtitle'))
                    if not p:
                        return self.send_error(404)
                    srt = p.read_text(encoding='utf-8-sig')
                    vtt = 'WEBVTT\n\n' + re.sub(r'(\d{2}:\d{2}:\d{2}),(\d{3})', r'\1.\2', srt)
                    return self.bytes_response(vtt.encode(), 'text/vtt; charset=utf-8', head)
                parts = path.split('/')
                p = files.get((parts[2], parts[3])) if len(parts) == 4 else None
                if not p:
                    return self.send_error(404)
                mime = {'.m4a': 'audio/mp4', '.mp4': 'video/mp4'}.get(p.suffix.lower())
                return self.send_file(p, head, mime)
            assets = {'/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css'}
            if path not in assets:
                return self.send_error(404)
            self.send_file(STATIC / assets[path], head)
        except (OSError, ValueError, KeyError) as exc:
            self.log_error('%s', exc)
            self.send_error(500, 'Catalogue unavailable')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'ASR媒体工作台：http://127.0.0.1:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
