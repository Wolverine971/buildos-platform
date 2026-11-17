// apps/web/src/lib/components/knowledge/research-tray.test.ts
import { describe, expect, it } from 'vitest';
import {
	estimateEnrich,
	researchStatusLine,
	shapeResearchTray,
	type RawResearchRun,
	type ResearchAllowance,
	type ResearchTarget
} from './research-tray';

const NOW = new Date('2026-11-17T15:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

function rawRun(overrides: Partial<RawResearchRun>): RawResearchRun {
	return {
		id: 'run',
		status: 'running',
		title: 'Find more',
		budget_usd: 0.3,
		cost_usd: 0.05,
		created_at: minutesAgo(5),
		updated_at: minutesAgo(1),
		finished_at: null,
		targets: [],
		...overrides
	};
}

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

describe('shapeResearchTray', () => {
	it('counts unfinished runs at their budget, like the server cap, and flags stalled runs', () => {
		const tray = shapeResearchTray(
			[
				rawRun({
					id: 'live',
					targets: [
						{
							id: 'b',
							entity_id: 'e2',
							status: 'queued',
							phase: null,
							summary: null,
							facts_added: 0,
							cost_usd: 0,
							error: null,
							instructions: 'Find their podcast',
							created_at: minutesAgo(5),
							finished_at: null,
							entity: { id: 'e2', name: 'Beta', kind: 'org' }
						},
						{
							id: 'a',
							entity_id: 'e1',
							status: 'running',
							phase: 'reading',
							summary: null,
							facts_added: 0,
							cost_usd: '0.01',
							error: null,
							instructions: null,
							created_at: minutesAgo(6),
							finished_at: null,
							entity: null
						}
					]
				}),
				rawRun({ id: 'old', status: 'queued', updated_at: minutesAgo(45) })
			],
			[
				{ status: 'running', budget_usd: 0.3, cost_usd: 0.05, updated_at: minutesAgo(1) },
				{ status: 'queued', budget_usd: 0.3, cost_usd: 0, updated_at: minutesAgo(45) },
				{ status: 'completed', budget_usd: 0.9, cost_usd: 0.12, updated_at: minutesAgo(90) }
			],
			NOW
		);
		expect(tray.allowance.spent_today).toBeCloseTo(0.72);
		expect(tray.allowance.active_runs).toBe(1);
		expect(tray.runs[1]!.stalled).toBe(true);
		expect(tray.runs[0]!.targets.map((t) => t.id)).toEqual(['a', 'b']);
		expect(tray.runs[0]!.targets[0]).toMatchObject({
			name: 'An entry you can no longer see',
			cost_usd: 0.01,
			phase: 'reading'
		});
	});
});

describe('estimateEnrich', () => {
	it('caps each run, and says how much today and the free batches cover', () => {
		expect(estimateEnrich(15, allowance)).toMatchObject({
			runs: 1,
			max_usd: 0.45,
			covered: 15
		});
		const busy = estimateEnrich(60, { ...allowance, spent_today: 1.4, active_runs: 2 });
		expect(busy).toMatchObject({
			runs: 3,
			max_usd: 1.8,
			left_today: 0.6,
			covered: 20,
			runs_available: 1,
			queueable: 25
		});
	});
});

describe('researchStatusLine', () => {
	const target = (patch: Partial<ResearchTarget>): ResearchTarget => ({
		id: 't',
		run_id: 'r',
		entity_id: 'e',
		name: 'Acme',
		kind: 'org',
		status: 'running',
		phase: null,
		summary: null,
		facts_added: 0,
		cost_usd: 0,
		error: null,
		instructions: null,
		finished_at: null,
		...patch
	});
	it('reads as live progress, then as the result', () => {
		expect(researchStatusLine(target({ status: 'queued' }))).toBe('Waiting its turn');
		expect(researchStatusLine(target({ phase: 'searching' }))).toBe('Searching the web…');
		expect(researchStatusLine(target({ phase: 'reading' }))).toBe('Reading pages…');
		expect(
			researchStatusLine(target({ status: 'done', summary: '3 pages read, 2 new details' }))
		).toBe('3 pages read, 2 new details');
		expect(researchStatusLine(target({ status: 'cancelled' }))).toBe('Stopped');
	});
});
