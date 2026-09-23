// apps/web/src/lib/components/chat/ContextSelectionScreen.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ContextSelectionScreen from './ContextSelectionScreen.svelte';
import { clearProjectSelectionBrowserCache } from './project-selector-browser';

function okJson(payload: Record<string, unknown>) {
	return Promise.resolve({
		ok: true,
		status: 200,
		json: async () => payload
	} as Response);
}

describe('ContextSelectionScreen', () => {
	beforeEach(() => {
		clearProjectSelectionBrowserCache();
		global.fetch = vi.fn((input: RequestInfo | URL) => {
			const url = new URL(String(input), 'http://localhost');
			const search = url.searchParams.get('search');
			const projects =
				search === 'apollo'
					? [
							{
								id: 'project-1',
								name: 'Apollo',
								state_key: 'active',
								type_key: 'project.product',
								task_count: 4
							}
						]
					: [
							{
								id: 'project-1',
								name: 'Apollo',
								state_key: 'active',
								type_key: 'project.product',
								task_count: 4
							},
							{
								id: 'project-2',
								name: 'Hermes',
								state_key: 'planning',
								type_key: 'project.ops',
								task_count: 2
							},
							{
								id: 'project-3',
								name: 'Paused Project',
								state_key: 'paused',
								type_key: 'project.ops',
								task_count: 9
							}
						];

			return okJson({
				success: true,
				data: { projects }
			});
		}) as typeof fetch;
		vi.clearAllMocks();
	});

	it('holds a skeleton until the list loads, then uses server search in project selection', async () => {
		render(ContextSelectionScreen);

		// No project-count guesswork before the list arrives: skeleton, not cards.
		expect(screen.getByRole('status', { name: /loading your projects/i })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /project chat/i })).toBeNull();
		expect(global.fetch).toHaveBeenCalledTimes(1);

		await fireEvent.click(await screen.findByRole('button', { name: /project chat/i }));
		expect(screen.queryByRole('status', { name: /loading your projects/i })).toBeNull();

		await screen.findByText('Apollo');
		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(screen.queryByText('Hermes')).not.toBeNull();
		expect(screen.queryByText('Paused Project')).toBeNull();
		expect(String((global.fetch as any).mock.calls[0][0])).toContain(
			'/api/onto/projects?limit=24'
		);

		const searchInput = await screen.findByLabelText(/search projects/i);
		await fireEvent.input(searchInput, { target: { value: 'apollo' } });

		await waitFor(() => {
			expect((global.fetch as any).mock.calls.length).toBeGreaterThanOrEqual(2);
		});
		expect(String((global.fetch as any).mock.calls.at(-1)[0])).toContain(
			'/api/onto/projects?limit=50&search=apollo'
		);
	});

	it('does not fetch while inactive and loads once it becomes active', async () => {
		const view = render(ContextSelectionScreen, { props: { active: false } });

		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(global.fetch).not.toHaveBeenCalled();

		await view.rerender({ active: true });
		await screen.findByRole('button', { name: /project chat/i });
		expect(global.fetch).toHaveBeenCalledTimes(1);

		// Hiding and re-showing within the freshness window reuses the list.
		await view.rerender({ active: false });
		await view.rerender({ active: true });
		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(screen.getByRole('button', { name: /project chat/i })).toBeInTheDocument();
	});

	it('goes straight from the skeleton to the first-project view for new users', async () => {
		global.fetch = vi.fn(() =>
			okJson({ success: true, data: { projects: [] } })
		) as typeof fetch;

		render(ContextSelectionScreen);

		expect(screen.getByRole('status', { name: /loading your projects/i })).toBeInTheDocument();
		expect(screen.queryByText(/what do you want to work on/i)).toBeNull();

		await screen.findByText(/start with your first project/i);
		expect(screen.queryByText(/what do you want to work on/i)).toBeNull();
	});

	it('reuses the cached default project list across remounts', async () => {
		const first = render(ContextSelectionScreen);

		await fireEvent.click(await screen.findByRole('button', { name: /project chat/i }));
		await screen.findByText('Apollo');
		expect(global.fetch).toHaveBeenCalledTimes(1);

		first.unmount();

		render(ContextSelectionScreen);
		await fireEvent.click(await screen.findByRole('button', { name: /project chat/i }));
		await screen.findByText('Apollo');

		expect(global.fetch).toHaveBeenCalledTimes(1);
	});
});
