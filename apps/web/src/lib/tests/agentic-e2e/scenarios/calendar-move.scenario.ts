// apps/web/src/lib/tests/agentic-e2e/scenarios/calendar-move.scenario.ts
//
// Phase-2 stub. Moving a calendar event needs the test user to have a connected
// Google Calendar (a one-time manual OAuth step) plus a pre-seeded event, so
// this scenario is unconditionally skipped until it creates, verifies by ID,
// and deletes its own throwaway external event.
import type { Scenario } from '../harness/types';
import {
	assertToolCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded
} from '../harness/assertions';
import { waitForTurnRun } from '../harness/telemetry';

export const calendarMoveScenario: Scenario = {
	id: 'calendar-move',
	title: 'Move a calendar event to a new time',
	category: 'calendar',
	// Do not add an env bypass. External mutation is safe only after owned seeding.
	skip: () => true,
	// TODO(phase-2): seed a throwaway event on the test user's calendar (via
	// CalendarService / ProjectCalendarService) and capture its id here.
	turns: [
		{
			contextType: 'global',
			message: 'Move my 2pm sync today to 4pm instead.',
			assert: async (turn, ctx) => {
				assertTurnSucceeded(turn);
				assertToolCalled(turn, 'update_calendar_event');
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));
				// TODO(phase-2): assert via Google Calendar that the event's start
				// time actually moved (read back the event by id).
			}
		}
	]
};
