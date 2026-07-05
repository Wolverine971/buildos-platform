// apps/web/src/lib/server/inbox.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	syncInboxItemForSource: vi.fn()
}));

vi.mock('@buildos/shared-agent-ops/inbox-index', () => ({
	syncInboxItemForSource: mocks.syncInboxItemForSource
}));

import { listInboxItems, sortInboxRowsForReview } from './inbox.service';

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
	private updatePayload: Row | null = null;
	private rowLimit: number | null = null;

	constructor(
		private readonly state: MockState,
		private readonly table: string
	) {}

	select() {
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

	not() {
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
		const rows = (this.state.tables[this.table] ?? []).filter((row) =>
			matches(row, this.filters, this.inFilters)
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

	then(resolve: (value: { data: Row[]; error: null }) => unknown) {
		this.state.operations.push({
			table: this.table,
			action: this.action,
			payload: this.updatePayload ?? undefined,
			filters: [...this.filters],
			inFilters: [...this.inFilters]
		});
		return Promise.resolve(resolve({ data: this.selectRows(), error: null }));
	}
}

function createSupabaseMock(tables: Record<string, Row[]>) {
	const state: MockState = { tables, operations: [] };
	const supabase = {
		from: vi.fn((table: string) => new QueryBuilderMock(state, table))
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
});
