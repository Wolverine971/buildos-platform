# AI Inbox - Design / Shaping Doc

**Date:** 2026-06-24
**Status:** Shaping, audit-revised 2026-06-24
**Author:** DJ + Claude + Codex audit pass
**Related:** `HANDOFF_2026-06-19.md` (Agent Work / change sets), `PROJECT_START_HERE_DOC_DESIGN_2026-06-23.md`, `ProjectSuggestionsPanel.svelte`, project-loops

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

| Producer                                    | Real storage                                                                                                                              | Approval shape today                                                                                                                                  | Surfaced today                                                                           | Inbox handling                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Agent Runs** (durable runs, review mode)  | `agent_runs.change_set`, `status='proposal_ready'`                                                                                        | True `ChangeSet`; per-change approve/reject                                                                                                           | Notification stack, Work Panel, `ChangeSetReview`                                        | Primary; direct `agent_run` source adapter                                                |
| **Chat-close capture** (Start Here updates) | Inserts an `agent_runs` row with `trigger='chat'`, `status='proposal_ready'`                                                              | True single-change `ChangeSet`                                                                                                                        | Work Panel / agent-run surfaces, but not project Inbox                                   | Primary; same `agent_run` adapter                                                         |
| **Project Loops**                           | `project_suggestions`, `status='pending'`; feature-gated by `PROJECT_LOOPS_ENABLED`                                                       | Whole-suggestion Apply/Dismiss; replays `operations[]` through `ChatToolExecutor`; freshness guard supersedes stale items; no per-operation decisions | Project Inbox (`ProjectInboxPanel`), with legacy `ProjectSuggestionsPanel` still present | Primary through `project_suggestion` adapter; not a true `ChangeSet` until Option C       |
| **Calendar Analysis**                       | `calendar_project_suggestions`, initially `status='pending'`                                                                              | Accept creates a project/tasks; reject marks rejected; current `defer` route maps to reject-with-reason and is not real snooze                        | Calendar-analysis notification modal                                                     | Primary through `calendar_suggestion` adapter; not a true `ChangeSet` until Option C      |
| **Daily Brief next-steps**                  | Auto-writes `onto_projects.next_step_*`                                                                                                   | No approval decision; orientation output                                                                                                              | Email/SMS/in-app brief                                                                   | Out of scope; not an inbox item                                                           |
| **Profile fragments**                       | `profile_fragments`, especially `status='needs_review'`                                                                                   | API can list and status-flip fragments, but there is no safe user-triggered merge/apply endpoint; worker merge only processes `pending` fragments     | No dedicated review UI                                                                   | Gated. Do not include until a real profile-fragment apply/dismiss handler exists          |
| **Contact merge candidates**                | `user_contact_merge_candidates`, `status='pending'`; raw `user_contact_observations` auto-resolve to applied/needs_confirmation/dismissed | Existing API supports `confirmed_merge`, `rejected`, `snoozed`, with sensitive-value exposure gates                                                   | Contact candidate API; no unified Inbox UI                                               | Include only merge candidates, not raw observations; requires a sensitive-data-aware card |
| **Context Snapshot worker**                 | `project_context_snapshot` cache + Start Here managed regions                                                                             | Machine-owned cache refresh                                                                                                                           | n/a                                                                                      | Out of scope; never approvable                                                            |

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
- **ProjectSuggestionsPanel** is the current project-loop review UI. Project Inbox should replace this panel for project-loop items once the project-scoped inbox tab ships.
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
3. **All decision endpoints mutate the source first, then update the index.** Never mark an inbox item decided before the source action succeeds.
4. **Every source adapter owns a status mapper.**
    - `agent_run`: `proposal_ready` + pending change set => `pending`; completed/partial with non-pending change set => `decided`; failed/cancelled => `blocked` or `decided` depending on proposal state.
    - `project_suggestion`: `pending` => `pending`; `applied|rejected|superseded` => `decided`; `failed` => `blocked`.
    - `calendar_suggestion`: `pending` => `pending`; `accepted|rejected` => `decided`; current `deferred` is not generic snooze unless it has `snoozed_until`.
    - `profile_fragment`: `needs_review` => `pending`; `accepted|dismissed` => `decided`, but only after a real apply/dismiss handler exists.
    - `contact_merge_candidate`: `pending` => `pending`; `confirmed_merge|rejected` => `decided`; `snoozed` => `snoozed` if a re-surface rule exists.
5. **Decision handlers must be idempotent and claim source rows.**
    - `agent_run` already claims `proposal_ready -> running`.
    - `project_suggestion` needs an atomic source claim before replaying operations, using an allowed source status such as `approved` or a new explicit in-progress status.
    - `calendar_suggestion` needs an atomic pending claim before instantiating a project/tasks; add an allowed in-progress/claim status if needed.
    - Signal handlers need equivalent source-state checks before merge/apply.

### Option C - Everything Emits Agent-Run Change Sets

Make Project Loops, Calendar Analysis, and signal review producers emit `agent_runs` review runs so every item uses one payload shape and one commit path.

This is the cleanest long-term target, but it is too much migration for the first inbox surface.

### Decision

**Option B now -> C later.** Build `inbox_items` as an index with explicit source adapters, not as a false promise that every source is already a `ChangeSet`. Keep `agent_runs.change_set` + `commitChangeSet()` as the canonical action path for agent-run proposals. Migrate other producers toward true change sets after the unified surface is usable.

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
- It replaces `ProjectSuggestionsPanel` for `project_suggestion` items once shipped.
- It should not show account/global profile/contact items unless a source adapter can confidently associate them with the project.

### Work Panel Coexistence

Work Panel remains the durable agent-run history/control surface. AI Inbox is the durable mutation-review queue.

Agent-run inbox cards can deep-link/open the same rich run modal used by Work Panel. Avoid duplicating run-history browsing inside AI Inbox.

### Notification Stack

The notification stack stays the transient toast surface. When a producer creates a review item and has a notification channel, the toast should either:

- deep-link into the relevant Inbox item, or
- open the existing inline review modal as a fallback.

Do not require every producer to create duplicate toasts before it is wired into Inbox. The durable queue is the source of pending state.

### Card Atom

**One card = one review artifact, not necessarily one `ChangeSet`.**

Card variants:

- `agent_run`: one true `ChangeSet`, expandable to per-change controls and diffs.
- `project_suggestion`: one project-loop suggestion, showing operation count, evidence, preview, risk tier, and whole-item Apply/Dismiss.
- `calendar_suggestion`: one suggested project/task creation, showing calendar evidence, project/task preview, and whole-item Accept/Reject.
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
3. **Safety fixes before unified actions** - `project_suggestions` now claims `pending -> approved -> applied|failed`, supersedes stale approvals before replay, and treats already-decided responses idempotently. `calendar_project_suggestions` still need equivalent claim verification before broader batching.
4. **Producer wiring** - write/sync index rows when:
    - agent runs reach `proposal_ready`,
    - chat-close capture inserts its proposal run,
    - project-loop suggestions are inserted,
    - calendar suggestions are inserted,
    - later signal adapters create reviewable rows.
5. **Read endpoints** - `GET /api/inbox` with filters for project/status/source/group and `GET /api/inbox/count`; both reconcile stale index rows against source state.
6. **Decision endpoint** - `POST /api/inbox/decide` dispatches by `source_type`, mutates source first, then syncs the index. It must return source-specific result detail.
7. **Card components** - shared inbox card shell plus source-specific payload renderers. Reuse `ChangeSetReview`/`DocumentProposalDiff` only for true agent-run change sets.
8. **Project Inbox tab** - shipped in `EntityTabStrip` with project-loop brief, grouped sections, feedback controls, and safe batch apply. Retire `ProjectSuggestionsPanel` once no legacy mount sites depend on it.
9. **Dashboard triage modal** - reuse the Overdue Task Triage navigation/progress chrome for cross-project items and account/global grouping.
10. **Signal readiness work** - before signals enter Inbox:
    - profile fragments need an apply endpoint that performs the same merge work as the worker path: append/merge into a profile document, create a version, create source mapping, mark accepted, regenerate summary;
    - profile reject maps to dismissed;
    - contact Inbox includes only `user_contact_merge_candidates`, not raw observations, and must preserve sensitive-value exposure warnings.
11. **Lifecycle** - add expiration for stale source rows and blocked/error handling. Snooze is future work unless a real re-surface model is implemented.

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

Closed from audit:

- Profile/contact storage names are `profile_fragments`, `user_contact_observations`, and `user_contact_merge_candidates`, not `profile_signals` / `contact_signals`.
- Calendar suggestions use live service behavior (`pending -> accepted|rejected|deferred`) rather than stale database-doc status names.
- The project tab list should be based on current `EntityTabStrip`; there is no Activity tab to sit beside.

Still open:

1. **Notification handoff:** once Inbox exists, should proposal toasts deep-link to Inbox by default, or keep opening inline review modals?
2. **Account/global grouping label:** should global items be grouped as "Account", "Profile", or "Personal data"?
3. **First convergence target:** should Project Loops or Calendar Analysis be migrated to true `ChangeSet`s first?

---

## 7. Suggested Phasing

- **Phase 0 - Read model and adapter contract:** implemented for v1 sources. Continue hardening source-action safety for calendar suggestions before broad batch actions.
- **Phase 1 - Project Inbox tab:** implemented for project-scoped pending items with source-adapter approve/reject, project-loop brief, grouped sections, dismissal feedback, and safe batch apply. `ProjectSuggestionsPanel` remains as legacy code pending removal.
- **Phase 2 - Dashboard Inbox triage:** add badge/widget, project navigator modal, account/global grouping, and batch progress.
- **Phase 3 - Signals:** add profile-fragment apply/dismiss and contact-merge candidate cards after sensitive-data UX is ready.
- **Phase 4 - Convergence:** migrate project-loop, calendar, and signal producers toward emitted `agent_runs` review runs / true `ChangeSet`s so the index increasingly points at one canonical payload shape.
