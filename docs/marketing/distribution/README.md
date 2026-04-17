<!-- docs/marketing/distribution/README.md -->

# BuildOS Distribution Strategy — Work Stream Index

**Single source of truth** for distribution work derived from `buildos-strat.md`. If you're an agent being assigned work, start here.

- **Strategy doc:** [`../../buildos-strat.md`](../../../buildos-strat.md)
- **Ranked task list:** [`../../buildos-strat-tasks.md`](../../../buildos-strat-tasks.md)
- **How this folder works:** [`CONVENTIONS.md`](CONVENTIONS.md)
- **Recurring ops (daily/weekly/monthly):** [`RECURRING.md`](RECURRING.md)

---

## Work Stream Status Dashboard

Status legend: ⚪ not-started · 🟡 ready (unblocked, awaiting pickup) · 🔵 in-progress · ✅ done · ⏸ blocked · 🔁 recurring

| ID | Work Stream | Tasks | Wave | Primary Type | Status | Doc |
|----|-------------|-------|------|--------------|--------|-----|
| WS01 | Public Pages as Distribution Surface | T02, T12, T13, T21, T22, T26, T29, T30, T31 | 1–4 | Code + Content | 🔵 T02 ✅ · T12 🟡 | [WS01](workstreams/WS01-public-pages.md) |
| WS02 | LLM Citation / GEO Foundations | T01, T04, T05, T06, T07, T08, T20, T28 | 1–ongoing | Research + Code | ⚪ | [WS02](workstreams/WS02-llm-citation-geo.md) |
| WS03 | Reddit Creator-Wedge Program | T03, T10, T11, T27 | 1–3 + 🔁 | Research + Ops | 🔵 T03 spec drafted | [WS03](workstreams/WS03-reddit-creator-wedge.md) |
| WS04 | Flagship Content Strategy | T15, T25, T32 | 2 + 🔁 | Writing | ⚪ | [WS04](workstreams/WS04-flagship-content.md) |
| WS05 | Comparison Pages Hub | T16, T17, T24 | 2 | Writing + Code | ⚪ | [WS05](workstreams/WS05-comparison-pages.md) |
| WS06 | Developer & Integration Surface | T09, T18, T19 | 1–2 | Writing + Ops | ⚪ | [WS06](workstreams/WS06-developer-integration.md) |
| WS07 | Site Architecture (how-it-works, changelog) | T14, T23 | 2–3 | Code + Content | ⚪ | [WS07](workstreams/WS07-site-architecture.md) |
| WS08 | Performance Monitoring | T33 | 4 | Code + Ops | ⚪ | [WS08](workstreams/WS08-performance.md) |

---

## Task → Work Stream Quick Map

| Task | Title | Work Stream | Status |
|------|-------|-------------|--------|
| T01 | LLM citation baseline | WS02 | ⚪ |
| T02 | End-user publish UX audit | WS01 | ✅ |
| T03 | Creator-subreddit research | WS03 | 🔵 |
| T04 | Schema markup gap check | WS02 | ⚪ |
| T05 | Domain-level GEO baseline | WS02 | ⚪ |
| T06 | `SoftwareApplication` schema | WS02 | ⚪ |
| T07 | `FAQPage` schema | WS02 | ⚪ |
| T08 | `dateModified` accuracy | WS02 | ⚪ |
| T09 | README overhaul | WS06 | ⚪ |
| T10 | Reddit karma accumulation | WS03 | 🔁 ⚪ |
| T11 | Create r/buildos | WS03 | ⚪ |
| T12 | Public pages Phase 1 UI | WS01 | 🟡 |
| T13 | "Made with BuildOS" attribution | WS01 | ⚪ |
| T14 | `/how-it-works` dedicated route | WS07 | ⚪ |
| T15 | Thinking-environment framework doc | WS04 | ⚪ |
| T16 | Refresh Notion comparison | WS05 | ⚪ |
| T17 | New creator-framed comparisons | WS05 | ⚪ |
| T18 | Integration marketplace inventory | WS06 | ⚪ |
| T19 | Integration marketplace submissions | WS06 | ⚪ |
| T20 | Wikipedia/Wikidata entity | WS02 | ⚪ |
| T21 | Public pages Phase 3 — design | WS01 | ⚪ |
| T22 | Public pages Phase 4 — clone | WS01 | ⚪ |
| T23 | Public changelog | WS07 | ⚪ |
| T24 | `/compare` hub | WS05 | ⚪ |
| T25 | Second quarterly deep piece | WS04 | ⚪ |
| T26 | Seed public projects for gallery | WS01 | ⚪ |
| T27 | Reddit posts begin | WS03 | ⏸ (gated on T10) |
| T28 | Monthly LLM citation remeasure | WS02 | 🔁 ⚪ |
| T29 | Public pages Phase 5 — gallery | WS01 | ⚪ |
| T30 | `/@username` URL migration | WS01 | ⚪ |
| T31 | Public pages Phase 6 — social layer | WS01 | ⏸ |
| T32 | Quarterly piece cadence | WS04 | 🔁 ⚪ |
| T33 | Lighthouse / CWV tooling | WS08 | ⚪ |

---

## Cross-Work Stream Dependencies

The big ones:

- **WS01 → everyone.** Public pages Phase 1 (T12) unlocks Phase 2–6, plus gives WS02 richer JSON-LD surface and WS03 material for Reddit shares.
- **WS02 T01 (baseline) → WS02 T28** and informs WS04 content sharpness (know what LLMs currently say about us before writing).
- **WS03 T03 → WS03 T10 → WS03 T27.** 3-month karma runway is the critical path; start the clock first.
- **WS04 T15 → WS03 T27 (first big Reddit post).** Framework doc becomes the artifact Reddit engagement points back to.
- **WS06 T09 (README) → WS02 citation quality.** Public repo README is a heavily-weighted LLM source; rewriting it compounds every GEO lever.

---

## Ownership & Assignment

- **DJ-personal tasks** (can't delegate): browser-based LLM queries (T01, T28), Reddit karma cadence (T10), r/buildos mod setup (T11), high-stakes brand-voice writing reviews.
- **Agent-delegatable right now:** T04, T05, T09, T15 draft, T16/T17 drafts, T18.
- **Requires code review:** T06, T07, T12, T13, T14, T21, T22, T23, T24, T29, T30, T31, T33.
- **Requires brand-voice review before publishing:** every task tagged `[W]` (content/writing).

See `CONVENTIONS.md` for how to brief an agent on any of these.

---

## Daily / Weekly / Monthly

Recurring ops (Reddit karma, LLM remeasure, changelog updates, etc.) live in [`RECURRING.md`](RECURRING.md). One-shot tasks live in the work streams. If work becomes recurring, move the definition to `RECURRING.md` and leave the one-shot task closed.

---

## Change Log

- **2026-04-17** — Folder created. Strategy reconciled to "thinking environment for creators" positioning. 8 work streams defined. T02 marked complete (spec drafted 2026-04-16). T03 spec drafted and in execution.
