// apps/web/src/lib/components/project/v2/ProjectEntitySearchCombobox.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import ProjectEntitySearchCombobox from './ProjectEntitySearchCombobox.svelte';

const PROJECT_ID = '31021625-1377-4715-9fb4-f93102974628';

function renderSearch(onSelectEntity = vi.fn()) {
	render(ProjectEntitySearchCombobox, {
		props: {
			projectId: PROJECT_ID,
			scope: 'work',
			variant: 'toolbar',
			placeholder: 'Search tasks...',
			onSelectEntity
		}
	});
	return onSelectEntity;
}

async function advanceSearch(milliseconds: number) {
	await vi.advanceTimersByTimeAsync(milliseconds);
	await tick();
}

describe('ProjectEntitySearchCombobox', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('returns and opens a project task match', async () => {
		global.fetch = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					success: true,
					data: {
						total_returned: 1,
						maybe_more: false,
						results: [
							{
								type: 'task',
								id: 'twitter-task',
								project_id: PROJECT_ID,
								title: 'Twitter brand kit',
								snippet: 'Create three rollout templates.',
								score: 0.9,
								state_key: 'todo',
								type_key: 'task.execute'
							}
						]
					}
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		) as typeof fetch;
		const onSelectEntity = renderSearch();

		await fireEvent.input(screen.getByRole('combobox', { name: 'Search tasks...' }), {
			target: { value: 'twitter' }
		});
		await tick();
		await advanceSearch(181);
		await tick();

		expect(global.fetch).toHaveBeenCalledWith(
			'/api/onto/search',
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
		expect(screen.getByRole('option', { name: /Twitter brand kit/ })).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('option', { name: /Twitter brand kit/ }));
		expect(onSelectEntity).toHaveBeenCalledWith('task', 'twitter-task');
	});

	it('runs a fresh request when one valid query replaces another', async () => {
		global.fetch = vi.fn((input, init) => {
			expect(String(input)).toBe('/api/onto/search');
			const body = JSON.parse(String(init?.body)) as { query: string };
			const title =
				body.query === 'twitter' ? 'Twitter brand kit' : 'Work on reactivation emails';
			return Promise.resolve(
				new Response(
					JSON.stringify({
						success: true,
						data: {
							total_returned: 1,
							maybe_more: false,
							results: [
								{
									type: 'task',
									id: `${body.query}-task`,
									project_id: PROJECT_ID,
									title,
									snippet: title,
									score: 0.9,
									state_key: 'todo',
									type_key: 'task.execute'
								}
							]
						}
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
			);
		}) as typeof fetch;
		renderSearch();
		const input = screen.getByRole('combobox', { name: 'Search tasks...' });

		await fireEvent.input(input, { target: { value: 'twitter' } });
		await tick();
		await advanceSearch(181);
		expect(screen.getByRole('option', { name: /Twitter brand kit/ })).toBeInTheDocument();

		await fireEvent.input(input, { target: { value: 'reactivation' } });
		await tick();
		await advanceSearch(181);

		expect(global.fetch).toHaveBeenCalledTimes(2);
		expect(
			screen.getByRole('option', { name: /Work on reactivation emails/ })
		).toBeInTheDocument();
		expect(screen.queryByRole('option', { name: /Twitter brand kit/ })).not.toBeInTheDocument();
	});

	it('ends a stalled search with a retryable timeout instead of spinning forever', async () => {
		global.fetch = vi.fn((input, init) => {
			expect(String(input)).toBe('/api/onto/search');
			return new Promise<Response>((...controls) => {
				const reject = controls[1];
				init?.signal?.addEventListener('abort', () => {
					reject(new DOMException('The operation was aborted.', 'AbortError'));
				});
			});
		}) as typeof fetch;
		renderSearch();

		await fireEvent.input(screen.getByRole('combobox', { name: 'Search tasks...' }), {
			target: { value: 'twitter' }
		});
		await tick();
		await advanceSearch(181);
		expect(screen.getByText('Searching project...')).toBeInTheDocument();

		await advanceSearch(5_000);

		expect(screen.queryByText('Searching project...')).not.toBeInTheDocument();
		expect(screen.getByRole('alert')).toHaveTextContent(
			'Search is taking too long. Please try again.'
		);
		expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
	});
});
