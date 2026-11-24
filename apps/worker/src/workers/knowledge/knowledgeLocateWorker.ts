// apps/worker/src/workers/knowledge/knowledgeLocateWorker.ts
//
// knowledge_locate: "find where my companies are" (tasker 170). Free: no model call, no paid
// search. For each organization of a run, three at a time:
//
//   company directory + free outside sources (companyLocate.ts)
//   → placed       where it is, its website, industry and LinkedIn page, saved as known
//   → unconfirmed  where it is and its website, saved as suggestions ("unconfirmed")
//   → ask          nothing saved; a "Which one?" question with the companies that share the name
//   → common/none  nothing saved; left for a web search the user may start
//
// Every organization gets one knowledge_company_lookups row saying which of those happened, so
// it is never looked up twice. Details are saved through KnowledgeStore as research
// (`via: 'enrichment'` with the run's id): "Not this one" on the card removes what a run added.
//
// Long runs: the job works for a few minutes, records how far it got (stats.cursor) and queues
// its own continuation, so an import of thousands of companies never outlives one job's
// timeout. A retry or continuation resumes from the cursor; redoing an organization is harmless
// (the row is upserted and a detail already saved is not saved twice).

import {
	type CompanyOption,
	KNOWLEDGE_LOCATE_JOB_TYPE,
	KNOWLEDGE_LOCATE_RUN_TYPE,
	KNOWLEDGE_UUID_PATTERN,
	type KnowledgeDataClient,
	type KnowledgeLocateStats,
	KnowledgeStore,
	LOCATED_FACT_STATUSES,
	companyDomain,
	companyFactsBatch,
	parsePlaceName,
	readLocateStats
} from '@buildos/shared-agent-ops/knowledge';
import { fetchPublicUrl } from '@buildos/shared-agent-ops/web/safe-fetch';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { supabase as defaultSupabase } from '../../lib/supabase';
import {
	type CompanyLocateDeps,
	companyLookupStores,
	createPacedJsonFetch,
	locateCompany
} from './companyLocate';

export { KNOWLEDGE_LOCATE_JOB_TYPE };

const CONCURRENCY = 3;
/** How long one job works before handing the rest to a continuation. */
export const LOCATE_TIME_BUDGET_MS = 8 * 60_000;

export interface KnowledgeLocateDeps {
	db: KnowledgeDataClient;
	lookup: CompanyLocateDeps;
	now: () => Date;
	timeBudgetMs: number;
}

export interface KnowledgeLocateResult {
	runId: string;
	status: 'completed' | 'continued' | 'cancelled' | 'skipped';
	stats: KnowledgeLocateStats;
}

function readJob(data: unknown): { runId: string; userId: string } {
	const meta = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
	const runId = typeof meta.runId === 'string' ? meta.runId : '';
	const userId = typeof meta.userId === 'string' ? meta.userId : '';
	if (!KNOWLEDGE_UUID_PATTERN.test(runId) || !KNOWLEDGE_UUID_PATTERN.test(userId))
		throw new Error('knowledge_locate needs runId and userId');
	return { runId, userId };
}

export async function processKnowledgeLocateJob(
	job: ProcessingJob,
	deps: Partial<KnowledgeLocateDeps> = {}
): Promise<KnowledgeLocateResult> {
	const { runId, userId } = readJob(job.data);
	const db = deps.db ?? (defaultSupabase as unknown as KnowledgeDataClient);
	const now = deps.now ?? (() => new Date());
	const iso = () => now().toISOString();
	const timeBudgetMs = deps.timeBudgetMs ?? LOCATE_TIME_BUDGET_MS;
	const lookup: CompanyLocateDeps = deps.lookup ?? {
		...companyLookupStores(db, now),
		fetchJson: createPacedJsonFetch({ signal: job.signal }),
		fetchHtml: async (url) => {
			const page = await fetchPublicUrl(url, {
				timeoutMs: 6_000,
				maxBytes: 700_000,
				...(job.signal ? { signal: job.signal } : {})
			});
			return page.status < 400 ? page.body : null;
		}
	};

	const { data: run, error: runError } = await db
		.from('knowledge_runs')
		.select('id, status, input, stats')
		.eq('id', runId)
		.eq('owner_user_id', userId)
		.eq('run_type', KNOWLEDGE_LOCATE_RUN_TYPE)
		.maybeSingle();
	if (runError) throw new Error(`Load run: ${runError.message}`);
	const stats = readLocateStats((run as { stats?: unknown } | null)?.stats);
	if (!run) return { runId, status: 'skipped', stats };
	if (run.status !== 'queued' && run.status !== 'running') {
		return { runId, status: run.status === 'cancelled' ? 'cancelled' : 'skipped', stats };
	}

	const rawIds = (run.input as { entity_ids?: unknown } | null)?.entity_ids;
	const ids = Array.isArray(rawIds)
		? rawIds.filter(
				(id): id is string => typeof id === 'string' && KNOWLEDGE_UUID_PATTERN.test(id)
			)
		: [];
	stats.total = ids.length;
	const savedCursor = Number((run.stats as { cursor?: unknown } | null)?.cursor);
	let cursor =
		Number.isInteger(savedCursor) && savedCursor > 0 ? Math.min(savedCursor, ids.length) : 0;

	const { error: startError } = await db
		.from('knowledge_runs')
		.update({ status: 'running', started_at: iso(), updated_at: iso() })
		.eq('id', runId)
		.eq('status', 'queued');
	if (startError) throw new Error(`Start run: ${startError.message}`);

	const store = new KnowledgeStore(db, userId);
	const places = await existingPlaces(db, userId);
	const startedAt = now().getTime();

	/** Record progress. False when the run is no longer running (the user stopped it). */
	async function checkpoint(): Promise<boolean> {
		stats.done = cursor;
		const { data, error } = await db
			.from('knowledge_runs')
			.update({ stats: { ...stats, cursor }, updated_at: iso() })
			.eq('id', runId)
			.eq('status', 'running')
			.select('id');
		if (error) throw new Error(`Save progress: ${error.message}`);
		return ((data ?? []) as unknown[]).length > 0;
	}

	async function locateOne(entityId: string): Promise<void> {
		try {
			const detail = await store.getEntity(entityId);
			if (!detail || detail.entity.kind !== 'org' || detail.entity.status !== 'active') {
				stats.skipped++;
				return;
			}
			const located = detail.facts.some(
				(fact) =>
					fact.predicate === 'located_in' &&
					(LOCATED_FACT_STATUSES as readonly string[]).includes(fact.status)
			);
			if (located) {
				stats.skipped++;
				return;
			}
			const homepage = detail.facts.find(
				(f) => f.predicate === 'homepage' && f.status === 'active'
			);
			const ownDomain = companyDomain(homepage?.value ?? null);
			const { verdict } = await locateCompany(detail.entity.name, ownDomain, lookup);

			const chosen: CompanyOption | null = verdict.chosen;
			if (chosen && (chosen.place || (chosen.domain && chosen.domain !== ownDomain))) {
				const batch = companyFactsBatch({
					entityId,
					option: chosen,
					confirmed: verdict.outcome === 'placed',
					existingPlaces: places
				});
				if (batch.facts.length) {
					const receipt = await store.record(batch, { via: 'enrichment', runId });
					const place = receipt.entities.find((entity) => entity.ref === 'place');
					if (place && chosen.place) places.set(chosen.place.key, place.id);
				}
			}

			const ask = verdict.outcome === 'ask';
			const { error } = await db.from('knowledge_company_lookups').upsert(
				{
					owner_user_id: userId,
					entity_id: entityId,
					run_id: runId,
					outcome: verdict.outcome,
					options: ask ? verdict.options : [],
					options_total: verdict.total,
					question_status: ask ? 'open' : null,
					chosen_key: null,
					answered_at: null,
					checked_at: iso(),
					updated_at: iso()
				},
				{ onConflict: 'owner_user_id,entity_id' }
			);
			if (error) throw new Error(`Save lookup: ${error.message}`);
			stats[verdict.outcome]++;
		} catch (error) {
			// One organization that cannot be read or saved must not stop the rest.
			stats.failed++;
			console.warn(
				`[knowledge_locate] ${entityId}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	let outcome: KnowledgeLocateResult['status'] = 'completed';
	while (cursor < ids.length) {
		if (job.signal?.aborted) throw new Error('knowledge_locate was stopped by the queue');
		const chunk = ids.slice(cursor, cursor + CONCURRENCY);
		await Promise.all(chunk.map((id) => locateOne(id)));
		cursor += chunk.length;
		if (!(await checkpoint())) {
			outcome = 'cancelled';
			break;
		}
		if (cursor < ids.length && now().getTime() - startedAt >= timeBudgetMs) {
			outcome = 'continued';
			break;
		}
	}

	if (outcome === 'continued') {
		const { error } = await db.rpc('add_queue_job', {
			p_user_id: userId,
			p_job_type: KNOWLEDGE_LOCATE_JOB_TYPE,
			p_metadata: { userId, runId },
			p_priority: 9,
			p_scheduled_for: iso(),
			p_dedup_key: `${KNOWLEDGE_LOCATE_JOB_TYPE}:${runId}:${cursor}`
		});
		if (error) throw new Error(`Queue the rest: ${error.message}`);
		return { runId, status: 'continued', stats };
	}
	if (outcome === 'cancelled') return { runId, status: 'cancelled', stats };

	stats.done = cursor;
	const { error: finishError } = await db
		.from('knowledge_runs')
		.update({
			status: stats.failed && stats.failed === stats.total ? 'failed' : 'completed',
			stats: { ...stats, cursor },
			finished_at: iso(),
			updated_at: iso(),
			...(stats.failed && stats.failed === stats.total
				? { error: 'No company could be looked up.' }
				: {})
		})
		.eq('id', runId)
		.eq('status', 'running');
	if (finishError) throw new Error(`Finish run: ${finishError.message}`);
	return { runId, status: 'completed', stats };
}

/**
 * The user's place entries by canonical key ("place:us:md:annapolis"), so a town already saved
 * as "Annapolis, Maryland" is reused instead of becoming a second place. Keys saved on earlier
 * lookups win over names read back.
 */
export async function existingPlaces(
	db: KnowledgeDataClient,
	userId: string
): Promise<Map<string, string>> {
	const places = new Map<string, string>();
	const { data: entities } = await db
		.from('knowledge_entities')
		.select('id, name')
		.eq('owner_user_id', userId)
		.eq('scope', 'private')
		.eq('kind', 'place')
		.eq('status', 'active')
		.order('created_at')
		.limit(1000);
	for (const row of (entities ?? []) as Array<{ id: string; name: string }>) {
		const key = parsePlaceName(row.name)?.key;
		if (key && !places.has(key)) places.set(key, row.id);
	}
	const { data: keys } = await db
		.from('knowledge_entity_keys')
		.select('entity_id, key_value')
		.eq('owner_user_id', userId)
		.eq('key_type', 'external')
		.like('key_value', 'place:%')
		.limit(1000);
	const active = new Set(((entities ?? []) as Array<{ id: string }>).map((row) => row.id));
	for (const row of (keys ?? []) as Array<{ entity_id: string; key_value: string }>) {
		if (active.has(row.entity_id)) places.set(row.key_value, row.entity_id);
	}
	return places;
}
