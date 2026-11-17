// packages/shared-agent-ops/src/knowledge/enrichment.ts
//
// Starting an enrichment run: "find more about these entities". One run holds up to
// MAX_ENRICH_TARGETS entities; the worker job `knowledge_enrich` researches them two at a time
// and writes cited facts back through KnowledgeStore. Callers must pass a service-role client
// (queue jobs are server-only) and the authenticated user's id.

import { KnowledgeStore, KnowledgeStoreError } from './knowledge-store';
import { getKnowledgePredicate, type KnowledgeKind } from './vocabulary';
import type { KnowledgeDataClient } from './types';

export const MAX_ENRICH_TARGETS = 25;
/** Default ceiling per entity researched (model + paid search/fetch). */
export const DEFAULT_ENRICH_BUDGET_PER_TARGET_USD = 0.03;
export const MAX_ENRICH_RUN_BUDGET_USD = 1;
/** Spend ceiling per user per UTC day across all enrichment runs. */
export const DAILY_ENRICH_BUDGET_USD = 2;
export const MAX_ACTIVE_ENRICH_RUNS = 3;

/** What to look for by kind when the caller does not name fields. */
export const DEFAULT_ENRICH_FIELDS: Record<KnowledgeKind, string[]> = {
	person: ['headline', 'works_at', 'homepage', 'profile_url', 'located_in', 'description'],
	org: [
		'description',
		'homepage',
		'industry',
		'located_in',
		'profile_url',
		'founded',
		'email',
		'phone'
	],
	website: ['description', 'about', 'owns'],
	channel: ['description', 'url', 'about', 'thumbnail_url'],
	video: ['description', 'published_by', 'published_at', 'features', 'about', 'thumbnail_url'],
	place: ['description', 'part_of'],
	topic: ['description'],
	product: ['description', 'url', 'about'],
	event: ['description', 'url', 'located_in']
};

export interface StartEnrichmentInput {
	entityIds: string[];
	fields?: string[];
	instructions?: string;
	budgetUsd?: number;
	trigger?: 'ui' | 'chat' | 'mcp';
}

export interface StartEnrichmentResult {
	runId: string;
	targets: Array<{ entity_id: string; name: string; kind: KnowledgeKind; fields: string[] }>;
	skipped: Array<{ entity_id: string; reason: string }>;
	budget_usd: number;
}

export async function startKnowledgeEnrichment(
	admin: KnowledgeDataClient,
	userId: string,
	input: StartEnrichmentInput
): Promise<StartEnrichmentResult> {
	const store = new KnowledgeStore(admin, userId);
	const requested = [...new Set(input.entityIds)].slice(0, MAX_ENRICH_TARGETS);
	if (!requested.length)
		throw new KnowledgeStoreError('Pick at least one entity to research.', 'INVALID');
	if (input.entityIds.length > MAX_ENRICH_TARGETS) {
		throw new KnowledgeStoreError(
			`One run researches at most ${MAX_ENRICH_TARGETS} entities.`,
			'INVALID'
		);
	}

	const fields = (input.fields ?? []).filter((f) => getKnowledgePredicate(f));
	const entities = await store.loadEntities(requested);
	const skipped: StartEnrichmentResult['skipped'] = [];
	const targets: StartEnrichmentResult['targets'] = [];
	for (const id of requested) {
		const row = entities.get(id);
		if (!row) skipped.push({ entity_id: id, reason: 'not found' });
		else if (row.is_self) skipped.push({ entity_id: id, reason: 'your own entry' });
		else if (targets.some((t) => t.entity_id === row.id)) continue;
		else {
			targets.push({
				entity_id: row.id,
				name: row.name,
				kind: row.kind,
				fields: fields.length ? fields : DEFAULT_ENRICH_FIELDS[row.kind]
			});
		}
	}
	if (!targets.length)
		throw new KnowledgeStoreError('None of those entities can be researched.', 'INVALID');

	const requestedBudget =
		typeof input.budgetUsd === 'number' && input.budgetUsd > 0
			? input.budgetUsd
			: targets.length * DEFAULT_ENRICH_BUDGET_PER_TARGET_USD;
	const title =
		targets.length === 1
			? `Find more about ${targets[0]!.name}`
			: `Find more about ${targets.length} entries`;
	// Checks the concurrency and daily caps and creates the run under one per-user lock, so
	// parallel requests can't all slip past the checks.
	const { data: reserved, error: reserveError } = await admin.rpc(
		'knowledge_reserve_enrichment_run',
		{
			p_user: userId,
			p_title: title.slice(0, 200),
			p_input: {
				fields: fields.length ? fields : null,
				instructions: input.instructions?.trim().slice(0, 1000) || null,
				trigger: input.trigger ?? 'ui'
			},
			p_stats: { targets: targets.length, done: 0, failed: 0, facts: 0 },
			p_requested_budget: Number(requestedBudget.toFixed(4)),
			p_run_max: MAX_ENRICH_RUN_BUDGET_USD,
			p_daily_max: DAILY_ENRICH_BUDGET_USD,
			p_active_max: MAX_ACTIVE_ENRICH_RUNS
		}
	);
	if (reserveError) throw new KnowledgeStoreError(`Start run: ${reserveError.message}`);
	const outcome = (reserved ?? {}) as { id?: string; budget?: number; error?: string };
	if (outcome.error === 'busy') {
		throw new KnowledgeStoreError(
			`You already have ${MAX_ACTIVE_ENRICH_RUNS} research runs going. Wait for one to finish.`,
			'INVALID'
		);
	}
	if (!outcome.id) {
		throw new KnowledgeStoreError(
			`Today's research allowance ($${DAILY_ENRICH_BUDGET_USD.toFixed(2)}) is used up. It resets at midnight UTC.`,
			'INVALID'
		);
	}
	const run = { id: outcome.id };
	const budget = Number(outcome.budget ?? 0);

	const { error: targetError } = await admin.from('knowledge_run_targets').insert(
		targets.map((t) => ({
			run_id: run.id,
			owner_user_id: userId,
			entity_id: t.entity_id,
			fields: t.fields
		}))
	);
	if (targetError) {
		await admin
			.from('knowledge_runs')
			.update({ status: 'failed', error: targetError.message })
			.eq('id', run.id);
		throw new KnowledgeStoreError(`Start run: ${targetError.message}`);
	}

	const { error: queueError } = await admin.rpc('add_queue_job', {
		p_user_id: userId,
		p_job_type: 'knowledge_enrich',
		p_metadata: { userId, runId: run.id },
		p_priority: 8,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: `knowledge_enrich:${run.id}`
	});
	if (queueError) {
		await admin
			.from('knowledge_runs')
			.update({ status: 'failed', error: 'Could not queue the research job.' })
			.eq('id', run.id);
		throw new KnowledgeStoreError(`Queue research: ${queueError.message}`);
	}

	return { runId: run.id as string, targets, skipped, budget_usd: Number(budget.toFixed(4)) };
}
