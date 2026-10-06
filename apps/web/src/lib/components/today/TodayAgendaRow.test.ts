// apps/web/src/lib/components/today/TodayAgendaRow.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TodayAgendaRow from './TodayAgendaRow.svelte';

afterEach(() => {
	cleanup();
});

describe('TodayAgendaRow', () => {
	it('shows the linked project and opens task details without leaving Today', async () => {
		const onOpenTask = vi.fn();

		render(TodayAgendaRow, {
			props: {
				kind: 'task',
				title: 'Write launch plan',
				metaLabel: 'Due today',
				projectName: 'Launch Project',
				projectHref: '/projects/project-1',
				onChat: vi.fn(),
				onOpenTask,
				onToggleDone: vi.fn()
			}
		});

		expect(screen.getByRole('link', { name: 'Open project Launch Project' })).toHaveAttribute(
			'href',
			'/projects/project-1'
		);

		await fireEvent.click(
			screen.getByRole('button', { name: 'Open task details for "Write launch plan"' })
		);

		expect(onOpenTask).toHaveBeenCalledTimes(1);
	});

	it('keeps phone rows to open + chat: the done circle and pencil are wider-screen only', () => {
		render(TodayAgendaRow, {
			props: {
				kind: 'task',
				title: 'Write launch plan',
				onChat: vi.fn(),
				onOpenTask: vi.fn(),
				onToggleDone: vi.fn()
			}
		});

		expect(screen.getByRole('button', { name: 'Mark "Write launch plan" done' })).toHaveClass(
			'hidden',
			'sm:flex'
		);
		expect(screen.getByRole('button', { name: 'Edit task "Write launch plan"' })).toHaveClass(
			'hidden',
			'sm:flex'
		);
		expect(
			screen.getByRole('button', { name: 'Chat about "Write launch plan"' })
		).not.toHaveClass('hidden');
		// The title stretches over the row so a tap anywhere opens the task.
		expect(
			screen.getByRole('button', { name: 'Open task details for "Write launch plan"' })
		).toHaveClass('after:absolute', 'after:inset-0');
	});
});
