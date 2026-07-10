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
});
