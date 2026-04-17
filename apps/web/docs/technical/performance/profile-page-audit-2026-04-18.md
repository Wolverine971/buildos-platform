<!-- apps/web/docs/technical/performance/profile-page-audit-2026-04-18.md -->

# Profile Page Backend Query Audit — 2026-04-18

Audit of `/profile` (all tabs) focused on query correctness and latency. The page currently fans out to many duplicate and serial requests on tab mount; this doc catalogs what was found and the fix plan.

## Scope

Routes and endpoints reviewed:

- `/profile` SvelteKit load + actions: `apps/web/src/routes/profile/+page.server.ts`
- `/profile/calendar` JSON endpoint: `apps/web/src/routes/profile/calendar/+server.ts`
- `/profile/settings` (unused page shell): `apps/web/src/routes/profile/settings/+page.server.ts`
- `/api/brief-preferences` and `/api/brief-jobs`
- `/api/notification-preferences`
- `/api/sms/preferences` and `/api/sms/scheduled`
- `/api/users/preferences`
- `/api/profile/me/username`
- `/api/profile/contacts` (+ nested routes)
- `/api/account/settings`, `/api/account/password`
- `/api/agent-call/callers`
- `/api/calendar/analyze`

Tabs and components that drive those calls:

- `AccountTab.svelte`, `ContactsTab.svelte`, `PreferencesTab.svelte`, `BriefsTab.svelte`
- `CalendarTab.svelte`, `NotificationsTab.svelte` (→ `NotificationPreferences.svelte` + `SMSPreferences.svelte` + `ScheduledSMSList.svelte`)
- `AgentKeysTab.svelte`

## Findings

### 🔴 High-impact

#### H1. Duplicate `user_context` query on every profile load

`apps/web/src/routes/profile/+page.server.ts:93-138`

The `load()` function runs, in parallel:

1. A direct `user_context` SELECT.
2. `progressService.getOnboardingProgress(user.id)`, which internally runs the same `user_context` SELECT.

The result of (2) is assigned to `_progressData` and then discarded — lines 193-222 recompute progress from `userContext` directly. Net effect: one wasted DB round-trip on every profile page render.

**Fix:** Delete the `progressService.getOnboardingProgress()` call and the `OnboardingProgressService` import. Progress is already being computed from `userContext`.

#### H2. Notifications tab fires `/api/sms/preferences` three times on mount

On opening the Notifications tab, three independent components each fetch the same row:

- `NotificationsTab.svelte:28` — to decide whether to show `ScheduledSMSList`.
- `NotificationPreferences.svelte:110` — to check phone verification.
- `SMSPreferences.svelte:49` — to populate the full form.

Each call hits `/api/sms/preferences`, which itself makes 2 serial DB queries (`users.timezone` then `user_sms_preferences`). Result: ~6 request round-trips and ~6–8 DB hits for the same single row.

**Fix:** Centralize via a shared store (`smsPreferencesStore`) or load once in `NotificationsTab` and pass the preferences object down as props to `NotificationPreferences` and `SMSPreferences`. Also parallelize the two DB queries inside the endpoint (see M1).

#### H3. `NotificationPreferences` double-queries `user_notification_preferences`

`NotificationPreferences.svelte:69-74` runs two loaders in parallel that both hit the same table:

- `notificationPreferencesService.get()` — direct Supabase, full row.
- `notificationPreferencesStore.load()` — API route, subset.

**Fix:** Drop the direct-Supabase `get()` call and rely on the store (widen the store's SELECT to return the full row the component needs), or vice versa. Pick one source.

### 🟡 Medium-impact

#### M1. `/api/sms/preferences` and `/api/brief-preferences` serialize `users.timezone` with their own table query

Both endpoints do `await supabase.from('users').select('timezone')` and then `await supabase.from('user_sms_preferences|user_brief_preferences').select('*')` sequentially. These are independent.

**Fix:** Wrap in `Promise.all`.

#### M2. `/api/brief-jobs` uses `count: 'exact'` unnecessarily

`apps/web/src/routes/api/brief-jobs/+server.ts:21` — `count: 'exact'` forces a second `COUNT(*)` on `queue_jobs` on every call. The `BriefsTab` UI only renders the returned rows; it never reads `total`, `hasMore`, or `offset`.

**Fix:** Drop `count: 'exact'` (or use `'estimated'` if we want a rough total later).

#### M3. `getCalendarProjects` fetches all projects, filters in JS

`apps/web/src/lib/services/calendar-analysis.service.ts:1242-1263` selects every non-deleted project by the actor, then filters to `props.source === 'calendar_analysis'` in memory.

**Fix:** Push the filter into Postgres via `.or('props->>source.eq.calendar_analysis,props->source_metadata->>source.eq.calendar_analysis')`. For users with many projects this avoids scanning the full set per call.

#### M4. `/api/calendar/analyze` GET runs history → projects serially

Lines 82-83:

```ts
const history = await analysisService.getAnalysisHistory(session.user.id);
const calendarProjects = await analysisService.getCalendarProjects(session.user.id);
```

Independent queries executed in series.

**Fix:** `Promise.all`.

#### M5. Profile `load()` serializes subscription fetch after the main `Promise.all`

`apps/web/src/routes/profile/+page.server.ts:150-187` — when Stripe is enabled, the subscription SELECT runs after the top-level `Promise.all` finishes. Invoices does need `subscription.id`, so it stays serial, but subscription itself can join the main batch.

**Fix:** Move the subscription query into the top `Promise.all`; keep invoices as a follow-up.

### 🟢 Low-impact / cleanup

#### L1. Dead code: `CalendarTab.loadCalendarProjects`

`apps/web/src/lib/components/profile/CalendarTab.svelte:338-397` defines a client-side version of `getCalendarProjects` that is never called. Delete it.

#### L2. `/api/profile/contacts` audit row on every read

Every GET on the Contacts tab inserts a row into `user_contact_access_audit`. Awaited inline so it counts against response latency. Intentional for compliance, but cheap to change to fire-and-forget (`void insertUserContactAuditEvent(...)`) without awaiting. Needs a policy call before changing.

#### L3. `calendarPreferences` may have other null string fields

Today's `timezone` fix (`CalendarTab.svelte`) handled one field. `work_start_time`, `work_end_time`, and the duration minutes could also be null on partial rows. TextInputs tolerate `undefined`, but it's worth extending `normalizeCalendarPreferences` to fill defaults for all required fields to prevent future bind errors.

## Fix plan (order of operations)

1. **H1** — drop duplicate `user_context` fetch in profile load.
2. **H3** — collapse `NotificationPreferences` loaders to one source.
3. **H2** — lift SMS prefs to a single fetch in `NotificationsTab`, pass as props.
4. **M1** — parallelize `users.timezone` + prefs queries in `/api/sms/preferences` and `/api/brief-preferences`.
5. **M2** — drop `count: 'exact'` in `/api/brief-jobs`.
6. **M5** — fold subscription fetch into main `Promise.all` in profile load.
7. **M4** — parallelize `/api/calendar/analyze` GET.
8. **M3** — push `getCalendarProjects` filter into DB.
9. **L1** — delete dead `loadCalendarProjects`.
10. **L3** — extend `normalizeCalendarPreferences` to cover all required fields.

L2 deferred pending policy call.

## Verification

After each fix:

- Reload `/profile?tab=<changed-tab>` and confirm the visible data still renders correctly.
- Check the network tab to confirm the targeted duplicate calls are gone.
- `pnpm --filter=@buildos/web typecheck` to make sure no types regressed.
