<!-- tasker/README.md -->

# Tasker — Open Loose Ends

**Audited and cleaned 2026-07-24.** 33 trackers → 15. Nineteen were deleted (done, or superseded by
a system that tracks the same thing better), four Deep Research trackers were consolidated into one,
and the scattered "built but never verified live" residuals were pulled into a single tracker.

Deleted files live in git history. Nothing here is a build log — build state belongs in the feature
docs and in commits. **A tracker earns its place only if it names work that is not yet done.**

## The current read, in five lines

1. **One live user-facing bug is the top item:** the auth funnel still lands on `/dashboard`, so
   returning users never see the `/today` receipt feed the North-Star metric depends on ([27](27-today-migration-ia-consolidation.md) WP-1).
2. **The only unaddressed security cluster is Agentic Chat Wave 3** ([20](20-agentic-chat-wave3-security-brief.md)) — verified unstarted on 7/24: remote `<img>` still renders in assistant messages, the rate limiter is still commented out, the prod prompt-dump escape hatch still exists.
3. **A lot of shipped code has never been exercised by a human** ([38](38-live-verification-debt.md)) — six batched chores, each 30–60 minutes.
4. **Deep Research is parked mid-flight** ([29](29-deep-research-production-track.md)): the money/safety layer is proven but undeployed, and the quality gate failed. Don't run another ad-hoc batch.
5. **Marketing execution now runs off `docs/marketing/ops/queue.json`**, not this folder. What's left here are DJ decisions and outreach, not content cadence.

## Active trackers

### Engineering — real open work

| #                                                   | Tracker                         | State                                                                                                                                                                                                                                              | Next exit condition                                                                                                                                                                  |
| --------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [20](20-agentic-chat-wave3-security-brief.md)       | Agentic Chat Wave 3 + tail      | **Unstarted (verified 7/24).** Waves 1–2 fixed/committed 18 integrity findings. Wave 3 is the security pass and holds the only remaining CRITICALs.                                                                                                | S2 (image exfiltration) alone first — it's self-contained and closes the exfil half. Then S1+S3 together, then Tracks H and I. D4b needs explicit go/no-go.                          |
| [27](27-today-migration-ia-consolidation.md)        | `/today` migration + IA         | WP-0 (readiness-aware `/today`) and WP-2 (landing guard) are **built and committed**. WP-1 and WP-3…WP-8 not started.                                                                                                                              | **WP-1 redirect flip** — 9 files still default to `/dashboard`. Then WP-3/WP-7 (both S). Needs 3 DJ decisions.                                                                       |
| [38](38-live-verification-debt.md)                  | Live verification debt          | Six batches of shipped-but-unwalked code: R1–R8 pentest, calendar smoke + hardcode, Complete Project Audit e2e, onboarding fresh-account branches, rotation check-back, inbox residuals.                                                           | Work the list in one session; record green/red per box.                                                                                                                              |
| [39](39-prompt-instruction-architecture-audit.md)   | Prompt instruction architecture | **Measured, not started.** "How to act" is 20 flat bullets (~1,164 tok); 7 of 20 teach instruction-system navigation. Two rules added at positions 13-14 scored 0/5. **Tool schemas are 56% of payload — bigger than the whole system prompt.**    | Classify all 20 bullets (always-true / situational / on-a-tool / in-a-skill / cut); decide situational emission; trim verdict on the 5 biggest tool schemas.                         |
| [40](40-working-notes-artifacts.md)                 | Working notes / artifacts       | **Design-first, not started.** Durable intermediate memory so agent turns stop losing what they learn. **A task-scoped `scratch_pad` already exists — and is deliberately excluded from agent context in 6 places, so it can never be read back.** | Decide D1-D6 (storage, scope, retrieval budget, write trigger, edit semantics, promotion); then build. Naming: avoid "scratchpad" — it already means "reasoning that must not leak." |
| [29](29-deep-research-production-track.md)          | Deep Research → production      | **Parked since 7/22.** Cost ledger + evidence contracts proven locally; never deployed; reconciliation never enabled; quality gate failed with no defensible architecture winner.                                                                  | Deploy + enable reconciliation → provenance-gate the single/root report → build the corpus/scorer. Not before.                                                                       |
| [32](32-deep-research-chat-tool-and-progress-ui.md) | Deep Research chat + UX         | Not started. Durable Agent Runs can carry the workflow; there is no launch/confirmation/progress/report experience.                                                                                                                                | Blocked behind [29](29-deep-research-production-track.md). Don't build UI for a workflow that can't pass its quality gate.                                                           |
| [34](34-project-review-holistic-synthesis.md)       | Holistic Project Review         | Shaped, not built. The light review pass writes its brief _before_ generating findings, so it cannot synthesize them.                                                                                                                              | Build + evaluate a final evidence-bound cross-family synthesis that preserves child candidates and respects the audit boundary.                                                      |
| [35](35-agentic-chat-gmail-tools.md)                | Agentic chat Gmail tools        | Tier 1 read tools **live in a DJ-only prod pilot** behind a kill switch + exact-user allowlist. Live checks passed; durable traces content-free.                                                                                                   | Seeded malicious-email fixture + explicit ZDR route enforcement before any wider cohort. Harness run needs a 4th mailbox.                                                            |
| [36](36-gmail-project-relevance-phase-a.md)         | Gmail relevance Phase A         | **Actively in progress.** Slices 1–4 applied to prod; routes return 404 with flags off; 2,148 observations processed in the Slice 3 pilot.                                                                                                         | Deploy the web revision with review off, then adjudicate the 300-item sample before source retention expires.                                                                        |
| [37](37-agent-first-orchestration-phase-a.md)       | Agent-first orchestration       | **CLOSED 2026-07-26.** Routing gate recorded instrument-limited (65/72 arithmetically unreachable; 3/13 labels contested). A2 never scored; hypothesis neither corroborated nor falsified. Decision: `PHASE_A_RESULTS.md`.                          | Superseded by [41](41-open-brief-cohort-1.md). No further routing cohorts.                                                                                                           |
| [41](41-open-brief-cohort-1.md)                     | Open-brief cohort 1             | **NOT STARTED — handoff ready.** Three lanes (v2 chat control vs Phase A workflow vs single strong agent) through L0–L2 + feasibility check → DJ blind pass. Corpus needs a 10-min DJ veto packet (3 briefs, 5 labels, Tacemus).                    | Fresh agent starts at `OPEN_BRIEF_COHORT_HANDOFF_2026-07-27.md`. Cohort 1 = distributions + instrument validation, not a Go.                                                          |
| [17](17-skill-refactor-followups.md)                | Skill ontology follow-ups       | Refactor committed and green; routing/gate fixes deployed. The full live suite has never been rerun against the fixed environment.                                                                                                                 | Rerun `docs/testing/SKILL_ONTOLOGY_LIVE_TEST_PROMPTS.md`; fidelity-check 5 skills; DJ rulings. **P3 — nothing is broken.**                                                           |

### Marketing — DJ decisions and outreach

Content cadence is no longer tracked here. `docs/marketing/ops/queue.json` + `pnpm node
scripts/marketing/ops/status.mjs` (or `/marketing`) is the durable source of truth, and it currently
reports 21 overdue items, a dead 88-day blog cadence, and two atom posts ready to ship.

| #                                            | Tracker                    | What's actually left                                                                                                                                                                                                                          |
| -------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [10](10-creator-outreach-swyx-riley.md)      | Creator outreach           | **Simon Willison is send-ready** — all three preconditions met since 7/01; the dossier's `blocked` flag is stale. Riley needs verification then a DM. Swyx is gated on building the Agent Context Layer artifact. Nothing has ever been sent. |
| [12](12-personal-brand-throughline.md)       | Personal-brand throughline | One sentence DJ has to write. The 7/24 account-roles doc locked founder = reach / brand = proof, but the throughline across 9takes, BuildOS, and the cadre is still unwritten.                                                                |
| [18](18-worldbuilding-program.md)            | Worldbuilding              | Four DJ canon decisions (ritual hierarchy, canvas word, naming collision, archetype review), then the world bible one-pager. Plus: thinking-environment spec, anti-feed re-mine, `/moodboard` has still never been run (dir is empty).        |
| [24](24-creator-social-acquisition-pilot.md) | Writer acquisition pilot   | **Needs a DJ ruling — see below.** The 30-day plan is intact and unstarted; its volume conflicts with the 7/24 decision.                                                                                                                      |

## Open decisions blocking work

1. **[27](27-today-migration-ia-consolidation.md):** is `/today` the single authenticated home (dashboard retired) or do they coexist? What happens to `/briefs`? Is the daily brief opt-in or opt-out? _One answer to the first unblocks WP-1, WP-4, WP-5._
2. **[24](24-creator-social-acquisition-pilot.md) vs. the 7/24 strategy shift:** the pilot commits to 40 Writer touches, 4 LinkedIn, 4 Instagram, 8 X, and 3 setup sessions over 30 days. The 7/24 Instagram-growth decision committed to **one weekly atom at 2–3 hrs/week, LinkedIn-primary, Instagram as support** (`docs/marketing/social-media/ACCOUNT_ROLES_AND_WEEKLY_ENGINE_2026-07-24.md`). These are not the same plan. Rescope 24 to the atom cadence, or retire it and let the ops queue carry distribution.
3. **[17](17-skill-refactor-followups.md) §4:** the DRY single-owner rulings. Re-derive the duplicate list first — the skill set has churned since the queue was written.

## Recommended order

1. **[27](27-today-migration-ia-consolidation.md) WP-1** — the redirect flip. Smallest diff with the largest user-visible effect in the folder; the destination (`/today`) is already fixed by WP-0.
2. **[20](20-agentic-chat-wave3-security-brief.md) S2** — one self-contained change that closes the zero-click exfiltration path.
3. **[38](38-live-verification-debt.md)** — one batched session; R1–R8 first, ideally before Wave 3's larger changes so there's a clean baseline.
4. **[20](20-agentic-chat-wave3-security-brief.md) S1 + S3** — the flagship injection→write chain.
5. Distribution: send Simon ([10](10-creator-outreach-swyx-riley.md)), then work the ops queue.
6. Everything else after.

## Notes

- **Not tracked here, don't re-discover it:** the four 7/23 queue/agent-run migrations are applied in production and deployed with green post-deploy smokes; the correlation-ID migration `20260724010000` is applied but **its application changes are still uncommitted**. See `docs/operations/worker/queue-architecture-audit-verification-2026-07-23.md`.
- Three agents are working in this repo concurrently (cruft removal, style unification, agent-first orchestration). The dirty worktree belongs to them — don't "clean it up" from here.
- Previously closed and still closed: `01` HARO, `02` Instagram rollup, `04` loops split, `05` START HERE, `07` MCP hardening, `13` AI Inbox (closed 7/11), `16` (never existed).
