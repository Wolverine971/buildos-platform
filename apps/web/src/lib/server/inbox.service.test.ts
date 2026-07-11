// apps/web/src/lib/server/inbox.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	syncInboxItemForSource: vi.fn()
}));

vi.mock('@buildos/shared-agent-ops/inbox-index', () => ({
	syncInboxItemForSource: mocks.syncInboxItemForSource
}));

import { countInboxItems, listInboxItems, sortInboxRowsForReview } from './inbox.service';

type Row = Record<string, any>;

type Operation = {
	table: string;
	action: 'select' | 'update';
	payload?: Row;
	filters: Array<[string, unknown]>;
	inFilters: Array<[string, unknown[]]>;
};

type MockState = {
	tables: Record<string, Row[]>;
	operations: Operation[];
};

function matches(
	row: Row,
	filters: Array<[string, unknown]>,
	inFilters: Array<[string, unknown[]]>
) {
	return (
		filters.every(([field, value]) => row[field] === value) &&
		inFilters.every(([field, values]) => values.includes(row[field]))
	);
}

class QueryBuilderMock {
	private action: 'select' | 'update' = 'select';
	private filters: Array<[string, unknown]> = [];
	private inFilters: Array<[string, unknown[]]> = [];
	private notNullFilters: string[] = [];
	private updatePayload: Row | null = null;
	private rowLimit: number | null = null;
	private countRequested = false;
	private headOnly = false;

	constructor(
		private readonly state: MockState,
		private readonly table: string
	) {}

	select(_columns?: string, options?: { count?: string; head?: boolean }) {
		this.countRequested = Boolean(options?.count);
		this.headOnly = Boolean(options?.head);
		return this;
	}

	update(payload: Row) {
		this.action = 'update';
		this.updatePayload = payload;
		return this;
	}

	eq(field: string, value: unknown) {
		this.filters.push([field, value]);
		return this;
	}

	in(field: string, values: unknown[]) {
		this.inFilters.push([field, values]);
		return this;
	}

	is(field: string, value: unknown) {
		this.filters.push([field, value]);
		return this;
	}

	not(field: string, operator: string, value: unknown) {
		if (operator === 'is' && value === null) {
			this.notNullFilters.push(field);
		}
		return this;
	}

	order() {
		return this;
	}

	limit(value: number) {
		this.rowLimit = value;
		return this;
	}

	private selectRows(): Row[] {
		const rows = (this.state.tables[this.table] ?? []).filter(
			(row) =>
				matches(row, this.filters, this.inFilters) &&
				this.notNullFilters.every(
					(field) => row[field] !== null && row[field] !== undefined
				)
		);
		return this.rowLimit === null ? rows : rows.slice(0, this.rowLimit);
	}

	async maybeSingle() {
		if (this.action === 'update' && this.updatePayload) {
			const rows = this.state.tables[this.table] ?? [];
			const row = rows.find((entry) => matches(entry, this.filters, this.inFilters));
			this.state.operations.push({
				table: this.table,
				action: 'update',
				payload: this.updatePayload,
				filters: [...this.filters],
				inFilters: [...this.inFilters]
			});
			if (!row) return { data: null, error: null };
			Object.assign(row, this.updatePayload);
			return { data: row, error: null };
		}
		return { data: this.selectRows()[0] ?? null, error: null };
	}

	then(resolve: (value: { data: Row[]; error: null; count: number | null }) => unknown) {
		const allRows = (this.state.tables[this.table] ?? []).filter(
			(row) =>
				matches(row, this.filters, this.inFilters) &&
				this.notNullFilters.every(
					(field) => row[field] !== null && row[field] !== undefined
				)
		);
		if (this.action === 'update' && this.updatePayload) {
			for (const row of allRows) {
				Object.assign(row, this.updatePayload);
			}
		}
		const rows = this.rowLimit === null ? allRows : allRows.slice(0, this.rowLimit);
		this.state.operations.push({
			table: this.table,
			action: this.action,
			payload: this.updatePayload ?? undefined,
			filters: [...this.filters],
			inFilters: [...this.inFilters]
		});
		return Promise.resolve(
			resolve({
				data: this.headOnly ? [] : rows,
				error: null,
				count: this.countRequested ? allRows.length : null
			})
		);
	}
}

function createSupabaseMock(tables: Record<string, Row[]>) {
	const state: MockState = { tables, operations: [] };
	const supabase = {
		from: vi.fn((table: string) => new QueryBuilderMock(state, table)),
		rpc: vi.fn(async () => ({ data: true, error: null }))
	};
	return { supabase, state };
}

function delegatedSuggestion(overrides: Row = {}): Row {
	return {
		id: 'suggestion-1',
		project_id: 'project-1',
		status: 'delegated',
		agent_run_id: 'agent-run-1',
		title: 'Clarified cleanup',
		rationale: 'Needs follow-up',
		created_at: '2026-06-29T12:00:00.000Z',
		...overrides
	};
}

function agentRun(overrides: Row = {}): Row {
	return {
		id: 'agent-run-1',
		status: 'completed',
		source_decision: 'approve',
		result: {
			summary: 'Applied the clarified cleanup.',
			answer: 'Done.'
		},
		completed_at: '2026-06-29T12:05:00.000Z',
		updated_at: '2026-06-29T12:05:00.000Z',
		...overrides
	};
}

describe('inbox service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.syncInboxItemForSource.mockResolvedValue({
			source_type: 'project_suggestion',
			source_ref_id: 'suggestion-1',
			status: 'decided',
			source_status: 'applied'
		});
	});

	it('repairs delegated project suggestions from terminal child runs during backfill', async () => {
		const { supabase, state } = createSupabaseMock({
			project_suggestions: [delegatedSuggestion()],
			agent_runs: [agentRun()],
			inbox_items: []
		});

		await listInboxItems({
			supabase,
			admin: supabase,
			userId: 'user-1',
			status: 'pending',
			sourceType: 'project_suggestion',
			limit: 20
		});

		expect(state.tables.project_suggestions[0]).toMatchObject({
			status: 'applied',
			applied_at: '2026-06-29T12:05:00.000Z',
			result: expect.objectContaining({
				ok: true,
				agent_run_id: 'agent-run-1',
				agent_run_status: 'completed',
				source_decision: 'approve',
				repaired_by: 'ai_inbox_backfill'
			})
		});
		expect(mocks.syncInboxItemForSource).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceType: 'project_suggestion',
				sourceRefId: 'suggestion-1'
			})
		);
	});

	it('marks delegated project suggestions failed when the child run is terminal unsuccessful', async () => {
		const { supabase, state } = createSupabaseMock({
			project_suggestions: [delegatedSuggestion()],
			agent_runs: [
				agentRun({
					status: 'cancelled',
					source_decision: 'dismiss',
					result: { error: 'User cancelled the run.' }
				})
			],
			inbox_items: []
		});

		await listInboxItems({
			supabase,
			admin: supabase,
			userId: 'user-1',
			status: 'pending',
			sourceType: 'project_suggestion',
			limit: 20
		});

		expect(state.tables.project_suggestions[0]).toMatchObject({
			status: 'failed',
			result: expect.objectContaining({
				ok: false,
				agent_run_status: 'cancelled',
				source_decision: 'dismiss',
				errors: [{ tool: 'agent_run', error: 'User cancelled the run.' }]
			})
		});
	});

	it('leaves delegated project suggestions alone while the child run is still active', async () => {
		const { supabase, state } = createSupabaseMock({
			project_suggestions: [delegatedSuggestion()],
			agent_runs: [agentRun({ status: 'running' })],
			inbox_items: []
		});

		await listInboxItems({
			supabase,
			admin: supabase,
			userId: 'user-1',
			status: 'pending',
			sourceType: 'project_suggestion',
			limit: 20
		});

		expect(state.tables.project_suggestions[0]).toMatchObject({
			status: 'delegated',
			agent_run_id: 'agent-run-1'
		});
		expect(
			state.operations.some(
				(operation) =>
					operation.table === 'project_suggestions' && operation.action === 'update'
			)
		).toBe(false);
	});

	it('orders review rows by actionable status, risk tier, then recency', () => {
		const rows = [
			{
				id: 'low-recent',
				source_type: 'project_suggestion',
				source_ref_id: 'source-1',
				audience: 'project_members',
				status: 'pending',
				title: 'Low recent',
				risk_tier: 1,
				action_kinds: [],
				created_at: '2026-07-04T16:00:00.000Z'
			},
			{
				id: 'blocked-high',
				source_type: 'project_suggestion',
				source_ref_id: 'source-2',
				audience: 'project_members',
				status: 'blocked',
				title: 'Blocked high',
				risk_tier: 3,
				action_kinds: [],
				created_at: '2026-07-04T18:00:00.000Z'
			},
			{
				id: 'high-older',
				source_type: 'project_suggestion',
				source_ref_id: 'source-3',
				audience: 'project_members',
				status: 'pending',
				title: 'High older',
				risk_tier: 3,
				action_kinds: [],
				created_at: '2026-07-04T12:00:00.000Z'
			},
			{
				id: 'review-newest',
				source_type: 'agent_run',
				source_ref_id: 'source-4',
				audience: 'user',
				status: 'pending',
				title: 'Review newest',
				risk_tier: null,
				action_kinds: [],
				created_at: '2026-07-04T20:00:00.000Z'
			},
			{
				id: 'high-newest',
				source_type: 'project_suggestion',
				source_ref_id: 'source-5',
				audience: 'project_members',
				status: 'pending',
				title: 'High newest',
				risk_tier: 3,
				action_kinds: [],
				created_at: '2026-07-04T19:00:00.000Z'
			}
		] as any[];

		expect(sortInboxRowsForReview(rows).map((row) => row.id)).toEqual([
			'high-newest',
			'high-older',
			'review-newest',
			'low-recent',
			'blocked-high'
		]);
	});

	it('returns the exact pending total when the visible inbox page is bounded', async () => {
		const inboxItems = Array.from({ length: 30 }, (_, index) => ({
			id: `fragment-${index}`,
			source_type: 'profile_fragment',
			source_ref_id: `source-${index}`,
			source_status: 'pending',
			user_id: 'user-1',
			project_id: null,
			audience: 'user',
			status: 'pending',
			title: `Profile fragment ${index}`,
			action_kinds: ['approve', 'reject'],
			created_at: new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString()
		}));
		const { supabase } = createSupabaseMock({ inbox_items: inboxItems });

		const result = await listInboxItems({
			supabase,
			admin: supabase,
			userId: 'user-1',
			status: 'pending',
			sourceType: 'profile_fragment',
			limit: 25
		});

		expect(result.items).toHaveLength(25);
		expect(result.total).toBe(30);
	});

	it('uses the indexed fast path without source backfill or source reconciliation', async () => {
		const inboxItem = {
			id: 'inbox-fast',
			source_type: 'project_suggestion',
			source_ref_id: 'suggestion-fast',
			source_status: 'pending',
			user_id: null,
			project_id: 'project-1',
			audience: 'project_members',
			status: 'pending',
			title: 'Fast indexed review',
			action_kinds: ['approve', 'reject'],
			created_at: '2026-07-10T12:00:00.000Z'
		};
		const { supabase, state } = createSupabaseMock({
			inbox_items: [inboxItem],
			project_suggestions: [{ id: 'suggestion-fast', status: 'pending' }]
		});
		const timing = {
			measure: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn())
		} as any;

		const result = await listInboxItems({
			supabase,
			admin: supabase,
			userId: 'user-1',
			status: 'pending',
			limit: 25,
			repair: false,
			timing
		});

		expect(result.items).toHaveLength(1);
		expect(result.total).toBe(1);
		expect(result.backfilledCount).toBe(0);
		expect(mocks.syncInboxItemForSource).not.toHaveBeenCalled();
		expect(
			state.operations.some((operation) => operation.table === 'project_suggestions')
		).toBe(false);
		expect(timing.measure.mock.calls.map(([name]: [string]) => name)).toEqual([
			'inbox.index',
			'inbox.lifecycle',
			'inbox.total'
		]);
	});

	it('keeps active snoozed rows hidden from pending review without source resync', async () => {
		const inboxItem = {
			id: 'inbox-snoozed',
			source_type: 'project_suggestion',
			source_ref_id: 'suggestion-snoozed',
			source_status: 'pending',
			user_id: null,
			project_id: 'project-1',
			audience: 'project_members',
			status: 'snoozed',
			title: 'Review later',
			summary: 'Hidden until tomorrow',
			risk_tier: 2,
			action_kinds: ['approve', 'reject'],
			snoozed_until: '2099-01-01T00:00:00.000Z',
			created_at: '2026-07-04T12:00:00.000Z'
		};
		const { supabase } = createSupabaseMock({
			inbox_items: [inboxItem],
			project_suggestions: []
		});

		const result = await listInboxItems({
			supabase,
			admin: supabase,
			userId: 'user-1',
			status: 'pending',
			sourceType: 'project_suggestion',
			limit: 20
		});

		expect(result.items).toEqual([]);
		expect(mocks.syncInboxItemForSource).not.toHaveBeenCalledWith(
			expect.objectContaining({
				sourceType: 'project_suggestion',
				sourceRefId: 'suggestion-snoozed'
			})
		);
	});

	it('expires pending rows whose review TTL has elapsed', async () => {
		const inboxItem = {
			id: 'inbox-expired',
			source_type: 'project_suggestion',
			source_ref_id: 'suggestion-expired',
			source_status: 'pending',
			user_id: null,
			project_id: 'project-1',
			audience: 'project_members',
			status: 'pending',
			title: 'Old review item',
			summary: 'Past its review window',
			risk_tier: 2,
			action_kinds: ['approve', 'reject'],
			expires_at: '2020-01-01T00:00:00.000Z',
			created_at: '2019-12-01T00:00:00.000Z'
		};
		mocks.syncInboxItemForSource.mockResolvedValue(inboxItem);
		const { supabase, state } = createSupabaseMock({
			inbox_items: [inboxItem],
			project_suggestions: []
		});

		const result = await listInboxItems({
			supabase,
			admin: supabase,
			userId: 'user-1',
			status: 'pending',
			sourceType: 'project_suggestion',
			limit: 20
		});

		expect(result.items).toEqual([]);
		expect(state.operations).toContainEqual(
			expect.objectContaining({
				table: 'inbox_items',
				action: 'update',
				payload: expect.objectContaining({
					status: 'expired',
					blocked_reason: 'Review item expired'
				})
			})
		);
	});

	it('counts inbox rows through lightweight index queries after scoped source backfill', async () => {
		const { supabase, state } = createSupabaseMock({
			inbox_items: [
				{
					id: 'inbox-account',
					source_type: 'agent_run',
					source_ref_id: 'agent-run-1',
					status: 'pending',
					project_id: null,
					created_at: '2026-07-04T12:00:00.000Z'
				},
				{
					id: 'inbox-project',
					source_type: 'project_suggestion',
					source_ref_id: 'suggestion-1',
					status: 'pending',
					project_id: 'project-1',
					created_at: '2026-07-04T12:01:00.000Z'
				},
				{
					id: 'inbox-decided',
					source_type: 'project_suggestion',
					source_ref_id: 'suggestion-2',
					status: 'decided',
					project_id: 'project-1',
					created_at: '2026-07-04T12:02:00.000Z'
				}
			],
			project_suggestions: [delegatedSuggestion()]
		});

		const result = await countInboxItems({
			supabase,
			admin: supabase,
			userId: 'user-1',
			status: 'pending',
			limit: 20
		});

		expect(result).toMatchObject({
			total: 2,
			by_status: { pending: 2 },
			by_source_type: {
				agent_run: 1,
				project_suggestion: 1
			},
			by_project: { 'project-1': 1 },
			account: 1,
			truncated: false,
			repairedCount: 0,
			backfilledCount: 1
		});
		expect(mocks.syncInboxItemForSource).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceType: 'project_suggestion',
				sourceRefId: 'suggestion-1'
			})
		);
		expect(state.operations.some((operation) => operation.table === 'inbox_items')).toBe(true);
	});

	it('counts from the inbox index without scanning source tables on the fast path', async () => {
		const { supabase, state } = createSupabaseMock({
			inbox_items: [
				{
					id: 'inbox-fast-count',
					source_type: 'agent_run',
					source_ref_id: 'agent-run-fast',
					status: 'pending',
					project_id: null,
					created_at: '2026-07-10T12:00:00.000Z'
				}
			],
			agent_runs: [{ id: 'agent-run-fast', status: 'proposal_ready', user_id: 'user-1' }]
		});

		const result = await countInboxItems({
			supabase,
			admin: supabase,
			userId: 'user-1',
			status: 'pending',
			limit: 1000,
			repair: false
		});

		expect(result.total).toBe(1);
		expect(result.backfilledCount).toBe(0);
		expect(state.operations.some((operation) => operation.table === 'agent_runs')).toBe(false);
		expect(mocks.syncInboxItemForSource).not.toHaveBeenCalled();
	});

	it('keeps exact totals when the count breakdown rows are limited', async () => {
		const { supabase } = createSupabaseMock({
			inbox_items: [
				{
					id: 'inbox-account',
					source_type: 'agent_run',
					source_ref_id: 'agent-run-1',
					status: 'pending',
					project_id: null,
					created_at: '2026-07-04T12:00:00.000Z'
				},
				{
					id: 'inbox-project',
					source_type: 'project_suggestion',
					source_ref_id: 'suggestion-1',
					status: 'pending',
					project_id: 'project-1',
					created_at: '2026-07-04T12:01:00.000Z'
				}
			]
		});

		const result = await countInboxItems({
			supabase,
			admin: supabase,
			userId: 'user-1',
			status: 'pending',
			limit: 1
		});

		expect(result.total).toBe(2);
		expect(result.account).toBe(1);
		expect(result.by_status).toEqual({ pending: 2 });
		expect(result.truncated).toBe(true);
	});

	it('backfills stale project_id values before project-scoped counts', async () => {
		const inboxItem = {
			id: 'inbox-agent-run',
			source_type: 'agent_run',
			source_ref_id: 'agent-run-1',
			source_status: 'proposal_ready',
			user_id: 'user-1',
			project_id: null,
			audience: 'user',
			status: 'pending',
			title: 'Review generated changes',
			summary: 'One proposed change',
			risk_tier: null,
			action_kinds: ['approve', 'reject'],
			created_at: '2026-07-04T12:00:00.000Z'
		};
		const { supabase, state } = createSupabaseMock({
			inbox_items: [inboxItem],
			agent_runs: [
				{
					id: 'agent-run-1',
					user_id: 'user-1',
					project_id: 'project-1',
					status: 'proposal_ready',
					label: 'Review generated changes',
					change_set: { status: 'pending', changes: [{ tool: 'create_onto_task' }] },
					created_at: '2026-07-04T12:00:00.000Z'
				}
			]
		});
		mocks.syncInboxItemForSource.mockImplementation(
			async ({ sourceRefId }: { sourceRefId: string }) => {
				const row = state.tables.inbox_items.find(
					(entry) => entry.source_ref_id === sourceRefId
				);
				if (row) row.project_id = 'project-1';
				return row ?? null;
			}
		);

		const result = await countInboxItems({
			supabase,
			admin: supabase,
			userId: 'user-1',
			projectId: 'project-1',
			status: 'pending',
			limit: 20
		});

		expect(result).toMatchObject({
			total: 1,
			by_status: { pending: 1 },
			by_source_type: { agent_run: 1 },
			by_project: { 'project-1': 1 },
			account: 0,
			truncated: false,
			repairedCount: 0,
			backfilledCount: 1
		});
		expect(mocks.syncInboxItemForSource).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceType: 'agent_run',
				sourceRefId: 'agent-run-1'
			})
		);
	});

	it('attaches project metadata from source payloads when the index row is missing project_id', async () => {
		const inboxItem = {
			id: 'inbox-agent-run',
			source_type: 'agent_run',
			source_ref_id: 'agent-run-1',
			source_status: 'proposal_ready',
			user_id: 'user-1',
			project_id: null,
			audience: 'user',
			status: 'pending',
			title: 'Review generated changes',
			summary: 'One proposed change',
			risk_tier: null,
			action_kinds: ['approve', 'reject'],
			created_at: '2026-07-04T12:00:00.000Z'
		};
		mocks.syncInboxItemForSource.mockResolvedValue(inboxItem);
		const { supabase, state } = createSupabaseMock({
			inbox_items: [inboxItem],
			agent_runs: [
				{
					id: 'agent-run-1',
					user_id: 'user-1',
					project_id: 'project-1',
					status: 'proposal_ready',
					label: 'Review generated changes',
					change_set: { status: 'pending', changes: [{ tool: 'create_onto_task' }] },
					created_at: '2026-07-04T12:00:00.000Z'
				}
			],
			onto_projects: [{ id: 'project-1', name: 'Launch' }]
		});

		const result = await listInboxItems({
			supabase,
			admin: supabase,
			userId: 'user-1',
			status: 'pending',
			sourceType: 'agent_run',
			limit: 20,
			includePayload: true
		});

		expect(result.items[0]).toMatchObject({
			project_id: 'project-1',
			project: { id: 'project-1', name: 'Launch' }
		});
		expect(
			state.operations.filter((operation) => operation.table === 'onto_projects')
		).toHaveLength(1);
	});

	it('attaches project audit context to audit child inbox items', async () => {
		const inboxItem = {
			id: 'inbox-1',
			source_type: 'project_suggestion',
			source_ref_id: 'suggestion-1',
			source_status: 'applied',
			user_id: null,
			project_id: 'project-1',
			audience: 'project_members',
			status: 'decided',
			title: 'Define launch decision',
			summary: 'Audit follow-up',
			risk_tier: 2,
			action_kinds: ['approve', 'reject'],
			created_at: '2026-07-04T12:00:00.000Z'
		};
		mocks.syncInboxItemForSource.mockResolvedValue(inboxItem);
		const { supabase } = createSupabaseMock({
			inbox_items: [inboxItem],
			project_suggestions: [
				{
					id: 'suggestion-1',
					project_id: 'project-1',
					run_id: 'run-1',
					kind: 'audit_recommendation',
					status: 'applied',
					title: 'Define launch decision'
				}
			],
			project_loop_runs: [
				{
					id: 'run-1',
					trigger_reason: 'manual',
					status: 'completed',
					summary: 'Audit complete',
					brief: null,
					suggestion_count: 1,
					created_at: '2026-07-04T11:00:00.000Z',
					finished_at: '2026-07-04T11:10:00.000Z'
				}
			],
			project_audit_suggestions: [
				{
					audit_id: 'audit-1',
					suggestion_id: 'suggestion-1',
					role: 'decision_point'
				}
			],
			project_audits: [
				{
					id: 'audit-1',
					status: 'ready',
					trigger_reason: 'manual',
					delivery_confidence: 'yellow',
					summary: 'Launch decision needs review.',
					generated_suggestion_count: 1,
					unresolved_suggestion_count: 0,
					created_at: '2026-07-04T11:00:00.000Z',
					finished_at: '2026-07-04T11:10:00.000Z'
				}
			],
			onto_projects: [{ id: 'project-1', name: 'Launch' }]
		});

		const result = await listInboxItems({
			supabase,
			admin: supabase,
			userId: 'user-1',
			status: 'decided',
			sourceType: 'project_suggestion',
			limit: 20,
			includePayload: true
		});

		expect(result.items[0]?.source_context).toMatchObject({
			project_loop_run: {
				id: 'run-1',
				trigger_reason: 'manual'
			},
			project_audit: {
				id: 'audit-1',
				role: 'decision_point',
				delivery_confidence: 'yellow',
				summary: 'Launch decision needs review.'
			}
		});
	});

	it('attaches project audit payload and run context to project_audit inbox items', async () => {
		const inboxItem = {
			id: 'inbox-audit-1',
			source_type: 'project_audit',
			source_ref_id: 'audit-1',
			source_status: 'ready',
			user_id: null,
			project_id: 'project-1',
			audience: 'project_members',
			status: 'pending',
			title: 'Complete project audit',
			summary: 'Launch decision needs review.',
			risk_tier: 2,
			action_kinds: ['open', 'resolve'],
			created_at: '2026-07-04T12:00:00.000Z'
		};
		mocks.syncInboxItemForSource.mockResolvedValue(inboxItem);
		const { supabase } = createSupabaseMock({
			inbox_items: [inboxItem],
			project_audits: [
				{
					id: 'audit-1',
					project_id: 'project-1',
					loop_run_id: 'run-1',
					status: 'ready',
					trigger_reason: 'burst',
					delivery_confidence: 'yellow',
					summary: 'Launch decision needs review.',
					generated_suggestion_count: 3,
					unresolved_suggestion_count: 2,
					created_at: '2026-07-04T11:00:00.000Z',
					finished_at: '2026-07-04T11:10:00.000Z'
				}
			],
			project_loop_runs: [
				{
					id: 'run-1',
					project_id: 'project-1',
					trigger_reason: 'burst',
					status: 'completed',
					summary: 'Audit complete',
					brief: null,
					suggestion_count: 3,
					created_at: '2026-07-04T11:00:00.000Z',
					finished_at: '2026-07-04T11:10:00.000Z'
				}
			],
			onto_projects: [{ id: 'project-1', name: 'Launch' }]
		});

		const result = await listInboxItems({
			supabase,
			admin: supabase,
			userId: 'user-1',
			status: 'pending',
			sourceType: 'project_audit',
			limit: 20,
			includePayload: true
		});

		expect(result.items[0]).toMatchObject({
			source_type: 'project_audit',
			project: { id: 'project-1', name: 'Launch' },
			can_decide: false,
			decision_disabled_reason: 'Open the audit packet to review recommendations',
			source_payload: {
				id: 'audit-1',
				status: 'ready',
				loop_run_id: 'run-1'
			},
			source_context: {
				project_loop_run: {
					id: 'run-1',
					trigger_reason: 'burst'
				},
				project_audit: {
					id: 'audit-1',
					role: null,
					delivery_confidence: 'yellow',
					unresolved_suggestion_count: 2
				}
			}
		});
	});

	it('backfills complete audit packets without recreating linked child suggestion inbox rows', async () => {
		mocks.syncInboxItemForSource.mockImplementation(
			async ({ sourceType, sourceRefId }: { sourceType: string; sourceRefId: string }) => ({
				source_type: sourceType,
				source_ref_id: sourceRefId,
				status: 'pending'
			})
		);
		const { supabase, state } = createSupabaseMock({
			project_suggestions: [
				{
					id: 'suggestion-linked',
					project_id: 'project-1',
					status: 'pending',
					title: 'Audit child'
				},
				{
					id: 'suggestion-standalone',
					project_id: 'project-1',
					status: 'pending',
					title: 'Standalone suggestion'
				}
			],
			project_audit_suggestions: [
				{
					audit_id: 'audit-1',
					suggestion_id: 'suggestion-linked',
					role: 'recommended_action'
				}
			],
			project_audits: [
				{
					id: 'audit-1',
					project_id: 'project-1',
					status: 'ready',
					created_at: '2026-07-04T11:00:00.000Z'
				}
			],
			inbox_items: [
				{
					id: 'inbox-linked',
					source_type: 'project_suggestion',
					source_ref_id: 'suggestion-linked',
					status: 'pending',
					project_id: 'project-1'
				}
			]
		});

		await listInboxItems({
			supabase,
			admin: supabase,
			userId: 'user-1',
			status: 'pending',
			projectId: 'project-1',
			limit: 20
		});

		expect(mocks.syncInboxItemForSource).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceType: 'project_suggestion',
				sourceRefId: 'suggestion-standalone'
			})
		);
		expect(mocks.syncInboxItemForSource).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceType: 'project_audit',
				sourceRefId: 'audit-1'
			})
		);
		expect(mocks.syncInboxItemForSource).not.toHaveBeenCalledWith(
			expect.objectContaining({
				sourceType: 'project_suggestion',
				sourceRefId: 'suggestion-linked'
			})
		);
		expect(state.tables.inbox_items[0]).toMatchObject({
			status: 'expired',
			source_status: 'grouped_into_project_audit'
		});
	});
});
