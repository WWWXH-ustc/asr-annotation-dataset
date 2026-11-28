#!/usr/bin/env python3
"""Import the release archives into the workbench media directories."""
import argparse
import json
import shutil
from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent


def import_archive(archive_path, archive_root, suffix):
    entries = {}
    for line in (ROOT / 'manifests/candidates.jsonl').read_text(encoding='utf-8').splitlines():
        candidate = json.loads(line)
        domain = candidate['domain_id']
        identity = candidate['candidate_id']
        filename = identity + suffix
        entries[f'{archive_root}/{domain}/{filename}'] = ROOT / 'raw' / domain / identity / filename

    imported = skipped = 0
    with ZipFile(archive_path) as archive:
        members = [info for info in archive.infolist() if info.filename in entries]
        if not members or len({info.filename for info in members}) != len(members):
            raise ValueError(f'No matching files or duplicate entries: {archive_path}')
        for info in members:
            target = entries[info.filename]
            if target.resolve() != target:
                raise ValueError(f'Unexpected media path: {target}')
            if target.exists():
                skipped += 1
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, NamedTemporaryFile(dir=target.parent, delete=False) as output:
                partial = Path(output.name)
                try:
                    shutil.copyfileobj(source, output, 1024 * 1024)
                    output.close()
                    partial.replace(target)
                finally:
                    partial.unlink(missing_ok=True)
            imported += 1
    print(f'{archive_path.name}: {imported} imported, {skipped} already present')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audio', type=Path, help='Combined asr-audio.zip archive')
    parser.add_argument('--subtitles', type=Path, help='asr-subtitles.zip archive')
    args = parser.parse_args()
    if not (args.audio or args.subtitles):
        parser.error('provide --audio, --subtitles, or both')
    if args.audio:
        import_archive(args.audio, '音频', '.audio.m4a')
    if args.subtitles:
        import_archive(args.subtitles, '字幕', '.srt')


if __name__ == '__main__':
    main()
