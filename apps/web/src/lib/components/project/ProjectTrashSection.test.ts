// apps/web/src/lib/components/project/ProjectTrashSection.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectTrashSection from './ProjectTrashSection.svelte';

const { invalidateMock, toastSuccessMock } = vi.hoisted(() => ({
	invalidateMock: vi.fn(),
	toastSuccessMock: vi.fn()
}));

vi.mock('$app/navigation', () => ({ invalidate: invalidateMock }));
vi.mock('$lib/stores/toast.store', () => ({
	toastService: { success: toastSuccessMock, error: vi.fn() }
}));

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('ProjectTrashSection', () => {
	let trash: unknown[];
	const fetchMock = vi.fn();

	beforeEach(() => {
		trash = [];
		fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url === '/api/onto/projects/trash') {
				return json({ success: true, data: { projects: trash } });
			}
			if (url.endsWith('/restore') && init?.method === 'POST') {
				return json({
					success: true,
					data: { project_id: 'p-1', restored: true, items_restored: 3 }
				});
			}
			throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		vi.unstubAllGlobals();
	});

	it('stays hidden when the trash is empty', async () => {
		render(ProjectTrashSection);
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(screen.queryByText('Trash')).toBeNull();
	});

	it('lists deleted projects and restores one', async () => {
		trash = [
			{
				id: 'p-1',
				name: 'Garden plan',
				icon_emoji: { glyphs: ['🌱'], source: 'llm', ranked: [] },
				deleted_at: '2026-10-01T12:00:00.000Z',
				erase_after: '2026-10-31T12:00:00.000Z',
				member_count: 2
			},
			{
				id: 'p-2',
				name: 'Solo notes',
				icon_emoji: null,
				deleted_at: '2026-10-02T12:00:00.000Z',
				erase_after: '2026-11-01T12:00:00.000Z',
				member_count: 0
			}
		];
		render(ProjectTrashSection);

		expect(await screen.findByText('Garden plan')).toBeTruthy();
		expect(screen.getByText('🌱')).toBeTruthy();
		expect(screen.getByText(/· 2 collaborators/)).toBeTruthy();
		expect(screen.queryByText(/· 0 collaborators/)).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Restore Garden plan' }));

		await waitFor(() => expect(screen.queryByText('Garden plan')).toBeNull());
		expect(fetchMock).toHaveBeenCalledWith('/api/onto/projects/p-1/restore', {
			method: 'POST',
			credentials: 'same-origin'
		});
		expect(toastSuccessMock).toHaveBeenCalledWith('Garden plan is back');
		expect(invalidateMock).toHaveBeenCalledWith('ontology:projects');
		expect(screen.getByText('Solo notes')).toBeTruthy();
	});
});
