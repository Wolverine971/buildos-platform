# scripts/database/pin_current_schema.py
"""Pin a reviewed schema-only rehearsal snapshot for offline CI (no network calls).

Review the decompressed SQL before committing. This rejects COPY payloads outside
the rehearsal's explicitly allowed schema-configuration tables; it is not a secret
scanner. Never pass a full database/data dump here.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re

from current_schema import FIXTURE, ROOT


def pin(schema_path, metadata_path, cutoff, late):
    raw = schema_path.read_bytes()
    text = raw.decode()
    copies = re.findall(r'^COPY (.+?) \(', text, re.M)
    if copies != ['"private"."project_fold_table_policy"']:
        raise ValueError(f'Unexpected COPY payloads: {copies}; only fold-policy configuration belongs in this fixture')
    meta = json.loads(metadata_path.read_text())
    manifest = {
        'captured_at': meta['captured_at'], 'server_version': meta['server_version'],
        'schema_sha256': hashlib.sha256(raw).hexdigest(), 'cutoff_version': cutoff,
        'roles': meta['roles'], 'late_migrations': sorted(late),
        'absorbed_migrations': {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((ROOT / 'supabase/migrations').glob('*.sql'))
            if p.name[:14] <= cutoff and p.name not in late
        }
    }
    FIXTURE.mkdir(exist_ok=True)
    (FIXTURE / 'schema.sql.gz').write_bytes(gzip.compress(raw, mtime=0))
    (FIXTURE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--schema', type=Path, required=True)
    parser.add_argument('--metadata', type=Path, required=True)
    parser.add_argument('--cutoff', required=True)
    parser.add_argument('--late', action='append', default=[])
    args = parser.parse_args()
    pin(args.schema, args.metadata, args.cutoff, args.late)
