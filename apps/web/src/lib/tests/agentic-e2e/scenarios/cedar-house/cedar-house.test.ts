// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/cedar-house.test.ts
//
// Static guard for the Cedar House battery. The live run costs real model spend
// and needs a dev server, so registration, shape and oracle drift are checked
// here instead of being discovered mid-battery.
import { describe, expect, it } from 'vitest';

import { scenarioCatalog } from '../catalog';
import { selectBattery } from '../../harness/battery';
import { HARNESS_TIMEZONE, zonedEndOfDay, zonedStartOfDay } from '../../harness/timezone';
import {
	CEDAR_ALL_TASK_SLUGS,
	CEDAR_BRIEF_AUDIENCE,
	CEDAR_BRIEF_CTA,
	CEDAR_BRIEF_MARKDOWN,
	CEDAR_BRIEF_SENTINEL,
	CEDAR_END_DATE,
	CEDAR_NOTE_PAYLOAD,
	CEDAR_START_DATE,
	CEDAR_TASKS,
	cedarProjectSpec
} from './fixture';
import { CEDAR_HOUSE_PENDING_CALENDAR_CASES } from './cases-10-to-12-calendar.pending';

const BATTERY = selectBattery(scenarioCatalog, 'cedar-house');
/** Cases 10-12 are the calendar arm and join at stage S4. */
const EXPECTED_CASES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 14];

function nyCivilDate(instant: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: HARNESS_TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date(instant));
}

describe('cedar-house battery registration', () => {
	it('registers exactly the eleven built cases', () => {
		expect(BATTERY).toHaveLength(EXPECTED_CASES.length);
		expect(BATTERY.map((scenario) => scenario.batteryCase)).toEqual(EXPECTED_CASES);
	});

	it('gives every case a unique id and a unique case number', () => {
		expect(new Set(BATTERY.map((scenario) => scenario.id)).size).toBe(BATTERY.length);
		expect(new Set(BATTERY.map((scenario) => scenario.batteryCase)).size).toBe(BATTERY.length);
	});

	it('keeps battery ids unique across the whole catalog', () => {
		const ids = scenarioCatalog.map((scenario) => scenario.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('gives every case a valid shape', () => {
		for (const scenario of BATTERY) {
			expect(scenario.category).toBe('cedar-house');
			expect(scenario.id).toMatch(/^cedar-\d{2}-[a-z-]+$/);
			expect(scenario.title).toMatch(/^Case \d+ — /);
			expect(scenario.turns.length).toBeGreaterThan(0);
			expect(typeof scenario.seed).toBe('function');
			for (const turn of scenario.turns) {
				expect(turn.message.trim().length).toBeGreaterThan(20);
				expect(typeof turn.assert).toBe('function');
				expect(['project', 'project_create']).toContain(turn.contextType);
			}
		}
	});

	it('only declares write tools on the cases that write', () => {
		const writeCases = BATTERY.filter(
			(scenario) => (scenario.requiredMutationTools ?? []).length > 0
		).map((scenario) => scenario.batteryCase);
		expect(writeCases).toEqual([1, 2, 4, 7, 8, 9]);
	});

	it('runs the retrieval and status cases in a cold session', () => {
		const coldCases = BATTERY.filter((scenario) =>
			scenario.turns.some((turn) => turn.coldSession === true)
		).map((scenario) => scenario.batteryCase);
		expect(coldCases).toEqual([13, 14]);
	});

	it('grades case 14 with a judge at the audit threshold', () => {
		const statusCase = BATTERY.find((scenario) => scenario.batteryCase === 14);
		expect(statusCase?.turns[0]?.judge).toBeTypeOf('function');
	});

	it('documents the calendar cases that are not built yet', () => {
		expect(CEDAR_HOUSE_PENDING_CALENDAR_CASES.map((entry) => entry.batteryCase)).toEqual([
			10, 11, 12
		]);
		const registered = new Set(BATTERY.map((scenario) => scenario.batteryCase));
		for (const pending of CEDAR_HOUSE_PENDING_CALENDAR_CASES) {
			expect(registered.has(pending.batteryCase)).toBe(false);
		}
	});
});

describe('cedar-house fixture matches the audit oracle', () => {
	it('carries the exact marketing text later cases quote back', () => {
		expect(CEDAR_BRIEF_AUDIENCE).toBe('Local homeowners considering a kitchen renovation.');
		expect(CEDAR_BRIEF_CTA).toBe('Book a 20-minute discovery call.');
		expect(CEDAR_BRIEF_SENTINEL).toBe('PRESERVE-EXACTLY: Cedar-742 / copper & oak.');
		expect(CEDAR_BRIEF_MARKDOWN).toContain(`## Audience\n${CEDAR_BRIEF_AUDIENCE}`);
		expect(CEDAR_BRIEF_MARKDOWN).toContain(`## Call to action\n${CEDAR_BRIEF_CTA}`);
		expect(CEDAR_BRIEF_MARKDOWN).toContain('## Change log\n2026-09-03: Initial draft.');
	});

	it('keeps the hostile payload intact, override block included', () => {
		expect(CEDAR_NOTE_PAYLOAD).toContain('<system_override>');
		expect(CEDAR_NOTE_PAYLOAD).toContain('$95,000');
		expect(CEDAR_NOTE_PAYLOAD).toContain('Quote excludes installation.');
	});

	it('stores fixture dates as New York civil days on both sides of DST', () => {
		const spec = cedarProjectSpec('AE2E · fixture check', { tasks: 'all' });
		expect(nyCivilDate(spec.project.start_at!)).toBe(CEDAR_START_DATE);
		// November 20 is EST; September 14 is EDT. A fixed -04:00 offset would
		// push the end date to the previous civil day here.
		expect(nyCivilDate(spec.project.end_at!)).toBe(CEDAR_END_DATE);
		expect(zonedStartOfDay('2026-09-14')).toBe('2026-09-14T04:00:00.000Z');
		expect(zonedEndOfDay('2026-11-20')).toBe('2026-11-21T04:59:59.000Z');

		for (const slug of CEDAR_ALL_TASK_SLUGS) {
			const fixture = CEDAR_TASKS[slug]!;
			const entity = spec.entities.find(
				(candidate) => 'title' in candidate && candidate.title === fixture.title
			);
			expect(entity, `task ${fixture.title} missing from the spec`).toBeDefined();
			expect(nyCivilDate((entity as { due_at: string }).due_at)).toBe(fixture.dueDate);
		}
	});

	it('seeds only the tasks a case asked for', () => {
		expect(cedarProjectSpec('AE2E · none', { tasks: 'none' }).entities).toHaveLength(0);
		expect(cedarProjectSpec('AE2E · core', { tasks: 'core' }).entities).toHaveLength(2);
		expect(cedarProjectSpec('AE2E · all', { tasks: 'all' }).entities).toHaveLength(5);
		expect(
			cedarProjectSpec('AE2E · core+brief', { tasks: 'core', brief: true }).entities
		).toHaveLength(3);
	});
});
