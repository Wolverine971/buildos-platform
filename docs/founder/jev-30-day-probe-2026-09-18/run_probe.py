#!/usr/bin/env python3
# docs/founder/jev-30-day-probe-2026-09-18/run_probe.py
"""Ask Jev (typesafe/jev-1.13 via OpenRouter) to rate 30-day actions against DJ's profile.

Dry run by default: builds every request exactly as it would be sent and writes it to
out/. Nothing leaves the machine until --live is passed.

    python3 run_probe.py                                  # dry run, defaults from probe.json
    python3 run_probe.py --review review.json             # dry run with DJ's reviewed choices
    python3 run_probe.py --review review.json --live      # send (3 repeats, $0.25 cap)

review.json is the page's `review/current` db document (settings, profileOff, questionsOff,
actionsOff, edits, custom). Requests set data_collection=deny and disable provider fallbacks.
"""

import argparse
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
from datetime import date, datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
          'September', 'October', 'November', 'December']

# Default ranking weights, applied in code after Jev answers (composite-scoring pattern).
# Probabilities are 0-1; unfair_edge is normalized to 0-1. Negative weights penalize.
WEIGHTS = {
    'millionaire_path': 0.30, 'cash_10k_90d': 0.15, 'recurring_income': 0.10,
    'finishable_30d': 0.10, 'follow_through': 0.10, 'unfair_edge': 0.10,
    'track_record': 0.05, 'cash_1k_30d': 0.10,
    'missing_prereq': -0.10, 'downside_risk': -0.15,
}


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


def resolve(probe, review):
    """Apply DJ's review on top of probe.json defaults. Returns the exact inputs to send."""
    review = review or {}
    settings = {**probe['settings'], **(review.get('settings') or {})}
    profile_off = set(review.get('profileOff') or [])
    questions_off = set(review.get('questionsOff') or [])
    actions_off = set(review.get('actionsOff') or [])
    edits = review.get('edits') or {}

    start = date.fromisoformat(settings['window_start'])
    deadline = f"{MONTHS[start.month - 1]} {start.year + int(settings['horizon_years'])}"
    goal = probe['goal_options'][settings['goal']]

    def fill(text):
        return text.replace('{GOAL}', goal).replace('{DEADLINE}', deadline)

    profile = {s['id']: s['text'] for s in probe['profile'] if s['id'] not in profile_off}
    for sid, text in (review.get('profile_edits') or {}).items():
        if sid in profile:
            profile[sid] = text
    for sid, text in (review.get('profile_add') or {}).items():
        profile[sid] = text
    constraints = {
        'window': f"30 days starting {start.isoformat()}",
        'hours_available_per_week': int(settings['hours_per_week']),
        'money_he_can_risk_usd': int(settings['risk_capital_usd']),
    }
    questions = {}
    for q in probe['questions']:
        if q['id'] in questions_off:
            continue
        body = {'type': q['type'], 'instructions': fill(q['instructions'])}
        if 'criteria' in q:
            body['criteria'] = q['criteria']
        questions[q['id']] = body

    actions = []
    for a in probe['actions'] + list(review.get('custom') or []):
        if a['id'] in actions_off or not (edits.get(a['id']) or a['text']).strip():
            continue
        actions.append({**a, 'text': (edits.get(a['id']) or a['text']).strip()})

    head_to_head = {h['id']: fill(h['instructions']) for h in probe['head_to_head']}
    return settings, goal, deadline, profile, constraints, questions, actions, head_to_head


def build_requests(probe, review):
    settings, goal, deadline, profile, constraints, questions, actions, h2h = resolve(probe, review)
    only = set((review or {}).get('only') or [])
    if only:
        actions = [a for a in actions if a['id'] in only]
    provider = {'allow_fallbacks': False, 'data_collection': 'deny'}
    requests = []
    for a in actions:
        requests.append({'key': f"action:{a['id']}", 'action_id': a['id'], 'body': {
            'model': probe['model'],
            'state': {'profile': profile, 'constraints': constraints, 'action': {'text': a['text']}},
            'questions': questions,
            'provider': provider,
        }})
    candidates = [{'id': a['id'], 'text': a['text']} for a in actions]
    for hid, instructions in h2h.items():
        requests.append({'key': f"h2h:{hid}", 'action_id': None, 'body': {
            'model': probe['model'],
            'state': {'profile': profile, 'constraints': constraints, 'candidate_actions': candidates},
            'questions': {hid: {'type': 'choice', 'instructions': instructions,
                                'criteria': {a['id']: a['text'] for a in actions}}},
            'provider': provider,
        }})
    meta = {'settings': settings, 'goal': goal, 'deadline': deadline,
            'profile_sections': list(profile), 'questions': list(questions),
            'action_count': len(actions)}
    return requests, actions, meta


def est_tokens(body):
    return len(json.dumps(body)) // 4


def post(key, body):
    req = urllib.request.Request(
        'https://openrouter.ai/api/alpha/decisions', data=json.dumps(body).encode(), method='POST',
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json',
                 'HTTP-Referer': 'https://build-os.com', 'X-OpenRouter-Title': 'DJ 30-day probe'})
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read()), time.time() - started
    except urllib.error.HTTPError as exc:
        return exc.code, {'error': exc.read().decode(errors='replace')[:500]}, time.time() - started


def answer_value(answer):
    if not isinstance(answer, dict):
        return None
    if answer.get('type') == 'noul':
        return answer.get('noul')
    if answer.get('type') == 'score':
        n = len(answer.get('probabilities') or {}) or 4
        return answer.get('score') / (n - 1) if answer.get('score') is not None else None
    return None


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


def summarize(results, actions, meta):
    by_action = {a['id']: {} for a in actions}
    h2h = {}
    for r in results:
        answers = ((r.get('response') or {}).get('answers') or {})
        if r['key'].startswith('action:'):
            for qid, ans in answers.items():
                v = answer_value(ans)
                if v is not None:
                    by_action[r['action_id']].setdefault(qid, []).append(v)
        else:
            for qid, ans in answers.items():
                for opt, p in (ans.get('probabilities') or {}).items():
                    h2h.setdefault(qid, {}).setdefault(opt, []).append(p)

    rows = []
    for a in actions:
        vals = by_action[a['id']]
        mean = {q: statistics.fmean(v) for q, v in vals.items() if v}
        spread = max((max(v) - min(v) for v in vals.values() if len(v) > 1), default=0)
        composite = sum(WEIGHTS.get(q, 0) * m for q, m in mean.items())
        rows.append({'id': a['id'], 'cat': a['cat'], 'control': a.get('control'),
                     'twin_of': a.get('twin_of'), 'text': a['text'], 'mean': mean,
                     'max_repeat_spread': round(spread, 3), 'composite': round(composite, 4)})
    rows.sort(key=lambda r: r['composite'], reverse=True)
    h2h_ranked = {q: sorted(((o, statistics.fmean(ps)) for o, ps in opts.items()),
                            key=lambda x: x[1], reverse=True)[:15] for q, opts in h2h.items()}
    return rows, h2h_ranked


def write_markdown(path, rows, h2h, meta, spent, requests_count, repeats):
    cols = meta['questions']
    lines = [f"# 30-day probe results — {datetime.now().date()}", '',
             f"Goal: {meta['goal']} by {meta['deadline']}. {meta['action_count']} actions × "
             f"{len(cols)} questions, {repeats} repeats, {requests_count} requests, ${spent:.4f}.", '',
             'Ranking uses the default weights in run_probe.py; re-weight without re-querying.', '',
             '| # | id | action | composite | ' + ' | '.join(cols) + ' | spread |',
             '|' + '---|' * (len(cols) + 5)]
    for i, r in enumerate(rows, 1):
        tag = f" `{r['control']}`" if r['control'] else ''
        cells = ' | '.join(f"{r['mean'].get(c, float('nan')):.2f}" for c in cols)
        lines.append(f"| {i} | {r['id']}{tag} | {r['text'][:90]} | {r['composite']:.3f} | {cells} | {r['max_repeat_spread']:.2f} |")
    lines += ['', '## Twins (same action, different words)', '']
    index = {r['id']: r for r in rows}
    for r in rows:
        if r['twin_of'] and r['twin_of'] in index:
            o = index[r['twin_of']]
            diffs = {c: abs(r['mean'].get(c, 0) - o['mean'].get(c, 0)) for c in cols}
            worst = max(diffs, key=diffs.get)
            lines.append(f"- {r['id']} vs {o['id']}: largest gap {diffs[worst]:.2f} on `{worst}`")
    for q, ranked in h2h.items():
        lines += ['', f"## Head-to-head: {q}", '']
        lines += [f"- {o}: {p:.3f}" for o, p in ranked]
    path.write_text('\n'.join(lines) + '\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--review', type=Path)
    ap.add_argument('--live', action='store_true')
    ap.add_argument('--repeats', type=int, default=3)
    ap.add_argument('--budget', type=float, default=0.25)
    ap.add_argument('--workers', type=int, default=6)
    ap.add_argument('--only', help='comma-separated action ids (overrides review.only)')
    ap.add_argument('--probe', type=Path, default=HERE / 'probe.json')
    args = ap.parse_args()

    probe = json.loads(args.probe.read_text())
    global WEIGHTS
    WEIGHTS = probe.get('weights', WEIGHTS)
    review = json.loads(args.review.read_text()) if args.review else None
    if args.only:
        review = {**(review or {}), 'only': args.only.split(',')}
    requests, actions, meta = build_requests(probe, review)
    out = args.probe.resolve().parent / 'out'
    out.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')

    tokens = sum(est_tokens(r['body']) for r in requests)
    est_cost = tokens * args.repeats * probe['price_per_million_input_tokens'] / 1e6
    print(f"{meta['action_count']} actions, {len(meta['questions'])} questions each, "
          f"{len(requests)} requests/repeat, ~{tokens:,} input tokens/repeat, "
          f"~${est_cost:.4f} for {args.repeats} repeats (input-only estimate)")

    if not args.live:
        path = out / f"requests-{stamp}.json"
        path.write_text(json.dumps({'meta': meta, 'requests': requests}, indent=2))
        print(f"Dry run. Exact request bodies written to {path.relative_to(REPO)}")
        return

    results, spent = run_live(requests, args.repeats, args.budget, args.workers)
    rows, h2h = summarize(results, actions, meta)
    raw = out / f"results-{stamp}.json"
    raw.write_text(json.dumps({'meta': meta, 'weights': WEIGHTS, 'spent_usd': spent,
                               'rows': rows, 'head_to_head': h2h, 'raw': results}, indent=2))
    md = out / f"summary-{stamp}.md"
    write_markdown(md, rows, h2h, meta, spent, len(results), args.repeats)
    failures = [r for r in results if r.get('status') != 200]
    print(f"Spent ${spent:.4f}. {len(failures)} failed/skipped. Results: {raw.relative_to(REPO)}, {md.relative_to(REPO)}")


if __name__ == '__main__':
    main()
