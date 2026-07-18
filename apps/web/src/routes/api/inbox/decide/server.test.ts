// apps/web/src/routes/api/inbox/decide/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	requireProjectMemberAccess: vi.fn(),
	decideProjectSuggestion: vi.fn(),
	decideProjectSuggestionWithClarification: vi.fn(),
	getCalendarAnalysisService: vi.fn(),
	commitChangeSet: vi.fn(),
	syncInboxItemForSource: vi.fn()
}));

vi.mock('$lib/config/project-loops', () => ({
	PROJECT_LOOPS_ENABLED: true
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: mocks.requireProjectMemberAccess
}));

vi.mock('$lib/server/project-suggestion-actions.service', () => ({
	decideProjectSuggestion: mocks.decideProjectSuggestion
}));

vi.mock('$lib/server/clarified-decision.service', () => ({
	decideProjectSuggestionWithClarification: mocks.decideProjectSuggestionWithClarification
}));

vi.mock('$lib/services/calendar-analysis.service', () => ({
	CalendarAnalysisService: {
		getInstance: mocks.getCalendarAnalysisService
	}
}));

vi.mock('@buildos/shared-agent-ops', () => ({
	commitChangeSet: mocks.commitChangeSet
}));

vi.mock('@buildos/shared-agent-ops/inbox-index', () => ({
	syncInboxItemForSource: mocks.syncInboxItemForSource
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

function createSupabaseMock(
	inboxItem: InboxItemFixture,
	options: { project?: Record<string, unknown> | null } = {}
) {
	const updates: Array<{
		table: string;
		payload: Record<string, unknown>;
		filters: Array<[string, unknown]>;
	}> = [];

	const supabase = {
		from: vi.fn((table: string) => {
			const state: {
				action: 'select' | 'update';
				payload: Record<string, unknown> | null;
				filters: Array<[string, unknown]>;
			} = {
				action: 'select',
				payload: null,
				filters: []
			};
			const builder: any = {
				select: vi.fn(() => builder),
				eq: vi.fn((column: string, value: unknown) => {
					state.filters.push([column, value]);
					return builder;
				}),
				update: vi.fn((payload: Record<string, unknown>) => {
					state.action = 'update';
					state.payload = payload;
					return builder;
				}),
				maybeSingle: vi.fn(async () => {
					if (table === 'onto_projects') {
						return {
							data:
								options.project === undefined
									? inboxItem.project_id
										? { id: inboxItem.project_id, deleted_at: null }
										: null
									: options.project,
							error: null
						};
					}
					if (table !== 'inbox_items') return { data: null, error: null };
					if (state.action === 'update') {
						updates.push({
							table,
							payload: state.payload ?? {},
							filters: [...state.filters]
						});
						return {
							data: { ...inboxItem, ...(state.payload ?? {}) },
							error: null
						};
					}
					return { data: inboxItem, error: null };
				})
			};
			return builder;
		})
	};

	return { supabase, updates };
}

function makeRequest(body: Record<string, unknown>) {
	return new Request('http://localhost/api/inbox/decide', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

function makeLocals(supabase: unknown) {
	return {
		supabase,
		safeGetSession: vi.fn(async () => ({
			user: { id: 'user-1' }
		}))
	};
}

function pendingProjectSuggestionItem(): InboxItemFixture {
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

describe('POST /api/inbox/decide', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireProjectMemberAccess.mockResolvedValue({
			ok: true,
			projectId: 'project-1'
		});
		mocks.syncInboxItemForSource.mockImplementation(async ({ sourceType, sourceRefId }) => ({
			...pendingProjectSuggestionItem(),
			source_type: sourceType,
			source_ref_id: sourceRefId,
			status: 'pending',
			source_status: 'pending'
		}));
	});

	it('snoozes a pending project suggestion inbox row without deciding the source', async () => {
		const inboxItem = pendingProjectSuggestionItem();
		const { supabase } = createSupabaseMock(inboxItem);
		const admin = createSupabaseMock(inboxItem);
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);
		const snoozeUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

		const response = await POST({
			request: makeRequest({
				item_id: 'inbox-1',
				action: 'snooze',
				snooze_until: snoozeUntil
			}),
			locals: makeLocals(supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data).toMatchObject({
			snoozed_until: snoozeUntil,
			item: {
				status: 'snoozed',
				snoozed_until: snoozeUntil,
				decided_at: null,
				blocked_reason: null
			}
		});
		expect(admin.updates[0]).toMatchObject({
			table: 'inbox_items',
			payload: expect.objectContaining({
				status: 'snoozed',
				snoozed_until: snoozeUntil,
				decided_at: null,
				blocked_reason: null
			})
		});
		expect(mocks.requireProjectMemberAccess).toHaveBeenCalledWith(
			expect.objectContaining({ requiredAccess: 'read' })
		);
		expect(mocks.decideProjectSuggestion).not.toHaveBeenCalled();
		expect(mocks.decideProjectSuggestionWithClarification).not.toHaveBeenCalled();
		expect(mocks.syncInboxItemForSource).not.toHaveBeenCalled();
	});

	it('rejects snooze requests with a past timestamp', async () => {
		const inboxItem = pendingProjectSuggestionItem();
		const { supabase } = createSupabaseMock(inboxItem);
		const admin = createSupabaseMock(inboxItem);
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);

		const response = await POST({
			request: makeRequest({
				item_id: 'inbox-1',
				action: 'snooze',
				snooze_until: '2020-01-01T00:00:00.000Z'
			}),
			locals: makeLocals(supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json.error).toBe('snooze_until must be in the future');
		expect(admin.updates).toEqual([]);
	});

	it('forces a dismissed project suggestion inbox row out of pending when sync returns stale pending', async () => {
		const inboxItem = pendingProjectSuggestionItem();
		const { supabase } = createSupabaseMock(inboxItem);
		const admin = createSupabaseMock(inboxItem);
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);
		mocks.decideProjectSuggestion.mockResolvedValue({
			ok: true,
			suggestion: { id: 'suggestion-1', status: 'rejected' },
			result: { ok: true }
		});
		const routeFetch = vi.fn();

		const response = await POST({
			request: makeRequest({ item_id: 'inbox-1', action: 'reject' }),
			locals: makeLocals(supabase),
			fetch: routeFetch
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(mocks.decideProjectSuggestion).toHaveBeenCalledWith(
			expect.objectContaining({ fetchFn: routeFetch })
		);
		expect(json.data.item).toMatchObject({
			status: 'decided',
			source_status: 'rejected'
		});
		expect(admin.updates[0]).toMatchObject({
			table: 'inbox_items',
			payload: expect.objectContaining({
				status: 'decided',
				source_status: 'rejected',
				blocked_reason: null
			})
		});
	});

	it('passes project suggestion dismissal feedback through to the decision service', async () => {
		const inboxItem = pendingProjectSuggestionItem();
		const { supabase } = createSupabaseMock(inboxItem);
		const admin = createSupabaseMock(inboxItem);
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);
		mocks.decideProjectSuggestion.mockResolvedValue({
			ok: true,
			suggestion: { id: 'suggestion-1', status: 'rejected' },
			result: { ok: true }
		});

		const response = await POST({
			request: makeRequest({
				item_id: 'inbox-1',
				action: 'reject',
				reason: 'wrong_evidence',
				note: 'The evidence points to the older plan.'
			}),
			locals: makeLocals(supabase),
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(200);
		expect(mocks.decideProjectSuggestion).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'dismiss',
				feedback: {
					reason: 'wrong_evidence',
					note: 'The evidence points to the older plan.'
				}
			})
		);
		expect(mocks.decideProjectSuggestionWithClarification).not.toHaveBeenCalled();
	});

	it('passes a shared decision note through as dismissal feedback without a reason', async () => {
		const inboxItem = pendingProjectSuggestionItem();
		const { supabase } = createSupabaseMock(inboxItem);
		const admin = createSupabaseMock(inboxItem);
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);
		mocks.decideProjectSuggestion.mockResolvedValue({
			ok: true,
			suggestion: { id: 'suggestion-1', status: 'rejected' },
			result: { ok: true }
		});

		const response = await POST({
			request: makeRequest({
				item_id: 'inbox-1',
				action: 'reject',
				note: 'This is intentionally out of scope.'
			}),
			locals: makeLocals(supabase),
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(200);
		expect(mocks.decideProjectSuggestion).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'dismiss',
				feedback: {
					reason: undefined,
					note: 'This is intentionally out of scope.'
				}
			})
		);
		expect(mocks.decideProjectSuggestionWithClarification).not.toHaveBeenCalled();
	});

	it('records a one-line response when addressing a project finding', async () => {
		const inboxItem = {
			...pendingProjectSuggestionItem(),
			action_kinds: ['address', 'reject']
		};
		const { supabase } = createSupabaseMock(inboxItem);
		const admin = createSupabaseMock(inboxItem);
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);
		mocks.decideProjectSuggestion.mockResolvedValue({
			ok: true,
			suggestion: { id: 'suggestion-1', status: 'addressed' }
		});

		const response = await POST({
			request: makeRequest({
				item_id: 'inbox-1',
				action: 'address',
				resolution_text: 'The date is intentionally provisional.'
			}),
			locals: makeLocals(supabase),
			fetch: vi.fn()
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(mocks.decideProjectSuggestion).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'address',
				feedback: {
					reason: 'other',
					note: 'The date is intentionally provisional.'
				}
			})
		);
		expect(json.data.item).toMatchObject({
			status: 'decided',
			source_status: 'addressed'
		});
	});

	it('requires a response before addressing a project finding', async () => {
		const inboxItem = {
			...pendingProjectSuggestionItem(),
			action_kinds: ['address', 'reject']
		};
		const { supabase } = createSupabaseMock(inboxItem);
		const admin = createSupabaseMock(inboxItem);
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);

		const response = await POST({
			request: makeRequest({ item_id: 'inbox-1', action: 'address' }),
			locals: makeLocals(supabase),
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(400);
		expect(mocks.decideProjectSuggestion).not.toHaveBeenCalled();
	});

	it('forces the inbox row out of pending when source sync throws after a successful decision', async () => {
		const inboxItem = pendingProjectSuggestionItem();
		const { supabase } = createSupabaseMock(inboxItem);
		const admin = createSupabaseMock(inboxItem);
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);
		mocks.syncInboxItemForSource.mockRejectedValue(new Error('sync failed'));
		mocks.decideProjectSuggestion.mockResolvedValue({
			ok: true,
			suggestion: { id: 'suggestion-1', status: 'rejected' }
		});

		const response = await POST({
			request: makeRequest({ item_id: 'inbox-1', action: 'reject' }),
			locals: makeLocals(supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data.item).toMatchObject({
			status: 'decided',
			source_status: 'rejected'
		});
		expect(admin.updates[0].payload).toMatchObject({
			status: 'decided',
			source_status: 'rejected'
		});
	});

	it('forces a clarified project suggestion into deciding when delegated sync is stale', async () => {
		const inboxItem = pendingProjectSuggestionItem();
		const { supabase } = createSupabaseMock(inboxItem);
		const admin = createSupabaseMock(inboxItem);
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);
		mocks.decideProjectSuggestionWithClarification.mockResolvedValue({
			ok: true,
			suggestion: { id: 'suggestion-1', status: 'delegated' },
			delegated: true,
			agent_run_id: 'agent-run-1'
		});

		const response = await POST({
			request: makeRequest({
				item_id: 'inbox-1',
				action: 'approve',
				clarification: 'Apply this carefully.'
			}),
			locals: makeLocals(supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data.item).toMatchObject({
			status: 'deciding',
			source_status: 'delegated',
			decided_at: null
		});
		expect(admin.updates[0].payload).toMatchObject({
			status: 'deciding',
			source_status: 'delegated',
			decided_at: null
		});
	});

	it('forces an accepted calendar suggestion inbox row out of pending when sync returns stale pending', async () => {
		const inboxItem: InboxItemFixture = {
			id: 'inbox-calendar-1',
			source_type: 'calendar_suggestion',
			source_ref_id: 'calendar-suggestion-1',
			source_status: 'pending',
			status: 'pending',
			user_id: 'user-1',
			project_id: null,
			audience: 'user',
			title: 'Calendar suggestion',
			action_kinds: ['approve', 'reject']
		};
		const { supabase } = createSupabaseMock(inboxItem);
		const admin = createSupabaseMock(inboxItem);
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);
		mocks.syncInboxItemForSource.mockResolvedValue({
			...inboxItem,
			status: 'pending',
			source_status: 'pending'
		});
		mocks.getCalendarAnalysisService.mockReturnValue({
			acceptSuggestion: vi.fn(async () => ({
				success: true,
				data: { projectId: 'project-1' }
			})),
			rejectSuggestion: vi.fn()
		});

		const response = await POST({
			request: makeRequest({ item_id: 'inbox-calendar-1', action: 'approve' }),
			locals: makeLocals(supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data.item).toMatchObject({
			status: 'decided',
			source_status: 'accepted'
		});
		expect(admin.updates[0].payload).toMatchObject({
			status: 'decided',
			source_status: 'accepted'
		});
	});

	it('forces an approved agent-run inbox row out of pending when sync returns stale pending', async () => {
		const inboxItem: InboxItemFixture = {
			id: 'inbox-agent-1',
			source_type: 'agent_run',
			source_ref_id: 'agent-run-1',
			source_status: 'proposal_ready',
			status: 'pending',
			user_id: 'user-1',
			project_id: 'project-1',
			audience: 'user',
			title: 'Agent proposal',
			action_kinds: ['approve', 'reject']
		};
		const { supabase } = createSupabaseMock(inboxItem);
		const admin = createSupabaseMock(inboxItem);
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);
		mocks.syncInboxItemForSource.mockResolvedValue({
			...inboxItem,
			status: 'pending',
			source_status: 'proposal_ready'
		});
		mocks.commitChangeSet.mockResolvedValue({
			ok: true,
			result: { status: 'applied' }
		});

		const response = await POST({
			request: makeRequest({ item_id: 'inbox-agent-1', action: 'approve' }),
			locals: makeLocals(supabase)
		} as any);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data.item).toMatchObject({
			status: 'decided',
			source_status: 'completed'
		});
		expect(admin.updates[0].payload).toMatchObject({
			status: 'decided',
			source_status: 'completed'
		});
	});

	it('expires a stale inbox item instead of applying it after its project was deleted', async () => {
		const inboxItem: InboxItemFixture = {
			id: 'inbox-agent-deleted-project',
			source_type: 'agent_run',
			source_ref_id: 'agent-run-deleted-project',
			source_status: 'proposal_ready',
			status: 'pending',
			user_id: 'user-1',
			project_id: 'project-deleted',
			audience: 'user',
			title: 'Update project START HERE',
			action_kinds: ['approve', 'reject']
		};
		const { supabase } = createSupabaseMock(inboxItem);
		const admin = createSupabaseMock(inboxItem, {
			project: {
				id: 'project-deleted',
				deleted_at: '2026-07-11T03:38:13.141Z'
			}
		});
		mocks.createAdminSupabaseClient.mockReturnValue(admin.supabase);

		const response = await POST({
			request: makeRequest({
				item_id: inboxItem.id,
				action: 'approve'
			}),
			locals: makeLocals(supabase),
			fetch: vi.fn()
		} as any);
		const json = await response.json();

		expect(response.status).toBe(409);
		expect(json).toMatchObject({
			error: 'This review item belongs to a deleted project and can no longer be applied.',
			code: 'PROJECT_DELETED'
		});
		expect(mocks.commitChangeSet).not.toHaveBeenCalled();
		expect(admin.updates).toContainEqual(
			expect.objectContaining({
				table: 'inbox_items',
				payload: expect.objectContaining({
					status: 'expired',
					source_status: 'project_deleted',
					blocked_reason: 'Project was deleted'
				})
			})
		);
	});
});
