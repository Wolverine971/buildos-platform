// packages/shared-agent-ops/src/knowledge/enrichment.ts
//
// Starting an enrichment run: "find more about these entities". One run holds up to
// MAX_ENRICH_TARGETS entities; the worker job `knowledge_enrich` researches them two at a time
// and writes cited facts back through KnowledgeStore. Callers must pass a service-role client
// (queue jobs and run rows are server-only) and the authenticated user's id.
//
// Tasker 164: a bulk "Enrich N" splits into runs of MAX_ENRICH_TARGETS (startKnowledgeEnrichment-
// Batches), every target carries its own instructions (batch text + an optional per-entry note),
// requested fields are narrowed to what fits each entry's kind, and research can be cancelled
// per target or per run (cancelKnowledgeResearch).

import { KnowledgeStore, KnowledgeStoreError } from './knowledge-store';
import { getKnowledgePredicate, type KnowledgeKind } from './vocabulary';
import type { KnowledgeDataClient } from './types';

export const MAX_ENRICH_TARGETS = 25;
/** Default ceiling per entity researched (model + paid search/fetch). */
export const DEFAULT_ENRICH_BUDGET_PER_TARGET_USD = 0.03;
export const MAX_ENRICH_RUN_BUDGET_USD = 1;
/** Spend ceiling per user per UTC day across all enrichment runs (DJ, 2026-11-17). */
export const DAILY_ENRICH_BUDGET_USD = 0.5;
/** Admin accounts get a larger daily allowance to test research at scale. */
export const DAILY_ENRICH_BUDGET_ADMIN_USD = 5;

export function dailyEnrichBudgetFor(
	user: { is_admin?: boolean | null } | null | undefined
): number {
	return user?.is_admin ? DAILY_ENRICH_BUDGET_ADMIN_USD : DAILY_ENRICH_BUDGET_USD;
}
export const MAX_ACTIVE_ENRICH_RUNS = 3;
/** One Enrich click can queue this many entries (MAX_ACTIVE_ENRICH_RUNS runs). */
export const MAX_ENRICH_BATCH = MAX_ENRICH_TARGETS * MAX_ACTIVE_ENRICH_RUNS;
/** Batch-wide "what should we look for" text. */
export const MAX_ENRICH_INSTRUCTIONS_CHARS = 600;
/** Extra note for one entry. */
export const MAX_ENRICH_ENTRY_NOTE_CHARS = 500;

/**
 * Never researched for a person, whatever was asked (the worker enforces the same list on the
 * model's answer).
 */
export const ENRICH_NEVER_FOR_PEOPLE: readonly string[] = ['address', 'birthday', 'note', 'knows'];

/**
 * A person's phone and email are researched only when the user explicitly picks "Phone & email"
 * for that run, never by default (DJ, 2026-11-17). Research writes are private to the user, and
 * the database never lets a person's contact facts become shared.
 */
export const ENRICH_PERSON_CONTACT_FIELDS: readonly string[] = ['email', 'phone'];

/**
 * What the Enrich dialog offers under "What should we look for?". Each maps to predicates;
 * startKnowledgeEnrichment keeps only the ones that fit each entry's kind. "Phone & email" is the
 * only way a person's contact details get researched.
 */
export const ENRICH_FOCUS_OPTIONS: ReadonlyArray<{
	key: string;
	label: string;
	fields: readonly string[];
}> = [
	{ key: 'website', label: 'Website', fields: ['homepage', 'url'] },
	{ key: 'role', label: 'Role & company', fields: ['headline', 'works_at'] },
	{ key: 'linkedin', label: 'LinkedIn & profiles', fields: ['profile_url'] },
	{ key: 'location', label: 'Location', fields: ['located_in', 'address'] },
	{ key: 'about', label: 'What they do', fields: ['description', 'industry', 'about'] },
	{ key: 'contact', label: 'Phone & email', fields: ['email', 'phone'] }
];

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
	/** Batch-wide: what to look for across all of these. */
	instructions?: string;
	/** Optional note for single entries, by entity id. */
	entryInstructions?: Record<string, string>;
	budgetUsd?: number;
	trigger?: 'ui' | 'chat' | 'mcp';
}

export interface StartEnrichmentResult {
	runId: string;
	targets: Array<{ entity_id: string; name: string; kind: KnowledgeKind; fields: string[] }>;
	skipped: Array<{ entity_id: string; reason: string }>;
	budget_usd: number;
}

/**
 * The requested fields that make sense for this kind of entry (a website has no "works at"),
 * minus what is never researched for people. Nothing left → the kind's usual fields.
 */
export function enrichFieldsFor(kind: KnowledgeKind, requested: readonly string[] = []): string[] {
	const allowed = (key: string) => {
		const def = getKnowledgePredicate(key);
		if (!def) return false;
		if (def.subjectKinds.length && !def.subjectKinds.includes(kind)) return false;
		return !(kind === 'person' && ENRICH_NEVER_FOR_PEOPLE.includes(key));
	};
	const picked = [...new Set(requested)].filter(allowed);
	return picked.length ? picked : DEFAULT_ENRICH_FIELDS[kind].filter(allowed);
}

/** One target's instructions: its own note first (more specific), then the batch text. */
export function enrichTargetInstructions(
	shared: string | null | undefined,
	entry: string | null | undefined
): string | null {
	const parts = [
		entry?.trim().slice(0, MAX_ENRICH_ENTRY_NOTE_CHARS),
		shared?.trim().slice(0, MAX_ENRICH_INSTRUCTIONS_CHARS)
	].filter((part): part is string => Boolean(part));
	return parts.length ? parts.join('\n') : null;
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
	const shared = input.instructions?.trim().slice(0, MAX_ENRICH_INSTRUCTIONS_CHARS) || null;
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
				fields: enrichFieldsFor(row.kind, fields)
			});
		}
	}
	if (!targets.length)
		throw new KnowledgeStoreError('None of those entities can be researched.', 'INVALID');

	const requestedBudget =
		typeof input.budgetUsd === 'number' && input.budgetUsd > 0
			? input.budgetUsd
			: targets.length * DEFAULT_ENRICH_BUDGET_PER_TARGET_USD;
	const { data: account } = await admin
		.from('users')
		.select('is_admin')
		.eq('id', userId)
		.maybeSingle();
	const dailyMax = dailyEnrichBudgetFor(account as { is_admin?: boolean | null } | null);
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
				instructions: shared,
				trigger: input.trigger ?? 'ui'
			},
			p_stats: { targets: targets.length, done: 0, failed: 0, facts: 0 },
			p_requested_budget: Number(requestedBudget.toFixed(4)),
			p_run_max: MAX_ENRICH_RUN_BUDGET_USD,
			p_daily_max: dailyMax,
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
			`Today's research allowance ($${dailyMax.toFixed(2)}) is used up. It resets at midnight UTC.`,
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
			fields: t.fields,
			instructions: enrichTargetInstructions(shared, input.entryInstructions?.[t.entity_id])
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

export interface StartEnrichmentBatchesResult {
	runs: StartEnrichmentResult[];
	skipped: StartEnrichmentResult['skipped'];
	/** Entries that were not queued because a later run was refused (busy, or out of budget). */
	not_queued: string[];
	/** Why the rest was refused, in plain words. */
	refused: string | null;
}

/**
 * "Enrich N": queue up to MAX_ENRICH_BATCH entries as runs of MAX_ENRICH_TARGETS. Runs start in
 * order; when one is refused (3 already going, or today's allowance used), the entries after it
 * are reported as not queued instead of failing the ones already started. The first refusal
 * still throws, so a click that queued nothing says why.
 */
export async function startKnowledgeEnrichmentBatches(
	admin: KnowledgeDataClient,
	userId: string,
	input: StartEnrichmentInput
): Promise<StartEnrichmentBatchesResult> {
	const ids = [...new Set(input.entityIds)];
	if (ids.length > MAX_ENRICH_BATCH) {
		throw new KnowledgeStoreError(
			`One Enrich researches at most ${MAX_ENRICH_BATCH} entries.`,
			'INVALID'
		);
	}
	const result: StartEnrichmentBatchesResult = {
		runs: [],
		skipped: [],
		not_queued: [],
		refused: null
	};
	for (let i = 0; i < ids.length; i += MAX_ENRICH_TARGETS) {
		const chunk = ids.slice(i, i + MAX_ENRICH_TARGETS);
		try {
			const run = await startKnowledgeEnrichment(admin, userId, {
				...input,
				entityIds: chunk,
				// A caller budget is per click; each run gets its share.
				...(typeof input.budgetUsd === 'number'
					? { budgetUsd: (input.budgetUsd * chunk.length) / ids.length }
					: {})
			});
			result.runs.push(run);
			result.skipped.push(...run.skipped);
		} catch (error) {
			if (!result.runs.length || !(error instanceof KnowledgeStoreError)) throw error;
			result.refused = error.message;
			result.not_queued = ids.slice(i);
			break;
		}
	}
	return result;
}

/**
 * Stop research: one target (if it hasn't finished) or a whole run. Server-only, like every run
 * write; the caller passes the signed-in user's id and only that user's rows change. A target
 * already being researched stops at its next step (the worker checks between steps), so a few
 * cents may still be spent on it.
 */
export async function cancelKnowledgeResearch(
	admin: KnowledgeDataClient,
	userId: string,
	input: { runId?: string; targetId?: string },
	now: () => Date = () => new Date()
): Promise<{ cancelled: number }> {
	const at = now().toISOString();
	const stop = { status: 'cancelled', phase: null, finished_at: at, updated_at: at };
	if (input.targetId) {
		const { data, error } = await admin
			.from('knowledge_run_targets')
			.update(stop)
			.eq('id', input.targetId)
			.eq('owner_user_id', userId)
			.in('status', ['queued', 'running'])
			.select('id, run_id');
		if (error) throw new KnowledgeStoreError(`Cancel research: ${error.message}`);
		const row = ((data ?? []) as Array<{ run_id: string }>)[0];
		if (!row) return { cancelled: 0 };
		// Nothing left in a run the worker hasn't picked up yet: close the run too, so it stops
		// counting against the three-at-once limit.
		const { data: left, error: leftError } = await admin
			.from('knowledge_run_targets')
			.select('id')
			.eq('run_id', row.run_id)
			.in('status', ['queued', 'running'])
			.limit(1);
		if (!leftError && !(left ?? []).length) {
			await admin
				.from('knowledge_runs')
				.update({ status: 'cancelled', finished_at: at, updated_at: at })
				.eq('id', row.run_id)
				.eq('owner_user_id', userId)
				.eq('status', 'queued');
		}
		return { cancelled: 1 };
	}
	if (!input.runId) throw new KnowledgeStoreError('Say which research to stop.', 'INVALID');
	const { data: runs, error: runError } = await admin
		.from('knowledge_runs')
		.update({ status: 'cancelled', updated_at: at })
		.eq('id', input.runId)
		.eq('owner_user_id', userId)
		.in('status', ['queued', 'running'])
		.select('id');
	if (runError) throw new KnowledgeStoreError(`Cancel research: ${runError.message}`);
	if (!(runs ?? []).length) return { cancelled: 0 };
	const { data: targets, error: targetError } = await admin
		.from('knowledge_run_targets')
		.update(stop)
		.eq('run_id', input.runId)
		.eq('owner_user_id', userId)
		.in('status', ['queued', 'running'])
		.select('id');
	if (targetError) throw new KnowledgeStoreError(`Cancel research: ${targetError.message}`);
	return { cancelled: (targets ?? []).length };
}
