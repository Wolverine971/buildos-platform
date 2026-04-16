// apps/worker/tests/chatSessionClassifierLibri.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetJSONResponse = vi.hoisted(() => vi.fn());
const mockUpdateJobStatus = vi.hoisted(() => vi.fn());
const mockSupabaseFrom = vi.hoisted(() => vi.fn());
const mockSupabaseRpc = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: mockSupabaseFrom,
		rpc: mockSupabaseRpc
	}
}));

vi.mock('../src/lib/services/smart-llm-service', () => ({
	SmartLLMService: vi.fn().mockImplementation(() => ({
		getJSONResponse: mockGetJSONResponse
	}))
}));

vi.mock('../src/workers/shared/queueUtils', () => ({
	updateJobStatus: mockUpdateJobStatus,
	validateChatClassificationJobData: vi.fn((data) => data)
}));

vi.mock('../src/workers/chat/chatSessionActivityProcessor', () => ({
	processSessionActivityAndNextSteps: vi.fn().mockResolvedValue({
		activityLogsCreated: 0,
		nextStepUpdated: false,
		projectId: null
	})
}));

vi.mock('../src/workers/chat/profileSignalProcessor', () => ({
	processProfileSignals: vi.fn().mockResolvedValue({
		skipped: true,
		reason: 'test',
		extractedCount: 0,
		insertedCount: 0,
		mergedCount: 0,
		needsReviewCount: 0
	})
}));

vi.mock('../src/workers/chat/contactSignalProcessor', () => ({
	processContactSignals: vi.fn().mockResolvedValue({
		skipped: true,
		reason: 'test',
		extractedCount: 0,
		insertedCount: 0,
		appliedCount: 0,
		createdCount: 0,
		needsConfirmationCount: 0,
		mergeCandidateCount: 0
	})
}));

vi.mock('../src/lib/errorLogger', () => ({
	logWorkerError: vi.fn()
}));

import { processChatClassificationJob } from '../src/workers/chat/chatSessionClassifier';

function chain<T extends Record<string, unknown>>(target: T): T {
	return target;
}

describe('processChatClassificationJob Libri extraction', () => {
	let capturedSessionUpdate: Record<string, unknown> | null;
	let sessionData: Record<string, unknown>;
	let messageData: Array<Record<string, unknown>>;

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		capturedSessionUpdate = null;
		mockUpdateJobStatus.mockResolvedValue(undefined);
		mockSupabaseRpc.mockResolvedValue({ data: {}, error: null });
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');

		sessionData = {
			id: 'session-1',
			title: 'Agent Session',
			auto_title: null,
			chat_topics: null,
			summary: null,
			extracted_entities: null,
			message_count: 3,
			status: 'active',
			context_type: 'project',
			entity_id: 'project-1',
			last_message_at: '2026-04-15T12:02:00.000Z',
			last_classified_at: null
		};

		messageData = [
			{
				id: 'msg-1',
				role: 'user',
				content: 'I am thinking about James Clear and Atomic Habits for this project.',
				created_at: '2026-04-15T12:00:00.000Z'
			},
			{
				id: 'msg-2',
				role: 'user',
				content:
					'Also remind me to process this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ',
				created_at: '2026-04-15T12:01:00.000Z'
			},
			{
				id: 'msg-3',
				role: 'assistant',
				content: 'Got it.',
				created_at: '2026-04-15T12:02:00.000Z'
			}
		];

		const sessionSelect = chain({
			eq: vi.fn(() => sessionSelect),
			maybeSingle: vi.fn().mockImplementation(async () => ({
				data: sessionData,
				error: null
			}))
		});

		const messageSelect = chain({
			eq: vi.fn(() => messageSelect),
			order: vi.fn(() => messageSelect),
			limit: vi.fn().mockImplementation(async () => ({
				data: messageData,
				error: null
			}))
		});

		const sessionUpdate = vi.fn((payload: Record<string, unknown>) => {
			capturedSessionUpdate = payload;
			return {
				eq: vi.fn().mockResolvedValue({ error: null })
			};
		});

		mockSupabaseFrom.mockImplementation((table: string) => {
			if (table === 'chat_sessions') {
				return {
					select: vi.fn(() => sessionSelect),
					update: sessionUpdate
				};
			}
			if (table === 'chat_messages') {
				return {
					select: vi.fn(() => messageSelect)
				};
			}
			throw new Error(`Unexpected table: ${table}`);
		});

		mockGetJSONResponse.mockResolvedValue({
			title: 'Libri Resource Planning',
			topics: ['libri', 'books', 'youtube'],
			summary: 'The user discussed James Clear, Atomic Habits, and a YouTube video.',
			extracted_entities: {
				libri_candidates: [
					{
						entity_type: 'person',
						display_name: 'James Clear',
						canonical_query: 'James Clear',
						confidence: 0.96,
						relevance: 'primary',
						recommended_action: 'resolve_or_enqueue',
						user_requested_research: true,
						extraction_reason: 'The user explicitly discussed James Clear.',
						source_message_ids: ['msg-1'],
						source_turn_indices: [0],
						evidence_snippets: ['thinking about James Clear']
					},
					{
						entity_type: 'book',
						display_name: 'Atomic Habits',
						canonical_query: 'Atomic Habits James Clear',
						authors: ['James Clear'],
						confidence: 0.94,
						relevance: 'primary',
						recommended_action: 'resolve_or_enqueue',
						user_requested_research: true,
						extraction_reason: 'The user explicitly discussed the book.',
						source_message_ids: ['msg-1'],
						source_turn_indices: [0],
						evidence_snippets: ['Atomic Habits']
					},
					{
						entity_type: 'youtube_video',
						display_name: 'YouTube video',
						canonical_query: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
						url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
						confidence: 0.99,
						relevance: 'primary',
						recommended_action: 'resolve_or_enqueue',
						user_requested_research: true,
						extraction_reason: 'The user asked to process the video.',
						source_message_ids: ['msg-2'],
						source_turn_indices: [1],
						evidence_snippets: ['process this video']
					},
					{
						entity_type: 'book',
						display_name: 'Search Only Book',
						canonical_query: 'Search Only Book',
						confidence: 0.95,
						relevance: 'supporting',
						recommended_action: 'search_only',
						user_requested_research: false,
						extraction_reason: 'Only a side mention.',
						source_message_ids: ['msg-1'],
						source_turn_indices: [0],
						evidence_snippets: ['side mention']
					}
				],
				extraction_version: 'libri_session_synthesis_v1',
				extracted_at: '2026-04-15T12:03:00.000Z'
			}
		});
	});

	it('saves extracted_entities before recording disabled Libri handoff status', async () => {
		const result = await processChatClassificationJob({
			id: 'job-1',
			data: { sessionId: 'session-1', userId: 'user-1' }
		} as any);

		expect(capturedSessionUpdate?.extracted_entities).toEqual(
			expect.objectContaining({
				extraction_version: 'libri_session_synthesis_v1',
				libri_candidates: expect.arrayContaining([
					expect.objectContaining({
						entity_type: 'person',
						display_name: 'James Clear'
					}),
					expect.objectContaining({
						entity_type: 'book',
						display_name: 'Atomic Habits',
						authors: ['James Clear']
					}),
					expect.objectContaining({
						entity_type: 'youtube_video',
						youtube_video_id: 'dQw4w9WgXcQ'
					}),
					expect.objectContaining({
						entity_type: 'book',
						display_name: 'Search Only Book',
						recommended_action: 'search_only'
					})
				])
			})
		);
		expect(mockSupabaseRpc).toHaveBeenCalledWith('merge_chat_session_agent_metadata', {
			p_session_id: 'session-1',
			p_patch: {
				libri_handoff: expect.objectContaining({
					status: 'not_configured',
					results: expect.arrayContaining([
						expect.objectContaining({ canonical_query: 'James Clear' }),
						expect.objectContaining({ canonical_query: 'Atomic Habits James Clear' }),
						expect.objectContaining({
							canonical_query: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
						})
					])
				})
			}
		});
		expect((result as any).libriHandoff.status).toBe('not_configured');

		const llmArgs = mockGetJSONResponse.mock.calls[0][0];
		expect(llmArgs.systemPrompt).toContain(
			'entity_type must be exactly one of "person", "book", "youtube_video", or "youtube_channel"'
		);
		expect(llmArgs.systemPrompt).toContain(
			'recommended_action must be exactly one of "resolve_or_enqueue", "search_only", or "ignore"'
		);
		expect(llmArgs.systemPrompt).not.toContain('person|book|youtube_video|youtube_channel');
		expect(llmArgs.systemPrompt).not.toContain('primary|supporting|incidental');
		expect(llmArgs.systemPrompt).not.toContain('resolve_or_enqueue|search_only|ignore');
	});

	it('classifies one-message sessions so explicit YouTube URLs can be extracted', async () => {
		sessionData.message_count = 1;
		sessionData.last_message_at = '2026-04-15T12:00:00.000Z';
		messageData = [
			{
				id: 'msg-single',
				role: 'user',
				content:
					'Please save this YouTube video: https://www.youtube.com/watch?v=dQw4w9WgXcQ',
				created_at: '2026-04-15T12:00:00.000Z'
			}
		];
		mockGetJSONResponse.mockResolvedValueOnce({
			title: 'Quick chat',
			topics: ['youtube'],
			summary: 'The user asked to save a YouTube video for later.',
			extracted_entities: {
				libri_candidates: [
					{
						entity_type: 'youtube_video',
						display_name: 'YouTube video',
						canonical_query: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
						confidence: 0.98,
						relevance: 'primary',
						recommended_action: 'resolve_or_enqueue',
						user_requested_research: true,
						extraction_reason: 'The user explicitly asked to save the video.',
						source_message_ids: ['msg-single'],
						source_turn_indices: [0],
						evidence_snippets: ['save this YouTube video']
					}
				],
				extraction_version: 'libri_session_synthesis_v1',
				extracted_at: '2026-04-15T12:01:00.000Z'
			}
		});

		const result = await processChatClassificationJob({
			id: 'job-1',
			data: { sessionId: 'session-1', userId: 'user-1' }
		} as any);

		expect(mockGetJSONResponse).toHaveBeenCalledTimes(1);
		expect(capturedSessionUpdate?.extracted_entities).toEqual(
			expect.objectContaining({
				libri_candidates: [
					expect.objectContaining({
						entity_type: 'youtube_video',
						source_message_ids: ['msg-single'],
						source_turn_indices: [0],
						youtube_video_id: 'dQw4w9WgXcQ'
					})
				]
			})
		);
		expect((result as any).reason).toBeUndefined();
	});

	it('classifies one-message sessions so explicit people can be extracted', async () => {
		sessionData.message_count = 1;
		sessionData.last_message_at = '2026-04-15T12:00:00.000Z';
		messageData = [
			{
				id: 'msg-single',
				role: 'user',
				content: 'Please research James Clear.',
				created_at: '2026-04-15T12:00:00.000Z'
			}
		];
		mockGetJSONResponse.mockResolvedValueOnce({
			title: 'Quick chat',
			topics: ['person', 'research'],
			summary: 'The user asked to research James Clear.',
			extracted_entities: {
				libri_candidates: [
					{
						entity_type: 'person',
						display_name: 'James Clear',
						canonical_query: 'James Clear',
						confidence: 0.97,
						relevance: 'primary',
						recommended_action: 'resolve_or_enqueue',
						user_requested_research: true,
						extraction_reason: 'The user explicitly asked to research this person.',
						source_message_ids: ['msg-single'],
						source_turn_indices: [0],
						evidence_snippets: ['research James Clear']
					}
				],
				extraction_version: 'libri_session_synthesis_v1',
				extracted_at: '2026-04-15T12:01:00.000Z'
			}
		});

		await processChatClassificationJob({
			id: 'job-1',
			data: { sessionId: 'session-1', userId: 'user-1' }
		} as any);

		expect(mockGetJSONResponse).toHaveBeenCalledTimes(1);
		expect(capturedSessionUpdate?.extracted_entities).toEqual(
			expect.objectContaining({
				libri_candidates: [
					expect.objectContaining({
						entity_type: 'person',
						display_name: 'James Clear',
						source_message_ids: ['msg-single'],
						source_turn_indices: [0]
					})
				]
			})
		);
	});

	it('keeps whitespace-only sessions on the empty extraction fallback', async () => {
		sessionData.message_count = 1;
		sessionData.last_message_at = '2026-04-15T12:00:00.000Z';
		messageData = [
			{
				id: 'msg-empty',
				role: 'user',
				content: '   \n\t  ',
				created_at: '2026-04-15T12:00:00.000Z'
			}
		];

		const result = await processChatClassificationJob({
			id: 'job-1',
			data: { sessionId: 'session-1', userId: 'user-1' }
		} as any);

		expect(mockGetJSONResponse).not.toHaveBeenCalled();
		expect(capturedSessionUpdate?.extracted_entities).toEqual(
			expect.objectContaining({
				libri_candidates: []
			})
		);
		expect((result as any).reason).toBe('no_meaningful_user_messages');
	});
});
