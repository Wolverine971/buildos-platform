// apps/web/src/lib/tests/agentic-e2e/scenarios/calendar-move.scenario.test.ts
import { describe, expect, it, vi } from 'vitest';
import { calendarMoveScenario } from './calendar-move.scenario';

describe('calendar move scenario safety gate', () => {
	it('cannot be enabled by the legacy environment flag', () => {
		vi.stubEnv('AGENTIC_TEST_CALENDAR_READY', 'true');
		expect(calendarMoveScenario.skip?.()).toBe(true);
	});
});
