// apps/web/src/lib/server/project-audit-snapshot.service.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildProjectAuditMaturitySnapshot,
	classifyProjectAuditSize,
	isProjectAuditBaselineEligible
} from './project-audit-snapshot.service';

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
