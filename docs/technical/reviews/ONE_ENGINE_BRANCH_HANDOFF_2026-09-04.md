<!-- docs/technical/reviews/ONE_ENGINE_BRANCH_HANDOFF_2026-09-04.md -->
<!-- doc-status: point-in-time -->

# One engine, one loop — branch `one-engine` handoff (September 4, 2026)

Plan: `~/.claude/plans/ethereal-jingling-spark.md` (approved 2026-09-03). Baseline: main at
`e515ae273` (the 09-03 Cedar House fixes deployed as `a1771c1f7`; production retest D 34/52).
Branch: 21 commits, 372 files, +30,434 / −67,233 lines. Rollback tag: `legacy-last-reachable`
(= `f87930443`, the last commit where the legacy web engine is reachable through transport
selection).

## What landed (in commit order)

| Commit    | Stage        | Change                                                                                                         |
| --------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| d3fda3f6a | S0           | Cedar House battery on the worker client (cases 1–9, 13, 14; 0–4 scorecard; `render-scorecard.mjs`)            |
| 0fb1232f7 | S1 / C1      | Table-driven mutation adapter (9 adapter files → rows); project date-only bounds as civil days                 |
| f63ee035a | S7 / C5      | Productivity skill allowlist; marketing preload only on an explicit ask; catalog 24 → 11 rows                  |
| 96721ff16 | fix          | Civil-day wording on every date argument; `calendar_sync: 'none'` required wording; verbatim document storage  |
| 538ab10af | S5 / A6      | Gmail read stack shared (`packages/shared-agent-ops/src/email`)                                                |
| d528c328b | S2 / C2 + B2 | Direct write lane; reviewer only for multi-entity or unresolved targets; 12-pass cap; worker twins             |
| db8509ee4 | S3 / A1–A3   | Read context carries user id + timezone; three calendar reads execute on the worker                            |
| 2fa26dbfa | S4 / A4      | Calendar write services shared; queue hook optional (worker writes Google synchronously)                       |
| 636a1d482 | S8 / B3      | Every e2e entry point drives the worker client; legacy SSE harness client deleted                              |
| 64da22950 | S8 / B5      | Parity machinery deleted (3,345 lines)                                                                         |
| a62e78d92 | S5 / A7      | Five email tools on the worker; `search_email_messages` fenced after private reads                             |
| f87930443 | S4 / A5      | Four calendar writes as table rows, direct to Google, structured `reconnect_required`                          |
| dd1f85840 | S8 / B1      | Worker transport forced for every new turn                                                                     |
| f95a25c8b | C7           | SQL function audit + draft drop migration (`artifacts/…DRAFT…sql`)                                             |
| dc4bc3560 | S7 / C6a     | Repair-instruction export guard; repair-policy coverage 76% → 99%                                              |
| 9ba640d4b | S6 / C3 + A8 | Three surfaces (`global`, `project`, `project_create`); lexical tool selector deleted; conditional email mount |
| 35bbbd3c5 | S8 / B4      | Legacy web engine deleted (90 files, ~40k lines)                                                               |
| 8de42291d | S7 / C6b     | Prompt 15 → 11 sections; project prompt −9.6%, global −12.9%                                                   |
| 57a455623 | fix          | Reviewer evidence titles follow the eleven sections                                                            |
| 588943da9 | S9 / C4      | One `TOOL_OPERATIONS` table; alias table gone; contract validated once                                         |
| 439380dc5 | S8 / B6 + B7 | One execution mode, one lease mode, worker-only contract types; kill epoch = re-admission; admin replay 410    |

Not on the branch by design: B8 (legacy DB drop) and the C7 drop migration — both wait for the
72-hour production bake at zero `legacy_sse` rows.

## Verification on the branch head (439380dc5)

| Package                       | Result                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| apps/web                      | vitest 613 files / 3,665 tests pass; svelte-check 0/0; eslint clean on agentic dirs; `typecheck:tests` at baseline 327 (was 354) |
| apps/worker                   | vitest 1,757 pass / 12 skipped; typecheck clean; lint 0 errors (5 pre-existing warnings)                                         |
| packages/agentic-chat-runtime | 413 tests; typecheck; build                                                                                                      |
| packages/shared-agent-ops     | 348 tests; typecheck; build                                                                                                      |
| packages/shared-types         | 60 tests; typecheck; build                                                                                                       |
| docs                          | `check-doc-health.mjs` unstamped 0                                                                                               |

Restraint canary ("keeps an update chosen from three plausible tasks on the contract route" and
`agenticChatReviewCandidateGate.test.ts`) green at every stage.

## Merge gate — what is NOT done

The live Cedar House battery has not run on this branch. The harness drives a local web dev server,
but turns execute on the hosted Railway worker (there is no queue partition), so the branch's
worker code cannot be exercised live without deploying it. Options:

1. Deploy web + worker together from the branch during a quiet window, run
   `pnpm --filter @buildos/web test:agentic:battery` against `http://127.0.0.1:5173` with
   `PRIVATE_AGENTIC_CHAT_WORKER_URL` pointed at the deployed worker, and treat `legacy-last-reachable`
   as the rollback. Recommended: fastest honest signal, 4 users, rollback is one deploy.
2. Stand up a Railway preview service for the branch and point the local web at it.
3. Run a local worker (`AGENTIC_CHAT_OPENROUTER_MODEL` + `AGENTIC_CHAT_OPENROUTER_FALLBACK_MODELS`
   set) against the hosted queue — it would compete with production for real users' turns; not
   recommended.

Railway env required before deploy (all read lazily; missing values report `not_configured`
instead of crashing): `PRIVATE_GOOGLE_CALENDAR_CLIENT_ID/_SECRET`, `PRIVATE_GOOGLE_CLIENT_ID/_SECRET`,
`PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1` (every version present in `calendar_connections`),
`PRIVATE_GMAIL_READ_CLIENT_ID/_SECRET`, `PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1`, `PUBLIC_APP_URL`,
optionally `PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED` + `_USER_IDS`, `AGENT_CHAT_LIVE_VISION_ENABLED=true`.
Verify token decryption against one real connection first; key drift shows as `reconnect_required`
for everyone.

Post-deploy smoke (from the plan): a daily-brief chat turn; a project turn asking for this week's
calendar; an image-attachment turn; an explicit "delete task X"; a kill-epoch bump yields one
re-admission then a hard error; an email search after a private read is refused; then
`agentic:health` for 72 hours at zero `legacy_sse` rows before B8 and the C7 migration.

## Open forks and follow-ups

- **Product fork:** a bare due-date edit in chat still creates a Google "Due:" event unless the
  model passes `calendar_sync: 'none'` (Cedar House case 4). Option: chat updates default to
  preserve-only (update an existing linked event, never create one).
- Cost: the `global` surface now carries calendar, web and task tools statically; tool-schema
  tokens per turn rose ~16k → ~28k (prompt caching applies; C6b trimmed prose).
- `increment_chat_session_metrics` is `GRANT EXECUTE TO authenticated` with no caller → tasker/76.
- Playwright: continuity forwarding (`lastTurnContext`) twin is `test.skip` (Realtime-only signal).
- Caller-less but kept: `routes/api/agent/v2/stream/cancel` + `cancel-reason-channel.ts`,
  `stream-events.ts` `createLegacySseEventSink`, `search_buildos` executor alias,
  `admin/chat-session-audit-compact.ts` domain parsers (never rendered now), `tool_surface_dynamic`.
- `apps/web/src/lib/tests/agentic-e2e/README.md` still lists a removed scaffold variant id.
- Legacy-only web executors `calendar-executor.ts` / `email-executor.ts` stay: MCP/agent-call and
  project-suggestion actions still use them.
