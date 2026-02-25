<!-- apps/web/docs/features/onboarding-v2/README.md -->

# Onboarding V2 (Legacy Archive)

**Last Updated**: February 16, 2026  
**Status**: Deprecated (Replaced by Onboarding V3)  
**Category**: Historical Reference

---

## Current State

Onboarding V2 is no longer the active onboarding experience.

As of **February 16, 2026**, the app uses the V3 flow at `/onboarding`.

- Active flow docs: `apps/web/docs/features/onboarding/README.md`
- V3 spec: `docs/specs/ONBOARDING_BEHAVIORAL_SEED_SPEC.md`

---

## What Was Removed

The previous multi-step V2 onboarding UI was retired.

Deleted V2 components:

- `WelcomeStep.svelte`
- `CapabilitiesStep.svelte`
- `FlexibilityStep.svelte`
- `PreferencesStep.svelte`
- `CombinedProfileStep.svelte`
- `AdminTourStep.svelte`
- `SummaryStep.svelte`
- `ProgressIndicator.svelte`
- `NotificationsStep.svelte`

Deleted service:

- `apps/web/src/lib/services/onboarding-v2.service.ts`

The old `?v2=true` route toggle is no longer used.

---

## What Was Retained

Two V2 assets are still reused in V3:

- `apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte`
    - reused as the V3 brain-dump/projects step
- `apps/web/src/lib/components/onboarding-v2/PhoneVerificationCard.svelte`
    - reused by V3 notifications setup

---

## Historical Context

If you need prior implementation details for audits or migration history, see:

- `apps/web/docs/features/onboarding/ONBOARDING_V2_UPDATE_ASSESSMENT.md`
- `apps/web/docs/features/onboarding/ONBOARDING_V2_UPDATED_SPEC.md`
- `docs/archive/apps-web/docs/features/onboarding-v2/calendar-connection-cta-spec.md`

These are historical docs and may describe components/services that no longer exist in the runtime flow.
