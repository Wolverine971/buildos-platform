#!/usr/bin/env python3
# docs/founder/jev-30-day-probe-2026-09-18/build_results.py
"""Turn the latest out/results-*.json into out/results-page.html (the published results board)."""
import glob
import json
import statistics as st
from pathlib import Path

HERE = Path(__file__).resolve().parent
probe = json.loads((HERE / 'probe.json').read_text())
src = sorted(glob.glob(str(HERE / 'out' / 'results-*.json')))[-1]
d = json.loads(Path(src).read_text())
R = {r['id']: r for r in d['rows']}
Q = d['meta']['questions']
qmeta = {q['id']: q for q in probe['questions']}
BAD = {'missing_prereq', 'downside_risk'}

# per-question spread across repeats
spread = {}
for r in d['raw']:
    if not r['key'].startswith('action:'):
        continue
    for q, a in r['response']['answers'].items():
        v = a['noul'] if a['type'] == 'noul' else a['score'] / 3
        spread.setdefault(r['action_id'], {}).setdefault(q, []).append(v)

actions = {a['id']: a for a in probe['actions']}
rows = []
for r in d['rows']:
    a = actions.get(r['id'], {})
    rows.append({
        'id': r['id'], 'cat': r['cat'], 'control': r['control'], 'twin_of': r['twin_of'],
        'expect': a.get('expect'), 'text': r['text'],
        'v': {q: round(r['mean'][q], 3) for q in Q},
        's': {q: round(max(vs) - min(vs), 3) for q, vs in spread[r['id']].items()},
    })


def check(i, q, op, x):
    v = R[i]['mean'][q]
    return {'q': q, 'op': op, 'x': x, 'v': round(v, 2), 'ok': v < x if op == '<' else v > x}


anchors = [
    ('x01', [check('x01', 'millionaire_path', '<', .10), check('x01', 'cash_10k_90d', '<', .10)]),
    ('x02', [check('x02', 'downside_risk', '>', .60), check('x02', 'millionaire_path', '<', .10)]),
    ('x03', [check('x03', 'downside_risk', '>', .60), check('x03', 'millionaire_path', '<', .10)]),
    ('x04', [check('x04', 'cash_1k_30d', '>', .70), check('x04', 'recurring_income', '<', .10),
             check('x04', 'millionaire_path', '<', .10)]),
    ('x06', [check('x06', 'cash_1k_30d', '<', round(R['c01']['mean']['cash_1k_30d'], 2))]),
]
twins = []
for t in ('x07', 'x08', 'x09'):
    o = R[t]['twin_of']
    gaps = {q: abs(R[t]['mean'][q] - R[o]['mean'][q]) for q in Q}
    worst = max(gaps, key=gaps.get)
    twins.append({'id': t, 'of': o, 'gap': round(gaps[worst], 2), 'q': worst,
                  'a': round(R[t]['mean'][worst], 2), 'b': round(R[o]['mean'][worst], 2)})

h2h = []
for h in probe['head_to_head']:
    ranked = d['head_to_head'].get(h['id'], [])
    h2h.append({'id': h['id'], 'label': h['label'], 'top': [[o, round(p, 3)] for o, p in ranked[:8]]})

lat = [r['seconds'] for r in d['raw'] if r.get('seconds')]
model = next((r['response'].get('model') for r in d['raw'] if r.get('response')), d['meta'].get('model'))
data = {
    'meta': {**d['meta'], 'spent': round(d['spent_usd'], 4), 'requests': len(d['raw']),
             'failed': sum(1 for r in d['raw'] if r.get('status') != 200), 'model': model,
             'p50': round(st.median(lat), 2), 'source': Path(src).name},
    'questions': [{'id': q, 'label': qmeta[q]['label'], 'kind': qmeta[q]['kind'], 'bad': q in BAD,
                   'type': qmeta[q]['type']} for q in Q],
    'categories': probe['categories'], 'rows': rows, 'anchors': anchors, 'twins': twins, 'h2h': h2h,
    'median_spread': round(st.median(r['max_repeat_spread'] for r in d['rows']), 3),
}
blob = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
html = (HERE / 'results-page.template.html').read_text().replace('__RESULTS_JSON__', blob)
(HERE / 'out' / 'results-page.html').write_text(html)
print(f"wrote out/results-page.html from {Path(src).name} ({len(html):,} bytes)")
