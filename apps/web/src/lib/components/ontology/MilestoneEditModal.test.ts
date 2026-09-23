// apps/web/src/lib/components/ontology/MilestoneEditModal.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MilestoneEditModal from './MilestoneEditModal.svelte';

describe('MilestoneEditModal saves', () => {
	const originalTimezone = process.env.TZ;

	beforeEach(() => {
		// East of UTC, local midnight falls on the previous UTC day. Reading the
		// stored due date with UTC getters moved it back a day on every save.
		process.env.TZ = 'Europe/Berlin';
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
								milestone: {
									id: 'milestone-1',
									project_id: 'project-1',
									title: 'Beta launch',
									description: 'Original',
									state_key: 'pending',
									type_key: 'milestone.default',
									// Local midnight of Sep 20 in Berlin (UTC+2).
									due_at: '2026-09-19T22:00:00.000Z',
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
		process.env.TZ = originalTimezone;
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('shows the local due day and sends only edited fields', async () => {
		const onUpdated = vi.fn();
		render(MilestoneEditModal, {
			milestoneId: 'milestone-1',
			projectId: 'project-1',
			onClose: vi.fn(),
			onUpdated
		});

		await screen.findByDisplayValue('Beta launch');
		expect(screen.getByDisplayValue('2026-09-20')).toBeTruthy();

		await fireEvent.input(screen.getByDisplayValue('Beta launch'), {
			target: { value: 'Public beta' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
		const write = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
		expect(JSON.parse(String(write?.[1]?.body))).toEqual({ title: 'Public beta' });
	});

	it('closes an unchanged milestone without a write', async () => {
		const onClose = vi.fn();
		render(MilestoneEditModal, {
			milestoneId: 'milestone-1',
			projectId: 'project-1',
			onClose
		});

		await screen.findByDisplayValue('Beta launch');
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(
			false
		);
	});
});
