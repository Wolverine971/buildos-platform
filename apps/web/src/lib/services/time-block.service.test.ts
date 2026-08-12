// apps/web/src/lib/services/time-block.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { TimeBlockService, type SourceAwareTimeBlockCalendar } from './time-block.service';

const EXISTING_BLOCK = {
	id: '11111111-1111-4111-8111-111111111111',
	user_id: 'user-1',
	block_type: 'build',
	project_id: null,
	start_time: '2026-08-12T14:00:00.000Z',
	end_time: '2026-08-12T15:00:00.000Z',
	duration_minutes: 60,
	timezone: 'America/New_York',
	calendar_event_id: 'provider-event-1',
	calendar_event_link: 'https://calendar.google.com/event?eid=one',
	calendar_source_id: 'source-a',
	ai_suggestions: null,
	suggestions_summary: null,
	suggestions_generated_at: null,
	suggestions_model: null,
	suggestions_state: null,
	sync_status: 'synced',
	sync_source: 'app',
	last_synced_at: '2026-08-12T13:00:00.000Z',
	created_at: '2026-08-12T13:00:00.000Z',
	updated_at: '2026-08-12T13:00:00.000Z'
};

function createSupabase(options: { insertError?: Error } = {}) {
	const inserts: any[] = [];
	const updates: any[] = [];
	const from = vi.fn((_table: string) => {
		let action: 'select' | 'insert' | 'update' = 'select';
		let selected = '';
		let value: any;
		const result = () => {
			if (action === 'insert') {
				return options.insertError
					? { data: null, error: options.insertError }
					: { data: { ...EXISTING_BLOCK, ...value }, error: null };
			}
			if (action === 'update') {
				return { data: { ...EXISTING_BLOCK, ...value }, error: null };
			}
			if (selected === 'id') return { data: [], error: null };
			return { data: EXISTING_BLOCK, error: null };
		};
		const query: any = {
			select: vi.fn((columns = '*') => {
				selected = columns;
				return query;
			}),
			insert: vi.fn((payload: any) => {
				action = 'insert';
				value = payload;
				inserts.push(payload);
				return query;
			}),
			update: vi.fn((payload: any) => {
				action = 'update';
				value = payload;
				updates.push(payload);
				return query;
			}),
			eq: vi.fn(() => query),
			neq: vi.fn(() => query),
			filter: vi.fn(() => query),
			maybeSingle: vi.fn(async () => result()),
			single: vi.fn(async () => result()),
			then: (resolve: (result: any) => unknown, reject: (error: unknown) => unknown) =>
				Promise.resolve(result()).then(resolve, reject)
		};
		return query;
	});
	return { client: { from, rpc: vi.fn() } as any, inserts, updates };
}

function createSourceAwareCalendar(): SourceAwareTimeBlockCalendar {
	return {
		createStandaloneEvent: vi.fn().mockResolvedValue({
			calendarSourceId: 'source-a',
			providerEventId: 'provider-event-1',
			event: { htmlLink: 'https://calendar.google.com/event?eid=one' }
		}),
		updateEvent: vi.fn().mockResolvedValue({}),
		deleteEvent: vi.fn().mockResolvedValue({}),
		compensateUnmappedCreatedEvent: vi.fn().mockResolvedValue('deleted')
	};
}

function createService(options: { insertError?: Error } = {}) {
	const supabase = createSupabase(options);
	const sourceAwareCalendar = createSourceAwareCalendar();
	const legacyCalendar = {
		createStandaloneEvent: vi.fn(),
		updateCalendarEvent: vi.fn(),
		deleteCalendarEvent: vi.fn()
	};
	return {
		...supabase,
		sourceAwareCalendar,
		legacyCalendar,
		service: new TimeBlockService(supabase.client, 'user-1', legacyCalendar as any, {
			sourceAwareCalendar
		})
	};
}

describe('TimeBlockService source-aware calendar routing', () => {
	it('persists the source that created a new time block event', async () => {
		const { service, sourceAwareCalendar, legacyCalendar, inserts } = createService();

		await service.createTimeBlock({
			block_type: 'build',
			calendar_source_id: 'source-a',
			start_time: new Date('2026-08-12T14:00:00.000Z'),
			end_time: new Date('2026-08-12T15:00:00.000Z')
		});

		expect(sourceAwareCalendar.createStandaloneEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				selector: { calendarSourceId: 'source-a' }
			})
		);
		expect(inserts[0]).toEqual(
			expect.objectContaining({
				id: expect.any(String),
				calendar_event_id: 'provider-event-1',
				calendar_source_id: 'source-a'
			})
		);
		expect(legacyCalendar.createStandaloneEvent).not.toHaveBeenCalled();
	});

	it('uses source-qualified compensation when local creation fails', async () => {
		const { service, sourceAwareCalendar, inserts } = createService({
			insertError: new Error('database unavailable')
		});

		await expect(
			service.createTimeBlock({
				block_type: 'build',
				start_time: new Date('2026-08-12T14:00:00.000Z'),
				end_time: new Date('2026-08-12T15:00:00.000Z')
			})
		).rejects.toThrow('database unavailable');
		expect(sourceAwareCalendar.compensateUnmappedCreatedEvent).toHaveBeenCalledWith({
			userId: 'user-1',
			calendarSourceId: 'source-a',
			providerEventId: 'provider-event-1',
			entityKind: 'time_block',
			entityId: inserts[0].id
		});
	});

	it('updates an existing event through its stored source', async () => {
		const { service, sourceAwareCalendar, legacyCalendar } = createService();

		await service.updateTimeBlock(EXISTING_BLOCK.id, { timezone: 'UTC' });

		expect(sourceAwareCalendar.updateEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				providerEventId: 'provider-event-1',
				selector: { calendarSourceId: 'source-a' }
			})
		);
		expect(legacyCalendar.updateCalendarEvent).not.toHaveBeenCalled();
	});

	it('deletes an existing event through its stored source', async () => {
		const { service, sourceAwareCalendar, legacyCalendar } = createService();

		await service.deleteTimeBlock(EXISTING_BLOCK.id);

		expect(sourceAwareCalendar.deleteEvent).toHaveBeenCalledWith({
			userId: 'user-1',
			providerEventId: 'provider-event-1',
			selector: { calendarSourceId: 'source-a' }
		});
		expect(legacyCalendar.deleteCalendarEvent).not.toHaveBeenCalled();
	});
});
