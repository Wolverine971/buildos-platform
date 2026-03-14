// apps/web/src/lib/components/agent/ProjectActionSelector.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ProjectActionSelector from './ProjectActionSelector.svelte';
import { clearProjectEntityBrowserCache } from './project-entity-browser';

function okJson(payload: unknown) {
	return Promise.resolve({
		ok: true,
		status: 200,
		json: async () => payload
	} as Response);
}

describe('ProjectActionSelector', () => {
	beforeEach(() => {
		clearProjectEntityBrowserCache();
		global.fetch = vi.fn((input: RequestInfo | URL) => {
			const url = new URL(String(input), 'http://localhost');
			const search = url.searchParams.get('search');
			const data =
				search === 'roadmap'
					? [{ id: 'task-2', name: 'Roadmap review', type: 'task', metadata: {} }]
					: [{ id: 'task-1', name: 'Kickoff', type: 'task', metadata: {} }];

			return okJson({ success: true, data });
		}) as typeof fetch;
		vi.clearAllMocks();
	});

	it('loads capped entity results and switches to server search when filtering', async () => {
		render(ProjectActionSelector, {
			props: {
				projectId: 'project-1',
				projectName: 'Apollo',
				onSelectAction: vi.fn(),
				onSelectFocus: vi.fn()
			}
		});

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledTimes(1);
		});
		expect(String((global.fetch as any).mock.calls[0][0])).toContain(
			'/api/onto/projects/project-1/entities?type=task&limit=24'
		);

		const filterInput = await screen.findByLabelText(/filter tasks/i);
		await fireEvent.input(filterInput, { target: { value: 'roadmap' } });

		await waitFor(() => {
			expect((global.fetch as any).mock.calls.length).toBeGreaterThanOrEqual(2);
		});
		expect(String((global.fetch as any).mock.calls.at(-1)[0])).toContain(
			'/api/onto/projects/project-1/entities?type=task&search=roadmap&limit=50'
		);
	});

	it('reuses cached entity results across remounts', async () => {
		const first = render(ProjectActionSelector, {
			props: {
				projectId: 'project-1',
				projectName: 'Apollo',
				onSelectAction: vi.fn(),
				onSelectFocus: vi.fn()
			}
		});

		await screen.findByText('Kickoff');
		expect(global.fetch).toHaveBeenCalledTimes(1);

		first.unmount();

		render(ProjectActionSelector, {
			props: {
				projectId: 'project-1',
				projectName: 'Apollo',
				onSelectAction: vi.fn(),
				onSelectFocus: vi.fn()
			}
		});

		await screen.findByText('Kickoff');
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});
});
