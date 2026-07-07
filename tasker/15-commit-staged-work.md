<!-- tasker/15-commit-staged-work.md -->

# 15 — Commit the standing worktree (wave 2)

**Priority:** P1 — cheap, removes risk; and CI now exists but can't gate uncommitted work
**Type:** Engineering (housekeeping)
**Source:** `git status` as of 2026-07-02

## ✅ Wave 1 (the 2026-07-01 list) — COMMITTED & PUSHED

All four original bundles landed on 7/01: skill ontology refactor (`2655b199`), burst hardening + onto-route provenance (`2655b199`), /ideate + /moodboard commands (`2655b199`), MCP self-audit + second-audit fixes (`69943e9a`), T35 quality edits + CI + PostHog + agentic-chat W1 fixes (`734b291a`). Root `test.md` deleted. `main` == `origin/main`.

## Wave 2 — the NEW uncommitted set (~163 files)

1. **Dead-code sweep** (~2,700 LOC, 55 deletions, per `WORKER_FLOW_AUDIT_2026-07-01.md` §5): homework + tree-agent surfaces (web routes/components/stores + worker engines), legacy email chain (email-sender/service, gmail-transporter, emailWorker, templates), legacy llm-pool, old scripts/planning docs. Plus `queue-types.ts` retired-enum tolerance and `consumption-billing.ts` prefix cleanup.
2. **Worker loop hardening**: `projectLoopWorker.ts` atomic claim + heartbeat, `enqueue.ts` per-day dedup key, `projectLoops.ts` flag resolver, `supabaseQueue.ts` `getRegisteredJobTypes()`. New stall-reclaim test (7 tests). **Worker suite 265/265 green.**
3. **Docs/trackers**: `tasker/` (staged), audit docs (`WORKER_FLOW_AUDIT`, `AGENTIC_CHAT_BACKEND_AUDIT` + `_DEEP`), the big staged marketing/docs tranche (target-influencer dossiers incl. simon-willison.md, visual-assets renders, brainstorms, smoke-test checklists, strategy docs), root skill-refactor handoffs, CLAUDE.md updates.

## Next action

1. Commit wave 2 as ~3 commits (dead-code sweep / worker loop hardening / docs+trackers). Run `pnpm typecheck` + web tests first — worker is green, web not re-verified after the deletion sweep (web-side homework/tree-agent routes were deleted too).
2. Confirm no live producers still enqueue `buildos_homework`/`buildos_tree_agent` and drain/clean any old DB rows (the types now only tolerate them via an index signature).
3. Still pending from wave 1: **`/moodboard` has never been run** (empty `docs/marketing/visual-assets/moodboards/`) — first real run validates it.

## Done when

`git status` clean, CI green on the pushed commits, retired job types confirmed drained, `/moodboard` exercised once.
