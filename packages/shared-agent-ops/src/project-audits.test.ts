// packages/shared-agent-ops/src/project-audits.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildProjectAuditMaturitySnapshot,
	classifyProjectAuditSize,
	evaluateProjectAuditTrigger,
	isProjectAuditBaselineEligible
} from './project-audits';

const NOW = new Date('2026-07-03T12:00:00.000Z');

function project(overrides: Record<string, unknown> = {}) {
	return {
		id: 'project-1',
		name: 'Audit Project',
		description: 'This project has a clear enough description to establish review intent.',
		state_key: 'active',
		created_at: '2026-06-01T00:00:00.000Z',
		updated_at: '2026-07-02T00:00:00.000Z',
		start_at: null,
		end_at: '2026-08-01T00:00:00.000Z',
		deleted_at: null,
		archived_at: null,
		...overrides
	} as any;
}

function activity(day: string, index: number) {
	return {
		entity_type: 'task',
		entity_id: `task-${index}`,
		action: 'updated',
		created_at: `${day}T12:00:00.000Z`
	};
}

describe('project audit maturity snapshot', () => {
	it('marks a substantive active project eligible and medium-sized', () => {
		const maturity = buildProjectAuditMaturitySnapshot({
			project: project(),
			documents: Array.from({ length: 5 }, (_, index) => ({
				id: `doc-${index}`,
				title: `Doc ${index}`,
				state_key: 'draft'
			})),
			tasks: Array.from({ length: 6 }, (_, index) => ({
				id: `task-${index}`,
				title: `Task ${index}`
			})),
			goals: [
				{ id: 'goal-1', name: 'Goal 1' },
				{ id: 'goal-2', name: 'Goal 2' }
			],
			milestones: [],
			risks: [],
			plans: [],
			events: [{ id: 'event-1' }, { id: 'event-2' }],
			recentActivity: [activity('2026-07-01', 1), activity('2026-07-02', 2)],
			now: NOW
		});

		expect(isProjectAuditBaselineEligible(maturity)).toBe(true);
		expect(maturity.content_thresholds_met).toBeGreaterThanOrEqual(3);
		expect(classifyProjectAuditSize(maturity)).toBe('medium');
	});

	it('keeps below-baseline reasons visible when manual bypass is used', () => {
		const maturity = buildProjectAuditMaturitySnapshot({
			project: project({
				description: '',
				created_at: '2026-07-01T00:00:00.000Z'
			}),
			documents: [],
			tasks: [],
			goals: [],
			milestones: [],
			risks: [],
			plans: [],
			events: [],
			recentActivity: [activity('2026-07-02', 1)],
			manualBypass: true,
			now: NOW
		});

		expect(isProjectAuditBaselineEligible(maturity)).toBe(false);
		expect(maturity.manual_bypass).toBe(true);
		expect(maturity.ineligible_reasons).toContain('project_too_new');
		expect(classifyProjectAuditSize(maturity)).toBe('small_eligible');
	});
});

/**
 * A read-only Supabase stand-in for evaluateProjectAuditTrigger: every query on a table
 * resolves to that table's rows (or the first row for maybeSingle), whatever its filters.
 */
function fakeAuditSupabase(tables: Record<string, Record<string, unknown>[]>) {
	const query = (rows: Record<string, unknown>[]) => {
		const chain: any = {};
		for (const method of ['select', 'eq', 'in', 'order', 'limit', 'gte', 'lt'])
			chain[method] = () => chain;
		chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
		chain.then = (resolve: any, reject: any) =>
			Promise.resolve({ data: rows, error: null }).then(resolve, reject);
		return chain;
	};
	return {
		from: (table: string) => query(tables[table] ?? []),
		rpc: async () => ({
			data: {
				// 5 documents + 6 tasks + 2 goals + 2 events = 15 records: a medium project.
				documents: Array.from({ length: 5 }, (_, index) => ({
					id: `doc-${index}`,
					title: `Doc ${index}`,
					state_key: 'draft'
				})),
				tasks: Array.from({ length: 6 }, (_, index) => ({
					id: `task-${index}`,
					title: `Task ${index}`
				})),
				goals: [
					{ id: 'goal-1', name: 'Goal 1' },
					{ id: 'goal-2', name: 'Goal 2' }
				],
				milestones: [],
				risks: [],
				plans: [],
				events: [{ id: 'event-1' }, { id: 'event-2' }]
			},
			error: null
		})
	} as any;
}

function changedRecords(count: number, day: string) {
	return Array.from({ length: count }, (_, index) => ({
		id: `log-${index}`,
		...activity(day, index),
		change_source: null,
		before_data: null,
		after_data: null
	}));
}

async function evaluateScheduled(recentActivity: Record<string, unknown>[]) {
	return evaluateProjectAuditTrigger({
		supabase: fakeAuditSupabase({
			onto_projects: [project()],
			onto_project_logs: recentActivity
		}),
		projectId: 'project-1',
		userId: 'user-1',
		triggerReason: 'scheduled',
		now: NOW
	});
}

describe('scheduled complete audit trigger', () => {
	it('skips a medium project with a handful of changes (no longer enough on its own)', async () => {
		// Two days of activity, four records changed: the old threshold (3 for medium) queued this.
		const result = await evaluateScheduled([
			...changedRecords(2, '2026-07-01'),
			...changedRecords(2, '2026-07-02').map((row, index) => ({
				...row,
				id: `log-b${index}`,
				entity_id: `task-${index + 2}`
			}))
		]);

		expect(result.snapshot?.sizeClass).toBe('medium');
		expect(result.evaluation.decision).toBe('skipped_no_activity');
		expect(result.evaluation.reason_summary).toContain('burst of change');
	});

	it('queues a medium project once the burst threshold is crossed', async () => {
		// 12 distinct records changed in the last 7 days crosses the medium burst bar.
		const rows = [
			...changedRecords(6, '2026-07-01'),
			...changedRecords(6, '2026-07-02').map((row, index) => ({
				...row,
				id: `log-b${index}`,
				entity_type: 'document',
				entity_id: `doc-extra-${index}`
			}))
		];
		const result = await evaluateScheduled(rows);

		expect(result.snapshot?.sizeClass).toBe('medium');
		expect(result.evaluation.decision).toBe('queued');
		expect(result.evaluation.reason_summary).toContain('burst of change');
	});
});
