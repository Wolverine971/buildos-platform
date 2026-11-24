// packages/shared-agent-ops/src/knowledge/company-locate.ts
//
// Starting and reading a "find where my companies are" run (tasker 170). The run is free: the
// worker job `knowledge_locate` looks each organization up in the company directory and the
// free outside sources (company-lookup.ts) and saves what it can tell. It has its own run type,
// so it never counts against the research runs or the daily research allowance.
//
// Server-only: runs are written with the service-role client; the caller passes the signed-in
// user's id and only that user's organizations are touched.

import type { CompanyLookupOutcome, CompanyOption } from './company-lookup';
import { KnowledgeStoreError } from './knowledge-store';
import { KNOWLEDGE_UUID_PATTERN } from './normalize';
import type { KnowledgeDataClient } from './types';

export const KNOWLEDGE_LOCATE_JOB_TYPE = 'knowledge_locate';
export const KNOWLEDGE_LOCATE_RUN_TYPE = 'locate';
/** One run looks up at most this many organizations (a very large address book). */
export const MAX_LOCATE_TARGETS = 5_000;
/** A queued or running run that has not moved for this long was left by a dead worker. */
export const LOCATE_STALE_RUN_MS = 30 * 60_000;
/** A location fact in any of these states means the organization already has a place. */
export const LOCATED_FACT_STATUSES = ['active', 'suggested', 'disputed'] as const;

export interface KnowledgeLocateStats {
	total: number;
	done: number;
	/** Saved as known: two sources agreed. */
	placed: number;
	/** Saved as "unconfirmed". */
	unconfirmed: number;
	/** Several companies share the name: a "Which one?" question was filed. */
	ask: number;
	/** Too many companies share the name to ask. */
	common: number;
	none: number;
	failed: number;
	/** Already had a place by the time the worker reached it. */
	skipped: number;
}

export const EMPTY_LOCATE_STATS: Readonly<KnowledgeLocateStats> = Object.freeze({
	total: 0,
	done: 0,
	placed: 0,
	unconfirmed: 0,
	ask: 0,
	common: 0,
	none: 0,
	failed: 0,
	skipped: 0
});

export function readLocateStats(value: unknown): KnowledgeLocateStats {
	const stats = { ...EMPTY_LOCATE_STATS };
	if (!value || typeof value !== 'object') return stats;
	for (const key of Object.keys(stats) as Array<keyof KnowledgeLocateStats>) {
		const n = Number((value as Record<string, unknown>)[key]);
		if (Number.isFinite(n) && n >= 0) stats[key] = Math.floor(n);
	}
	return stats;
}

/** A stored "Which one?" question, as the review stack and the organization's card read it. */
export interface KnowledgeCompanyQuestion {
	id: string;
	entity_id: string;
	/** The organization's name as the user has it. */
	name: string;
	options: CompanyOption[];
	/** How many distinct companies carry the name across the sources. */
	options_total: number;
	/** People in the user's graph who work there, with their title: the user's own clue. */
	people: Array<{ id: string; name: string; title: string | null }>;
	checked_at: string;
}

export type CompanyQuestionChoice =
	| { choice: 'option'; key: string }
	| { choice: 'none_of_these' }
	| { choice: 'skipped' };

/** Read every row of a query in pages (PostgREST returns at most 1,000 rows a request). */
async function readAll<T>(
	page: (
		from: number,
		to: number
	) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
	what: string
): Promise<T[]> {
	const size = 1000;
	const rows: T[] = [];
	for (let from = 0; from < 200_000; from += size) {
		const { data, error } = await page(from, from + size - 1);
		if (error) throw new KnowledgeStoreError(`${what}: ${error.message}`);
		const batch = (data ?? []) as T[];
		rows.push(...batch);
		if (batch.length < size) break;
	}
	return rows;
}

/** The user's organizations that have no place yet and have never been looked up. */
export async function organizationsToLocate(
	db: KnowledgeDataClient,
	userId: string,
	only?: readonly string[]
): Promise<string[]> {
	const wanted = only ? new Set(only.filter((id) => KNOWLEDGE_UUID_PATTERN.test(id))) : null;
	if (wanted && !wanted.size) return [];
	const [orgs, located, checked] = await Promise.all([
		readAll<{ id: string }>(
			(from, to) =>
				db
					.from('knowledge_entities')
					.select('id')
					.eq('owner_user_id', userId)
					.eq('scope', 'private')
					.eq('kind', 'org')
					.eq('status', 'active')
					.order('created_at')
					.order('id')
					.range(from, to),
			'Load organizations'
		),
		readAll<{ entity_id: string }>(
			(from, to) =>
				db
					.from('knowledge_facts')
					.select('entity_id')
					.eq('owner_user_id', userId)
					.eq('predicate', 'located_in')
					.in('status', [...LOCATED_FACT_STATUSES])
					.order('id')
					.range(from, to),
			'Load places'
		),
		readAll<{ entity_id: string }>(
			(from, to) =>
				db
					.from('knowledge_company_lookups')
					.select('entity_id')
					.eq('owner_user_id', userId)
					.order('id')
					.range(from, to),
			'Load earlier lookups'
		)
	]);
	const done = new Set([...located, ...checked].map((row) => row.entity_id));
	return orgs
		.map((row) => row.id)
		.filter((id) => !done.has(id) && (!wanted || wanted.has(id)))
		.slice(0, MAX_LOCATE_TARGETS);
}

export interface StartCompanyLocateInput {
	/** Limit the run to these organizations (the ones an import touched). Omitted: all of them. */
	entityIds?: readonly string[];
	origin: 'import' | 'manual';
}

export interface StartCompanyLocateResult {
	/** The run that will do the work: a new one, or the one already going. Null: nothing to do. */
	runId: string | null;
	queued: number;
	/** Why no new run was started. */
	reason?: 'nothing_to_locate' | 'already_running';
}

/**
 * Queue a lookup of the user's organizations that have no place yet. One run at a time per
 * user: a second request while one is going reports that run instead of starting another.
 */
export async function startCompanyLocate(
	admin: KnowledgeDataClient,
	userId: string,
	input: StartCompanyLocateInput
): Promise<StartCompanyLocateResult> {
	const { data: active, error: activeError } = await admin
		.from('knowledge_runs')
		.select('id')
		.eq('owner_user_id', userId)
		.eq('run_type', KNOWLEDGE_LOCATE_RUN_TYPE)
		.in('status', ['queued', 'running'])
		.gt('updated_at', new Date(Date.now() - LOCATE_STALE_RUN_MS).toISOString())
		.order('created_at', { ascending: false })
		.limit(1);
	if (activeError) throw new KnowledgeStoreError(`Start lookup: ${activeError.message}`);
	const going = ((active ?? []) as Array<{ id: string }>)[0];
	if (going) return { runId: going.id, queued: 0, reason: 'already_running' };

	const ids = await organizationsToLocate(admin, userId, input.entityIds);
	if (!ids.length) return { runId: null, queued: 0, reason: 'nothing_to_locate' };

	const stats: KnowledgeLocateStats = { ...EMPTY_LOCATE_STATS, total: ids.length };
	const { data: run, error: runError } = await admin
		.from('knowledge_runs')
		.insert({
			owner_user_id: userId,
			run_type: KNOWLEDGE_LOCATE_RUN_TYPE,
			status: 'queued',
			title:
				ids.length === 1
					? 'Finding where 1 company is'
					: `Finding where ${ids.length} companies are`,
			input: { entity_ids: ids, origin: input.origin },
			stats,
			budget_usd: 0
		})
		.select('id')
		.single();
	if (runError || !run) {
		throw new KnowledgeStoreError(`Start lookup: ${runError?.message ?? 'no run created'}`);
	}
	const runId = (run as { id: string }).id;

	const { error: queueError } = await admin.rpc('add_queue_job', {
		p_user_id: userId,
		p_job_type: KNOWLEDGE_LOCATE_JOB_TYPE,
		p_metadata: { userId, runId },
		p_priority: 9,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: `${KNOWLEDGE_LOCATE_JOB_TYPE}:${runId}:0`
	});
	if (queueError) {
		await admin
			.from('knowledge_runs')
			.update({ status: 'failed', error: 'Could not queue the lookup job.' })
			.eq('id', runId);
		throw new KnowledgeStoreError(`Start lookup: ${queueError.message}`);
	}
	return { runId, queued: ids.length };
}

/** Stop a lookup run. Organizations already looked up keep what was found. */
export async function cancelCompanyLocate(
	admin: KnowledgeDataClient,
	userId: string,
	runId: string
): Promise<boolean> {
	const { data, error } = await admin
		.from('knowledge_runs')
		.update({
			status: 'cancelled',
			finished_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('id', runId)
		.eq('owner_user_id', userId)
		.eq('run_type', KNOWLEDGE_LOCATE_RUN_TYPE)
		.in('status', ['queued', 'running'])
		.select('id');
	if (error) throw new KnowledgeStoreError(`Stop lookup: ${error.message}`);
	return ((data ?? []) as unknown[]).length > 0;
}

/** What the tray shows for the user's latest lookup run. */
export interface KnowledgeLocateTray {
	run_id: string;
	status: 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';
	stats: KnowledgeLocateStats;
	started_at: string | null;
	finished_at: string | null;
	/** "Which one?" questions still waiting for the user (from any run). */
	open_questions: number;
	/** Organizations no free source could place, which a web search could still try. */
	leftover: number;
	/** Whether this user may run the paid web search for the leftovers. */
	web_search: boolean;
}

/** Outcomes a paid web search can still improve on. */
export const LOCATE_LEFTOVER_OUTCOMES: readonly CompanyLookupOutcome[] = ['none', 'common'];

/** "212 of 626 · 180 placed · 14 to check": one line for the tray. */
export function locateStatusLine(tray: Pick<KnowledgeLocateTray, 'status' | 'stats'>): string {
	const { stats } = tray;
	const found = stats.placed + stats.unconfirmed;
	const parts: string[] = [];
	if (tray.status === 'queued') parts.push('Waiting to start');
	else if (tray.status === 'running') parts.push(`${stats.done} of ${stats.total}`);
	parts.push(`${found} placed`);
	if (stats.ask) parts.push(`${stats.ask} need a quick look`);
	const missing = stats.none + stats.common;
	if (missing && tray.status !== 'running' && tray.status !== 'queued')
		parts.push(`${missing} not found`);
	return parts.join(' · ');
}
