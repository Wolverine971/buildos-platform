// apps/web/src/lib/components/projects/desktop/DesktopReader.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/paths', () => ({
	resolve: (route: string, params?: Record<string, string>) =>
		route.replace('[id]', params?.id ?? '').replace('[task_id]', params?.task_id ?? '')
}));
vi.mock('$lib/stores/toast.store', () => ({
	toastService: { success: vi.fn(), error: vi.fn() }
}));

import DesktopReader from './DesktopReader.svelte';

function ok(data: unknown) {
	return new Response(JSON.stringify({ success: true, data }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
	if (init?.method === 'PATCH') return ok({ task: { id: 't1', state_key: 'done' } });
	if (url.startsWith('/api/onto/tasks/t1/full'))
		return ok({
			task: {
				id: 't1',
				title: 'Ship the phone Today',
				description: '## Plan\n\n- **Fold** the details',
				state_key: 'in_progress',
				priority: 2,
				due_at: null,
				start_at: null,
				updated_at: '2026-10-06T12:00:00.000Z'
			}
		});
	throw new Error(`Unexpected fetch ${url}`);
});

function renderReader(extra: Record<string, unknown> = {}) {
	const onChanged = vi.fn();
	render(DesktopReader, {
		props: {
			item: { kind: 'task', id: 't1' },
			projectId: 'p1',
			canWrite: true,
			order: ['t1', 't2'],
			fallbackTitle: 'Ship the phone Today',
			layout: 'peek',
			listShown: true,
			chatOn: false,
			phone: false,
			onClose: vi.fn(),
			onStep: vi.fn(),
			onToggleFocus: vi.fn(),
			onToggleList: vi.fn(),
			onChat: vi.fn(),
			onChanged,
			...extra
		}
	});
	return { onChanged };
}

describe('DesktopReader on Today', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('names the task’s project where the list mixes projects', async () => {
		renderReader({ projectName: 'BuildOS Mobile' });

		await screen.findByRole('heading', { name: 'Plan' });
		expect(screen.getByRole('link', { name: 'BuildOS Mobile' })).toHaveAttribute(
			'href',
			'/projects/p1'
		);
	});

	it('reports a state change to a host that tracks it, instead of a full refresh', async () => {
		const onTaskState = vi.fn();
		const { onChanged } = renderReader({ onTaskState });

		await screen.findByRole('heading', { name: 'Plan' });
		await fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));

		await waitFor(() => expect(onTaskState).toHaveBeenCalledWith('t1', 'done', 'in_progress'));
		expect(onChanged).not.toHaveBeenCalled();
		const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
		expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ state_key: 'done' });
	});

	it('still announces changes through onChanged on the project page', async () => {
		const { onChanged } = renderReader();

		await screen.findByRole('heading', { name: 'Plan' });
		expect(screen.queryByRole('link', { name: 'BuildOS Mobile' })).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));

		await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
	});
});
