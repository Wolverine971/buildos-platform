// apps/web/src/routes/projects/[id]/ProjectProgressOverview.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Milestone, Project, Risk } from '$lib/types/onto';
import type { ProjectTasksCoverage } from '$lib/types/project-full-data';
import ProjectProgressOverview from './ProjectProgressOverview.svelte';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const MILESTONE_ID = '33333333-3333-4333-8333-333333333333';

const tasksCoverage: ProjectTasksCoverage = {
	scope: 'all',
	as_of: '2026-08-26T12:00:00.000Z',
	complete: true,
	returned: 10,
	total: 10,
	buckets: {
		backlog: { returned: 1, total: 1, complete: true },
		in_progress: { returned: 2, total: 2, complete: true },
		scheduled: { returned: 1, total: 1, complete: true },
		overdue: { returned: 1, total: 1, complete: true },
		blocked: { returned: 1, total: 1, complete: true },
		done: { returned: 4, total: 4, complete: true }
	}
};

const project = {
	id: PROJECT_ID,
	name: 'Launch project',
	type_key: 'project',
	state_key: 'active',
	props: {},
	start_at: '2026-07-01T12:00:00.000Z',
	end_at: '2026-10-31T12:00:00.000Z',
	created_by: '22222222-2222-4222-8222-222222222222',
	created_at: '2026-07-01T12:00:00.000Z',
	updated_at: '2026-08-26T12:00:00.000Z'
} as Project;

const milestone = {
	id: MILESTONE_ID,
	project_id: PROJECT_ID,
	title: 'Public launch',
	state_key: 'in_progress',
	due_at: '2026-09-15T12:00:00.000Z',
	props: {},
	created_by: '22222222-2222-4222-8222-222222222222',
	created_at: '2026-07-01T12:00:00.000Z',
	updated_at: '2026-08-26T12:00:00.000Z'
} as Milestone;

const highRisk = {
	id: '44444444-4444-4444-8444-444444444444',
	project_id: PROJECT_ID,
	title: 'Approval delay',
	state_key: 'identified',
	impact: 'high',
	props: {},
	created_by: '22222222-2222-4222-8222-222222222222',
	created_at: '2026-07-01T12:00:00.000Z',
	updated_at: '2026-08-26T12:00:00.000Z'
} as Risk;

afterEach(() => {
	cleanup();
});

describe('ProjectProgressOverview', () => {
	it('shows exact task metrics and makes the chart and milestones operational', async () => {
		const onOpenTasks = vi.fn();
		const onOpenMilestone = vi.fn();

		render(ProjectProgressOverview, {
			props: {
				project,
				tasksCoverage,
				goals: [],
				plans: [],
				milestones: [milestone],
				risks: [highRisk],
				onOpenTasks,
				onOpenMilestone
			}
		});

		expect(screen.getByText('40%')).toBeInTheDocument();
		expect(screen.getByText('4 of 10 tracked tasks are done.')).toBeInTheDocument();
		expect(screen.getByText('Needs attention')).toBeInTheDocument();
		expect(screen.getByText('1 overdue · 1 blocked · 1 high-impact risk')).toBeInTheDocument();

		await fireEvent.click(
			screen.getByRole('button', {
				name: 'Open Tasks. 40% complete, 4 of 10 tasks.'
			})
		);
		expect(onOpenTasks).toHaveBeenCalledOnce();

		await fireEvent.click(
			screen.getByRole('button', {
				name: /Open milestone Public launch, In progress, Sep 15/
			})
		);
		expect(onOpenMilestone).toHaveBeenCalledWith(MILESTONE_ID);
	});
});
