<!-- docs/marketing/distribution/workstreams/WS08-performance.md -->

---

id: WS08
title: Performance Monitoring
wave_span: 4
status: not-started
owner: DJ
related_tasks: [T33]
cross_workstreams: [WS02]
last_updated: 2026-04-17

---

# WS08 — Performance Monitoring

> [← Index](../README.md) · [Conventions](../CONVENTIONS.md) · [Strategy §3.2](../../../../buildos-strat.md) · [Task List](../../../../buildos-strat-tasks.md)

## One-line goal

Get table-stakes performance signals (Core Web Vitals, Lighthouse) under continuous measurement so marketing-page regressions don't silently degrade SEO, LLM citation weight, or user trust.

## Why this is a work stream

Strategy §3.2 notes page speed as table-stakes and worth verifying. Currently there's no Lighthouse / CWV tooling configured. This is low-urgency in isolation but gets expensive if ignored: a slow homepage silently compounds loss across every other channel. Worth establishing a baseline and a monthly check.

## Status dashboard

| Task | Title                                | Type  | Wave | Effort | Status | Spec         |
| ---- | ------------------------------------ | ----- | ---- | ------ | ------ | ------------ |
| T33  | Lighthouse / Core Web Vitals tooling | C + O | 4    | 4 h    | ⚪     | inline below |

## Required reading

- [Strategy §3.2](../../../../buildos-strat.md)
- Vercel deployment config: `vercel.json`
- Existing monitoring: none found as of 2026-04-17 audit

## Scope

**In scope:**

- Lighthouse CI configuration for marketing pages
- Core Web Vitals baseline
- Monthly reporting cadence (alongside WS02 T28 remeasure)

**Out of scope:**

- App-side performance monitoring (authenticated app)
- Error tracking / Sentry-style observability (separate infra concern)
- Backend performance (worker, Supabase, queue) — different domain

## Current state

- No Lighthouse config
- No CWV tracking on marketing pages
- Vercel provides baseline analytics but not actively reviewed

## Dependency chain within this work stream

Single task. No internal chain.

## Cross-workstream dependencies

- **WS02 T28:** monthly remeasure day is a natural pairing — do CWV check the same day.

## Output artifacts

| Artifact             | Location                                                    |
| -------------------- | ----------------------------------------------------------- |
| Lighthouse CI config | `.github/workflows/lighthouse.yml` or equivalent            |
| Baseline report      | `docs/marketing/measurement/lighthouse-baseline-2026-04.md` |
| Monthly report       | `docs/marketing/measurement/lighthouse-YYYY-MM.md`          |

## Task briefs

### T33 — Lighthouse / Core Web Vitals tooling ⚪

**Goal:** Establish baseline + monthly check cadence for marketing-page performance.

**Action:**

1. Decide on tooling:
    - Option A: Lighthouse CI GitHub Action on PRs touching marketing pages
    - Option B: Monthly manual Lighthouse run + report
    - Option C: PageSpeed Insights API in a scheduled job
      Recommend: start with Option B (cheapest, manually run during T28 monthly remeasure), graduate to Option A if thresholds regularly get crossed.
2. Capture baseline:
    - Homepage, `/pricing`, `/about`, `/blogs`, `/how-it-works` (once T14 lands), `/compare` (once T24 lands), one blog post, one public page (once T12 lands)
3. Set regression thresholds:
    - LCP ≤ 2.5s (good)
    - CLS ≤ 0.1 (good)
    - INP ≤ 200ms (good)
    - Performance score ≥ 90 for marketing pages
4. Document baseline; schedule monthly re-run.

**Done when:** baseline captured for all named routes; tooling decision documented; first monthly re-run on calendar.

**Assign to:** `compound-engineering:workflows:work` for tooling setup; DJ for tool decision (A vs B vs C).

## Agent assignment notes

- **T33:** low-priority but highly delegatable once the tool decision is made.

## Open questions

1. **Vercel Web Analytics / Speed Insights** — Vercel's built-in tool covers RUM metrics. Might be sufficient without Lighthouse CI. Evaluate as part of T33.
2. **Threshold enforcement.** Should a regression past thresholds block a PR merge? Start as advisory; revisit if regressions accumulate.

## Change log

- **2026-04-17** — Work stream created. Lowest-priority stream; not urgent to begin.
