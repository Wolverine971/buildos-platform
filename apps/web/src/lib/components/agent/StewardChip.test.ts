// apps/web/src/lib/components/agent/StewardChip.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import StewardChip from './StewardChip.svelte';

const toastMocks = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('$lib/stores/toast.store', () => ({ toastService: toastMocks }));

function statusResponse(active = true): Response {
	const response = new Response(null, { status: 200 });
	vi.spyOn(response, 'json').mockResolvedValue({
		data: { enabled: true, available: true, active }
	});
	return response;
}

function pendingResponse() {
	let resolve!: (response: Response) => void;
	const promise = new Promise<Response>((done) => (resolve = done));
	return { promise, resolve };
}

async function finishResponse(request: ReturnType<typeof pendingResponse>, active: boolean) {
	const response = statusResponse(active);
	request.resolve(response);
	await waitFor(() => expect(response.json).toHaveBeenCalled());
	await tick();
}

const activeLabel = 'steward mode on, switch to standard chat';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	toastMocks.error.mockReset();
});

describe('StewardChip project changes during a request', () => {
	it('loads the new project while the previous project toggle is pending', async () => {
		const previousToggle = pendingResponse();
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
			init?.method === 'POST' ? previousToggle.promise : statusResponse()
		);
		vi.stubGlobal('fetch', fetchMock);
		const view = render(StewardChip, { projectId: 'project-a' });
		await fireEvent.click(await screen.findByRole('button', { name: activeLabel }));

		await view.rerender({ projectId: 'project-b' });
		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				'/api/onto/projects/project-b/steward',
				expect.anything()
			)
		);
		expect(await screen.findByRole('button', { name: activeLabel })).toBeEnabled();

		await finishResponse(previousToggle, false);
		expect(screen.getByRole('button', { name: activeLabel })).toBeEnabled();
	});

	it('ignores a stale toggle even after returning to the same project', async () => {
		const previousToggle = pendingResponse();
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) =>
				init?.method === 'POST' ? previousToggle.promise : statusResponse()
			)
		);
		const view = render(StewardChip, { projectId: 'project-a' });
		await fireEvent.click(await screen.findByRole('button', { name: activeLabel }));
		await view.rerender({ projectId: 'project-b' });
		await view.rerender({ projectId: 'project-a' });
		await screen.findByRole('button', { name: activeLabel });

		await finishResponse(previousToggle, false);
		expect(screen.getByRole('button', { name: activeLabel })).toBeEnabled();
	});

	it('keeps the new project busy when the previous project request finishes', async () => {
		const previousToggle = pendingResponse();
		const currentToggle = pendingResponse();
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				if (init?.method !== 'POST') return statusResponse();
				return url.includes('/project-a/') ? previousToggle.promise : currentToggle.promise;
			})
		);
		const view = render(StewardChip, { projectId: 'project-a' });
		await fireEvent.click(await screen.findByRole('button', { name: activeLabel }));
		await view.rerender({ projectId: 'project-b' });
		await fireEvent.click(await screen.findByRole('button', { name: activeLabel }));

		await finishResponse(previousToggle, false);
		expect(screen.getByRole('button', { name: activeLabel })).toBeDisabled();

		currentToggle.resolve(statusResponse(false));
		expect(
			await screen.findByRole('button', { name: 'standard chat, switch steward on' })
		).toBeEnabled();
	});
});
