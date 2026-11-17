// apps/web/src/lib/components/knowledge/research-tray.ts
// The research tray's data (tasker 164): the caller's active and recent "Find more" runs with
// their entries, and how much of today's research allowance is left. Shaped on the server from
// two reads (GET /api/knowledge/research) and used by the tray, the Enrich dialog and the cards.

import {
	DAILY_ENRICH_BUDGET_USD,
	DEFAULT_ENRICH_BUDGET_PER_TARGET_USD,
	MAX_ACTIVE_ENRICH_RUNS,
	MAX_ENRICH_BATCH,
	MAX_ENRICH_RUN_BUDGET_USD,
	MAX_ENRICH_TARGETS,
	type KnowledgeKind
} from '@buildos/shared-agent-ops/knowledge';

export type ResearchTargetStatus =
	| 'queued'
	| 'running'
	| 'done'
	| 'failed'
	| 'cancelled'
	| 'skipped';
export type ResearchPhase = 'searching' | 'reading' | 'extracting' | 'saving';
export type ResearchRunStatus =
	| 'queued'
	| 'running'
	| 'completed'
	| 'partial'
	| 'failed'
	| 'cancelled';

export interface ResearchTarget {
	id: string;
	run_id: string;
	entity_id: string;
	name: string;
	kind: KnowledgeKind | null;
	status: ResearchTargetStatus;
	phase: ResearchPhase | null;
	summary: string | null;
	facts_added: number;
	cost_usd: number;
	error: string | null;
	instructions: string | null;
	finished_at: string | null;
}

export interface ResearchRun {
	id: string;
	status: ResearchRunStatus;
	title: string;
	created_at: string;
	finished_at: string | null;
	cost_usd: number;
	budget_usd: number;
	/** Queued or running but nothing has moved for 30 minutes (its worker likely died). */
	stalled: boolean;
	targets: ResearchTarget[];
}

export interface ResearchAllowance {
	/** Spent or reserved today (UTC), the same sum the server checks before a new run. */
	spent_today: number;
	daily_cap: number;
	active_runs: number;
	max_active_runs: number;
	per_entry_usd: number;
	run_max_usd: number;
	max_per_run: number;
	max_batch: number;
}

export interface ResearchTrayPayload {
	runs: ResearchRun[];
	allowance: ResearchAllowance;
}

/** Runs and targets as the database returns them (loosely typed). */
export interface RawResearchRun {
	id: string;
	status: string;
	title: string;
	budget_usd: number | string | null;
	cost_usd: number | string | null;
	created_at: string;
	updated_at: string;
	finished_at: string | null;
	targets?: Array<{
		id: string;
		entity_id: string;
		status: string;
		phase: string | null;
		summary: string | null;
		facts_added: number | null;
		cost_usd: number | string | null;
		error: string | null;
		instructions: string | null;
		created_at: string;
		finished_at: string | null;
		entity: { id: string; name: string; kind: KnowledgeKind } | null;
	}> | null;
}

export const STALE_RUN_MS = 30 * 60 * 1000;
export const TRAY_WINDOW_MS = 12 * 60 * 60 * 1000;

const ACTIVE_RUN = new Set(['queued', 'running']);
const ACTIVE_TARGET = new Set(['queued', 'running']);

export function isActiveTarget(target: Pick<ResearchTarget, 'status'>): boolean {
	return ACTIVE_TARGET.has(target.status);
}

export function isLiveRun(run: Pick<ResearchRun, 'status' | 'stalled'>): boolean {
	return ACTIVE_RUN.has(run.status) && !run.stalled;
}

export function utcDayStart(now: Date): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function shapeResearchTray(
	runs: RawResearchRun[],
	today: Array<Pick<RawResearchRun, 'status' | 'budget_usd' | 'cost_usd' | 'updated_at'>>,
	now: Date,
	dailyCap: number = DAILY_ENRICH_BUDGET_USD
): ResearchTrayPayload {
	const fresh = (updatedAt: string) => now.getTime() - Date.parse(updatedAt) < STALE_RUN_MS;
	// Mirrors knowledge_reserve_enrichment_run: an unfinished run counts at its full budget.
	const spent = today.reduce((sum, run) => {
		const cost = Number(run.cost_usd ?? 0);
		return (
			sum + (ACTIVE_RUN.has(run.status) ? Math.max(Number(run.budget_usd ?? 0), cost) : cost)
		);
	}, 0);
	const activeRuns = today.filter((r) => ACTIVE_RUN.has(r.status) && fresh(r.updated_at)).length;

	return {
		runs: runs.map((run) => ({
			id: run.id,
			status: run.status as ResearchRunStatus,
			title: run.title,
			created_at: run.created_at,
			finished_at: run.finished_at,
			cost_usd: Number(run.cost_usd ?? 0),
			budget_usd: Number(run.budget_usd ?? 0),
			stalled: ACTIVE_RUN.has(run.status) && !fresh(run.updated_at),
			targets: [...(run.targets ?? [])]
				.sort(
					(a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
				)
				.map((t) => ({
					id: t.id,
					run_id: run.id,
					entity_id: t.entity_id,
					name: t.entity?.name ?? 'An entry you can no longer see',
					kind: t.entity?.kind ?? null,
					status: t.status as ResearchTargetStatus,
					phase: (t.phase as ResearchPhase | null) ?? null,
					summary: t.summary,
					facts_added: Number(t.facts_added ?? 0),
					cost_usd: Number(t.cost_usd ?? 0),
					error: t.error,
					instructions: t.instructions,
					finished_at: t.finished_at
				}))
		})),
		allowance: {
			spent_today: Number(spent.toFixed(4)),
			daily_cap: dailyCap,
			active_runs: activeRuns,
			max_active_runs: MAX_ACTIVE_ENRICH_RUNS,
			per_entry_usd: DEFAULT_ENRICH_BUDGET_PER_TARGET_USD,
			run_max_usd: MAX_ENRICH_RUN_BUDGET_USD,
			max_per_run: MAX_ENRICH_TARGETS,
			max_batch: MAX_ENRICH_BATCH
		}
	};
}

/** An entry offered to the Enrich dialog. */
export interface EnrichEntry {
	id: string;
	name: string;
	kind: KnowledgeKind;
	researched_at: string | null;
}

/** What the Enrich dialog reports back after starting research. */
export interface EnrichStarted {
	queued: number;
	not_queued: string[];
	refused: string | null;
	skipped: Array<{ entity_id: string; reason: string }>;
}

export interface EnrichEstimate {
	/** Runs this many entries need. */
	runs: number;
	/** Upper bound on spend: entries × per-entry cap, each run capped. */
	max_usd: number;
	/** Left of today's allowance. */
	left_today: number;
	/** About how many entries today's allowance covers (the rest get skipped). */
	covered: number;
	/** How many runs can start right now. */
	runs_available: number;
	/** Entries that can be queued right now (runs_available × per run). */
	queueable: number;
}

export function estimateEnrich(count: number, allowance: ResearchAllowance): EnrichEstimate {
	const runs = Math.ceil(count / allowance.max_per_run);
	let max = 0;
	for (let i = 0; i < runs; i++) {
		const inRun = Math.min(allowance.max_per_run, count - i * allowance.max_per_run);
		max += Math.min(inRun * allowance.per_entry_usd, allowance.run_max_usd);
	}
	const leftToday = Math.max(allowance.daily_cap - allowance.spent_today, 0);
	const runsAvailable = Math.max(allowance.max_active_runs - allowance.active_runs, 0);
	return {
		runs,
		max_usd: Number(max.toFixed(2)),
		left_today: Number(leftToday.toFixed(2)),
		covered: Math.min(count, Math.floor((leftToday + 1e-9) / allowance.per_entry_usd)),
		runs_available: runsAvailable,
		queueable: Math.min(count, runsAvailable * allowance.max_per_run)
	};
}

/** One line for a target's state in the tray and on its card. */
export function researchStatusLine(target: ResearchTarget): string {
	switch (target.status) {
		case 'queued':
			return 'Waiting its turn';
		case 'running':
			return target.phase === 'reading'
				? 'Reading pages…'
				: target.phase === 'extracting'
					? 'Pulling out details…'
					: target.phase === 'saving'
						? 'Saving what it found…'
						: 'Searching the web…';
		case 'done':
			return (
				target.summary ??
				(target.facts_added ? `Found ${target.facts_added} new` : 'Nothing new')
			);
		case 'failed':
			return target.error ? `Didn't work: ${target.error}` : "Didn't work";
		case 'skipped':
			return target.error ?? 'Skipped';
		case 'cancelled':
			return 'Stopped';
	}
}
