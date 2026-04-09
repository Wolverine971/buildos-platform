<!-- apps/web/docs/features/onboarding/ONBOARDING_FIRST_BRAINDUMP_REBUILD_SPEC.md -->

# Onboarding First Brain Dump Rebuild Spec

**Date**: 2026-04-08  
**Status**: Draft  
**Owner**: Product / Growth / Web  
**Scope**: Active Onboarding V3 flow at `/onboarding`

---

## 1. Summary

The active onboarding flow already asks for intent and stakes, but the current Step 2 does not actually help the user complete a first brain dump. The reused `ProjectsCaptureStep.svelte` is still a tutorial-heavy V2 artifact: it explains chat modes, shows screenshots, and exposes a calendar CTA, but it does not render an inline capture experience and it allows the user to continue with `projectsCreated = 0`.

This rebuild turns Step 2 into a real activation step:

1. The user must complete one inline first brain dump before moving on, unless their intent is `explore`.
2. The UI shows the transformation directly in the step using the landing-page "raw input -> structured output" composition.
3. Calendar connection becomes the immediate follow-up CTA after the first project is created, not the thing that replaces the first project.

This is still one route step in V3, but inside the component it becomes a two-phase experience:

1. `Dump what's in your head`
2. `Make it real with your calendar`

---

## 2. Problem Statement

### Current gaps in the active flow

- `apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte`
    - Uses onboarding real estate on screenshots and tutorial copy.
    - Does not render a text area or voice-first capture input.
    - Accepts continue without creating a project.
    - Never calls `onProjectsCreated(...)` even though the prop exists.
- `apps/web/src/routes/onboarding/+page.svelte`
    - Treats Step 2 as completed when `onNext()` fires, regardless of whether any project exists.
- `apps/web/src/routes/api/onboarding/+server.ts`
    - `complete_v3` accepts `projectsCreated: 0` for every intent.

### Why this matters

BuildOS value is not "watch a tutorial." The value is "I dumped messy thinking into the product and it shaped something real." The onboarding step needs to create that proof immediately.

Calendar should amplify that first win, not compete with it. Asking for calendar first or making it the dominant action before capture hides the actual product magic.

---

## 3. Product Goals

### Primary goal

Increase the share of new users who create at least one real structured project during onboarding.

### Secondary goals

- Increase calendar connection rate after the first project is created.
- Reduce the time from signup to first structured project.
- Make the step visually consistent with the landing page promise.
- Preserve the reduced-friction V3 philosophy: teach by doing, not by explaining.

### Non-goals

- Reworking the overall 4-step V3 flow.
- Redesigning notifications or ready/completion steps.
- Replacing the full agent-chat project creation flow at `/projects/create`.
- Unifying every brain-dump entry point in this pass.

---

## 4. Scope

### In scope

- Rebuild `ProjectsCaptureStep.svelte` for the active V3 onboarding route.
- Require one successful first project creation for non-`explore` users.
- Add a post-dump calendar connection / analysis phase inside the same step.
- Persist the substep state across Google Calendar OAuth redirects.
- Update onboarding completion validation so the UI is not the only gate.

### Out of scope

- `/projects/create`
- nav "Brain Dump & Chat" modal
- `/welcome-back`
- welcome email copy
- calendar analysis model behavior

---

## 5. Experience Principles

1. **Show the transformation, do not describe it.**  
   The user should see raw input on one side and structured output on the other.

2. **The first dump is the activation moment.**  
   Calendar is important, but it comes after the first created artifact.

3. **Keep the screen focused.**  
   Move the current tutorial material behind a compact "Need help?" disclosure or remove it from this step entirely.

4. **Use one strong primary action at a time.**  
   Before project creation: `Shape my first project`. After success: `Connect Google Calendar` or `Analyze my calendar`.

5. **Never lose progress on OAuth redirect.**  
   If the user connects calendar, they must return to the created-project state, not a blank step.

---

## 6. Proposed User Flow

### Active V3 step structure

The route stays the same:

1. Intent + Stakes
2. Projects / Brain Dump
3. Notifications
4. Ready

### Internal structure of Step 2

#### Phase 1: First brain dump

- Header: `Dump what's in your head. BuildOS will shape it.`
- Subcopy: one short sentence explaining that this is the fastest way to get useful structure into BuildOS.
- Layout:
    - Left: raw input composer
    - Right: structured output preview / result panel

#### Phase 2: Calendar follow-up

- Only shown after Phase 1 succeeds.
- If calendar is not connected:
    - show value card and `Connect Google Calendar` primary CTA
- If calendar is connected:
    - show `Analyze my calendar` primary CTA
- If analysis is running or complete:
    - show inline progress/results beneath the created project summary

### Continue rules

- `intent !== 'explore'`
    - Cannot continue to Step 3 until at least one project is created successfully.
- `intent === 'explore'`
    - May skip the step entirely.
    - If they start the brain dump flow, same UX applies, but skipping remains available.

---

## 7. UX Specification

### 7.1 Header and framing

Replace the current Step 2 heading.

**Old**

- `Meet Your AI Assistant`

**New**

- `Dump what's in your head. BuildOS will shape it.`

**Support copy**

- Default: `Write it messy. Projects, worries, deadlines, half-formed ideas. We'll turn it into something you can work with.`
- `explore` intent variant: `Try one real dump if you want to see the product work. You can also skip for now.`

### 7.2 Layout

Desktop:

- Two-column split inside a single bounded card
- Left column slightly wider than right

Mobile:

- Stacked layout
- Composer first
- Structured preview second

### 7.3 Left column: composer

Required elements:

- Large multiline text area
- Intent-aware placeholder from `ONBOARDING_V3_CONFIG.brainDumpPrompts`
- Small prompt chips below the input for users who freeze at blank states
- Primary CTA: `Shape my first project`
- Secondary affordance: `Need an example?`

Optional in v1 if reuse is cheap:

- Voice input button using existing transcription flow

Suggested prompt chips:

- `What are you trying to finish?`
- `What feels messy right now?`
- `What deadlines or meetings matter?`
- `What have you already started?`

### 7.4 Right column: transformation panel

This should visually mirror the landing page hero in `apps/web/src/routes/+page.svelte`:

- top label bar like `Raw thinking -> structured plan`
- left-side raw text styling
- right-side structured output styling

States:

1. **Empty**
    - show a static example based on current intent or a general example
2. **Typing**
    - keep example structure visible; do not attempt premature AI generation
3. **Processing**
    - show skeleton sections for project, tasks, docs, next steps
    - show streaming/progress text
4. **Success**
    - replace the static example with the actual created result summary

### 7.5 Success state

After a successful first brain dump:

- Show created project name
- Show counts for tasks/goals/docs if available
- Show 3-5 created items max
- Show a short confirmation line:
    - `You have your first project. Now let's place it in the reality of your week.`

Primary CTA should move to the calendar action below.

### 7.6 Calendar follow-up block

This block sits directly below the success state, not above the composer.

#### Not connected

Title:

- `Connect your calendar so BuildOS can work around real life`

Value bullets:

- Find open time around your existing commitments
- Detect recurring work from meetings
- Make scheduling suggestions based on actual availability

Actions:

- Primary: `Connect Google Calendar`
- Secondary: `Skip for now`

#### Connected, not analyzed

Title:

- `Want BuildOS to scan your calendar for project signals and open time?`

Actions:

- Primary: `Analyze my calendar`
- Secondary: `Continue without analysis`

#### Analyzing / complete

- Reuse the existing calendar-analysis workflow.
- Prefer inline embedded results using `CalendarAnalysisResults.svelte` instead of pushing the user to the bottom-right notification tray alone.
- Notification behavior can remain for background continuity, but onboarding should not rely on it as the primary surface.

---

## 8. Content Rules

### What to remove from this step

- The screenshot-heavy "Where to Find It"
- The four chat modes explainer
- The voice tutorial screenshot block

Those assets can live in docs/help, a later empty-state, or a collapsed help disclosure. They should not occupy the main path to activation.

### Tone

- No "meet your AI assistant" framing
- Focus on clarity, shaping, structure, and getting thoughts out
- Calendar copy should sound like support, not surveillance

---

## 9. Technical Approach

### 9.1 Brain dump pipeline decision

Use the existing parse-and-apply brain dump pipeline, not the lightweight `POST /api/onto/braindumps` capture endpoint.

#### Reason

`/api/onto/braindumps` only stores the raw dump and generates title/topics/summary asynchronously. It does **not** create the structured project outcome needed for onboarding activation.

For onboarding we need:

- a created project
- created tasks/goals/docs where applicable
- immediate visible proof
- counts that feed `ReadyStep`

The existing `brainDumpService.parseBrainDumpWithStream(...)` + `brainDumpService.saveBrainDump(...)` stack already supports that.

### 9.2 Component strategy

Replace the current body of `apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte` with a focused onboarding-specific implementation.

Do **not** embed the entire agent-chat modal here.

Recommended structure:

- onboarding-specific wrapper component remains `ProjectsCaptureStep.svelte`
- inside it, use:
    - inline composer state
    - existing brain dump services
    - simplified success summary UI
    - calendar follow-up block

### 9.3 State model

The step needs explicit internal phase state, for example:

- `phase = 'editing' | 'processing' | 'project_created' | 'calendar'`
- `brainDumpText`
- `brainDumpId`
- `createdProjectSummary`
- `createdProjectIds`
- `ontologyCounts`
- `calendarConnectionStatus`
- `calendarAnalysisStatus`

### 9.4 Persistence across OAuth

Current route-level session persistence in `apps/web/src/routes/onboarding/+page.svelte` only saves the coarse step and V3 summary fields.

Extend persisted onboarding state to include Step 2 substate:

- draft text
- created project counts / ids
- current internal phase
- whether the user has already completed Phase 1

Requirement:

- If the user clicks `Connect Google Calendar`, completes OAuth, and returns to `/onboarding`, the screen must restore the created-project success state and reopen into the calendar phase.

### 9.5 Server-side enforcement

UI gating is insufficient.

Update `POST /api/onboarding` `complete_v3` validation to reject non-`explore` completions when `projectsCreated < 1`.

Recommended rule:

- `intent === 'explore'`: `projectsCreated >= 0`
- all other intents: `projectsCreated >= 1`

This prevents accidental or programmatic completion without a first project.

### 9.6 Ready-step compatibility

`ReadyStep.svelte` already expects:

- `projectsCreated`
- `tasksCreated`
- `goalsCreated`

The rebuilt Step 2 should continue populating these values via `onProjectsCreated(...)`.

No major `ReadyStep` redesign is required for the first implementation.

---

## 10. Implementation Outline

### Files expected to change

- `apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte`
- `apps/web/src/routes/onboarding/+page.svelte`
- `apps/web/src/routes/api/onboarding/+server.ts`
- `apps/web/src/routes/api/onboarding/server.test.ts`

Likely supporting changes:

- add a small onboarding brain-dump result summary component if `ProjectsCaptureStep` becomes too large
- optionally reuse `CalendarAnalysisResults.svelte` in embedded mode

### Recommended sequence

1. Rewrite `ProjectsCaptureStep` around the inline composer and result preview.
2. Hook it to the existing brain dump parse/save pipeline.
3. Feed success counts into `onProjectsCreated(...)`.
4. Add internal calendar phase and OAuth restore.
5. Tighten `complete_v3` server validation.
6. Add tests.

---

## 11. Analytics and Success Metrics

### Product metrics

- `% of new non-explore signups who create >= 1 project during onboarding`
- `% of users who reach calendar CTA after first project creation`
- `% of users who connect calendar after first project creation`
- median time from landing on Step 2 to first project created
- Step 2 drop-off rate

### Suggested events

- `onboarding_brain_dump_viewed`
- `onboarding_brain_dump_started`
- `onboarding_brain_dump_submitted`
- `onboarding_brain_dump_project_created`
- `onboarding_calendar_cta_viewed`
- `onboarding_calendar_connect_clicked`
- `onboarding_calendar_connected`
- `onboarding_calendar_analysis_started`
- `onboarding_step2_skipped`

---

## 12. Testing Requirements

### Unit / integration

- non-`explore` users cannot continue without a created project
- `explore` users can skip
- successful brain dump calls `onProjectsCreated(...)`
- OAuth redirect restoration preserves Step 2 success state
- `complete_v3` rejects invalid non-`explore` payloads with `projectsCreated = 0`

### Manual QA

1. `organize` user creates first project, skips calendar, completes onboarding
2. `plan` user creates first project, connects calendar, returns from OAuth, sees restored state
3. already-connected calendar user creates first project, runs calendar analysis, sees inline result
4. `explore` user skips step without creating a project
5. brain dump parse/save failure shows retry path without losing text

---

## 13. Risks and Mitigations

### Risk: onboarding Step 2 becomes too heavy again

Mitigation:

- keep the tutorial content out of the main path
- limit screen to composer, proof, calendar follow-up

### Risk: OAuth redirect drops the created-project context

Mitigation:

- persist internal substate before redirect
- restore it on mount before re-checking calendar status

### Risk: calendar analysis distracts from the first win

Mitigation:

- only show calendar as a follow-up after successful project creation
- keep it optional

### Risk: parser errors create a dead end

Mitigation:

- preserve draft text
- expose inline retry
- allow fallback continue only for `explore`

---

## 14. Decisions

### Decision 1

The active target is **Onboarding V3 Step 2**, not legacy V2.

### Decision 2

The first brain dump is **required for non-explore users**.

### Decision 3

Calendar is the **primary follow-up CTA**, not the primary onboarding action.

### Decision 4

The implementation should reuse the **existing brain dump project-creation pipeline**, not the lighter `onto_braindumps` capture-only endpoint.

### Decision 5

Enforcement must exist in both the **UI** and the **`complete_v3` API contract**.

---

## 15. Follow-up Work After This Spec

Once this ships, the next likely follow-ups are:

- rescue / re-entry flow for users who skipped or abandoned Step 2
- welcome email links that deep-link back into the first brain dump state
- public/shareable "before -> after" artifact from the created first project
- aligning `/welcome-back` and `/projects/create` with the same transformation framing
