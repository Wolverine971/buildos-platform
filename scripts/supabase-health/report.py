#!/usr/bin/env python3
# scripts/supabase-health/report.py
"""Render a saved health snapshot; offline and read-only."""
import argparse
from collections import Counter
import gzip
import json
from pathlib import Path
import re


def load(path):
    with (gzip.open(path, 'rt') if path.suffix == '.gz' else path.open()) as f:
        return json.load(f)


def statement_label(query):
    # Parse SQL identifiers only. This is not language/intent classification.
    names = list(dict.fromkeys(re.findall(r'"public"\."([a-zA-Z_][a-zA-Z0-9_]*)"', query)))
    if names:
        verb = next((v for v in ('INSERT INTO', 'DELETE FROM', 'UPDATE') if v in query), 'SELECT/RPC')
        return verb + ' ' + ', '.join(names[:3])
    if 'realtime.list_changes' in query:
        return 'realtime.list_changes'
    return re.sub(r'\s+', ' ', query).strip()[:100].replace('|', '/')


def render(data, n):
    s = data['sections']
    lines = [f'# Supabase health — {data["project_ref"]}', '', f'Collected {data["collected_at"]}. Source: saved read-only snapshot.', '',
        'Times below are PostgreSQL execution times, not HTTP latency or percentiles. Counters cover their own reset windows and can include previous code versions, operator diagnostics, and evicted entries. Do not sum nested and top-level timings if tracking mode changes.', '']
    db = next((r['data'] for r in s.get('overview', []) if r['section']=='database'), {})
    lines += ['```json',json.dumps(db,indent=2),'```','']
    for column,title in [('total_exec_time','total execution time'),('calls','calls'),('max_exec_time','maximum execution time')]:
        lines += [f'## Top {n} by {title}', '', '| Query ID / role OID | SQL shape | Calls | Total s | Mean ms | Max ms | Blocks read | Temp blocks written |', '|---|---|---:|---:|---:|---:|---:|---:|']
        for r in sorted(s.get('statements',[]),key=lambda r:r[column],reverse=True)[:n]:
            lines.append(f'| `{r["queryid"]}` / {r["userid"]} | {statement_label(r["query"])} | {r["calls"]:,} | {r["total_exec_time"]/1000:,.2f} | {r["mean_exec_time"]:,.2f} | {r["max_exec_time"]:,.2f} | {r["shared_blks_read"]:,} | {r["temp_blks_written"]:,} |')
        lines += ['']
    lines += ['## Largest tables (includes indexes and TOAST)', '', '| Table | MiB | Heap | Index | TOAST | Live estimate | Dead estimate | Updates | HOT % | Autovacuums |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    for r in s.get('tables',[])[:25]:
        hot=100*r['n_tup_hot_upd']/r['n_tup_upd'] if r['n_tup_upd'] else 0
        lines.append(f'| {r["schemaname"]}.{r["relname"]} | {r["total_bytes"]/2**20:.2f} | {r["heap_bytes"]/2**20:.2f} | {r["index_bytes"]/2**20:.2f} | {r["toast_bytes"]/2**20:.2f} | {r["n_live_tup"]:,} | {r["n_dead_tup"]:,} | {r["n_tup_upd"]:,} | {hot:.1f} | {r["autovacuum_count"]:,} |')
    lines += ['', '## Largest zero-scan indexes', '', 'Observation only: zero scans do not establish that an index is safe to drop. Constraints, rare operations, reset windows, and FK checks matter.', '', '| Index | Table | MiB | Unique | Constraint-backed |','|---|---|---:|---|---|']
    for r in [r for r in s.get('indexes',[]) if r['idx_scan']==0][:25]:
        lines.append(f'| {r["indexrelname"]} | {r["schemaname"]}.{r["relname"]} | {r["bytes"]/2**20:.2f} | {r["indisunique"]} | {r["constraint_backed"]} |')
    lines += ['', '## Advisor counts', '', '| Kind | Finding | Count |', '|---|---|---:|']
    for kind in ('security','performance'):
        for name,count in Counter(r['name'] for r in s.get('advisors_'+kind,{}).get('lints',[])).most_common():
            lines.append(f'| {kind} | {name} | {count} |')
    if data.get('errors'):
        lines += ['', '## Unavailable sections', '', '```json',json.dumps(data['errors'],indent=2),'```']
    return '\n'.join(lines)+'\n'


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--project-ref',required=True)
    p.add_argument('--snapshot',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--top',type=int,default=20)
    a=p.parse_args();d=load(a.snapshot)
    if d['project_ref']!=a.project_ref:
        p.error('Snapshot project does not match --project-ref')
    if not 1<=a.top<=100:
        p.error('--top must be 1–100')
    a.out.parent.mkdir(parents=True,exist_ok=True)
    a.out.write_text(render(d,a.top))
    print(f'Read-only offline report for {a.project_ref}: {a.out}')


if __name__=='__main__':
    main()
