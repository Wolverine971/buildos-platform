// apps/web/src/lib/components/profile/CyclesTab.test.ts
// @vitest-environment jsdom

import type { CycleDefinition } from '@buildos/shared-types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CyclesTab from './CyclesTab.svelte';

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function dailyBriefCycle(overrides: Partial<CycleDefinition> = {}): CycleDefinition {
	return {
		id: 'cycle-1',
		user_id: 'user-1',
		label: 'Daily Brief',
		kind: 'daily_brief',
		state: 'paused',
		target: { type: 'user', project_id: null },
		triggers: [
			{
				id: 'trigger-1',
				cycle_id: 'cycle-1',
				type: 'schedule',
				schedule: {
					type: 'daily',
					time_of_day: '09:00',
					timezone: 'America/New_York'
				},
				state: 'active',
				version: 1,
				next_run_at: '2026-08-27T13:00:00.000Z',
				last_fired_at: null,
				created_at: '2026-08-26T12:00:00.000Z',
				updated_at: '2026-08-26T12:00:00.000Z',
				deleted_at: null
			}
		],
		config: {},
		policy: { overlap: 'skip', misfire: 'run_once', max_attempts: 3 },
		attention_policy: 'always',
		version: 1,
		next_run_at: '2026-08-27T13:00:00.000Z',
		last_run_at: null,
		last_run_id: null,
		last_error: null,
		created_at: '2026-08-26T12:00:00.000Z',
		updated_at: '2026-08-26T12:00:00.000Z',
		deleted_at: null,
		...overrides
	} as CycleDefinition;
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('CyclesTab', () => {
	it('shows a loading state while making one list request', async () => {
		let resolveRequest: (response: Response) => void = () => {};
		const fetcher = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveRequest = resolve;
				})
		);
		render(CyclesTab, { props: { executionAuthority: 'preview', fetcher } });

		expect(await screen.findByText('Loading Cycles…')).toBeTruthy();
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher).toHaveBeenCalledWith('/api/cycles');

		resolveRequest(jsonResponse({ success: true, data: { cycles: [] } }));
		await screen.findByText('No Cycles available yet');
	});

	it('renders the intentional empty state without an Add control', async () => {
		const fetcher = vi.fn(async () => jsonResponse({ success: true, data: { cycles: [] } }));
		render(CyclesTab, { props: { executionAuthority: 'preview', fetcher } });

		expect(await screen.findByText('No Cycles available yet')).toBeTruthy();
		expect(screen.queryByRole('button', { name: /add cycle/i })).toBeNull();
	});

	it('offers a recoverable Retry state', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ success: false, error: 'Unavailable' }, 503))
			.mockResolvedValueOnce(jsonResponse({ success: true, data: { cycles: [] } }));
		render(CyclesTab, { props: { executionAuthority: 'preview', fetcher } });

		expect(await screen.findByText('Cycles could not be loaded right now.')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
		expect(await screen.findByText('No Cycles available yet')).toBeTruthy();
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('renders populated preview rows truthfully without per-row history requests', async () => {
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			expect(String(input)).toBe('/api/cycles');
			return jsonResponse({
				success: true,
				data: {
					cycles: [
						dailyBriefCycle({ label: 'A very long Daily Brief label '.repeat(8) }),
						dailyBriefCycle({ id: 'cycle-2', label: 'Second brief' })
					]
				}
			});
		});
		render(CyclesTab, { props: { executionAuthority: 'preview', fetcher } });

		await waitFor(() => expect(screen.getAllByText('Preview')).toHaveLength(2));
		expect(screen.getAllByText('Not managing your schedule yet.')).toHaveLength(2);
		expect(screen.queryByText('Active')).toBeNull();
		expect(screen.queryByText(/^Next:/)).toBeNull();
		expect(screen.queryByText('generate_daily_brief')).toBeNull();
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('uses attention copy without exposing a raw worker error', async () => {
		const fetcher = vi.fn(async () =>
			jsonResponse({
				success: true,
				data: {
					cycles: [
						dailyBriefCycle({ last_error: 'generate_daily_brief queue lease expired' })
					]
				}
			})
		);
		render(CyclesTab, { props: { executionAuthority: 'preview', fetcher } });

		expect(await screen.findByText('Needs attention')).toBeTruthy();
		expect(screen.getByText('The latest recorded attempt needs attention.')).toBeTruthy();
		expect(screen.queryByText(/queue lease expired/)).toBeNull();
	});
});
