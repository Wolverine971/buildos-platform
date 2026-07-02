// apps/web/src/lib/server/inbox-chat-session.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAgentRunChatSession: vi.fn()
}));

vi.mock('./agent-run-chat-session.service', () => ({
	createAgentRunChatSession: mocks.createAgentRunChatSession
}));

import { createInboxChatSession } from './inbox-chat-session.service';

const USER_ID = 'user-1';
const PROJECT_ID = 'project-1';
const SUGGESTION_ID = 'suggestion-1';
const SESSION_ID = 'session-1';

type Operation = {
	table: string;
	action: 'select' | 'insert' | 'update' | 'delete' | null;
	payload: unknown;
	filters: Array<{ column: string; value: unknown }>;
	inFilters: Array<{ column: string; values: unknown[] }>;
	containsFilters: unknown[];
};

function createSupabaseMock(sourcePayload: Record<string, unknown> | null) {
	return {
		from: vi.fn((table: string) => {
			const builder: any = {
				select: vi.fn(() => builder),
				eq: vi.fn(() => builder),
				maybeSingle: vi.fn(async () => ({
					data: table === 'agent_runs' ? sourcePayload : null,
					error: null
				}))
			};
			return builder;
		})
	};
}

function createProjectSuggestionSupabaseMock(options: { suggestionUpdateError?: unknown } = {}) {
	const operations: Operation[] = [];
	const suggestion = {
		id: SUGGESTION_ID,
		run_id: 'loop-run-1',
		project_id: PROJECT_ID,
		kind: 'drift',
		risk_tier: 2,
		title: 'Looks outdated: Long-Form Network Outreach',
		rationale: 'Recent tasks suggest this consolidated list may be superseded.',
		why_now: 'Individual email drafts were created.',
		confidence: 0.82,
		evidence_refs: [],
		preview: {
			summary: 'Mark the outreach email list as outdated.'
		},
		operations: [
			{
				tool: 'update_onto_document',
				args: {
					document_id: 'doc-1',
					props: {
						outdated: true,
						outdated_reason:
							'Superseded by individual email drafts created as separate tasks.'
					}
				},
				label: 'Flag outreach email list as outdated'
			}
		],
		status: 'pending',
		reversible: true,
		freshness_state: 'outdated',
		created_at: '2026-06-29T12:00:00.000Z',
		chat_session_id: null
	};
	const session = {
		id: SESSION_ID,
		user_id: USER_ID,
		context_type: 'project',
		entity_id: PROJECT_ID,
		status: 'active',
		chat_type: 'project',
		title: 'Chat: Looks outdated: Long-Form Network Outreach'
	};

	class QueryBuilderMock {
		private action: Operation['action'] = null;
		private payload: unknown = null;
		private filters: Array<{ column: string; value: unknown }> = [];
		private containsFilters: unknown[] = [];

		constructor(private readonly table: string) {}

		select() {
			if (!this.action) this.action = 'select';
			return this;
		}

		insert(payload: unknown) {
			this.action = 'insert';
			this.payload = payload;
			return this;
		}

		update(payload: unknown) {
			this.action = 'update';
			this.payload = payload;
			return this;
		}

		delete() {
			this.action = 'delete';
			return this;
		}

		eq(column: string, value: unknown) {
			this.filters.push({ column, value });
			return this;
		}

		contains(_column: string, value: unknown) {
			this.containsFilters.push(value);
			return this;
		}

		order() {
			return this;
		}

		limit() {
			return this;
		}

		private recordOperation() {
			operations.push({
				table: this.table,
				action: this.action,
				payload: this.payload,
				filters: [...this.filters],
				inFilters: [],
				containsFilters: [...this.containsFilters]
			});
		}

		private resolve() {
			this.recordOperation();

			if (this.table === 'project_suggestions' && this.action === 'select') {
				return Promise.resolve({ data: suggestion, error: null });
			}
			if (this.table === 'onto_projects' && this.action === 'select') {
				return Promise.resolve({
					data: { id: PROJECT_ID, name: '9takes' },
					error: null
				});
			}
			if (this.table === 'chat_sessions' && this.action === 'select') {
				return Promise.resolve({ data: null, error: null });
			}
			if (this.table === 'project_loop_runs' && this.action === 'select') {
				return Promise.resolve({
					data: {
						id: 'loop-run-1',
						trigger_reason: 'manual',
						summary: 'Review completed.',
						created_at: '2026-06-29T12:00:00.000Z',
						finished_at: '2026-06-29T12:01:00.000Z'
					},
					error: null
				});
			}
			if (this.table === 'chat_sessions' && this.action === 'insert') {
				return Promise.resolve({ data: session, error: null });
			}
			if (this.table === 'chat_sessions_projects' && this.action === 'insert') {
				return Promise.resolve({ data: null, error: null });
			}
			if (this.table === 'chat_messages' && this.action === 'insert') {
				return Promise.resolve({ data: null, error: null });
			}
			if (this.table === 'project_suggestions' && this.action === 'update') {
				return Promise.resolve({
					data: options.suggestionUpdateError
						? null
						: { id: SUGGESTION_ID, chat_session_id: SESSION_ID },
					error: options.suggestionUpdateError ?? null
				});
			}
			if (this.action === 'delete') {
				return Promise.resolve({ data: null, error: null });
			}

			return Promise.resolve({ data: null, error: null });
		}

		single() {
			return this.resolve();
		}

		maybeSingle() {
			return this.resolve();
		}

		then<TResult1 = any, TResult2 = never>(
			onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return this.resolve().then(onfulfilled, onrejected);
		}
	}

	const supabase = {
		from: vi.fn((table: string) => new QueryBuilderMock(table)),
		rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
			// Record the metadata merge RPC so tests can assert the merged patch
			// (recorded under the RPC name with a synthetic 'update' action).
			operations.push({
				table: fn,
				action: 'update',
				payload: args,
				filters: [],
				inFilters: [],
				containsFilters: []
			});
			const existingMeta =
				((options as { existingSession?: Record<string, unknown> }).existingSession
					?.agent_metadata as Record<string, unknown> | undefined) ?? {};
			const patch = (args?.p_patch as Record<string, unknown> | undefined) ?? {};
			return Promise.resolve({ data: { ...existingMeta, ...patch }, error: null });
		})
	};

	return { supabase, operations, suggestion, session };
}

function createCalendarSuggestionSupabaseMock(
	options: { existingSession?: Record<string, unknown> } = {}
) {
	const operations: Operation[] = [];
	const suggestion = {
		id: 'calendar-suggestion-1',
		analysis_id: 'analysis-1',
		user_id: USER_ID,
		status: 'pending',
		suggested_name: '9takes Project',
		suggested_description: 'A coordinated training sprint for CEO skills.',
		suggested_context:
			'# Situation & Environment Market analysis, financial modeling, and pitch development sessions. # Purpose & Vision Prepare the project for focused execution.',
		ai_reasoning: 'Multiple related calendar events indicate a coherent project.',
		confidence_score: 0.9,
		event_count: 3,
		calendar_event_ids: ['event-1', 'event-2', 'event-3'],
		event_patterns: {
			start_date: '2025-10-06',
			end_date: '2025-10-10',
			tags: ['training', 'CEO']
		},
		suggested_tasks: [
			{
				title: 'Attend The Perfect Problem Statement Training',
				description: 'Participate in problem statement training.',
				start_date: '2025-10-06T10:00:00',
				priority: 'high'
			}
		]
	};
	const session = {
		id: SESSION_ID,
		user_id: USER_ID,
		context_type: 'calendar',
		entity_id: 'calendar-suggestion-1',
		status: 'active',
		chat_type: 'calendar',
		title: 'Chat: 9 Takes'
	};

	class QueryBuilderMock {
		private action: Operation['action'] = null;
		private payload: unknown = null;
		private filters: Array<{ column: string; value: unknown }> = [];
		private inFilters: Array<{ column: string; values: unknown[] }> = [];
		private containsFilters: unknown[] = [];

		constructor(private readonly table: string) {}

		select() {
			if (!this.action) this.action = 'select';
			return this;
		}

		insert(payload: unknown) {
			this.action = 'insert';
			this.payload = payload;
			return this;
		}

		update(payload: unknown) {
			this.action = 'update';
			this.payload = payload;
			return this;
		}

		eq(column: string, value: unknown) {
			this.filters.push({ column, value });
			return this;
		}

		in(column: string, values: unknown[]) {
			this.inFilters.push({ column, values });
			return this;
		}

		contains(_column: string, value: unknown) {
			this.containsFilters.push(value);
			return this;
		}

		order() {
			return this;
		}

		limit() {
			return this;
		}

		private recordOperation() {
			operations.push({
				table: this.table,
				action: this.action,
				payload: this.payload,
				filters: [...this.filters],
				inFilters: [...this.inFilters],
				containsFilters: [...this.containsFilters]
			});
		}

		private resolve() {
			this.recordOperation();

			if (this.table === 'calendar_project_suggestions' && this.action === 'select') {
				return Promise.resolve({ data: suggestion, error: null });
			}
			if (this.table === 'calendar_analysis_events' && this.action === 'select') {
				return Promise.resolve({
					data: [
						{
							calendar_event_id: 'event-1',
							event_title: 'The Perfect Problem Statement Training',
							event_start: '2025-10-06T10:00:00'
						},
						{
							calendar_event_id: 'event-2',
							event_title: 'CEO Financial Modeling Session',
							event_start: '2025-10-07T14:00:00'
						},
						{
							calendar_event_id: 'event-3',
							event_title: 'Pitch Development Review',
							event_start: '2025-10-08T16:00:00'
						}
					],
					error: null
				});
			}
			if (this.table === 'chat_sessions' && this.action === 'select') {
				return Promise.resolve({ data: options.existingSession ?? null, error: null });
			}
			if (this.table === 'chat_sessions' && this.action === 'insert') {
				return Promise.resolve({ data: session, error: null });
			}
			if (this.table === 'chat_sessions' && this.action === 'update') {
				return Promise.resolve({
					data: { ...(options.existingSession ?? session), ...(this.payload as object) },
					error: null
				});
			}
			if (this.table === 'chat_messages' && this.action === 'insert') {
				return Promise.resolve({ data: null, error: null });
			}
			if (this.table === 'chat_messages' && this.action === 'update') {
				return Promise.resolve({ data: null, error: null });
			}

			return Promise.resolve({ data: null, error: null });
		}

		single() {
			return this.resolve();
		}

		maybeSingle() {
			return this.resolve();
		}

		then<TResult1 = any, TResult2 = never>(
			onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return this.resolve().then(onfulfilled, onrejected);
		}
	}

	const supabase = {
		from: vi.fn((table: string) => new QueryBuilderMock(table)),
		rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
			// Record the metadata merge RPC so tests can assert the merged patch
			// (recorded under the RPC name with a synthetic 'update' action).
			operations.push({
				table: fn,
				action: 'update',
				payload: args,
				filters: [],
				inFilters: [],
				containsFilters: []
			});
			const existingMeta =
				((options as { existingSession?: Record<string, unknown> }).existingSession
					?.agent_metadata as Record<string, unknown> | undefined) ?? {};
			const patch = (args?.p_patch as Record<string, unknown> | undefined) ?? {};
			return Promise.resolve({ data: { ...existingMeta, ...patch }, error: null });
		})
	};

	return { supabase, operations, suggestion, session };
}

function findOperation(
	operations: Operation[],
	table: string,
	action: Operation['action']
): Operation | undefined {
	return operations.find((operation) => operation.table === table && operation.action === action);
}

describe('createInboxChatSession', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createAgentRunChatSession.mockResolvedValue({
			created: false,
			seeded: true,
			session: { id: 'shared-session', context_type: 'project', entity_id: 'project-1' },
			chat_session_id: 'shared-session',
			context_type: 'project',
			entity_id: 'project-1',
			project_id: 'project-1'
		});
	});

	it('delegates agent_run inbox items to the shared agent-run chat service', async () => {
		const run = {
			id: 'run-1',
			user_id: USER_ID,
			status: 'proposal_ready',
			project_id: 'project-1',
			context_type: 'project'
		};
		const item = {
			id: 'inbox-1',
			source_type: 'agent_run' as const,
			source_ref_id: 'run-1',
			source_status: 'proposal_ready',
			user_id: USER_ID,
			project_id: 'project-1',
			audience: 'user' as const,
			status: 'pending' as const,
			title: 'Update project START HERE',
			summary: 'Review proposed Start Here updates.',
			risk_tier: null,
			action_kinds: ['approve', 'reject'],
			created_at: '2026-06-29T12:00:00.000Z',
			updated_at: '2026-06-29T12:00:00.000Z',
			decided_at: null,
			blocked_reason: null,
			snoozed_until: null,
			expires_at: null
		};
		const supabase = createSupabaseMock(run);

		const result = await createInboxChatSession({
			supabase,
			item,
			userId: USER_ID
		});

		expect(result).toMatchObject({
			created: false,
			chat_session_id: 'shared-session',
			context_type: 'project',
			entity_id: 'project-1',
			project_id: 'project-1',
			item,
			source_payload: run
		});
		expect(mocks.createAgentRunChatSession).toHaveBeenCalledWith({
			supabase,
			run,
			userId: USER_ID,
			origin: 'ai_inbox',
			inbox: {
				id: 'inbox-1',
				title: 'Update project START HERE',
				summary: 'Review proposed Start Here updates.',
				source_status: 'proposal_ready',
				project_id: 'project-1'
			}
		});
	});

	it('opens a project_suggestion chat even when the optional suggestion backlink update fails', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { supabase, operations, suggestion, session } = createProjectSuggestionSupabaseMock({
			suggestionUpdateError: {
				code: 'PGRST204',
				message:
					"Could not find the 'chat_session_id' column of 'project_suggestions' in the schema cache"
			}
		});
		const item = {
			id: 'inbox-1',
			source_type: 'project_suggestion' as const,
			source_ref_id: SUGGESTION_ID,
			source_status: 'pending',
			user_id: USER_ID,
			project_id: PROJECT_ID,
			audience: 'project' as const,
			status: 'pending' as const,
			title: suggestion.title,
			summary: suggestion.rationale,
			risk_tier: 2,
			action_kinds: ['approve', 'reject'],
			created_at: '2026-06-29T12:00:00.000Z',
			updated_at: '2026-06-29T12:00:00.000Z',
			decided_at: null,
			blocked_reason: null,
			snoozed_until: null,
			expires_at: null
		};

		const result = await createInboxChatSession({
			supabase,
			item,
			userId: USER_ID
		});

		expect(result).toMatchObject({
			created: true,
			chat_session_id: SESSION_ID,
			session,
			context_type: 'project',
			entity_id: PROJECT_ID,
			project_id: PROJECT_ID
		});
		expect(findOperation(operations, 'chat_sessions', 'insert')?.payload).toMatchObject({
			chat_type: 'project',
			agent_metadata: expect.objectContaining({
				source: 'ai_inbox',
				inbox_item_id: 'inbox-1',
				source_type: 'project_suggestion',
				source_ref_id: SUGGESTION_ID
			})
		});
		expect(findOperation(operations, 'chat_messages', 'insert')?.payload).toMatchObject({
			session_id: SESSION_ID,
			role: 'assistant',
			metadata: expect.objectContaining({
				source: 'ai_inbox',
				inbox_item_id: 'inbox-1',
				source_type: 'project_suggestion',
				source_ref_id: SUGGESTION_ID,
				seed_message: true
			})
		});
		expect(findOperation(operations, 'project_suggestions', 'update')?.payload).toMatchObject({
			chat_session_id: SESSION_ID
		});
		expect(findOperation(operations, 'chat_messages', 'delete')).toBeUndefined();
		expect(findOperation(operations, 'chat_sessions_projects', 'delete')).toBeUndefined();
		expect(findOperation(operations, 'chat_sessions', 'delete')).toBeUndefined();
		expect(warn).toHaveBeenCalledWith(
			'Failed to persist project suggestion chat session link',
			expect.objectContaining({
				suggestionId: SUGGESTION_ID,
				inboxItemId: 'inbox-1',
				sessionId: SESSION_ID
			})
		);
		warn.mockRestore();
	});

	it('keeps calendar event ids in hidden prompt context while showing readable evidence', async () => {
		const { supabase, operations, session } = createCalendarSuggestionSupabaseMock();
		const item = {
			id: 'inbox-calendar-1',
			source_type: 'calendar_suggestion' as const,
			source_ref_id: 'calendar-suggestion-1',
			source_status: 'pending',
			user_id: USER_ID,
			project_id: null,
			audience: 'user' as const,
			status: 'pending' as const,
			title: '9takes Project',
			summary: 'Calendar analysis found related CEO training sessions.',
			risk_tier: null,
			action_kinds: ['approve', 'reject'],
			created_at: '2026-06-30T02:26:00.000Z',
			updated_at: '2026-06-30T02:26:00.000Z',
			decided_at: null,
			blocked_reason: null,
			snoozed_until: null,
			expires_at: null
		};

		const result = await createInboxChatSession({
			supabase,
			item,
			userId: USER_ID
		});

		expect(result).toMatchObject({
			created: true,
			chat_session_id: SESSION_ID,
			session,
			context_type: 'calendar',
			entity_id: 'calendar-suggestion-1',
			project_id: null
		});

		const sessionInsert = findOperation(operations, 'chat_sessions', 'insert')?.payload as any;
		expect(sessionInsert).toMatchObject({
			context_type: 'calendar',
			entity_id: 'calendar-suggestion-1',
			chat_type: 'calendar',
			title: 'Chat: 9 Takes',
			agent_metadata: expect.objectContaining({
				source: 'ai_inbox',
				source_type: 'calendar_suggestion',
				source_ref_id: 'calendar-suggestion-1'
			})
		});
		expect(sessionInsert.agent_metadata.proposal_context.llm_text).toContain(
			'Calendar evidence event ids'
		);
		expect(sessionInsert.agent_metadata.proposal_context.llm_text).toContain('event-3');
		expect(sessionInsert.agent_metadata.proposal_context.llm_text).toContain(
			'use the calendar event ids below with the available calendar tools'
		);

		const messageInsert = findOperation(operations, 'chat_messages', 'insert')?.payload as any;
		expect(messageInsert.content).toContain('Calendar found a possible project: 9 Takes.');
		expect(messageInsert.content).toContain(
			'This inbox item is asking whether to create a new project from related calendar activity'
		);
		expect(messageInsert.content).toContain('The Perfect Problem Statement Training');
		expect(messageInsert.content).toContain('CEO Financial Modeling Session');
		expect(messageInsert.content).not.toContain('Calendar evidence event ids');
		expect(messageInsert.content).not.toContain('event-1');
		expect(messageInsert.content).not.toContain('# Situation');
		expect(messageInsert.metadata.proposal_context.llm_text).toContain('event-2');
		expect(messageInsert.metadata.proposal_context.llm_text).not.toContain('# Situation');
	});

	it('refreshes an existing calendar suggestion chat seed when reopening chat', async () => {
		const existingSession = {
			id: SESSION_ID,
			user_id: USER_ID,
			context_type: 'calendar',
			entity_id: 'calendar-suggestion-1',
			status: 'active',
			chat_type: 'calendar',
			title: 'Chat: 9takes Project',
			agent_metadata: {
				source: 'ai_inbox',
				inbox_item_id: 'inbox-calendar-1',
				source_type: 'calendar_suggestion',
				source_ref_id: 'calendar-suggestion-1',
				proposal_context: {
					llm_text: 'old raw seed'
				}
			}
		};
		const { supabase, operations } = createCalendarSuggestionSupabaseMock({
			existingSession
		});
		const item = {
			id: 'inbox-calendar-1',
			source_type: 'calendar_suggestion' as const,
			source_ref_id: 'calendar-suggestion-1',
			source_status: 'pending',
			user_id: USER_ID,
			project_id: null,
			audience: 'user' as const,
			status: 'pending' as const,
			title: '9takes Project',
			summary: 'Calendar analysis found related CEO training sessions.',
			risk_tier: null,
			action_kinds: ['approve', 'reject'],
			created_at: '2026-06-30T02:26:00.000Z',
			updated_at: '2026-06-30T02:26:00.000Z',
			decided_at: null,
			blocked_reason: null,
			snoozed_until: null,
			expires_at: null
		};

		const result = await createInboxChatSession({
			supabase,
			item,
			userId: USER_ID
		});

		expect(result.created).toBe(false);
		expect(findOperation(operations, 'chat_sessions', 'insert')).toBeUndefined();
		const sessionUpdate = findOperation(operations, 'chat_sessions', 'update')?.payload as any;
		expect(sessionUpdate).toMatchObject({
			title: 'Chat: 9 Takes'
		});
		// agent_metadata is now merged via the atomic RPC (not the chat_sessions
		// update) so concurrent cancel-hint / focus writes are never clobbered (D5).
		const metadataMerge = findOperation(
			operations,
			'merge_chat_session_agent_metadata',
			'update'
		)?.payload as any;
		expect(metadataMerge?.p_session_id).toBe(SESSION_ID);
		expect(metadataMerge?.p_patch).toEqual(
			expect.objectContaining({
				source: 'ai_inbox',
				source_type: 'calendar_suggestion',
				source_ref_id: 'calendar-suggestion-1',
				proposal_context: expect.objectContaining({
					llm_text: expect.stringContaining('Calendar evidence event ids')
				})
			})
		);

		const messageUpdate = findOperation(operations, 'chat_messages', 'update')?.payload as any;
		expect(messageUpdate.content).toContain('Calendar found a possible project: 9 Takes.');
		expect(messageUpdate.content).toContain('The Perfect Problem Statement Training');
		expect(messageUpdate.content).not.toContain('event-1');
		expect(messageUpdate.metadata.proposal_context.llm_text).toContain('event-1');
		const messageUpdateOperation = findOperation(operations, 'chat_messages', 'update');
		expect(messageUpdateOperation?.containsFilters).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					source: 'ai_inbox',
					source_type: 'calendar_suggestion',
					source_ref_id: 'calendar-suggestion-1',
					seed_message: true
				})
			])
		);
	});
});
