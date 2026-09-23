// packages/shared-agent-ops/src/calendar/agent-run-calendar-port.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createAgentRunCalendarPort } from './agent-run-calendar-port';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

type OntoQueryCapture = { gte?: string; lte?: string; limit?: number };

function ontoEvent(index: number): Record<string, unknown> {
	return {
		id: `33333333-3333-4333-8333-33333333333${index}`,
		title: `Event ${index}`,
		description: null,
		location: null,
		start_at: `2026-09-23T1${index}:00:00.000Z`,
		end_at: `2026-09-23T1${index}:30:00.000Z`,
		owner_entity_type: 'project',
		owner_entity_id: PROJECT_ID,
		props: {},
		sync_status: null,
		sync_error: null,
		onto_event_sync: []
	};
}

/** Project-scoped list with no project calendar mapping: ontology events only, no Google call. */
function fakeAdmin(ontoRows: Array<Record<string, unknown>>, capture: OntoQueryCapture) {
	const from = vi.fn((table: string) => {
		const builder: any = {
			select: () => builder,
			eq: () => builder,
			is: () => builder,
			order: () => builder,
			gte: (_column: string, value: string) => {
				capture.gte = value;
				return builder;
			},
			lte: (_column: string, value: string) => {
				capture.lte = value;
				return builder;
			},
			limit: (value: number) => {
				capture.limit = value;
				return builder;
			},
			maybeSingle: async () =>
				table === 'users'
					? { data: { timezone: 'America/New_York' }, error: null }
					: { data: null, error: null },
			then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
				Promise.resolve(
					table === 'onto_events'
						? { data: ontoRows.slice(0, capture.limit ?? ontoRows.length), error: null }
						: { data: [], error: null }
				).then(resolve, reject)
		};
		return builder;
	});
	const rpc = vi.fn(async () => ({ data: 'actor-1', error: null }));
	return { from, rpc };
}

describe('AgentRunCalendarPort.listCalendarEvents', () => {
	it('accepts a same-day bare-date range as that whole civil day', async () => {
		const capture: OntoQueryCapture = {};
		const port = createAgentRunCalendarPort({
			admin: fakeAdmin([ontoEvent(1)], capture),
			userId: USER_ID
		}) as any;

		const result = await port.listCalendarEvents({
			project_id: PROJECT_ID,
			calendar_scope: 'project',
			time_min: '2026-09-23',
			time_max: '2026-09-23'
		});

		expect(capture.gte).toBe('2026-09-23T04:00:00.000Z');
		expect(capture.lte).toBe('2026-09-24T03:59:59.000Z');
		expect(result.queried_range).toMatchObject({
			time_min: '2026-09-23T04:00:00.000Z',
			time_max: '2026-09-24T03:59:59.000Z',
			timezone: 'America/New_York'
		});
	});

	it('reports has_more when a source returned exactly the fetch limit', async () => {
		const capture: OntoQueryCapture = {};
		const port = createAgentRunCalendarPort({
			admin: fakeAdmin([ontoEvent(1), ontoEvent(2), ontoEvent(3)], capture),
			userId: USER_ID
		}) as any;

		const result = await port.listCalendarEvents({
			project_id: PROJECT_ID,
			calendar_scope: 'project',
			time_min: '2026-09-23T00:00:00Z',
			time_max: '2026-09-24T00:00:00Z',
			limit: 2
		});

		expect(capture.limit).toBe(2);
		expect(result.events).toHaveLength(2);
		expect(result.pagination).toMatchObject({ has_more: true, next_offset: 2 });
	});

	it('reports no more rows when the source returned fewer than the fetch limit', async () => {
		const capture: OntoQueryCapture = {};
		const port = createAgentRunCalendarPort({
			admin: fakeAdmin([ontoEvent(1)], capture),
			userId: USER_ID
		}) as any;

		const result = await port.listCalendarEvents({
			project_id: PROJECT_ID,
			calendar_scope: 'project',
			time_min: '2026-09-23T00:00:00Z',
			time_max: '2026-09-24T00:00:00Z',
			limit: 2
		});

		expect(result.pagination).toMatchObject({ has_more: false, next_offset: null });
	});
});
