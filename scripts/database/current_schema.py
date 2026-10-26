# scripts/database/current_schema.py
"""Offline current-schema SQL contracts. Never connects to hosted PostgreSQL.

The reviewed fixture absorbs historical migrations; only explicit late arrivals
and files newer than its cutoff are applied. Each assertion gets a fresh clone.
"""
from __future__ import annotations

import argparse
from contextlib import nullcontext
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid
from urllib.parse import urlparse, urlunparse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/migration-rehearsal'))
from rehearse import LocalCluster, RehearsalError, bootstrap_sql, prepare_dump, resolve_pg_bin
from campaign_claim_races import check_campaign_claim_races

FIXTURE = ROOT / 'supabase/tests/fixtures/current-schema'


def migration_plan(root: Path, manifest: dict) -> list[Path]:
    directory = root / 'supabase/migrations'
    absorbed = manifest['absorbed_migrations']
    for name, digest in absorbed.items():
        path = directory / name
        if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise RehearsalError(f'Baseline migration changed: {name}. Add a new migration; do not edit absorbed history.')
    overlays = set(manifest['late_migrations'])
    selected = []
    for path in sorted(directory.glob('*.sql')):
        if path.name in absorbed:
            continue
        if path.name[:14] <= manifest['cutoff_version'] and path.name not in overlays:
            raise RehearsalError(f'Unclassified historical migration: {path.name}. Review before adding to late_migrations.')
        selected.append(path)
    missing = overlays - {p.name for p in selected}
    if missing:
        raise RehearsalError(f'Missing late migrations: {sorted(missing)}')
    return selected


def local_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in ('postgres', 'postgresql') or parsed.hostname not in ('localhost', '127.0.0.1', '::1'):
        raise RehearsalError('Current-schema tests only accept a disposable localhost PostgreSQL server.')
    if parsed.query or parsed.fragment or parsed.path not in ('', '/', '/postgres'):
        raise RehearsalError('Use the disposable server postgres database, without URL options.')
    return value


class Database:
    def __init__(self, pg_bin: Path, cluster=None, url=None):
        self.pg_bin, self.cluster, self.url = pg_bin, cluster, url

    def command(self, database='postgres'):
        args = [str(self.pg_bin / 'psql'), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']
        if self.url:
            parsed = urlparse(self.url)
            args += ['-d', urlunparse(parsed._replace(path='/' + database))]
        else:
            args += ['-h', str(self.cluster.socket), '-p', '5432', '-U', 'postgres', '-d', database]
        return args

    def sql(self, sql=None, *, database='postgres', file=None):
        args = self.command(database)
        if file:
            args += ['-f', str(file)]
        # Ignore inherited PGOPTIONS/service configuration. Tests use their own
        # connection only, with a bounded timeout even if an assertion deadlocks.
        env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
        env['PGOPTIONS'] = '-c statement_timeout=60000 -c lock_timeout=15000'
        result = subprocess.run(args, input=sql, capture_output=True, text=True, env=env, timeout=180)
        if result.returncode:
            raise RehearsalError(result.stderr[-6000:])
        return result.stdout


def run(args):
    manifest = json.loads((FIXTURE / 'manifest.json').read_text())
    schema = gzip.decompress((FIXTURE / 'schema.sql.gz').read_bytes())
    if hashlib.sha256(schema).hexdigest() != manifest['schema_sha256']:
        raise RehearsalError('Current-schema fixture checksum mismatch.')
    migrations = migration_plan(ROOT, manifest)
    checks = sorted((ROOT / 'supabase/tests').glob('*.check.sql'))
    if args.check:
        names = set(args.check)
        checks = [p for p in checks if p.name in names]
        if names != {p.name for p in checks}:
            raise RehearsalError('Unknown --check filename')
    if not checks:
        raise RehearsalError('No current-schema checks discovered')
    if args.list:
        print('\n'.join(p.name for p in checks))
        return
    url = os.environ.get('BUILDOS_CURRENT_SCHEMA_DATABASE_URL')
    if url:
        local_url(url)
    pg_bin = resolve_pg_bin(args.pg_bin)
    context = nullcontext(None) if url else LocalCluster(pg_bin, False)
    with context as cluster:
        db = Database(pg_bin, cluster, url)
        major = int(db.sql('SHOW server_version_num;').strip()) // 10000
        expected = os.environ.get('BUILDOS_EXPECTED_POSTGRES_MAJOR')
        if expected and major != int(expected):
            raise RehearsalError(f'Expected PostgreSQL {expected}, got {major}')
        template = 'buildos_contract_' + uuid.uuid4().hex[:12]
        db.sql(f'CREATE DATABASE {template};')
        failed = []
        try:
            db.sql(bootstrap_sql(manifest['roles']), database=template)
            # Supabase service_role bypasses RLS; never grant this to client roles.
            db.sql('ALTER ROLE service_role BYPASSRLS;', database=template)
            db.sql(prepare_dump(schema.decode()), database=template)
            for migration in migrations:
                print(f'APPLY {migration.name}', flush=True)
                db.sql(database=template, file=migration)
            print(f'PostgreSQL {major}: running {len(checks)} current-schema checks', flush=True)
            for index, check in enumerate(checks):
                name = f'{template}_{index}'
                db.sql(f'CREATE DATABASE {name} TEMPLATE {template};')
                try:
                    db.sql(database=name, file=check)
                    print(f'PASS {check.name}', flush=True)
                except RehearsalError as error:
                    failed.append(check.name)
                    print(f'FAIL {check.name}\n{error}', flush=True)
                finally:
                    db.sql(f'DROP DATABASE {name} WITH (FORCE);')
            if not args.check or 'email_campaign_daily_cap.check.sql' in args.check:
                name = template + '_race'
                db.sql(f'CREATE DATABASE {name} TEMPLATE {template};')
                try:
                    check_campaign_claim_races(db, name)
                finally:
                    db.sql(f'DROP DATABASE {name} WITH (FORCE);')
        finally:
            db.sql(f'DROP DATABASE {template} WITH (FORCE);')
        if failed:
            raise RehearsalError(f'{len(failed)}/{len(checks)} checks failed: {", ".join(failed)}')
        print(f'PASS all {len(checks)} current-schema checks')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='append', help='Run a specific top-level .check.sql filename')
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--pg-bin')
    try:
        run(parser.parse_args())
    except (RehearsalError, subprocess.TimeoutExpired) as error:
        sys.exit(str(error))
