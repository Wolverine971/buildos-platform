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
							}
						];

			return okJson({
				success: true,
				data: { projects }
			});
		}) as typeof fetch;
		vi.clearAllMocks();
	});

	it('lazy-loads projects only after entering project selection and uses server search', async () => {
		render(ContextSelectionScreen);

		expect(global.fetch).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: /project chat/i }));

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledTimes(1);
		});
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

	it('reuses the cached default project list across remounts', async () => {
		const first = render(ContextSelectionScreen);

		await fireEvent.click(screen.getByRole('button', { name: /project chat/i }));
		await screen.findByText('Apollo');
		expect(global.fetch).toHaveBeenCalledTimes(1);

		first.unmount();

		render(ContextSelectionScreen);
		await fireEvent.click(screen.getByRole('button', { name: /project chat/i }));
		await screen.findByText('Apollo');

		expect(global.fetch).toHaveBeenCalledTimes(1);
	});
});
