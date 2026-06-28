// apps/web/src/lib/services/calendar-analysis.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	convertCalendarSuggestionToProjectSpec: vi.fn(),
	instantiateProject: vi.fn(),
	queueProjectContextSnapshot: vi.fn(),
	createAdminSupabaseClient: vi.fn(),
	syncInboxItemForCalendarSuggestion: vi.fn(),
	logError: vi.fn()
}));

vi.mock('$lib/supabase', () => ({
	supabase: null
}));

vi.mock('$lib/services/calendar-service', () => ({
	CalendarService: vi.fn()
}));

vi.mock('$lib/services/smart-llm-service', () => ({
	SmartLLMService: vi.fn()
}));

vi.mock('$lib/services/ontology/calendar-suggestion-to-ontology-adapter', () => ({
	convertCalendarSuggestionToProjectSpec: mocks.convertCalendarSuggestionToProjectSpec
}));

vi.mock('$lib/services/ontology/instantiation.service', () => ({
	instantiateProject: mocks.instantiateProject
}));

vi.mock('$lib/server/project-context-snapshot.service', () => ({
	queueProjectContextSnapshot: mocks.queueProjectContextSnapshot
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

vi.mock('@buildos/shared-agent-ops', () => ({
	syncInboxItemForCalendarSuggestion: mocks.syncInboxItemForCalendarSuggestion
}));

vi.mock('$lib/services/errorLogger.service', () => ({
	ErrorLoggerService: {
		getInstance: vi.fn(() => ({ logError: mocks.logError }))
	}
}));

import { CalendarAnalysisService } from './calendar-analysis.service';

type QueryResult = { data: unknown; error: null | { message: string } };

function makeSupabase(script: Record<string, QueryResult[]>) {
	const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
	const supabase = {
		from: vi.fn((table: string) => {
			const builder: any = {
				select: vi.fn(() => builder),
				eq: vi.fn(() => builder),
				in: vi.fn(() => builder),
				order: vi.fn(() => builder),
				limit: vi.fn(() => builder),
				update: vi.fn((payload: Record<string, unknown>) => {
					updates.push({ table, payload });
					return builder;
				}),
				maybeSingle: vi.fn(
					async () => script[table]?.shift() ?? { data: null, error: null }
				),
				single: vi.fn(async () => script[table]?.shift() ?? { data: null, error: null })
			};
			return builder;
		})
	};
	return { supabase, updates };
}

function calendarSuggestion(overrides: Record<string, unknown> = {}) {
	return {
		id: 'calendar-suggestion-1',
		user_id: 'user-1',
		analysis_id: 'analysis-1',
		status: 'pending',
		suggested_name: 'Launch Planning',
		suggested_description: 'Plan launch work',
		suggested_context: 'Calendar-derived launch project',
		confidence_score: 0.82,
		calendar_event_ids: ['event-1'],
		calendar_ids: ['primary'],
		event_count: 1,
		event_patterns: {},
		suggested_tasks: [],
		detected_keywords: ['launch'],
		ai_reasoning: 'Several related meetings',
		created_project_id: null,
		rejection_reason: null,
		status_changed_at: null,
		created_at: '2026-06-27T00:00:00.000Z',
		updated_at: '2026-06-27T00:00:00.000Z',
		...overrides
	};
}

describe('CalendarAnalysisService.acceptSuggestion', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createAdminSupabaseClient.mockReturnValue({});
		mocks.syncInboxItemForCalendarSuggestion.mockResolvedValue(undefined);
		mocks.convertCalendarSuggestionToProjectSpec.mockReturnValue({
			project: { name: 'Launch Planning' },
			tasks: []
		});
		mocks.instantiateProject.mockResolvedValue({
			project_id: 'project-1',
			counts: { tasks: 0 }
		});
		mocks.queueProjectContextSnapshot.mockResolvedValue(undefined);
	});

	it('claims a pending calendar suggestion before accepting it', async () => {
		const { supabase, updates } = makeSupabase({
			calendar_project_suggestions: [
				{
					data: calendarSuggestion({ status: 'processing' }),
					error: null
				},
				{
					data: calendarSuggestion({
						status: 'accepted',
						created_project_id: 'project-1'
					}),
					error: null
				}
			]
		});
		const service = CalendarAnalysisService.getInstance(supabase as any);

		const result = await service.acceptSuggestion('calendar-suggestion-1', 'user-1');

		expect(result).toMatchObject({
			success: true,
			data: {
				projectId: 'project-1',
				counts: { tasks: 0 }
			}
		});
		expect(updates.map((update) => update.payload.status)).toEqual(['processing', 'accepted']);
		expect(mocks.instantiateProject).toHaveBeenCalledWith(
			supabase,
			expect.any(Object),
			'user-1'
		);
		expect(mocks.syncInboxItemForCalendarSuggestion).toHaveBeenCalledTimes(2);
	});

	it('returns the underlying Supabase claim error', async () => {
		const { supabase } = makeSupabase({
			calendar_project_suggestions: [
				{
					data: null,
					error: {
						message:
							'new row for relation "calendar_project_suggestions" violates check constraint "calendar_project_suggestions_status_check"'
					}
				}
			]
		});
		const service = CalendarAnalysisService.getInstance(supabase as any);

		const result = await service.acceptSuggestion('calendar-suggestion-1', 'user-1');

		expect(result.success).toBe(false);
		expect(result.errors?.[0]).toContain('Failed to claim suggestion: new row');
		expect(result.errors?.[0]).toContain('calendar_project_suggestions_status_check');
		expect(mocks.instantiateProject).not.toHaveBeenCalled();
	});

	it('treats an active processing suggestion as in progress', async () => {
		const processing = calendarSuggestion({
			status: 'processing',
			status_changed_at: new Date().toISOString()
		});
		const { supabase } = makeSupabase({
			calendar_project_suggestions: [
				{ data: null, error: null },
				{ data: processing, error: null }
			]
		});
		const service = CalendarAnalysisService.getInstance(supabase as any);

		const result = await service.acceptSuggestion('calendar-suggestion-1', 'user-1');

		expect(result).toMatchObject({
			success: true,
			data: {
				inProgress: true,
				alreadyProcessing: true
			}
		});
		expect(mocks.syncInboxItemForCalendarSuggestion).toHaveBeenCalledWith(
			expect.objectContaining({
				suggestion: expect.objectContaining({ status: 'processing' })
			})
		);
		expect(mocks.instantiateProject).not.toHaveBeenCalled();
	});

	it('reclaims stale processing suggestions before accepting them', async () => {
		const staleProcessing = calendarSuggestion({
			status: 'processing',
			status_changed_at: '2000-01-01T00:00:00.000Z'
		});
		const { supabase, updates } = makeSupabase({
			calendar_project_suggestions: [
				{ data: null, error: null },
				{ data: staleProcessing, error: null },
				{ data: calendarSuggestion({ status: 'processing' }), error: null },
				{
					data: calendarSuggestion({
						status: 'accepted',
						created_project_id: 'project-1'
					}),
					error: null
				}
			]
		});
		const service = CalendarAnalysisService.getInstance(supabase as any);

		const result = await service.acceptSuggestion('calendar-suggestion-1', 'user-1');

		expect(result).toMatchObject({
			success: true,
			data: {
				projectId: 'project-1',
				counts: { tasks: 0 }
			}
		});
		expect(updates.map((update) => update.payload.status)).toEqual([
			'processing',
			'processing',
			'accepted'
		]);
		expect(mocks.instantiateProject).toHaveBeenCalledTimes(1);
	});

	it('returns the underlying final status update error after project creation', async () => {
		const { supabase } = makeSupabase({
			calendar_project_suggestions: [
				{ data: calendarSuggestion({ status: 'processing' }), error: null },
				{
					data: null,
					error: {
						message:
							'insert or update on table "calendar_project_suggestions" violates foreign key constraint "calendar_project_suggestions_created_project_id_fkey"'
					}
				}
			]
		});
		const service = CalendarAnalysisService.getInstance(supabase as any);

		const result = await service.acceptSuggestion('calendar-suggestion-1', 'user-1');

		expect(result.success).toBe(false);
		expect(result.errors?.[0]).toContain(
			'Failed to update suggestion status: insert or update'
		);
		expect(result.errors?.[0]).toContain(
			'calendar_project_suggestions_created_project_id_fkey'
		);
		expect(mocks.instantiateProject).toHaveBeenCalledTimes(1);
	});
});
