// apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.edge-integrity.test.ts
/**
 * D14 — task↔event edge write integrity.
 *
 * Supabase clients never throw; a failed has_event edge select/insert used to be
 * silently dropped while the tool reported full success. These tests verify the
 * failure is now surfaced (task_link_created: false) and that a read failure does
 * NOT trigger a (possibly duplicate) insert.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { CalendarExecutor } from './calendar-executor';
import type { ExecutorContext } from './types';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';

interface EdgeMockOptions {
	selectError?: { message: string } | null;
	existingEdge?: { id: string } | null;
	insertError?: { message: string } | null;
}

describe('CalendarExecutor task↔event edge integrity (D14)', () => {
	let mockSupabase: SupabaseClient<Database>;
	let insertSpy: ReturnType<typeof vi.fn>;
	let context: ExecutorContext;

	const buildSupabase = (opts: EdgeMockOptions) => {
		insertSpy = vi.fn().mockResolvedValue({ error: opts.insertError ?? null });
		const edgeQuery = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			maybeSingle: vi.fn().mockResolvedValue({
				data: opts.existingEdge ?? null,
				error: opts.selectError ?? null
			}),
			insert: insertSpy
		};
		return {
			from: vi.fn().mockImplementation((table: string) => {
				if (table === 'onto_edges') return edgeQuery;
				throw new Error(`Unexpected table: ${table}`);
			}),
			rpc: vi.fn().mockResolvedValue({ data: 'actor-1', error: null }),
			auth: {
				getSession: vi.fn().mockResolvedValue({
					data: { session: { access_token: 'token' } }
				})
			}
		} as unknown as SupabaseClient<Database>;
	};

	const buildExecutor = (opts: EdgeMockOptions) => {
		mockSupabase = buildSupabase(opts);
		context = {
			supabase: mockSupabase,
			userId: 'user-1',
			sessionId: 'session-1',
			fetchFn: vi.fn() as unknown as typeof fetch,
			getActorId: async () => 'actor-1',
			getAdminSupabase: () => mockSupabase as any,
			getAuthHeaders: async () => ({})
		};
		const executor = new CalendarExecutor(context);
		// Stub the dependencies createCalendarEvent needs so we can exercise the
		// edge-linking branch in isolation.
		(executor as any).resolveInputTimezone = async () => 'America/New_York';
		(executor as any).assertProjectAccess = async () => undefined;
		(executor as any).resolveTaskMetadata = async () => ({
			taskId: TASK_ID,
			taskTitle: 'Task',
			projectId: PROJECT_ID,
			taskLink: `/tasks/${TASK_ID}`
		});
		(executor as any).eventSyncService = {
			createEvent: vi.fn().mockResolvedValue({ event: { id: EVENT_ID } })
		};
		return executor;
	};

	const createArgs = {
		title: 'Work block',
		start_at: '2026-08-01T10:00:00Z',
		end_at: '2026-08-01T11:00:00Z',
		task_id: TASK_ID,
		project_id: PROJECT_ID
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('surfaces task_link_created: false when the edge insert fails', async () => {
		const executor = buildExecutor({ insertError: { message: 'insert violates FK' } });

		const result: any = await executor.createCalendarEvent(createArgs);

		expect(insertSpy).toHaveBeenCalledTimes(1);
		expect(result.task_link_created).toBe(false);
		expect(result.task_link_error).toContain('insert violates FK');
		expect(result.event.id).toBe(EVENT_ID);
	});

	it('does NOT insert when the edge select fails (avoids duplicate) and reports link failure', async () => {
		const executor = buildExecutor({ selectError: { message: 'read timeout' } });

		const result: any = await executor.createCalendarEvent(createArgs);

		expect(insertSpy).not.toHaveBeenCalled();
		expect(result.task_link_created).toBe(false);
		expect(result.task_link_error).toContain('read timeout');
	});

	it('reports task_link_created: true on a successful insert', async () => {
		const executor = buildExecutor({});

		const result: any = await executor.createCalendarEvent(createArgs);

		expect(insertSpy).toHaveBeenCalledTimes(1);
		expect(result.task_link_created).toBe(true);
		expect(result.task_link_error).toBeUndefined();
	});

	it('reports task_link_created: true (no insert) when the edge already exists', async () => {
		const executor = buildExecutor({ existingEdge: { id: 'edge-1' } });

		const result: any = await executor.createCalendarEvent(createArgs);

		expect(insertSpy).not.toHaveBeenCalled();
		expect(result.task_link_created).toBe(true);
	});
});
