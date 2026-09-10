// apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ProjectsCaptureStep from './ProjectsCaptureStep.svelte';
import { readOnboardingDraft, writeOnboardingDraft } from '$lib/utils/onboarding-state';

const { check } = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('$lib/components/agent/project-creation-recovery', () => ({ checkProjectCreation: check }));
vi.mock('$lib/components/agent/AgentChatModal.svelte', async () => ({
	default: (await import('./ProjectCreationChat.test-harness.svelte')).default
}));
vi.mock('$lib/services/calendar-analysis-notification.bridge', () => ({
	startCalendarAnalysis: vi.fn()
}));
vi.mock('$lib/services/loop-telemetry', () => ({ trackLoopEvent: vi.fn() }));
// jsdom has no Web Animations API; transitions are unrelated to this handoff contract.
vi.mock('svelte/transition', () => ({
	fade: () => ({ duration: 0 }),
	scale: () => ({ duration: 0 })
}));

const packet = {
	project: {
		id: 'saved-project',
		name: 'A saved project',
		description: 'A useful first structure.',
		next_step_short: 'Write the brief'
	},
	start_here: null,
	counts: { goals: 1, tasks: 2, documents: 0, plans: 0, milestones: 0 },
	sample_entities: []
};

describe('onboarding project creation handoff', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
		check.mockResolvedValue({ status: 'review' });
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url) =>
				Response.json(
					String(url).includes('activation-packet')
						? { success: true, data: packet }
						: { connected: false }
				)
			)
		);
	});

	it('preserves the original session after minimize and resumes without resending the draft', async () => {
		render(ProjectsCaptureStep, {
			userId: 'user',
			onNext: vi.fn(),
			onProjectsCreated: vi.fn()
		});
		await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Launch my idea' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Shape my first project' }));
		await screen.findByText('Auto send: true');
		await fireEvent.click(screen.getByRole('button', { name: 'Minimize setup' }));
		await screen.findByText(/No saved project was found yet/);
		expect(screen.getByRole('textbox')).toHaveValue('Launch my idea');
		expect(screen.getByRole('button', { name: 'Shape my first project' })).toBeDisabled();
		expect(readOnboardingDraft('user', 'capture')).toMatchObject({
			creationSessionId: 'creation-session',
			submittedSource: 'Launch my idea'
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Resume setup chat' }));
		await screen.findByText('Session: creation-session');
		expect(screen.getByText('Auto send: false')).toBeInTheDocument();
		expect(screen.getByText('Draft: none')).toBeInTheDocument();
	});

	it('recovers a completed project after reload and persists the onboarding milestone', async () => {
		writeOnboardingDraft('user', 'capture', {
			draft: 'Launch my idea',
			submittedSource: 'Launch my idea',
			creationSessionId: 'creation-session'
		});
		check.mockResolvedValue({ status: 'saved', projectIds: ['saved-project'] });
		const onProjectsCreated = vi.fn();
		render(ProjectsCaptureStep, { userId: 'user', onNext: vi.fn(), onProjectsCreated });
		await screen.findByText('A saved project');
		await waitFor(() =>
			expect(onProjectsCreated).toHaveBeenCalledWith(
				['saved-project'],
				expect.objectContaining({ tasks: 2, goals: 1 })
			)
		);
		expect(readOnboardingDraft('user', 'capture')).toMatchObject({
			phase: 'receipt',
			creationSessionId: null,
			draft: '',
			source: 'Launch my idea'
		});
	});
});
