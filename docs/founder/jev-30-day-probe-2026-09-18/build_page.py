#!/usr/bin/env python3
# docs/founder/jev-30-day-probe-2026-09-18/build_page.py
"""Inject probe.json into the review page template -> out/review-page.html (the published artifact)."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
probe = json.loads((HERE / 'probe.json').read_text())
data = json.dumps(probe, ensure_ascii=False).replace('</', '<\\/')
html = (HERE / 'review-page.template.html').read_text().replace('__PROBE_JSON__', data)
(HERE / 'out').mkdir(exist_ok=True)
(HERE / 'out' / 'review-page.html').write_text(html)
print(f"wrote out/review-page.html ({len(html):,} bytes)")
