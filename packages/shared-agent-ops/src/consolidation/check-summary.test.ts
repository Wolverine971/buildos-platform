// packages/shared-agent-ops/src/consolidation/check-summary.test.ts
import { describe, expect, it } from 'vitest';
import {
	parseConsolidationRunMode,
	parseConsolidationScope,
	reusableCheckRun,
	summarizeConsolidationCheck,
	type ConsolidationCluster,
	type ConsolidationPlan
} from './consolidation';

const WAYNE = 'aaaaaaaa-0000-4000-8000-000000000001';
const CADRE = 'aaaaaaaa-0000-4000-8000-000000000002';
const P = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('parseConsolidationScope', () => {
	it('keeps the root first and drops repeats', () => {
		expect(parseConsolidationScope([WAYNE, CADRE, WAYNE.toUpperCase(), CADRE])).toEqual({
			ok: true,
			project_ids: [WAYNE, CADRE]
		});
	});

	it('needs 2 to 20 distinct project ids', () => {
		expect(parseConsolidationScope([WAYNE]).ok).toBe(false);
		expect(parseConsolidationScope([WAYNE, WAYNE]).ok).toBe(false);
		expect(parseConsolidationScope(Array.from({ length: 20 }, (_, i) => P(i))).ok).toBe(true);
		const tooMany = parseConsolidationScope(Array.from({ length: 21 }, (_, i) => P(i)));
		expect(tooMany).toEqual({ ok: false, error: 'Pick at most 20 projects.' });
	});

	it('refuses anything that is not a list of ids', () => {
		expect(parseConsolidationScope('x').ok).toBe(false);
		expect(parseConsolidationScope([WAYNE, 'not-an-id']).ok).toBe(false);
		expect(parseConsolidationScope([WAYNE, 42]).ok).toBe(false);
	});
});

describe('reusableCheckRun', () => {
	const now = Date.parse('2026-10-17T12:00:00Z');
	const at = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
	const row = (id: string, extra: Record<string, unknown>) => ({
		id,
		project_ids: [WAYNE, CADRE],
		status: 'checked',
		created_at: at(10),
		finished_at: at(9),
		...extra
	});

	it('reuses the newest running or recent check of the same projects, in any order', () => {
		const rows = [
			row('older', { created_at: at(12), finished_at: at(11) }),
			row('newer', { status: 'surveying', created_at: at(2), finished_at: null })
		];
		expect(reusableCheckRun(rows, [CADRE, WAYNE.toUpperCase()], now)?.id).toBe('newer');
	});

	it('skips stale, stalled, failed and other-project checks', () => {
		const rows = [
			row('stale', { finished_at: at(15) }),
			row('stalled', { status: 'surveying', created_at: at(21), finished_at: null }),
			row('failed', { status: 'failed' }),
			row('wider', { project_ids: [WAYNE, CADRE, P(1)] })
		];
		expect(reusableCheckRun(rows, [WAYNE, CADRE], now)).toBeNull();
	});
});

describe('parseConsolidationRunMode', () => {
	it('knows full and check only', () => {
		expect(parseConsolidationRunMode('check')).toBe('check');
		expect(parseConsolidationRunMode('full')).toBe('full');
		expect(parseConsolidationRunMode('apply')).toBeNull();
	});
});

function cluster(partial: Partial<ConsolidationCluster> & Pick<ConsolidationCluster, 'kind'>) {
	return {
		key: 'c0',
		title: 'Group',
		document_ids: [],
		reason: '',
		ops: [],
		question_id: null,
		vetoed: false,
		...partial
	} as ConsolidationCluster;
}

const plan: ConsolidationPlan = {
	version: 1,
	clusters: [
		cluster({
			key: 'c1',
			kind: 'task_sequence',
			title: 'Launch steps',
			task_ids: ['t3', 't4'],
			reason: 'In order.'
		}),
		cluster({
			key: 'c2',
			kind: 'superseded',
			title: 'Old brief',
			document_ids: ['d3'],
			newer_id: 'd4',
			reason: 'The new brief covers it.'
		}),
		cluster({
			key: 'c3',
			kind: 'twins',
			title: 'Intake template',
			document_ids: ['d1', 'd2'],
			reason: 'Identical.'
		}),
		cluster({
			key: 'c4',
			kind: 'duplicate_tasks',
			title: 'Send invoice',
			task_ids: ['t1', 't2'],
			reason: 'Same work.'
		})
	],
	documents: {
		d1: { title: 'Intake template', project_id: WAYNE },
		d2: { title: 'Intake template (copy)', project_id: CADRE },
		d3: { title: 'Brief v1', project_id: CADRE },
		d4: { title: 'Brief v2', project_id: CADRE }
	},
	tasks: {
		t1: { title: 'Send invoice', project_id: WAYNE },
		t2: { title: 'Invoice Cadre', project_id: CADRE },
		t3: { title: 'Draft', project_id: CADRE },
		t4: { title: 'Publish', project_id: CADRE }
	},
	projects: {
		[WAYNE]: { name: 'Wayne Strategies', parent: true },
		[CADRE]: { name: 'Cadre', parent: false }
	}
};

const run = {
	id: 'run-1',
	root_project_id: WAYNE,
	project_ids: [WAYNE, CADRE],
	status: 'checked',
	plan,
	progress: { stage: 'done', documents: 30, tasks: 12 },
	cost_usd: '0.0071',
	error: null
};

describe('summarizeConsolidationCheck', () => {
	it('counts by kind, puts cross-project duplicates first, and names each item’s project', () => {
		const summary = summarizeConsolidationCheck(run);
		expect(summary.state).toBe('done');
		expect(summary.counts.duplicate_docs).toEqual({ groups: 1, documents: 2, tasks: 0 });
		expect(summary.counts.duplicate_tasks).toEqual({ groups: 1, documents: 0, tasks: 2 });
		expect(summary.counts.outdated_docs).toEqual({ groups: 1, documents: 1, tasks: 0 });
		expect(summary.counts.other).toEqual({ groups: 1, documents: 0, tasks: 2 });
		expect(summary.groups.map((group) => group.key)).toEqual(['c3', 'c4', 'c2', 'c1']);
		expect(summary.groups[0]).toMatchObject({
			kind_label: 'Identical copies',
			cross_project: true,
			documents: [
				{ id: 'd1', title: 'Intake template', project_name: 'Wayne Strategies' },
				{ id: 'd2', title: 'Intake template (copy)', project_name: 'Cadre' }
			]
		});
		expect(summary.groups[2]!.newer).toMatchObject({ id: 'd4', title: 'Brief v2' });
		expect(summary.scanned).toEqual({ documents: 30, tasks: 12 });
		expect(summary.cost_usd).toBe(0.0071);
		expect(summary.review_path).toBe(`/projects/${WAYNE}/consolidate/run-1`);
		expect(summary.headline).toBe(
			'Found 2 identical docs, 2 duplicate tasks, 1 outdated doc and 1 other group across Wayne Strategies and Cadre.'
		);
	});

	it('shows the top groups and says how many more there are', () => {
		const summary = summarizeConsolidationCheck(run, { limit: 2 });
		expect(summary.groups).toHaveLength(2);
		expect(summary.more_groups).toBe(2);
		expect(summary.total_groups).toBe(4);
	});

	it('hides titles from projects the viewer can no longer open', () => {
		const summary = summarizeConsolidationCheck(run, { visibleProjectIds: new Set([WAYNE]) });
		const twins = summary.groups.find((group) => group.key === 'c3')!;
		expect(twins.documents[1]!.title).toBe('A doc you can no longer see');
		expect(twins.documents[0]!.title).toBe('Intake template');
	});

	it('reads a running, empty, failed or cancelled check', () => {
		const names = { [WAYNE]: 'Wayne Strategies', [CADRE]: 'Cadre' };
		expect(
			summarizeConsolidationCheck(
				{ ...run, status: 'surveying', plan: null },
				{ projectNames: names }
			).headline
		).toBe('Checking Wayne Strategies and Cadre for duplicates…');
		expect(
			summarizeConsolidationCheck({ ...run, plan: { ...plan, clusters: [] } }).headline
		).toBe('No duplicates found across Wayne Strategies and Cadre.');
		const failed = summarizeConsolidationCheck({
			...run,
			status: 'failed',
			plan: null,
			error: 'Timed out'
		});
		expect(failed).toMatchObject({ state: 'failed', error: 'Timed out', groups: [] });
		expect(summarizeConsolidationCheck({ ...run, status: 'cancelled' }).state).toBe(
			'cancelled'
		);
	});
});
