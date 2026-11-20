// apps/web/src/lib/services/agentRunsRealtime.start.test.ts
//
// The layout starts this service from more than one place while a page loads. Starting is
// async, so each call used to read the runs and open its own realtime channel. And every
// reconciling poll rewrote the store with the same rows, waking everything that reads it.
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('$app/environment', () => ({ browser: true }));

import {
	AgentRunsRealtimeService,
	agentRunsLoaded,
	agentRunsStore
} from './agentRunsRealtime.service';

const RUNS = [
	{ id: 'run-1', status: 'running', user_id: 'user-1', updated_at: '2026-11-20T10:00:00.000Z' },
	{ id: 'run-2', status: 'succeeded', user_id: 'user-1', updated_at: '2026-11-20T09:00:00.000Z' }
];

function supabase() {
	const channel = {
		on: vi.fn(() => channel),
		subscribe: vi.fn(async (onStatus: (status: string) => void) => onStatus('SUBSCRIBED'))
	};
	const client = { channel: vi.fn(() => channel), removeChannel: vi.fn(async () => undefined) };
	return client as unknown as SupabaseClient & typeof client;
}

/** Each read answers with fresh objects, as a real response does. */
function serveRuns(runs: () => unknown[] = () => RUNS) {
	const reads = vi.fn(
		async () =>
			new Response(JSON.stringify({ success: true, data: { runs: runs() } }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
	);
	vi.stubGlobal('fetch', reads);
	return reads;
}

describe('AgentRunsRealtimeService start', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(async () => {
		await AgentRunsRealtimeService.cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('reads the runs once and opens one channel when started twice at once', async () => {
		const reads = serveRuns();
		const client = supabase();

		await Promise.all([
			AgentRunsRealtimeService.initialize('user-1', client),
			AgentRunsRealtimeService.initialize('user-1', client)
		]);

		expect(reads).toHaveBeenCalledTimes(1);
		expect(client.channel).toHaveBeenCalledTimes(1);
		expect(get(agentRunsStore).size).toBe(2);
		expect(get(agentRunsLoaded)).toBe(true);

		// Already running: a later call does nothing.
		await AgentRunsRealtimeService.initialize('user-1', client);
		expect(reads).toHaveBeenCalledTimes(1);
	});

	it('tells readers nothing when a poll brings the same rows, and only then', async () => {
		let status = 'running';
		const reads = serveRuns(() => [
			{ ...RUNS[0], status },
			{ ...RUNS[1], status: 'needs_input' }
		]);
		await AgentRunsRealtimeService.initialize('user-1', supabase());
		const told = vi.fn();
		const stop = agentRunsStore.subscribe(told);
		told.mockClear(); // a store calls a new subscriber once with what it holds
		const held = get(agentRunsStore).get('run-2');

		// The channel is healthy, so the poll reconciles once a minute.
		await vi.advanceTimersByTimeAsync(60_000);
		expect(reads).toHaveBeenCalledTimes(2);
		expect(told).not.toHaveBeenCalled();

		status = 'paused';
		await vi.advanceTimersByTimeAsync(60_000);
		expect(reads).toHaveBeenCalledTimes(3);
		expect(told).toHaveBeenCalledTimes(1);
		expect(get(agentRunsStore).get('run-1')?.status).toBe('paused');
		// The run that did not change is the same object as before.
		expect(get(agentRunsStore).get('run-2')).toBe(held);
		stop();
	});

	it('drops a finished run after a minute and does not put it back on later polls', async () => {
		let finishedAt = RUNS[1]!.updated_at;
		serveRuns(() => [RUNS[0], { ...RUNS[1], updated_at: finishedAt }]);
		await AgentRunsRealtimeService.initialize('user-1', supabase());
		expect(get(agentRunsStore).has('run-2')).toBe(true);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(get(agentRunsStore).has('run-2')).toBe(false);

		const told = vi.fn();
		const stop = agentRunsStore.subscribe(told);
		told.mockClear();
		// The endpoint still lists it; four more polls leave the store alone.
		await vi.advanceTimersByTimeAsync(240_000);
		expect(told).not.toHaveBeenCalled();

		// The run itself changing (a retry, a late result) is news again.
		finishedAt = '2026-11-20T11:00:00.000Z';
		await vi.advanceTimersByTimeAsync(60_000);
		expect(get(agentRunsStore).has('run-2')).toBe(true);
		stop();
	});

	it('stops a start that a sign-out overtook', async () => {
		let answer!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)))
		);
		const client = supabase();
		const starting = AgentRunsRealtimeService.initialize('user-1', client);
		await vi.advanceTimersByTimeAsync(0);

		await AgentRunsRealtimeService.cleanup();
		answer(
			new Response(JSON.stringify({ success: true, data: { runs: [] } }), { status: 200 })
		);
		await starting;

		expect(client.channel).not.toHaveBeenCalled();
		expect(get(agentRunsLoaded)).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});
});
