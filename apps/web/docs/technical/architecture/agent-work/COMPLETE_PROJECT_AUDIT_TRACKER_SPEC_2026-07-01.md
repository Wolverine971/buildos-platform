<!-- apps/web/docs/technical/architecture/agent-work/COMPLETE_PROJECT_AUDIT_TRACKER_SPEC_2026-07-01.md -->

# SPEC - Complete Project Audit Tracker

**Status:** Draft product/architecture spec. No migration has been written yet.
**Date:** 2026-07-01
**Owner:** DJ + Codex
**Related:**

- `AI_INBOX_DESIGN_2026-06-24.md`
- `AI_INBOX_CLARIFIED_DECISIONS_SPEC_2026-06-26.md`
- `docs/research/project-review-loop-audit-suggestion-families-2026-06-25.md`
- `tasker/04-project-review-loops.md`

---

## 1. Purpose

The Complete Project Audit Tracker is the durable system for deciding when a
project deserves a full consultant-style review, generating that review, storing
it as a readable audit packet, and tracking the follow-up items that come out of
it.

This is different from the current light project loop.

- The light loop produces small reviewable findings, stored as
  `project_suggestions`, then indexed into `inbox_items`.
- The complete audit produces a durable report packet, stored as
  `project_audits`, which can optionally generate child `project_suggestions`
  for concrete follow-up actions.

The product promise:

> BuildOS periodically reviews meaningful projects like an outside consultant,
> but only when there is enough project substance or enough change to make that
> review worth the user's attention.

---

## 2. Current Grounding

Current implemented substrate:

- `project_loop_runs` is the parent review event for project-loop work.
- `project_suggestions` stores actionable findings from a loop run.
- `inbox_items` is a repairable decision index across sources.
- AI Inbox Chat can open context-rich conversations for project suggestions,
  agent runs, and calendar suggestions.
- Burst-trigger hardening now gates light loop review work using current
  mutation metadata plus recent `onto_project_logs` activity.

Current gap:

- There is no durable `project_audits` artifact.
- There is no audit trigger evaluator that records why an audit was queued or
  skipped.
- There is no UI that tracks audit health, audit history, unresolved audit
  recommendations, or next eligible audit timing.
- The current light loop cannot answer "is this whole project on track?" in a
  report-quality way.

---

## 3. Goals

1. Store complete audit packets as first-class, durable project artifacts.
2. Track audit lifecycle: candidate, queued, running, ready, reviewed,
   superseded, failed, archived.
3. Decide audit eligibility with explicit guardrails:
   maturity baseline, size class, scheduled cadence, burst score, quiet period,
   cooldown, and active-run dedupe.
4. Make audit trigger decisions explainable:
   "scheduled", "burst", "critical change", "manual", or "skipped because...".
5. Let audits produce child review items without turning the whole audit into a
   mutation proposal.
6. Show audit history and current project health in a project-level tracker UI.
7. Let the user chat about an audit with the correct project, evidence, and
   audit packet context loaded.
8. Keep the AI Inbox clean: only actionable follow-ups or explicit review
   prompts become inbox cards.

---

## 4. Non-Goals

- Do not replace the existing light project loop families.
- Do not model a full audit as only another `project_suggestions.kind`.
- Do not force audit packets through `agent_runs.change_set`.
- Do not create approval buttons for every audit paragraph.
- Do not silently mutate project data from an audit.
- Do not run full audits for tiny or immature projects.
- Do not implement per-project user preferences in the first migration unless
  the trigger defaults prove too noisy.

---

## 5. Product Model

### 5.1 Artifact hierarchy

```text
project_loop_runs
  -> project_audits?          // durable report packet
       -> project_suggestions[] // optional concrete follow-up items
            -> inbox_items[]     // decision queue
```

`project_loop_runs` answers: "BuildOS reviewed this project at this time."

`project_audits` answers: "Here is the consultant-style report from that
review."

`project_suggestions` answers: "Here is a specific thing you can accept,
dismiss, or chat about."

`inbox_items` answers: "Here is what needs the user's attention now."

### 5.2 Audit packet contents

Each audit packet should include:

- Delivery confidence: `green`, `yellow`, `red`, or `unknown`.
- Project thesis: what the project appears to be trying to accomplish.
- Executive summary: top project health readout.
- What changed since the last audit.
- Health dimensions with ratings, evidence, uncertainty, and recommendations.
- Risks, contradictions, open questions, and decision points.
- Evidence appendix with referenced docs, tasks, goals, milestones, risks,
  events, and activity logs.
- Proposed next actions.
- Child suggestion links for concrete follow-up actions.

### 5.3 Audit dimensions

Version 1 should use these dimensions:

| Key                     | Name                      | Question                                                                        |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| `intent_clarity`        | Intent clarity            | Is the project goal clear, current, and actionable?                             |
| `documentation_quality` | Documentation quality     | Could a new collaborator understand the project from the docs?                  |
| `plan_integrity`        | Plan integrity            | Do goals, docs, tasks, milestones, and dates line up?                           |
| `execution_health`      | Execution health          | Is active work moving forward without excessive WIP or stale tasks?             |
| `drift_scope_control`   | Drift and scope control   | Has recent work changed the direction or expanded scope without acknowledgment? |
| `risk_decision_quality` | Risk and decision quality | Are risks, blockers, and important decisions explicit?                          |
| `dependency_readiness`  | Dependency readiness      | Are stakeholders, handoffs, dependencies, and calendar commitments visible?     |
| `evidence_freshness`    | Evidence freshness        | Which conclusions rely on stale or weak evidence?                               |

Dimension ratings should be:

- `green`: healthy enough, no immediate action.
- `yellow`: needs attention or clarification.
- `red`: material risk or contradiction.
- `unknown`: insufficient evidence.

Every non-green dimension must cite evidence or state why evidence is missing.

---

## 6. Trigger Model

The tracker uses two related but separate trigger systems:

1. **Light loop trigger:** already exists. It keeps day-to-day hygiene running.
2. **Complete audit trigger:** future work. It runs only when a full audit is
   valuable.

### 6.1 Trigger reasons

Audit trigger reasons:

- `manual`: user explicitly requests a complete audit.
- `scheduled`: cadence check, normally bi-weekly for eligible medium/large
  projects with meaningful activity.
- `burst`: enough recent change has accumulated that the project model may be
  stale.
- `critical_change`: major changes justify bypassing some normal timing rules.

Current code note: `ProjectLoopTriggerReason` is currently
`'end_of_day' | 'burst' | 'manual'`. Implementing complete audits should widen
the type and database vocabulary to support `scheduled` and `critical_change`,
or map `scheduled` to existing `end_of_day` only as a temporary compatibility
bridge.

### 6.2 Gate 1 - eligibility baseline

A project is eligible for a complete audit only when it has enough substance.

Minimum hard gates:

- Project is active or planning.
- Project is at least 7 days old, unless manually requested.
- Project has at least 2 distinct activity days, unless manually requested.
- Project has at least 1 goal or a substantial description.

Content threshold:

Run a complete audit only if the project meets at least 3 of these 5 conditions:

- At least 5 active documents, or at least 1 substantial document over roughly
  1,500 words.
- At least 5 non-deleted tasks.
- At least 2 goals, milestones, or explicit success criteria.
- At least 1 dated commitment: due date, milestone, calendar event, or future
  scheduled task.
- At least 10 total project entities across docs, tasks, goals, milestones,
  risks, plans, and events.

If the project fails this gate, record a skipped trigger evaluation and run only
the light review families.

### 6.3 Gate 2 - project size class

Size class controls cadence and burst threshold.

| Class            | Rule of thumb                                                  | Scheduled audit         | Burst audit                                    |
| ---------------- | -------------------------------------------------------------- | ----------------------- | ---------------------------------------------- |
| `small_eligible` | 5-14 entities or thin docs with real tasks                     | Manual only by default  | Major burst only                               |
| `medium`         | 15-39 entities or multiple docs/goals/tasks                    | Every 14 days if active | 16+ points / 72h or 12 changed entities / 7d   |
| `large`          | 40+ entities, 15+ tasks, 15+ docs, or 14+ day forecast         | Every 14 days if active | 24+ points / 7d or 15% active entities touched |
| `strategic`      | major deadline, explicit risks, high task volume, dependencies | Every 14 days if active | Lower threshold when critical changes occur    |

### 6.4 Gate 3 - scheduled audit

Queue a scheduled audit when:

- Project is eligible.
- Project size is `medium`, `large`, or `strategic`.
- Last complete audit finished at least 14 days ago.
- There has been meaningful activity since the last audit.
- No complete audit is currently queued or running.

Meaningful activity:

- Medium: at least 3 changed entities since last audit, or 1 major change.
- Large/strategic: at least 6 changed entities since last audit, or 1 major
  change.

Skip a scheduled audit when:

- No meaningful activity happened since the last audit.
- The latest audit has unresolved high-priority recommendations and no new
  evidence.
- Project is paused, archived, deleted, inactive, or below baseline.
- The likely report would repeat the same findings.

### 6.5 Gate 4 - burst audit

Burst score should use rolling project activity, not only the current mutation.

Suggested event weights:

| Event                                                  | Points |
| ------------------------------------------------------ | -----: |
| Project name, description, scope, or state changed     |      5 |
| Goal created, deleted, or materially changed           |      5 |
| Milestone/date moved by more than 7 days               |      5 |
| Document created                                       |      2 |
| Substantial document edit                              |      3 |
| Document archived/deleted/restored                     |      4 |
| Document tree reorganization                           |      3 |
| Task created                                           |      1 |
| Task state changed                                     |      1 |
| Task due/start date changed                            |      2 |
| Task deleted/restored                                  |      3 |
| Risk created/escalated                                 |      4 |
| Calendar event added/changed for project-critical work |      2 |

Burst thresholds:

- Small eligible: 10+ points within 72 hours and at least 25% of known entities
  touched.
- Medium: 16+ points within 72 hours, or 12+ changed entities within 7 days.
- Large: 24+ points within 7 days, or 15% of active entities touched, or at
  least 5 documents and 8 tasks changed within 7 days.
- Strategic: large threshold, plus critical-change override.

Critical-change override:

- Queue a complete audit early if 2 or more major changes happen within 72
  hours.
- Major changes include goal rewrite, scope rewrite, central document archive,
  major milestone movement, or broad task status transition.

### 6.6 Quiet period and cooldown

Quiet period:

- Do not generate the audit during the change burst.
- Set `quiet_until` when a burst crosses threshold.
- Default quiet period: 2 hours after the last major mutation.
- For strategic projects with major deadlines, allow shorter quiet period but
  preserve a visible reason.

Cooldown:

- Do not run another complete audit within 7 days unless
  `critical_change` fires.
- If cooldown blocks a full audit, keep the light loop available.

### 6.7 Trigger evaluation result

Every scheduler pass should produce one of:

- `queued`: complete audit will run.
- `deferred_quiet_period`: threshold crossed, waiting for quiet period.
- `skipped_ineligible`: project below baseline.
- `skipped_no_activity`: no meaningful change since last audit.
- `skipped_cooldown`: last full audit is too recent.
- `skipped_active_run`: audit already queued/running.
- `skipped_duplicate`: expected audit would repeat current unresolved findings.
- `manual_required`: project is small but eligible, should only audit on request.

These evaluations should be persisted so the tracker can explain why there is
or is not a fresh audit.

---

## 7. Data Model

### 7.1 `project_audits`

First-class audit packet table.

```ts
interface ProjectAudit {
	id: string;
	project_id: string;
	user_id: string;

	// Execution linkage.
	loop_run_id: string | null;
	chat_session_id: string | null;

	// Lifecycle.
	status: 'queued' | 'running' | 'ready' | 'reviewed' | 'superseded' | 'archived' | 'failed';
	trigger_reason: 'scheduled' | 'burst' | 'critical_change' | 'manual';
	audit_depth: 'standard' | 'deep';

	// Tracker fields.
	delivery_confidence: 'green' | 'yellow' | 'red' | 'unknown';
	project_size_class: 'small_eligible' | 'medium' | 'large' | 'strategic';
	project_thesis: string | null;
	summary: string;
	top_findings: Json; // ordered array
	top_actions: Json; // ordered array

	// Report body.
	change_summary: Json;
	dimensions: Json; // ProjectAuditDimension[]
	risks: Json;
	open_questions: Json;
	evidence_refs: Json;
	recommendations: Json;

	// Follow-up tracking.
	generated_suggestion_count: number;
	unresolved_suggestion_count: number;

	// Trigger and reproducibility metadata.
	trigger_snapshot: Json;
	project_snapshot_fingerprint: string | null;
	model_used: string | null;
	cost_usd: number | null;
	error_message: string | null;

	created_at: string;
	started_at: string | null;
	finished_at: string | null;
	reviewed_at: string | null;
	archived_at: string | null;
	superseded_by: string | null;
	updated_at: string;
}
```

Notes:

- `dimensions`, `evidence_refs`, and `recommendations` can be JSON in V1 to
  avoid over-normalizing early.
- `loop_run_id` should reference `project_loop_runs.id` when generated by the
  project-loop worker. Manual audits may still create a loop run for consistent
  worker tracking.
- `chat_session_id` should be a project-scoped chat session used when the user
  clicks Chat about the audit.
- `superseded_by` lets the UI show that a newer audit has replaced this report.

### 7.2 `project_audit_trigger_evaluations`

Persist trigger decisions and skips.

```ts
interface ProjectAuditTriggerEvaluation {
	id: string;
	project_id: string;
	user_id: string;

	evaluated_at: string;
	decision:
		| 'queued'
		| 'deferred_quiet_period'
		| 'skipped_ineligible'
		| 'skipped_no_activity'
		| 'skipped_cooldown'
		| 'skipped_active_run'
		| 'skipped_duplicate'
		| 'manual_required';

	trigger_reason: 'scheduled' | 'burst' | 'critical_change' | 'manual';
	eligible: boolean;
	project_size_class: 'below_baseline' | 'small_eligible' | 'medium' | 'large' | 'strategic';

	maturity_snapshot: Json;
	burst_score: number | null;
	changed_entity_count: number | null;
	major_change_count: number | null;
	last_audit_id: string | null;
	quiet_until: string | null;
	cooldown_until: string | null;

	reason_summary: string;
	created_audit_id: string | null;
	created_loop_run_id: string | null;
	created_at: string;
}
```

This table powers the tracker states:

- "Audit ready"
- "Next scheduled audit in 6 days"
- "Audit deferred until activity quiets down"
- "Project not ready for a complete audit yet"
- "Skipped because nothing meaningful changed since last audit"

### 7.3 `project_audit_suggestions`

Link table between audit packets and child action items.

```ts
interface ProjectAuditSuggestion {
	id: string;
	audit_id: string;
	suggestion_id: string;
	role: 'recommended_action' | 'risk_follow_up' | 'cleanup' | 'decision_point';
	created_at: string;
}
```

This lets audit reports remain durable even after child suggestions are applied,
dismissed, delegated, or superseded.

### 7.4 Inbox indexing

Add future `inbox_items.source_type = 'project_audit'` only for explicit audit
review cards, not for every audit dimension.

Suggested audit inbox card:

- Title: `Project audit ready: <project name>`
- Summary: delivery confidence, top 1-2 findings, follow-up count.
- Actions: `Open`, `Chat`, optional `Mark reviewed`.
- No `Accept` button unless there is a specific review-level action.

Concrete mutations still become `project_suggestion` or true `ChangeSet` items.

---

## 8. Worker And Generation Flow

### 8.1 Queueing

The trigger evaluator should enqueue a complete audit by creating:

1. `project_loop_runs` row with audit trigger metadata.
2. `project_audits` row with `status = 'queued'`.
3. Queue job for the worker.
4. `project_audit_trigger_evaluations` row linking to both ids.

The worker can share the existing `buildos_project_loop` queue type initially if
metadata identifies `mode: 'complete_audit'`, but a dedicated job type
`buildos_project_audit` is cleaner once the prompt and cost profile diverge.

### 8.2 Snapshot loading

Complete audits need broader context than light loops:

- Project record and Start Here/current summary.
- Active docs, archived docs summary, and doc tree.
- Goals, milestones, risks, plans, requirements.
- Tasks with state, owners, dates, age, blockers, and forecast horizon.
- Calendar commitments linked to project-critical work.
- Recent `onto_project_logs`.
- Prior audit summaries and unresolved recommendations.
- Prior dismissed/applied suggestions with feedback.
- Current open inbox items for the project.

Snapshot loader should return both:

- `llm_context`: compact prompt-ready context.
- `audit_evidence_index`: structured evidence refs with stable ids and display
  labels for UI.

### 8.3 Generation stages

The audit worker should run in stages:

1. **Load snapshot.**
2. **Compute deterministic metrics.**
   Entity counts, stale docs, WIP count, blocked count, changed entities,
   forecast horizon, unresolved audit recommendation count.
3. **Generate audit report.**
   LLM writes structured JSON matching the audit schema.
4. **Validate report.**
   Check required dimensions, evidence refs, rating vocabulary, and no invented
   entity ids.
5. **Generate optional child suggestions.**
   Only for concrete follow-up actions with clear target entities.
6. **Persist audit and suggestions.**
   Audit becomes `ready`; suggestions become pending `project_suggestions` and
   sync into `inbox_items`.
7. **Create or update audit chat session seed.**
   Chat seed should summarize the audit and include hidden evidence context in
   `agent_metadata`, not dump the full appendix into visible chat.

### 8.4 Cost and quality guardrails

Defaults:

- Standard audit cost cap: higher than light loop, for example `$1.50`.
- Deep audit cost cap: project-size dependent, for example `$3.00`.
- Max dimensions: 8.
- Max top findings: 5.
- Max child suggestions from one audit: 8.
- Evidence refs per dimension: 3-8.

Failure behavior:

- If generation fails validation, mark audit `failed` with `error_message`.
- If child suggestion generation fails, keep the audit `ready` and record
  `generated_suggestion_count = 0` plus a warning in metadata.
- Never block the report because a child suggestion inbox sync failed; repair
  jobs can backfill.

---

## 9. Tracker UI

### 9.1 Project-level tracker surface

Add a project-level "Audit" or "Health" surface that shows:

- Latest delivery confidence.
- Last audit date and trigger reason.
- Next scheduled audit eligibility.
- Current trigger state: ready, deferred, skipped, below baseline, cooldown.
- Top findings.
- Dimension matrix.
- Unresolved audit recommendations.
- Audit history.
- Manual "Run complete audit" action when allowed.

The tracker should explain absence:

- "This project is not ready for a complete audit yet."
- "Next complete audit is available after July 15, 2026."
- "Waiting for recent activity to settle before auditing."
- "No audit needed: no meaningful activity since last report."

### 9.2 Audit detail

Audit detail should show:

- Executive summary.
- Delivery confidence.
- What changed since last audit.
- Dimension table with rating, evidence, and recommendation.
- Risks and open questions.
- Follow-up suggestions and their current statuses.
- Evidence appendix with readable labels, not raw internal ids.
- Chat button.
- Mark reviewed / Archive actions.

### 9.3 AI Inbox relationship

AI Inbox should not be flooded by audit details.

Inbox cards should appear for:

- Audit ready for review, if user attention is desired.
- Child suggestions generated by the audit.
- Critical audit finding that requires explicit acknowledgement.

Inbox cards should not appear for:

- Every dimension.
- Every evidence citation.
- Audit skipped events.
- Low-risk report paragraphs.

### 9.4 Chat relationship

Clicking Chat from an audit should open a project-scoped agentic chat with:

- Project context.
- Audit summary and dimension ratings.
- Hidden evidence appendix and entity refs in `agent_metadata`.
- Child suggestion statuses.
- Trigger reason and "what changed" context.

Visible seed message should be concise:

```text
I reviewed the latest complete audit for <Project>.

Delivery confidence: Yellow
Main concern: execution plan and current docs are out of sync.
Follow-up items: 3 pending suggestions.

You can ask me to explain the evidence, compare this to the last audit, or turn
one recommendation into a concrete project change.
```

Raw ids, long evidence lists, and full JSON should stay hidden.

---

## 10. APIs And Services

Suggested service boundaries:

- `project-audit-trigger.service.ts`
    - `evaluateProjectAuditTrigger(projectId, userId, reasonHint)`
    - `recordProjectAuditTriggerEvaluation(...)`
    - `queueProjectAuditFromEvaluation(...)`

- `project-audit-snapshot.service.ts`
    - `loadProjectAuditSnapshot(projectId)`
    - `buildAuditEvidenceIndex(snapshot)`

- `project-audit-generation.service.ts`
    - `generateProjectAudit(snapshot, options)`
    - `validateProjectAuditDraft(draft, evidenceIndex)`
    - `buildProjectAuditSuggestions(auditDraft)`

- `project-audit-chat-session.service.ts`
    - `createOrReuseProjectAuditChatSession(auditId, userId)`
    - Uses the same visible/hidden proposal-context pattern as AI Inbox chat.

Suggested endpoints:

- `GET /api/onto/projects/[id]/audits`
    - List audit history and latest trigger evaluation.
- `GET /api/onto/projects/[id]/audits/latest`
    - Latest ready audit plus tracker state.
- `GET /api/onto/projects/[id]/audits/[audit_id]`
    - Full audit detail.
- `POST /api/onto/projects/[id]/audits/run`
    - Manual complete audit request.
- `POST /api/onto/projects/[id]/audits/[audit_id]/reviewed`
    - Mark reviewed.
- `POST /api/onto/projects/[id]/audits/[audit_id]/archive`
    - Archive audit packet.
- `POST /api/onto/projects/[id]/audits/[audit_id]/chat-session`
    - Open project-scoped chat about the audit.

Suggested scheduler:

- Daily scheduled job evaluates eligible active projects.
- Mutation/burst path records burst state, but full audit waits for quiet period.
- Manual path bypasses age/activity baseline but still records whether project
  was below baseline.

---

## 11. Permissions And Safety

Access:

- User must have project read access to view audit packet.
- User must have project write or owner-equivalent access to run a manual audit,
  mark reviewed, archive, or accept child suggestions.

Safety:

- Audits are reports, not writes.
- Child suggestions use existing project suggestion or ChangeSet approval paths.
- Evidence refs must resolve to accessible project entities.
- Audit prompts should include prior dismissed recommendations to avoid
  recurring unwanted advice.
- A superseded audit remains readable, but tracker defaults to latest ready
  audit.

Privacy:

- Do not expose raw calendar event ids in visible report or chat seed when a
  display label is available.
- Store evidence refs as internal ids plus sanitized display labels.
- Avoid copying full private document content into the audit packet unless the
  excerpt is necessary and bounded.

---

## 12. Phased Implementation Plan

### Phase 0 - Lock the contract

- Finalize `project_audits`, `project_audit_trigger_evaluations`, and
  `project_audit_suggestions` schema.
- Add shared types in `@buildos/shared-types`.
- Decide whether to widen `ProjectLoopTriggerReason` or introduce a separate
  `ProjectAuditTriggerReason`.

Exit criteria:

- Migration review complete.
- Types generated.
- No UI yet.

### Phase 1 - Tracker shell and manual audit

- Add audit list/latest/detail endpoints.
- Add manual run endpoint.
- Add worker mode that creates a basic audit packet without child suggestions.
- Add project-level tracker surface with latest audit and history.

Exit criteria:

- User can manually run an audit and read the packet.
- Chat can open from an audit with correct project/audit context.

### Phase 2 - Trigger evaluator

- Implement scheduled evaluation and persisted skip/queue decisions.
- Implement eligibility baseline and size classification.
- Implement complete-audit burst scoring with quiet period and cooldown.
- Show tracker explanations for skipped/deferred states.

Exit criteria:

- Daily evaluator records why each candidate project was or was not audited.
- Medium/large active projects can receive bi-weekly audits.
- Burst audits wait for quiet period.

### Phase 3 - Child suggestions and Inbox integration

- Generate bounded child `project_suggestions` from audit recommendations.
- Link suggestions through `project_audit_suggestions`.
- Sync child suggestions into `inbox_items`.
- Add optional `project_audit` inbox card for "audit ready".

Exit criteria:

- Audit report is readable as a packet.
- Concrete follow-up items appear as normal Accept/Dismiss/Chat cards.
- Audit detail shows child suggestion statuses.

### Phase 4 - Quality and recurrence

- Feed reviewed audit outcomes and dismissed child suggestions into future audit
  context.
- Add superseding logic when a new audit replaces old findings.
- Add duplicate/repeated-finding suppression.
- Add metrics: audits queued, skipped, read, reviewed, child suggestions applied.

Exit criteria:

- Audits stop repeating stale advice.
- Tracker explains unresolved recommendations and what changed.

### Phase 5 - Configuration

- Optional per-project audit appetite:
  `off`, `manual_only`, `normal`, `sensitive`.
- Optional user notification settings for audit-ready cards.
- Optional strategic project flag.

Exit criteria:

- Users can tune noisy or important projects without disabling the whole loop
  system.

---

## 13. Acceptance Criteria

The feature is "complete enough" when:

1. A meaningful project can produce a durable complete audit packet.
2. A small immature project is explicitly marked below baseline instead of being
   over-audited.
3. Medium/large active projects can receive bi-weekly scheduled audits.
4. Burst audits trigger only after meaningful clustered change and quiet period.
5. Audit packet is readable without opening AI Inbox.
6. Audit detail links to evidence with readable names.
7. Audit Chat opens with project and audit context loaded.
8. Concrete audit follow-ups become normal reviewable suggestions.
9. Dismissing or applying follow-ups influences future audits.
10. Tracker can explain why no audit is currently available.

---

## 14. Open Questions

1. Should `project_audits` be generated by the existing `buildos_project_loop`
   worker mode first, or should it get a dedicated `buildos_project_audit` queue
   job immediately?
2. Should manual audits bypass all maturity gates, or should they show a
   "thin audit" warning when the project is below baseline?
3. Should "Mark reviewed" be enough to remove an audit-ready inbox card, or
   should the user have to resolve high-risk follow-up suggestions separately?
4. Should audit packet excerpts include document snippets, or only entity refs
   plus summaries?
5. Should delivery confidence be one overall rating, or a composite from
   dimension ratings plus evidence freshness?
6. Should strategic/high-risk status be inferred, user-set, or both?
7. What product label is best: `Audit`, `Health Check`, `Project Review`, or
   `Project Assurance`?

---

## 15. Recommendation

Implement `project_audits` as a durable report artifact, not as another
`project_suggestions.kind`.

Use the first release to prove the manual audit and tracker experience. Then add
the trigger evaluator, because trigger quality only matters once the audit
packet is useful enough to read. Keep child mutations separate through
`project_suggestions` and future true `ChangeSet`s, so the audit can diagnose
the project without silently rewriting it.
