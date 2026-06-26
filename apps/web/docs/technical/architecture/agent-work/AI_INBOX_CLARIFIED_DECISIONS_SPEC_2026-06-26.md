<!-- apps/web/docs/technical/architecture/agent-work/AI_INBOX_CLARIFIED_DECISIONS_SPEC_2026-06-26.md -->

# SPEC — AI Inbox v2: Clarified Decisions & Discuss

**Status:** Discuss, project-suggestion clarified decisions, worker reconciliation, and recurrence prompt memory implemented; shared controls and agent-run convergence remain future
**Date:** 2026-06-26
**Author:** DJ + Claude
**Related:** `AI_INBOX_DESIGN_2026-06-24.md`, `HANDOFF_2026-06-19.md` (Agent Work / change sets), `docs/research/project-review-loop-audit-suggestion-families-2026-06-25.md`

---

## 1. Problem & Context

The AI Inbox surfaces proposed changes (e.g. "merge these two tasks", "this doc looks outdated") and shipped a card that now shows _what_ a change does (`InboxChangeDetails.svelte`). The missing capability: letting the user **respond with reasoning** instead of a binary approve/reject.

When the AI proposes merging two tasks and the user knows they're intentionally separate workflows, that "why not" is the highest-value signal in the system — and today it is lost:

- Only `project_suggestion` **dismiss** captures a structured `{reason, note}`, written to `project_suggestions.user_feedback`.
- That store is a **dead end**: the project-loop worker never reads it (`loadLoopContext` builds context only from the project, docs, tasks, goals). So the same suggestion is re-proposed on the next run. The "dismissing teaches later runs" comment in `generators.ts` is aspirational.
- `agent_run` and `calendar_suggestion` capture no clarification at all.

**Decision (from the user):** a clarified decision should not be a static stored note. It should spin up a **context-aware agent** that already sees the project + the proposed change + the user's message, then **decides and acts** — including encoding the reasoning durably enough that the next review won't re-raise it. Plus a **Discuss** affordance that opens the full agentic chat seeded with the proposal for live back-and-forth.

**Intended outcome:** the user can Approve, Dismiss, Approve-with-clarification, Dismiss-with-clarification, or Discuss — and the system gets smarter from every clarified decision.

---

## 2. Goals & Non-Goals

**Goals**

- Capture free-text clarification on both approve and dismiss.
- Make a clarified decision a **seeded background agent run** that has project + proposal + user-message context and acts (apply/adjust on approve; record + encode on dismiss).
- **Stop recurrence**: a dismissed-with-reason suggestion must not be re-proposed by the next loop.
- A **Discuss** button that opens the real agentic chat, seeded with an opening AI message explaining the proposal and why.
- Reuse existing infrastructure (agent-runs dispatch/worker, the braindump→chat seeding precedent, the inbox index).

**Non-Goals (this iteration)**

- Expanding the suggestion-generation layer into the broader "project audit" families (see the research doc) — separate, larger effort.
- Designing or implementing `project_audits`. Complete Project Audit should be a durable report artifact linked to `project_loop_runs`, not another clarification mode and not merely another `project_suggestions.kind`.
- Changing the v1 AI Inbox source-of-truth model. `inbox_items` stays a repairable index; `project_suggestions` remains the actionable source row for this spec.
- Building `agent_run` change-set convergence (designed here, §5.6, but not built).
- Calendar-suggestion clarification.
- Generic snooze.

---

## 3. Concepts & Mental Model

Three decision tiers per inbox card:

1. **Fast path** — Approve / Dismiss, no text. Deterministic, unchanged. Approve replays operations; Dismiss marks rejected.
2. **Clarified path** — Approve-with-note / Dismiss-with-note. One click → an **async background agent run** seeded with the proposal + the user's note. The agent decides and acts. This is the user's "fire one message and the AI does it or not" model.
3. **Discuss path** — opens the full agentic chat modal, seeded with the proposal context, for live conversation. The in-chat agent has the write tools to act.

The unifying idea: **clarified decisions = seeded agents; Discuss = seeded chat.** Both are fed by one shared "proposal context builder."

v1 scope: `project_suggestion` items (rich rationale/evidence + replayable operations — the user's exact use case). `agent_run` convergence is designed but deferred.

### 3.1 Alignment With Project Loops, Inbox, And Audit Packets

This spec sits under the broader AI Inbox / Project Loop architecture:

```text
project_loop_runs
  -> project_audits?          // future durable report packet
  -> project_suggestions[]    // actionable findings
       -> inbox_items[]       // pending decision queue
```

Clarified decisions operate only on the `project_suggestions[]` layer. They do not change what a loop run is, and they do not define the Complete Project Audit artifact.

Implications:

- `project_loop_runs` remains the parent review event and context anchor.
- `project_suggestions` remains the actionable finding row.
- `inbox_items` remains the queue/index row.
- A clarified decision may dispatch an `agent_run` as an execution helper, but that run is not the parent review event and not a replacement for `project_loop_runs`.
- Future `project_audits` may generate child `project_suggestions`; those child suggestions can use the clarified-decision flow, but the audit packet itself should remain a readable report artifact.

---

## 4. Current System (grounding — verified in code)

- **Decide path:** `POST /api/inbox/decide` dispatches by `source_type`. `project_suggestion` → `decideProjectSuggestion()` in `apps/web/src/lib/server/project-suggestion-actions.service.ts` (dismiss writes `user_feedback`; approve replays `operations[]` via ChatToolExecutor).
- **"Why" fields** on a `project_suggestions` row (`packages/shared-types/src/project-loops.types.ts`): `rationale`, `why_now`, `evidence_refs` (validated against real entities), `preview` (before/after/impact), `confidence`, `operations` (`LoopOperation[]`).
- **Agent Runs infra (reuse target):** dispatch `POST /api/agent-runs` (insert row + `add_queue_job('agent_run')`, concurrency cap 3, `review:true`⇒`read_write`); worker `apps/worker/src/workers/agent-run/agentRunWorker.ts` executes **gateway** write ops; `finalize()` (≈ line 593) already calls `syncInboxItemForAgentRun`. `agent_runs` columns include `project_id, context_type, scope_mode, review_required, goal, instructions, expected_output, allowed_ops, label, parent_session_id` — **no** generic `metadata`/`source_id`.
- **Chat seeding precedent:** `apps/web/src/routes/api/onto/braindumps/[id]/chat-session/+server.ts` creates a project-scoped `chat_sessions` row (`context_type:'project'`, `entity_id`, `agent_metadata.focus`), inserts a seed `chat_messages` row, returns `chat_session_id`. Context injection is automatic from `(context_type, entity_id, agent_metadata.focus)` via `buildLitePromptEnvelope`. The resume GET (`/api/chat/sessions/[id]`) only returns `role in ('user','assistant')` → **seed must be `role:'assistant'`**. UI: `AgentChatModal.svelte` accepts `initialChatSessionId`.
- `project_suggestions.status` is TEXT with no CHECK constraint → adding a `'delegated'` value is free.

**Three corrections that shape the design**

1. `agent_runs` needs new columns to link a run to a suggestion → add `source_suggestion_id` + `source_decision`.
2. **Op-naming mismatch:** the agent-run worker emits **gateway** ops (`onto.task.update`, `onto.document.tree.move`, …); `operations[]` use **ChatToolExecutor** names (`update_onto_task`). The clarified-approve agent therefore gets the _decoded intent + entity ids_ and re-derives gateway ops — it does **not** replay `operations[]`.
3. `source_fingerprint` is a per-run project-snapshot/freshness token (shared by all suggestions in a run), **not** a per-suggestion content id. Recurrence prevention must be semantic (prompt) + entity-note, not fingerprint suppression.

---

## 5. Architecture / Design

### 5.1 Proposal Context Builder (shared)

- **Implemented `packages/shared-agent-ops/src/proposal-context/decode-operations.ts`** — pure TS (depends only on `@buildos/shared-types`). Extracted the decode logic previously inlined in `InboxChangeDetails.svelte`. Exports `decodeLoopOperation` / `decodeLoopOperations`.
- **Implemented `packages/shared-agent-ops/src/proposal-context/build-proposal-context.ts`** — `buildProjectSuggestionProposalContext({ suggestion, projectName, loopRun }): { humanText, llmText, operationSummaries, evidenceSummaries }`. Assembles title/kind/risk + `rationale` + `why_now` + decoded operations + `preview` + `evidence_refs` + loop-run context. `humanText` = markdown for the assistant seed message; `llmText` = compact block for future agent-run `instructions`.
- **Implemented package subpath** `@buildos/shared-agent-ops/proposal-context` and updated `InboxChangeDetails.svelte` to import the shared decoder.

### 5.2 Discuss (seeded chat)

- **Implemented `apps/web/src/routes/api/onto/projects/[id]/suggestions/[suggestion_id]/chat-session/+server.ts`** — mirrors the braindump precedent:
    1. `requireProjectMemberAccess({ requiredAccess: 'write' })`; load suggestion (404 if missing/not in project).
    2. Idempotent: if `project_suggestions.chat_session_id` set and session exists → return it.
    3. Create a **fresh** project-scoped `chat_sessions` row (`chat_type:'project_suggestion'`, title `Discuss: <title>`, `agent_metadata:{ source:'project_suggestion', source_id, source_kind:'project_review_item', focus:{…projectId,projectName} }`) + `chat_sessions_projects` junction. (Not the shared loop chat shell — one Discuss thread per change.)
    4. Insert a `role:'assistant'` seed message = `buildProjectSuggestionProposalContext(...).humanText`.
    5. Persist `project_suggestions.chat_session_id`. Clean up on failure. Return `{ created, session, chat_session_id }`.
- **Implemented UI:** "Discuss" button in `ProjectInboxPanel.svelte` and `DashboardInboxModal.svelte` → POST → open `AgentChatModal` with `initialChatSessionId`. The in-chat agent already has write tools + `commit_change_set`.
- **v1 limitation (documented):** Discuss does not auto-resolve the suggestion; the card stays pending until the user Approves/Dismisses or the chat applies it. (Future: mark handled when the chat applies the change.)

### 5.3 Clarified decision = seeded background agent run

**Implemented 2026-06-26 for `project_suggestion` inbox items.**

- **Implemented `apps/web/src/lib/server/agent-runs/dispatch.ts`** — extracted the insert+validate+enqueue+cap-3 logic from `apps/web/src/routes/api/agent-runs/+server.ts` into `dispatchAgentRun(params)` (supports `source_suggestion_id`, `source_decision`, `parent_session_id`). The public route now calls this helper with no external behavior change.
- **Implemented `apps/web/src/lib/server/clarified-decision.service.ts`** — `decideProjectSuggestionWithClarification({…, action, clarification, reason? })`:
    1. Load suggestion; require `status='pending'`.
    2. **approve+note:** freshness check (`loadProjectLoopSourceFingerprint`); mismatch → mark `superseded`, return. **dismiss+note:** skip freshness.
    3. Persist clarification on the row first: `user_feedback = { reason, note: clarification, created_at }` (deterministic backstop §5.4 reads).
    4. **Atomic claim:** `UPDATE project_suggestions SET status='delegated', decided_at=now WHERE id=… AND status='pending'`. 0 rows → already decided; re-sync + return.
    5. Build `goal` + `instructions` from `buildProposalContext(suggestion).llmText` + `USER CLARIFICATION: <clarification>` + action guidance:
        - **approve:** "Apply the change to these entities (ids…). You MAY adjust it to honor the clarification. Use gateway write ops; `submit_result` when done."
        - **dismiss:** "Do NOT apply. Durably encode the user's reasoning so the next review won't re-propose it — e.g. append a short note to the relevant task/document/goal. Then `submit_result`."
    6. Dispatch via `dispatchAgentRun`: `context_type:'project'`, `project_id`, `scope_mode:'read_write'`, `review:false` (commit-by-default — the user already decided), `allowed_ops` = scoped write+read subset (exclude delete/calendar for safety), `source_suggestion_id`, `source_decision`, `parent_session_id` = the loop chat session (`project_loop_runs.chat_session_id` via `run_id`); `label: 'Clarified <approve|dismiss>: <title>'`.
    7. **Cap-3 fallback (429):** the note is already saved — run the deterministic path (`decideProjectSuggestion`) inline and return `degraded:true` so the UI can say "applied directly (agent queue full)". Nothing lost.
    8. Set `project_suggestions.agent_run_id`, re-sync inbox item, return `{ ok, run, degraded? }`.
- **Important boundary:** this background `agent_run` is a child execution run for one suggestion. It should be linked to the suggestion via `source_suggestion_id` and to the originating loop context via `parent_session_id`, but it should not be treated as the canonical parent review event.
- **Modify `apps/web/src/routes/api/inbox/decide/+server.ts`** — in the `project_suggestion` branch, if `body.clarification` non-empty → route to the clarified service; else keep the fast path. (Mirror on `…/suggestions/[suggestion_id]/+server.ts`.)
- **Implemented worker reconcile — `agentRunWorker.ts` `finalize()`:** if `run.source_suggestion_id` is set and status is terminal, the worker updates the source suggestion (`completed` → `applied` if `source_decision='approve'`, `completed` → `rejected` if `source_decision='dismiss'`, otherwise `failed`), writes a result summary, sets `applied_at` for successful approvals, and calls `syncInboxItemForProjectSuggestion`.

### 5.4 Recurrence prevention (don't re-suggest)

**Implemented 2026-06-26.** Two layers (entity-note alone is insufficient — loop context is thin):

- **(a) Widened loop context** — `projectLoopWorker.ts` `loadLoopContext` now queries recently decided suggestions (`status IN ('rejected','applied','delegated','superseded') AND user_feedback IS NOT NULL`, last 60 days/30 rows) → `LoopContext.priorDecisions[]` (`{ title, kind, status, reason?, note?, decided_at? }`). The task mapping now includes `description` so agent-written notes re-enter context.
- **(b) Prompt block** — `generators.ts` now adds `priorDecisions` to `LoopContext` and appends a "Previously reviewed decisions" block to project brief, doc organization, outdated-doc, drift, and task-conflict prompts. Each generator explicitly says not to re-raise previously reviewed items unless materially new evidence changes the recommendation.
- **(c) Entity-note backstop** — produced by the §5.3 dismiss agent; visible to the next run via (a). No extra schema.
- _(Out of scope: per-suggestion `dedup_key` for exact-content dedup — noted as future.)_

### 5.5 UI (shared decision controls)

- **Implemented inline v1 controls** in `ProjectInboxPanel.svelte` and `DashboardInboxModal.svelte`. A non-empty project-suggestion clarification changes the primary actions to the clarified flow (`Apply + note` / `Dismiss + note`) and sends `clarification` through `/api/inbox/decide`. Discuss still opens the seeded chat-session flow.
- **Deferred cleanup:** a shared `InboxDecisionControls.svelte` remains a follow-up refactor. The current duplicated inline controls are intentionally small and source-specific while the clarified decision behavior settles.

### 5.6 agent_run convergence (DESIGN ONLY — not built in v1)

Bring `agent_run` `proposal_ready` change sets into the same model. Since commit is frozen approve/reject and `proposal_ready ∉ STEERABLE_STATUSES`: a clarified decision on an agent_run proposal → **dispatch a fresh seeded run** (seed from a change-set context builder — generalize `buildProposalContext` to accept `ChangeSet`/`ProposedChange[]` — plus the clarification), then mark the original change set rejected via `commitChangeSet(defaultDecision:'rejected')`. Discuss → seed a chat from `run.parent_session_id`. The generalized builder is the convergence seam.

---

## 6. Data Model Changes

**Migration `20260626000000_project_suggestion_chat_link.sql`**

- `project_suggestions.chat_session_id UUID NULL REFERENCES chat_sessions(id) ON DELETE SET NULL`
- `idx_project_suggestions_chat_session` partial index for linked discussion lookup

**Migration `20260626010000_clarified_project_suggestion_decisions.sql`**

- `agent_runs.source_suggestion_id UUID NULL REFERENCES project_suggestions(id) ON DELETE SET NULL`
- `agent_runs.source_decision TEXT NULL` (`'approve'|'dismiss'`)
- `project_suggestions.agent_run_id UUID NULL REFERENCES agent_runs(id) ON DELETE SET NULL`

**Types**

- Add `'delegated'` to `ProjectSuggestionStatus` (`packages/shared-types/src/project-loops.types.ts`).
- Map `'delegated' → inbox 'deciding'` in `mapProjectSuggestionToInboxItem` (`packages/shared-agent-ops/src/inbox-index.ts`).
- Shared DB types and `ProjectSuggestion.chat_session_id` were updated in-repo. Run `pnpm gen:types` after applying migrations in an environment to keep generated types authoritative.

---

## 7. API Contracts

- `POST /api/inbox/decide` — extend `project_suggestion` branch: optional `clarification: string`. Present ⇒ clarified path; absent ⇒ fast path. Response gains optional `degraded: boolean` and `agent_run_id`.
- `POST /api/onto/projects/[id]/suggestions/[suggestion_id]/chat-session` — new. Returns `{ created, session, chat_session_id }`. Idempotent.
- `POST /api/agent-runs` — unchanged externally; internally delegates to `dispatchAgentRun`.

---

## 8. Status Lifecycle (project_suggestion)

```
pending
 ├─ fast approve     → applied   (operations replayed)        → inbox decided
 ├─ fast dismiss     → rejected  (+ user_feedback)            → inbox decided
 ├─ clarified (claim)→ delegated                              → inbox deciding
 │      └─ agent run terminal → applied / rejected / failed   → inbox decided / blocked
 └─ clarified but cap-3 → degraded inline → applied/rejected (note retained)
```

The `delegated` claim removes the card from the pending list immediately; the decide endpoint re-syncs the index right away.

---

## 9. Edge Cases & Risks

- **Concurrency cap 3** on agent runs → handled by the degraded inline fallback (§5.3.7).
- **Idempotency** → conditional `status='pending'` claim; double-POST is a no-op.
- **Drift** → approve keeps the freshness gate; the agent also reads live data and self-corrects within a run.
- **Orphaned `delegated` rows** (run cancelled/lost) → extend the existing reaper in `inbox.service.ts` `backfillVisibleSourceRows` to reconcile `delegated` rows whose `agent_run_id` is terminal/cancelled. (Flag as follow-up if not in v1.)
- **Op-naming** → the agent re-derives gateway ops from intent; we never replay `operations[]` in the agent path.
- **shared-agent-ops browser safety** → decoder is pure; no Svelte/browser imports.
- **Discuss does not resolve the card** (v1) → documented limitation.

---

## 10. Phasing / Ship Order

0. **Prerequisite: stabilize AI Inbox v1** — apply `inbox_items` and `project_loop_run_brief` migrations in target environments, run the manual smoke tests, and remove `ProjectSuggestionsPanel.svelte` after the new panel is verified.
1. **Phase 1: loop parent context** — implemented first slice: `source_context.project_loop_run` payload/UI support in both Project Inbox and Dashboard Inbox.
2. **Phase 2 + 2b: shared builder/decoder extraction + Discuss endpoint & UI** — implemented. No new background agent runs.
3. **Phase 3: clarified agent runs + schema + worker reconcile** — implemented for `project_suggestion` source rows.
4. **Phase 4: recurrence prevention** — implemented via `priorDecisions` prompt memory and task descriptions in loop context.
5. **Phase 5: shared `InboxDecisionControls`.** Deferred refactor to replace duplicated inline button/reason/note clusters.
6. **Phase 6: agent_run convergence (design only).**
7. **Separate track: Complete Project Audit.** Design `project_audits` as a report artifact before writing migrations. Do not fold that work into clarified decisions.

---

## 11. Open Questions (for review)

1. **Approve-with-note default action:** answered in implementation. Clarified runs use commit-by-default (`review:false`) because the user has already decided.
2. **`allowed_ops` scope** for the clarified agent: answered for v1. The service allows scoped project read/write ops for tasks and documents, excludes delete and calendar operations.
3. **Discuss resolution:** v1 leaves the card pending. Decide whether a later in-chat "apply" should mark the suggestion handled automatically.
4. **Account/global items:** clarified path is project-scoped. Out of scope for non-project items this round — confirm.
5. **Relationship to the project-audit research doc:** answered. Keep this iteration strictly about the _decision_ surface. Audit/suggestion-family expansion is a separate effort with `project_audits` as the likely durable report artifact.

---

## 12. Verification

- **Phase 1/2 implemented checks:** `@buildos/shared-agent-ops typecheck`; `@buildos/shared-agent-ops build`; focused Vitest for `project-suggestion-actions.service.test.ts` and the new chat-session endpoint; `@buildos/web check` (`svelte-check found 0 errors and 0 warnings`).
- **Manual Discuss smoke:** POST chat-session for a real suggestion → open `AgentChatModal` → confirm the assistant seed renders and project context is present; POST again → same session (idempotent).
- **Phase 3/4 implemented checks:** focused Vitest coverage for `clarified-decision.service.ts` and the project-suggestion source endpoint; `@buildos/web check`; worker/shared typechecks. Manual smoke still recommended: Dismiss-with-clarification on a task-conflict suggestion → confirm `delegated`, child `agent_runs.source_suggestion_id/source_decision`, terminal suggestion `rejected`, inbox item settled, and future review prompt includes the prior decision. Approve-with-clarification → confirm suggestion `applied`. Force 3 active runs → confirm `degraded` inline path.
- **Full:** `pnpm typecheck && pnpm lint`.
