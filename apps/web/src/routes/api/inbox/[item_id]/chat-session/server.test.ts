// apps/web/src/routes/api/inbox/[item_id]/chat-session/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createInboxChatSession: vi.fn(),
	requireProjectMemberAccess: vi.fn()
}));

vi.mock('$lib/config/project-loops', () => ({
	PROJECT_LOOPS_ENABLED: true
}));

vi.mock('$lib/server/inbox-chat-session.service', () => ({
	createInboxChatSession: mocks.createInboxChatSession
}));

vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: mocks.requireProjectMemberAccess
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

const USER_ID = 'user-1';

function createSupabaseMock(inboxItem: InboxItemFixture | null) {
	return {
		from: vi.fn((table: string) => {
			const builder: any = {
				select: vi.fn(() => builder),
				eq: vi.fn(() => builder),
				maybeSingle: vi.fn(async () => ({
					data: table === 'inbox_items' ? inboxItem : null,
					error: null
				}))
			};
			return builder;
		})
	};
}

function makeLocals(supabase: unknown) {
	return {
		supabase,
		safeGetSession: vi.fn(async () => ({
			user: { id: USER_ID }
		}))
	};
}

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
		title: 'Resolve review item',
		action_kinds: ['approve', 'reject']
	};
}

function calendarSuggestionItem(userId = USER_ID): InboxItemFixture {
	return {
		id: 'inbox-2',
		source_type: 'calendar_suggestion',
		source_ref_id: 'calendar-suggestion-1',
		source_status: 'pending',
		status: 'pending',
		user_id: userId,
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

describe('POST /api/inbox/[item_id]/chat-session', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireProjectMemberAccess.mockResolvedValue({
			ok: true,
			projectId: 'project-1'
		});
		mocks.createInboxChatSession.mockResolvedValue({
			created: true,
			chat_session_id: 'session-1',
			session: { id: 'session-1', context_type: 'project', entity_id: 'project-1' }
		});
	});

	it('requires project write access before opening a project-suggestion chat', async () => {
		const item = projectSuggestionItem();
		const supabase = createSupabaseMock(item);

		const response = await POST({
			params: { item_id: item.id },
			locals: makeLocals(supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(201);
		expect(json.data.chat_session_id).toBe('session-1');
		expect(mocks.requireProjectMemberAccess).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				requiredAccess: 'write'
			})
		);
		expect(mocks.createInboxChatSession).toHaveBeenCalledWith(
			expect.objectContaining({
				item,
				userId: USER_ID
			})
		);
	});

	it('opens a user-owned calendar suggestion chat without project access', async () => {
		const item = calendarSuggestionItem();
		const supabase = createSupabaseMock(item);
		mocks.createInboxChatSession.mockResolvedValue({
			created: false,
			chat_session_id: 'session-2',
			session: { id: 'session-2', context_type: 'calendar', entity_id: item.source_ref_id }
		});

		const response = await POST({
			params: { item_id: item.id },
			locals: makeLocals(supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data.chat_session_id).toBe('session-2');
		expect(mocks.requireProjectMemberAccess).not.toHaveBeenCalled();
		expect(mocks.createInboxChatSession).toHaveBeenCalledWith(
			expect.objectContaining({
				item,
				userId: USER_ID
			})
		);
	});

	it('requires project read access before opening a project-audit chat', async () => {
		const item = projectAuditItem();
		const supabase = createSupabaseMock(item);

		const response = await POST({
			params: { item_id: item.id },
			locals: makeLocals(supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(201);
		expect(json.data.chat_session_id).toBe('session-1');
		expect(mocks.requireProjectMemberAccess).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				requiredAccess: 'read'
			})
		);
		expect(mocks.createInboxChatSession).toHaveBeenCalledWith(
			expect.objectContaining({
				item,
				userId: USER_ID
			})
		);
	});

	it('forbids user-owned inbox items owned by another user', async () => {
		const item = calendarSuggestionItem('other-user');
		const supabase = createSupabaseMock(item);

		const response = await POST({
			params: { item_id: item.id },
			locals: makeLocals(supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(403);
		expect(json.success).toBe(false);
		expect(mocks.createInboxChatSession).not.toHaveBeenCalled();
	});
});
