<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_6_RAILWAY_SERVICE_REVIEW_REPORT_2026-08-20.md -->

# Agentic Chat Worker Phase 6 — independent Railway service review report

**Reviewed:** 2026-08-20 22:25–22:55 UTC. Read-only until 22:44Z; the operator then approved the live canary and the fixes in §6.
**Handoff reviewed:** [`AGENTIC_CHAT_WORKER_PHASE_6_RAILWAY_SERVICE_REVIEW_HANDOFF_2026-08-20.md`](./AGENTIC_CHAT_WORKER_PHASE_6_RAILWAY_SERVICE_REVIEW_HANDOFF_2026-08-20.md)
**Source revision verified:** local `main` = `origin/main` = GitHub `main` = `49dcd5a2b`

## 1. Scorecard (handoff §13)

| Area                         | Result                                        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub source and config     | **pass**                                      | `49dcd5a2b` touches only `railway.chat.toml` (+28). `768c12d8e` = 15 files / 891 lines, all chat-scoped.                                                                                                                                                                                                                                                                                                                                                                                             |
| Railway source/config path   | **pass**                                      | Dedicated: `/railway.chat.toml`, `node apps/worker/dist/chat-worker.js`, `/health` timeout 300, 1 replica, overlap 0 / drain 30, `ON_FAILURE` ×3, `SUCCESS` at `49dcd5a2b`, watch patterns match file. Legacy: `/railway.toml`, `dist/index.js`, `SUCCESS` at `49dcd5a2b`. Deployment history shows the one bad `/railway.toml` + `dist/index.js` deploy (`ddcc9074`, 20:15Z) is `REMOVED`.                                                                                                          |
| Dedicated process isolation  | **pass**                                      | Built `dist/` and walked the transitive `require` closure of `chat-worker.js`: 70 files, **no** `index.js`/`worker.js`/`scheduler.js`; only `workers/agentic-chat/*` plus one `workers/agent-run/webResearchPort.js` (pulled by `phase3Assembly`). Runtime log: only `Registered processor for agentic_chat_turn`, no scheduler/cron start.                                                                                                                                                          |
| Legacy ownership disabled    | **pass**                                      | Legacy `/health`: `agenticChat.enabled=false`, `state=disabled`, `runtime=null`. Railway env `AGENTIC_CHAT_WORKER_ENABLED=false`.                                                                                                                                                                                                                                                                                                                                                                    |
| Railway environment contract | **pass**                                      | All 20 non-secret values in handoff §6 match exactly (incl. both mutation capability lists = empty string). `AGENTIC_CHAT_INTERNAL_USER_IDS` = exactly `255735ad-…1435`. All 4 credentials present.                                                                                                                                                                                                                                                                                                  |
| Vercel environment/routing   | **pass**                                      | `ROUTING_ENABLED=true`, `ROUTING_USER_IDS` = exactly `255735ad-…1435`, `PRIVATE_AGENTIC_CHAT_WORKER_URL` = dedicated host, `PUBLIC_RAILWAY_WORKER_URL` = legacy host (not swapped), `KILL_EPOCH=0`. Shared secrets compared by SHA-256 prefix: `PRIVATE_RAILWAY_WORKER_TOKEN`, `PRIVATE_SUPABASE_SERVICE_KEY`, `PUBLIC_SUPABASE_URL`, `PRIVATE_OPENROUTER_API_KEY` are byte-identical across Vercel / dedicated / legacy. Current prod deployment `dpl_AgSAG1…` created 21:39Z, after the env edits. |
| Authenticated capacity       | **pass**                                      | Unauthenticated → `401 {"error":"Unauthorized"}`. Authenticated via `railway run`: 5/5 `200` in 237–286 ms, queue age 0, provider available, publisher healthy, pending 0, evidence age ≤130 ms.                                                                                                                                                                                                                                                                                                     |
| Health/recovery/drain        | **pass**                                      | Dedicated `/health` healthy, release `49dcd5a2b`, runtime running, 0 active turns, recovery 0 candidates / 0 attention, Realtime idle, event-loop p99 21 ms. Prior deployment log shows clean `SIGTERM received; draining… → Queue processor stopped → Stopping Container`.                                                                                                                                                                                                                          |
| Database convergence         | **pass**                                      | 0 non-terminal `chat_turn_runs` (any mode); 0 `agentic_chat_turn` queue jobs pending/processing; canary 1 terminal `legacy_sse/completed`; canary 2 terminal `worker_realtime/failed/internal_cohort_rejected`, `execution_started_at` null.                                                                                                                                                                                                                                                         |
| Post-fix live worker turn    | **pass** (22:44:52Z, after operator approval) | Turn `b560408a` completed end-to-end on the dedicated service; full receipt in §5. The earlier post-fix chats had been routed `legacy_sse` by the client before negotiation (finding F1, fixed in §6).                                                                                                                                                                                                                                                                                               |
| Rollback readiness           | **pass**                                      | Web-first flag `AGENTIC_CHAT_WORKER_ROUTING_ENABLED` present in Production; `KILL_EPOCH=0`; `selectAgenticChatWorkerUrl` keeps the general-worker fallback; legacy SSE path untouched by Phase 6.                                                                                                                                                                                                                                                                                                    |

Focused tests: worker `chatWorkerService` (4), `agenticChatConsumer` (20), `agenticChatPhase3Bootstrap` (6), `agenticChatPhase3Assembly` (17) and web `worker-turn-capacity` (15) — **62/62 pass**.

## 2. Confirmed findings

### F1 — Post-fix chats never negotiated worker transport (client-side precondition)

DB shows the real sequence today (UTC, all user `255735ad`):

| Time     | Turn       | Context                                            | Mode            | Outcome                                                | Session→turn gap |
| -------- | ---------- | -------------------------------------------------- | --------------- | ------------------------------------------------------ | ---------------- |
| 21:32:39 | `d1acd45d` | global                                             | legacy_sse      | completed                                              | 363 ms           |
| 21:57:18 | `157c9f19` | global                                             | worker_realtime | failed `internal_cohort_rejected`                      | 3.4 s            |
| 21:58:38 | `5ab68b82` | global                                             | worker_realtime | failed `internal_cohort_rejected` (**not in handoff**) | 3.3 s            |
| 21:58:56 | `4b8b4c66` | global                                             | legacy_sse      | completed                                              | 320 ms           |
| 22:03:43 | —          | Railway deployment `4a98a334` (cohort fix) healthy |                 |                                                        |                  |
| 22:06:07 | `563e6208` | project_create                                     | legacy_sse      | completed (255 s)                                      | 216 ms           |
| 22:08:57 | `62ac809a` | project                                            | legacy_sse      | completed (73 s)                                       | 372 ms           |

Dedicated-service HTTP logs for deployment `4a98a334` contain **zero** `/agentic-chat/capacity` requests between 22:04:58 and 22:13:38 — so at 22:06 and 22:08 Vercel never asked for capacity. The ~300 ms session→turn gap on every legacy turn (vs ~3.4 s on worker turns) shows the legacy stream created the session itself, i.e. the client never pre-created one.

Cause (`apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts:543-600`):

```
canUseStreamCreatedSession = senderType === 'user' && Boolean(matchingPreparedPrompt)
→ if (!sessionForTurn?.id && !canUseStreamCreatedSession) ensureSessionReady(...)
canAttemptWorkerTextCanary = user && sessionForTurn?.id && no attachments && no voice && adoptWorkerAdmissionResponse
```

`AgentChatModal` never pre-creates a session for a new chat (`currentSession` is only set from stream/session events). So on a **first message in a new chat**, if the prewarm's prepared prompt is fresh within the 250 ms send wait, the client skips `ensureSessionReady`, `sessionForTurn` stays null, and the worker path is bypassed **before** `/api/agent/v2/transport` is even called. The worker path is only reached when the prewarm loses the race (which is what happened on the two canaries — DJ sent fast) or on follow-up messages in an existing session.

The external-account regex gate (`needsLegacyExternalAccountTools`) did **not** fire on any of the six turns (tested against stored messages, booleans only).

Consequence: the one-user canary is a coin flip on first messages. The handoff's instruction "use a new chat/session" for the post-fix canary is the configuration most likely to bypass the worker. This is not an environment-variable problem.

### F2 — Handoff chronology undercounts failures

Two worker turns failed `internal_cohort_rejected` pre-fix (21:57:18 and 21:58:38), not one. Both are terminal; both queue jobs `failed`, `attempts=0`. No action needed beyond correcting the record.

## 3. Recommendations (not defects)

- **R1 — Deterministic post-fix canary.** Send the canary as the _second_ message in an existing session (or send the first message immediately on opening, before prewarm lands). Success receipt per handoff §10-F. Explicit approval still required.
- **R2 — Close the routing gap (product decision).** Options: (a) lean — when a turn is worker-eligible (text-only, user sender), always `ensureSessionReady` before negotiating, accepting one extra ~200 ms round-trip on first messages for all users; (b) ambitious — have the prewarm/prepared-prompt response carry a server-computed `workerTransportCandidate` flag so only cohort users pay the round-trip. Either way the prepared prompt still applies (the session+prepared-prompt combination is already exercised on the prewarm-miss path).
- **R3 — Silence misleading startup lines.** `config/queueConfig.ts` logs the general-queue/retention-cron config at import time; the chat worker imports it via `lib/supabaseQueue.js` and `lib/progressTracker.js`. A reviewer reading "Retention cron: 30 3 \* \* \*" on the dedicated service could trip the stop-the-line rule. Guard the log behind the entrypoint or a flag.
- **R4 — Legacy env hygiene.** `daily-brief-worker` still carries `AGENTIC_CHAT_INTERNAL_USER_IDS=76c04859-…` (an `@example.com` test account) and the old `AGENTIC_CHAT_OPENROUTER_MODEL` / mutation-capability vars. Harmless while disabled; clear them so a future `ENABLED=true` can't silently resurrect a second owner.
- **R5 — `AGENTIC_CHAT_TRANSPORT_LEASE_SECRET`.** `vercel env ls` lists it (Production, 17 d old) but `vercel env pull` omits it — consistent with a Vercel _sensitive_ variable, which the CLI cannot read back. Runtime proof exists (both worker canaries were issued valid leases by the current deployment). No action; document it as sensitive.
- **R6 — Local Vercel link.** `apps/web/.vercel/project.json` links to project `web` (`prj_B0OaQ2…`), not `build-os`; only the repo-root link is correct. Running `vercel env` from `apps/web` silently targets the wrong project.
- **R7 — The one `503`.** The 22:13:38Z `503` (9 ms) was a `railway run` probe after ~9 min idle and was followed by `200`s; my probes after 12 min idle returned `200` first time. Collector fails closed in <10 ms when any in-memory snapshot is invalid; no persistence observed. Watch, don't act.

## 5. Post-fix canary receipt (operator-approved, 22:44Z)

Sent from the verified account as the **second** message of a fresh General Chat session
(warm-up turn `b9d8b6fb` → `legacy_sse`, as expected pre-fix; canary turn second).

| Receipt (handoff §10-F)                           | Evidence                                                                                                                                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Transport selects worker                       | `POST /api/agent/v2/transport` → 200; DB row: `execution_mode=worker_realtime`, `transport_contract_version=agentic_chat_worker_v1`                                                                                                          |
| 2. Capacity checks `200`                          | Railway HTTP log: `22:44:51.104 GET /agentic-chat/capacity 200 103ms`, `22:44:51.531 … 200 85ms`                                                                                                                                             |
| 3. Durable turn stores mode/contract/decision/job | turn `b560408a-9cc0-4c0e-b742-17edbd40be3b`, session `ad176fd4-d49f-4de6-b6b8-dd3d1fda8507`, decision `60af6bf7-76be-4602-b809-9114112e1295`, job `4bcdf146-ac07-4182-a8ab-c7018db2d52e`, correlation `f1b1415a-5ba2-4528-b1fa-c814c0647d40` |
| 4. Dedicated service claims                       | runtime log `Claimed 1 job(s)` / `Processing agentic_chat_turn job …` on deployment `4a98a334`                                                                                                                                               |
| 5. Timestamps populated                           | `worker_started_at 22:44:53.459Z`, `execution_started_at 22:44:53.898Z`, `finished_at = terminalized_at 22:45:06.476Z`; timing: queue wait 1120 ms, total 14 146 ms                                                                          |
| 6. Completes without failure                      | `status=completed`, `failure_code=null`, `finished_reason=stop`, `answer_source=model`, 2 tool calls (`declare_read_only_turn`, `approve_read_only_turn_review`); queue job `completed`, `attempts=0`                                        |
| 7. Browser receives durable reply                 | rendered in the modal at 6:44 PM; `assistant_message_id 6059d149-…`                                                                                                                                                                          |
| 8. Health returns clean                           | 0 active turns, queue healthy/not processing, recovery 0 candidates, Realtime `connected`                                                                                                                                                    |
| 9. Legacy stays disabled                          | `daily-brief-worker` `/health` `agenticChat.state=disabled` before and after                                                                                                                                                                 |

## 6. Fixes applied (same day)

| Item                  | Change                                                                                                                                                                                                                                                                                                                                                                                             | Verification                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| F1 lean routing fix   | `agent-chat-stream-controller.svelte.ts`: text-only user turns with worker adoption available always `ensureSessionReady` before negotiation (`workerTransportCandidate`); a prewarm hit no longer bypasses the worker. If that bootstrap fails and a prepared prompt exists, the turn still falls back to sessionless legacy. Cost: one extra session round-trip on first messages for all users. | 2 new regression tests; controller suite 34/34; `svelte-check` 0 errors     |
| R3 startup-log noise  | `queueConfig.ts` no longer logs at import; new `logQueueConfiguration()` is called only from the general entrypoint `index.ts`.                                                                                                                                                                                                                                                                    | worker typecheck clean; worker suite 1086/1086; lint + http-module guard OK |
| R4 legacy env hygiene | `daily-brief-worker`: `AGENTIC_CHAT_INTERNAL_USER_IDS` and `AGENTIC_CHAT_OPENROUTER_MODEL` blanked via `railway variable set … --skip-deploys` (`delete` cannot skip deploys). Takes effect on the next legacy deploy; no restart was triggered (deployment list unchanged).                                                                                                                       | readback: both `""`, `ENABLED=false`                                        |
| R5 lease secret doc   | `apps/web/.env.example` notes the Vercel _sensitive_ semantics.                                                                                                                                                                                                                                                                                                                                    | —                                                                           |
| R6 Vercel link        | `apps/web/.vercel/project.json` relinked to `build-os` (`prj_9EqtA4G1…`); gitignored, local only; previous file backed up in the session scratchpad.                                                                                                                                                                                                                                               | `vercel env ls` from `apps/web` now targets `build-os`                      |
| F2 record             | Addendum §15 added to the handoff.                                                                                                                                                                                                                                                                                                                                                                 | —                                                                           |

Not changed: R7 (`503` watch item) — no further `503`s observed during the canary.

**Deploy note:** pushing these commits redeploys Vercel (routing fix) **and both Railway services**
(`apps/worker/**` matches both watch lists). The dedicated worker will drain/restart; do it while
`activeTurns` is 0.

## 7. New observations from the canary (not blocking)

- **Doubled reply text.** Worker reply was `canary complete.canary complete`; the same prompt on
  legacy (`4b8b4c66`) returned `canary complete`. The model emitted text in the tool-call pass and
  again in the final pass, and the worker concatenates assistant text across passes. 0 of the 12
  most recent completed worker replies show the pattern, so it is prompt/model-dependent, not
  systemic. Recommendation: when a later pass produces the final answer, replace (or dedupe) the
  pre-tool text instead of appending.
- **`/api/agent/v2/prewarm` 503 burst.** 13 consecutive `503`s at ~1 s cadence during the 14 s
  worker turn, then `200`. The prewarm route itself has no 503 path and the expensive-operation
  limiter is only wired to `/api/transcribe`, so the origin is unidentified (Vercel/hook-level?).
  Harmless today but a hot loop; recommendation: locate the source and have the client honor
  `Retry-After`.
- Worker turns persist no `text_delta` rows in `chat_turn_events` (sequence gaps 4 and 11); text
  travels via Realtime/snapshot. Noted so a future reviewer does not read the gap as loss.

## 8. What was not done

- Before approval: no chat sent, no restart, no secret rotation, no env change. After approval: one warm-up + one canary chat, two legacy env vars blanked (no restart). No secret rotated; no cohort widened; nothing pushed/deployed.
- Historical Vercel function logs are not retrievable via CLI, so the 21:58:56 negotiation outcome is inferred from timing, not observed.
- Worktree untouched except the files listed in §6 and this report.
