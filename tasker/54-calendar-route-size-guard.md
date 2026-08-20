<!-- tasker/54-calendar-route-size-guard.md -->

# 54 — Split `api/calendar/+server.ts` and get `main` green again

**Created:** 2026-08-18
**Status:** Route split deployed; `main` green on exact follow-up — authenticated live smoke pending
**Mission:** Restore a green `main` by bringing the calendar proxy route back under the 400-line
route-size guard, without changing a single response shape.

## Why this work exists

`pnpm lint` in `apps/web` runs `guardrails:server-routes`, and it has been failing continuously
since **2026-08-12**:

```
[route-size-guard] Found new oversized +server.ts files (max 400 lines):
  - src/routes/api/calendar/+server.ts (571 lines)
[route-size-guard] Split these files below the limit. Do not add new oversized routes.
```

At the time this was written, this was the **only surfaced** violation: the route guard stopped
the job before later gates could provide a trustworthy baseline. Once fixed, CI exposed six older
test-contract/timing failures recorded in the implementation update below.

**The cost is not cosmetic.** Every commit for the last six days has landed on a red `main`, which
means a genuine regression has nowhere to show up — a reviewer cannot tell a real break from the
standing failure. This was surfaced during the Phase 4 review (see
[51](51-worker-behavioral-parity-phase4.md)); roughly a dozen agentic-chat commits shipped into
that blind spot. **Nothing should ramp to users while this signal is dead.**

### How it got here

| Date           | Commit          | Lines                       |
| -------------- | --------------- | --------------------------- |
| 2026-02-15     | `574598dad`     | 192                         |
| 2026-07-02     | `a5a9327ca`     | 203                         |
| **2026-08-12** | **`833f4b21a`** | **566 ← crossed the limit** |
| 2026-08-15     | `665ba01fc`     | 570                         |

The jump is the multi-Google-Calendar-connections work
(`docs/plans/MULTI_GOOGLE_CALENDAR_CONNECTIONS_SPEC_2026-08-11.md`), which added source-aware read
and write services, sharing, and per-source calendar management to the existing proxy. That
feature is double-gated behind `PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED` **and** an exact-user
allowlist (`isMultiCalendarUserAllowed`, wildcards deliberately ignored), and it has not been
touched since 08-12 — so this split is not racing an active refactor.

## Decision locked: split it, do not grandfather it

`apps/web/scripts/route-size-allowlist.json` has a `grandfathered` array with 33 entries, and
adding a 34th would turn CI green in about thirty seconds.

**Don't.** That list exists to freeze routes that were already oversized when the guard was
introduced. This route was 203 lines six weeks ago and crossed the line as _new_ work — which is
precisely the case the guard was written to catch. Laundering it into the allowlist removes the
only mechanism that keeps route files from growing without bound, and the next oversized route
gets the same treatment by precedent.

The split is genuinely small. Four of the eighteen dispatch cases hold 254 of the POST handler's
400 lines; extracting just those four lands the file near ~316 lines with real headroom.

## Current shape

`apps/web/src/routes/api/calendar/+server.ts` (570 lines) is a method-dispatch proxy:

- **lines 22–143** — eight Zod schemas (`calendarRequestSchema`, `eventReadParamsSchema`,
  `availabilityParamsSchema`, `sendUpdatesSchema`, `updateEventParamsSchema`,
  `deleteEventParamsSchema`, `recurrencePatternSchema`, `scheduleTaskParamsSchema`) plus the
  `recurringInstanceEventId` helper;
- **lines 145–544** — `POST`, a single `try` wrapping a `switch (method)` with 18 cases;
- **lines 546–570** — `GET`, a 25-line connection check. Leave it alone.

Case weights, measured:

| Case                       | Lines   | Case                       | Lines |
| -------------------------- | ------- | -------------------------- | ----- |
| `scheduleTask`             | **111** | `updateCalendarProperties` | 9     |
| `updateCalendarEvent`      | **68**  | `shareCalendar`            | 9     |
| `unshareCalendar`          | **39**  | `deleteProjectCalendar`    | 8     |
| `deleteCalendarEvent`      | **36**  | `hasValidConnection`       | 5     |
| `findAvailableSlots`       | 27      | `getUpcomingTasks`         | 5     |
| `getCalendarEvents`        | 20      | `createProjectCalendar`    | 5     |
| `bulkDeleteCalendarEvents` | 9       | `listUserCalendars`        | 5     |
| `bulkScheduleTasks`        | 9       | `disconnectCalendar`       | 4     |
| `bulkUpdateCalendarEvents` | 9       |                            |       |

## Target shape

```text
src/routes/api/calendar/
  +server.ts                    POST/GET shells, auth, dispatch, error mapping
src/lib/server/calendar-proxy/
  request-schemas.ts            the eight Zod schemas + recurringInstanceEventId
  schedule-task.handler.ts      scheduleTask (111)
  event-write.handlers.ts       updateCalendarEvent (68) + deleteCalendarEvent (36)
  calendar-sharing.handlers.ts  shareCalendar + unshareCalendar (48)
```

Names and grouping are a suggestion, not a contract. The rule that matters: a handler earns its
own module when it owns real branching logic, not because a line budget needs feeding. The
thirteen small cases (4–27 lines each) should stay inline in the switch — scattering one-liners
across files makes the route harder to read, not easier.

## Work packages

### W1 — Characterize before moving anything

`apps/web/src/routes/api/calendar/server.test.ts` exists (236 lines) but covers only the
multi-account mutation paths — four tests: source-aware update routing, idempotent source-aware
delete staying legacy-compatible, service-client usage for legacy disconnect cleanup, and
scheduling a task on a selected source. **It is the safety net for W3 and it is not wide enough**;
it says nothing about validation-failure shapes, recurrence, or sharing.

Extend it before moving anything. Pin the current contract for the four cases being extracted:

- success response shape for each (`ApiResponse.success` payload keys);
- validation-failure shape when the Zod parse rejects;
- the `googleCalendarRuntimeErrorResponse` path for Google API runtime errors;
- `scheduleTask`'s recurrence handling via `recurrencePatternBuilder` and
  `recurringInstanceEventId`, including the recurring-instance event ID format;
- `unshareCalendar`'s branching — at 39 lines it is the second-densest case and the least obvious.

Characterization first is not ceremony here: this route is a direct proxy with no schema layer
between it and Google, so a changed key is invisible until a user's calendar breaks. The four
existing tests pass today — capture that baseline before the first move so a red test during
extraction is unambiguous.

### W2 — Extract the schemas

Move lines 22–143 to `request-schemas.ts` and re-export. Pure move, no edits. Run the guard —
the file should drop to roughly 450 lines, still failing, which confirms the guard is measuring
what you think it is.

### W3 — Extract the four heavy handlers

Each becomes a function taking an explicit dependency object (the Supabase client, the resolved
`user`, the parsed params) and returning the same `Response` the case returned. Do not introduce a
handler-registry abstraction; a `switch` that calls four imported functions is the honest shape
for eighteen methods.

Preserve exactly:

- the shared `try`/`catch` and its error mapping — do not give each handler its own catch;
- `requireAuth` semantics and the `'error' in authResult` early return;
- `createAdminSupabaseClient()` usage where the current case uses it, and `locals.supabase`
  where it does not. **These are not interchangeable** — one bypasses RLS.
- the multi-calendar gate. `isMultiCalendarUserAllowed(user.id, privateEnv)` must be called on the
  same paths, with the same arguments, and must still fail closed.

### W4 — Verify

```bash
cd apps/web && pnpm run guardrails:server-routes   # must print OK with 33 grandfathered
pnpm lint                                          # must exit 0
pnpm typecheck && pnpm check                       # 0 errors, 0 warnings
pnpm test:run
```

Then confirm `main` is green on GitHub Actions — that is the actual exit condition, not a local
pass.

### W5 — Live smoke

The route is a real user path and this refactor is invisible to tests if a payload key drifts.
Walk the calendar UI once against a connected Google account: load events, schedule a task
(including a recurring one), update an event, delete an event. Multi-calendar sharing needs the
flag plus an allowlisted user; if that is not set up, say so explicitly rather than claiming
coverage.

## Exit condition

`main` is green on GitHub Actions, `src/routes/api/calendar/+server.ts` is under 400 lines, the
allowlist still has exactly 33 entries, and the calendar UI walkthrough in W5 is recorded green.

## Local implementation update — 2026-08-18

- `src/routes/api/calendar/+server.ts` is 267 lines. Schemas, schedule-task logic, and event-write
  logic are extracted under `src/lib/server/calendar-proxy/`; the shared route-level error mapping,
  auth flow, client selection, feature gate, and response shapes remain in place.
- The route characterization suite is expanded from 4 to 13 tests and passes 13/13. It pins the
  three extracted success payloads, validation failures, recurring task creation, recurring-instance
  event IDs, the shared Google runtime-error path, and share/unshare pass-through behavior.
- `pnpm --filter @buildos/web lint` exits zero. This first exposed two style-contract violations
  that had been hidden behind the earlier route-size failure; minimal canonical `text-xs`
  substitutions in `DocumentModal.svelte` and `MultiCalendarConnections.svelte` clear them.
- `pnpm --filter @buildos/web check` reports 0 errors and 0 warnings. The calendar suite passes
  13/13 and `AccountTab.test.ts` passes 2/2.
- The initial full local `test:run` could not execute 25 PostgreSQL suites in the restricted
  sandbox because they could not bind `127.0.0.1` (`EPERM`). A later permission-scoped run executed
  those disposable databases and the exact complete coverage gate; current results are recorded
  below. The calendar suite stayed green throughout.
- DJ's aggregate commit `31a89acd68d475b436582e806cbd7130fc826241` landed and deployed this
  split. CI run `32157588044` passes typecheck, schema tooling, and full lint, proving the route-size
  exit itself is clean. The test job then reports six failures unrelated to the calendar proxy:
  an outdated projects-page Supabase mock, a Document Interact dynamic-import timing assertion,
  and four stale agentic-chat/OAuth expectations or budgets. Result: 6 failed, 3,732 passed, 48
  skipped. At that point, `main` therefore remained red even though the route guard was restored;
  the later `091300faf` run below closes that historical failure.
- Exact deployment receipts: Vercel `dpl_4A7ZYnA1LvT6c4wemvmryX7b9iN6` is Ready and aliased to
  `build-os.com`; Railway `833de648-4eab-489f-a1d5-7fd9f8d6ac8d` reports SUCCESS for the exact
  SHA; the production site returns HTTP 200.
- W5's authenticated calendar UI walkthrough has not been performed and must not be claimed.
- DJ pushed the six exposed test-contract remediations in aggregate commit
  `ae3a241bd9fc8e847048f5e28e26ac9400ccd0fb`. CI run `32164236966` keeps typecheck, schema
  tooling, and lint green, then exposes one older Twilio relative-time clock race.
- The deterministic follow-up is test/fixture-only: pin the Twilio test clock; replace
  wall-clock-expired checkpoint fixtures with transaction-relative times; give the lazy Document
  Interact test a ten-second envelope around its five-second wait; and import the heavy task route
  during test collection. Focused proof is 9/9 Twilio coverage, 1/1 disposable PostgreSQL, and
  12/12 loaded web tests with coverage. Exact `pnpm turbo test:coverage` passes 17/17 tasks,
  including 593/593 web files and 3,786/3,786 web tests.
- The four fixes landed in DJ's aggregate commit
  `091300faf4a254762ce02219e108cff4c56d8582`. Authoritative CI run
  [`32174155571`](https://github.com/Wolverine971/buildos-platform/actions/runs/32174155571)
  completed successfully: typecheck, schema tooling, lint, coverage, deep-research database
  integration, and coverage artifact upload all passed. Vercel deployment
  `HUCifbpry3KaDmj3qaASd9RMoKrx` and Railway deployment
  `f7e4a72d-0c1c-4ec1-af39-ad2d00c1cf5c` both succeeded for the exact SHA; the production site
  returned HTTP 200.
- The route-size allowlist file remains untouched with 33 entries. The guard reports OK with 32
  currently oversized grandfathered routes and separately flags the existing `onto/search` entry as
  stale; remove that entry only in a separate cleanup as required above.

The GitHub CI exit is complete. The authenticated connected-calendar UI walkthrough remains
pending and must not be claimed; it mutates real calendar data and requires separate authorization.

## Notes

- Do not "fix" the 176/211 ESLint warnings while in here. They are warnings, they do not fail the
  build, and bundling them makes the diff unreviewable.
- The guard is configurable via `SERVER_ROUTE_MAX_LINES`. Raising it is not a fix.
- If a stale-allowlist warning appears after the split, that is the guard noticing a grandfathered
  file dropped under 400 on its own. Removing that entry is safe and welcome, but do it as a
  separate commit.
