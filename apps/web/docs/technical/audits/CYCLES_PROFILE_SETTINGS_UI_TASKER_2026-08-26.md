<!-- apps/web/docs/technical/audits/CYCLES_PROFILE_SETTINGS_UI_TASKER_2026-08-26.md -->

# Cycles Profile Settings UI Tasker

Status: first useful slice and atomic trigger-mutation gate implemented
Created: 2026-08-26
Owner: BuildOS Cycles / web
Source: `docs/architecture/cycles-v0-data-model.md` Slice 5 and
`PROFILE_PAGE_AUDIT_2026-06-26.md` Part 8

## TL;DR

Turn `/profile` into a clearer **Settings** surface and introduce Cycles without creating a second
Daily Brief configuration authority.

The first useful slice is deliberately read-only:

1. Replace the flat desktop tab strip with grouped Settings navigation and replace the mobile
   horizontal scroller with a section picker.
2. Add a compact, read-only Cycles overview for a feature-flagged cohort.
3. Keep `Brief Settings` and the legacy Daily Brief scheduler authoritative during shadow and early
   canary rollout.

Do not ship editable Cycle schedules yet. Atomic trigger-set replacement now exists behind the authenticated
Cycle PATCH service, but the legacy scheduler and Cycle coordinator do not yet share the required
authoritative-cohort exclusion gate. Exposing an editor before that gate would create two schedule authorities
and a duplicate-run risk.

## Required Reading

Read these before editing:

1. `docs/architecture/cycles-v0-data-model.md`
    - Read the invariants, product surface proposal, Daily Brief migration, and Slice 5 tracker.
2. `apps/web/docs/technical/components/hyperplexed/PROFILE_PAGE_AUDIT_2026-06-26.md`
    - Part 8 records the live desktop/mobile audit and proposed information architecture.
3. `apps/web/src/routes/profile/+page.svelte`
    - Current tab orchestration and `?tab=` behavior.
4. `apps/web/src/routes/profile/+page.server.ts`
    - Current server-derived tab validation and page data.
5. `apps/web/src/lib/components/profile/BriefsTab.svelte`
    - Legacy Daily Brief configuration that remains authoritative during this slice.
6. `apps/web/src/lib/components/profile/NotificationsTab.svelte`
    - Current delivery preferences and quiet-hours authority.
7. `apps/web/src/routes/api/cycles/+server.ts`
    - Existing authenticated list endpoint.
8. `apps/web/src/lib/server/cycles/cycle-service.ts`
    - Current Cycle list projection and trigger mapping.
9. `packages/shared-types/src/cycle.types.ts`
    - Cycle, trigger, schedule, Run, and outcome contracts.
10. `apps/web/src/lib/utils/feature-flags.ts` and
    `apps/web/src/routes/admin/feature-flags/+page.svelte`
    - Existing per-user rollout mechanism.

Because this work edits Svelte components, follow the repository Svelte 5 guidance and run the Svelte
autofixer against every changed `.svelte` file before closing the task.

## Product Decision

This is a user Settings experience, not an admin or worker-operations UI.

The visible page title becomes **Settings**. The route may remain `/profile` for compatibility. Users
should see what recurring work BuildOS performs, when it runs, whether it is active, and how results
reach them. They should not see queue job types, coordinator leases, processing tokens, cron syntax,
retry internals, or worker diagnostics.

Recommended information architecture:

```text
YOUR BUILDOS                 CONNECTIONS              DATA & PLAN
Account                      Calendar                 Contacts
AI Preferences               Email                    Billing
Cycles                       Agents
Notifications
```

Desktop uses a grouped left rail and one main content pane. Mobile uses one clearly labeled
`Settings section` picker/disclosure; it does not use a horizontally scrolling row of peer tabs.

Cycles and Notifications stay separate destinations:

- **Cycles:** what work runs, for what target, on what cadence, and its recent result.
- **Notifications:** global channels, quiet hours, and delivery subscriptions for Cycle and
  non-Cycle events.

Eventually the Cycle editor may embed the same delivery-preference component used by Notifications.
That component must write the notification system, not the Cycle definition. Disabling delivery must
never pause execution.

## Current State and Release Gates

### What is ready

- Durable `cycles`, `cycle_triggers`, and `cycle_runs` storage exists.
- Owner-scoped Cycle list/detail/history APIs exist.
- The list read model includes triggers, `next_run_at`, `last_run_at`, and `last_error` in one request.
- Daily Brief Cycle rows have been backfilled as paused shadow definitions.
- Schedule calculation, coordinator claiming, atomic admission, worker dispatch, and normalized Run
  outcomes have focused coverage.
- Trigger-only PATCH requests now use one owner-scoped, expected-version transaction that tombstones the old
  trigger set, clears scheduler leases, installs validated materialized triggers, recomputes `next_run_at`, and
  increments the parent Cycle version once.

### What blocks editable scheduling

- The legacy Daily Brief scheduler and Cycle coordinator need one atomic authoritative-cohort gate.
- Existing backfilled Daily Brief Cycles are paused shadow state and must not be presented as the
  user's active configuration.

The read-only surface must therefore be independently gated from execution authority. A UI rollout
flag grants visibility; it does not activate Cycles or grant scheduler ownership.

## Scope: First Useful Slice

### 1. Add an explicit UI rollout flag

Add the per-user feature key `cycles.profile_settings` using the existing feature-flag mechanism:

- Add it to `FeatureName` and `FEATURE_KEYS`.
- Add a **Cycles Settings** column to the existing admin feature-flags page so the canary cohort can
  be managed without direct database edits.
- Resolve the flag in the profile server load and return a boolean such as
  `cyclesProfileEnabled`.
- Accept `?tab=cycles` only when that boolean is true. Otherwise fall back to Account without
  leaking hidden Cycle data.

Do not infer this flag from the presence of a Cycle row. Shadow rows exist before user-facing
authority and are an implementation detail.

### 2. Replace flat profile tabs with grouped Settings navigation

Create a small profile-specific navigation component, for example:

```text
apps/web/src/lib/components/profile/SettingsNavigation.svelte
```

Use one typed navigation model as the source for both desktop and mobile renderings. Each destination
has an id, label, icon, group, and optional visibility predicate. Do not maintain independent desktop
and mobile destination lists.

Required behavior:

- Preserve existing URLs and `?tab=` deep links.
- Keep Account at `/profile` with no tab query parameter.
- Keep `?tab=briefs` valid during the legacy-authoritative rollout stage.
- Include Cycles only for users with `cyclesProfileEnabled`.
- Include Billing only when Stripe is enabled.
- Rename visible heading, document title, and description from `Profile & Settings` to `Settings`
  where appropriate; do not rename the route in this slice.
- On desktop, show grouped navigation in a compact left rail and the active surface in the main pane.
- On mobile, show the current group and destination in a labeled picker/disclosure with a minimum
  44px touch target, keyboard support, focus management, and no horizontal page overflow.
- Continue using URL state as the shareable source of truth. Back/forward navigation must update the
  visible section.

Do not reuse the current flat `TabNav` if doing so preserves the crowded horizontal-tab model. It may
remain for other product surfaces.

### 3. Add a read-only Cycles overview

Create a Cycles profile surface and focused presentational pieces, for example:

```text
apps/web/src/lib/components/profile/CyclesTab.svelte
apps/web/src/lib/components/profile/cycles/CycleListRow.svelte
apps/web/src/lib/components/profile/cycles/cycle-presenter.ts
```

Fetch the authenticated list from `GET /api/cycles`. The page should request the list once, not fetch
Run history once per Cycle.

Each row shows:

- kind icon, user-facing label, and one-sentence purpose;
- target context when meaningful, such as the project name;
- a plain-language cadence and explicit IANA timezone for calendar schedules;
- Active, Paused, or Needs attention;
- next run when the Cycle is truly authoritative and scheduled;
- most recent run time and a compact failure summary when available;
- a delivery summary only when it can be derived from the existing notification source without
  per-row requests.

The current list DTO does not include the normalized last Run outcome or resolved project label. Do
not invent those values and do not add N+1 requests. For the first slice, either:

1. extend the list projection with a single-query, typed `CycleListItem` DTO containing the compact
   last outcome and target label; or
2. omit those fields and show only the truthful data already present.

Prefer option 1 only if it remains a bounded projection with focused service/API tests. A polished
placeholder is worse than an honest omission.

### 4. Represent rollout state truthfully

The Daily Brief shadow row is not the user's active scheduler. The UI must not label it `Active`, show
its `next_run_at` as an execution promise, or offer Pause/Resume based solely on the Cycle row.

Recommended first-slice behavior:

- Ordinary users without the UI flag see no Cycles destination.
- Flagged internal/test users may see a read-only preview.
- If a Cycle is still shadow-only, use product copy such as `Preview` or `Not managing your schedule
yet`; never expose `shadow`, queue names, or coordinator terminology as the primary user label.
- Hide mutating actions in this slice. Do not render disabled controls that imply the feature is
  almost operational.
- Keep `Brief Settings` as the only editable Daily Brief schedule UI until authoritative cutover.

If the backend cannot currently distinguish `preview` from `authoritative` for the signed-in user,
add a server-derived rollout-authority field before showing execution status. Do not guess from
`cycle.state`.

### 5. Cover all product states

The Cycles pane needs intentional states for:

- loading;
- one or more Cycles;
- empty account;
- recoverable request failure with Retry;
- a Cycle with no schedule;
- paused Cycle;
- attention/error state;
- long labels and narrow screens.

Empty copy should explain the concept without offering unsupported creation:

> Cycles are recurring work BuildOS can run for you. Your available Cycles will appear here as they
> become available.

Do not show `Add cycle` until at least one supported kind and target can actually be created through a
safe product flow.

## Explicit Non-Goals for This Slice

- No editable schedule form.
- No browser dual-write to Daily Brief preferences and Cycle triggers.
- No Pause, Resume, Delete, or Run now controls.
- No generic trigger/action workflow canvas.
- No user-authored cron expressions.
- No queue, coordinator, lease, retry-attempt, or processing-token UI.
- No per-Cycle Run-history request from the list.
- No retirement or redirect of `Brief Settings` yet.
- No empty Project Audit, Project Review, or Task Review templates before their handlers and creation
  paths are product-ready.
- No redesign of every existing Settings form. The navigation shell may wrap them without broad
  component churn.

## Follow-On Slice: Editable Cycle Detail

Start this only after the remaining authoritative cohort gate is implemented and tested. Atomic trigger-set
replacement shipped on 2026-08-26, but it is intentionally not exposed through editor controls yet.

Selecting a Cycle should open a large modal on desktop and a full-width detail state on mobile. The
editor order is:

1. Purpose and immutable kind/target context.
2. Schedule using structured daily/weekly controls and local timezone; never cron.
3. Delivery using the shared Notifications preference component, with the explicit copy:
   `Turning delivery off does not pause this Cycle.`
4. Status, next occurrence, last normalized outcome, and Pause/Resume.
5. Latest three Runs, `View history`, and safe retry only when backend state permits it.
6. Kind-specific settings such as Daily Brief narration or Project Audit depth.

Keep execution-policy internals out of the normal v0 UI. `Run now`, Delete, and full history belong in
this focused view, not the compact list.

After Daily Brief Cycle ownership is authoritative and rollback evidence is accepted:

- redirect `/profile?tab=briefs` to `/profile?tab=cycles`;
- remove `BriefsTab` and its legacy preference/job stores;
- reuse one delivery component in Cycle detail and Notifications;
- replace raw `generate_daily_brief` job history with normalized Cycle Run outcomes.

## Suggested Implementation Order

### Checkpoint A — navigation shell

- [x] Add `cycles.profile_settings` to typed feature flags and the admin flag manager.
- [x] Resolve `cyclesProfileEnabled` server-side.
- [x] Introduce one typed grouped Settings navigation model.
- [x] Render the desktop rail and mobile section picker.
- [x] Preserve and test existing `?tab=` behavior.
- [x] Rename the visible page to Settings.

This checkpoint is independently reviewable with existing Settings content and no Cycle API work.

### Checkpoint B — read-only Cycles pane

- [x] Add the gated Cycles destination and deep link.
- [x] Implement kind/schedule/state presentation helpers as pure functions.
- [x] Load `/api/cycles` once with loading, empty, error, and populated states.
- [x] Render compact, overflow-safe Cycle rows.
- [x] Add an explicit server-derived preview/authority state before presenting schedule promises.
- [x] Keep last outcome, target label, and delivery summary omitted until a bounded projection exists.

### Checkpoint C — responsive and accessibility polish

- [x] Verify desktop at 1440px and mobile at 390px.
- [x] Verify keyboard navigation, focus visibility, labels, roles, and screen-reader state.
- [x] Verify 200% zoom and long labels without clipped actions or horizontal overflow.
- [x] Run dark/light theme checks using existing tokens only.

### Checkpoint D — atomic trigger mutation gate

- [x] Add a service-role-only atomic trigger-set replacement RPC.
- [x] Guard replacement by owner and expected parent Cycle version.
- [x] Tombstone prior triggers and clear scheduler claim leases instead of deleting history.
- [x] Materialize schedule projections server-side; reject caller-supplied transport projections.
- [x] Route trigger-only `PATCH /api/cycles/:id` requests through the atomic command.
- [x] Reject mixed definition/trigger patches so one browser save cannot become two writes.
- [x] Cover success, stale version, invalid trigger, owner isolation, rollback, and function privileges in
      disposable PostgreSQL.
- [ ] Add the shared legacy/Cycle authoritative-cohort exclusion gate before exposing the editor.

## Required Tests

### Server and routing

- A user without `cycles.profile_settings` cannot select `cycles` through the server load or client
  URL synchronization.
- A flagged user can deep-link to `/profile?tab=cycles`.
- `briefs` remains valid during this slice.
- Billing visibility remains conditional on Stripe.
- Unknown/hidden tabs fall back to Account without a redirect loop.
- Back and forward navigation keep URL and active content synchronized.

### Navigation component

- Desktop groups and destination labels match the approved information architecture.
- Desktop and mobile use the same navigation model.
- The mobile picker exposes its name, expanded state, selected destination, and keyboard behavior.
- A selection closes the mobile picker and moves focus predictably.
- Long labels do not create page-level horizontal scrolling.

### Cycle presenter

Use table tests for:

- daily schedule with local time and timezone;
- weekly schedule with one and multiple weekdays;
- interval schedule;
- no active trigger;
- active, paused, and attention states;
- missing `next_run_at` and `last_run_at`;
- known Cycle kinds and a defensive unknown-kind fallback;
- preview versus authoritative execution state.

Avoid locale-fragile assertions. Inject or fix `now`, timezone, and locale in tests.

### Cycles pane

- Loading, empty, failure/retry, and populated states.
- One list request per pane load.
- No per-row history request.
- Shadow/preview Daily Brief is never represented as authoritative or Active.
- No raw queue job type such as `generate_daily_brief` reaches visible copy.
- Unsupported kinds do not produce Add controls.
- Rows remain usable at 390px and with long labels.

### Existing behavior

- Account, Contacts, AI Preferences, Brief Settings, Calendar, Email, Notifications, Agents, and
  conditional Billing still render through the new shell.
- Existing save-success and error feedback still appears.
- Onboarding completion feedback and account default URL remain intact.

## Verification Commands

Use the repository package manager and narrow tests first. Adjust focused filenames to match the
implementation:

```bash
pnpm --filter @buildos/web exec vitest run \
  src/lib/components/profile/SettingsNavigation.test.ts \
  src/lib/components/profile/cycles/cycle-presenter.test.ts \
  src/lib/components/profile/CyclesTab.test.ts

pnpm --filter @buildos/web check

pnpm exec prettier --check \
  apps/web/src/routes/profile/+page.svelte \
  apps/web/src/routes/profile/+page.server.ts \
  apps/web/src/lib/components/profile/SettingsNavigation.svelte \
  apps/web/src/lib/components/profile/CyclesTab.svelte \
  apps/web/src/lib/components/profile/cycles
```

Also run the Svelte autofixer on every changed `.svelte` file and resolve all actionable findings.
Use a real browser to inspect `/profile`, `/profile?tab=briefs`, and the flagged
`/profile?tab=cycles` at desktop and mobile widths.

## Acceptance Criteria

- The page reads as Settings, not a crowded profile tab bar.
- Desktop navigation is grouped and scannable; mobile navigation does not horizontally scroll.
- Existing deep links and Settings surfaces continue to work.
- Cycles is available only to the explicit UI cohort.
- The Cycles pane is useful and truthful in read-only form.
- No user can edit a Cycle schedule or accidentally create a second schedule authority.
- A shadow Daily Brief Cycle is never presented as the active scheduler.
- The list does not make one Run-history request per Cycle.
- User-facing copy contains no worker-queue or coordinator implementation language.
- The implementation passes focused tests, web typechecking, formatting, Svelte autofix, responsive
  browser checks, and accessibility checks.

## Landmines

- `cycle.state = 'active'` is not sufficient proof that the Cycle coordinator is authoritative for
  that user during migration.
- A UI feature flag is not an execution cohort gate. Keep those concepts separate in code and copy.
- Trigger changes must remain trigger-only PATCH requests until a future combined definition/trigger command is
  deliberately designed; mixed patches fail closed instead of issuing two writes.
- Delivery preferences control notification channels, not whether recurring work runs.
- Project target labels and last normalized outcomes are not present in the current list DTO.
- `BriefsTab.svelte` has existing Svelte autofixer findings. Avoid unrelated cleanup unless a touched
  line requires it; the component is scheduled for retirement after cutover.
- Preserve unrelated work in the already-dirty worktree.

## Closing Report Template

When the first slice is complete, report:

1. What changed in the Settings navigation.
2. Which users can see Cycles and how the flag is managed.
3. Which Cycle data is shown and what remains intentionally omitted.
4. Proof that shadow Daily Brief state is represented truthfully.
5. Focused test, typecheck, autofixer, desktop, mobile, and accessibility results.
6. The exact remaining backend gates before editable scheduling can begin.
