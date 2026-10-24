// apps/web/src/routes/api/onto/projects/[id]/recent-chats/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyProjectAccessMock } = vi.hoisted(() => ({ verifyProjectAccessMock: vi.fn() }));

vi.mock('$lib/utils/api-helpers', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/utils/api-helpers')>();
	return { ...actual, verifyProjectAccess: verifyProjectAccessMock };
});
vi.mock('../../../shared/error-logging', () => ({ logOntologyApiError: vi.fn() }));

import { GET } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function session(id: string, extra: Record<string, unknown> = {}) {
	return {
		id,
		title: 'Agent Session',
		auto_title: null,
		summary: null,
		chat_topics: [],
		context_type: 'project',
		entity_id: PROJECT_ID,
		message_count: 2,
		status: 'active',
		focus: { focusType: 'project-wide', projectId: PROJECT_ID },
		created_at: '2026-10-01T10:00:00.000Z',
		updated_at: '2026-10-01T10:00:00.000Z',
		last_message_at: '2026-10-01T10:00:00.000Z',
		...extra
	};
}

/** Every table answers with its rows, whatever the filters; calls are kept per table. */
function supabaseWith(tables: Record<string, unknown[]>) {
	const calls: Record<string, Record<string, unknown[][]>> = {};
	const from = vi.fn((table: string) => {
		const seen = (calls[table] ??= {});
		const query: Record<string, unknown> = {};
		for (const name of ['select', 'eq', 'neq', 'or', 'in', 'filter', 'order', 'limit']) {
			query[name] = (...args: unknown[]) => {
				(seen[name] ??= []).push(args);
				return query;
			};
		}
		query.then = (resolve: (value: unknown) => unknown) =>
			resolve({ data: tables[table] ?? [], error: null });
		return query;
	});
	return { supabase: { from }, calls };
}

function request(supabase: unknown, user: unknown = { id: 'user-1' }) {
	return GET({
		params: { id: PROJECT_ID },
		url: new URL(`http://localhost/api/onto/projects/${PROJECT_ID}/recent-chats?limit=20`),
		locals: { supabase, safeGetSession: vi.fn().mockResolvedValue({ user }) }
	} as any) as Promise<Response>;
}

describe('GET /api/onto/projects/[id]/recent-chats', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		verifyProjectAccessMock.mockResolvedValue({ authorized: true });
	});

	it('orders chats by when something was last said, not by a later touch', async () => {
		const { supabase } = supabaseWith({
			chat_sessions: [
				// Reopened and closed today: only updated_at moved.
				session('read-again', {
					title: 'Pricing page rewrite',
					last_message_at: '2026-10-01T10:00:00.000Z',
					updated_at: '2026-10-12T09:00:00.000Z'
				}),
				session('newer', {
					title: 'Launch checklist',
					last_message_at: '2026-10-05T10:00:00.000Z',
					updated_at: '2026-10-05T10:00:00.000Z'
				})
			]
		});

		const body = await (await request(supabase)).json();

		expect(body.data.chats.map((chat: { id: string }) => chat.id)).toEqual([
			'newer',
			'read-again'
		]);
		expect(body.data.chats[1].last_activity_at).toBe('2026-10-01T10:00:00.000Z');
	});

	it('names an untitled chat by how it opened, and reads only the focus', async () => {
		const { supabase, calls } = supabaseWith({
			chat_sessions: [
				session('untitled'),
				session('titled', { auto_title: 'Outreach plan', summary: 'Picked ten names.' })
			],
			chat_messages: [
				{ session_id: 'untitled', content: '  Did I get any emails\nabout 9takes today? ' },
				{ session_id: 'untitled', content: 'And yesterday?' }
			]
		});

		const body = await (await request(supabase)).json();
		const byId = Object.fromEntries(
			body.data.chats.map((chat: { id: string; title: string }) => [chat.id, chat.title])
		);

		expect(byId).toEqual({
			untitled: 'Did I get any emails about 9takes today?',
			titled: 'Outreach plan'
		});
		// Opening lines are read for the untitled chats only.
		expect(calls.chat_messages!.in).toEqual([['session_id', ['untitled']]]);
		// The whole agent_metadata blob (context caches) never leaves the database.
		for (const [columns] of calls.chat_sessions!.select!) {
			expect(columns).toContain('focus:agent_metadata->focus');
			expect(String(columns).replace('focus:agent_metadata->focus', '')).not.toContain(
				'agent_metadata'
			);
		}
	});

	it('lists Workspace chats only when the Workspace card asks', async () => {
		// Each chat_sessions read answers by its own filters: the Workspace read
		// (context_type in global/general) gets global rows, the rest get none.
		const workspaceReads: unknown[][] = [];
		const from = vi.fn((table: string) => {
			let workspaceRead = false;
			const query: Record<string, unknown> = {};
			for (const name of ['select', 'eq', 'neq', 'or', 'filter', 'order', 'limit']) {
				query[name] = () => query;
			}
			query.in = (...args: unknown[]) => {
				if (args[0] === 'context_type') {
					workspaceRead = true;
					workspaceReads.push(args);
				}
				return query;
			};
			query.then = (resolve: (value: unknown) => unknown) =>
				resolve({
					data:
						table === 'chat_sessions' && workspaceRead
							? [
									session('workspace-chat', {
										title: 'Where am I at',
										context_type: 'global',
										entity_id: null,
										focus: null
									}),
									session('task-page-chat', {
										title: 'About one task',
										context_type: 'global',
										entity_id: null,
										focus: { focusType: 'task', projectId: 'other-project' }
									})
								]
							: [],
					error: null
				});
			return query;
		});
		const supabase = { from };

		const plain = await (await request(supabase)).json();
		expect(plain.data.chats).toEqual([]);
		expect(workspaceReads).toEqual([]);

		const response = await GET({
			params: { id: PROJECT_ID },
			url: new URL(
				`http://localhost/api/onto/projects/${PROJECT_ID}/recent-chats?limit=20&include=workspace_chats`
			),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);
		const body = await response.json();

		expect(workspaceReads).toEqual([['context_type', ['global', 'general']]]);
		// A global chat focused on another project belongs to that project.
		expect(body.data.chats.map((chat: { id: string }) => chat.id)).toEqual(['workspace-chat']);
	});

	it('returns nothing when the access check fails', async () => {
		verifyProjectAccessMock.mockResolvedValue({
			authorized: false,
			error: new Response(JSON.stringify({ error: 'No access' }), { status: 403 })
		});
		const { supabase } = supabaseWith({ chat_sessions: [session('secret')] });

		const response = await request(supabase);

		expect(response.status).toBe(403);
		expect(await response.text()).not.toContain('secret');
	});
});
