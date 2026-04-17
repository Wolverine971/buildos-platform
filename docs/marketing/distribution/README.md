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

| ID   | Work Stream                                 | Tasks                                       | Wave      | Primary Type       | Status                         | Doc                                               |
| ---- | ------------------------------------------- | ------------------------------------------- | --------- | ------------------ | ------------------------------ | ------------------------------------------------- |
| WS01 | Public Pages as Distribution Surface        | T02, T12, T13, T21, T22, T26, T29, T30, T31 | 1–4       | Code + Content     | 🔵 T02 ✅ · T12 🟡             | [WS01](workstreams/WS01-public-pages.md)          |
| WS02 | LLM Citation / GEO Foundations              | T01, T04, T05, T06, T07, T08, T20, T28      | 1–ongoing | Research + Code    | ⚪                             | [WS02](workstreams/WS02-llm-citation-geo.md)      |
| WS03 | Reddit Creator-Wedge Program                | T03, T10, T11, T27                          | 1–3 + 🔁  | Research + Ops     | 🔵 T03 spec drafted            | [WS03](workstreams/WS03-reddit-creator-wedge.md)  |
| WS04 | Flagship Content Strategy                   | T15, T25, T32                               | 2 + 🔁    | Writing            | ⚪                             | [WS04](workstreams/WS04-flagship-content.md)      |
| WS05 | Comparison Pages Hub                        | T16, T17, T24                               | 2         | Writing + Code     | ⚪                             | [WS05](workstreams/WS05-comparison-pages.md)      |
| WS06 | Developer & Integration Surface             | T09, T18, T19                               | 1–2       | Writing + Ops      | ⚪                             | [WS06](workstreams/WS06-developer-integration.md) |
| WS07 | Site Architecture (how-it-works, changelog) | T14, T23                                    | 2–3       | Code + Content     | ⚪                             | [WS07](workstreams/WS07-site-architecture.md)     |
| WS08 | Performance Monitoring                      | T33                                         | 4         | Code + Ops         | ⚪                             | [WS08](workstreams/WS08-performance.md)           |
| WS09 | Anti-Feed Content Cluster                   | T34–T45                                     | 2–3 + 🔁  | Writing + Research | 🔵 T34 ✅ · T35 🟡 · T44 🔁 🔵 | [WS09](workstreams/WS09-anti-feed-cluster.md)     |
| WS10 | Short-Form Video (TikTok, counter-positioned) | T46–T51                                   | 2–4 + 🔁  | Writing + Ops      | 🔵 T46 ⚪ · T47 ⚪ · T49 🔁 ⚪ | [WS10](workstreams/WS10-short-form-video.md)      |

---

## Task → Work Stream Quick Map

| Task | Title                                                    | Work Stream | Status                  |
| ---- | -------------------------------------------------------- | ----------- | ----------------------- |
| T01  | LLM citation baseline                                    | WS02        | ⚪                      |
| T02  | End-user publish UX audit                                | WS01        | ✅                      |
| T03  | Creator-subreddit research                               | WS03        | 🔵                      |
| T04  | Schema markup gap check                                  | WS02        | ⚪                      |
| T05  | Domain-level GEO baseline                                | WS02        | ⚪                      |
| T06  | `SoftwareApplication` schema                             | WS02        | ⚪                      |
| T07  | `FAQPage` schema                                         | WS02        | ⚪                      |
| T08  | `dateModified` accuracy                                  | WS02        | ⚪                      |
| T09  | README overhaul                                          | WS06        | ⚪                      |
| T10  | Reddit karma accumulation                                | WS03        | 🔁 ⚪                   |
| T11  | Create r/buildos                                         | WS03        | ⚪                      |
| T12  | Public pages Phase 1 UI                                  | WS01        | 🟡                      |
| T13  | "Made with BuildOS" attribution                          | WS01        | ⚪                      |
| T14  | `/how-it-works` dedicated route                          | WS07        | ⚪                      |
| T15  | Thinking-environment framework doc                       | WS04        | ⚪                      |
| T16  | Refresh Notion comparison                                | WS05        | ⚪                      |
| T17  | New creator-framed comparisons                           | WS05        | ⚪                      |
| T18  | Integration marketplace inventory                        | WS06        | ⚪                      |
| T19  | Integration marketplace submissions                      | WS06        | ⚪                      |
| T20  | Wikipedia/Wikidata entity                                | WS02        | ⚪                      |
| T21  | Public pages Phase 3 — design                            | WS01        | ⚪                      |
| T22  | Public pages Phase 4 — clone                             | WS01        | ⚪                      |
| T23  | Public changelog                                         | WS07        | ⚪                      |
| T24  | `/compare` hub                                           | WS05        | ⚪                      |
| T25  | Second quarterly deep piece                              | WS04        | ⚪                      |
| T26  | Seed public projects for gallery                         | WS01        | ⚪                      |
| T27  | Reddit posts begin                                       | WS03        | ⏸ (gated on T10)       |
| T28  | Monthly LLM citation remeasure                           | WS02        | 🔁 ⚪                   |
| T29  | Public pages Phase 5 — gallery                           | WS01        | ⚪                      |
| T30  | `/@username` URL migration                               | WS01        | ⚪                      |
| T31  | Public pages Phase 6 — social layer                      | WS01        | ⏸                      |
| T32  | Quarterly piece cadence                                  | WS04        | 🔁 ⚪                   |
| T33  | Lighthouse / CWV tooling                                 | WS08        | ⚪                      |
| T34  | Blog 1 — "Social Media Is Dead…" (interest media)        | WS09        | ✅ 2026-04-17           |
| T35  | Blog 2 — "You Stopped Choosing What You Think About"     | WS09        | 🟡                      |
| T36  | Blog 3 — "What a Thinking Environment Actually Is"       | WS09        | ⚪ (reconcile with T15) |
| T37  | Blog 4 — "Three-Minute Morning That Fixes Your Day"      | WS09        | ⚪                      |
| T38  | Blog 5 — "Productivity Tools Are Feeds in Disguise"      | WS09        | ⚪                      |
| T39  | Blog 6 — "The Quiet Half of the Internet"                | WS09        | ⚪                      |
| T40  | Blog 7 — "AI Will Collapse the Clipping Economy"         | WS09        | ⚪                      |
| T41  | Blog 8 — "Authenticity Is the Only Moat Left"            | WS09        | ⚪                      |
| T42  | Blog 9 — "Three Feelings You Don't Have Words For Yet"   | WS09        | ⚪                      |
| T43  | Blog 10 — "Writing Is Thinking. Scrolling Is Receiving." | WS09        | ⚪                      |
| T44  | Anti-feed 7–10 day publishing cadence                    | WS09        | 🔁 🔵                   |
| T45  | Anti-feed receipts library                               | WS09        | ⚪                      |
| T46  | TikTok account setup                                     | WS10        | ⚪                      |
| T47  | Backfill TikTok scripts for published cluster posts      | WS10        | ⚪                      |
| T48  | TikTok pair per cluster blog (2 scripts × T35–T43)       | WS10        | 🔁 ⚪                   |
| T49  | TikTok posting cadence (7 days post-blog)                | WS10        | 🔁 ⚪                   |
| T50  | Counter-positioning rubric                               | WS10        | ⚪                      |
| T51  | Monthly TikTok qualitative review                        | WS10        | 🔁 ⚪                   |

---

## Cross-Work Stream Dependencies

The big ones:

- **WS01 → everyone.** Public pages Phase 1 (T12) unlocks Phase 2–6, plus gives WS02 richer JSON-LD surface and WS03 material for Reddit shares.
- **WS02 T01 (baseline) → WS02 T28** and informs WS04 content sharpness (know what LLMs currently say about us before writing).
- **WS03 T03 → WS03 T10 → WS03 T27.** 3-month karma runway is the critical path; start the clock first.
- **WS04 T15 → WS03 T27 (first big Reddit post).** Framework doc becomes the artifact Reddit engagement points back to.
- **WS06 T09 (README) → WS02 citation quality.** Public repo README is a heavily-weighted LLM source; rewriting it compounds every GEO lever.
- **WS09 → WS02, WS03, WS04, WS10.** The anti-feed cluster is a vocabulary-ownership loop: each post is a JSON-LD `Article` asset (WS02), produces 5 social extractions + Reddit share material (WS03 post-T10), seeds the T15 flagship (WS04), and triggers a 2-script TikTok pair (WS10). Land T35–T38 before T15 goes public.
- **WS10 → WS09.** Every cluster blog triggers a T48 row. WS10 does not invent content — it extracts and amplifies cluster vocabulary. The dispatcher skill (`.claude/skills/anti-feed/`) generates both lanes from one kit.

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

- **2026-04-19** — WS10 (Short-Form Video, TikTok counter-positioned) added. T46–T51 defined. Extends anti-feed cluster's social extractions from 3 → 5 (added 2 TikTok scripts per blog). New dispatcher skill at `.claude/skills/anti-feed/` handles the full cluster workflow — draft blog, build publish kit, standalone TikTok, capture receipts, show status. Topic map updated with "TikTok angle" column. RECURRING.md adds T49 weekly check + T51 monthly review. Stale `viral-short-form-video-strategy.md` marked superseded.
- **2026-04-18** — WS09 (Anti-Feed Content Cluster) added. Integrates the anti-feed topic map (`docs/marketing/strategy/anti-feed-content-topic-map.md`) into the execution plan as T34–T45. T34 marked complete (`social-media-is-dead-interest-media.md` published 2026-04-17). T44 cadence (7–10 days) started. Boundary with WS04 (Flagship) documented in WS09.
- **2026-04-17** — Folder created. Strategy reconciled to "thinking environment for creators" positioning. 8 work streams defined. T02 marked complete (spec drafted 2026-04-16). T03 spec drafted and in execution.
