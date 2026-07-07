<!-- tasker/08-calendar-live-smoke.md -->

# 08 — Calendar in Agent Runs: live smoke + hardcoded calendar_id

**Priority:** P1/P2 — code exists, never exercised live
**Type:** Engineering (QA + small fix)
**Sources:** prior inventory P1 (`docs/reports/buildos-loose-ends-inventory-2026-06-11.md`), `packages/shared-agent-ops/src/calendar/agent-run-calendar-port.ts`, `apps/web/src/lib/services/calendar-analysis.service.ts`

## State

A worker-safe `CalendarPort` exists and is env/token-gated; review mode hides calendar writes. Headless catalog/port checks pass (`apps/worker/tests/calendarInRuns.endstate.test.ts`). Agent Work substrate is otherwise live-confirmed.

## Refresh 2026-07-02 — no movement on these items (don't be fooled by adjacent work)

Calendar work DID land in `734b291a`, but it's the **agentic-chat tool executor** (`calendar-executor.ts` + edge-integrity tests, DEEP-audit D14 — surfacing failed `task→has_event→event` edge writes), NOT the Agent Runs CalendarPort this file tracks. `agent-run-calendar-port.ts` is unchanged. Both loose ends below remain fully open; the hardcode is now at `calendar-analysis.service.ts:1456` (plus a second at `:292`).

## Loose ends

1. **No Google-connected live smoke** — no real user/project has run create → read → delete through the CalendarPort with stored tokens. Review-mode catalog (reads-only) not visually confirmed.
2. **Hardcoded calendar id** — `calendar-analysis.service.ts:1456` (and `:292`): `calendar_id: 'primary', // TODO: Get actual calendar ID`. Works for the primary calendar but breaks for users whose target calendar isn't primary.

## Next action

1. With a Google-connected account: run a direct-commit calendar create, read, and delete via an Agent Run; confirm a `review:true` run exposes calendar reads only (no writes).
2. Replace the hardcoded `'primary'` with the actual resolved calendar id (thread the user's selected/target calendar through, or look it up).

## Done when

Live create/read/delete verified end-to-end and the `calendar_id` TODO is resolved.
