#!/usr/bin/env python3
# docs/founder/jev-warm-door-probe-2026-09-18/run_probe2.py
"""Warm Door probe: ask Jev evidence questions about real prospects, one prospect per request.

Dry run by default: every request is built exactly as it would be sent and written to out/.
Nothing leaves the machine until --live is passed.

    python3 run_probe2.py                        # dry run over prospects/*.json plus controls
    python3 run_probe2.py --controls-only        # smoke test with the three control records
    python3 run_probe2.py --live                 # send (2 repeats, $0.25 cap, data_collection deny)
    python3 run_probe2.py --only vet-001,vet-007 # subset by prospect id
"""
import argparse
import glob
import json
import os
import re
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
PROVIDER = {'allow_fallbacks': False, 'data_collection': 'deny'}


def load_key():
    for name in ('OPENROUTER_API_KEY', 'PRIVATE_OPENROUTER_API_KEY'):
        if os.getenv(name):
            return os.environ[name]
    for filename in ('apps/worker/.env', 'apps/web/.env', '.env.local', '.env'):
        path = REPO / filename
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            match = re.match(r'(?:export\s+)?(?:PRIVATE_)?OPENROUTER_API_KEY\s*=\s*(.+)', line)
            if match:
                return match.group(1).strip().strip('"\'')
    raise RuntimeError('No OpenRouter key found in env or local .env files')


def load_prospects(paths, only):
    records = []
    for p in paths:
        data = json.loads(Path(p).read_text())
        records.extend(data if isinstance(data, list) else data.get('prospects', []))
    if only:
        records = [r for r in records if r['id'] in only]
    seen = set()
    for r in records:
        if r['id'] in seen:
            raise SystemExit(f"duplicate prospect id {r['id']}")
        seen.add(r['id'])
    return records


def build_requests(probe, prospects, controls_only):
    profile = {s['id']: s['text'] for s in probe['profile']}
    questions = {}
    for q in probe['questions']:
        body = {'type': q['type'], 'instructions': q['instructions']}
        if 'criteria' in q:
            body['criteria'] = q['criteria']
        questions[q['id']] = body
    items = [] if controls_only else [(r, None) for r in prospects]
    items += [(c['prospect'], c) for c in probe['controls']]
    requests = []
    for rec, ctl in items:
        requests.append({
            'key': f"prospect:{rec['id']}", 'prospect_id': rec['id'], 'control': (ctl or {}).get('kind'),
            'body': {'model': probe['model'],
                     'state': {'profile': profile, 'offer': probe['offer'], 'prospect': rec},
                     'questions': questions, 'provider': PROVIDER}})
    return requests, items


def est_tokens(body):
    return len(json.dumps(body)) // 4


def post(key, body):
    req = urllib.request.Request(
        'https://openrouter.ai/api/alpha/decisions', data=json.dumps(body).encode(), method='POST',
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json',
                 'HTTP-Referer': 'https://build-os.com', 'X-OpenRouter-Title': 'DJ warm-door probe'})
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read()), time.time() - started
    except urllib.error.HTTPError as exc:
        return exc.code, {'error': exc.read().decode(errors='replace')[:500]}, time.time() - started


def run_live(requests, repeats, budget, workers):
    key = load_key()
    spent = 0.0
    lock = threading.Lock()
    results = []

    def one(item, rep):
        nonlocal spent
        with lock:
            if spent >= budget:
                return {**item, 'repeat': rep, 'skipped': 'budget'}
        status, body, secs = post(key, item['body'])
        cost = ((body or {}).get('usage') or {}).get('cost') or 0
        with lock:
            spent += cost
        return {**item, 'repeat': rep, 'status': status, 'seconds': round(secs, 3), 'response': body}

    jobs = [(item, rep) for rep in range(repeats) for item in requests]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for i, res in enumerate(pool.map(lambda j: one(*j), jobs), 1):
            results.append(res)
            if i % 25 == 0 or i == len(jobs):
                print(f"  {i}/{len(jobs)} done, ${spent:.4f} spent", file=sys.stderr)
    return results, spent


def answer_value(answer):
    if not isinstance(answer, dict):
        return None
    if answer.get('type') == 'noul':
        return answer.get('noul')
    if answer.get('type') == 'score':
        n = len(answer.get('probabilities') or {}) or 4
        return answer.get('score') / (n - 1) if answer.get('score') is not None else None
    return None


def summarize(results, items, probe):
    scalar, choice = {}, {}
    for r in results:
        answers = ((r.get('response') or {}).get('answers') or {})
        pid = r['prospect_id']
        for qid, ans in answers.items():
            if isinstance(ans, dict) and ans.get('type') == 'choice':
                for opt, p in (ans.get('probabilities') or {}).items():
                    choice.setdefault(pid, {}).setdefault(qid, {}).setdefault(opt, []).append(p)
            else:
                v = answer_value(ans)
                if v is not None:
                    scalar.setdefault(pid, {}).setdefault(qid, []).append(v)

    W, SIZE, DIST = probe['weights'], probe['size_band_value'], probe['distance_factor']
    rows = []
    for rec, ctl in items:
        pid = rec['id']
        mean = {q: statistics.fmean(v) for q, v in scalar.get(pid, {}).items()}
        ch = {q: {o: statistics.fmean(ps) for o, ps in opts.items()} for q, opts in choice.get(pid, {}).items()}
        size = ch.get('size_band', {})
        size_value = sum(SIZE.get(o, 0) * p for o, p in size.items())
        top = {q: max(opts.items(), key=lambda x: x[1]) for q, opts in ch.items() if opts}
        mins = rec.get('drive_minutes_from_glen_burnie_est')
        dist = 1.0
        if isinstance(mins, (int, float)):
            dist = next((f for lim, f in DIST if mins <= lim), DIST[-1][1])
        composite = (sum(W.get(q, 0) * m for q, m in mean.items()) + W.get('size_band', 0) * size_value) * dist
        spread = max((max(v) - min(v) for v in scalar.get(pid, {}).values() if len(v) > 1), default=0)
        rows.append({'id': pid, 'name': rec.get('name'), 'trade': rec.get('trade'), 'city': rec.get('city'),
                     'minutes': mins, 'control': (ctl or {}).get('kind'), 'twin_of': (ctl or {}).get('twin_of'),
                     'mean': mean, 'choice': ch, 'top': {q: t[0] for q, t in top.items()},
                     'distance_factor': dist, 'max_repeat_spread': round(spread, 3),
                     'composite': round(composite, 4)})
    rows.sort(key=lambda r: r['composite'], reverse=True)
    return rows


def check_controls(rows, probe):
    index = {r['id']: r for r in rows}
    report = []
    for c in probe['controls']:
        row = index.get(c['prospect']['id'])
        if not row:
            continue
        if c.get('twin_of') and c['twin_of'] in index:
            other = index[c['twin_of']]
            gaps = {q: abs(row['mean'].get(q, 0) - other['mean'].get(q, 0)) for q in set(row['mean']) | set(other['mean'])}
            worst = max(gaps, key=gaps.get) if gaps else None
            same_choice = all(row['top'].get(q) == other['top'].get(q) for q in set(row['top']) | set(other['top']))
            report.append({'control': c['kind'], 'id': row['id'], 'twin_of': c['twin_of'],
                           'worst_gap': round(gaps.get(worst, 0), 3), 'on': worst, 'choices_match': same_choice,
                           'ok': gaps.get(worst, 0) <= 0.15 and same_choice})
            continue
        for e in c.get('expect', []):
            q, op, x = e['q'], e['op'], e['x']
            if op == 'in':
                got = row['top'].get(q)
                ok = got in x
            else:
                got = row['mean'].get(q)
                ok = got is not None and (got < x if op == '<' else got > x)
            report.append({'control': c['kind'], 'id': row['id'], 'q': q, 'op': op, 'x': x,
                           'got': round(got, 3) if isinstance(got, float) else got, 'ok': ok})
    return report


def write_markdown(path, rows, checks, probe, spent, request_count, repeats):
    cols = [q['id'] for q in probe['questions'] if q['type'] != 'choice']
    lines = [f"# Warm Door probe results — {datetime.now().date()}", '',
             f"{len(rows)} records × {len(probe['questions'])} questions, {repeats} repeats, "
             f"{request_count} requests, ${spent:.4f}.", '',
             'Composite uses the weights in probe2.json; re-weight in code without re-querying.', '',
             '| # | id | name | trade | min | composite | size | angle | ' + ' | '.join(cols) + ' | spread |',
             '|' + '---|' * (len(cols) + 9)]
    for i, r in enumerate(rows, 1):
        tag = f" `{r['control']}`" if r['control'] else ''
        cells = ' | '.join(f"{r['mean'].get(c, float('nan')):.2f}" for c in cols)
        lines.append(f"| {i} | {r['id']}{tag} | {r['name']} | {r['trade']} | {r['minutes']} | {r['composite']:.3f} | "
                     f"{r['top'].get('size_band', '')} | {r['top'].get('pitch_angle', '')} | {cells} | {r['max_repeat_spread']:.2f} |")
    lines += ['', '## Controls', '']
    for c in checks:
        status = 'ok' if c['ok'] else 'MISS'
        if 'twin_of' in c:
            lines.append(f"- {status}: {c['id']} vs {c['twin_of']} — worst gap {c['worst_gap']} on `{c['on']}`, choices match: {c['choices_match']}")
        else:
            lines.append(f"- {status}: {c['id']} `{c['q']}` {c['op']} {c['x']} → got {c['got']}")
    path.write_text('\n'.join(lines) + '\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--prospects', nargs='*', default=None, help='prospect JSON files (default: prospects/*.json)')
    ap.add_argument('--controls-only', action='store_true')
    ap.add_argument('--only', help='comma-separated prospect ids')
    ap.add_argument('--live', action='store_true')
    ap.add_argument('--repeats', type=int, default=2)
    ap.add_argument('--budget', type=float, default=0.25)
    ap.add_argument('--workers', type=int, default=6)
    args = ap.parse_args()

    probe = json.loads((HERE / 'probe2.json').read_text())
    paths = args.prospects if args.prospects is not None else sorted(glob.glob(str(HERE / 'prospects' / '*.json')))
    only = set(args.only.split(',')) if args.only else None
    prospects = [] if args.controls_only else load_prospects(paths, only)
    requests, items = build_requests(probe, prospects, args.controls_only)
    out = HERE / 'out'
    out.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')

    tokens = sum(est_tokens(r['body']) for r in requests)
    est_cost = tokens * args.repeats * probe['price_per_million_input_tokens'] / 1e6
    print(f"{len(items)} records ({len(prospects)} prospects + {len(probe['controls'])} controls), "
          f"{len(probe['questions'])} questions each, ~{tokens:,} input tokens/repeat, "
          f"~${est_cost:.4f} for {args.repeats} repeats (input-only estimate)")

    if not args.live:
        path = out / f"requests-{stamp}.json"
        path.write_text(json.dumps({'requests': requests}, indent=2))
        print(f"Dry run. Exact request bodies written to {path.relative_to(REPO)}")
        return

    results, spent = run_live(requests, args.repeats, args.budget, args.workers)
    rows = summarize(results, items, probe)
    checks = check_controls(rows, probe)
    raw = out / f"results-{stamp}.json"
    raw.write_text(json.dumps({'weights': probe['weights'], 'spent_usd': spent, 'rows': rows,
                               'controls': checks, 'raw': results}, indent=2))
    md = out / f"summary-{stamp}.md"
    write_markdown(md, rows, checks, probe, spent, len(results), args.repeats)
    failures = [r for r in results if r.get('status') != 200]
    misses = [c for c in checks if not c['ok']]
    print(f"Spent ${spent:.4f}. {len(failures)} failed/skipped. {len(misses)} control misses. "
          f"Results: {raw.relative_to(REPO)}, {md.relative_to(REPO)}")


if __name__ == '__main__':
    main()
