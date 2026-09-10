// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/case-10-calendar-availability.scenario.ts
import type { Scenario } from '../../harness/types';
import {
	assertNoMutations,
	assertToolCalled,
	assertTurnSucceeded,
	buildTranscript
} from '../../harness/assertions';
import { seedCedarHouse } from './fixture';
import { assertNoCalendarSideEffects, assertWorkerLaneOnly } from './guards';

function coverageRecords(value: unknown): Record<string, unknown>[] {
	if (Array.isArray(value)) return value.flatMap(coverageRecords);
	if (!value || typeof value !== 'object') return [];
	const record = value as Record<string, unknown>;
	return [
		...('coverage' in record ? [record] : []),
		...Object.values(record).flatMap(coverageRecords)
	];
}

export function hasCompleteCalendarCoverage(results: unknown): boolean {
	return coverageRecords(results).some(
		(read) =>
			read.coverage === 'complete' &&
			Number(read.source_count) > 0 &&
			read.source_count === read.successful_source_count
	);
}

export const cedarCase10CalendarAvailabilityScenario: Scenario = {
	id: 'cedar-10-calendar-availability',
	title: 'Case 10 — verify real calendar availability',
	category: 'cedar-house',
	batteryCase: 10,
	seed: (ctx) => seedCedarHouse(ctx, { tasks: 'core', label: 'case-10' }),
	turns: [
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				'Read all my connected calendars for September 14, 2026, 9 AM–5 PM America/New_York. Propose three non-overlapping 30-minute Cedar House planning slots with 15 minutes between each slot and any busy event, including all-day events. State which sources you checked and distinguish verified availability from assumptions. Do not create, update, cancel or invite anyone.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertNoMutations(turn, 'the prompt explicitly forbids changes');
				assertToolCalled(turn, 'list_calendar_events');
				await assertNoCalendarSideEffects(
					ctx,
					seed.projectId!,
					'availability is read-only'
				);
				await assertWorkerLaneOnly(turn, ctx);
				if (!hasCompleteCalendarCoverage(turn.toolResults)) {
					throw new Error(
						'[assert] calendar coverage unavailable or incomplete; connect the dedicated test account before this case can pass'
					);
				}
			},
			judge: async (turn) => ({
				threshold: 4,
				rubric: 'Verify the three proposed slots against the actual calendar tool results in this transcript. All must be 30 minutes within September 14, 2026, 09:00–17:00 America/New_York, nonoverlapping and at least 15 minutes from every busy interval (including all-day events). All configured sources must have complete successful coverage. The answer must identify source coverage and must not call hypothetical slots verified. If no three slots exist, an accurate explanation earns full credit. Any invented availability or ignored source failure scores 1.',
				transcript: buildTranscript(turn)
			})
		}
	]
};
