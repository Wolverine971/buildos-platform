// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCompleteProjectTasksCoverage } from '$lib/utils/project-task-board';
import ProjectWorkspacePrototype from './ProjectWorkspacePrototype.svelte';

vi.mock('$app/navigation', () => ({
	pushState: vi.fn(),
	replaceState: vi.fn()
}));

vi.mock('$app/state', () => ({
	page: { state: {} }
}));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const LONG_NAME =
	'International multi-market research, launch operations, customer migration, partner enablement, and post-launch learning program';
const LONG_BRIEF = `Build a durable operating system for a complex launch spanning product, research, partnerships, customer migration, and post-launch learning. The team needs one place to understand the decision, the current constraint, and what changes next.

The work crosses several owners and time zones. This brief deliberately contains enough detail to test whether the page preserves scan speed without hiding the full context from people who need it.

Success means the team can see the current objective, understand the sequence of commitments, and recover the reasoning behind important changes without scheduling another status meeting.`;

function projectData(overrides: Record<string, unknown> = {}) {
	return {
		skeleton: false,
		projectId: PROJECT_ID,
		access: {
			canEdit: true,
			canAdmin: true,
			canInvite: true,
			canViewLogs: true,
			isOwner: true,
			isAuthenticated: true,
			currentActorId: '22222222-2222-4222-8222-222222222222'
		},
		project: {
			id: PROJECT_ID,
			name: 'Project',
			description: null,
			state_key: 'active',
			type_key: 'project',
			next_step_short: null,
			start_at: '2026-07-01T12:00:00.000Z',
			end_at: '2027-02-28T12:00:00.000Z',
			doc_structure: null,
			props: {},
			icon_svg: null,
			icon_concept: null,
			created_by: '22222222-2222-4222-8222-222222222222',
			created_at: '2026-07-01T12:00:00.000Z',
			updated_at: '2026-07-22T12:00:00.000Z'
		},
		tasks: [],
		tasks_coverage: createCompleteProjectTasksCoverage([]),
		documents: [],
		goals: [],
		plans: [],
		milestones: [],
		risks: [],
		events: [],
		context_document: null,
		images: [],
		...overrides
	};
}

function goals(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		id: `goal-${index}`,
		name: `Goal ${index + 1}`,
		state_key: 'active',
		target_date: '2027-01-15T12:00:00.000Z',
		deleted_at: null
	}));
}

function plans(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		id: `plan-${index}`,
		name: `Plan ${index + 1}`,
		description: 'Coordinate the launch workstreams.',
		state_key: 'active',
		deleted_at: null
	}));
}

describe('ProjectWorkspacePrototype edge states', () => {
	beforeEach(() => {
		window.history.replaceState({}, '', '/workspace?view=overview');
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('constrains long identity text and progressively discloses a long brief', async () => {
		const { container } = render(ProjectWorkspacePrototype, {
			props: {
				data: projectData({
					project: {
						...projectData().project,
						name: LONG_NAME,
						description: LONG_BRIEF
					}
				}) as any
			}
		});

		await waitFor(() => {
			expect(screen.getByRole('tabpanel', { name: 'Overview' })).toBeInTheDocument();
		});

		const title = screen.getByRole('heading', { level: 1, name: LONG_NAME });
		expect(title).toHaveClass('min-w-0', 'flex-1', 'truncate');
		expect(document.title).toBe(`${LONG_NAME} · BuildOS`);

		const brief = container.querySelector('.overview-brief p.mt-2');
		expect(brief).not.toBeNull();
		const toggle = screen.getByRole('button', { name: 'Read full brief' });
		expect(brief).toHaveClass('line-clamp-5');
		expect(toggle).toHaveAttribute('aria-expanded', 'false');

		await fireEvent.click(toggle);
		expect(brief).not.toHaveClass('line-clamp-5');
		expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
	});

	it('keeps dense direction lists curated until the user asks for all items', async () => {
		render(ProjectWorkspacePrototype, {
			props: {
				data: projectData({ goals: goals(12), plans: plans(8) }) as any
			}
		});

		await waitFor(() => {
			expect(screen.getByText('12 goals · 8 plans')).toBeInTheDocument();
		});

		expect(
			screen.getByRole('button', { name: 'Goal 5 0 milestones · target Jan 15' })
		).toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'Goal 6 0 milestones · target Jan 15' })
		).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Show all 12 goals' }));
		expect(
			screen.getByRole('button', { name: 'Goal 12 0 milestones · target Jan 15' })
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Show fewer goals' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
	});

	it('uses flat placeholders for an empty Overview', async () => {
		const { container } = render(ProjectWorkspacePrototype, {
			props: { data: projectData() as any }
		});

		await waitFor(() => {
			expect(screen.getByText('No active goals yet')).toBeInTheDocument();
		});

		const emptyRows = container.querySelectorAll('.empty-row');
		expect(emptyRows).toHaveLength(5);
		expect(container.querySelector('.empty-compact')).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('tab', { name: 'Docs 0' }));
		await waitFor(() => {
			expect(screen.getByRole('tabpanel', { name: 'Docs 0' })).toBeInTheDocument();
		});
		expect(screen.queryByText('RECENTLY UPDATED')).not.toBeInTheDocument();
	});
});
