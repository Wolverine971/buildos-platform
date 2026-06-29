<!-- apps/web/docs/technical/architecture/agent-work/AI_INBOX_DESIGN_2026-06-24.md -->

# AI Inbox - Design / Shaping Doc

**Date:** 2026-06-24
**Status:** Shaping, audit-revised 2026-06-24, loop/audit alignment revised 2026-06-26, project-suggestion clarified decisions and shared decision controls implemented 2026-06-26, decision notification handoff implemented 2026-06-27, inbox chat resolution hook implemented 2026-06-28
**Author:** DJ + Claude + Codex audit pass
**Related:** `HANDOFF_2026-06-19.md` (Agent Work / change sets), `PROJECT_START_HERE_DOC_DESIGN_2026-06-23.md`, project-loops, `docs/research/project-review-loop-audit-suggestion-families-2026-06-25.md`

---

## 1. The Concept

BuildOS has multiple background producers that want to change user-owned data on the user's behalf. Today each producer surfaces in its own place with its own approval mechanic. The **AI Inbox** is the durable review queue where a user scans, understands, and actions pending proposed mutations: "BuildOS wants to update this doc," "BuildOS wants to remove this task," "BuildOS wants to create this calendar-derived project," or "BuildOS found a profile/contact merge that needs a call."

**Defining boundary:** the Inbox is only for proposed changes that mutate data and need a decision. Informational outputs - daily briefs, project next-step snippets, and the Start Here document as an orientation artifact - are not inbox items. A proposed mutation _to_ the Start Here document is an inbox item because it carries an approve/reject decision over data.

Scopes:

- **Project Inbox** - pending project-scoped review items for one project, rendered on the project page.
- **Dashboard Inbox** - cross-project roll-up with a project navigator, modeled on the existing overdue-task triage flow.
- **Account/global grouping** - pending user-owned items with no `project_id` (profile fragments, contact merge candidates, global agent runs). These appear in Dashboard Inbox under an account/profile grouping, not in a Project Inbox.

Mental model: **Gmail.** The bottom-right notification stack is the toast ("a proposal just landed"). The Inbox is the durable, browsable mailbox ("here's everything waiting on me"). One may point to the other, but they are not the same surface.

---

## 2. What Already Exists

The strongest substrate is Agent Work Phase 4: staged mutations with per-change approve/reject, freshness checks, scope gating, atomic commit, and telemetry. That substrate is real, but it only applies to `agent_runs.change_set` today. The non-agent-run producers need source adapters in v1; they should not be treated as true `ChangeSet`s until they are migrated.

### Producers Of Reviewable Items

| Producer                                    | Real storage                                                                                                                                                 | Approval shape today                                                                                                                                                                                                         | Surfaced today                                          | Inbox handling                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Agent Runs** (durable runs, review mode)  | `agent_runs.change_set`, `status='proposal_ready'`                                                                                                           | True `ChangeSet`; per-change approve/reject                                                                                                                                                                                  | Notification stack, Work Panel, `ChangeSetReview`       | Primary; direct `agent_run` source adapter                                                                               |
| **Chat-close capture** (Start Here updates) | Inserts an `agent_runs` row with `trigger='chat'`, `status='proposal_ready'`                                                                                 | True single-change `ChangeSet`                                                                                                                                                                                               | Work Panel / agent-run surfaces, but not project Inbox  | Primary; same `agent_run` adapter                                                                                        |
| **Project Loops**                           | Parent review event in `project_loop_runs`; actionable child findings in `project_suggestions`, `status='pending'`; feature-gated by `PROJECT_LOOPS_ENABLED` | Whole-suggestion Accept/Dismiss fast path; project-suggestion clarification remains API-supported and delegates to a source-linked child `agent_run`; freshness guard supersedes stale approvals; no per-operation decisions | Project Inbox (`ProjectInboxPanel`) and Dashboard Inbox | Primary through `project_suggestion` adapter; `project_loop_runs.brief` is contextual parent metadata, not an inbox item |
| **Calendar Analysis**                       | `calendar_project_suggestions`, initially `status='pending'`                                                                                                 | Accept creates a project/tasks; dismiss marks rejected; current `defer` route maps to reject-with-reason and is not real snooze                                                                                              | Calendar-analysis notification modal                    | Primary through `calendar_suggestion` adapter; not a true `ChangeSet` until Option C                                     |
| **Daily Brief next-steps**                  | Auto-writes `onto_projects.next_step_*`                                                                                                                      | No approval decision; orientation output                                                                                                                                                                                     | Email/SMS/in-app brief                                  | Out of scope; not an inbox item                                                                                          |
| **Profile fragments**                       | `profile_fragments`, especially `status='needs_review'`                                                                                                      | API can list and status-flip fragments, but there is no safe user-triggered merge/apply endpoint; worker merge only processes `pending` fragments                                                                            | No dedicated review UI                                  | Gated. Do not include until a real profile-fragment apply/dismiss handler exists                                         |
| **Contact merge candidates**                | `user_contact_merge_candidates`, `status='pending'`; raw `user_contact_observations` auto-resolve to applied/needs_confirmation/dismissed                    | Existing API supports `confirmed_merge`, `rejected`, `snoozed`, with sensitive-value exposure gates                                                                                                                          | Contact candidate API; no unified Inbox UI              | Include only merge candidates, not raw observations; requires a sensitive-data-aware card                                |
| **Context Snapshot worker**                 | `project_context_snapshot` cache + Start Here managed regions                                                                                                | Machine-owned cache refresh                                                                                                                                                                                                  | n/a                                                     | Out of scope; never approvable                                                                                           |

### Canonical Change-Set Machinery

- **`ProposedChange`** (`packages/shared-types/src/agent-work.types.ts`): `{ id, op, entity_type, entity_id?, action: create|update|delete, before?, after?, rationale, decision?, applied_entity_id?, error? }`
- **`ChangeSet`**: `{ run_id, status: pending|partially_applied|applied|rejected, changes[], created_at }`
- **`commitChangeSet()`** (`packages/shared-agent-ops/src/gateway/change-set.ts`): per-change approve/reject, freshness/drift verification, scope gating (`allowed_ops`), atomic claim (`proposal_ready -> running -> completed|partial`), telemetry to `agent_tool_executions`.
- **Endpoint**: `POST /api/agent-runs/[id]/commit` with `{ decisions: [{ change_id, decision }], default_decision }`.
- **Chat tool path**: `commit_change_set` also calls the same shared `commitChangeSet()`.
- **UI**: `ChangeSetReview.svelte` and `DocumentProposalDiff.svelte`.
- **Realtime**: `agentRunsRealtime.service.ts` feeds the notification stack and Work Panel.

This is the canonical long-term mutation-review shape. V1 source adapters must make clear which protections they actually have. Do not show per-change controls for producers that only support whole-item decisions.

### Existing Inbox-Like Surfaces To Respect

- **Work Panel** already exists as the durable agent-run inbox/history/control panel. AI Inbox must coexist with it or explicitly absorb its proposal subset. Do not add another global nav item named "Inbox" without a naming/navigation decision.
- The legacy `ProjectSuggestionsPanel.svelte` project-loop review UI has been retired; Project Inbox is the project-scoped review surface.
- **OverdueTaskTriageModal** provides the dashboard triage chrome: full-screen modal, per-project grouping, project navigator, card stack, progress count, keyboard navigation.
- **EntityTabStrip** currently has Briefs, Chats, Graph, Goals, Milestones, Plans, Risks, and Events; there is no Activity tab. Any new Project Inbox tab should be added to the current strip reality, not to stale tab naming.

---

## 3. Central Architectural Decision

How do heterogeneous producers feed one queue?

### Option A - Read-Time Aggregation

`GET /api/inbox` unions `agent_runs(proposal_ready)`, `project_suggestions(pending)`, `calendar_project_suggestions(pending)`, and later signal sources into a common response shape at query time. Actions route to each producer's existing endpoint.

- Pro: no dual-write; source of truth stays put; fastest prototype.
- Con: cross-source sort/page/count is awkward; badge counts are expensive; every producer needs custom query logic in every reader.

### Option B - Unified `inbox_items` Index Table

Create a lightweight denormalized index row per review artifact. The full payload stays in the source table.

Recommended v1 shape:

```ts
type InboxSourceType =
	| 'agent_run'
	| 'project_suggestion'
	| 'calendar_suggestion'
	| 'profile_fragment'
	| 'contact_merge_candidate';

type InboxItemStatus = 'pending' | 'deciding' | 'decided' | 'blocked' | 'expired' | 'snoozed';

interface InboxItemIndex {
	id: string;
	source_type: InboxSourceType;
	source_ref_id: string;
	source_status: string | null;
	user_id: string | null;
	project_id: string | null;
	audience: 'user' | 'project_members';
	status: InboxItemStatus;
	title: string;
	summary: string | null;
	risk_tier: 1 | 2 | 3 | null;
	action_kinds: string[];
	created_at: string;
	updated_at: string;
	decided_at: string | null;
	blocked_reason: string | null;
	snoozed_until: string | null;
	expires_at: string | null;
}
```

The `snoozed` index state is included for source-specific adapters and future generic snooze. Generic v1 should not render Snooze unless `snoozed_until` and a re-surface rule are implemented.

Required constraints:

- `UNIQUE (source_type, source_ref_id)` to make producer writes idempotent.
- Indexes for `(status, created_at DESC)`, `(project_id, status, created_at DESC)`, and `(user_id, status, created_at DESC)`.
- RLS must match source visibility:
    - `agent_run`, `profile_fragment`, and `contact_merge_candidate` are user-owned.
    - `project_suggestion` is visible/actionable by project members according to project access.
    - `calendar_suggestion` is user-owned and often has no project until accepted.

Sync contract:

1. **Source remains truth.** `inbox_items` is a cache/index, not an authority.
2. **All list/count endpoints reconcile source status.** If the index says `pending` but source is terminal, repair or suppress it.
3. **All decision endpoints mutate the source first, then update the index.** Never mark an inbox item decided before the source action succeeds. Once the source action succeeds, `POST /api/inbox/decide` must return an index row whose status is no longer `pending`; if normal source sync returns a stale row or throws, the endpoint must force the index to `deciding`, `decided`, or `blocked` from the successful decision payload.
4. **Every source adapter owns a status mapper.**
    - `agent_run`: `proposal_ready` + pending change set => `pending`; completed/partial with non-pending change set => `decided`; failed/cancelled => `blocked` or `decided` depending on proposal state.
    - `project_suggestion`: `pending` => `pending`; `approved|delegated` => `deciding`; `applied|rejected|superseded` => `decided`; `failed` => `blocked`.
    - `calendar_suggestion`: `pending` => `pending`; `processing` => `deciding`; `accepted|rejected|modified|deferred` => `decided`; current `deferred` is not generic snooze unless it has `snoozed_until`.
    - `profile_fragment`: `needs_review` => `pending`; `accepted|dismissed` => `decided`, but only after a real apply/dismiss handler exists.
    - `contact_merge_candidate`: `pending` => `pending`; `confirmed_merge|rejected` => `decided`; `snoozed` => `snoozed` if a re-surface rule exists.
5. **Decision handlers must be idempotent and claim source rows.**
    - `agent_run` already claims `proposal_ready -> running`.
    - `project_suggestion` needs an atomic source claim before replaying operations, using an allowed source status such as `approved` or a new explicit in-progress status.
    - `calendar_suggestion` uses an atomic `pending -> processing` claim before instantiating a project/tasks; `20260627000000_calendar_suggestion_processing_status.sql` ensures the source table allows that claim state. `20260627001000_calendar_suggestion_created_project_fk.sql` realigns `created_project_id` to `onto_projects`, matching the ontology project instantiator. Repeated accepts on fresh `processing` rows are idempotent and sync the inbox item to `deciding`; stale `processing` rows can be reclaimed by matching the previous `status_changed_at`.
    - Signal handlers need equivalent source-state checks before merge/apply.

### Option C - Everything Emits Agent-Run Change Sets

Make Project Loops, Calendar Analysis, and signal review producers emit `agent_runs` review runs so every item uses one payload shape and one commit path.

This is the cleanest long-term target, but it is too much migration for the first inbox surface.

### Decision

**Option B now -> C later.** Build `inbox_items` as an index with explicit source adapters, not as a false promise that every source is already a `ChangeSet`. Keep `agent_runs.change_set` + `commitChangeSet()` as the canonical action path for agent-run proposals. Migrate other producers toward true change sets after the unified surface is usable.

### Project Loop And Audit Alignment Decision

Project Loops need two levels of product artifact:

1. **Parent review event:** `project_loop_runs`.
    - Owns run status, trigger reason, cost, chat session, summary, and the compact `brief`.
    - Represents "BuildOS reviewed this project at this time."
    - Is not itself a mutation proposal and should not automatically become an Inbox card.

2. **Actionable child findings:** `project_suggestions`.
    - Own concrete findings generated by the run.
    - May be mutating (`operations.length > 0`) or informational (`operations.length === 0`, such as drift acknowledgement).
    - Are the rows indexed into `inbox_items` as `source_type = 'project_suggestion'`.

For the future Complete Project Audit family, do not model the audit as just another `project_suggestions.kind`. A complete audit is a durable report packet. It may produce actionable suggestions, but the report itself should be readable and citable even when it has no mutation for the user to approve.

Recommended future shape:

```ts
interface ProjectAudit {
	id: string;
	project_id: string;
	loop_run_id: string | null;
	status: 'draft' | 'ready' | 'archived' | 'superseded';
	trigger_reason: 'scheduled' | 'burst' | 'critical_change' | 'manual';
	delivery_confidence: 'green' | 'yellow' | 'red' | 'unknown';
	summary: string;
	dimensions: Array<{
		key: string;
		rating: 'green' | 'yellow' | 'red' | 'unknown';
		evidence_refs: unknown[];
		recommendation: string | null;
	}>;
	created_at: string;
}
```

The Inbox should only index a future `project_audit` when the audit packet itself needs an explicit user review decision, such as "review this audit" or "accept generated follow-up suggestions." Concrete mutations should still become separate `project_suggestion` or true `ChangeSet` items.

This gives us the intended relationship:

```text
project_loop_runs
  -> project_audits?          // durable report packet, future
  -> project_suggestions[]    // actionable findings
       -> inbox_items[]       // pending decision queue
```

Do not force audit packets through `agent_runs.change_set`. Use true `ChangeSet`s for proposed data mutations; use `project_audits` for consultant-style reports.

---

## 4. Surfaces & UX Shaping

### Dashboard Inbox

- Badge/summary widget near the greeting: "7 changes need your call across 3 projects."
- Click opens an Inbox triage modal using the Overdue Task Triage chrome: project navigator, grouped batches, card stack, progress count.
- Items with `project_id IS NULL` appear in an **Account** or **Profile** group.
- Bulk actions are allowed only when every selected item's source adapter supports the same action safely.

### Project Inbox

- Add an **Inbox** tab to the current `EntityTabStrip` on the project page.
- The Project Inbox shows project-scoped `pending` items only.
- It replaced the legacy `ProjectSuggestionsPanel` for `project_suggestion` items; the old component has been removed.
- It should not show account/global profile/contact items unless a source adapter can confidently associate them with the project.
- It may load the latest `project_loop_runs.brief` as contextual parent metadata, but pending decisions should still come from `/api/inbox`.
- Future complete audits should render as report packets linked from this surface, not as long lists of disconnected cards.

### Work Panel Coexistence

Work Panel remains the durable agent-run history/control surface. AI Inbox is the durable mutation-review queue.

Agent-run inbox cards can deep-link/open the same rich run modal used by Work Panel. Avoid duplicating run-history browsing inside AI Inbox.

### Notification Stack

The notification stack stays the transient toast surface. When a producer creates a review item and has a notification channel, the toast should either:

- deep-link into the relevant Inbox item, or
- open the existing inline review modal as a fallback.

Do not require every producer to create duplicate toasts before it is wired into Inbox. The durable queue is the source of pending state.

Decision handoff rule: once a user approves, accepts, rejects, or dismisses an inbox card, the card should leave the current inbox surface immediately. The source action may still be processing, but that state belongs in the bottom-right notification stack as a minimized processing item. On completion, the stack item resolves to success/info/error, emits the final toast, and then removes itself. If the request itself fails, the inbox surface silently reloads so unresolved items can reappear from source truth.

### Card Atom

**One card = one review artifact, not necessarily one `ChangeSet`.**

Card variants:

- `agent_run`: one true `ChangeSet`, expandable to per-change controls and diffs.
- `project_suggestion`: one project-loop suggestion, showing operation count, evidence, preview, risk tier, and whole-item Accept/Dismiss/Chat.
- `project_audit` (future): one consultant-style audit packet, showing delivery confidence, audit dimensions, evidence, and generated follow-up findings. It should not expose Accept/Dismiss unless there is a clear user decision over the packet itself.
- `calendar_suggestion`: one suggested project/task creation, showing calendar evidence, project/task preview, and whole-item Accept/Dismiss/Chat.
- `profile_fragment`: one profile fragment needing review, only after a real apply handler exists.
- `contact_merge_candidate`: one merge candidate, showing both contacts with sensitive-value controls.

Generic actions:

- V1 generic actions: **Approve** and **Reject**.
- Per-change override appears only for true `ChangeSet` cards.
- Generic **Snooze** is out of v1. Do not render it unless the source has a real `snoozed_until` / re-surface contract. Existing calendar `defer` is not enough.
- "Open in chat to refine" remains stretch.

---

## 5. Build List

1. **Index schema** - add `inbox_items` with source identity, nullable `user_id`/`project_id`, `audience`, status, metadata, unique source key, and read/count indexes.
2. **Source adapter contract** - each source must provide `mapToInboxItem(sourceRow)`, `loadPayload(sourceRef)`, `decide(sourceRef, action, options)`, and `syncIndex(sourceRef)`.
3. **Safety fixes before unified actions** - `project_suggestions` now claims `pending -> approved -> applied|failed`, supersedes stale approvals before replay, and treats already-decided responses idempotently. `calendar_project_suggestions` now claims `pending -> processing -> accepted|rejected`, maps `processing` to Inbox `deciding`, has a migration-backed status constraint that permits the claim state, links accepted suggestions to `onto_projects`, and handles retry/stale-processing recovery.
4. **Producer wiring** - write/sync index rows when:
    - agent runs reach `proposal_ready`,
    - chat-close capture inserts its proposal run,
    - project-loop suggestions are inserted,
    - calendar suggestions are inserted,
    - later signal adapters create reviewable rows.
5. **Read endpoints** - `GET /api/inbox` with filters for project/status/source/group and `GET /api/inbox/count`; both reconcile stale index rows against source state.
6. **Decision endpoint** - `POST /api/inbox/decide` dispatches by `source_type`, mutates source first, then syncs the index. It returns source-specific result detail and enforces the persisted index status handoff so approved/rejected items cannot reload from `/api/inbox?status=pending`.
7. **Card components** - shared inbox card shell plus source-specific payload renderers. Reuse `ChangeSetReview`/`DocumentProposalDiff` only for true agent-run change sets.
8. **Project Inbox tab** - shipped in `EntityTabStrip` with project-loop brief, grouped sections, feedback controls, and safe batch apply. The old `ProjectSuggestionsPanel` fallback has been removed after confirming it had no live imports.
9. **Dashboard triage modal** - reuse the Overdue Task Triage navigation/progress chrome for cross-project items and account/global grouping.
10. **Loop parent context** - implemented first slice: `/api/inbox?include_payload=1` returns `source_context.project_loop_run` for project-loop items, and both project/dashboard inbox surfaces show the originating review run label.
11. **Inbox Chat** - implemented first project-suggestion slice with shared proposal decoder/context builder, `project_suggestions.chat_session_id`, and `POST /api/onto/projects/[id]/suggestions/[suggestion_id]/chat-session`; expanded 2026-06-28 to `POST /api/inbox/[item_id]/chat-session` so writable `project_suggestion`, user-owned `agent_run`, and user-owned `calendar_suggestion` items can all open seeded chat from Project Inbox/Dashboard Inbox.
12. **Project-suggestion clarified decisions** - implemented for project-loop suggestions: `project_suggestions.status='delegated'`, `agent_runs.source_suggestion_id/source_decision`, child-run worker reconciliation, queue-full degraded fallback, and prior-decision loop prompt memory to reduce repeated suggestions.
13. **Shared decision controls** - implemented in `InboxDecisionControls.svelte` and wired into `ProjectInboxPanel` and `DashboardInboxModal`. Source-specific behavior remains in the parent surfaces/endpoints; the visible action model is now `Accept`, `Dismiss`, `Chat`. Inline clarification/dismiss-note UI is no longer shown; guidance moves through the seeded Chat path while `/api/inbox/decide` still supports project-suggestion clarification for compatible callers.
14. **Decision notification handoff** - implemented in `inbox-decision-notification.service.ts`, `ProjectInboxPanel`, and `DashboardInboxModal`: cards are optimistically removed on approve/reject/dismiss, processing is shown in the bottom-right notification stack, completion/error toasts resolve through that stack, and failed requests trigger a silent inbox reload.
15. **Decision index status enforcement** - implemented in `POST /api/inbox/decide`: after a successful source decision, stale or failed source sync is repaired by forcing the matching `inbox_items` row out of `pending`, with route-level regression coverage for project dismiss, clarified approve, sync failure, and calendar accept.
16. **Audit packet readiness** - add a future `project_audits` artifact only when the Complete Project Audit family is implemented. Do not overload `project_suggestions.kind` for full reports.
17. **Signal readiness work** - before signals enter Inbox:
    - profile fragments need an apply endpoint that performs the same merge work as the worker path: append/merge into a profile document, create a version, create source mapping, mark accepted, regenerate summary;
    - profile reject maps to dismissed;
    - contact Inbox includes only `user_contact_merge_candidates`, not raw observations, and must preserve sensitive-value exposure warnings.
18. **Lifecycle** - add expiration for stale source rows and blocked/error handling. Snooze is future work unless a real re-surface model is implemented.

Out of scope:

- Daily brief next-step snippets.
- Context snapshot cache updates.
- A second global navigation destination named "Inbox" before Work Panel coexistence is resolved.

---

## 6. Locked Decisions And Remaining Questions

Locked:

1. **Architecture:** Option B with explicit source adapters now; converge to Option C over time.
2. **Source truth:** source tables own truth; `inbox_items` is a repairable denormalized index.
3. **Boundary:** only reviewable data mutations enter the Inbox. Informational/orientation artifacts stay out.
4. **Granularity:** one card = one review artifact. Only `agent_run` cards are guaranteed to be one true `ChangeSet` in v1.
5. **Core v1 scope:** agent-run proposals, chat-capture proposals, project-loop suggestions, and calendar suggestions.
6. **Signals are gated:** profile/contact review enters only when the relevant source adapter has safe apply/reject semantics and sensitive-data UI.
7. **Snooze:** no generic Snooze in v1. Existing source-specific snooze/defer states must not be presented as generic inbox snooze without `snoozed_until` semantics.
8. **Work Panel:** remains the agent-run history/control surface. AI Inbox is the mutation-review queue.
9. **Loop hierarchy:** `project_loop_runs` is the parent review event; `project_suggestions` are actionable findings; `inbox_items` indexes only reviewable items.
10. **Audit shape:** Complete Project Audit should become a durable audit/report artifact, not merely another `project_suggestions.kind`.
11. **Visible decision actions:** inbox cards that request a change expose `Accept`, `Dismiss`, and `Chat`. Fast accept/dismiss remains deterministic. Project-suggestion clarified decisions remain supported by the API, but inline note capture is not part of the current inbox UI.

Closed from audit:

- Profile/contact storage names are `profile_fragments`, `user_contact_observations`, and `user_contact_merge_candidates`, not `profile_signals` / `contact_signals`.
- Calendar suggestions use live service behavior (`pending -> accepted|rejected|deferred`) rather than stale database-doc status names.
- The project tab list should be based on current `EntityTabStrip`; there is no Activity tab to sit beside.
- Project Loops should not be forced wholesale into true `ChangeSet`s. Mutating child suggestions can converge toward `ChangeSet`s later; audit/report packets should remain report artifacts.

Still open:

1. **Notification handoff:** once Inbox exists, should proposal toasts deep-link to Inbox by default, or keep opening inline review modals?
2. **Account/global grouping label:** should global items be grouped as "Account", "Profile", or "Personal data"?
3. **First mutation convergence target:** should Calendar Analysis migrate to true `ChangeSet`s before mutating Project Loop suggestions, since calendar accept/reject is a narrower create-project/tasks flow?

---

## 7. Suggested Phasing

- **Phase 0 - Read model and adapter contract:** implemented for v1 sources. Continue hardening source-action safety for calendar suggestions before broad batch actions.
- **Phase 1 - Project Inbox tab:** implemented for project-scoped pending items with source-adapter approve/reject, project-loop brief, grouped sections, dismissal feedback, and safe batch apply. The legacy `ProjectSuggestionsPanel` has been removed.
- **Phase 2 - Dashboard Inbox triage:** implemented as a dashboard card/modal with project/account grouping; still needs smoke-test evidence and any final interaction polish.
- **Phase 3 - Signals:** add profile-fragment apply/dismiss and contact-merge candidate cards after sensitive-data UX is ready.
- **Phase 4 - Run/report alignment:** loop-run parent context is now visible across Project Inbox and Dashboard Inbox. Add `project_audits` only when the Complete Project Audit family ships.
- **Phase 5 - Inbox Chat and project-suggestion clarification:** seeded Chat is implemented for writable `project_suggestion` items and user-owned `agent_run`/`calendar_suggestion` items; project-suggestion clarified decisions, recurrence prevention, shared `Accept`/`Dismiss`/`Chat` controls, notification-stack decision handoff, and conservative chat-origin resolution are implemented. Remaining follow-up: add explicit in-chat controls if we want users to resolve/dismiss without requiring a successful data mutation.
- **Phase 6 - Mutation convergence:** migrate narrow mutating producers toward true `ChangeSet`s where per-change review is valuable. Calendar Analysis is the likely first candidate; mutating Project Loop suggestions can follow. Audit packets should not become `ChangeSet`s.

---

## 8. 2026-06-26 Alignment Next Steps

The codebase is directionally aligned: `inbox_items` is the review queue, `project_suggestions` feed it, `project_loop_runs.brief` provides parent context, project suggestions can open seeded discussion chats, and project-suggestion clarified decisions now delegate to linked child agent runs. The remaining work is stabilization, legacy cleanup, chat-resolution policy, calendar/source safety hardening, mutation convergence, and the separate audit artifact track.

Recommended sequence:

1. **Verify and stabilize v1.**
    - Apply `20260624010000_ai_inbox_items.sql`, `20260625000000_project_loop_run_brief.sql`, `20260626000000_project_suggestion_chat_link.sql`, and `20260626010000_clarified_project_suggestion_decisions.sql` in target environments.
    - Run `docs/testing/MANUAL_AI_INBOX_SMOKE_TESTS_2026-06-25.md`.
    - 2026-06-28 cleanup: removed the unmounted legacy `ProjectSuggestionsPanel.svelte`; `ProjectInboxPanel` is the only project-loop review panel.

2. **Make loop parent context first-class.**
    - Add `run_id` / parent review metadata to project-suggestion inbox payloads or a small grouped response shape.
    - Let Project Inbox and Dashboard Inbox show which review run produced each project suggestion.
    - Avoid loading loop runs through a parallel endpoint when the data is only needed to explain pending inbox items.
    - 2026-06-26 first slice: `GET /api/inbox?include_payload=1` returns `source_context.project_loop_run` for `project_suggestion` items, and both Project Inbox and Dashboard Inbox render the originating review run label.

3. **Chat about inbox items.**
    - 2026-06-26 first slice: shared proposal context utilities live in `@buildos/shared-agent-ops/proposal-context`.
    - `POST /api/onto/projects/[id]/suggestions/[suggestion_id]/chat-session` creates/reuses a project-scoped `chat_sessions` row, inserts an assistant seed message, links `project_suggestions.chat_session_id`, and cleans up on creation failure.
    - 2026-06-28 update: `POST /api/inbox/[item_id]/chat-session` is the UI-facing route. It creates/reuses a seeded `chat_sessions` row from the inbox item, enforces the same ownership/project-write access rules as decisions, preserves the full project-suggestion proposal context, and adds compact seed context for `agent_run` and `calendar_suggestion` cards.
    - Project Inbox and Dashboard Inbox show `Chat` for decidable items and open `AgentChatModal` with `initialChatSessionId`.
    - 2026-06-28 update: `POST /api/inbox/[item_id]/resolve-from-chat` lets inbox-origin Chat close resolve the source item when the chat reports successful data mutations. Discussion-only chats leave the inbox card pending.
        - `project_suggestion`: pending source row becomes `applied` with `result.handled_in_chat = true`, then the index row is synced.
        - `agent_run`: the original proposal is rejected after replacement chat writes, then the index row is synced.
        - `calendar_suggestion`: pending source row becomes `accepted` only when chat mutations include a created/affected project id.

4. **Harden clarified decisions and shared controls.**
    - Implemented 2026-06-26: approve/dismiss-with-clarification dispatches linked child `agent_runs`; worker finalize reconciles the source suggestion; prior decided suggestions/user feedback enter project-loop context and prompts; shared `InboxDecisionControls` is wired into both inbox surfaces.
    - Implemented 2026-06-28: visible inbox controls are normalized to `Accept`, `Dismiss`, and `Chat`; guidance now starts in Chat rather than an inline note field.
    - Next: smoke-test Chat for project suggestions, agent-run change sets, and calendar suggestions; smoke-test queue-full degraded fallback, stale-approval superseding, and the `delegated -> applied|rejected|failed` reconciliation path in a migrated environment.
    - Decide whether explicit discussion-only Chat outcomes should support "mark handled" or "dismiss from chat" without a data mutation.

5. **Clarify informational vs mutating findings.**
    - Keep no-op drift findings as acknowledgement-style `project_suggestion` rows.
    - Keep mutating findings as whole-suggestion decisions until true per-change review is worth the migration.
    - Do not treat every report insight as an inbox item.

6. **Design the Complete Project Audit artifact.**
    - Add a short product/data design for `project_audits` before writing migrations.
    - Link each audit to `project_loop_runs` when generated by the loop worker.
    - Let the audit produce child `project_suggestions` only for concrete follow-up actions.

7. **Replace naive burst triggering.**
    - Current burst hooks queue review work directly with a cooldown.
    - Move toward the threshold model in `docs/research/project-review-loop-audit-suggestion-families-2026-06-25.md`: eligibility baseline, project size class, weighted burst score, quiet period, and cooldown.

8. **Choose the first true `ChangeSet` migration.**
    - Prefer Calendar Analysis first because it is a bounded create-project/tasks flow.
    - Revisit mutating Project Loop suggestions after audit packets and parent run context are clean.
