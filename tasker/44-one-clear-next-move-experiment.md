<!-- tasker/44-one-clear-next-move-experiment.md -->

# 44 — One Clear Next Move: turn generated structure into human commitment

**Created:** 2026-08-04  
**Owner:** a separate product-experiment agent  
**Type:** evidence audit → moderated activation study → directional product pilot  
**Status:** SHAPED; Phase 0 not started  
**Paired tasker:** [43 — Re-entry Compass](43-reentry-compass-experiment.md)

## The one-sentence mission

Determine whether asking a new user to choose one created task to put in motion converts BuildOS's
first-project structure into more meaningful project advancement within seven days.

## Read this before doing anything

This tasker does **not** authorize a generic “make fewer entities” prompt or a production A/B test.
The original value-filter idea is unproven and partly redundant with existing minimality policy.

Work the evidence gates in order. If the current output is grounded and users already know what to
do next, kill the treatment. If generated tasks are ungrounded, fix creation quality rather than
masking the problem with a choice card.

Read these sources first:

1. `docs/marketing/brand/BUILDOS_BRAND_ARCHITECTURE.md` — strategic thesis and Human-Agent
   Operating Principle.
2. `docs/business/strategy/strategy-spine-2026.md` — activation/return hypotheses and
   `unload → context → clarity → leverage`.
3. `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/project_creation/SKILL.md` —
   current smallest-valid-payload and no-over-structuring policy.
4. `apps/web/src/lib/services/agentic-chat/project-domain-profiles.ts` — domain-specific grounding
   and anti-scaffolding rules.
5. `apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte` — capture, direct creation,
   activation packet, receipt, and telemetry behavior.
6. `apps/web/src/routes/api/onto/projects/[id]/activation-packet/+server.ts` — current packet data.
7. `apps/web/src/lib/components/onboarding-v3/ReadyStep.svelte` — current count-led success copy and
   `/today` destination.
8. `apps/web/src/lib/server/today-feed.service.ts` — why an undated `in_progress` task surfaces.
9. `apps/web/src/lib/services/loop-telemetry.ts` and `apps/web/src/lib/services/posthog.ts` — current
   activation event envelope and limitations.

External research framing:

- METR, “Task Substitution and Uplift”:
  `https://metr.org/blog/2026-05-08-task-substitution-and-uplift/`
- METR, “We spent 2 hours working in the future”:
  `https://metr.org/notes/2026-03-19-org-uplift-game/`
- METR, “We are Changing our Developer Productivity Experiment Design”:
  `https://metr.org/blog/2026-02-24-uplift-update/`

## Vision and strategic fit

The adopted BuildOS thesis is:

> **BuildOS is where humans keep judgment, context, and control as AI makes execution abundant.**

The public translation is:

> **You set direction. Your agents execute. BuildOS keeps the project coherent.**

This experiment tests the activation half of that promise. AI can cheaply turn a brain dump into
several valid project entities. The product has not delivered leverage merely because it produced
more records. The person must recognize the project, decide what matters now, and create a durable
signal that later human and agent work can share.

The product loop is:

`human signal → structured context → human priority → visible next move → project action`

One Clear Next Move owns the `structured context → human priority` transition.

## Why the original experiment is rejected

The initial proposal was to create fewer entities and park more items. Do not implement that as the
default experiment because:

- the project-creation skill already defines creation as a minimality exercise;
- it already permits only stated outcomes and concrete actions and forbids unrequested plans,
  milestones, and scaffolding;
- domain-specific fiction rules already prevent story content from becoming fake PM structure;
- creating fewer tasks can mechanically improve “percentage touched” without improving the project;
- reducing records may discard useful context the user deliberately unloaded;
- the existing direct-commit Agent Chat path has no safe pre-commit proposal layer, and building a
  second parser would violate the current activation architecture.

The current receipt does visually celebrate output counts. That is evidence of messaging bias, not
proof of unwanted sprawl. `first_project_reviewed` also fires when the packet loads, so it means
receipt exposure—not genuine recognition, acceptance, or review.

The redesigned question is:

> When BuildOS creates several grounded tasks, does one explicit human priority choice produce more
> meaningful project advancement?

## Causal thesis

> When a first brain dump produces two or more grounded tasks, requiring the user to choose one
> task to put in motion will increase meaningful human-initiated project advancement within seven
> days without reducing recognition, losing stated context, or increasing onboarding abandonment.

Causal chain:

`grounded structure → explicit human priority → in-progress task on /today → later project advance`

## What this experiment can and cannot establish

It can provide evidence that:

- a human judgment checkpoint is comprehensible and not burdensome;
- a chosen next move becomes a durable shared project signal;
- explicitly choosing a task increases later project action;
- the activation receipt should emphasize direction over output volume.

It cannot, by itself, prove that:

- generated structure is generally too large;
- fewer tasks are always better;
- untouched tasks have no context value;
- task completion alone captures all project value;
- a 20–30-user directional pilot is a powered causal result.

## Known evidence and uncertainty

The 2026-08-04 planning audit found suggestive but inconclusive production metadata:

- July had nine successful project creates across four unique users;
- the median create payload contained six entities and four tasks;
- among seven-day-mature creates, many initial tasks had no later task action and none were observed
  completed in that very small sample.

Do not treat those figures as proof. Internal/test users were not fully filtered, the sample is
tiny, tasks may have been explicitly requested, and an untouched task may still preserve useful
context. Phase 0 must rerun the evidence against a clean, mature, non-internal cohort.

The last-30-day activation snapshot at planning time also showed only six signups and two onboarding
completions. Re-run rather than copying that number forward. It establishes why a conventional A/B
test is currently inappropriate, not the future denominator.

## Proposed treatment: One Clear Next Move

Keep project generation identical between control and treatment. Do not change the model prompt in
the primary experiment.

After the current transformation receipt loads, show:

> **Choose what starts now**
>
> BuildOS kept the rest in your project. Pick one task to put in motion.
>
> ○ Rewrite the chapter-four opening  
> ○ Review beta-reader notes  
> ○ Confirm the launch date
>
> `[Start with this]`  
> `I'm not ready to choose`

On a successful choice:

- the selected task moves from `todo` to `in_progress` only after the explicit user click;
- unselected grounded tasks remain `todo` and stay in the project;
- the receipt confirms which task is in progress and that the rest remain available;
- onboarding continues normally;
- `/today` surfaces the undated `in_progress` task.

Do not call unselected tasks “parked.” There is no genuine parked task state. Do not archive, delete,
hide, or demote captured items merely to support the experiment narrative.

## Control and treatment

### Control

Current capture, generation, transformation receipt, and onboarding progression exactly as shipped.

### Treatment

The same capture, generation, created graph, and receipt, followed by the explicit next-move choice.
The choice is optional; `I'm not ready to choose` must remain available and tracked.

Holding generation constant isolates the human-judgment checkpoint, keeps model latency/cost equal,
and avoids losing context.

Do not change ReadyStep's count-led copy during the primary causal pilot. That would bundle a
messaging treatment with the behavioral treatment. If the choice proves valuable, update the count
emphasis in a subsequent product/brand cleanup.

## Candidate-task contract

- treatment must have 2–5 grounded candidate tasks;
- preserve exact task IDs and titles from the created project;
- candidates must be active `todo` tasks created by the first-project operation;
- do not generate replacement choices at receipt time;
- do not auto-select or visually preselect the first task;
- if ordering is used, record the ordering rule and selection rank;
- users with zero tasks remain in the current receipt path;
- one-task users may eventually receive a confirmation treatment, but they are outside the clean
  multi-choice analysis;
- multi-project creation is excluded until the current activation path can attribute candidates and
  outcomes unambiguously.

## Eligibility

The future live pilot includes:

- new non-explore user;
- zero projects at onboarding step entry;
- first project created successfully;
- one created project with 2–5 eligible candidate tasks;
- no invitation or pre-existing shared workspace;
- no internal/admin/test account.

Assign only after eligibility is known. Keep assignment stable by user and experiment version,
including OAuth/reload/session restore.

If volume eventually supports it, balance or stratify by onboarding intent (`organize`, `plan`,
`unstuck`). Do not use calendar-week assignment or client-only randomness.

## Primary outcome

`first_project_advanced_7d`:

> At least one meaningful human-initiated project mutation after onboarding and within seven days.

Exclude the experiment's own `todo → in_progress` write and all automatic snapshot/maintenance
writes.

Qualifying examples:

- selected task later edited, rescheduled, or completed;
- another task meaningfully created, updated, or completed;
- durable document or project update;
- user quick capture/chat produces a persisted project change;
- later human change to the project's next-step state.

This is a user-level binary outcome for the primary analysis.

## Secondary outcomes

- selected-task action within seven days;
- selected-task completion within seven days;
- later-calendar-day return followed by a project action;
- capture submitted → project created → receipt exposed → onboarding completed;
- explicit structure acceptance or adjustment;
- time from choice exposure to onboarding completion;
- decline rate and choice time;
- untouched open initial tasks at day 7 and day 30, diagnostic only;
- first-project recognition: “This feels like my project.”

Do not use “percent of generated tasks touched” as the North Star. Treatments that reduce the
denominator can game it without creating more value.

## Guardrails and stop rules

| Risk                      | Guardrail / stop rule                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| Added friction            | Stop if onboarding completion falls by more than 10 percentage points                    |
| Confusing choice          | Stop if more than 20% decline because they do not understand the decision                |
| Loss of recognition       | “This feels like my project” must not decline materially                                 |
| Generated-quality masking | Same-session adjust/delete/correction must not rise                                      |
| Lost user context         | Blinded grounding audit must show no treatment-related loss; generation is held constant |
| False progress semantics  | Only explicit user click may set `in_progress`; never auto-select                        |
| Apply failure             | Track PATCH failure and latency; do not continue with a false success receipt            |
| Bundled confound          | Keep prompt, model, entity graph, and primary receipt constant between arms              |
| Privacy                   | Events contain IDs/counts/version/intent only, never capture or task text                |

## Measurement repair

The current `first_project_reviewed` event fires automatically when the activation packet loads. Do
not reinterpret it as explicit review. Treat it as receipt exposure and add genuine behavioral
events.

Content-free events:

- `next_move_choice_shown`;
- `next_move_selected`;
- `next_move_declined`;
- `next_move_applied`;
- `next_move_apply_failed`;
- `first_structure_accepted`;
- `first_structure_adjusted`.

Include stable join fields:

- experiment key/version and variant;
- onboarding session ID;
- project ID;
- user ID through the normal identified analytics contract;
- candidate count, selection rank, intent, and latency;
- never the capture or task title.

Create a durable assignment/exposure record. PostHog is a mirrored analysis layer, not the only
record of assignment or eligibility.

## Phase plan and gates

### Phase 0 — grounding and behavior evidence gate

Purpose: decide whether the problem is output quality, sprawl, prioritization, resurfacing, or no
problem at all.

Work:

1. Rerun the activation-funnel snapshot and define a clean non-internal first-project cohort.
2. Accumulate or review at least 20 real first-project creates that are seven days mature.
3. Reconstruct the opening input, creation payload, created tasks, and seven-day human actions.
4. Blind-label each created task:
    - explicit in the user's input;
    - reasonable implication;
    - invented or low value.
5. Record whether important user-stated information was lost, collapsed, or preserved.
6. Run 5–8 moderated onboarding walkthroughs. Before showing any choice prompt, ask:
   “What would you do first?” and observe whether the user can answer and act.
7. Shadow-rank one candidate task and compare it with the user's eventual first task action. Do not
   expose or auto-select the recommendation.

Only authorize a separate stricter-generation experiment if both are true:

- at least 25% of tasks are invented/low-value, or at least 40% of users say the structure creates
  extra work;
- at least 50% of those suspect tasks remain untouched after seven days.

If tasks are grounded but untouched, the likely problem is prioritization or resurfacing. Proceed
only with One Clear Next Move.

If users already identify and act on the next move immediately, kill the choice treatment.

### Phase 1 — counterbalanced moderated prototype

Cohort: 8–12 representative non-internal users.

Use the same generated output. Show the current receipt and a clickable next-move prototype in
counterbalanced order. This is a comprehension/behavior study, not a retention RCT.

Gate to implementation only if:

- at least 80% understand what will happen to the chosen task and the unselected tasks;
- at least 70% choose without facilitator help;
- median choice time is under 60 seconds;
- no participant believes useful captured information disappeared;
- no severe false-`in_progress` misunderstanding occurs.

**DJ approval is required before Phase 2 production assignment.**

### Phase 2 — directional production pilot

Cohort: 20–30 eligible users, or a predeclared time cap if acquisition is slower. This phase tests
event integrity, comprehension, friction, and guardrails—not statistical significance.

Use intention-to-treat by durable assignment. Separately report treatment take-up: selected versus
declined.

Stop if:

- onboarding completion drops more than 10 percentage points;
- confusion-driven decline exceeds 20%;
- same-session correction/deletion rises materially;
- assignment, OAuth restore, or outcome joins are unreliable.

### Phase 3 — powered causal test, only after acquisition supports it

The planning estimate for detecting a 50% → 70% lift is roughly 93 eligible users per arm. Recompute
from the Phase 2 baseline and pre-register the minimum detectable effect. Do not quote p-values from
the moderated or 20–30-user pilots.

Ship the choice treatment only if the pre-registered material lift appears in
`first_project_advanced_7d` and every guardrail holds. Do not ship merely because task-utilization
percentage rises.

## Implementation work packages, if the gates authorize them

### W1 — cohort and evidence audit

- reproducible non-internal first-project cohort;
- input → payload → task → seven-day-action joins;
- blinded grounding rubric and reviewer packet;
- documented exclusions and missing-data rate.

### W2 — activation packet candidates

Extend the activation packet only as needed to return a bounded `candidate_tasks` collection with
task ID, title, state, priority/order, and creation timestamp. Preserve current packet consumers and
response behavior.

### W3 — choice UI and state application

- optional choice card after the existing receipt;
- 2–5 accessible, keyboard-operable task options;
- explicit no-choice path;
- use the canonical existing task-update route/contract to set `in_progress`;
- handle failure without claiming success;
- preserve onboarding session/OAuth restore state;
- no model call and no generation change.

### W4 — durable experiment and event joins

- server-stable assignment after eligibility;
- durable exposure/take-up/application record;
- content-free analytics events;
- outcome query excluding the treatment's own write and automation noise.

### W5 — later brand cleanup, not part of the causal treatment

If the choice proves useful, separately consider changing count-led success copy in the
transformation receipt and Ready step to emphasize:

> **One project ready. One next move chosen.**

Do not bundle this copy change into the primary experiment.

## Verification requirements

- unit tests for eligibility, candidate filtering, stable assignment, decline, and state-apply
  failure;
- tests proving the prompt/model/created graph are identical between arms;
- onboarding OAuth/reload/session-restore tests;
- activation packet compatibility tests;
- outcome-query fixtures excluding the experiment write and automatic maintenance;
- Svelte checks and focused component tests for changed UI;
- manual mobile, keyboard, and screen-reader-label walkthrough;
- production smoke for 0-task, 1-task, multi-task, existing-project, explore-skip, and multi-project
  edge cases.

## Analysis plan

- pre-register eligibility, outcome window, qualifying mutations, and exclusions;
- use intention-to-treat for the primary readout;
- report raw eligible users, assigned users, exposed users, selectors, decliners, and completers;
- report internal/test exclusions explicitly;
- compare risk difference in `first_project_advanced_7d`;
- inspect recognition, correction, and every failure qualitatively;
- treat intent and candidate count as exploratory moderators until volume supports them;
- never transform a directional pilot into a significance claim after seeing the data.

## Required artifacts and handoff

The owning agent must leave:

1. a dated Phase 0 evidence report with the 20-project task-grounding rubric;
2. a moderated study protocol written before Phase 1 sessions;
3. a decision packet marking these claims separately as **corroborated / falsified / unresolved**:
    - generated-task sprawl exists;
    - users lack a clear next move;
    - the choice interaction is understandable;
    - explicit choice improves project advancement;
4. if Phase 2 is authorized, a versioned experiment spec and reproducible seven-day outcome query;
5. a one-page DJ brief stating whether to fix generation, ship a priority checkpoint, improve
   resurfacing, or do nothing.

Do not mark this tasker complete because the radio-card UI works. Completion means the evidence
produced a defensible product decision and no authorized phase remains unfinished.

## Exit condition

This task exits with one of four explicit decisions:

- **Fix creation quality:** the grounding audit finds invented/low-value structure;
- **Ship/continue next-move experiment:** structure is grounded, but explicit human priority improves
  later project advancement;
- **Fix resurfacing instead:** users choose successfully, but the selected work disappears from the
  return experience;
- **Kill/park:** users already know what to do, the checkpoint adds friction, traffic cannot support
  the next phase, or the primary outcome does not improve.
