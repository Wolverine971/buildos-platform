<!-- apps/web/docs/technical/components/hyperplexed/ONBOARDING_ACTIVATION_POLISH_2026-09-09.md -->
<!-- doc-status: point-in-time -->

# Onboarding activation polish — 2026-09-09

Implementation follow-up to the onboarding/first-run audit and the [original onboarding audit](../../audits/ONBOARDING_AUDIT_2026-06-26.md). This pass fixes the activation flow, recovery paths, and first Today handoff. It does not introduce sample workspaces, a tutorial checklist, or change the agent's project-generation contract.

## Core insight

The first win is not finishing a form. It is seeing your own words become a saved project with useful structure, durable context, and one next move. Optional setup must not obscure that win, and every progress or success claim must describe confirmed state.

## Implemented

| Finding                                                                      | Resolution                                                                                                                                                                                                                                                                                             | Patterns       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| Navigation, step rail, and completion disagreed                              | One V3 milestone model: 0/25/50/75, then 100 only after a successful completion commit. Revisiting a step does not roll progress back.                                                                                                                                                                 | P22            |
| Tab-only state expired and could cross accounts                              | Server stores the saved milestone and selected project; account-scoped local drafts last seven days. Sign-out clears current and legacy onboarding storage. Root content remounts on identity changes.                                                                                                 | P22            |
| Preference failures looked successful                                        | Hydrate saved settings, activate brief generation before delivery, inspect every write, expose partial results, and offer explicit retry/continue-with-confirmed-settings choices. Unknown recovery state cannot be accepted as saved.                                                                 | P19/P22        |
| Phone verification could misformat +1 numbers or treat opt-out as permission | Preserve all ten national digits, reject invalid lengths/codes, guard duplicate sends, and keep opted-out numbers disabled with a skip path.                                                                                                                                                           | P13/P22        |
| Existing projects bypassed the transformation receipt                        | Created and resumed projects use the same activation packet and real counts. Failed summaries have retry and choose-another-project recovery.                                                                                                                                                          | P20/P22        |
| The receipt omitted source/missing-memory context                            | Shared receipt shows an excerpt of the original input when retained, generated structure, Start Here context, and the next move. Missing or stale previews are explicit, without nested scrolling.                                                                                                     | P4/P20         |
| Calendar competed with the main action                                       | Calendar connection and analysis are optional secondary actions; progress/results stay inline. OAuth return restores the receipt, and analysis may continue in the background.                                                                                                                         | P1/P20         |
| Ready mixed activation with advanced configuration                           | Removed public-username and agent-key setup from Ready; those remain in Profile. Ready reviews the saved project and real notification state.                                                                                                                                                          | P1/P4          |
| Completion raced redirects and announced success early                       | Guard duplicate submits, await the commit, clear only the current account's onboarding drafts, and navigate directly to Today with the selected project. If navigation fails after saving, show 100% and an Open Today link without resubmitting.                                                      | P22            |
| Today lost the first next move and discarded input early                     | Authorized activation marker promotes the project's next move. Empty workspaces open `project_create` with the original input; canceled processing preserves it. Successful creation displays the receipt and project action, even when the feed refresh fails. Unavailable receipts can be dismissed. | P1/P20/P22     |
| Registration/skip paths lost context                                         | Registration aliases preserve invitation/attribution queries. Incomplete users retain a setup entry outside the dismissible welcome modal.                                                                                                                                                             | P13/P22        |
| Small-screen and accessibility polish                                        | Shared icon imports, reduced-motion handling, explicit selection states, stable keyed choices, 44px controls, step-heading focus/scroll reset, and non-colliding 320px navigation.                                                                                                                     | P9/P11/P13/P26 |

One earlier audit inference was corrected: Svelte effects track state read inside synchronously called functions. Calling a persistence helper inside an effect was not, by itself, evidence that counts failed to persist. The actual fixes address ownership, durability, and loading real counts on resume.

## Persistence and performance

- Migration: `supabase/migrations/20260909194302_onboarding_activation_progress.sql` adds `users.onboarding_step` and nullable `users.onboarding_project_id`, a bounded step constraint, an indexed foreign key with `ON DELETE SET NULL`, and conservative legacy backfill.
- Progress writes use the authenticated account, validate project membership, and cannot reduce a later milestone. Explorers can explicitly clear a stale project selection.
- Existing user/project RLS is unchanged; client state is never authorization.
- Layout and onboarding reuse the profile already read by `safeGetSession`. This removes the separate progress query, stale progress TTL, duplicate onboarding profile read, and unused user-context read.
- Delivery preference writes are serialized because the endpoint also derives shared notification subscriptions. Independent SMS reminder persistence remains parallel.
- Raw drafts remain on the current device. Cross-device resume restores committed milestones and the project, not unsubmitted text.

## Verification

- 51 focused tests across milestone math/storage, progress authorization, API validation, route/alias behavior, notifications, phone verification, Ready completion, activation packets, and Today feeds.
- Full `pnpm --filter @buildos/web check`: zero errors and warnings after sequentially building workspace dependencies and supplying the checked-in example environment for local validation.
- Svelte autofixer reviewed every changed component. New components/flow report no structural issues. Existing root JSON-LD is serialized through `serializeJsonLd`; generic effect/collection suggestions were reviewed rather than mechanically rewritten.
- Migration executed against a disposable local PostgreSQL 16 database: fresh defaults, legacy backfill, range checks, foreign-key enforcement, and deletion recovery all passed. The disposable database was removed; no application database was changed.
- Real components were mounted in a temporary local Vite harness with simulated API responses. Browser checks covered 320/390px phones and 1280px desktop, light/dark, draft cancellation/reload, source-to-receipt creation, existing-project resume, missing memory, summary failure/retry, preference failure/retry, completion failure/retry, OAuth-return restoration, inline calendar results, and first Today states. This is component/contract verification, not a live authenticated end-to-end claim.
- Playwright's screenshot capture timed out in this environment; the in-app browser supplied visual inspection. Temporary harness files are not production changes.

## Deployment boundary

Apply the new database migration before deploying the application changes. Then smoke-test a fresh authenticated account and a resumed account against the real backend, including actual project creation, Google OAuth, and SMS verification/delivery. These external-service checks require configured credentials and authorized test accounts; this pass did not connect a real calendar, send texts, or mutate production.

## Project creation follow-up — local main, 2026-09-09

Implemented directly in `/Users/djwayne/buildos-platform` on `main`, building on the committed
onboarding work above. All changes remain uncommitted for review; existing unrelated changes were
preserved. This follow-up adds no migration and does not change the agent's generation contract.

### Findings and changes

- **Launch language — P6:** the selector called creation “Project setup,” while the shared header
  called it “New project flow.” The composer selected its creation prompt from that display string.
  The shared context now says “Create a project,” and the composer uses `project_create` semantically.
  The Projects empty state promises goals, tasks, and saved context rather than guaranteed milestones.
- **Send/admission — P20/P30:** the first network operations had no visible acknowledgement, and the
  send lock was released before admission returned. Added immediate “Sending your message…” feedback,
  a reduced-motion-safe spinner, a polite announcement, and a lock through acceptance/failure.
  Closing during this state now uses the existing park path.
- **Detached completion — P22/P30:** onboarding and Today previously treated close-time mutations as
  the creation result; closing before creation could leave the original draft ready to submit again.
  Both hosts now persist the original session/source in their existing account-scoped, expiring draft
  storage. A shared recovery component checks that session and resumes it without an automatic send.
  While active it uses the lightweight worker endpoint; at rest it loads the existing session parser's
  successful creation results. Polling backs off from 5s to 15s, stops after 20 active checks, pauses
  while chat is open, and aborts on unmount. Failed/unknown checks never imply completion.
- **Saved receipt — P1/P4/P13/P22:** shared-chat project results now have a named saved-project card,
  exact related counts present in the receipt, and Open project / Open a task links. Ordinary entity
  chips remain available. A project-only/partial result does not claim that setup is complete or invent
  a task. Links retain the conversation by opening in a new tab; entry motion respects reduced motion.
- **Recovery — P6/P13:** the standalone creation route now offers a real load retry. Its close toast
  describes saved changes instead of claiming a fully created project from any mutation.

### Validation

- 96 focused Vitest tests pass across nine files, including persisted-session recovery, unavailable
  probes, active/partial results, timer cleanup, no background reads while chat is open, saved receipt
  links/counts, semantic composer copy, duplicate admission prevention, and onboarding minimize/reload.
- Svelte analyzer: no issues in changed components; effect suggestions were reviewed. The recovery
  effect owns cancellable network/timer lifecycle, not derived local state; existing unrelated
  component advisories were not broadened into this change.
- Full `pnpm --filter @buildos/web check`: **0 errors, 0 warnings**. The first run exposed two new
  strict-index errors (fixed) and stale local shared-type declarations (rebuilt from existing source).
- A temporary Vite fixture renders the real recovery, receipt, and composer with simulated data.
  After-state screenshots were captured and inspected at 390px and 1280px in light/dark mode. The
  320px offline state also has no horizontal overflow; new phone actions are at least 44px. Resume,
  saved handback, and reduced-motion states were checked in the fixture. Screenshots are retained in
  the task's `project-creation` visualization folder as `phone-light.png`, `phone-dark.png`,
  `desktop-light.png`, and `desktop-dark.png`. No before-state screenshots were captured in this
  follow-up. Fixture validation is not an authenticated end-to-end claim.

### Still open

- Authenticated end-to-end creation, closing during a real worker admission/turn, reloading both host
  routes, and multiple tabs resuming the same session. No production project was created for validation.
- Creation-session discovery outside these two account/device-local launch drafts; cross-device resume
  continues to use existing chat history. A deleted/expired session remains a visible recovery error.
- Rich progress stages and a backend creation ledger that distinguishes complete structure from a
  partial save. This change deliberately reports what is saved, not whether every requested entity exists.
- A wider entry-point redesign, memory quality, and choosing a meaningful first task rather than just
  linking an existing task are separate product work.

The older audit's proposed sample projects, extended first-week teaching, and replacement demo media are separate product work, not silently marked complete by this flow-polish pass.
