// apps/worker/tests/chatSessionClassifierLibri.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetJSONResponse = vi.hoisted(() => vi.fn());
const mockUpdateJobStatus = vi.hoisted(() => vi.fn());
const mockSupabaseFrom = vi.hoisted(() => vi.fn());
const mockSupabaseRpc = vi.hoisted(() => vi.fn());
const mockQueueSnapshot = vi.hoisted(() => vi.fn());
const mockOwnerCanReachProject = vi.hoisted(() => vi.fn());

// The session's scope is user-written; the worker follows it only when the owner can reach
// the project. These tests decide that answer here; tests/projectAccess.test.ts covers the lookup.
vi.mock('../src/lib/projectAccess', () => ({
	accessibleSessionProjectId: async (
		_client: unknown,
		userId: string,
		session: { context_type?: string | null; entity_id?: string | null } | null,
		level?: string
	) =>
		session?.context_type === 'project' &&
		session.entity_id &&
		(await mockOwnerCanReachProject(userId, session.entity_id, level ?? 'read'))
			? session.entity_id
			: null
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: mockSupabaseFrom,
		rpc: mockSupabaseRpc
	}
}));

vi.mock('../src/lib/services/smart-llm-service', () => ({
	SmartLLMService: vi.fn().mockImplementation(function () {
		return {
			getJSONResponse: mockGetJSONResponse
		};
	})
}));

vi.mock('../src/workers/shared/queueUtils', () => ({
	updateJobStatus: mockUpdateJobStatus,
	validateChatClassificationJobData: vi.fn((data) => data)
}));

vi.mock('../src/workers/chat/chatSessionActivityProcessor', () => ({
	processSessionActivityAndNextSteps: vi.fn().mockResolvedValue({
		nextStepUpdated: false,
		projectId: null
	})
}));

vi.mock('../src/workers/ontology/projectContextSnapshotWorker', () => ({
	queueProjectContextSnapshot: mockQueueSnapshot
}));

vi.mock('../src/lib/errorLogger', () => ({
	logWorkerError: vi.fn()
}));

import { TransientQueueError, classifyQueueError } from '../src/lib/queueErrors';
import { processSessionActivityAndNextSteps } from '../src/workers/chat/chatSessionActivityProcessor';
import {
	buildClassificationSystemPrompt,
	buildClassificationUserPrompt,
	processChatClassificationJob,
	selectClassificationPromptMessages
} from '../src/workers/chat/chatSessionClassifier';

function chain<T extends Record<string, unknown>>(target: T): T {
	return target;
}

/** The Libri hand-off as it is in an environment where it is switched on and reachable. */
function configureLibri() {
	vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');
	vi.stubEnv('LIBRI_API_BASE_URL', 'https://libri.example/api/v1/');
	vi.stubEnv('LIBRI_API_KEY', 'secret');
	const fetchMock = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
		const entities = (JSON.parse(String(init?.body)) as { entities: unknown[] }).entities;
		return {
			ok: true,
			status: 200,
			json: async () => ({ results: entities.map(() => ({ status: 'queued' })) })
		};
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

describe('processChatClassificationJob', () => {
	let capturedSessionUpdate: Record<string, unknown> | null;
	let classificationSaveError: { message: string } | null;
	let sessionData: Record<string, unknown>;
	let messageData: Array<Record<string, unknown>>;
	/** queue_jobs rows the snapshot lookup returns, and the filters it was asked with. */
	let snapshotJobs: Array<Record<string, unknown>>;
	let snapshotLookupError: { message: string } | null;
	let snapshotLookupFilters: Array<[string, unknown[]]>;

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		capturedSessionUpdate = null;
		classificationSaveError = null;
		snapshotJobs = [];
		snapshotLookupError = null;
		snapshotLookupFilters = [];
		mockUpdateJobStatus.mockResolvedValue(undefined);
		mockSupabaseRpc.mockResolvedValue({ data: {}, error: null });
		mockQueueSnapshot.mockResolvedValue({ queued: true, reason: 'queued' });
		mockOwnerCanReachProject.mockResolvedValue(true);
		// Production today: the hand-off is not configured.
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
				data: structuredClone(sessionData),
				error: null
			}))
		});

		// Honors the role filter, order direction and limit like PostgREST, so tests see
		// the same message window the classifier would in production.
		const messageSelect = () => {
			let ascending = true;
			let role: unknown = null;
			const query = {
				eq(column: string, value: unknown) {
					if (column === 'role') role = value;
					return query;
				},
				order(_column: string, options?: { ascending?: boolean }) {
					ascending = options?.ascending !== false;
					return query;
				},
				async limit(count: number) {
					const sorted = messageData
						.filter((message) => role === null || message.role === role)
						.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
					if (!ascending) sorted.reverse();
					return { data: sorted.slice(0, count), error: null };
				}
			};
			return query;
		};

		const snapshotLookup = () => {
			const query: Record<string, (...args: unknown[]) => unknown> = {};
			for (const method of ['select', 'eq', 'like', 'in', 'gte', 'order']) {
				query[method] = (...args: unknown[]) => {
					snapshotLookupFilters.push([method, args]);
					return query;
				};
			}
			query.limit = async () =>
				snapshotLookupError
					? { data: null, error: snapshotLookupError }
					: { data: snapshotJobs, error: null };
			return query;
		};

		const sessionUpdate = vi.fn((payload: Record<string, unknown>) => {
			const filters: Array<[string, unknown]> = [];
			const query = {
				eq(key: string, value: unknown) {
					filters.push([key, value]);
					return query;
				},
				is(key: string, value: unknown) {
					filters.push([key, value]);
					return query;
				},
				then(resolve: (value: unknown) => unknown) {
					if (classificationSaveError && Object.hasOwn(payload, 'summary')) {
						return Promise.resolve({ error: classificationSaveError }).then(resolve);
					}
					if (
						filters.every(
							([key, value]) => key === 'user_id' || sessionData[key] === value
						)
					) {
						capturedSessionUpdate = { ...capturedSessionUpdate, ...payload };
						Object.assign(sessionData, payload);
					}
					return Promise.resolve({ error: null }).then(resolve);
				}
			};
			return query;
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
					select: vi.fn(() => messageSelect())
				};
			}
			if (table === 'queue_jobs') return snapshotLookup();
			// Anything else is a step this job no longer has (contact signals read
			// user_profiles; the old activity log read chat_operations).
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

	// Regression: promotion compares the current title with the initial read.
	it.each([null, 'Agent Session'])('promotes an unchanged placeholder %s', async (title) => {
		sessionData.title = title;
		const result = await processChatClassificationJob({
			id: 'job-promotion',
			data: { sessionId: 'session-1', userId: 'user-1' }
		} as any);
		expect(result.success).toBe(true);
		expect(sessionData.title).toBe('Libri Resource Planning');
	});
	it('preserves a manual title in the no-message fallback', async () => {
		sessionData.title = 'My title';
		messageData = [];
		const result = await processChatClassificationJob({
			id: 'job-empty',
			data: { sessionId: 'session-1', userId: 'user-1' }
		} as any);
		expect(result.success).toBe(true);
		expect(sessionData.title).toBe('My title');
		expect(sessionData.auto_title).toBeTruthy();
		expect(mockGetJSONResponse).not.toHaveBeenCalled();
	});
	it('preserves a manual rename made while classification is awaiting the model', async () => {
		mockGetJSONResponse.mockImplementationOnce(async () => {
			// A successful PATCH /api/chat/sessions/[id] commits during the model call.
			sessionData.title = 'My manually renamed conversation';
			return {
				title: 'Automatic classification title',
				topics: ['planning'],
				summary: 'A planning conversation.',
				extracted_entities: { libri_candidates: [] }
			};
		});

		const result = await processChatClassificationJob({
			id: 'job-rename-race',
			data: { sessionId: 'session-1', userId: 'user-1' }
		} as any);

		expect(result.success).toBe(true);
		expect({ ...sessionData, ...capturedSessionUpdate }.title).toBe(
			'My manually renamed conversation'
		);
	});

	it('retries a failed synthesis save without handing off unsaved entities or reporting completion', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-04-15T12:05:00.000Z'));
		const fetchMock = configureLibri();
		classificationSaveError = { message: 'database unavailable' };
		const job = {
			id: 'job-save-retry',
			data: { sessionId: 'session-1', userId: 'user-1' },
			attemptsMade: 0,
			maxAttempts: 3
		};
		await expect(processChatClassificationJob(job as any)).rejects.toThrow(
			'Failed to update session classification: database unavailable'
		);
		expect(capturedSessionUpdate).toBeNull();
		expect(sessionData.last_classified_at).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(processSessionActivityAndNextSteps).not.toHaveBeenCalled();
		expect(mockQueueSnapshot).not.toHaveBeenCalled();
		expect(mockUpdateJobStatus.mock.calls.some(([, status]) => status === 'completed')).toBe(
			false
		);

		classificationSaveError = null;
		await expect(
			processChatClassificationJob({ ...job, attemptsMade: 1 } as any)
		).resolves.toMatchObject({ success: true });
		expect(sessionData).toMatchObject({
			auto_title: 'Libri Resource Planning',
			chat_topics: ['libri', 'books', 'youtube'],
			summary: 'The user discussed James Clear, Atomic Habits, and a YouTube video.',
			last_classified_at: '2026-04-15T12:02:00.000Z',
			extracted_entities: expect.objectContaining({ libri_candidates: expect.any(Array) })
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(processSessionActivityAndNextSteps).toHaveBeenCalledExactlyOnceWith(
			'session-1',
			'user-1'
		);
		expect(mockQueueSnapshot).toHaveBeenCalledTimes(1);
	});

	it('leaves messages arriving during synthesis eligible for the next classification', async () => {
		mockGetJSONResponse.mockImplementationOnce(async () => {
			sessionData.last_message_at = '2026-04-15T12:04:00.000Z';
			messageData.push({
				id: 'msg-new',
				role: 'user',
				content: 'One more decision.',
				created_at: '2026-04-15T12:04:00.000Z'
			});
			return {
				title: 'Original discussion',
				topics: ['planning'],
				summary: 'The original discussion.'
			};
		});
		const job = { id: 'job-message-race', data: { sessionId: 'session-1', userId: 'user-1' } };
		await processChatClassificationJob(job as any);
		expect(sessionData.last_classified_at).toBe('2026-04-15T12:02:00.000Z');
		expect(sessionData.last_message_at).toBe('2026-04-15T12:04:00.000Z');

		await processChatClassificationJob(job as any);
		expect(mockGetJSONResponse).toHaveBeenCalledTimes(2);
		expect(sessionData.last_classified_at).toBe('2026-04-15T12:04:00.000Z');
		expect(mockGetJSONResponse.mock.calls[0][0].userPrompt).not.toContain('One more decision.');
		expect(mockGetJSONResponse.mock.calls[1][0].userPrompt).toContain(
			'User: One more decision.'
		);
	});

	it('asks only for title, topics and summary while the Libri hand-off is not configured', async () => {
		const result = await processChatClassificationJob({
			id: 'job-1',
			data: { sessionId: 'session-1', userId: 'user-1' }
		} as any);

		const llmArgs = mockGetJSONResponse.mock.calls[0][0];
		expect(llmArgs.systemPrompt).toBe(buildClassificationSystemPrompt({ includeLibri: false }));
		expect(llmArgs.systemPrompt).toContain('"title"');
		expect(llmArgs.systemPrompt).toContain('"topics"');
		expect(llmArgs.systemPrompt).toContain('"summary"');
		for (const libriOnly of [
			'Libri',
			'extracted_entities',
			'libri_candidates',
			'extracted_at'
		]) {
			expect(llmArgs.systemPrompt).not.toContain(libriOnly);
			expect(llmArgs.userPrompt).not.toContain(libriOnly);
		}
		// Ids and turn indices exist only for Libri citations.
		expect(llmArgs.userPrompt).not.toContain('message_id=');
		expect(llmArgs.userPrompt).toContain(
			'User: I am thinking about James Clear and Atomic Habits for this project.'
		);
		expect(llmArgs.userPrompt).toContain('Assistant: Got it.');

		// The model returned candidates anyway (the default reply above): none are stored,
		// and the block keeps its valid shape so the session reads as extracted.
		expect(sessionData.auto_title).toBe('Libri Resource Planning');
		expect(capturedSessionUpdate?.extracted_entities).toEqual({
			libri_candidates: [],
			ignored_candidates: undefined,
			extraction_version: 'libri_session_synthesis_v1',
			extracted_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
		});
		expect(mockSupabaseRpc).not.toHaveBeenCalled();
		expect((result as any).libriHandoff).toBeNull();
	});

	it('is much shorter without the Libri rules and never asks the model for a timestamp', () => {
		const short = buildClassificationSystemPrompt({ includeLibri: false });
		const withLibri = buildClassificationSystemPrompt({ includeLibri: true });

		expect(short.length).toBeLessThan(withLibri.length / 2);
		expect(withLibri).toContain('Libri extraction rules:');
		expect(withLibri).toContain('"extraction_version": "libri_session_synthesis_v1"');
		// `extracted_at` is stamped in code; the model could only invent it.
		expect(withLibri).not.toContain('extracted_at');
		expect(withLibri).not.toContain('ISO-8601');
	});

	it('runs no contact-signal step', async () => {
		const result = await processChatClassificationJob({
			id: 'job-1',
			data: { sessionId: 'session-1', userId: 'user-1' }
		} as any);

		expect(result).not.toHaveProperty('contactSignals');
		expect(new Set(mockSupabaseFrom.mock.calls.map(([table]) => table))).toEqual(
			new Set(['chat_sessions', 'chat_messages'])
		);
	});

	describe('with the Libri hand-off configured', () => {
		let fetchMock: ReturnType<typeof configureLibri>;

		beforeEach(() => {
			fetchMock = configureLibri();
		});

		it('sends the extraction rules, saves extracted_entities, then hands them off', async () => {
			const result = await processChatClassificationJob({
				id: 'job-1',
				data: { sessionId: 'session-1', userId: 'user-1' }
			} as any);

			expect(capturedSessionUpdate?.extracted_entities).toEqual(
				expect.objectContaining({
					extraction_version: 'libri_session_synthesis_v1',
					// Stamped by code at save time, not the value the model sent back.
					extracted_at: expect.not.stringMatching(/^2026-04-15T12:03:00/),
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
			// Only the three "resolve_or_enqueue" candidates are handed off.
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(mockSupabaseRpc).toHaveBeenCalledWith('merge_chat_session_agent_metadata', {
				p_session_id: 'session-1',
				p_patch: {
					libri_handoff: expect.objectContaining({
						status: 'sent',
						results: expect.arrayContaining([
							expect.objectContaining({ canonical_query: 'James Clear' }),
							expect.objectContaining({
								canonical_query: 'Atomic Habits James Clear'
							}),
							expect.objectContaining({
								canonical_query: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
							})
						])
					})
				}
			});
			expect((result as any).libriHandoff.status).toBe('sent');

			const llmArgs = mockGetJSONResponse.mock.calls[0][0];
			expect(llmArgs.systemPrompt).toBe(
				buildClassificationSystemPrompt({ includeLibri: true })
			);
			expect(llmArgs.systemPrompt).toContain(
				'entity_type must be exactly one of "person", "book", "youtube_video", or "youtube_channel"'
			);
			expect(llmArgs.systemPrompt).toContain(
				'recommended_action must be exactly one of "resolve_or_enqueue", "search_only", or "ignore"'
			);
			expect(llmArgs.systemPrompt).not.toContain('person|book|youtube_video|youtube_channel');
			expect(llmArgs.systemPrompt).not.toContain('primary|supporting|incidental');
			expect(llmArgs.systemPrompt).not.toContain('resolve_or_enqueue|search_only|ignore');
			// Citations need the ids the sanitizer checks them against.
			expect(llmArgs.userPrompt).toContain('turn_index=0\nmessage_id=msg-1\nrole=User');
			expect(llmArgs.userPrompt).toContain('Libri entity extraction');
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
					extraction_version: 'libri_session_synthesis_v1'
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
					extraction_version: 'libri_session_synthesis_v1'
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

	it('re-classifies a session longer than the message window once new messages arrive', async () => {
		const at = (index: number) => new Date(Date.UTC(2026, 3, 15, 12, index)).toISOString();
		messageData = Array.from({ length: 60 }, (_, index) => ({
			id: `msg-${index + 1}`,
			role: index % 2 ? 'assistant' : 'user',
			content: `Planning note ${index + 1} about the launch timeline.`,
			created_at: at(index)
		}));
		Object.assign(sessionData, {
			auto_title: 'Launch planning',
			chat_topics: ['launch'],
			summary: 'Launch planning.',
			extracted_entities: { libri_candidates: [] },
			message_count: 60,
			last_message_at: at(59),
			// Classified when the session had 50 messages; 10 more arrived since.
			last_classified_at: at(49)
		});

		const result = await processChatClassificationJob({
			id: 'job-1',
			data: { sessionId: 'session-1', userId: 'user-1' }
		} as any);

		expect((result as any).reason).not.toBe('already_classified');
		expect(mockGetJSONResponse).toHaveBeenCalledTimes(1);
		expect(capturedSessionUpdate?.last_classified_at).toBe(at(59));
		const prompt = mockGetJSONResponse.mock.calls[0][0].userPrompt as string;
		// The newest 30 messages, so a re-classification sees what changed...
		expect(prompt).toContain('User: Planning note 31 about the launch timeline.');
		expect(prompt).toContain('Assistant: Planning note 60 about the launch timeline.');
		expect(prompt).not.toContain('Planning note 30 about');
		expect(prompt).not.toContain('Planning note 2 about');
		// ...after the first user message, which is older than the 50 messages loaded,
		// so the summary still knows how the chat opened.
		const opening = prompt.indexOf('User: Planning note 1 about the launch timeline.');
		const omitted = prompt.indexOf('[Earlier messages omitted.');
		const recent = prompt.indexOf('User: Planning note 31 about the launch timeline.');
		expect(opening).toBeGreaterThan(-1);
		expect(omitted).toBeGreaterThan(opening);
		expect(recent).toBeGreaterThan(omitted);
	});

	it('asks for a short answer without hidden reasoning, with a timeout', async () => {
		await processChatClassificationJob({
			id: 'job-options',
			data: { sessionId: 'session-1', userId: 'user-1' }
		} as any);

		const llmArgs = mockGetJSONResponse.mock.calls[0][0];
		expect(llmArgs.profile).toBe('fast');
		expect(llmArgs.reasoning).toEqual({ enabled: false });
		expect(llmArgs.maxTokens).toBe(700);
		expect(llmArgs.timeoutMs).toBe(30_000);
	});

	describe('when the model call fails', () => {
		const job = (attemptsMade: number, maxAttempts = 3) =>
			({
				id: `job-attempt-${attemptsMade}`,
				data: { sessionId: 'session-1', userId: 'user-1' },
				attemptsMade,
				maxAttempts
			}) as any;

		it.each([0, 1])(
			'leaves attempt %i to the queue to retry and saves nothing',
			async (attemptsMade) => {
				mockGetJSONResponse.mockRejectedValueOnce(new Error('provider timeout'));

				const error = await processChatClassificationJob(job(attemptsMade)).then(
					() => null,
					(reason: unknown) => reason
				);

				expect(error).toBeInstanceOf(TransientQueueError);
				expect(classifyQueueError(error)).toMatchObject({
					kind: 'transient',
					code: 'chat_classification_model_failed'
				});
				expect((error as Error).message).toContain('provider timeout');
				// No fallback title, and no stamp that would stop a later classification.
				expect(capturedSessionUpdate).toBeNull();
				expect(sessionData.auto_title).toBeNull();
				expect(sessionData.last_classified_at).toBeNull();
				expect(sessionData.title).toBe('Agent Session');
				expect(processSessionActivityAndNextSteps).not.toHaveBeenCalled();
			}
		);

		it('saves the fallback title and stamps the session on the last attempt', async () => {
			mockGetJSONResponse.mockRejectedValueOnce(new Error('provider timeout'));

			const result = await processChatClassificationJob(job(2));

			expect(result.success).toBe(true);
			expect((result as any).usedFallbackClassification).toBe(true);
			expect(String(sessionData.auto_title)).toMatch(/^I am thinking about James Clear/);
			expect(sessionData.chat_topics).toEqual(['general']);
			// Stamped through the last message, so the idle sweep stops selecting it.
			expect(sessionData.last_classified_at).toBe('2026-04-15T12:02:00.000Z');
		});

		it('succeeds on a retry after an earlier attempt failed', async () => {
			mockGetJSONResponse.mockRejectedValueOnce(new Error('provider timeout'));
			await expect(processChatClassificationJob(job(0))).rejects.toBeInstanceOf(
				TransientQueueError
			);

			const result = await processChatClassificationJob(job(1));

			expect((result as any).usedFallbackClassification).toBe(false);
			expect(sessionData.auto_title).toBe('Libri Resource Planning');
			expect(sessionData.last_classified_at).toBe('2026-04-15T12:02:00.000Z');
		});

		it('falls back at once when the attempt budget is unknown', async () => {
			mockGetJSONResponse.mockRejectedValueOnce(new Error('provider timeout'));

			const result = await processChatClassificationJob({
				id: 'job-no-budget',
				data: { sessionId: 'session-1', userId: 'user-1' }
			} as any);

			expect((result as any).usedFallbackClassification).toBe(true);
			expect(sessionData.last_classified_at).toBe('2026-04-15T12:02:00.000Z');
		});
	});

	describe('project follow-ups', () => {
		const justNow = () => new Date(Date.now() - 11 * 60_000).toISOString();
		const endChatAt = (at: string) => {
			sessionData.last_message_at = at;
			messageData = [
				{
					id: 'msg-recent',
					role: 'user',
					content: 'Let us plan the launch checklist for this project.',
					created_at: at
				}
			];
		};
		const run = (id = 'job-recent') =>
			processChatClassificationJob({
				id,
				data: { sessionId: 'session-1', userId: 'user-1' }
			} as any);

		it('run for a chat that just ended', async () => {
			endChatAt(justNow());

			await run();

			expect(processSessionActivityAndNextSteps).toHaveBeenCalledWith('session-1', 'user-1');
		});

		it('are skipped for a chat that ended more than a day ago, which is only titled', async () => {
			const result = await run('job-old');

			expect(sessionData.auto_title).toBe('Libri Resource Planning');
			expect((result as any).nextStepUpdated).toBe(false);
			expect(processSessionActivityAndNextSteps).not.toHaveBeenCalled();
			expect(mockQueueSnapshot).not.toHaveBeenCalled();
			expect((result as any).projectSnapshot).toBe('not_due');
		});

		// A chat the idle sweep classified was never closed in a browser, so nothing
		// else queued its START HERE snapshot.
		it('queue exactly one forced snapshot when no browser close queued one', async () => {
			const at = justNow();
			endChatAt(at);

			const result = await run();

			expect(mockQueueSnapshot).toHaveBeenCalledTimes(1);
			expect(mockQueueSnapshot).toHaveBeenCalledWith({
				projectId: 'project-1',
				userId: 'user-1',
				reason: 'chat_session_end',
				force: true,
				// The web close route's key, so the two coalesce while one is in flight.
				revisionKey: `close-session-1-${at}`
			});
			expect((result as any).projectSnapshot).toBe('queued');
			// The lookup asks for this project's snapshot jobs queued since the last message.
			expect(snapshotLookupFilters).toEqual(
				expect.arrayContaining([
					['eq', ['job_type', 'build_project_context_snapshot']],
					['like', ['dedup_key', 'project-context-snapshot-project-1%']],
					['in', ['status', ['pending', 'processing', 'retrying', 'completed']]],
					['gte', ['created_at', at]]
				])
			);
		});

		// A session row can name any project id (its owner writes that column).
		it('queue no snapshot for a project the chat owner cannot reach', async () => {
			endChatAt(justNow());
			mockOwnerCanReachProject.mockResolvedValue(false);

			await run();

			expect(mockOwnerCanReachProject).toHaveBeenCalledWith('user-1', 'project-1', 'read');
			expect(mockQueueSnapshot).not.toHaveBeenCalled();
		});

		// The classification is saved before the access check: a database error there must not
		// fail the job, or the retry pays for the classification again.
		it('skip the project when the access check errors, and still succeed', async () => {
			endChatAt(justNow());
			mockOwnerCanReachProject.mockRejectedValue(
				new Error('Failed to check project access: connection reset')
			);

			const result = await run();

			expect(result.success).toBe(true);
			expect(sessionData.auto_title).toBe('Libri Resource Planning');
			expect(mockQueueSnapshot).not.toHaveBeenCalled();
		});

		it('queue no second snapshot when the close route already queued one', async () => {
			endChatAt(justNow());
			snapshotJobs = [
				{ metadata: { projectId: 'project-1', reason: 'chat_session_close', force: true } }
			];

			const result = await run();

			expect(mockQueueSnapshot).not.toHaveBeenCalled();
			expect((result as any).projectSnapshot).toBe('already_queued');
			expect(result.success).toBe(true);
		});

		it('do not count a snapshot job that may skip the rebuild (not forced)', async () => {
			endChatAt(justNow());
			snapshotJobs = [{ metadata: { projectId: 'project-1', force: false } }];

			await run();

			expect(mockQueueSnapshot).toHaveBeenCalledTimes(1);
		});

		it('still queue the snapshot when the lookup fails, and never fail the job', async () => {
			endChatAt(justNow());
			snapshotLookupError = { message: 'statement timeout' };

			const result = await run();

			expect(mockQueueSnapshot).toHaveBeenCalledTimes(1);
			expect(result.success).toBe(true);
		});

		it('report a failed snapshot enqueue without failing the job', async () => {
			endChatAt(justNow());
			mockQueueSnapshot.mockResolvedValueOnce({ queued: false, reason: 'queue down' });

			const result = await run();

			expect((result as any).projectSnapshot).toBe('failed');
			expect(result.success).toBe(true);
			expect(sessionData.auto_title).toBe('Libri Resource Planning');
		});

		it('queue no snapshot for a chat outside a project', async () => {
			endChatAt(justNow());
			sessionData.context_type = 'global';
			sessionData.entity_id = null;

			const result = await run();

			expect(mockQueueSnapshot).not.toHaveBeenCalled();
			expect((result as any).projectSnapshot).toBe('not_due');
		});

		// The every-minute checkpoint sweep captures the chat; the classifier used to
		// queue a second, redundant capture on every project chat close.
		it('never queue a checkpoint capture', async () => {
			endChatAt(justNow());

			await run();

			expect(mockSupabaseRpc).not.toHaveBeenCalledWith('add_queue_job', expect.anything());
		});
	});
});

describe('classification prompt messages', () => {
	const message = (index: number) => ({
		id: `m${index}`,
		role: index % 2 ? 'assistant' : 'user',
		content: `Message ${index}.`,
		created_at: new Date(Date.UTC(2026, 3, 15, 12, index)).toISOString()
	});
	const messages = (count: number) => Array.from({ length: count }, (_, index) => message(index));

	it('shows a short chat whole, with no opening line of its own', () => {
		const selection = selectClassificationPromptMessages(messages(12));

		expect(selection.opening).toBeNull();
		expect(selection.all.map((m) => m.id)).toEqual(messages(12).map((m) => m.id));
		expect(buildClassificationUserPrompt(selection, { includeLibri: false })).not.toContain(
			'Earlier messages omitted'
		);
	});

	it('puts the first user message ahead of the last 30 of a long chat', () => {
		const selection = selectClassificationPromptMessages(messages(45));

		expect(selection.opening?.id).toBe('m0');
		expect(selection.recent).toHaveLength(30);
		expect(selection.recent[0]?.id).toBe('m15');
		expect(selection.all).toHaveLength(31);
		expect(selection.omittedAfterOpening).toBe(true);

		const prompt = buildClassificationUserPrompt(selection, { includeLibri: false });
		expect(prompt.indexOf('User: Message 0.')).toBeLessThan(
			prompt.indexOf('[Earlier messages omitted.')
		);
		expect(prompt).not.toContain('Message 14.');
		expect(prompt).toContain('Message 44.');
	});

	it('says nothing was omitted when the opening sits right before the window', () => {
		const selection = selectClassificationPromptMessages(messages(31));

		expect(selection.opening?.id).toBe('m0');
		expect(selection.omittedAfterOpening).toBe(false);
		expect(buildClassificationUserPrompt(selection, { includeLibri: false })).not.toContain(
			'Earlier messages omitted'
		);
	});

	it('uses the session opening it is given when the loaded messages start later', () => {
		const loaded = messages(50).slice(10);
		const selection = selectClassificationPromptMessages(loaded, message(0));

		expect(selection.opening?.id).toBe('m0');
		expect(selection.omittedAfterOpening).toBe(true);
		// turn_index counts the opening first, the way the Libri sanitizer bounds it.
		const prompt = buildClassificationUserPrompt(selection, { includeLibri: true });
		expect(prompt).toContain('turn_index=0\nmessage_id=m0\n');
		expect(prompt).toContain('turn_index=1\nmessage_id=m20\n');
	});

	it('ignores a blank opening message', () => {
		const blank = { ...message(0), content: '   ' };
		const selection = selectClassificationPromptMessages(messages(50).slice(10), blank);

		expect(selection.opening).toBeNull();
		expect(selection.all).toHaveLength(30);
	});
});
