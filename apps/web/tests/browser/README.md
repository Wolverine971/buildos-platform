# Isolated browser smoke — paused

Paused at the user's request on 2026-10-26 because browser builds/runs slowed the laptop.
Do not resume browser development or execution without the user resuming this work.
This harness is excluded from Vitest and is not wired into required CI checks.

The runner copies the app into a temporary directory, supplies synthetic environment values,
builds selected real routes, starts a local Auth/PostgREST fixture and uses one Chromium worker.
External Node connections and browser HTTP requests are blocked; no production credentials
are inherited. This is application-wiring coverage, not a real database/RLS or model test.

## Current evidence

- The selected-route production build completed.
- Real login UI reached Today with fixture authentication and survived reload.
- The task-edit journey is failing, so the suite does not pass.
- Project editing, invite acceptance, chat send/stop/reopen, and mobile geometry are unfinished.

## Remaining work when resumed

1. Include the task-full, voice-note cleanup and Agent Run summary routes in the build;
   implement their fixture reads, including the task's project relation.
2. Correct the task journey: the Today action opens a reader; use **Edit details**, then the
   modal's **Save** button. Verify persistence after reload and assert fixture/browser errors.
3. Add project editing and invite acceptance journeys with persisted fixture state.
4. Script the current worker admission/reconciliation/cancellation protocol for chat;
   the retired streaming endpoint must not be used as the test seam.
5. Add mobile action-target measurements and validate both configured projects.
6. Only after all journeys pass, consider a separate CI lane and failure-artifact upload.

The manual entry point is `pnpm test:browser:smoke`; it performs a build and launches Chromium.
It is intentionally absent from `verify`, `verify:ci`, and CI while this work is paused.
