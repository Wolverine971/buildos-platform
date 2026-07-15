// apps/web/src/routes/api/inbox/[item_id]/resolve-from-chat/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	requireProjectMemberAccess: vi.fn(),
	commitChangeSet: vi.fn(),
	syncInboxItemForSource: vi.fn(),
	finalizeProjectLoopRunIfComplete: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: mocks.requireProjectMemberAccess
}));

vi.mock('@buildos/shared-agent-ops', () => ({
	commitChangeSet: mocks.commitChangeSet
}));

vi.mock('@buildos/shared-agent-ops/inbox-index', () => ({
	syncInboxItemForSource: mocks.syncInboxItemForSource
}));

vi.mock('$lib/server/project-loop-run.service', () => ({
	finalizeProjectLoopRunIfComplete: mocks.finalizeProjectLoopRunIfComplete
}));

import { POST } from './+server';

type InboxItemFixture = {
	id: string;
	source_type: 'project_suggestion' | 'project_audit' | 'calendar_suggestion' | 'agent_run';
	source_ref_id: string;
	source_status: string | null;
	status: string;
	user_id: string | null;
	project_id: string | null;
	audience: string;
	title: string;
	action_kinds: string[];
};

type Operation = {
	table: string;
	action: 'select' | 'update';
	payload: Record<string, unknown> | null;
	filters: Array<[string, unknown]>;
};

const USER_ID = 'user-1';

function projectSuggestionItem(): InboxItemFixture {
	return {
		id: 'inbox-1',
		source_type: 'project_suggestion',
		source_ref_id: 'suggestion-1',
		source_status: 'pending',
		status: 'pending',
		user_id: null,
		project_id: 'project-1',
		audience: 'project_members',
		title: 'Resolve drift',
		action_kinds: ['approve', 'reject']
	};
}

function agentRunItem(): InboxItemFixture {
	return {
		id: 'inbox-2',
		source_type: 'agent_run',
		source_ref_id: 'run-1',
		source_status: 'proposal_ready',
		status: 'pending',
		user_id: USER_ID,
		project_id: 'project-1',
		audience: 'user',
		title: 'Agent proposal',
		action_kinds: ['approve', 'reject']
	};
}

function calendarSuggestionItem(): InboxItemFixture {
	return {
		id: 'inbox-3',
		source_type: 'calendar_suggestion',
		source_ref_id: 'calendar-suggestion-1',
		source_status: 'pending',
		status: 'pending',
		user_id: USER_ID,
		project_id: null,
		audience: 'user',
		title: 'Create project from calendar',
		action_kinds: ['approve', 'reject']
	};
}

function projectAuditItem(): InboxItemFixture {
	return {
		id: 'inbox-audit-1',
		source_type: 'project_audit',
		source_ref_id: 'audit-1',
		source_status: 'ready',
		status: 'pending',
		user_id: null,
		project_id: 'project-1',
		audience: 'project_members',
		title: 'Complete project audit',
		action_kinds: ['open', 'resolve']
	};
}

function projectAuditChatSessionFor(item: InboxItemFixture) {
	return {
		id: 'session-1',
		user_id: USER_ID,
		agent_metadata: {
			source: 'project_audit',
			audit_id: item.source_ref_id,
			source_type: 'project_audit',
			source_ref_id: item.source_ref_id
		}
	};
}

function chatSessionFor(item: InboxItemFixture, metadataPatch: Record<string, unknown> = {}) {
	return {
		id: 'session-1',
		user_id: USER_ID,
		agent_metadata: {
			source: 'ai_inbox',
			inbox_item_id: item.id,
			source_type: item.source_type,
			source_ref_id: item.source_ref_id,
			...metadataPatch
		}
	};
}

function createSupabaseMock(params: {
	item: InboxItemFixture | null;
	session: Record<string, unknown> | null;
	projectSuggestionUpdate?: Record<string, unknown> | null;
	projectAuditUpdate?: Record<string, unknown> | null;
	calendarSuggestionUpdate?: Record<string, unknown> | null;
}) {
	const operations: Operation[] = [];
	const supabase = {
		from: vi.fn((table: string) => {
			const state: Operation = {
				table,
				action: 'select',
				payload: null,
				filters: []
			};
			const builder: any = {
				select: vi.fn(() => builder),
				update: vi.fn((payload: Record<string, unknown>) => {
					state.action = 'update';
					state.payload = payload;
					return builder;
				}),
				eq: vi.fn((column: string, value: unknown) => {
					state.filters.push([column, value]);
					return builder;
				}),
				in: vi.fn(() => builder),
				maybeSingle: vi.fn(async () => {
					operations.push({ ...state, filters: [...state.filters] });
					if (table === 'inbox_items') {
						return { data: params.item, error: null };
					}
					if (table === 'chat_sessions') {
						return { data: params.session, error: null };
					}
					if (table === 'project_suggestions' && state.action === 'update') {
						return { data: params.projectSuggestionUpdate ?? null, error: null };
					}
					if (table === 'project_audits' && state.action === 'update') {
						return { data: params.projectAuditUpdate ?? null, error: null };
					}
					if (table === 'calendar_project_suggestions' && state.action === 'update') {
						return { data: params.calendarSuggestionUpdate ?? null, error: null };
					}
					return { data: null, error: null };
				})
			};
			return builder;
		})
	};
	return { supabase, operations };
}

function makeRequest(body: Record<string, unknown>) {
	return new Request('http://localhost/api/inbox/inbox-1/resolve-from-chat', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

function makeLocals(supabase: unknown) {
	return {
		supabase,
		safeGetSession: vi.fn(async () => ({
			user: { id: USER_ID }
		}))
	};
}

describe('POST /api/inbox/[item_id]/resolve-from-chat', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireProjectMemberAccess.mockResolvedValue({
			ok: true,
			projectId: 'project-1'
		});
		mocks.syncInboxItemForSource.mockResolvedValue({
			...projectSuggestionItem(),
			status: 'decided',
			source_status: 'applied'
		});
		mocks.commitChangeSet.mockResolvedValue({
			ok: true,
			result: { applied: 0, rejected: 1, failed: 0 }
		});
	});

	it('does nothing when the chat closed without mutations', async () => {
		const item = projectSuggestionItem();
		const { supabase } = createSupabaseMock({
			item,
			session: chatSessionFor(item)
		});

		const response = await POST({
			params: { item_id: item.id },
			request: makeRequest({ session_id: 'session-1', has_changes: false }),
			locals: makeLocals(supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data).toMatchObject({ resolved: false, reason: 'no_chat_mutations' });
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it('rejects a chat session that was not opened for the inbox item', async () => {
		const item = projectSuggestionItem();
		const { supabase } = createSupabaseMock({
			item,
			session: chatSessionFor(item, {
				inbox_item_id: 'other-inbox-item',
				source_ref_id: 'other-source'
			})
		});

		const response = await POST({
			params: { item_id: item.id },
			request: makeRequest({
				session_id: 'session-1',
				has_changes: true,
				total_mutations: 1
			}),
			locals: makeLocals(supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json.success).toBe(false);
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it('marks a pending project suggestion applied when its chat made changes', async () => {
		const item = projectSuggestionItem();
		const local = createSupabaseMock({ item, session: chatSessionFor(item) });
		const admin = createSupabaseMock({
			item: null,
			session: null,
			projectSuggestionUpdate: { id: item.source_ref_id, status: 'applied' }
		});
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);

		const response = await POST({
			params: { item_id: item.id },
			request: makeRequest({
				session_id: 'session-1',
				has_changes: true,
				total_mutations: 2,
				affected_project_ids: ['project-1']
			}),
			locals: makeLocals(local.supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data).toMatchObject({
			resolved: true,
			source_type: 'project_suggestion',
			source_ref_id: item.source_ref_id
		});
		expect(mocks.requireProjectMemberAccess).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				requiredAccess: 'write'
			})
		);
		const update = admin.operations.find(
			(operation) => operation.table === 'project_suggestions'
		);
		expect(update?.payload).toMatchObject({
			status: 'applied',
			result: expect.objectContaining({
				handled_in_chat: true,
				chat_session_id: 'session-1',
				mutation_count: 2
			})
		});
		expect(update?.filters).toEqual(
			expect.arrayContaining([
				['id', item.source_ref_id],
				['project_id', 'project-1'],
				['status', 'pending']
			])
		);
		expect(mocks.syncInboxItemForSource).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceType: 'project_suggestion',
				sourceRefId: item.source_ref_id
			})
		);
	});

	it('marks a project suggestion handled from chat without requiring mutations', async () => {
		const item = projectSuggestionItem();
		const local = createSupabaseMock({ item, session: chatSessionFor(item) });
		const admin = createSupabaseMock({
			item: null,
			session: null,
			projectSuggestionUpdate: { id: item.source_ref_id, status: 'rejected' }
		});
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);

		const response = await POST({
			params: { item_id: item.id },
			request: makeRequest({
				session_id: 'session-1',
				has_changes: false,
				resolution: 'handled'
			}),
			locals: makeLocals(local.supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data.resolved).toBe(true);
		const update = admin.operations.find(
			(operation) => operation.table === 'project_suggestions'
		);
		expect(update?.payload).toMatchObject({
			status: 'addressed',
			user_feedback: expect.objectContaining({
				reason: 'other',
				note: expect.stringContaining('Marked handled from chat')
			})
		});
		expect(mocks.syncInboxItemForSource).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceType: 'project_suggestion',
				sourceRefId: item.source_ref_id
			})
		);
	});

	it('marks a project audit reviewed from its audit chat session', async () => {
		const item = projectAuditItem();
		const local = createSupabaseMock({
			item,
			session: projectAuditChatSessionFor(item)
		});
		const admin = createSupabaseMock({
			item: null,
			session: null,
			projectAuditUpdate: { id: item.source_ref_id, status: 'reviewed' }
		});
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);
		mocks.syncInboxItemForSource.mockResolvedValue({
			...item,
			status: 'decided',
			source_status: 'reviewed'
		});

		const response = await POST({
			params: { item_id: item.id },
			request: makeRequest({
				session_id: 'session-1',
				has_changes: true,
				total_mutations: 2,
				affected_project_ids: ['project-1']
			}),
			locals: makeLocals(local.supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data).toMatchObject({
			resolved: true,
			source_type: 'project_audit',
			source_ref_id: item.source_ref_id
		});
		expect(mocks.requireProjectMemberAccess).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				requiredAccess: 'write'
			})
		);
		const update = admin.operations.find((operation) => operation.table === 'project_audits');
		expect(update?.payload).toMatchObject({
			status: 'reviewed'
		});
		expect(update?.filters).toEqual(
			expect.arrayContaining([
				['id', item.source_ref_id],
				['project_id', 'project-1']
			])
		);
		expect(mocks.syncInboxItemForSource).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceType: 'project_audit',
				sourceRefId: item.source_ref_id
			})
		);
	});

	it('dismisses a calendar suggestion from chat without requiring mutations', async () => {
		const item = calendarSuggestionItem();
		const local = createSupabaseMock({ item, session: chatSessionFor(item) });
		const admin = createSupabaseMock({
			item: null,
			session: null,
			calendarSuggestionUpdate: { id: item.source_ref_id, status: 'rejected' }
		});
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);

		const response = await POST({
			params: { item_id: item.id },
			request: makeRequest({
				session_id: 'session-1',
				has_changes: false,
				resolution: 'dismissed'
			}),
			locals: makeLocals(local.supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data.resolved).toBe(true);
		const update = admin.operations.find(
			(operation) => operation.table === 'calendar_project_suggestions'
		);
		expect(update?.payload).toMatchObject({
			status: 'rejected',
			rejection_reason: expect.stringContaining('Dismissed from chat')
		});
		expect(update?.filters).toEqual(
			expect.arrayContaining([
				['id', item.source_ref_id],
				['user_id', USER_ID],
				['status', 'pending']
			])
		);
	});

	it('marks a pending calendar suggestion accepted from chat with an owned source-row guard', async () => {
		const item = calendarSuggestionItem();
		const local = createSupabaseMock({ item, session: chatSessionFor(item) });
		const admin = createSupabaseMock({
			item: null,
			session: null,
			calendarSuggestionUpdate: { id: item.source_ref_id, status: 'accepted' }
		});
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);

		const response = await POST({
			params: { item_id: item.id },
			request: makeRequest({
				session_id: 'session-1',
				has_changes: true,
				total_mutations: 2,
				affected_project_ids: ['project-1']
			}),
			locals: makeLocals(local.supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data.resolved).toBe(true);
		const update = admin.operations.find(
			(operation) => operation.table === 'calendar_project_suggestions'
		);
		expect(update?.payload).toMatchObject({
			status: 'accepted',
			created_project_id: 'project-1'
		});
		expect(update?.filters).toEqual(
			expect.arrayContaining([
				['id', item.source_ref_id],
				['user_id', USER_ID],
				['status', 'pending']
			])
		);
	});

	it('falls back to explicit handled resolution when calendar chat mutations do not create a project', async () => {
		const item = calendarSuggestionItem();
		const local = createSupabaseMock({ item, session: chatSessionFor(item) });
		const admin = createSupabaseMock({
			item: null,
			session: null,
			calendarSuggestionUpdate: { id: item.source_ref_id, status: 'rejected' }
		});
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);

		const response = await POST({
			params: { item_id: item.id },
			request: makeRequest({
				session_id: 'session-1',
				has_changes: true,
				total_mutations: 1,
				affected_project_ids: [],
				resolution: 'handled'
			}),
			locals: makeLocals(local.supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data.resolved).toBe(true);
		const update = admin.operations.find(
			(operation) => operation.table === 'calendar_project_suggestions'
		);
		expect(update?.payload).toMatchObject({
			status: 'rejected',
			rejection_reason: expect.stringContaining('Marked handled from chat')
		});
	});

	it('rejects the original agent-run change set after chat made replacement changes', async () => {
		const item = agentRunItem();
		const local = createSupabaseMock({ item, session: chatSessionFor(item) });
		mocks.createAdminSupabaseClient.mockReturnValue(
			createSupabaseMock({ item: null, session: null }).supabase
		);
		mocks.syncInboxItemForSource
			.mockResolvedValueOnce({ ...item, status: 'pending' })
			.mockResolvedValueOnce({ ...item, status: 'decided', source_status: 'completed' });

		const response = await POST({
			params: { item_id: item.id },
			request: makeRequest({
				session_id: 'session-1',
				has_changes: true,
				total_mutations: 1,
				affected_project_ids: ['project-1']
			}),
			locals: makeLocals(local.supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data.resolved).toBe(true);
		expect(mocks.commitChangeSet).toHaveBeenCalledWith(
			expect.objectContaining({
				runId: item.source_ref_id,
				userId: USER_ID,
				defaultDecision: 'rejected'
			})
		);
	});

	it('dismisses an agent-run change set from chat without requiring mutations', async () => {
		const item = agentRunItem();
		const local = createSupabaseMock({ item, session: chatSessionFor(item) });
		mocks.createAdminSupabaseClient.mockReturnValue(
			createSupabaseMock({ item: null, session: null }).supabase
		);
		mocks.syncInboxItemForSource
			.mockResolvedValueOnce({ ...item, status: 'pending' })
			.mockResolvedValueOnce({ ...item, status: 'decided', source_status: 'completed' });

		const response = await POST({
			params: { item_id: item.id },
			request: makeRequest({
				session_id: 'session-1',
				has_changes: false,
				resolution: 'dismissed'
			}),
			locals: makeLocals(local.supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data.resolved).toBe(true);
		expect(mocks.commitChangeSet).toHaveBeenCalledWith(
			expect.objectContaining({
				runId: item.source_ref_id,
				userId: USER_ID,
				defaultDecision: 'rejected'
			})
		);
	});
});
