#!/usr/bin/env python3
# scripts/supabase-health/health.py
"""Read-only Supabase diagnostics. Standard library only; no arbitrary SQL CLI."""
import argparse
import base64
import datetime as dt
import gzip
import json
import math
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = Path(__file__).resolve().parent
API = 'https://api.supabase.com'


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def save(path, result):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(redact(result), indent=2) + '\n'
    if path.suffix == '.gz':
        with gzip.open(path, 'wt', encoding='utf-8') as f:
            f.write(payload)
    else:
        path.write_text(payload)


def redact(value):
    """Defense in depth for secrets; collectors never select user content."""
    if isinstance(value, dict):
        return {k: ('[REDACTED]' if re.search(r'password|secret|token|api_key|connection_string', k, re.I)
                    and not k.endswith(('_count', '_bytes')) else redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    if not isinstance(value, str):
        return value
    value = re.sub(r'\b(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sbp_[A-Za-z0-9]+|sb_secret_[A-Za-z0-9_-]+)\b', '[REDACTED]', value)
    value = re.sub(r'(?i)(postgres(?:ql)?://)[^\s]+', r'\1[REDACTED]', value)
    return value


def sql_shape(value):
    # SQL lexical redaction only, never natural-language classification.
    value = re.sub(r'\$([A-Za-z_][A-Za-z_0-9]*|)\$[\s\S]*?\$\1\$', '$$[literal]$$', value)
    value = re.sub(r"'(?:''|[^'])*'", "'[literal]'", value)
    value = re.sub(r'/\*[\s\S]*?\*/|--[^\n]*', '', value)
    return redact(value)


def request(url, headers, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={**headers, 'Content-Type': 'application/json', 'User-Agent': 'buildos-readonly-health/1'})
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            payload = response.read().decode()
            return json.loads(payload) if 'json' in response.headers.get('Content-Type', '') else payload
    except urllib.error.HTTPError as error:
        # Never echo bodies: SQL errors/log APIs can contain source rows or credentials.
        raise RuntimeError(f'HTTP {error.code} from {urllib.parse.urlsplit(url).path}') from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError(f'Network unavailable/timeout: {urllib.parse.urlsplit(url).hostname}') from None


def management(path, body=None):
    token = os.environ.get('SUPABASE_ACCESS_TOKEN') or (Path.home() / '.supabase/access-token').read_text().strip()
    return request(API + path, {'Authorization': 'Bearer ' + token}, body)


def query(ref, sql):
    # Older project API paths accepted read_only but reported transaction_read_only=off.
    # Enforce both API intent and transaction mode; never use a mutation to test this.
    return management(f'/v1/projects/{ref}/database/query', {'query': 'BEGIN READ ONLY;\n' + sql.rstrip().rstrip(';') + ';\nCOMMIT;', 'read_only': True})


def env_values(path):
    result = {}
    for line in Path(path).read_text().splitlines():
        match = re.match(r'^(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$', line.strip())
        if match:
            result[match[1]] = match[2].strip().strip('\"\'')
    return result


def metrics(ref, env_file):
    env = env_values(env_file) if env_file else os.environ
    key = env.get('PRIVATE_SUPABASE_SERVICE_KEY') or env.get('SUPABASE_SERVICE_ROLE_KEY')
    urls = [v for k, v in env.items() if k in ('PUBLIC_SUPABASE_URL', 'SUPABASE_URL', 'PRIVATE_SUPABASE_URL')]
    if not key or not any(urllib.parse.urlsplit(u).hostname == f'{ref}.supabase.co' for u in urls):
        raise ValueError('Metrics require a service key and matching SUPABASE_URL in the selected environment; no key was printed.')
    auth = base64.b64encode(('service_role:' + key).encode()).decode()
    raw = request(f'https://{ref}.supabase.co/customer/v1/privileged/metrics', {'Authorization': 'Basic ' + auth})
    records = []
    for line in raw.splitlines():
        match = re.match(r'^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+([^ ]+)', line)
        if not match:
            continue
        name, labels, val = match.groups()
        if not name.startswith(('node_time_seconds', 'node_memory_', 'node_vmstat_', 'node_cpu_seconds', 'node_disk_', 'node_load', 'node_boot_time', 'pg_stat_database_', 'pg_database_size', 'pg_settings_', 'pg_stat_activity_', 'pg_replication_', 'pg_stat_bgwriter_', 'supabase_', 'realtime_', 'pg_process_')):
            continue
        try:
            val = float(val)
        except ValueError:
            continue
        if math.isfinite(val):
            # Labels are infrastructure identities, never log text or customer content.
            records.append({'name': name, 'labels': dict(re.findall(r'(\w+)="([^"\n]*)"', labels or '')), 'value': val})
    return {'collected_at': now(), 'metrics': records}


def paging_rate(first, last):
    elapsed = (dt.datetime.fromisoformat(last['collected_at']) - dt.datetime.fromisoformat(first['collected_at'])).total_seconds()
    def key(r):
        return r['name'], json.dumps(r['labels'], sort_keys=True)
    left = {key(r): r['value'] for r in first['metrics']}
    right = {key(r): r['value'] for r in last['metrics']}
    source_clocks = [k for k in right if k[0] == 'node_time_seconds' and k in left]
    scrape_elapsed = right[source_clocks[0]] - left[source_clocks[0]] if source_clocks else None
    denominator = scrape_elapsed if scrape_elapsed is not None else elapsed
    boot = [k for k in right if k[0] == 'node_boot_time_seconds']
    restarted = any(left.get(k) != right[k] for k in boot)
    selected = ('node_vmstat_pswpin', 'node_vmstat_pswpout', 'node_vmstat_pgmajfault', 'node_disk_read_bytes_total', 'node_disk_written_bytes_total', 'node_disk_io_time_seconds_total', 'node_cpu_seconds_total')
    rates = []
    for k, val in right.items():
        if k[0] not in selected or k not in left:
            continue
        delta = val - left[k]
        rates.append({'name': k[0], 'labels': json.loads(k[1]), 'delta': None if restarted or delta < 0 else delta, 'per_second': None if restarted or delta < 0 or denominator <= 0 else delta / denominator, 'reset': restarted or delta < 0})
    cpu = [r for r in rates if r['name']=='node_cpu_seconds_total' and r['delta'] is not None and r['labels'].get('mode') not in ('guest','guest_nice')]
    cpu_total = sum(r['delta'] for r in cpu)
    cpu_fractions = {mode: sum(r['delta'] for r in cpu if r['labels'].get('mode')==mode)/cpu_total for mode in {r['labels'].get('mode') for r in cpu}} if cpu_total else {}
    return {'elapsed_seconds': elapsed, 'scrape_elapsed_seconds': scrape_elapsed, 'cached_scrape_uncertainty': scrape_elapsed is None, 'restarted': restarted, 'page_bytes_assumed': 4096, 'minimum_gap_met': elapsed >= 300, 'cpu_time_fractions': cpu_fractions, 'rates': rates}


def collect_sql(ref, name):
    result = query(ref, (HERE / 'sql' / (name + '.sql')).read_text())
    if name == 'statements':
        for row in result:
            row['query'] = sql_shape(row.get('query', ''))
    return result


def log_query(ref, sql, start, end):
    params = urllib.parse.urlencode({'sql': sql, 'iso_timestamp_start': start, 'iso_timestamp_end': end})
    return management(f'/v1/projects/{ref}/analytics/endpoints/logs?{params}')


def log_search(ref, start, end):
    # Server-side projection suppresses user SQL and error detail before transmission.
    sql = """select timestamp, log_attributes['parsed.error_severity'] as severity,
      log_attributes['parsed.sql_state_code'] as sqlstate,
      extract(event_message, '(still waiting for|acquired|canceling statement due to|deadlock detected|temporary file:)') as event_kind,
      extract(event_message, '([0-9.]+) ms') as duration_ms,
      extract(event_message, 'relation ([0-9]+)') as relation_oid
      from logs where source='postgres_logs'
      and match(event_message, 'still waiting for|acquired .* after|canceling statement due to|deadlock detected|temporary file:')
      order by timestamp desc limit 500"""
    return log_query(ref, sql, start, end)


def api_latency(ref, start, end):
    # The logs API caps responses at 1000 rows, even when SQL requests more.
    # Separate marginal aggregations avoid truncating 24 hours x many paths.
    fields = """count() as requests,
      countIf(toUInt32OrZero(log_attributes['response.status_code'])>=500) as errors_5xx,
      countIf(toUInt32OrZero(log_attributes['response.status_code'])>=400) as errors_4xx_5xx,
      countIf(log_attributes['response.origin_time']!='') as timing_samples,
      quantileExact(0.5)(toFloat64OrZero(log_attributes['response.origin_time'])) as p50_ms,
      quantileExact(0.95)(toFloat64OrZero(log_attributes['response.origin_time'])) as p95_ms,
      quantileExact(0.99)(toFloat64OrZero(log_attributes['response.origin_time'])) as p99_ms,
      max(toFloat64OrZero(log_attributes['response.origin_time'])) as max_ms
      from logs where source='edge_logs' and startsWith(log_attributes['request.path'],'/rest/v1/')
      """
    result = {'start': start, 'end': end}
    for key, dimension in [('by_path', "log_attributes['request.path']"), ('by_hour', 'toStartOfHour(timestamp)')]:
        sql = 'select ' + dimension + ' as dimension, ' + fields + ' group by dimension order by dimension limit 1000'
        rows = log_query(ref, sql, start, end)
        if len(rows.get('result', [])) >= 1000:
            raise ValueError('Logs response reached the 1000-row cap; choose a narrower window')
        result[key] = rows
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['snapshot', 'metrics', 'sample', 'statements', 'tables', 'advisors', 'logs', 'latency', 'inventory', 'workload'])
    p.add_argument('--project-ref', required=True)
    p.add_argument('--env-file', help='Metrics key source; never printed or copied')
    p.add_argument('--parent-ref', help='Parent project for branch metadata')
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--seconds', type=int, default=300)
    p.add_argument('--start')
    p.add_argument('--end')
    a = p.parse_args()
    if not re.fullmatch('[a-z]{20}', a.project_ref) or (a.parent_ref and not re.fullmatch('[a-z]{20}', a.parent_ref)):
        p.error('A project ref must be 20 lowercase letters')
    if a.command == 'sample' and a.seconds < 300:
        p.error('Sample at least 300 seconds apart to avoid cached metrics')
    if a.command in ('logs', 'latency') and not (a.start and a.end):
        p.error('Logs/latency require explicit --start and --end ISO timestamps')
    if bool(a.start) != bool(a.end):
        p.error('Provide both --start and --end')
    if a.start and a.end:
        try:
            start = dt.datetime.fromisoformat(a.start.replace('Z', '+00:00'))
            end = dt.datetime.fromisoformat(a.end.replace('Z', '+00:00'))
            if not a.start.endswith('Z') or not a.end.endswith('Z') or not 0 < (end-start).total_seconds() <= 86400:
                raise ValueError()
        except ValueError:
            p.error('Log window must use UTC ISO timestamps ending in Z and span 0–24 hours')
    print(f'Read-only {a.command}: project {a.project_ref}', flush=True)
    result = {'project_ref': a.project_ref, 'collected_at': now(), 'read_only': True, 'sections': {}, 'errors': {}}
    def run(name, fn):
        try:
            result['sections'][name] = fn()
            print(f'  {name}: collected', flush=True)
        except Exception as error:
            # Error class/message excludes response bodies and env values.
            result['errors'][name] = str(error) if isinstance(error, (RuntimeError, ValueError)) else type(error).__name__
            print(f'  {name}: unavailable ({result["errors"][name]})', flush=True)
    if a.command in ('snapshot', 'metrics', 'sample'):
        run('metrics', lambda: metrics(a.project_ref, a.env_file))
    if a.command in ('snapshot', 'statements'):
        run('statements', lambda: collect_sql(a.project_ref, 'statements'))
    if a.command in ('snapshot', 'tables'):
        for name in ('overview', 'tables', 'indexes', 'functions'):
            run(name, lambda name=name: collect_sql(a.project_ref, name))
    if a.command in ('snapshot', 'inventory'):
        run('inventory', lambda: collect_sql(a.project_ref, 'inventory'))
    if a.command == 'workload':
        run('workload', lambda: collect_sql(a.project_ref, 'workload'))
    if a.command in ('snapshot', 'advisors'):
        for kind in ('performance', 'security'):
            run('advisors_' + kind, lambda kind=kind: management(f'/v1/projects/{a.project_ref}/advisors/{kind}'))
    if a.command == 'snapshot':
        run('addons', lambda: management(f'/v1/projects/{a.project_ref}/billing/addons'))
        run('branches', lambda: management(f'/v1/projects/{a.parent_ref or a.project_ref}/branches'))
    if a.command in ('snapshot', 'logs') and a.start and a.end:
        run('logs', lambda: log_search(a.project_ref, a.start, a.end))
    if a.command in ('snapshot', 'latency') and a.start and a.end:
        run('api_latency', lambda: api_latency(a.project_ref, a.start, a.end))
    if a.command == 'sample' and 'metrics' in result['sections']:
        # Sleeping locally does not open a database connection or produce load.
        save(a.out, result)
        time.sleep(a.seconds)
        run('metrics_end', lambda: metrics(a.project_ref, a.env_file))
        if 'metrics_end' in result['sections']:
            result['sections']['paging_rate'] = paging_rate(result['sections']['metrics'], result['sections']['metrics_end'])
    save(a.out, result)
    print(f'Saved {a.out}; {len(result["errors"])} unavailable section(s)', flush=True)
    return 1 if result['errors'] else 0


if __name__ == '__main__':
    sys.exit(main())
