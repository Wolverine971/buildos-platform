<!-- tasker/91-workflow-lab-audit-and-export.md -->

# 91 — Workflow Lab: multi-agent trace inspector and export

**Created:** 2026-09-20. **Status:** Built locally on `main` (uncommitted, not deployed); see
[Implementation status](#implementation-status-2026-09-20). Tracker stays open until deployed
and the lab actions are checked against a real review.
**Owner request:** DJ tested Workflow Lab and likes it. During testing, he needs direct log links,
an inspectable account of what each agent did and received, and an export another agent can use
to reverse-engineer the entire run. This task is the implementation handoff; the inspector has
not been built by the session that wrote it.

## Implementation status (2026-09-20)

Built by the implementation session the same day, on `main`, without paid runs, migrations,
worker changes, or production changes. Files are uncommitted and shared with other agents' work.

**What exists now**

- **Lab actions.** `/workflow-lab` captures the real session id from `AgentChatModal.onSessionChange`,
  clears it when a new review starts, and renders `ChatSessionAuditActions` (Logs · Trace · Export)
  once a session exists. `ChatSessionAuditActions` now shows a Trace link to the inspector
  wherever it shows Logs (DJ's decision, 2026-09-20), so ordinary chat headers get Trace too;
  hosts can override with `includeWorkflowTrace`.
- **Server.** `GET /api/admin/chat/sessions/[id]` now joins the seven workflow tables through the
  session's authorized turn ids (`workflow-audit-loader.ts`), validates an optional `turn_run_id`
  against the session (404 on mismatch, 400 if not a UUID), never selects `settlement_token` or
  `attempt_token`, deep-redacts token-like keys, marks missing tables and row limits as coverage,
  and returns `private, no-store`. The additive `workflows` block is a versioned
  `chat_workflow_audit_v1` payload built by the pure `chat-workflow-audit-build.ts`.
- **Inspector.** `/admin/chat/workflows?chat_session_id=&turn_run_id=&view=&node=` with run picker
  (ordinary turns shown but not selectable), outcome/time/cost strip, Flow (SVG lanes from the saved
  plan; evidence handoff edges; Jev shadow as a dashed observation node), Timeline (lane bars +
  ordered table with attempts, generations, recovery, parallel overlap), Evidence (source × agent
  coverage matrix), Costs (settled vs reserved vs uncertain; usage-log correlation by provider
  request id; selector cost separate), Transcript (reuses `ConversationReplay`), Raw. Polls every
  6 s only while the selected run is not terminal. Linked from the admin chat hub, the session audit
  header ("Workflows (n)"), and the lab.
- **Export.** `chat-workflow-audit-export.ts` renders Markdown and ZIP for one workflow or the whole
  session from the same payload: `README.md`, `transcript.md`, `workflow.md`, `flow.mmd`,
  `timeline.md`, `costs.md`, `evidence.md`, `agents/<step>/{README.md,assignment.json,result.json,
dispatches.json,evidence.json}`, `raw/*.json`, `manifest.json` (schema version, scope, capture
  time, incomplete flag, counts, stored record hashes separate from SHA-256 of exported files,
  coverage). The existing session Markdown/ZIP exports gain a Workflow Runs section, per-run
  folders under `workflows/`, `raw/workflows.json` and `manifest.json` only when runs exist.

**Verification evidence**

- Free tests: 64 passing across six files: `chat-workflow-audit-build.test.ts` (parallel v1,
  sequential evidence handoff, unshared parallel reads, step rows under another plan version,
  unsupported version, truncation, running capture, cancellation, redaction),
  `chat-workflow-audit-export.test.ts` (layout, Mermaid, escaping, fence-aware heading demotion,
  secrets, manifest, session integration), `[id]/server.test.ts` (401/403/400/404, deep-linked turn
  past the turn page, event generation column, column lists, table coverage incl. missing runs
  table), plus the Trace-link, session export and lab loader suites.
- `pnpm --filter @buildos/web check`: 0 errors, 0 warnings. Prettier clean on every touched file.
- Code review (`/code-review high`, same day) returned 10 findings; the real ones are fixed:
  step rows scoped to the run's `plan_version` (PK is turn_run_id + plan_version + step_key; other
  rows are kept as `unmatched_step_rows` in the raw records with a `plan` coverage note) and step
  keys deduplicated so keyed renders cannot crash; the inspector page no longer refetches the
  session when the selected run changes (SvelteKit's shallow `replaceState` re-emits `$page`, which
  had fed the run id back into the load effect); a deep link to a turn that is in the session but not
  a workflow lands on the first workflow with the banner; a rejected run id falls back with exactly
  one extra fetch; heading demotion in both Markdown exports skips fenced blocks; the endpoint now
  selects `execution_generation` on turn events so the recovery coverage note is live; child tables
  inherit the runs table's coverage status when it is missing or failed instead of reading
  "available"; a requested `turn_run_id` past the 500-row turn page is resolved by id (scoped to the
  session) and joined into the payload instead of returning 404; icons come from
  `$lib/icons/lucide`.
- Browser (local dev server, DJ's admin account, read-only): the inspector opened the pilot session
  `d104deef-1e63-4dbe-996c-aaa3d066ad52`; both runs listed; Turn 1 (document v3) shows wall clock
  36.52 s, settled $0.003512, Jev shadow $0.000074 separate, all five dispatches settled and matched
  to usage rows; Evidence shows the organizer read three documents in full and the parallel reviewer
  received none of them ("not supplied"). Deep link with `turn_run_id`, `view` and `node` restored
  the same run and node; console clean on reload. The session audit header shows "Workflows (2)".
  After the review fixes: one audit fetch per session load, switching run tabs made zero further
  requests and rewrote the URL, and a foreign `turn_run_id` produced one 404 plus one fallback fetch
  with the warning banner, the first workflow selected and the requested view kept.

**Deferred or not verified (explicit)**

- No paid workflow was run and the full QA gate was not run (DJ deferred both). The lab header
  actions were not exercised in the browser because they appear only after a review starts, which
  is a paid run; the wiring reuses the same component the ordinary chat header already renders.
- Export downloads were not clicked in the browser; the bundle contents are covered by tests.
- Per-attempt serialized prompts and rejected outputs are **not persisted** by the engine. No new
  capture was added at the execution boundary: it needs worker + schema changes in files other
  agents are actively editing, and could not be verified without paid runs. The inspector and
  exports flag this as `per_attempt_prompts: not_persisted` rather than reconstructing it.
- `chat_turn_workflow_steps.input_evidence` is read when present; its absence is reported as
  coverage (`column_absent` / `not_stored`). The migration remains unapplied in production.
- Not deployed. The Vercel build path issue recorded in memory (rootDirectory `apps/web`) is
  unrelated but still blocks web deploys.

## Outcome

From a Workflow Lab conversation, DJ can open its logs, inspect a selected workflow as a graph
and timeline, drill into each specialist/tool/handoff, and download the conversation plus all
available execution evidence. A recipient can understand the run from that bundle without
database access or another model call.

Use the existing audit page as the design and interaction reference:
`/admin/chat/sessions?chat_session_id=76c5e6e9-b9c2-44ea-bb44-b21210896efd`.
That ID is DJ's reference example, not a hard-coded target or proof that it contains a workflow.
Preserve the existing transcript, timeline, prompt, time/cost, and Markdown/ZIP export patterns.

## First useful slice: expose existing logs in the lab

`/workflow-lab/+page.svelte` embeds `AgentChatModal`. Embedded mode deliberately omits the modal
header, and the lab currently does not supply the audit controls that the normal header provides.
The building blocks already exist:

- `AgentChatModal` has `onSessionChange?: (sessionId: string | null) => void` and emits the actual
  session ID. Capture this instead of using the project ID or guessing the most recent session.
- `ChatSessionAuditActions.svelte` owns the admin check, Logs link, and Markdown/ZIP downloads.
  Reuse it in the lab header. Reset stale session/run selection when starting a different review.
- Only show enabled actions after a session exists. Preserve desktop/mobile menu behavior and
  avoid losing the running chat when opening logs in another tab.

This slice makes existing logs reachable. Do not call its existing export a complete workflow
trace until the additional records below are included.

## Multi-agent inspector

Recommended dedicated page: `/admin/chat/workflows?chat_session_id=<id>&turn_run_id=<id>`.
Reuse shared admin audit loaders/components; link it from both the lab and the ordinary session
audit. A workflow-focused tab in the existing page is also acceptable if it preserves deep links
to a particular run/step/attempt and makes multi-agent work first-class.

Start with a session/run picker, outcome, elapsed time, cost coverage, and Transcript / Flow /
Timeline / Evidence / Raw views. The primary flow view should show:

1. User request, saved history/context, admitted policy/profile, and actual pinned specialists.
2. Planner output and the saved dependency graph. Distinguish parallel agents from sequential
   handoffs; derive edges from the saved plan and evidence bindings, not today's registry.
3. Agent lanes with label/version, assignment, model, allowed tools, input coverage, attempts,
   outputs/findings, and success/partial/failure/cancellation state.
4. Tool invocations and saved results attached to the correct agent/attempt. Show which agents
   actually received each source, including inventory-only versus full/excerpt/unavailable text.
5. Editor/synthesis inputs and final answer, connected back to the specialist reports/evidence.

Clicking a node opens its stored inputs, outputs, source links/hashes, tool activity, timing,
cost, errors, retries, and recovery identifiers. Use readable labels first; IDs remain copyable.
The same run must remain inspectable after reload and after navigating from History.

Do not present arbitrary inter-agent conversation when the engine only saved structured reports.
Explain decisions using recorded assignments, selector receipts, findings, and failure reasons.
Do not request or fabricate private chain-of-thought. A missing prompt, rejected output, event,
or historical attempt is a visible coverage gap, not an invitation to reconstruct it as fact.

## Data to join

The current session-detail API loads ordinary chat records but **does not load the workflow
tables**. Extend it additively or extract a shared server-side audit reader used by both pages.

| Source                                                                      | Inspector/export use                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `chat_sessions`, `chat_messages`                                            | Conversation and session context                                                                 |
| `chat_turn_runs`, `chat_turn_events`                                        | Turn identity, durable status, event ordering and correlation                                    |
| `chat_turn_input_artifacts`                                                 | Exact admitted request/history, policy and hashes where retained                                 |
| `chat_prompt_snapshots`                                                     | Persisted prompts/messages/tools; distinguish availability per turn/attempt                      |
| `chat_turn_workflow_runs`                                                   | Saved context/plan, policy, answer, outcome, deadline, recovery count and hashes                 |
| `chat_turn_workflow_steps`                                                  | `step_key`, `depends_on`, assignments, attempt IDs/generations, accepted results and failures    |
| `chat_turn_workflow_dispatches`                                             | Each physical provider request, reservation/settlement/uncertainty, model, provider ID and usage |
| `chat_turn_specialist_snapshots`                                            | Exact definitions and capabilities pinned for this run                                           |
| `chat_turn_document_read_batches`                                           | Immutable read arguments/results, source IDs, text coverage, result hash and originating attempt |
| `chat_turn_specialist_selection_shadows`                                    | Jev candidates, observation/unavailability, selected alternative, timing and cost                |
| `chat_tool_executions`, `llm_usage_logs`, existing timing/operation records | Correlated tool/provider details and existing audit views                                        |

The locally implemented document evidence migration adds `chat_turn_workflow_steps.input_evidence`.
It was **not yet applied to production** when this task was written. The reader must handle its
absence and old profiles honestly. Do not make the inspector depend on enabling that rollout.

Resolve all child records through the authorized session's actual turn IDs; validate a supplied
`turn_run_id` belongs to that session. Join child rows lacking `session_id` through those IDs.
Do not correlate by timestamp proximity. Deduplicate with stable IDs; keep logical attempts,
physical dispatches, provider fallbacks, and execution generations distinct.

The dispatch ledger saves accounting/identity, not the full serialized model request. Inventory
what exact per-agent/per-attempt prompts and failed outputs are already persisted. If a necessary
piece is missing, add the smallest bounded, versioned capture at the execution boundary for future
runs, with clear retention/redaction and coverage flags. Never backfill an old run using live
project text or a newer specialist definition. Inspection/export must never trigger execution.

## Cost, time, and evidence truth

- Treat workflow dispatch settlements as workflow-spend authority. Show actual settled cost,
  outstanding reservations/uncertain exposure, and the budget separately. Missing cost is unknown,
  not zero; reserved amounts are not paid amounts.
- Join usage rows to physical dispatches where supported; do not add the same provider charge
  from the ledger and usage logs twice. Explain uncorrelated usage instead of guessing.
- Jev shadow cost is additional selector telemetry, outside the workflow dispatch budget. Label
  it separately and distinguish a shadow recommendation from the agents that actually executed.
- Show wall-clock duration and parallel overlap. Sum of agent durations is not wall-clock time.
  Distinguish queue/preparation/dispatch/provider/delivery timing only where recorded.
- Accepted final answers can coexist with a persisted editor step still marked claimed after
  prefix finalization. Follow durable terminal outcome/answer receipts; do not infer a stuck run
  solely from that step row. See `WorkflowProgressCard.svelte` for current handling.
- Show source hashes/version bindings and full/excerpt/unavailable coverage. Differentiate no
  document read from missing telemetry. A hash mismatch should be visible, not silently repaired.

## Export contract

Support a readable Markdown report and a ZIP bundle built from the same versioned audit payload
as the inspector. Support exporting the selected workflow and the whole session; label scope.
The whole-session bundle must include every workflow turn and ordinary conversation turns.

Suggested bundle contents:

```text
README.md                 question, outcome, issues, coverage, IDs and file index
transcript.md             complete available user/assistant conversation
workflow.md               saved graph, specialist assignments, handoffs and results
flow.mmd                  offline-readable Mermaid representation of the saved graph
timeline.md               ordered events with parallelism/attempts/recovery identified
costs.md                  per-dispatch accounting, selector cost and unknown exposure
evidence.md               sources and which specialist actually received them
agents/<stable-id>/...    per-agent instructions, inputs/tools/results where recorded
raw/*.json                workflow, steps, dispatches, snapshots, read batches, selector receipts
manifest.json             schema version, exportedAt, scope, counts, hashes and coverage
```

Reuse existing transcript/prompt/export utilities rather than duplicating blobs in every file.
Keep original stored record hashes distinct from hashes of redacted export files. Strip credentials,
authorization headers, live signed URLs, settlement/lease/claim tokens, and similar control secrets.
Keep non-secret correlation IDs. Escape untrusted Markdown/HTML and generate safe archive paths.
Export saved operational inputs and outputs; do not invent internal reasoning.

Handle row/byte limits explicitly. Existing queries have limits such as 500 turns and 5,000 events:
fetch additional pages or mark truncation with counts/cursors in both UI and manifest. An export
of a running workflow must state its capture time and incomplete status; avoid implying its
multi-query view was atomic. Distinguish absent-by-design, unavailable, redacted, and truncated.

## Access and performance

This is a testing/admin surface. Reuse the existing server-side authenticated `user.is_admin`
boundary for every audit/export endpoint. Pilot allowlist membership or a query-string debug flag
alone must not grant access to private records. UI hiding is not authorization. Do not add public
table grants or expose service-role credentials to support this page.

Use private/no-store responses. Batch queries by authorized turn IDs, avoid one fetch per agent,
and load large prompt/source text on demand where useful. Stop refresh/polling after terminal state;
manual refresh remains available. Do not make chat execution wait for an inspector being open.

## Code entry points

- `apps/web/src/routes/workflow-lab/+page.svelte`
- `apps/web/src/lib/components/agent/{AgentChatModal,ChatSessionAuditActions,WorkflowProgressCard}.svelte`
- `apps/web/src/routes/admin/chat/sessions/+page.svelte`
- `apps/web/src/lib/components/admin/chat/{SessionDetailModal,SessionFlowVisuals,SessionTimeWaterfall,SessionCostWaterfall}.svelte`
- `apps/web/src/routes/api/admin/chat/sessions/[id]/{+server,session-detail-payload}.ts`
- `apps/web/src/lib/services/admin/chat-session-audit-{types,export,bundle,compact,timeline}.ts`
- `apps/web/src/lib/services/admin/chat-session-flow-{profile,geometry,navigation,targets}.ts`
- `apps/worker/src/workers/agentic-chat/workflow/{workflow-runner,workflow-store,workflow-dispatch,workflow-projection,document-read-tool}.ts`
- `packages/agentic-chat-runtime/src/specialists/{document-organization,registry,workbench}.ts`
- `packages/shared-types/src/agentic-chat-workflow-contract.ts`

Read the current [handoff](../docs/technical/reviews/AGENTIC_CHAT_HANDOFF_2026-09-19.md),
[production pilot receipt](../docs/technical/reviews/SPECIALIST_PILOT_ROLLOUT_2026-09-20.md),
[evidence handoff](../docs/architecture/DOCUMENT_EVIDENCE_HANDOFF_2026-09-20.md), and
[workbench status](../docs/architecture/SPECIALIST_WORKBENCH_2026-09-20.md) before implementation.
Local files include pending changes; check current git/deployment state instead of treating every
schema/profile in source as already live. Do not overwrite other agents' changes.

## Acceptance and verification

- [x] Lab actions use the actual created/restored session; wrong/stale links are cleared on switch.
      _Wired via `onSessionChange`; reset on new review and close. Not browser-exercised (needs a paid review)._
- [x] Deep link selects the right workflow when a session contains multiple runs and ordinary turns.
      _Browser-verified on the pilot session; unit-tested for run/ordinary separation._
- [x] A parallel review and sequential evidence-handoff fixture render different correct graphs.
      _`chat-workflow-audit-build.test.ts`: parallel group vs `evidence_binding` handoff; Mermaid differs._
- [x] Per-agent evidence exposure is correct: old parallel reviewer did not receive organizer reads;
      a supported saved handoff shows the bound read batch, even if source documents later change.
      _Tested (fixtures) and seen live on pilot Turn 1 ("not supplied" for the reviewer)._
- [x] Retries, provider fallback, recovery, partial results, cancellation, and uncertain dispatch
      cost are represented without duplicate calls/costs or invented events.
      _Tested: attempts vs dispatches, released fallback, uncertain exposure, generation change → recovery, cancelled steps._
- [x] Jev shadow observation is visually distinct from actual admission/agent selection.
      _Dashed node, observation-only edge, separate cost tile; tested and seen live._
- [x] Markdown/ZIP exports contain conversation and all available workflow records, reconcile
      counts/costs, expose missing/truncated/redacted data, and contain no control secrets.
      _Tested (manifest counts, coverage, `[redacted]`, no secret strings). Download click not exercised in browser._
- [x] Anonymous/non-admin access and mismatched session/run IDs are rejected server-side.
      _`[id]/server.test.ts`: 401, 403 (pilot user), 400, 404; service client not created before auth._
- [x] Ordinary chat audit/export and legacy workflows remain readable; unsupported schema versions
      show coverage/compatibility information rather than a fabricated graph or a blank page.
      _Pre-existing export/payload tests still pass; unsupported `workflow_version` → `supported:false`, empty graph, raw records kept._
- [~] Narrow tests and browser inspection cover navigation, graph selection, export and failures.
  Use synthetic fixtures or already authorized stored data; opening/exporting costs no inference.
  _Tests + browser navigation/graph/evidence/costs done on stored data; export click and lab actions not browser-exercised._

Use `test-gate` and repository worker limits. Run targeted admin payload/flow/export/component tests
and `pnpm --filter @buildos/web check` after Svelte changes. Use the Svelte skills. Add focused worker
or Postgres tests only if capture/schema changes require them. **DJ has explicitly deferred research
and the full Agentic Chat QA gate in this conversation; do not run paid workflows to test this UI.**
Record that deferral, not a gate pass. Don't change model routing, enable custom agents, activate
research, or deploy unrelated pending migrations as part of this task.

Exit condition: DJ can open a tested workflow trace from the lab and hand a verified export to
another agent. Record implementation/deployment status separately; keep this tracker open while
deployment or the named verification remains pending.

## Paste into the next agent

Implement `tasker/91-workflow-lab-audit-and-export.md`. Start with the existing admin Logs/Export
controls in Workflow Lab, then build the multi-agent workflow inspector and complete offline
export using saved execution records. Reuse the current session audit system. Preserve admin
authorization, exact run/version provenance, cost accounting and existing chat behavior. Do not
run research, paid model workflows, or the full QA gate; use focused free tests and browser checks.
Read the handoff and inspect the current shared working tree before editing. Deliver the working
feature and evidence of verification, with any missing historic telemetry clearly identified.
