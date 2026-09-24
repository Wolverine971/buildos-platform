#!/usr/bin/env python3
# docs/founder/jev-warm-door-probe-2026-09-18/build_board.py
"""Merge prospect records + Jev results into out/board.html (the call-list board).

    python3 build_board.py                       # latest results file only
    python3 build_board.py out/results-A.json out/results-B.json   # merge; later files win per id
"""
import glob
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
probe = json.loads((HERE / 'probe2.json').read_text())
def _is_prospect_run(path):
    try:
        return 'controls' in json.loads(Path(path).read_text())
    except Exception:
        return False

files = sys.argv[1:] or [f for f in sorted(glob.glob(str(HERE / 'out' / 'results-*.json'))) if _is_prospect_run(f)][-1:]
records = {}
for p in sorted(glob.glob(str(HERE / 'prospects' / '*.json'))):
    for r in json.loads(Path(p).read_text()):
        records[r['id']] = r
rows, meta = {}, {'spent': 0, 'requests': 0, 'controls_ok': 0, 'controls_total': 0, 'sources': []}
for f in files:
    d = json.loads(Path(f).read_text())
    meta['spent'] += d['spent_usd']; meta['requests'] += len(d['raw']); meta['sources'].append(Path(f).name)
    meta['controls_ok'] += sum(1 for c in d['controls'] if c['ok']); meta['controls_total'] += len(d['controls'])
    for r in d['rows']:
        if r['control'] or r['id'] not in records:
            continue
        rows[r['id']] = r
QS = [q for q in probe['questions'] if q['type'] != 'choice']
out = []
for r in sorted(rows.values(), key=lambda x: x['composite'], reverse=True):
    rec = records[r['id']]
    out.append({'id': r['id'], 'name': rec['name'], 'trade': rec['trade'], 'city': rec['city'], 'county': rec.get('county', ''),
                'minutes': rec.get('drive_minutes_from_glen_burnie_est'), 'website': rec.get('website', ''),
                'list': 'vet' if r['id'].startswith('vet') else 'sub', 'composite': r['composite'],
                'v': {q['id']: round(r['mean'].get(q['id'], 0), 2) for q in QS},
                'size': r['top'].get('size_band', 'unknown'), 'angle': r['top'].get('pitch_angle', 'none'),
                'spread': r['max_repeat_spread'],
                'vet': rec.get('veteran_evidence', {}), 'sizes': rec.get('size_signals', {}),
                'inbound': rec.get('inbound_signals', ''), 'pain': rec.get('ops_pain_signals', ''),
                'warm': rec.get('warm_path', ''), 'dm': rec.get('decision_maker', {}), 'notes': rec.get('notes', ''),
                'address_type': rec.get('address_type', 'unknown')})
data = {'meta': meta, 'questions': [{'id': q['id'], 'label': q['label']} for q in QS], 'rows': out,
        'offer': probe['offer']}
blob = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
html = (HERE / 'board.template.html').read_text().replace('__BOARD_JSON__', blob)
(HERE / 'out' / 'board.html').write_text(html)
print(f"wrote out/board.html: {len(out)} prospects from {meta['sources']} ({len(html):,} bytes)")
