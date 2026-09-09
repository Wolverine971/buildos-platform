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

The older audit's proposed sample projects, extended first-week teaching, and replacement demo media are separate product work, not silently marked complete by this flow-polish pass.
