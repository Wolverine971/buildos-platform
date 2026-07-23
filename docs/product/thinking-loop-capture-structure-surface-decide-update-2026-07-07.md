<!-- docs/product/thinking-loop-capture-structure-surface-decide-update-2026-07-07.md -->

# Thinking Loop Product Assessment

Date: 2026-07-07
Status: Research synthesis and product-flow assessment
Scope: Capture -> Structure -> Surface -> Decide -> Update across current BuildOS surfaces

**Terminology:** "Thinking loop" here means the human/product feedback lifecycle across
time. The background maintenance capability is **Project Review**, and one execution is a
**project review pass**. See `docs/product/PROJECT_REVIEW_TAXONOMY.md`.

## Executive Finding

BuildOS is already closest to its category promise when rough input becomes durable project memory and then returns as a concrete next move. The strongest current examples are AI Inbox, Project Inbox, calendar project suggestions, and the project detail workspace. Those surfaces have real object state, review actions, mutation paths, and visible project context.

The weakest parts of the loop are consistency and closure. Some surfaces capture without structuring, some structure without resurfacing, some surface without a clear decision path, and some update canonical state without giving the user a visible "what changed" receipt. That is the main product gap for the thinking-environment thesis.

The clearest product bar is:

> BuildOS should not only collect thoughts. It should help a project remember what changed, show why it matters now, ask for the next human call when needed, and update the project record in a way the user can inspect.

## One-Page Loop Definition

BuildOS is a thinking environment for people making complex things. The loop is how messy thinking turns into structured work and how project memory compounds.

### 1. Capture

The user, an agent, or an integration contributes raw context.

Examples:

- A messy project brain dump.
- A daily update after yesterday's plan changed.
- A voice note.
- Calendar evidence that a project exists.
- An external agent writing back progress.
- Public-page feedback from a collaborator or reader.

Product job: make it easy to get context out of the user's head without forcing them to organize it first.

Healthy state: the capture object has a source, owner, timestamp, project/entity links when known, processing status, and a next step if it is not yet structured.

### 2. Structure

BuildOS converts raw context into project memory.

Examples:

- Projects, tasks, documents, goals, risks, milestones, events.
- Proposed changes that need review.
- A daily or project brief.
- A next step.
- A summary of what changed.

Product job: turn rough thinking into a shape the user can act on without losing the original source.

Healthy state: generated structure links back to the capture source and can be inspected, edited, accepted, dismissed, or corrected.

### 3. Surface

BuildOS brings the right memory back at the right moment.

Examples:

- Dashboard brief.
- Project pulse and next step.
- AI Inbox or Project Inbox item.
- Notification-stack decision.
- Returning-user "what changed since you were here" view.
- Project activity entry.
- Email/SMS daily brief.

Product job: make important project memory visible when it can change behavior.

Healthy state: surfaced items say why now, what they are based on, what changed, and what action is expected from the user.

### 4. Decide

The user, system, or delegated agent resolves ambiguity.

Examples:

- Accept, dismiss, snooze, or chat about a proposal.
- Select which calendar suggestions become projects.
- Mark a task done or move it out of blocked.
- Confirm an external agent's proposed write.
- Add a quick update after reading the daily brief.

Product job: preserve human agency at the points where the project can fork.

Healthy state: every surfaced recommendation is either clearly informational or has an explicit decision action. Dismissals and corrections become memory, not dead ends.

### 5. Update

BuildOS applies the decision to canonical project state and gives the user a visible receipt.

Examples:

- Project/task/document state changes.
- Inbox item status changes.
- Dismissal feedback stored for future suppression.
- Project next step refreshed.
- Activity log or timeline item showing what changed.
- Brief or dashboard updated after the user responds.

Product job: make project memory compound and keep trust intact.

Healthy state: the user can answer "What changed, why did it change, and where did it land?" without reconstructing it from chat history.

## Current-State Map By Product Surface

| Surface                                 | Capture                                                                                                                     | Structure                                                                                               | Surface                                                                                                                | Decide                                                                                                         | Update                                                                                                       | Assessment                                                                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Onboarding first project                | User enters project context through the agent chat modal, not the inline first-brain-dump flow described in the newer spec. | Agent chat can create projects when used. Current completion state tracks `projectsCreated`.            | Onboarding shows a tutorial card/screenshot and then calendar setup.                                                   | Non-explore users can still advance with zero projects in the route and server completion API.                 | Projects created by chat refresh onboarding state, but no transformation reveal is shown in the step itself. | Broken activation handoff. This should be the first proof of "messy thinking -> structured work," but current code still lets users miss it.                                               |
| Agentic chat / project-create chat      | Rich text/chat capture, with resumable sessions and mutation summaries.                                                     | Chat can create or update project ontology and emit data mutation summaries.                            | Timeline tabs and resumable chat sessions make the local process inspectable.                                          | User can continue the chat, resolve inbox items from chat, or accept reviewed change sets depending on source. | Affected projects refresh through mutation events.                                                           | Strong local loop. Needs a more universal "project memory receipt" so important changes do not stay buried inside chat.                                                                    |
| Raw `onto_braindumps`                   | Raw content is stored with metadata and optional chat session ID.                                                           | Worker extracts title, topics, and summary. It does not create or update projects/tasks/docs.           | Records can be listed, but this is not a primary re-entry surface.                                                     | No decision path.                                                                                              | No canonical project update beyond the braindump record.                                                     | Capture-only path. The product uses "brain dump" language for the core promise, but this implementation is closer to a parked note than structured work.                                   |
| Voice notes                             | Audio and transcription are captured; notes can link to entities/groups.                                                    | Transcription gives text, but there is no default project update or proposal path.                      | Voice notes page/history and chat-session voice-note panels.                                                           | No native accept/dismiss/convert decision.                                                                     | No canonical update unless routed through another workflow.                                                  | Valuable capture mode, weak loop. It should either become an update composer source or be clearly parked with a next action.                                                               |
| Daily brief dashboard/email/page        | No direct capture from the brief itself. It reads existing project memory.                                                  | Worker generates project briefs, priority actions, and updates project next-step fields.                | Dashboard widget now ensures today's brief on app open; modal/page/email show brief content.                           | "Chat about Brief" exists, but there is no per-item decision, "quick update," or "what changed?" CTA.          | Project next-step fields can be updated implicitly; brief chat mutations can refresh data.                   | Strong Surface, weak Decide and visible Update. The brief should restart the loop, not just report on it.                                                                                  |
| Dashboard AI Inbox                      | Proposals come from agent runs, project suggestions, calendar suggestions, and related sources.                             | `inbox_items` indexes source truth and loads payload/context/capabilities.                              | Dashboard modal groups items with rationale, evidence, risk, project/audit context.                                    | Accept, dismiss, snooze, chat. Project suggestions collect dismissal reason/note.                              | Source state and inbox index sync; optimistic removal, notification-stack progress, fallback status repair.  | Best canonical Decide/Update example. The pattern should inform other surfaced recommendations, but not every item should become inbox noise.                                              |
| Project Inbox and Project Reviews       | Project review passes and audits produce project suggestions and audit packets.                                             | Suggestions include scoped operations, evidence, risk, feedback memory, and freshness checks.           | Project page can show audit tracker, Project Inbox groups, latest run brief, and review status when flags are enabled. | Accept, dismiss with feedback, snooze, batch approve eligible low-risk suggestions, chat.                      | Applies suggested operations, syncs status, stores feedback/suppression memory.                              | Architecturally strong but product value is not yet validated in production. Recent audit says flags were off and production clarity delivered was effectively zero at the time of review. |
| Calendar analysis                       | Calendar events are the raw source.                                                                                         | Service turns patterns into project suggestions with tasks, confidence, event IDs, reasoning, keywords. | Modal/notification surface shows found projects and task details; suggestions can also route through inbox.            | User selects, edits project names/descriptions/tasks, accepts or rejects.                                      | Accepted suggestions create projects/tasks and update suggestion status.                                     | Strong source-specific Capture -> Structure -> Decide -> Update loop. Needs better connection to the canonical loop metrics and recurring dashboard follow-up.                             |
| Project detail workspace                | Manual project edits, task moves, document edits, goals/risks/events, and resumed chats.                                    | Canonical ontology state lives here.                                                                    | Header next step, pulse strip, entity tabs, task board, docs, activity, graph, recent chats, project inbox.            | Direct edits, task status changes, entity modals, inbox decisions.                                             | Immediate canonical state updates and refreshes.                                                             | Best destination surface for project memory. It should be the place every capture/update can return to with a visible receipt.                                                             |
| External agent / MCP / OpenClaw gateway | External agents can read project context and call scoped tools.                                                             | Tool registry exposes project/task/calendar operations with auth, scopes, dry-run/idempotency support.  | Context surfaces to external agents through resources/tools; user-facing surfacing is less clear.                      | Policy/scope decides allowed operations. Some writes may be direct rather than human-reviewed.                 | Gateway writes can update BuildOS state and activity context.                                                | Good harness foundation, weak owner-visible return path. External writes need "what changed because an outside agent acted" surfacing.                                                     |
| Public pages and comments               | Published documents expose work outward; comments capture external feedback.                                                | Comments and view counts become records tied to public documents/projects.                              | Public page, author index, published panel/counts, comment thread.                                                     | Owner can reply/delete; commenters can post/reply.                                                             | Comments persist, but there is no obvious conversion into project tasks/risks/next steps.                    | More distribution loop than thinking loop today. It becomes part of the thinking loop only if audience feedback can feed back into project memory.                                         |

## Broken Or Missing Handoffs

### Capture -> Structure

- Onboarding still asks users to create a project through a chat modal and allows zero-project completion. That misses the first proof moment.
- Raw `onto_braindumps` are structurally shallow: title, topics, summary, but no project/task/doc updates.
- Voice notes stop at audio/transcript unless another workflow picks them up.
- The product vocabulary treats "brain dump" as the core behavior, but implementation paths are split between raw capture and agentic project creation.

### Structure -> Surface

- Daily brief surfaces project memory, but prior audits found it can become a large wall of text. Even with app-open ensure behavior now present, quality and acted-upon measurement remain open.
- Project Reviews and Project Inbox have the strongest structure, but recent production review said flags were off/unvalidated.
- Raw braindumps and voice notes do not reliably return to the user as structured project prompts.
- External agent writes can update state without a clear owner-facing "what changed" surface.
- Public-page comments are tied to project documents but do not appear to feed into the owner's project review loop.

### Surface -> Decide

- AI Inbox has a mature decision model; Daily Brief does not.
- Dashboard has surfaced information, but no universal "what changed?" or "quick update" pathway to restart the loop.
- Some recommendations are clearly actionable, while others are informational. The UI should consistently distinguish those two modes.
- Daily brief, voice notes, and public feedback lack the standard Accept / Dismiss / Update / Chat decision vocabulary.

### Decide -> Update

- Inbox decisions are robust: source mutation, index sync, fallback repair, feedback memory, and notification-stack progress.
- Daily brief chat can mutate data, but the user does not get a crisp receipt tying the change back to the brief item.
- External agent writes need an owner-visible receipt and possibly a review policy based on scope/risk.
- Dismissals outside AI Inbox generally do not become durable preference memory.

### Update -> Next Capture

- The April growth audit identified the key loop break: the second brain dump has no dedicated trigger.
- Daily brief should ask "what changed?" or "anything to update?" when the user is already oriented.
- Project pages have many edit controls, but there is no single project-scoped quick update composer that says "tell BuildOS what changed."
- Returning after inactivity should show "what changed since you were here" plus a capture box, not only a static dashboard.

## Proposed Canonical Loop UX

### Product Principle

Do not make every surface an inbox. Make every surface loop-aware.

Inbox is for pending decisions and reviewable mutations. Briefs, project pages, voice notes, public pages, and external-agent receipts can use lighter-weight surfaces, but each should still know what loop stage it represents and what the user can do next.

### Canonical Loop Object Contract

Every loop item should carry:

- `source_type`: brain_dump, chat, daily_brief, project_loop, calendar, voice_note, external_agent, public_comment, manual_edit.
- `source_ref_id`: the raw thing that caused this item.
- `project_id` and `entity_refs`: where it belongs.
- `loop_stage`: captured, structured, surfaced, deciding, applied, parked, dismissed, superseded.
- `why_now`: why the user is seeing it.
- `suggested_action`: read, update, accept, dismiss, snooze, chat, open_context.
- `risk_tier` or `review_required`: whether it can update directly.
- `result_ref`: where the final update landed.
- `receipt_summary`: short human-readable "what changed."

### First-Run UX

The first onboarding project capture should be a direct proof of the thesis:

1. User writes or speaks one messy brain dump inline.
2. BuildOS shows a transformation receipt: "I found this project, these tasks, this current state, and this next move."
3. User can edit/accept the structure.
4. The project page opens with the new project memory visible.
5. Calendar connection follows as an optional enrichment step, not the substitute for activation.

Non-explore onboarding should not complete with zero projects unless the user explicitly chooses a true "explore empty workspace" branch.

### Returning Dashboard UX

The dashboard should answer three questions before anything else:

1. What matters today?
2. What changed since I was here?
3. What do I need to decide or update?

Recommended surface:

- Today's brief: short, project-linked, with priority actions.
- What changed: agent writes, accepted proposals, external-agent updates, public comments, major project activity.
- Needs your call: pending AI Inbox / Project Inbox decisions.
- Quick update: a project-aware capture box for "what changed?" that can structure the user's update into existing project memory.

### Project Page UX

The project page should be the canonical destination for applied memory:

- Header: current next step and last meaningful update.
- Pulse: recently done and up next.
- Project update composer: "Tell BuildOS what changed on this project."
- Project Inbox: only reviewable suggestions.
- Activity/receipt stream: durable "what changed" entries from chat, brief, inbox, external agents, public comments, and manual edits.

### Daily Brief UX

Daily brief should become a restart surface:

- Keep the brief short enough to be read.
- End with a structured quick update prompt: "What changed since this plan?"
- Let each priority action have one of: done, still open, not relevant, update project, chat.
- Show a receipt after chat/update: "Updated these projects/tasks/next steps."
- Measure whether the brief caused any project action within 24 hours.

### External Agent UX

External agents should not be invisible writers.

- Low-risk writes can apply directly but must create a receipt.
- Medium/high-risk writes should create an inbox item or require a dry-run preview.
- Dashboard "what changed" should include external-agent updates.
- Project activity should show actor, scope, operation, affected entities, and source session.

### Public Feedback UX

Public pages are useful as a distribution loop, but only become part of the thinking loop when feedback returns to project memory.

- New comment on a public project document should surface to the owner.
- Owner should be able to convert comment -> task/risk/doc note or mark as handled.
- High-signal comments should be eligible for Project Inbox or "what changed" depending on whether action is needed.

## Metrics And Instrumentation Gaps

### Core Funnel

| Stage     | Metric                                                                                 | Why it matters                                                |
| --------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Capture   | `loop_capture_submitted` by source and project link rate                               | Shows whether users trust BuildOS with messy input.           |
| Structure | `loop_structure_completed`, generated entity counts, time to structure                 | Shows whether capture becomes usable project memory.          |
| Surface   | `loop_surface_shown`, `loop_surface_opened`, `why_now` present                         | Shows whether memory returns to the user.                     |
| Decide    | `loop_decision_made` by action/source/risk, chat-used rate, dismissal reason rate      | Shows whether surfaced items lead to agency, not noise.       |
| Update    | `loop_update_applied`, affected entity counts, receipt created/viewed                  | Shows whether project memory compounds and stays inspectable. |
| Return    | `loop_return_update_submitted`, second brain dump rate, restart after 7+ inactive days | Shows whether the loop becomes a habit.                       |

### Specific Gaps To Close

- Onboarding: non-explore zero-project completions; time from signup to first structured project; transformation receipt viewed; first project opened.
- Raw braindumps: percent converted into project updates; percent parked with no follow-up; time from capture to structure.
- Voice notes: transcript completion; conversion to project update; voice-note-to-task/doc/project rates.
- Daily brief: shown/opened/read depth; priority action clicked; quick update submitted; brief chat started; mutation within 24 hours; "acted upon" rate.
- AI Inbox / Project Inbox: accept/dismiss/snooze/chat rate by source and risk; feedback reason capture; repeat suggestion after dismissal; stale/superseded rate; applied mutation success/failure.
- Calendar analysis: suggestions generated; suggestions selected; tasks accepted vs disabled; projects created; created projects still active after 7/30 days.
- External agents: write attempts by scope/risk; direct apply vs review; receipt surfaced within N minutes; user opens receipt; rollback/correction rate.
- Public pages: comments/views by project; comments converted to project work; comments dismissed/handled.

### Event Shape Recommendation

Use a shared loop telemetry envelope rather than one-off event names only:

```json
{
	"event": "loop_decision_made",
	"source_type": "project_suggestion",
	"source_ref_id": "...",
	"surface": "dashboard_inbox",
	"project_id": "...",
	"entity_refs": [],
	"loop_stage_before": "surfaced",
	"loop_stage_after": "deciding",
	"action": "dismiss",
	"actor_kind": "user",
	"risk_tier": 2,
	"latency_ms": 1234,
	"receipt_id": "..."
}
```

Avoid storing sensitive content in analytics. Store IDs, counts, stage transitions, and coarse action labels.

## Prioritized Follow-Ups

### P0

1. Fix onboarding activation handoff.
    - Implement the inline first brain dump or equivalent first-run capture.
    - Show the transformation receipt.
    - Prevent non-explore completion with zero projects unless the user chooses an explicit empty-explore branch.

2. Add a daily brief restart action.
    - Add "What changed?" / "Quick update" from brief surfaces.
    - Link the update to the brief and affected projects.
    - Create an update receipt and track acted-upon rate.

3. Define the project memory receipt.
    - One durable receipt format for chat mutations, inbox decisions, external-agent writes, brief updates, and public-comment conversions.
    - Make it visible from project activity and dashboard "what changed."

4. Resolve the brain dump object model.
    - Decide whether raw `onto_braindumps` are first-class project update inputs or explicitly parked notes.
    - If first-class, route them through project update/proposal generation.
    - If parked, surface their parked state and next action.

### P1

5. Generalize AI Inbox patterns into a loop-aware surface contract.
    - Reuse why-now, evidence, decision capability, feedback, and notification-stack behavior where recommendations need action.
    - Keep informational surfaces out of inbox unless a decision is required.

6. Enable and validate Project Reviews in production.
    - Confirm feature flags, source/status sync, telemetry, and suggestion quality.
    - Measure clarity delivered, not only run completion.

7. Surface external-agent updates to owners.
    - Add direct-write receipts.
    - Define review thresholds by operation/risk/scope.
    - Include external-agent writes in dashboard "what changed."

8. Give voice notes a project-update path.
    - After transcription, offer convert-to-update, attach-to-project, or park.
    - Track conversion and parked-note follow-up.

### P2

9. Route public-page feedback back into project memory.
    - Comment -> task/risk/doc note/handled.
    - Owner-facing surfaced item when a public comment changes project direction.

10. Run focused user research on the loop language.

- Test "brain dump," "what changed," "project memory," "next move," and "receipt."
- Watch users return after a brief, after an inbox decision, and after an external-agent update.

## Thinking-Environment Rubric

Score each product surface 0, 1, or 2 for each criterion.

| Criterion                      | 0                                | 1                                    | 2                                                                  |
| ------------------------------ | -------------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| Welcomes messy input           | Requires structured fields first | Allows rough input with friction     | Makes rough input the easiest path                                 |
| Structures into project memory | Stores content only              | Generates summaries/proposals        | Updates or proposes updates to canonical project entities          |
| Surfaces at the right time     | User must go find it             | Appears somewhere, but weak why-now  | Appears in the right context with why-now and entity links         |
| Supports a decision            | No clear next action             | Generic chat/open action             | Clear accept/dismiss/snooze/update/chat path where needed          |
| Applies visible updates        | No canonical update              | Updates state but receipt is unclear | Updates state and shows what changed, why, and where               |
| Learns from correction         | Dismissal/correction disappears  | Some local feedback stored           | Feedback prevents recurrence and improves future suggestions       |
| Compounds over time            | One-off artifact                 | Persistent record, weak resurfacing  | Project memory gets easier to resume because prior context returns |

Rule of thumb:

- If a surface only captures, it is not yet the thinking loop.
- If it surfaces without a decision or update path, it is notification noise.
- If it updates without a visible receipt, it may be correct but it will not build trust.
- If it cannot reconnect to project memory, it fragments the product thesis.

## Sources Reviewed

Positioning and product framing:

- `docs/marketing/START_HERE.md`
- `docs/marketing/brand/brand-guide-1-pager.md`
- `docs/marketing/strategy/how-to-explain-buildos-2026-05-11.md`
- `docs/marketing/strategy/thinking-environment-creator-strategy.md`
- `docs/marketing/growth/growth-audit-2026-04-09.md`

Onboarding, brain dump, and chat:

- `apps/web/docs/features/onboarding/ONBOARDING_FIRST_BRAINDUMP_REBUILD_SPEC.md`
- `apps/web/docs/technical/audits/ONBOARDING_AUDIT_2026-06-26.md`
- `apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte`
- `apps/web/src/routes/onboarding/+page.svelte`
- `apps/web/src/routes/api/onboarding/+server.ts`
- `apps/web/src/routes/api/onto/braindumps/+server.ts`
- `apps/worker/src/workers/braindump/braindumpProcessor.ts`
- `docs/specs/AGENTIC_CHAT_TIMELINE_TABS_BRAINDUMP_ARCHITECTURE_2026-06-20.md`

Inbox, Project Reviews, and daily brief:

- `apps/web/docs/technical/architecture/agent-work/AI_INBOX_DESIGN_2026-06-24.md`
- `apps/web/docs/technical/architecture/agent-work/AI_INBOX_CLARIFIED_DECISIONS_SPEC_2026-06-26.md`
- `apps/web/src/routes/api/inbox/decide/+server.ts`
- `apps/web/src/lib/server/inbox.service.ts`
- `apps/web/src/lib/components/dashboard/DashboardInboxModal.svelte`
- `apps/web/src/lib/components/project/ProjectInboxPanel.svelte`
- `docs/technical/reviews/project-loops-flow-audit-2026-07-04.md`
- `apps/worker/docs/features/daily-briefs/DAILY_BRIEF_FLOW_AUDIT_2026-07-06.md`
- `docs/reports/daily-brief-quality-efficiency-review-2026-05-19.md`
- `apps/worker/src/workers/brief/ontologyBriefGenerator.ts`
- `apps/web/src/lib/components/briefs/DailyBriefModal.svelte`
- `apps/web/src/routes/briefs/+page.svelte`
- `apps/web/src/lib/components/dashboard/DashboardBriefWidget.svelte`

Calendar, project workspace, external agents, and public pages:

- `apps/web/src/lib/services/calendar-analysis.service.ts`
- `apps/web/src/lib/components/calendar/CalendarAnalysisResults.svelte`
- `apps/web/src/lib/components/calendar/CalendarAnalysisModalContent.svelte`
- `apps/web/src/routes/projects/[id]/+page.svelte`
- `docs/technical/implementation/OPENCLAW_BUILDOS_EXTERNAL_TOOL_GATEWAY_SPEC.md`
- `docs/technical/implementation/BUILDOS_EXTERNAL_AGENT_AUTH_FLOW_SPEC.md`
- `docs/specs/buildos-mcp-audit-fixes-2026-06-28.md`
- `apps/web/src/lib/server/agent-call/external-tool-gateway.ts`
- `apps/web/docs/technical/api/endpoints/voice-notes.md`
- `apps/web/src/routes/voice-notes/+page.svelte`
- `apps/web/src/routes/api/voice-notes/+server.ts`
- `apps/web/src/routes/(public)/p/[slug]/+page.svelte`
- `apps/web/src/lib/components/public-page/PublicPageComments.svelte`
