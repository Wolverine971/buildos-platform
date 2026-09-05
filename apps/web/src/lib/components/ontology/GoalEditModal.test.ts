// apps/web/src/lib/components/ontology/GoalEditModal.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GoalEditModal from './GoalEditModal.svelte';

describe('GoalEditModal saves', () => {
	beforeEach(() => {
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			value: vi.fn(() => ({
				matches: true,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn()
			}))
		});
		vi.stubGlobal('scrollTo', vi.fn());
		Object.defineProperty(Element.prototype, 'animate', {
			configurable: true,
			value: vi.fn(() => ({
				cancel: vi.fn(),
				commitStyles: vi.fn(),
				finished: Promise.resolve(),
				play: vi.fn()
			}))
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							data: {
								goal: {
									id: 'goal-1',
									project_id: 'project-1',
									name: 'Launch',
									description: 'Original',
									state_key: 'active',
									target_date: '2026-09-05T03:59:59Z',
									props: {}
								}
							}
						}),
						{ headers: { 'Content-Type': 'application/json' } }
					)
			)
		);
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('closes an unchanged goal without a write or refresh', async () => {
		const onClose = vi.fn();
		const onUpdated = vi.fn();
		render(GoalEditModal, { goalId: 'goal-1', projectId: 'project-1', onClose, onUpdated });
		await screen.findByDisplayValue('Launch');
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onUpdated).not.toHaveBeenCalled();
		expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(
			false
		);
	});

	it('preserves the target date and reports a scoped save after editing the description', async () => {
		const onSaved = vi.fn();
		const onUpdated = vi.fn();
		render(GoalEditModal, {
			goalId: 'goal-1',
			projectId: 'project-1',
			onClose: vi.fn(),
			onUpdated,
			onSaved
		});
		await screen.findByDisplayValue('Launch');
		await fireEvent.input(screen.getByDisplayValue('Original'), {
			target: { value: 'Edited' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
		expect(onUpdated).not.toHaveBeenCalled();
		const write = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
		expect(JSON.parse(String(write?.[1]?.body))).toEqual({ description: 'Edited' });
	});

	it.each([false, true])(
		'refreshes related changes on Save (goal edited: %s)',
		async (editGoal) => {
			const originalFetch = vi.mocked(fetch).getMockImplementation()!;
			vi.mocked(fetch).mockImplementation(async (input, init) => {
				if (String(input).startsWith('/api/onto/edges/linked?')) {
					return new Response(
						JSON.stringify({
							data: {
								linkedEntities: {
									milestones: [
										{
											id: 'milestone-1',
											title: 'Release',
											state_key: 'pending'
										}
									]
								}
							}
						}),
						{ headers: { 'Content-Type': 'application/json' } }
					);
				}
				return originalFetch(input, init);
			});
			const onSaved = vi.fn();
			const onUpdated = vi.fn();
			render(GoalEditModal, {
				goalId: 'goal-1',
				projectId: 'project-1',
				onClose: vi.fn(),
				onUpdated,
				onSaved
			});
			await screen.findByDisplayValue('Launch');
			await fireEvent.click(screen.getByRole('button', { name: 'Open Goal details' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Linked Entities' }));
			await fireEvent.click(await screen.findByRole('button', { name: 'Mark as complete' }));
			await waitFor(() =>
				expect(
					vi
						.mocked(fetch)
						.mock.calls.filter(([input]) =>
							String(input).startsWith('/api/onto/goals/goal-1/full')
						)
				).toHaveLength(2)
			);
			await screen.findByDisplayValue('Launch');
			if (editGoal) {
				await fireEvent.input(screen.getByDisplayValue('Original'), {
					target: { value: 'Edited' }
				});
			}
			await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
			await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
			expect(onSaved).not.toHaveBeenCalled();
		}
	);
});
