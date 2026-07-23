<!-- docs/product/activation-start-here-daily-brief-plan-2026-07-10.md -->

# Activation, Start Here, And Daily Brief — Next Build Plan

Date: 2026-07-10
Status: Current product decision and execution order
Scope: First structured win, visible project memory, and the returning-user restart loop
Supersedes: the receipt-abstraction-first sequence in `thinking-loop-plan-of-attack-2026-07-07.md`

## Product Decision

BuildOS does not need a second general-purpose project-memory receipt system before activation.
The necessary foundations already exist, but they currently appear as separate product behaviors:

| User question                                                      | Existing source of truth                  | Product role                                     |
| ------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------ |
| What is this project, what has been decided, and what is true now? | The project `START HERE` document         | Canonical project orientation and durable memory |
| What changed, who changed it, and where did it land?               | `onto_project_logs`, surfaced by `/today` | Event/change ledger and returning-user receipts  |
| What needs my attention today, and what should I decide or update? | Daily Brief plus `/today`                 | Re-entry and action surface                      |

The next build should connect these three systems into one felt loop:

1. A user describes a real project.
2. BuildOS creates structured work and a Start Here document.
3. Onboarding visibly shows what BuildOS understood and will remember.
4. The user opens the project and recognizes it as theirs.
5. On a later visit, `/today` and the Daily Brief surface what changed and invite a decision or update.
6. The update changes canonical project state, which refreshes Start Here and appears in the change ledger.

## What Is Already Built

### Start Here foundation

- Every normal ontology project instantiation creates a canonical
  `document.context.project` Start Here document.
- Project creation queues a forced context snapshot so the managed status and document-map regions
  populate.
- Session-end project chat classification can stage conservative authored Start Here updates for
  human review.
- Project and ontology chat receive a bounded Start Here excerpt.
- Daily Brief generation consumes bounded Start Here excerpts.
- External agent/MCP project reads receive the same orientation context.
- Existing projects were backfilled; production deploy/backfill is closed.

### Change visibility foundation

- `/today` already renders actor-attributed, project-grouped "what changed since you were here"
  receipts from `onto_project_logs`.
- `/today` already offers quick capture, task completion, entity opening, receipt chat, Inbox entry,
  and loop telemetry.
- This is the event receipt system. Start Here should not duplicate the full event history.

### Daily Brief foundation

- Today's brief is generated/ensured automatically from the dashboard when eligible.
- Briefs include project context, a summary, priority-action strings, project briefs, audio, and
  generic Brief Chat.
- `brief_generated` and `brief_viewed` are measured.

## What Is Not Yet Hitting The Mark

### 1. Activation does not reveal Start Here

The first project can be created, but the first-session proof ends with a toast and a refreshed
project card. Onboarding never says:

> This is what BuildOS understood, this is what it created, and this is the memory it will use when
> you return.

The Ready step celebrates counts, public username setup, and external-agent keys before it proves
project continuity. The user can finish without seeing Start Here or opening the created project.

### 2. Non-explore onboarding still permits zero projects

`ProjectsCaptureStep.svelte` renders a zero-project Continue button for non-explore users, and the
`complete_v3` API accepts `projectsCreated: 0` for every intent. `onboarding_completed` therefore
contains false positives.

### 3. Start Here is architecturally central but visually generic

Start Here is first in the document tree and editable as the project context document, but on the
normal project page it is presented as one document among the Documents list. There is no compact
orientation snapshot that foregrounds current state, next move, decisions, or memory freshness.

This is a surfacing issue, not a missing data-model issue.

### 4. Start Here quality is not yet proven with real volume

The managed regions are deterministic, but authored updates from project chat become
`proposal_ready` review items. Production deployment/backfill is complete; sampling the quality of
those proposed updates remains open. Before increasing prominence, review a real sample for:

- useful durable context versus transient chatter;
- duplicate or stale decisions;
- empty template scaffolding that never becomes real orientation;
- whether review items are clear enough to accept confidently.

### 5. Daily Brief is still a report

The brief body is rendered as long markdown. `priority_actions` are plain strings, not structured
objects with project/task references. The user can Chat, copy, download, or regenerate, but cannot
resolve an individual brief item as Done, Still open, Not relevant, or Update project.

Current analytics mostly measure production volume and reading, not whether the brief restarted
work. There is no canonical `daily_brief_acted_on` measure.

## UX Findings By Leverage

### Tier 1 — cheap, high impact

- Rename the onboarding CTA from "create a project" language to "Start with a brain dump" and make
  the non-explore requirement explicit. -> P6
- After a project is created, replace the generic success toast as the primary proof with a
  compact transformation summary. -> P4+P6
- Give Start Here a visible `Project memory` / `Start here` entry point above generic document
  browsing; show its purpose as subtext. -> P4+P6+P8
- Rename the Brief's primary action from `Chat about Brief` to an outcome-oriented
  `Update from this brief` or `Work from this brief`. -> P6

### Tier 2 — structural within the flow

- Add an onboarding transformation state using the current Agent Chat project-creation path:
  fetch the affected project, Start Here, next step, and a bounded set of created entities; do not
  rebuild a second project parser. -> P4+P8
- Gate non-explore progression in both the component and `complete_v3`; preserve an explicit,
  measured sample/skip path for `explore`. -> P6+P13
- Add a compact project-memory snapshot on first project open. It should preview orientation and
  open the full Start Here document, not clone its content into another persistent object. -> P4+P8
- Turn Daily Brief into an action surface in two slices: a quick-update path first, then structured
  action objects with direct resolution controls. -> P4+P8+P13

### Tier 3 — polish

- Do not add signature motion or a large first-run celebration until the transformation and return
  metrics are proven. The earned delight is the before/after content itself. -> P11

## Execution Order

### Phase 0 — prove the current foundations (1–3 days)

1. Run three end-to-end activation walkthroughs with real, messy projects:
   `organize`, `plan`, and `unstuck`.
2. For each project, inspect the initial Start Here body after snapshot completion and the first
   session-end authored-capture proposal.
3. Record whether the user can answer these questions without opening chat history:
    - What is this project?
    - What is the current state?
    - What is the next move?
    - What was decided?
    - What changed since the last visit?
4. Baseline:
    - onboarding completions with zero projects;
    - signup -> first project created;
    - first project opened in the same session;
    - project reopened within seven days;
    - brief viewed and followed by a project mutation within 24 hours.
5. Sample real `proposal_ready` Start Here capture runs and decide whether prompt tuning is needed.

Exit: Start Here quality is known, activation false positives are quantified, and no new data model
is being proposed without evidence.

### Phase 1 — first structured win (about one week)

> **BUILT 2026-07-10/11** (tasker/26, uncommitted): all seven items below shipped, plus the
> default-landing flip (`/` and ReadyStep → `/today`). Live-verified end-to-end; pre-gate
> baseline recorded (41.4% of all-time completions had zero projects). As-built details and
> open items: `tasker/26-phase1-onboarding-activation-slice.md` §BUILD STATUS.

Build this around the existing `AgentChatModal` project-create path.

1. Keep the working project-creation chat, but frame it as the brain-dump action rather than an AI
   tutorial.
2. Preserve the first affected project ID returned in `DataMutationSummary`.
3. Fetch a small activation result packet after creation:
    - project name and description;
    - next step;
    - Start Here title plus bounded orientation/status excerpt;
    - up to three recognizable created tasks/goals/docs;
    - entity counts.
4. Replace the post-chat toast-only state with:
    - `Here is what BuildOS understood`;
    - `Here is what it created`;
    - `Here is what it will remember`;
    - actions: `Open my project`, `Adjust in chat`, `Continue setup`.
5. Require at least one created project before non-explore users can continue.
6. Enforce the same rule in `complete_v3` and test it.
7. Add activation-path telemetry in the same change:
    - capture started/submitted;
    - first structure shown;
    - first Start Here preview shown/opened;
    - first project opened;
    - adjustment requested;
    - explicit explore skip.

Exit: every non-explore user who completes onboarding has created and seen one recognizable project
and its memory.

### Phase 2 — visible project memory and return routing (about one week)

1. Add a compact Start Here / Project memory snapshot to the project page or first-project welcome
   state. Prefer a preview and deep link over rendering the full document inline.
2. Show:
    - current state and next step from the managed region;
    - a short `What this is` orientation;
    - authored-memory freshness, not managed-refresh noise;
    - `Open Start Here` and `Update project` actions.
3. Keep `/today` as the owner of event-level "what changed" receipts.
4. Decide the default landing behavior:
    - first session: open the created project so the structured win is completed;
    - later sessions: land on `/today` so the remembered-return loop is visible.
5. Instrument first reopen and return-session action on surfaced memory.

Exit: Start Here is visibly the project's memory, `/today` visibly owns change history, and the two
do not compete.

### Phase 3A — Daily Brief quick-update slice (about one week)

Ship the restart behavior before rebuilding the entire brief schema.

1. Make `Update from this brief` the primary action.
2. Open Brief Chat with a focused starter prompt: "What changed since this brief was generated?
   Tell me what is done, still open, wrong, or newly important."
3. Keep the brief visible alongside chat.
4. After mutations, show a compact result summary and refresh the brief/project data.
5. Track brief opened -> update started -> mutation applied within 24 hours.

Exit: a user can read a brief, report what changed, update project memory, and see the result without
starting from a blank chat.

### Phase 3B — structured Daily Brief actions

1. Evolve `priority_actions` from plain strings to structured action records containing stable
   project/entity references, display text, rationale, and allowed actions.
2. Add per-item controls:
    - Done;
    - Still open;
    - Not relevant;
    - Update;
    - Chat.
3. Route direct actions to canonical mutations or review paths.
4. Let the resulting project logs appear in `/today`; refresh Start Here through the existing
   snapshot/capture mechanisms.
5. Add acted-on, dismissal, correction, and mutation-success measurement.

Exit: Daily Brief is a Decide/Update surface, not a generated report with a chat button.

### Phase 4 — verification, safety, and distribution

1. Close AI Inbox, Project Review, Complete Project Audit, Agent Run, and calendar live smokes.
2. Close the critical agentic-chat external-content/write security chain before broader automation
   exposure.
3. Run the Writer acquisition pilot through the repaired first-session and return flow.
4. Measure remembered-return rate before widening distribution or adding more capability.

## First Eight Tickets

| Order | Ticket                                          | Outcome                                                          |
| ----- | ----------------------------------------------- | ---------------------------------------------------------------- |
| 1     | Activation + Start Here live walkthrough packet | Knowns replace assumptions about current quality                 |
| 2     | Non-explore zero-project UI/API gate            | Removes the false activation path                                |
| 3     | Post-create activation result packet            | Reuses current project creation and fetches the proof data       |
| 4     | Onboarding transformation + Start Here reveal   | Makes the first structured win visible                           |
| 5     | First-project Start Here snapshot               | Makes persistent memory legible on the project surface           |
| 6     | First-open/reopen/remembered-return telemetry   | Measures the product promise rather than onboarding completion   |
| 7     | Daily Brief quick-update action                 | Establishes the return/restart loop cheaply                      |
| 8     | Structured brief action contract                | Enables direct Done/Still open/Not relevant/Update/Chat behavior |

## Weekly Metric

Use two linked measures:

1. **First structured win rate** — percentage of new non-explore users who create a real project,
   see the transformation/Start Here preview, and open the project in the same session.
2. **Remembered-return rate** — percentage of first-structured-win users who return within seven
   days and act on surfaced project memory through `/today`, a Daily Brief, or the project page.

`onboarding_completed` remains an operational metric, not the activation metric.

## Deliberately Deferred

- A separate universal receipt table or second persistent memory object.
- Start Here librarian/reconciliation expansion until real proposal quality is sampled.
- Native mobile, public-project discovery, recurring-work v2, and new broad agent capabilities.
- Distribution pushes that send scarce users into the unrepaired activation path.

## Decisions Still Needed From DJ

**Items 1–3 DECIDED 2026-07-10 and implemented in tasker/26:**

1. ~~Should non-explore users be strictly blocked until project creation succeeds?~~
   **DECIDED: yes.** Gated in both the step UI and `complete_v3` (server verifies the
   workspace project count); `explore` keeps an explicit, analytics-tagged skip.
2. ~~`Open my project` vs transformation preview?~~ **DECIDED: preview inside onboarding.**
   The receipt renders in-step with `Open my project` as a new-tab action (fires
   `first_project_opened`); onboarding's final CTA routes to `/today` rather than the
   project (DJ chose the landing flip over guaranteed same-session project opening —
   `/today` surfaces the new project's receipts).
3. ~~Default logged-in visits to `/today`?~~ **DECIDED: yes, now.** `/` (hook + page load)
   and ReadyStep both route to `/today`.
4. Should Daily Brief remain a full generated narrative, or become a short action digest with deeper
   project drilldowns? Recommendation: shorten the primary surface; keep the full narrative in
   history/detail. **(Still open — Phase 3 concern.)**
