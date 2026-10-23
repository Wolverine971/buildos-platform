<!-- tasker/136-kill-switch-cleanup-after-soak.md -->

# 136 — Kill-switch cleanup after the soak

**Status:** READY (after 2026-11-01) · **Priority:** P3 · **Opened:** 2026-10-18 · **Size:** ~1 day  
**Owner:** a Codex agent does the work and self-checks; Claude does a light check after · **Needs from DJ to start:** nothing (but not before 2026-11-01)

Source: the 2026-10-18 code triage, `docs/technical/reviews/CODE_TRIAGE_2026-10-18.md` (the plan and every other tracker). Bugs below were re-checked against commit `9735aa719` on 2026-10-18.

## What users get

About 2.5k lines of off-branches and A/B arms gone. Each switch below was turned on 10-17 or 10-18, and this removes the "off" side once it has been quiet for two weeks.

## Files you own

- apps/worker/src/workers/agentic-chat/host/config.ts, composition-root.ts, bootstrap.ts
- apps/worker/src/workers/agentic-chat/provider/openrouter/reasoning-replay.ts, provider/openrouter-client.ts
- `apps/worker/src/workers/agentic-chat/stream/live-text-preview.ts`
- apps/worker/src/workers/agentic-chat/provider/turn-state.ts (receipt-text switch only)
- apps/worker/src/lib/services/smart-llm-service.ts (incident drain switch only)
- the scripts and tests for the A/B arms

## Before you start

- Don't start before 2026-11-01. Ask DJ whether any of these switches was flipped off since 10-18, and look at `/admin/model-incidents` for hedging or drain problems. If a switch was used, leave it and note why.

## Work, in this order

1. [ ] **Delete the unused branch of each switch, then its variable**
    - `AGENTIC_CHAT_LIVE_TEXT_PREVIEW` and `AGENTIC_CHAT_DIRECT_WRITE_RECEIPT_TEXT`: keep the "on" behavior and delete the non-streaming and closing-pass branches.
    - `AGENTIC_CHAT_PROVIDER_HEDGING`, `AGENTIC_CHAT_CONTEXT_FINDER_BROAD`, `AGENTIC_CHAT_PROVIDER_INCIDENT_DRAIN` and `SMART_LLM_INCIDENT_DRAIN`: keep the "on" behavior.
    - The `off`/`shadow`/`chips` modes of `AGENTIC_CHAT_CONTEXT_FINDER_CHAT` and `AGENTIC_CHAT_CONTEXT_FINDER_GLOBAL`: keep `on`.
    - The `AGENTIC_CHAT_CONTINUATION_REASONING` A/B arms (`replay`, `off_after_reads`), ~2k lines with scripts and tests: DJ already chose to keep `default`.
    - Keep `AGENTIC_CHAT_PROVIDER_INCIDENTS` (privacy switch) and the `off` mode of `AGENTIC_CHAT_JEV_TOOL_SELECTION` (kill switch).
    - List for DJ the Railway variables that are then unread (likely `AGENTIC_CHAT_LIVE_TEXT_PREVIEW`, `AGENTIC_CHAT_DIRECT_WRITE_RECEIPT_TEXT`, `AGENTIC_CHAT_CONTEXT_FINDER_CHAT`, `AGENTIC_CHAT_CONTEXT_FINDER_GLOBAL`), so he can remove them after the deploy.

## Rules

1. Read `AGENTS.md` first, and `apps/web/AGENTS.md` before touching anything under `apps/web`.
2. **Shared checkout.** Other agents are editing other files in this same checkout right now. Edit only the files under "Files you own" plus new test files next to them. Never revert, reformat, stash or check out changes you didn't make: no `git stash`, `git checkout -- <path>`, `git reset` or `git clean`. If a fix truly needs a file outside your list, stop that item and write it under "Blocked".
3. Before fixing each bug, confirm it still happens in the current code (line numbers drift). If it doesn't, mark it `NOT A BUG` or `ALREADY FIXED` with one line of evidence and move on.
4. Test first: write the regression test, run it and watch it fail, then fix and watch it pass. Say in the report that you saw it fail.
5. Narrow checks only; the laptop runs several agents at once. Use the commands under "Checks". Never run root `pnpm test:run`, `pnpm verify` or `pnpm pre-push`, and never pass `--maxWorkers`, `--pool` or `--no-isolate`. If `test-gate` refuses or queues a run, wait at least 60 s and retry once.
6. No paid or live model calls, no production database writes, and no Railway or Vercel changes.
7. Never decide what user or model text means with regex or keyword lists (AGENTS.md, "Never classify language with regex"). Route meaning through a structured channel: a tool argument, a Jev or turn-contract field, a `type_key`, a UI action.
8. Migrations: new file only (never edit an existing one), run `pnpm db:rehearse supabase/migrations/<file>.sql`, and **do not apply**. DJ applies.
9. Don't commit unless DJ asks. If he does, commit only your own files: `git commit -m "..." -- <your paths>`.

## Checks

- `pnpm --filter @buildos/worker exec vitest run` limited to the agentic-chat config, provider, stream and turn-state tests you touched
- `pnpm --filter @buildos/worker run typecheck`
- `pnpm --filter @buildos/worker run typecheck:tests`

## Self-check before you report

- `git status --porcelain`: every file _you_ touched is in "Files you own" or is a new test next to one. Other agents' files will show up there too; leave them alone.
- Re-read your whole diff once as a skeptical reviewer. For each fix, name one more edge case and check it is handled or tested.
- Every regression test failed before its fix and passes now.
- Every command under "Checks" passed. Paste the pass counts.
- No new regex or keyword matching on user or model text. No paid calls. No migration applied.

## Report (reply to DJ with this, and update this file)

1. Each work item: `DONE`, `NOT A BUG`, `ALREADY FIXED`, `SKIPPED (why)` or `BLOCKED (why)`, with one line on what changed.
2. Files changed.
3. Commands run, with pass/fail counts, and confirmation that each regression test failed first.
4. Anything DJ must do: Remove the Railway variables listed in the report.

Then in this file: tick each item, set **Status:** to `DONE — awaiting Claude check`, and add a dated line under "Log".

## Blocked

- (none yet)

## Log

- 2026-10-18: created from the code triage (Claude).
