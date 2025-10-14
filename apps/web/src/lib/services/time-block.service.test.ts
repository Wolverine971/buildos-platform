// apps/web/src/lib/services/time-block.service.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TimeBlockService } from './time-block.service';

type QueryResponse = { data: any; error: any };

function createQueryBuilder(response: QueryResponse) {
	const builder: any = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		neq: vi.fn().mockReturnThis(),
		filter: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		insert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockResolvedValue(response),
		single: vi.fn().mockResolvedValue(response),
		then: (resolve: any, reject?: any) => Promise.resolve(response).then(resolve, reject)
	};
	return builder;
}

describe('TimeBlockService', () => {
	let mockSupabase: any;
	let mockCalendarService: any;
	let service: TimeBlockService;
	let mockSuggestionService: { generateSuggestions: ReturnType<typeof vi.fn> };
	let suggestionResult: {
		suggestions: any[];
		summary: string;
		model: string;
		generatedAt: Date;
	};

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2025-10-15T08:00:00Z'));

		mockCalendarService = {
			createStandaloneEvent: vi.fn().mockResolvedValue({
				eventId: 'cal-event-123',
				eventLink: 'https://calendar.google.com/event?eid=123'
			}),
			deleteCalendarEvent: vi.fn().mockResolvedValue(undefined),
			updateCalendarEvent: vi.fn().mockResolvedValue(undefined)
		};

		mockSupabase = {
			from: vi.fn()
		};

		suggestionResult = {
			suggestions: [
				{
					title: 'Polish onboarding deck',
					reason: 'Critical for investor update.',
					project_id: 'proj-1',
					project_name: 'Test Project',
					estimated_minutes: 90,
					priority: 'high',
					task_id: 'task-1',
					confidence: 0.9
				}
			],
			summary: 'Focus on the most impactful deliverable for this project.',
			model: 'test-model',
			generatedAt: new Date('2025-10-15T07:55:00Z')
		};

		mockSuggestionService = {
			generateSuggestions: vi.fn().mockResolvedValue({
				...suggestionResult
			})
		};

		service = new TimeBlockService(
			mockSupabase,
			'user-123',
			mockCalendarService,
			mockSuggestionService as any
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('creates a time block with valid parameters', async () => {
		const params = {
			block_type: 'project' as const,
			project_id: 'proj-1',
			start_time: new Date('2025-10-15T09:00:00Z'),
			end_time: new Date('2025-10-15T11:00:00Z')
		};

		const generatedAtIso = suggestionResult.generatedAt.toISOString();
		const nowIso = new Date('2025-10-15T08:00:00Z').toISOString();

		const insertedBlock = {
			id: 'block-1',
			user_id: 'user-123',
			project_id: 'proj-1',
			start_time: params.start_time.toISOString(),
			end_time: params.end_time.toISOString(),
			duration_minutes: 120,
			timezone: 'America/New_York',
			calendar_event_id: 'cal-event-123',
			calendar_event_link: 'https://calendar.google.com/event?eid=123',
			ai_suggestions: suggestionResult.suggestions,
			suggestions_summary: suggestionResult.summary,
			suggestions_generated_at: generatedAtIso,
			suggestions_model: suggestionResult.model,
			sync_status: 'synced',
			last_synced_at: nowIso,
			created_at: nowIso,
			updated_at: nowIso,
			project: {
				id: 'proj-1',
				name: 'Test Project',
				calendar_color_id: '5'
			}
		};

		const mockQueue: Array<{ table: string; builder: any }> = [
			{
				table: 'time_blocks',
				builder: createQueryBuilder({ data: [], error: null })
			},
			{
				table: 'projects',
				builder: createQueryBuilder({
					data: { name: 'Test Project', calendar_color_id: '5' },
					error: null
				})
			},
			{
				table: 'time_blocks',
				builder: createQueryBuilder({ data: insertedBlock, error: null })
			}
		];

		mockSupabase.from.mockImplementation((table: string) => {
			const next = mockQueue.shift();
			if (!next) {
				throw new Error(`Unexpected table access: ${table}`);
			}
			expect(table).toBe(next.table);
			return next.builder;
		});

		const result = await service.createTimeBlock(params);

		expect(result).toEqual(insertedBlock);
		expect(mockSuggestionService.generateSuggestions).toHaveBeenCalledWith(
			expect.objectContaining({
				blockType: 'project',
				projectId: 'proj-1'
			})
		);
		expect(mockCalendarService.createStandaloneEvent).toHaveBeenCalledWith(
			'user-123',
			expect.objectContaining({
				summary: expect.stringContaining('Test Project'),
				description: expect.stringContaining('Suggested focus'),
				colorId: '5',
				timeZone: 'America/New_York'
			})
		);
		expect(mockCalendarService.deleteCalendarEvent).not.toHaveBeenCalled();
	});

	it('rejects blocks shorter than minimum duration', async () => {
		const params = {
			block_type: 'project' as const,
			project_id: 'proj-1',
			start_time: new Date('2025-10-15T09:00:00Z'),
			end_time: new Date('2025-10-15T09:10:00Z')
		};

		await expect(service.createTimeBlock(params)).rejects.toThrow(
			'Time block must be at least 30 minutes'
		);
		expect(mockSupabase.from).not.toHaveBeenCalled();
	});

	it('deletes a time block and calendar event', async () => {
		const mockQueue: Array<{ table: string; builder: any }> = [
			{
				table: 'time_blocks',
				builder: createQueryBuilder({
					data: { calendar_event_id: 'cal-event-456' },
					error: null
				})
			},
			{
				table: 'time_blocks',
				builder: createQueryBuilder({ data: null, error: null })
			}
		];

		mockSupabase.from.mockImplementation((table: string) => {
			const next = mockQueue.shift();
			if (!next) {
				throw new Error(`Unexpected table access: ${table}`);
			}
			expect(table).toBe(next.table);
			return next.builder;
		});

		await service.deleteTimeBlock('block-123');

		expect(mockCalendarService.deleteCalendarEvent).toHaveBeenCalledWith('user-123', {
			event_id: 'cal-event-456'
		});
	});

	it('regenerates suggestions and updates calendar event', async () => {
		const existingBlock = {
			id: 'block-1',
			user_id: 'user-123',
			block_type: 'project',
			project_id: 'proj-1',
			start_time: '2025-10-15T09:00:00.000Z',
			end_time: '2025-10-15T11:00:00.000Z',
			duration_minutes: 120,
			timezone: 'America/New_York',
			calendar_event_id: 'cal-event-123',
			calendar_event_link: 'https://calendar.google.com/event?eid=123',
			ai_suggestions: suggestionResult.suggestions,
			suggestions_summary: suggestionResult.summary,
			suggestions_generated_at: suggestionResult.generatedAt.toISOString(),
			suggestions_model: suggestionResult.model,
			sync_status: 'synced',
			last_synced_at: '2025-10-15T08:00:00.000Z',
			created_at: '2025-10-15T07:00:00.000Z',
			updated_at: '2025-10-15T08:00:00.000Z',
			project: {
				id: 'proj-1',
				name: 'Test Project',
				calendar_color_id: '5'
			}
		};

		const newSuggestionResult = {
			suggestions: [
				{
					title: 'Refine investor memo',
					reason: 'Needed before tomorrow’s sync.',
					project_id: 'proj-1',
					project_name: 'Test Project',
					estimated_minutes: 60,
					priority: 'high',
					task_id: 'task-2',
					confidence: 0.8
				}
			],
			summary: 'Tighten the investor narrative ahead of the review.',
			model: 'test-model-2',
			generatedAt: new Date('2025-10-15T08:05:00Z')
		};

		mockSuggestionService.generateSuggestions.mockResolvedValueOnce(newSuggestionResult);

		const updatedBlock = {
			...existingBlock,
			ai_suggestions: newSuggestionResult.suggestions,
			suggestions_summary: newSuggestionResult.summary,
			suggestions_generated_at: newSuggestionResult.generatedAt.toISOString(),
			suggestions_model: newSuggestionResult.model,
			last_synced_at: new Date('2025-10-15T08:00:00Z').toISOString(),
			updated_at: new Date('2025-10-15T08:00:00Z').toISOString()
		};

		const mockQueue: Array<{ table: string; builder: any }> = [
			{
				table: 'time_blocks',
				builder: createQueryBuilder({ data: existingBlock, error: null })
			},
			{
				table: 'time_blocks',
				builder: createQueryBuilder({ data: updatedBlock, error: null })
			}
		];

		mockSupabase.from.mockImplementation((table: string) => {
			const next = mockQueue.shift();
			if (!next) {
				throw new Error(`Unexpected table access: ${table}`);
			}
			expect(table).toBe(next.table);
			return next.builder;
		});

		const result = await service.regenerateSuggestions('block-1');

		expect(result).toEqual(updatedBlock);
		expect(mockSuggestionService.generateSuggestions).toHaveBeenCalledWith(
			expect.objectContaining({
				blockType: 'project',
				projectId: 'proj-1'
			})
		);
		expect(mockCalendarService.updateCalendarEvent).toHaveBeenCalledWith(
			'user-123',
			expect.objectContaining({
				event_id: 'cal-event-123',
				description: expect.stringContaining('Refine investor memo')
			})
		);
	});

	describe('calculateTimeAllocation', () => {
		it('returns zero allocation when no blocks are found', async () => {
			mockSupabase.from.mockReturnValue(
				createQueryBuilder({
					data: [],
					error: null
				})
			);

			const start = new Date('2025-10-13T00:00:00.000Z');
			const end = new Date('2025-10-20T00:00:00.000Z');

			const allocation = await service.calculateTimeAllocation(start, end);

			expect(allocation).toEqual({
				total_hours: 0,
				build_block_hours: 0,
				project_allocations: [],
				date_range: {
					start: start.toISOString(),
					end: end.toISOString()
				}
			});
		});

		it('calculates allocation across project and build blocks with partial overlaps', async () => {
			const response = {
				data: [
					{
						id: 'block-project-1',
						block_type: 'project',
						project_id: 'proj-1',
						start_time: '2025-10-14T13:00:00.000Z',
						end_time: '2025-10-14T15:00:00.000Z',
						duration_minutes: 120,
						project: {
							id: 'proj-1',
							name: 'Launch Website',
							calendar_color_id: '5'
						}
					},
					{
						id: 'block-build-1',
						block_type: 'build',
						project_id: null,
						start_time: '2025-10-15T18:00:00.000Z',
						end_time: '2025-10-15T19:30:00.000Z',
						duration_minutes: 90,
						project: null
					},
					{
						id: 'block-project-2',
						block_type: 'project',
						project_id: 'proj-2',
						start_time: '2025-10-19T21:00:00.000Z',
						end_time: '2025-10-20T01:00:00.000Z',
						duration_minutes: 240,
						project: {
							id: 'proj-2',
							name: 'Investor Update',
							calendar_color_id: '9'
						}
					}
				],
				error: null
			};

			mockSupabase.from.mockReturnValue(createQueryBuilder(response));

			const start = new Date('2025-10-13T00:00:00.000Z');
			const end = new Date('2025-10-20T00:00:00.000Z');

			const allocation = await service.calculateTimeAllocation(start, end);

			expect(allocation.total_hours).toBeCloseTo(6.5, 5);
			expect(allocation.build_block_hours).toBeCloseTo(1.5, 5);
			expect(allocation.project_allocations).toHaveLength(2);

			const projectOne = allocation.project_allocations.find(
				(project) => project.project_id === 'proj-1'
			);
			expect(projectOne).toBeDefined();
			expect(projectOne?.hours).toBeCloseTo(2, 5);
			expect(projectOne?.percentage).toBeCloseTo(30.77, 2);
			expect(projectOne?.block_count).toBe(1);

			const projectTwo = allocation.project_allocations.find(
				(project) => project.project_id === 'proj-2'
			);
			expect(projectTwo).toBeDefined();
			expect(projectTwo?.hours).toBeCloseTo(3, 5);
			expect(projectTwo?.percentage).toBeCloseTo(46.15, 2);
			expect(projectTwo?.block_count).toBe(1);

			expect(allocation.date_range).toEqual({
				start: start.toISOString(),
				end: end.toISOString()
			});
		});
	});
});
