# scripts/migration-rehearsal/rehearse.py
"""Rehearse Supabase migrations against a local copy of production's schema.

Replaces the retired QA branch's one remaining job: catching a migration that fails, or
does something unexpected, before it touches production. No hosted database is written.

  pnpm db:rehearse supabase/migrations/<file>.sql [more.sql ...] [--check checks.sql]

1. Snapshot (cached 24 h): pg_dump --schema-only of production over a temporary CLI login.
   Every session runs with default_transaction_read_only=on, and pg_dump itself reads
   inside a READ ONLY transaction. No table data is copied. The prod migration ledger
   and table sizes are read through the Management API with read_only: true.
2. A disposable, socket-only PostgreSQL loads the snapshot, applies the migrations in
   order with ON_ERROR_STOP, and runs optional assertion SQL.
3. The report lists what each migration changed (tables, columns, indexes, constraints,
   functions incl. SECURITY DEFINER/search_path/grants, policies, triggers, grants),
   the prod size of every table it touched, and ledger warnings.

Local requirements: PostgreSQL client/server binaries (initdb, pg_ctl, psql, pg_dump) and
pgvector built for that server; see README.md. The cluster is deleted unless --keep.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / 'supabase' / 'migrations'
PRODUCTION_REF = 'iwifjtlebphefldmwbkh'
CACHE_ROOT = Path(os.environ.get('XDG_CACHE_HOME', Path.home() / '.cache')) / 'buildos' / 'migration-rehearsal'
USER_AGENT = 'buildos-migration-rehearsal/1'

# Platform-managed schemas, as excluded by `supabase db dump`. auth and storage are kept:
# app tables reference auth.users and policies call auth.uid().
EXCLUDED_SCHEMAS = (
    'information_schema', 'pg_*', '_analytics', '_realtime', '_supavisor', 'extensions',
    'pgbouncer', 'realtime', 'supabase_functions', 'supabase_migrations', 'graphql',
    'graphql_public', 'net', 'pgsodium', 'pgsodium_masks', 'vault', 'cron',
)
# Hosted-only extensions: their objects live in excluded schemas and app code does not
# depend on them at DDL time. Everything else must load or the rehearsal fails.
HOSTED_ONLY_EXTENSIONS = ('hypopg', 'index_advisor', 'pgjwt', 'supabase_vault', 'pg_graphql',
                          'pg_net', 'pgsodium', 'pg_cron')
BOOTSTRAP_EXTENSIONS = ('pgcrypto', 'uuid-ossp', 'pg_stat_statements')
MIGRATION_NAME = re.compile(r'^(\d{14})_([a-z0-9_]+)\.sql$')

FINGERPRINT_SQL = r"""
WITH app_ns AS (
  SELECT oid, nspname FROM pg_namespace
  WHERE nspname NOT LIKE 'pg\_%' AND nspname NOT IN ('information_schema', 'extensions', 'vault')
), rels AS (
  SELECT c.oid, n.nspname, c.relname, c.relkind, c.relacl, c.relrowsecurity
  FROM pg_class c JOIN app_ns n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
)
SELECT json_agg(row_to_json(x)) FROM (
  SELECT 'table' AS kind, format('%I.%I', nspname, relname) AS id,
         json_build_object('kind', relkind, 'rls', relrowsecurity,
                           'grants', (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(relacl) a)) AS info
  FROM rels
  UNION ALL
  SELECT 'column', format('%I.%I.%I', r.nspname, r.relname, a.attname),
         json_build_object('type', format_type(a.atttypid, a.atttypmod), 'not_null', a.attnotnull,
                           'default', pg_get_expr(ad.adbin, ad.adrelid))
  FROM rels r JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
  WHERE r.relkind IN ('r', 'p', 'f')
  UNION ALL
  SELECT 'view', format('%I.%I', nspname, relname), json_build_object('md5', md5(pg_get_viewdef(oid)))
  FROM rels WHERE relkind IN ('v', 'm')
  UNION ALL
  SELECT 'index', format('%I.%I', n.nspname, ic.relname), json_build_object('def', pg_get_indexdef(i.indexrelid))
  FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN app_ns n ON n.oid = ic.relnamespace
  UNION ALL
  SELECT 'constraint', format('%I.%I.%I', n.nspname, c.relname, k.conname),
         json_build_object('def', pg_get_constraintdef(k.oid))
  FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN app_ns n ON n.oid = c.relnamespace
  UNION ALL
  SELECT 'function', format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
         json_build_object('security_definer', p.prosecdef, 'config', p.proconfig,
                           'grants', (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(p.proacl) a),
                           'returns', pg_get_function_result(p.oid), 'volatility', p.provolatile,
                           'body_md5', md5(p.prosrc))
  FROM pg_proc p JOIN app_ns n ON n.oid = p.pronamespace
  WHERE NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  UNION ALL
  SELECT 'policy', format('%I.%I.%I', schemaname, tablename, policyname),
         json_build_object('cmd', cmd, 'roles', roles, 'permissive', permissive,
                           'using', qual, 'check', with_check)
  FROM pg_policies WHERE schemaname IN (SELECT nspname FROM app_ns)
  UNION ALL
  SELECT 'trigger', format('%I.%I.%I', n.nspname, c.relname, t.tgname),
         json_build_object('def', pg_get_triggerdef(t.oid), 'enabled', t.tgenabled)
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN app_ns n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal
  UNION ALL
  SELECT 'type', format('%I.%I', n.nspname, t.typname),
         json_build_object('labels', (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
                                      FROM pg_enum e WHERE e.enumtypid = t.oid))
  FROM pg_type t JOIN app_ns n ON n.oid = t.typnamespace WHERE t.typtype IN ('e', 'd')
  UNION ALL
  SELECT 'schema', nspname, json_build_object() FROM app_ns
) x;
"""

LEDGER_SQL = """
SELECT json_build_object(
  'versions', (SELECT coalesce(json_agg(version ORDER BY version), '[]') FROM supabase_migrations.schema_migrations),
  'tables', (SELECT coalesce(json_object_agg(format('%I.%I', n.nspname, c.relname),
                                             json_build_object('rows', greatest(c.reltuples, 0)::bigint,
                                                               'bytes', pg_total_relation_size(c.oid))), '{}')
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind IN ('r', 'p') AND n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'),
  'roles', (SELECT json_agg(rolname ORDER BY rolname) FROM pg_roles
            WHERE rolname NOT LIKE 'pg\\_%' AND rolname NOT LIKE 'cli\\_login\\_%'),
  'server_version', current_setting('server_version')
) AS snapshot
"""


class RehearsalError(RuntimeError):
    pass


# ---------------------------------------------------------------- hosted reads

def management(path: str, body: dict | None = None) -> object:
    token = os.environ.get('SUPABASE_ACCESS_TOKEN') or (Path.home() / '.supabase/access-token').read_text().strip()
    request = urllib.request.Request(
        f'https://api.supabase.com{path}', method='POST' if body is not None else 'GET',
        data=None if body is None else json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json', 'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise RehearsalError(f'Management API {path} returned {error.code}: {error.read()[:300]!r}') from None


def read_only_query(ref: str, sql: str) -> object:
    rows = management(f'/v1/projects/{ref}/database/query',
                      {'query': f'BEGIN READ ONLY;\n{sql};\nCOMMIT;', 'read_only': True})
    if not isinstance(rows, list) or not rows:
        raise RehearsalError('Read-only query returned no rows')
    return next(iter(rows[0].values()))


def dump_schema(ref: str, target: Path, pg_bin: Path) -> None:
    # Same temporary login the Supabase CLI uses for `db dump --linked`. The read-only
    # login cannot LOCK tables whose SELECT grant was revoked, which pg_dump requires.
    login = management(f'/v1/projects/{ref}/cli/login-role', {'read_only': False})
    env = dict(os.environ, PGHOST=f'db.{ref}.supabase.co', PGPORT='5432', PGDATABASE='postgres',
               PGUSER=login['role'], PGPASSWORD=login['password'], PGSSLMODE='require',
               PGCONNECT_TIMEOUT='20', PGOPTIONS='-c default_transaction_read_only=on')
    partial = target.with_suffix('.partial')
    args = [str(pg_bin / 'pg_dump'), '--schema-only', '--quote-all-identifiers', '--role', 'postgres',
            *[f'--exclude-schema={schema}' for schema in EXCLUDED_SCHEMAS], '--file', str(partial)]
    result = subprocess.run(args, env=env, capture_output=True, text=True)
    if result.returncode:
        partial.unlink(missing_ok=True)
        raise RehearsalError(f'pg_dump failed: {result.stderr.strip()[:500]}')
    partial.chmod(0o600)
    partial.replace(target)


def load_snapshot(ref: str, refresh: bool, max_age_hours: float, pg_bin: Path) -> tuple[Path, dict]:
    directory = CACHE_ROOT / ref
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    schema, meta_path = directory / 'schema.sql', directory / 'meta.json'
    if not refresh and schema.exists() and meta_path.exists():
        meta = json.loads(meta_path.read_text())
        age_hours = (time.time() - meta['captured_at_epoch']) / 3600
        if age_hours <= max_age_hours:
            meta['age_hours'] = round(age_hours, 1)
            return schema, meta
    print(f'Snapshotting production schema ({ref}); this takes about two minutes…', flush=True)
    started = time.time()
    dump_schema(ref, schema, pg_bin)
    snapshot = read_only_query(ref, LEDGER_SQL)
    meta = {'project_ref': ref, 'captured_at_epoch': time.time(),
            'captured_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'dump_seconds': round(time.time() - started, 1), **snapshot}
    meta_path.write_text(json.dumps(meta))
    meta_path.chmod(0o600)
    meta['age_hours'] = 0.0
    return schema, meta


# ---------------------------------------------------------------- pure helpers

def prepare_dump(text: str) -> str:
    """Comment out hosted-only extensions and grants on excluded schemas (as `supabase db dump`
    does); everything else must load as-is."""
    names = '|'.join(re.escape(name) for name in HOSTED_ONLY_EXTENSIONS)
    text = re.sub(rf'^((?:CREATE EXTENSION IF NOT EXISTS|COMMENT ON EXTENSION) "(?:{names})".*)$',
                  r'-- rehearsal: hosted-only -- \1', text, flags=re.M)
    schemas = '|'.join(schema.replace('*', '[a-z0-9_]*') for schema in EXCLUDED_SCHEMAS)
    text = re.sub(rf'^((?:GRANT|REVOKE) .+ ON (?:[A-Z]+ )+"(?:{schemas})"\..*)$',
                  r'-- rehearsal: excluded schema -- \1', text, flags=re.M)
    # Platform event triggers call hosted-only functions (e.g. pg_graphql's placeholder).
    return re.sub(r'^((?:CREATE|ALTER) EVENT TRIGGER [^;]*;)',
                  lambda m: '\n'.join('-- rehearsal: platform -- ' + line for line in m.group(1).splitlines()),
                  text, flags=re.M)


def bootstrap_sql(roles: list[str]) -> str:
    roles = sorted(set(roles) | {'anon', 'authenticated', 'service_role', 'authenticator', 'supabase_admin'})
    statements = [f'DO $$ BEGIN CREATE ROLE {quote_ident(role)} NOLOGIN; '
                  f'EXCEPTION WHEN duplicate_object THEN NULL; END $$;' for role in roles if role != 'postgres']
    statements += ['CREATE SCHEMA IF NOT EXISTS extensions;', 'CREATE SCHEMA IF NOT EXISTS vault;']
    statements += [f'CREATE EXTENSION IF NOT EXISTS "{name}" WITH SCHEMA extensions;' for name in BOOTSTRAP_EXTENSIONS]
    return '\n'.join(statements)


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def diff_fingerprints(before: list[dict], after: list[dict]) -> list[dict]:
    old = {(row['kind'], row['id']): row['info'] for row in before}
    new = {(row['kind'], row['id']): row['info'] for row in after}
    changes = []
    for key in sorted(old.keys() | new.keys()):
        if key not in old:
            changes.append({'op': '+', 'kind': key[0], 'id': key[1], 'detail': new[key]})
        elif key not in new:
            changes.append({'op': '-', 'kind': key[0], 'id': key[1]})
        elif old[key] != new[key]:
            fields = {field: {'from': old[key].get(field), 'to': new[key].get(field)}
                      for field in sorted(old[key].keys() | new[key].keys())
                      if old[key].get(field) != new[key].get(field)}
            changes.append({'op': '~', 'kind': key[0], 'id': key[1], 'fields': fields, 'after': new[key]})
    return changes


def touched_tables(changes: list[dict]) -> set[str]:
    tables = set()
    for change in changes:
        parts = change['id'].split('(')[0].split('.')
        if change['kind'] in ('table', 'view') and len(parts) == 2:
            tables.add('.'.join(parts))
        elif change['kind'] in ('column', 'constraint', 'policy', 'trigger') and len(parts) >= 3:
            tables.add('.'.join(parts[:2]))
        elif change['kind'] == 'index' and (table := index_table(change)):
            tables.add(table)
    return tables


def index_table(change: dict) -> str | None:
    definition = (change.get('detail') or {}).get('def') or ''
    match = re.search(r' ON (?:ONLY )?(\S+?)\.(\S+) USING ', definition)
    return f'{match.group(1).strip(chr(34))}.{match.group(2).strip(chr(34))}' if match else None


CLIENT_ROLES = ('anon', 'authenticated')


def client_executable(grants: list[str] | None) -> list[str]:
    """Roles (or PUBLIC) holding EXECUTE. A NULL ACL means PostgreSQL's default: PUBLIC."""
    if grants is None:
        return ['PUBLIC (default ACL)']
    holders = []
    for entry in grants:
        grantee, _, rest = entry.partition('=')
        if 'X' in rest.split('/')[0] and (grantee == '' or grantee in CLIENT_ROLES):
            holders.append(grantee or 'PUBLIC')
    return holders


def risk_findings(changes: list[dict], sizes: dict) -> list[str]:
    """Things a schema-only rehearsal passes but production can still reject or regret."""
    findings = []
    for change in changes:
        kind, op, ident = change['kind'], change['op'], change['id']
        info = change.get('detail') or {key: value['to'] for key, value in (change.get('fields') or {}).items()}
        parts = ident.split('(')[0].split('.')
        table = '.'.join(parts[:2]) if kind in ('column', 'constraint') else index_table(change) if kind == 'index' else None
        rows = (sizes.get(table) or {}).get('rows', 0) if table else 0
        if kind == 'function' and op in ('+', '~'):
            after = change.get('detail') or change.get('after') or {}
            exposure_changed = op == '+' or bool({'grants', 'security_definer'} & set(change.get('fields') or {}))
            definer, grants = after.get('security_definer'), after.get('grants')
            if definer and exposure_changed and (holders := client_executable(grants)):
                findings.append(f'SECURITY: {ident} is SECURITY DEFINER and executable by {", ".join(holders)}. '
                                'Revoke from PUBLIC/anon/authenticated unless clients must call it.')
            elif definer and op == '+' and not (after.get('config') or []):
                findings.append(f'SECURITY: {ident} is SECURITY DEFINER without a fixed search_path.')
        elif kind == 'table' and op == '~' and change['fields'].get('rls', {}).get('to') is False:
            findings.append(f'SECURITY: row level security was DISABLED on {ident}.')
        elif kind == 'column' and op == '+' and info.get('not_null') and info.get('default') is None and rows:
            findings.append(f'DATA: {ident} is NOT NULL without a default; production has ~{rows:,} rows, '
                            'so this fails unless the migration backfills first.')
        elif kind == 'column' and op == '~' and 'type' in (change.get('fields') or {}) and rows:
            findings.append(f'DATA: {ident} changes type; production rewrites/casts ~{rows:,} rows under an '
                            'exclusive lock. The empty local copy cannot prove every value casts.')
        elif kind == 'constraint' and op == '+' and rows and 'NOT VALID' not in (info.get('def') or ''):
            findings.append(f'DATA: {ident} is validated against ~{rows:,} existing production rows, which a '
                            'schema-only rehearsal cannot check. Query prod for violators first, or add NOT VALID.')
        elif kind == 'index' and op == '+' and rows:
            unique = ' UNIQUE' if 'UNIQUE INDEX' in (info.get('def') or '') else ''
            findings.append(f'DATA:{unique} index {ident} builds over ~{rows:,} rows'
                            + (' and fails on existing duplicates' if unique else '')
                            + ('; consider CREATE INDEX CONCURRENTLY (outside a transaction).' if rows > 100_000 else '.'))
    return findings


def ledger_warnings(files: list[Path], recorded: set[str], local_versions: list[str]) -> list[str]:
    warnings = []
    targets = []
    for file in files:
        match = MIGRATION_NAME.match(file.name)
        if not match:
            warnings.append(f'{file.name}: not named <14-digit version>_<snake_name>.sql')
            continue
        version = match.group(1)
        targets.append(version)
        if version in recorded:
            warnings.append(f'{file.name}: already recorded in the production ledger; the snapshot '
                            'already contains its effects, so this run only shows re-apply safety.')
    if targets and recorded:
        latest = max(recorded)
        first_target = min(targets)
        pending = [v for v in local_versions if latest < v < first_target and v not in recorded and v not in targets]
        if pending:
            warnings.append(f'{len(pending)} newer local migration(s) sit before this one but are not in '
                            f'production yet: {", ".join(pending)}. The rehearsal applies only the named files.')
    return warnings


# ---------------------------------------------------------------- local cluster

class LocalCluster:
    def __init__(self, pg_bin: Path, keep: bool):
        self.pg_bin, self.keep = pg_bin, keep
        self.temp = Path(tempfile.mkdtemp(prefix='buildos-rehearsal-', dir='/tmp'))
        self.data, self.socket = self.temp / 'data', self.temp / 'socket'
        self.socket.mkdir()

    def __enter__(self):
        self.run('initdb', '-D', str(self.data), '--no-locale', '--encoding=UTF8',
                 '--auth=trust', '--username=postgres')
        options = (f"-p 5432 -k {self.socket} -c listen_addresses='' -c fsync=off "
                   '-c full_page_writes=off -c synchronous_commit=off -c max_locks_per_transaction=1024')
        self.run('pg_ctl', '-D', str(self.data), '-l', str(self.temp / 'postgres.log'), '-o', options, '-w', 'start')
        return self

    def __exit__(self, *exc):
        subprocess.run([str(self.pg_bin / 'pg_ctl'), '-D', str(self.data), 'stop', '-m', 'fast'],
                       capture_output=True)
        if self.keep:
            print(f'Kept cluster files at {self.temp} (stopped).')
        else:
            shutil.rmtree(self.temp, ignore_errors=True)

    def run(self, binary: str, *args: str, stdin: str | None = None) -> str:
        result = subprocess.run([str(self.pg_bin / binary), *args], input=stdin, text=True, capture_output=True)
        self.last_stderr = result.stderr
        if result.returncode:
            raise RehearsalError(f'{binary} failed:\n{result.stderr.strip()[-2000:]}')
        return result.stdout

    def psql(self, *, sql: str | None = None, file: Path | None = None, quiet: bool = True) -> str:
        args = ['-X', '-v', 'ON_ERROR_STOP=1', '-h', str(self.socket), '-p', '5432', '-U', 'postgres', '-d', 'postgres']
        if quiet:
            args.insert(1, '-qAt')
        if file is not None:
            args += ['-f', str(file)]
        return self.run('psql', *args, stdin=sql)

    def fingerprint(self) -> list[dict]:
        return json.loads(self.psql(sql=FINGERPRINT_SQL).strip() or '[]') or []


# ---------------------------------------------------------------- reporting

def format_value(value: object) -> str:
    text = json.dumps(value, separators=(',', ':')) if not isinstance(value, str) else value
    return text if len(text) <= 120 else text[:117] + '…'


def print_changes(changes: list[dict], sizes: dict) -> None:
    if not changes:
        print('  No schema change (the migration is a no-op against production as it is now).')
        return
    order = ['schema', 'type', 'table', 'column', 'constraint', 'index', 'view', 'function', 'policy', 'trigger']
    for change in sorted(changes, key=lambda c: (order.index(c['kind']) if c['kind'] in order else 99, c['id'])):
        print(f"  {change['op']} {change['kind']:<10} {change['id']}")
        for field, values in (change.get('fields') or {}).items():
            print(f"      {field}: {format_value(values['from'])} → {format_value(values['to'])}")
    tables = sorted(touched_tables(changes))
    if tables:
        print('  Production size of touched tables (DDL on large tables needs a lock_timeout):')
        for table in tables:
            size = sizes.get(table)
            label = 'new table' if size is None else f"{size['rows']:,} rows, {size['bytes'] / 1_048_576:.1f} MiB"
            print(f'    {table}: {label}')


def resolve_pg_bin(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit)
    initdb = shutil.which('initdb')
    if not initdb:
        raise RehearsalError('PostgreSQL binaries not found: brew install postgresql@16 (see README.md)')
    return Path(initdb).resolve().parent


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('migrations', nargs='+', type=Path, help='migration files, applied in the order given')
    parser.add_argument('--check', type=Path, action='append', default=[],
                        help='assertion SQL to run after the migrations (repeatable; fails on any error)')
    parser.add_argument('--project-ref', default=PRODUCTION_REF, help='schema source (default: production)')
    parser.add_argument('--refresh', action='store_true', help='re-snapshot even if the cache is fresh')
    parser.add_argument('--max-age-hours', type=float, default=24.0)
    parser.add_argument('--keep', action='store_true', help='keep the stopped local cluster for inspection')
    parser.add_argument('--pg-bin', help='directory with initdb/pg_ctl/psql/pg_dump (default: from PATH)')
    parser.add_argument('--json', type=Path, help='also write the full report as JSON')
    args = parser.parse_args(argv)

    for path in [*args.migrations, *args.check]:
        if not path.is_file():
            raise RehearsalError(f'No such file: {path}')
    pg_bin = resolve_pg_bin(args.pg_bin)
    schema_path, meta = load_snapshot(args.project_ref, args.refresh, args.max_age_hours, pg_bin)
    source = 'production' if args.project_ref == PRODUCTION_REF else args.project_ref
    print(f"Schema source: {source} ({args.project_ref}), Postgres {meta.get('server_version')}, "
          f"captured {meta['captured_at']} ({meta['age_hours']} h old)")
    local_versions = sorted(m.group(1) for f in MIGRATIONS_DIR.glob('*.sql') if (m := MIGRATION_NAME.match(f.name)))
    for warning in ledger_warnings(args.migrations, set(meta.get('versions') or []), local_versions):
        print(f'⚠︎  {warning}')

    dump = schema_path.read_text()
    report = {'source': args.project_ref, 'captured_at': meta['captured_at'], 'migrations': []}
    with LocalCluster(pg_bin, args.keep) as cluster:
        version = re.search(r'\d+(?:\.\d+)+', cluster.run('postgres', '--version'))
        print(f"Local PostgreSQL {version.group(0) if version else '?'}: loading schema…", flush=True)
        started = time.time()
        cluster.psql(sql=bootstrap_sql(meta.get('roles') or []))
        prepared = cluster.temp / 'schema.sql'
        prepared.write_text(prepare_dump(dump))
        try:
            cluster.psql(file=prepared)
        except RehearsalError as error:
            raise RehearsalError(f'The production snapshot did not load locally (harness gap, not your '
                                 f'migration):\n{error}') from None
        print(f'Loaded in {time.time() - started:.1f} s.')

        before = cluster.fingerprint()
        failed = False
        for migration in args.migrations:
            started = time.time()
            print(f'\n▶ {migration.name}')
            try:
                cluster.psql(file=migration.resolve(), quiet=False)
                notices = [line for line in cluster.last_stderr.splitlines()
                           if re.search(r'\b(NOTICE|WARNING):', line) and 'wal_level' not in line]
            except RehearsalError as error:
                print(f'  ✗ FAILED after {time.time() - started:.2f} s\n' +
                      '\n'.join(f'    {line}' for line in str(error).splitlines()[1:]))
                report['migrations'].append({'file': migration.name, 'ok': False, 'error': str(error)})
                failed = True
                break
            after = cluster.fingerprint()
            changes = diff_fingerprints(before, after)
            print(f'  ✓ applied in {time.time() - started:.2f} s; {len(changes)} schema change(s)')
            for line in notices[:10]:
                print(f'    {line}')
            print_changes(changes, meta.get('tables') or {})
            findings = risk_findings(changes, meta.get('tables') or {})
            for finding in findings:
                print(f'  ⚠︎ {finding}')
            report['migrations'].append({'file': migration.name, 'ok': True, 'changes': changes,
                                         'findings': findings})
            before = after

        for check in [] if failed else args.check:
            try:
                cluster.psql(file=check.resolve())
                print(f'\n✓ check {check.name} passed')
                report.setdefault('checks', []).append({'file': check.name, 'ok': True})
            except RehearsalError as error:
                print(f'\n✗ check {check.name} failed\n{error}')
                report.setdefault('checks', []).append({'file': check.name, 'ok': False, 'error': str(error)})
                failed = True

    if args.json:
        args.json.write_text(json.dumps(report, indent=1))
    findings = [f for m in report['migrations'] for f in m.get('findings', [])]
    if findings:
        security = sum(f.startswith('SECURITY') for f in findings)
        print(f'\n{security} security and {len(findings) - security} data finding(s) above: review before applying.')
    print('\nREHEARSAL FAILED' if failed else '\nREHEARSAL PASSED — nothing was written to any hosted database.')
    return 1 if failed else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except RehearsalError as error:
        print(f'rehearsal error: {error}', file=sys.stderr)
        sys.exit(2)
