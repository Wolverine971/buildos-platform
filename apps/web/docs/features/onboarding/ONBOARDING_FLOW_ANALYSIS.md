<!-- apps/web/docs/features/onboarding/ONBOARDING_FLOW_ANALYSIS.md -->

# Onboarding Flow Analysis

Date: 2025-10-21
Scope: Current onboarding (v1) and onboarding v2 (feature-flagged via query param).

## Entry points and routing

- Primary route: `/onboarding` in `apps/web/src/routes/onboarding/+page.svelte`.
- V2 flag: `?v2=true` switches the route to the v2 flow (client-side check).
- Home modal: `apps/web/src/lib/components/onboarding/OnboardingModal.svelte` is shown on `/` when `completed_onboarding` is false and onboarding progress is low (see `apps/web/src/routes/+layout.svelte`).
- Navigation CTA: `apps/web/src/lib/components/layout/Navigation.svelte` shows a "Personalize/Setup" CTA when onboarding is incomplete.

## Current onboarding flow (v1)

### UI and steps

Location: `apps/web/src/routes/onboarding/+page.svelte` (the `{:else}` block).

Steps (4):

1. Projects (`input_projects`)
2. Work style (`input_work_style`)
3. Challenges (`input_challenges`)
4. Help focus (`input_help_focus`)

Each step includes:

- A question, examples, and a textarea.
- Optional voice capture with `startRecording/stopRecording` that posts to `/api/transcribe`.
- Clickable progress dots to jump between steps.

### Data flow and persistence

- Auto-save (debounced, 1.5s) uses `POST /api/onboarding` with `action: save_inputs`.
- Server mapping lives in `apps/web/src/lib/server/onboarding.service.ts` and writes to the `user_context` table columns `input_projects`, `input_work_style`, `input_challenges`, `input_help_focus`.
- The server loader `apps/web/src/routes/onboarding/+page.server.ts` loads `user_context` and sets `recommendedStep` to the first empty input.
- Progress shown in layout comes from `OnboardingProgressService` which reads `user_context` (see `apps/web/src/routes/+layout.server.ts`).

### Completion behavior

- The UI enables "Complete Setup" only on the last step when that step has content.
- Completion posts `POST /api/onboarding` with `action: complete`.
- `OnboardingServerService.completeOnboarding` sets `user_context.onboarding_completed_at` and queues an onboarding analysis job via `RailwayWorkerService.queueOnboardingAnalysis`.
- The page shows a success screen and redirects to `/` after ~2 seconds.

### Observations

- Completion gating only checks the last step input; earlier steps can be empty and still allow completion.
- `OnboardingServerService.completeOnboarding` does not update `users.completed_onboarding` in code, but the layout relies on that flag. If there is no DB trigger, a user can complete v1 but still be treated as not onboarded.
- The server redirect in `+page.server.ts` only happens when `onboarding_completed_at` is set and progress is 100%, so partial completion can still show the flow.

## Onboarding v2 flow (feature-flagged)

### UI and steps

Location: `apps/web/src/routes/onboarding/+page.svelte` (the `{:else if useV2}` block).

Steps (7):

0. Welcome (`WelcomeStep.svelte`)
1. Clarity - Projects & brain dump (`ProjectsCaptureStep.svelte`)
2. Focus - Notifications (`NotificationsStep.svelte`)
3. Flexibility (`FlexibilityStep.svelte`)
4. Profile - Archetype + challenges (`CombinedProfileStep.svelte`)
5. Admin tour (`AdminTourStep.svelte`)
6. Summary (`SummaryStep.svelte`)

Steps are defined in `apps/web/src/lib/config/onboarding.config.ts` and displayed by `ProgressIndicator.svelte`.

### Data flow and persistence

Step 1 (ProjectsCaptureStep):

- Creates projects by sending the brain dump to `brainDumpService.parseBrainDumpWithStream` (auto-accepts results).
- Optional Google Calendar connection via `/profile/calendar` and connection status check via `/api/calendar`.
- Optional calendar analysis via notification stack (`startCalendarAnalysis`).
- Passes `projectsCreated` count back to the parent for summary only.

Step 2 (NotificationsStep):

- Phone verification handled by `PhoneVerificationCard.svelte` and `smsService`.
- Saves SMS preferences to `/api/sms/preferences`.
- Saves daily brief preferences to `/api/notification-preferences`.
- Marks SMS setup skipped via `onboardingV2Service.markSMSSkipped`.

Step 4 (CombinedProfileStep):

- Saves `users.usage_archetype` and `users.productivity_challenges` via `OnboardingV2Service`.

Step 6 (SummaryStep):

- Calls `OnboardingV2Service.completeOnboarding` which sets `users.onboarding_v2_completed_at` and `users.completed_onboarding`.
- Redirects to `/`.

### Observations

- V2 progress and resume are not persisted; refresh resets to step 0 even though `OnboardingV2Service` has `getProgress`.
- Calendar skip state is not tracked (no call to `markCalendarSkipped`).
- `calendarAnalyzed` in the summary payload never gets updated by `ProjectsCaptureStep`.
- V2 does not write the 4-question inputs into `user_context`, so the v1 analysis job does not run on v2 completion.
- Assets are still placeholder-driven (`ONBOARDING_V2_CONFIG.features.showPlaceholderAssets` is true), and the checklist in `ONBOARDING_ASSETS_CHECKLIST.md` shows many missing assets.

## Supporting services and jobs

- `OnboardingProgressService` (server) computes progress from `user_context` inputs and drives layout-level onboarding status.
- `OnboardingServerService.completeOnboarding` queues an "onboarding_analysis" job; worker code lives in `apps/worker/src/workers/onboarding/*` and generates personalized questions.

## Key inconsistencies to resolve

- V1 completion updates `user_context` only; v2 completion updates `users.completed_onboarding`. If no DB trigger exists, v1 completions may never mark users as "completed" for layout/nav gating.
- V1 completion criteria in UI (last-step-only) conflicts with `OnboardingProgressService` expectations (all 4 inputs).
- V2 does not persist step progress or calendar skip state, and summary data is partially local-only.
- Progress categories in `OnboardingProgressService` reference fields that do not exist in `ALL_FIELDS`, so category percentages may always be 0.

## File map

- Route + flow switch: `apps/web/src/routes/onboarding/+page.svelte`
- V1 server loader: `apps/web/src/routes/onboarding/+page.server.ts`
- V1 API: `apps/web/src/routes/api/onboarding/+server.ts`
- V1 server service: `apps/web/src/lib/server/onboarding.service.ts`
- V2 config: `apps/web/src/lib/config/onboarding.config.ts`
- V2 services: `apps/web/src/lib/services/onboarding-v2.service.ts`
- V2 steps: `apps/web/src/lib/components/onboarding-v2/*`
- Progress and gating: `apps/web/src/routes/+layout.server.ts`, `apps/web/src/routes/+layout.svelte`, `apps/web/src/lib/services/onboardingProgress.service.ts`
