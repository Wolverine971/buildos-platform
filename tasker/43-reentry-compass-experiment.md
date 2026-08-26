<!-- tasker/43-reentry-compass-experiment.md -->

# 43 — Re-entry Compass: prove project memory reduces restart cost

**Created:** 2026-08-04  
**Owner:** a separate product-experiment agent  
**Type:** staged evidence audit → moderated study → directional product pilot  
**Status:** PHASE 0 COMPLETE (2026-08-04) — **GATE NOT PASSED; PARKED pending preconditions.**
Evidence: [`docs/product/reentry-compass-phase0-evidence-2026-08-04.md`](../docs/product/reentry-compass-phase0-evidence-2026-08-04.md).
No later phase is authorized. Revisit trigger: ≥15 external users/month in the 3–30 d return
window (monthly funnel script: `apps/web/scripts/reentry-compass/`).  
**Paired tasker:** [44 — One Clear Next Move](44-one-clear-next-move-experiment.md)

## Phase 0 outcome log (2026-08-04)

Executed offline against prod (read-only): routing audit, data-substrate audit, baseline
episode/eligibility probes, 23 external + 6 dogfood deterministic packets, two independent
blind scorers. Headline results:

- **Gate:** trustworthy state-or-next-move coverage 18/23 (78.3%, needs 80%) — FAIL;
  appropriate project selection 14/23 (60.9%, needs 80%) — FAIL; severe unsupported claims
  0 after adjudication (1 raw flag = 401 ms as-of boundary artifact in the offline harness);
  assembly cost PASS; 5-minute kill-check INDETERMINATE (no session signal exists).
- **Disqualifiers outside the rubric:** eligible population under the written contract is
  **0 users** (1 user in the 3–30 d window; fails mutation-history), and "Since you were
  away" had **zero data supply** in every external packet — no agent/collaborator/system
  change has ever occurred during a real user's absence.
- **Routing premise confirmed:** every authenticated return path still lands on
  `/dashboard` (tasker/27 WP-1 unstarted, +5 unlisted live defaults, 1 dead-code file in
  its list).
- **Decision:** hypothesis **unresolved — preconditions falsified**. Park the treatment;
  ship preconditions instead: (1) tasker/27 WP-1 routing flip incl. newly found defaults,
  (2) durable authenticated-session signal (W1-lite), (3) DJ verifies PostHog prod
  ingestion (~5 min), (4) re-run the eligibility funnel monthly. Also fix before any
  Phase 1: selection ranking must weight open work and temporal death, not recency alone;
  Start Here snapshot refresh must trigger on REST mutations; `next_step_*` needs
  staleness invalidation.

## The one-sentence mission

Determine whether BuildOS can turn accumulated project memory into a faster, trustworthy,
verified project advance when a person returns after time away.

## Read this before doing anything

This is not a normal feature brief. It is a falsifiable product experiment with evidence gates.

**Do not begin by building the card.** Work the phases in order. A later phase does not become
authorized merely because the earlier work was easy or because the treatment looks useful. If a
gate fails, stop, preserve the evidence, and recommend kill, simplify, or redesign.

Read these sources first:

1. `docs/marketing/brand/BUILDOS_BRAND_ARCHITECTURE.md` — especially the strategic thesis and
   Human-Agent Operating Principle.
2. `docs/business/strategy/strategy-spine-2026.md` — `unload → context → clarity → leverage` and
   H2/H3.
3. `docs/product/activation-start-here-daily-brief-plan-2026-07-10.md` — the current separation of
   Start Here, the change ledger, and `/today`.
4. `apps/web/docs/features/today-view/TODAY_VIEW_2026-07-09.md` — what `/today` already does.
5. `apps/web/src/lib/components/project/ProjectMemoryCard.svelte` — current project-memory surface.
6. `apps/web/src/lib/server/what-changed.service.ts` and
   `apps/web/src/routes/today/+page.svelte` — receipt data and the current return experience.
7. `docs/product/day-30-moat-context-compounding-2026-07-07.md` — the unproven compounding claim and
   decision-data gap.
8. `tasker/27-today-migration-ia-consolidation.md` and `tasker/38-live-verification-debt.md` — routing
   and analytics preconditions. Re-audit their current state; their written status may be stale.

External research framing:

- METR, “We spent 2 hours working in the future”:
  `https://metr.org/notes/2026-03-19-org-uplift-game/`
- METR, “Task Substitution and Uplift”:
  `https://metr.org/blog/2026-05-08-task-substitution-and-uplift/`
- METR, “We are Changing our Developer Productivity Experiment Design”:
  `https://metr.org/blog/2026-02-24-uplift-update/`

## Vision and strategic fit

The adopted BuildOS thesis is:

> **BuildOS is where humans keep judgment, context, and control as AI makes execution abundant.**

The public translation is:

> **You set direction. Your agents execute. BuildOS keeps the project coherent.**

This experiment tests the return half of that promise. AI and other people may have created or
changed work while the owner was away. BuildOS should preserve the state, show grounded receipts,
and help the owner decide what happens next without rebuilding the project from chat history.

The product loop is:

`human signal → durable context → scoped execution → visible receipt → human judgment → updated context`

Re-entry Compass owns the `visible receipt → human judgment` transition.

## Why this exists

BuildOS already has the raw ingredients:

- `/today` shows actor-attributed “What changed” receipts, quick capture, agenda items, task actions,
  and chat entry points;
- the project page has a Start Here / Project Memory card with current state, next step, orientation,
  and freshness;
- `onto_project_logs` is the canonical mutation ledger;
- loop telemetry records surface impressions and several actions.

Those ingredients do not prove the moat. A receipt impression is not clarity, and a memory card is
not a verified restart. The missing causal question is whether accumulated context changes what the
person can do when they return.

The originally proposed “enhanced context card vs no card” A/B is rejected because it would partly
duplicate shipped product, rely on fields that are not yet trustworthy, and produce misleading
small-sample statistics.

The narrowed experiment asks:

> Does one evidence-grounded, project-specific resumption point reduce reconstruction work and
> increase meaningful project advancement?

## Causal thesis

For users returning after at least 72 hours away:

> Showing one evidence-grounded, project-specific resumption point before the general agenda will
> reduce project-selection and context-reconstruction costs, increasing the probability of a
> canonical project advance within 30 minutes and reducing time to that advance.

Causal chain:

`accumulated state → grounded compression → less reconstruction → faster verified advance`

## What this experiment can and cannot establish

It can provide evidence that:

- BuildOS chooses a plausible project to resume;
- stored context can be compressed without inventing state;
- the owner orients and advances work faster;
- visible receipts support judgment rather than merely adding information.

It cannot, by itself, prove that:

- retention improved because of the card;
- all project context compounds;
- AI produces better work;
- BuildOS recalls decisions correctly;
- more receipt views equal more value;
- a directional 40-episode pilot is a powered causal result.

## The proposed treatment: Re-entry Compass

Location: `/today`, immediately below the header/attention chips and above quick capture. It appears
only for an eligible return episode.

Illustrative shape:

> **Pick up where you left off**  
> **Book launch**
>
> **Where it stands:** Draft two is complete; chapter-four revisions remain.  
> **Since you were away:** The agent added two research notes.  
> **Blocked:** Waiting on the cover quote from Sarah.  
> **Next move:** Rewrite the chapter-four opening.
>
> `[Continue next move]` `[Update this project]` `[Not this one]`
>
> From project memory, tasks, and 6 recent changes · checked 2 minutes ago

This is a cross-source re-entry action, not a new persistent memory object. The existing Start Here
document remains canonical project orientation. `/today` remains the owner of change receipts.

## Grounding contract

Every displayed claim must map to a deterministic source. Do not fill empty rows with plausible
prose.

| Displayed row             | Allowed source                                                          | Required behavior                                 |
| ------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| Where it stands           | Start Here managed `status.now`; otherwise bounded authored orientation | Omit if neither exists or is fresh enough         |
| Since you were away       | At most two actor-attributed `onto_project_logs` receipts               | Link to the underlying entity when supported      |
| Blocked / needs attention | Real blocked task, overdue task, or pending human review item           | Never infer a blocker from prose during page load |
| Next move                 | `onto_projects.next_step_short`; otherwise one mapped active task       | Preserve entity ID for the CTA                    |
| Freshness                 | Source timestamps and data-as-of time                                   | Never substitute an AI confidence score           |

Additional rules:

- Opening `/today` must not trigger an LLM call.
- A truthful two-line card is better than a complete-looking invented card.
- Omit stale or unsupported fields.
- Never select a project only because an agent recently touched it.
- Do not display “prior decision” until BuildOS has a first-class, populated, queryable decision
  path. Start Here prose is not sufficient for a deterministic decision claim.
- Provide a visible `This isn't right` path.
- Analytics may contain IDs, counts, buckets, booleans, and timestamps, but never project text.

## Actions and control

### Control

The current `/today` experience, unchanged.

### Treatment actions

- **Continue next move:** deep-link to the referenced task/entity or project while preserving focus.
- **Update this project:** open existing project-scoped chat with a draft; do not auto-send.
- **Not this one:** show another plausible project or a project chooser. Record a content-free reason:
  wrong project, already done, not important now, or inaccurate summary.
- **This isn't right:** record a trust error and allow a brief reason code without project content.

Reuse current entity-opening and project/task chat contracts. Do not build a second task or chat
system for the experiment.

## Eligibility

An eligible analytical episode requires all of the following:

- onboarding completed;
- at least one active-facing project;
- authenticated user absent for 72 hours to 30 days;
- candidate project at least three days old;
- candidate project has at least three user-originated mutations across two distinct days;
- at least one trustworthy resumption cue exists: current state, next step, or active task;
- no already-active chat or run that makes the packet immediately stale;
- no more than one analytical episode per user every seven days.

Analyze inactivity buckets separately: 3–7, 8–14, and 15–30 days. The 72-hour threshold is an
operational starting point, not a discovered universal truth.

Exclude internal/admin/test users from the primary readout. Report them separately as dogfood.

## Project-selection contract

Use a versioned deterministic ranking:

1. most recently mutated by the returning user before inactivity;
2. most recently opened project, once durable open telemetry exists;
3. most recently user-updated active project;
4. if the top projects are close or confidence is low, show a choice rather than asserting intent.

Track the ranking version, evidence coverage, whether the user switches, and which project receives
the first verified advance.

## Experimental unit and assignment

The future live pilot uses the **eligible return episode** as the assignment unit.

At BuildOS's current scale, prefer a micro-randomized crossover pilot:

- randomize the first eligible episode per user;
- alternate later eligible episodes;
- keep the assignment stable for the whole session and across devices;
- cap analytical episodes at one per user per seven days;
- analyze with user-level clustering so a power user cannot dominate.

The existing Boolean `feature_flags` table may gate the cohort, but it is not an experiment ledger.
Persist assignment, eligibility version, exposure, and outcome joins durably on the server.

Do not use client-only randomization, alternating calendar weeks, the `/today` localStorage anchor,
or consent-dependent `users.last_visit` as the authoritative assignment/eligibility system.

## Primary outcome

**Verified project advance within 30 minutes of episode assignment.**

A verified advance is a successful, canonical, human-initiated mutation such as:

- task moved to `in_progress` or `done`;
- meaningful task/document/goal/milestone/plan/risk creation or update;
- a user capture/chat produces a persisted project mutation;
- project next-step state changes.

Exclude:

- page, project, or entity opens;
- chat opens without a persisted change;
- managed Start Here refreshes and background snapshots;
- agent-only or external-agent mutations;
- edge, membership, notification, and maintenance noise;
- an action immediately undone or reversed.

Derive this outcome from `onto_project_logs` joined to the durable episode row. PostHog is a mirrored
exploration layer, not the source of truth.

## Secondary outcomes

- restricted mean time to verified advance, with non-converters censored at 30 minutes;
- any verified advance within 24 hours;
- advance on the recommended project;
- correct next-move identification in a one-question clarity check;
- number of project/entity opens before the first advance as a reconstruction-cost proxy;
- Compass action, switch, dismiss, and trust-error rates;
- return and a second verified advance within seven days;
- exploratory effects by project age, context depth, inactivity duration, and evidence coverage.

Never report time-to-action only among converters; that biases the result if treatment changes who
converts.

## Guardrails and stop rules

| Risk                       | Guardrail / stop rule                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Wrong project              | Track switch/dismissal and advances elsewhere; stop if wrong-project/dismissal exceeds 30% after 15 treatment episodes |
| Unsupported or stale claim | Two credible severe grounding errors pause the pilot immediately                                                       |
| Harmful action             | Track seven-day reversals; stop if reversal rate rises by 10 percentage points                                         |
| Page performance           | Lazy-load treatment; stop if `/today` p95 regresses by more than 500 ms                                                |
| Attention cost             | Track card dismissal and cannibalization of agenda/quick-capture actions                                               |
| Privacy                    | Never send project text to product analytics                                                                           |
| Spend                      | No LLM generation at page-open time                                                                                    |
| Internal-user distortion   | Report internal and external cohorts separately                                                                        |

## Instrumentation contract

### Durable authenticated session signal

Create or reuse a server-recorded authenticated product-session signal written once per session.
The assignment transaction must read the previous session time before recording the new session.

### Durable episode record

At minimum persist:

- `experiment_key`, `experiment_version`, `episode_id`, `user_id`, `variant`;
- `assigned_at`, prior active timestamp, inactivity bucket;
- selected project ID, selection version, eligibility version;
- context-depth bucket and source-availability booleans;
- data-as-of timestamp and internal/test-user flag;
- render/exposure state and failure reason.

### Content-free events

- `reentry_packet_rendered`;
- `reentry_packet_action`;
- `reentry_project_switched`;
- `reentry_packet_dismissed`;
- `reentry_truth_error_reported`;
- `reentry_clarity_answered`.

Count a treatment render only when at least half the card is visible for 500 ms. Keep assignment as
the intention-to-treat denominator even if rendering fails.

## Phase plan and gates

### Phase 0 — baseline, routing, and truth audit

Purpose: determine whether the premise and data sources are strong enough to justify a live surface.

Work:

1. Re-audit all auth/login/OAuth/post-onboarding return routes. Finish or explicitly account for any
   `/dashboard` defaults before interpreting `/today` exposure.
2. Verify production PostHog ingestion, but create durable experiment storage regardless.
3. Operationalize current return episodes, verified advances, and time-to-advance.
4. Generate 20 offline Compass packets for real, non-internal dormant projects without changing
   production UI.
5. Blind-score project selection, grounding, source coverage, staleness, and CTA validity.
6. Record the current control's 30-minute advance rate and restricted time-to-advance.

Gate to Phase 1 only if:

- at least 80% of packets contain a trustworthy current state or next move;
- at least 16/20 choose an appropriate project;
- zero severe unsupported claims occur;
- packet assembly does not block or materially slow the base agenda.

Kill or simplify if the current `/today` control already creates a verified advance within five
minutes for most eligible returns. In that case, routing users to the shipped surface may be the
better product decision.

### Phase 1 — counterbalanced moderated study

Purpose: validate orientation, selection, and trust before durable live assignment.

Cohort: 8–12 non-internal users using real dormant projects.

Protocol:

1. present current and Compass views in counterbalanced order across different projects;
2. ask the user to choose what to resume;
3. ask them to state where it stands and what needs attention;
4. ask them to make one real update;
5. record correctness, time, assistance, switch behavior, and trust.

Gate to live implementation only if:

- treatment reduces median correct-orientation time by at least 30%;
- at least 75% correctly identify a next move without assistance;
- at least 60% say the card reduced reconstruction work;
- wrong-project selection is below 15%;
- no severe truth error occurs.

If one row creates nearly all the value, reduce the treatment to that row before building more.

**DJ approval is required before Phase 2 production assignment.**

### Phase 2 — directional episode-randomized pilot

Run for at most eight weeks or 40 eligible episodes, whichever comes first. This phase produces
directional product evidence, not a powered significance claim.

Potential ship signal:

- at least +15 percentage points in verified-advance rate;
- at least 20% reduction in restricted mean time-to-advance;
- no increase in seven-day reversals;
- truth-error rate below 10%;
- effect visible among non-internal users.

If 40 episodes are neutral, do not globalize the card. Preserve the instrumentation and diagnose
project selection, source quality, or whether action proximity—not synthesis—is the missing piece.

### Phase 3 — powered causal test, only after acquisition supports it

Re-estimate baseline and minimum detectable effect from the directional pilot. Pre-register the
analysis before a full randomized test. Do not claim causal proof until the unique-user and episode
denominators support it.

## Implementation work packages, if the gates authorize them

### W1 — experiment/session substrate

- durable authenticated-session signal;
- durable assignment/exposure record;
- cohort/internal-user gates;
- idempotent assignment transaction;
- content-free analytics mirroring.

### W2 — deterministic Compass service

Create a server-side service responsible for:

- eligibility;
- candidate selection and ranking version;
- evidence packet assembly;
- source IDs and freshness;
- atomic assignment;
- explicit omission/fallback reasons.

No LLM dependency is permitted in the request path.

### W3 — lazy endpoint and UI

- lazy `/today` request so the agenda renders independently;
- `ReentryCompass.svelte` or the locally appropriate component;
- reuse current entity-link and focused-chat contracts;
- accessible project choice, dismissal, and error reporting;
- mobile and keyboard verification.

### W4 — outcome/readout job

- join episode rows to qualifying `onto_project_logs` mutations;
- exclude automatic and agent-only noise;
- calculate intention-to-treat outcomes and restricted time-to-advance;
- report raw episodes, unique users, internal/external split, guardrails, and every truth error.

## Verification requirements

- unit tests for eligibility, ranking ties, source omission, freshness, and assignment stability;
- tests proving no unsupported row renders and no LLM call is made;
- integration tests for treatment/control, lazy failure fallback, and content-free events;
- outcome-query fixtures covering valid advances, excluded maintenance, agent-only changes, undo, and
  cross-project advances;
- Svelte checks and focused component tests for any changed UI;
- manual mobile and keyboard walkthrough;
- production smoke confirming the control remains unchanged for ineligible users.

## Required artifacts and handoff

The owning agent must leave:

1. a dated Phase 0 evidence report with the 20-packet rubric and raw aggregate counts;
2. a pre-registered moderated protocol before running Phase 1;
3. a decision packet marking the hypothesis **corroborated / falsified / unresolved**;
4. if Phase 2 is authorized, a versioned experiment spec and reproducible outcome query;
5. a one-page DJ brief stating what changed, what did not, and the next irreversible decision.

Do not mark this tasker complete because a card rendered. Completion means the experiment produced
a defensible decision and no required phase remains authorized and unfinished.

## Cheaper alternatives to prefer if the full treatment fails

1. Finish return routing and measure the current `/today` experience.
2. Add only a `Resume` CTA to current project-grouped receipts.
3. Link the selected project directly into the existing Project Memory card.
4. Improve underlying Start Here quality instead of adding another surface.
5. Run a separate decision-recall experiment only after Decisions are first-class.

## Exit condition

This task exits with one of three explicit decisions:

- **Ship/continue:** grounded Compass materially improves verified re-entry without trust or latency
  harm;
- **Simplify:** one smaller action/row earns the value and the larger card is rejected;
- **Kill/park:** current surfaces perform as well, source quality is insufficient, traffic cannot
  support the next phase, or the treatment creates distrust or attention cost.
