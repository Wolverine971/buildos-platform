// apps/web/src/lib/components/agent/AgentWorkForms.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { AgentOperativeRow } from '$lib/stores/agentOperativesStore';
import AgentOperativeEditorModal from './AgentOperativeEditorModal.svelte';
import AgentRunDispatchModal from './AgentRunDispatchModal.svelte';

const existingAutomation: AgentOperativeRow = {
	id: 'operative-1',
	user_id: 'user-1',
	label: 'Weekly project review',
	goal: 'Review the project and flag blockers.',
	instructions: 'Prioritize overdue tasks.',
	expected_output: null,
	context_type: 'global',
	project_id: null,
	scope_mode: 'read_write',
	allowed_ops: null,
	review_required: true,
	budgets: {},
	schedule_enabled: true,
	schedule_frequency: 'weekly',
	schedule_time_of_day: '09:30:00',
	schedule_day_of_week: 1,
	schedule_timezone: 'America/Los_Angeles',
	next_run_at: null,
	last_run_at: null,
	last_run_id: null,
	schedule_locked_at: null,
	schedule_error: null,
	created_at: '2026-07-14T12:00:00.000Z',
	updated_at: '2026-07-14T12:00:00.000Z'
};

describe('agent work form disclosure', () => {
	beforeEach(() => {
		Object.defineProperty(window, 'scrollTo', {
			configurable: true,
			writable: true,
			value: vi.fn()
		});
		Object.defineProperty(Element.prototype, 'animate', {
			configurable: true,
			writable: true,
			value: vi.fn(() => {
				let finishHandler: ((event: AnimationPlaybackEvent) => void) | null = null;
				return {
					cancel: vi.fn(),
					commitStyles: vi.fn(),
					currentTime: 0,
					finished: Promise.resolve(),
					play: vi.fn(),
					get onfinish() {
						return finishHandler;
					},
					set onfinish(handler: ((event: AnimationPlaybackEvent) => void) | null) {
						finishHandler = handler;
						if (handler)
							window.setTimeout(() => handler({} as AnimationPlaybackEvent), 0);
					}
				};
			})
		});
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('keeps run access and custom instructions collapsed behind a visible policy summary', async () => {
		const onClose = vi.fn();
		const view = render(AgentRunDispatchModal, {
			props: { isOpen: true, onClose }
		});
		await waitFor(() =>
			expect(screen.getByRole('dialog', { name: 'Start work' })).toHaveFocus()
		);

		const options = screen.getByRole('button', { name: /run options/i });
		expect(options).toHaveAttribute('aria-expanded', 'false');
		expect(options).toHaveTextContent('Review only');
		expect(screen.queryByLabelText('Instructions')).not.toBeInTheDocument();

		await fireEvent.click(options);

		expect(options).toHaveAttribute('aria-expanded', 'true');
		expect(screen.getByLabelText('Instructions')).toBeInTheDocument();
		expect(screen.getByText('Ask before applying')).toBeInTheDocument();

		await view.rerender({ isOpen: false, onClose });
		await waitFor(() =>
			expect(screen.queryByRole('dialog', { name: 'Start work' })).toBeNull()
		);
	});

	it('shows the schedule immediately but discloses timezone and access as advanced options', async () => {
		const onClose = vi.fn();
		const view = render(AgentOperativeEditorModal, {
			props: { isOpen: true, onClose }
		});
		await waitFor(() =>
			expect(screen.getByRole('dialog', { name: 'New automation' })).toHaveFocus()
		);

		const options = screen.getByRole('button', { name: /automation options/i });
		expect(options).toHaveAttribute('aria-expanded', 'false');
		expect(screen.getByText('Schedule')).toBeInTheDocument();
		expect(screen.queryByLabelText('Timezone')).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Schedule' }));
		expect(screen.getByText(/Times use/)).toBeInTheDocument();
		expect(screen.queryByLabelText('Timezone')).not.toBeInTheDocument();

		await fireEvent.click(options);

		expect(screen.getByLabelText('Timezone')).toBeInTheDocument();
		expect(screen.getByText('Access policy')).toBeInTheDocument();

		await view.rerender({ isOpen: false, onClose });
		await waitFor(() =>
			expect(screen.queryByRole('dialog', { name: 'New automation' })).toBeNull()
		);
	});

	it('automatically reveals saved non-default access, timezone, and instructions', async () => {
		const onClose = vi.fn();
		const view = render(AgentOperativeEditorModal, {
			props: { isOpen: true, operative: existingAutomation, onClose }
		});
		await waitFor(() =>
			expect(screen.getByRole('dialog', { name: 'Edit automation' })).toHaveFocus()
		);

		const options = screen.getByRole('button', { name: /automation options/i });
		expect(options).toHaveAttribute('aria-expanded', 'true');
		expect(options).toHaveTextContent('approval required');
		expect(screen.getByLabelText('Timezone')).toHaveValue('America/Los_Angeles');
		expect(screen.getByLabelText('Instructions')).toHaveValue('Prioritize overdue tasks.');

		await view.rerender({ isOpen: false, operative: existingAutomation, onClose });
		await waitFor(() =>
			expect(screen.queryByRole('dialog', { name: 'Edit automation' })).toBeNull()
		);
	});
});
