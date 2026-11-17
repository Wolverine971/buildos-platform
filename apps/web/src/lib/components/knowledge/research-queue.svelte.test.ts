// apps/web/src/lib/components/knowledge/research-queue.svelte.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeResearchQueue, RESEARCH_POLL_MS } from './research-queue.svelte';
import type { ResearchAllowance, ResearchRun, ResearchTarget } from './research-tray';

const allowance: ResearchAllowance = {
	spent_today: 0,
	daily_cap: 2,
	active_runs: 0,
	max_active_runs: 3,
	per_entry_usd: 0.03,
	run_max_usd: 1,
	max_per_run: 25,
	max_batch: 75
};

function target(id: string, status: ResearchTarget['status'], entity = id): ResearchTarget {
	return {
		id,
		run_id: 'run',
		entity_id: entity,
		name: id,
		kind: 'person',
		status,
		phase: null,
		summary: null,
		facts_added: status === 'done' ? 2 : 0,
		cost_usd: 0,
		error: null,
		instructions: null,
		finished_at: status === 'done' ? '2026-11-17T15:01:00Z' : null
	};
}

function run(id: string, status: ResearchRun['status'], targets: ResearchTarget[]): ResearchRun {
	return {
		id,
		status,
		title: 'Find more',
		created_at: '2026-11-17T15:00:00Z',
		finished_at: status === 'completed' ? '2026-11-17T15:02:00Z' : null,
		cost_usd: 0,
		budget_usd: 0.06,
		stalled: false,
		targets
	};
}

describe('KnowledgeResearchQueue', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('polls only while research is running, then tells the page what finished', async () => {
		const responses = [
			[run('r1', 'running', [target('a', 'running'), target('b', 'queued')])],
			[run('r1', 'running', [target('a', 'done'), target('b', 'running')])],
			[run('r1', 'completed', [target('a', 'done'), target('b', 'done')])]
		];
		const load = vi.fn(async () => ({ runs: responses.shift() ?? [], allowance }));
		const settled: string[][] = [];
		const queue = new KnowledgeResearchQueue({
			load,
			isHidden: () => false,
			onSettled: (targets) => settled.push(targets.map((t) => t.id))
		});
		queue.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(queue.live).toBe(true);
		expect(queue.byEntity.get('b')?.status).toBe('queued');

		await vi.advanceTimersByTimeAsync(RESEARCH_POLL_MS);
		await vi.advanceTimersByTimeAsync(RESEARCH_POLL_MS);
		expect(load).toHaveBeenCalledTimes(3);
		expect(settled).toEqual([['a'], ['b']]);
		expect(queue.live).toBe(false);

		// Idle: no more requests.
		await vi.advanceTimersByTimeAsync(RESEARCH_POLL_MS * 5);
		expect(load).toHaveBeenCalledTimes(3);
		queue.stop();
	});

	it('makes no request while the tab is hidden', async () => {
		let hidden = false;
		const load = vi.fn(async () => ({
			runs: [run('r1', 'running', [target('a', 'running')])],
			allowance
		}));
		const queue = new KnowledgeResearchQueue({ load, isHidden: () => hidden });
		queue.start();
		await vi.advanceTimersByTimeAsync(0);
		hidden = true;
		await vi.advanceTimersByTimeAsync(RESEARCH_POLL_MS * 4);
		expect(load).toHaveBeenCalledTimes(1);
		hidden = false;
		await vi.advanceTimersByTimeAsync(RESEARCH_POLL_MS);
		expect(load).toHaveBeenCalledTimes(2);
		queue.stop();
	});

	it('clears finished runs from the tray but keeps live ones', async () => {
		const load = vi.fn(async () => ({
			runs: [
				run('live', 'running', [target('a', 'running')]),
				run('old', 'completed', [target('b', 'done')])
			],
			allowance
		}));
		const queue = new KnowledgeResearchQueue({ load, isHidden: () => false });
		await queue.refresh();
		expect(queue.visibleRuns.map((r) => r.id)).toEqual(['live', 'old']);
		queue.clearFinished(Date.parse('2026-11-17T16:00:00Z'));
		expect(queue.visibleRuns.map((r) => r.id)).toEqual(['live']);
		queue.stop();
	});
});
