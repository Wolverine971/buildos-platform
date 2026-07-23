<!-- docs/product/thinking-loop-plan-of-attack-2026-07-07.md -->

# Thinking Loop Plan Of Attack

Date: 2026-07-07
Status: Execution roadmap
Source assessment: `docs/product/thinking-loop-capture-structure-surface-decide-update-2026-07-07.md`

**Terminology:** "Thinking loop" in this roadmap is the human/product feedback lifecycle.
The background capability is **Project Review**; one execution is a **project review pass**.
See `docs/product/PROJECT_REVIEW_TAXONOMY.md`.

## Operating Thesis

Complete one end-to-end loop before widening the product surface.

The loop to make undeniable first:

1. A new or returning user captures messy context.
2. BuildOS structures it into recognizable project memory.
3. BuildOS surfaces the right next thing at the right time.
4. The user makes a clear decision or gives an update.
5. The project changes, and the user can see what changed.

This means the next work should optimize for activation, visible receipts, and restart clarity before adding more agent capability or more surfaces.

## Phase 0 - Research Closure And Stabilization

Target: 1-3 days

Goal: avoid building the next layer on unclear activation definitions, unverified loop infrastructure, or an unstable worktree.

### Work

1. Finish the two adjacent product definitions.
    - Complete `tasker/22-activation-as-strategy-assessment.md`.
    - Complete `tasker/23-day-30-moat-context-compounding.md`.
    - Keep both focused on decisions that affect Phase 1-3 implementation.

2. Verify the already-built decision loop.
    - Finish the open AI Inbox / Project Inbox live smokes in `tasker/13-ai-inbox-verify-and-cleanup.md`.
    - Verify project audit packet flow from `tasker/14-complete-project-audit-build.md` before broadening Project Review exposure.
    - Confirm migrations and feature flags before any production enablement.

3. Define the minimum analytics baseline.
    - Audit the current analytics/event conventions before adding new events.
    - Decide whether loop telemetry lives in analytics, DB event tables, project activity, or a mix.
    - Define event names and properties for activation, capture, structure, surface, decide, update, and receipt viewed.

4. Lock the existing memory and receipt roles.
    - Start Here is the canonical durable project-orientation memory.
    - `onto_project_logs`, surfaced by `/today`, are the event/change receipt ledger.
    - Daily Brief is the re-entry and action surface that links the two.
    - Do not add a dedicated receipt abstraction unless a verified source cannot be represented by the existing project log contract.

### Exit Criteria

- Activation is defined beyond onboarding completion.
- Day-30 context compounding has a concrete product ladder.
- AI Inbox / Project Inbox smoke results are known.
- Project Review / audit flag and migration state are known.
- Memory and receipt roles are chosen.
- The first implementation phase can be scoped without re-litigating product goals.

## Phase 1 - First-Run Activation Loop

Target: week 1

Goal: make the first BuildOS experience prove "messy thinking -> structured project memory."

### Work

1. Reframe the current project-create chat as the first brain dump.
    - Reuse the working `AgentChatModal` project-create path; do not build a second parser.
    - Keep capture inside the onboarding activation flow and preserve the affected project ID.
    - Show progress while structure is generated.

2. Add a transformation and Start Here reveal.
    - Show what BuildOS understood, what it created, and what it will remember.
    - Show the created project, a bounded set of tasks/entities, current state, next move, and Start Here orientation.
    - Let the user open the project or adjust it in chat before moving on.

3. Gate non-explore activation.
    - Non-explore users should not finish onboarding with zero projects.
    - If an empty-workspace path remains, make it explicit and measurable.

4. Instrument the activation path.
    - `first_capture_started`
    - `first_capture_submitted`
    - `first_structure_generated`
    - `first_project_created`
    - `first_project_reviewed`
    - `first_project_opened`

### Exit Criteria

- A new non-explore user can enter a messy brain dump and land on a useful first project.
- The user sees what BuildOS changed before or immediately after entering the project.
- Zero-project onboarding completion is no longer an unintentional success path.
- The activation funnel is measurable.

## Phase 2 - Make Existing Project Memory And "What Changed" Visible

Target: week 2

Goal: make Update visible and trustworthy across the product.

### Work

1. Make the existing memory layers legible.
    - Start Here answers what the project is, what is true now, and what has been decided.
    - `onto_project_logs` answers what changed, who changed it, and where it landed.
    - Visibility: a compact Start Here snapshot on the project surface and `/today` for event-level "what changed."

2. Audit project-log coverage on the strongest existing mutation paths first.
    - Inbox decisions.
    - Agent chat mutation summaries.
    - Calendar suggestion accepts.
    - External agent writes.
    - Extend the shared activity log only where a real coverage gap is found.

3. Treat the shipped `/today` "What changed" surface as canonical.
    - Keep recent receipts grouped by project and actor-attributed.
    - Keep entity opening, receipt chat, and quick update attached to the feed.
    - Route users into it on return instead of building a second dashboard module.

### Exit Criteria

- A user can answer "what changed?" after an inbox accept, chat mutation, or calendar accept.
- Receipts are queryable by project and source.
- Dashboard or project page has a first visible changed-since-you-were-here surface.

## Phase 3 - Daily Brief Restart Loop

Target: week 2-3

Goal: turn the daily brief from a report into a re-entry and update surface.

### Work

1. Add brief actions.
    - Done.
    - Still open.
    - Not relevant.
    - Update project.
    - Chat.

2. Add brief-scoped quick update.
    - Prompt: "What changed since this plan?"
    - Route update into project state or a review proposal.
    - Tie the result back to the brief and affected project.

3. Add acted-on measurement.
    - Brief viewed.
    - Brief action clicked.
    - Brief chat started.
    - Brief update submitted.
    - Project mutation within 24 hours.

4. Reduce brief overload.
    - Keep the app-open ensure behavior.
    - Make the primary app brief shorter and project-linked.
    - Push long project detail into drilldowns.

### Exit Criteria

- Daily brief has a clear Decide/Update path.
- Users can update project memory from the brief without opening a blank chat.
- Brief acted-on rate is measurable.
- Brief-generated updates produce receipts.

## Phase 4 - Decision Rail Generalization

Target: week 3

Goal: make Decide a BuildOS-wide behavior without dumping everything into AI Inbox.

### Work

1. Define the loop-aware surface contract.
    - Informational item: read/open/update.
    - Review item: accept/dismiss/snooze/chat.
    - Capture item: structure/park/convert.
    - Applied item: receipt/open project.

2. Keep AI Inbox narrow.
    - Use it for pending decisions and reviewable mutations.
    - Do not route every informational insight into inbox.

3. Harden Project Review exposure.
    - Finish live smoke results.
    - Enable only after suggestion quality, stale suppression, and audit packet behavior are verified.
    - Track clarity delivered, not just run completion.

4. Standardize dismissal feedback.
    - Reuse AI Inbox dismissal memory where suggestions recur.
    - Add reason/note only where it affects future behavior.

### Exit Criteria

- New recommendations can be classified as informational, reviewable, capture, or receipt.
- Project Reviews are either enabled with evidence or explicitly held behind a flag with blockers.
- The product has one decision vocabulary across dashboard, project, brief, and inbox.

## Phase 5 - Capture Source Completion

Target: week 4

Goal: stop letting capture-only surfaces become dead ends.

### Work

1. Resolve raw brain dump semantics.
    - Either raw `onto_braindumps` become project update inputs, or they are clearly parked notes.
    - If parked, add status and next action.
    - If structured, route through proposal/update generation with source links.

2. Add voice-note conversion.
    - After transcription: convert to project update, attach to project, or park.
    - Show a receipt or parked-note state.
    - Measure transcript-to-update conversion.

3. Tighten calendar follow-up.
    - Track accepted suggestion outcomes after 7/30 days.
    - Surface stale calendar-created projects in daily/project review if they never become active.

### Exit Criteria

- Brain dumps and voice notes no longer silently end at stored content.
- Each capture source has a clear next state: structured, parked, or dismissed.
- Capture-to-structure conversion is measurable by source.

## Phase 6 - External Agents And Public Feedback

Target: week 5+

Goal: close the loop when context enters or changes from outside native BuildOS use.

### Work

1. External agent write receipts.
    - Every write gets actor, tool, scope, affected entities, and source session.
    - Low-risk direct writes create receipts.
    - Medium/high-risk writes create review items or require dry-run confirmation.

2. Public comment return path.
    - New public comment surfaces to owner.
    - Owner can convert comment to task, risk, doc note, or handled.
    - High-signal feedback can appear in "what changed" or Project Inbox depending on actionability.

3. Agent gateway trust polish.
    - Review thresholds by operation/risk/scope.
    - Receipts visible from dashboard and project activity.
    - Correction/rollback path for surprising writes.

### Exit Criteria

- External writes are never invisible to the project owner.
- Public feedback can become project memory.
- Outside activity contributes to restart clarity instead of becoming disconnected noise.

## Phase 7 - Day-30 Context Compounding

Target: day 30 and beyond

Goal: make BuildOS meaningfully better than a fresh prompt because the project has accumulated structured history.

### Work

1. Build the restart queries.
    - What changed since I last worked on this?
    - Which decisions are stale?
    - What is blocking the project?
    - What did agents do while I was away?
    - What matters if I only have 20 minutes?

2. Add cognitive forcing loops.
    - Drift.
    - Stale assumptions.
    - Recurring blockers.
    - Contradictions between new input and old decisions.

3. Measure compounding.
    - Projects with repeated updates.
    - Return after 7/30 days.
    - Time to restart.
    - User-rated clarity.
    - External-agent reads/writes tied to owner-visible receipts.

### Exit Criteria

- The day-30 project can answer questions that a fresh chat cannot.
- Restart clarity improves with accumulated context.
- Agents and humans share the same project memory instead of parallel histories.

## Workstream Map

| Workstream          | Main phase | Primary surfaces                          | Notes                                                           |
| ------------------- | ---------- | ----------------------------------------- | --------------------------------------------------------------- |
| Activation          | Phase 1    | Onboarding, first project, project page   | Highest priority because it proves the product promise.         |
| Receipts            | Phase 2    | Project activity, dashboard, chat, inbox  | Foundation for trust and "what changed."                        |
| Brief restart       | Phase 3    | Daily brief widget/modal/page/email       | Turns a passive surface into the return loop.                   |
| Decision rail       | Phase 4    | AI Inbox, Project Inbox, dashboard, brief | Generalize the strongest existing loop without overusing inbox. |
| Capture completion  | Phase 5    | Raw braindumps, voice notes, calendar     | Prevent capture-only dead ends.                                 |
| Outside context     | Phase 6    | External agents, public pages/comments    | Closes non-native update loops.                                 |
| Context compounding | Phase 7    | Project page, dashboard, agents, briefs   | Day-30 moat work.                                               |

## What To Pause Until Phase 1-3 Are Solid

- New broad agent capabilities that do not improve activation, receipts, or restart clarity.
- Public-page expansion that does not feed feedback back into project memory.
- Additional dashboard surfaces that do not answer "what changed," "what matters," or "what needs my call."
- Project Review production exposure before live smoke and migration state are verified.
- More capture inputs unless they have a structure/surface/update path.

## First Five Concrete Tickets

1. Activation definition and remembered-project moment doc.
    - Source: `tasker/22-activation-as-strategy-assessment.md`
    - Output: `docs/product/activation-as-strategy-assessment-2026-07-07.md`

2. Day-30 compounding doc.
    - Source: `tasker/23-day-30-moat-context-compounding.md`
    - Output: `docs/product/day-30-moat-context-compounding-2026-07-07.md`

3. AI Inbox / Project Inbox live smoke closure.
    - Source: `tasker/13-ai-inbox-verify-and-cleanup.md`
    - Output: logged smoke results and go/no-go for Project Review exposure.

4. Onboarding first-brain-dump activation slice.
    - Reuse project-create chat, then fetch and show a transformation + Start Here result packet.
    - Gate non-explore zero-project completion.
    - Add activation instrumentation.

5. Start Here visibility and project-log coverage.
    - Add a compact Start Here / Project memory preview on the first-project and project surfaces.
    - Verify the strongest mutation paths produce useful `onto_project_logs` entries.
    - Use the shipped `/today` feed rather than building a second "what changed" module.

## Success Measures

### 7 Days

- Activation definition and day-30 moat docs exist.
- AI Inbox / Project Inbox smoke status is known.
- Onboarding activation implementation is scoped or started.
- Minimum loop telemetry schema is agreed.

### 30 Days

- First-run brain dump creates a recognizable project and shows a transformation receipt.
- Daily brief has at least one direct update path.
- Users can see "what changed" after key mutation paths.
- Brain dump, voice, and calendar capture paths have explicit structured/parked states.

### 90 Days

- Returning users can restart projects without rereading everything.
- Project-log coverage makes native chat, inbox, daily brief, external-agent, and public-feedback changes visible.
- Project Reviews or audits are validated in production or deliberately held with known blockers.
- BuildOS has measurable context compounding: repeated updates, faster restart, higher acted-on brief rate, and durable project activity.

## Key Decisions For DJ

1. Is activation the operating center for the next sprint, even if that pauses broader agent/public-page work?
2. Should first brain dump create project state directly, or should it create a review proposal first?
3. Which verified mutation sources, if any, cannot be represented by Start Here plus the existing project-log contract?
4. Which surface owns "what changed": dashboard, project page, or both?
5. What external-agent writes can apply directly versus requiring human review?
6. Are raw `onto_braindumps` meant to be first-class project update inputs or a lightweight capture archive?
