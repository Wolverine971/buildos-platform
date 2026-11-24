// apps/web/src/lib/server/knowledge/company-locate.server.ts
//
// Web glue for "find where my companies are" (tasker 170): the banner's state, the "Which
// one?" questions and their answers, and which organizations a web search could still try.
// Reads use the caller's own client (RLS: owners read their runs and lookups). The lookup run
// itself is started with the admin client in the route, like every knowledge run.

import { env } from '$env/dynamic/private';
import {
	LOCATED_FACT_STATUSES,
	LOCATE_LEFTOVER_OUTCOMES,
	LOCATE_STALE_RUN_MS,
	KNOWLEDGE_LOCATE_RUN_TYPE,
	KnowledgeStoreError,
	companyFactsBatch,
	parsePlaceName,
	readLocateStats,
	type CompanyOption,
	type CompanyQuestionChoice,
	type KnowledgeCompanyQuestion,
	type KnowledgeDataClient,
	type KnowledgeLocateTray,
	type KnowledgeStore
} from '@buildos/shared-agent-ops/knowledge';

/**
 * Who may run the paid web search for companies the free lookup could not place. A comma-
 * separated list of user ids, or "*" for everyone. Unset: nobody (DJ, 2026-11-23: his account
 * only until accuracy and cost are measured).
 */
export const COMPANY_WEB_SEARCH_USERS_ENV = 'KNOWLEDGE_LOCATE_WEB_SEARCH_USER_IDS';

export function companyWebSearchAllowed(
	userId: string,
	setting: string | undefined = env[COMPANY_WEB_SEARCH_USERS_ENV]
): boolean {
	const entries = (setting ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
	return entries.includes('*') || entries.includes(userId);
}

/** The banner stops showing a finished run after this long. */
export const LOCATE_BANNER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** `in` filters go in the URL: keep each one well under the length limit. */
const ID_CHUNK = 150;

async function inChunks<T>(
	ids: readonly string[],
	read: (chunk: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
	const rows: T[] = [];
	for (let i = 0; i < ids.length; i += ID_CHUNK) {
		const { data, error } = await read(ids.slice(i, i + ID_CHUNK));
		if (error) throw new KnowledgeStoreError(error.message);
		rows.push(...((data ?? []) as T[]));
	}
	return rows;
}

/**
 * Organizations the free lookup could not place and nothing has placed since: no source knew
 * the name, too many companies share it, or the user answered "None of these". One that has
 * been researched, or is being researched now, is not offered again.
 */
export async function leftoverOrganizations(
	db: KnowledgeDataClient,
	userId: string
): Promise<string[]> {
	const { data, error } = await db
		.from('knowledge_company_lookups')
		.select(
			'entity_id, outcome, question_status, entity:knowledge_entities!inner(id, status, enriched_at)'
		)
		.eq('owner_user_id', userId)
		.or(`outcome.in.(${LOCATE_LEFTOVER_OUTCOMES.join(',')}),question_status.eq.none_of_these`)
		.order('checked_at', { ascending: true })
		.limit(2000);
	if (error) throw new KnowledgeStoreError(error.message);
	const open = (
		(data ?? []) as Array<{
			entity_id: string;
			entity: { status: string; enriched_at: string | null } | null;
		}>
	)
		.filter((row) => row.entity?.status === 'active' && !row.entity.enriched_at)
		.map((row) => row.entity_id);
	if (!open.length) return [];

	const [located, researching] = await Promise.all([
		inChunks<{ entity_id: string }>(open, (chunk) =>
			db
				.from('knowledge_facts')
				.select('entity_id')
				.eq('owner_user_id', userId)
				.eq('predicate', 'located_in')
				.in('status', [...LOCATED_FACT_STATUSES])
				.in('entity_id', chunk)
		),
		inChunks<{ entity_id: string }>(open, (chunk) =>
			db
				.from('knowledge_run_targets')
				.select('entity_id')
				.eq('owner_user_id', userId)
				.in('status', ['queued', 'running'])
				.in('entity_id', chunk)
		)
	]);
	const settled = new Set([...located, ...researching].map((row) => row.entity_id));
	return open.filter((id) => !settled.has(id));
}

/** The latest lookup run and what is waiting on the user, for the banner on /knowledge. */
export async function loadLocateTray(
	db: KnowledgeDataClient,
	userId: string,
	now = new Date()
): Promise<KnowledgeLocateTray | null> {
	const [latest, questions] = await Promise.all([
		db
			.from('knowledge_runs')
			.select('id, status, stats, started_at, finished_at, created_at, updated_at')
			.eq('owner_user_id', userId)
			.eq('run_type', KNOWLEDGE_LOCATE_RUN_TYPE)
			.order('created_at', { ascending: false })
			.limit(1),
		db
			.from('knowledge_company_lookups')
			.select('id', { count: 'exact', head: true })
			.eq('owner_user_id', userId)
			.eq('question_status', 'open')
	]);
	if (latest.error) throw new KnowledgeStoreError(latest.error.message);
	const run = (
		(latest.data ?? []) as Array<{
			id: string;
			status: KnowledgeLocateTray['status'];
			stats: unknown;
			started_at: string | null;
			finished_at: string | null;
			created_at: string;
			updated_at: string;
		}>
	)[0];
	const openQuestions = questions.error ? 0 : (questions.count ?? 0);
	if (!run) return null;

	let status = run.status;
	const live = status === 'queued' || status === 'running';
	// A run nothing has touched for half an hour was left by a dead worker: show it as stopped
	// so the banner offers to continue instead of spinning forever.
	if (live && now.getTime() - Date.parse(run.updated_at) > LOCATE_STALE_RUN_MS)
		status = 'partial';
	const finishedAt = run.finished_at ?? run.updated_at;
	const stillLive = status === 'queued' || status === 'running';
	if (
		!stillLive &&
		!openQuestions &&
		now.getTime() - Date.parse(finishedAt) > LOCATE_BANNER_WINDOW_MS
	)
		return null;

	const webSearch = companyWebSearchAllowed(userId);
	// Counting what is left reads several tables: only once the run has stopped moving.
	const leftover = stillLive ? 0 : (await leftoverOrganizations(db, userId)).length;
	return {
		run_id: run.id,
		status,
		stats: readLocateStats(run.stats),
		started_at: run.started_at,
		finished_at: stillLive ? null : finishedAt,
		open_questions: openQuestions,
		leftover,
		web_search: webSearch
	};
}

/** Open "Which one?" questions, the companies with the most of the user's people first. */
export async function listCompanyQuestions(
	db: KnowledgeDataClient,
	userId: string,
	options: { entityId?: string; limit?: number } = {}
): Promise<KnowledgeCompanyQuestion[]> {
	let query = db
		.from('knowledge_company_lookups')
		.select(
			'id, entity_id, options, options_total, checked_at, entity:knowledge_entities!inner(id, name, status)'
		)
		.eq('owner_user_id', userId)
		.eq('question_status', 'open')
		.order('checked_at', { ascending: true })
		.limit(Math.min(Math.max(options.limit ?? 200, 1), 500));
	if (options.entityId) query = query.eq('entity_id', options.entityId);
	const { data, error } = await query;
	if (error) throw new KnowledgeStoreError(error.message);
	const rows = (
		(data ?? []) as Array<{
			id: string;
			entity_id: string;
			options: unknown;
			options_total: number;
			checked_at: string;
			entity: { name: string; status: string } | null;
		}>
	).filter((row) => row.entity?.status === 'active');
	if (!rows.length) return [];

	// The user's own clue for each question: who they know there, and as what.
	const people = await inChunks<{
		object_entity_id: string;
		qualifiers: { title?: unknown } | null;
		person: { id: string; name: string; status: string } | null;
	}>(
		rows.map((row) => row.entity_id),
		(chunk) =>
			db
				.from('knowledge_facts')
				.select(
					'object_entity_id, qualifiers, person:knowledge_entities!knowledge_facts_entity_id_fkey(id, name, status)'
				)
				.eq('owner_user_id', userId)
				.eq('predicate', 'works_at')
				.eq('status', 'active')
				.in('object_entity_id', chunk)
				.limit(1000)
	);
	const byOrg = new Map<string, KnowledgeCompanyQuestion['people']>();
	for (const fact of people) {
		if (!fact.person || fact.person.status !== 'active') continue;
		const list = byOrg.get(fact.object_entity_id) ?? [];
		if (list.some((person) => person.id === fact.person!.id)) continue;
		const title = fact.qualifiers?.title;
		list.push({
			id: fact.person.id,
			name: fact.person.name,
			title: typeof title === 'string' && title.trim() ? title.trim() : null
		});
		byOrg.set(fact.object_entity_id, list);
	}

	return rows
		.map((row) => ({
			id: row.id,
			entity_id: row.entity_id,
			name: row.entity!.name,
			options: Array.isArray(row.options) ? (row.options as CompanyOption[]) : [],
			options_total: row.options_total,
			people: (byOrg.get(row.entity_id) ?? []).slice(0, 5),
			checked_at: row.checked_at
		}))
		.sort((a, b) => b.people.length - a.people.length);
}

/** The user's place entries by canonical key, so an answer reuses a town already saved. */
async function placesByKey(db: KnowledgeDataClient, userId: string): Promise<Map<string, string>> {
	const { data } = await db
		.from('knowledge_entities')
		.select('id, name')
		.eq('owner_user_id', userId)
		.eq('scope', 'private')
		.eq('kind', 'place')
		.eq('status', 'active')
		.order('created_at')
		.limit(1000);
	const places = new Map<string, string>();
	for (const row of (data ?? []) as Array<{ id: string; name: string }>) {
		const key = parsePlaceName(row.name)?.key;
		if (key && !places.has(key)) places.set(key, row.id);
	}
	return places;
}

export interface CompanyAnswerResult {
	status: 'answered' | 'none_of_these' | 'skipped';
	/** Details saved on the organization (an answer only). */
	facts_added: number;
}

/**
 * Answer a "Which one?" question. Picking a company saves its details as known, as the user's
 * own word (not research: it is their choice, and their later edits are not overridden by it).
 * "None of these" leaves the organization for a web search; "Skip" just closes the question.
 */
export async function answerCompanyQuestion(
	db: KnowledgeDataClient,
	store: KnowledgeStore,
	userId: string,
	questionId: string,
	answer: CompanyQuestionChoice
): Promise<CompanyAnswerResult> {
	const { data: row, error } = await db
		.from('knowledge_company_lookups')
		.select('id, entity_id, options, question_status')
		.eq('id', questionId)
		.eq('owner_user_id', userId)
		.maybeSingle();
	if (error) throw new KnowledgeStoreError(error.message);
	const question = row as {
		id: string;
		entity_id: string;
		options: unknown;
		question_status: string | null;
	} | null;
	if (!question || question.question_status === null)
		throw new KnowledgeStoreError('Question not found', 'NOT_FOUND');
	if (question.question_status !== 'open')
		throw new KnowledgeStoreError('That question was already answered.', 'INVALID');

	let factsAdded = 0;
	let chosenKey: string | null = null;
	if (answer.choice === 'option') {
		const options = Array.isArray(question.options)
			? (question.options as CompanyOption[])
			: [];
		const option = options.find((candidate) => candidate.key === answer.key);
		if (!option)
			throw new KnowledgeStoreError('That company is not one of the choices.', 'INVALID');
		chosenKey = option.key;
		const batch = companyFactsBatch({
			entityId: question.entity_id,
			option,
			confirmed: true,
			existingPlaces: await placesByKey(db, userId)
		});
		const receipt = await store.record(batch, { via: 'manual' });
		factsAdded = receipt.facts.added;
	}

	const status: CompanyAnswerResult['status'] =
		answer.choice === 'option' ? 'answered' : answer.choice;
	const now = new Date().toISOString();
	// Only while it is still open: two tabs answering the same question keep the first answer.
	const { error: updateError, count } = await db
		.from('knowledge_company_lookups')
		.update(
			{ question_status: status, chosen_key: chosenKey, answered_at: now, updated_at: now },
			{ count: 'exact' }
		)
		.eq('id', question.id)
		.eq('owner_user_id', userId)
		.eq('question_status', 'open');
	if (updateError) throw new KnowledgeStoreError(updateError.message);
	if (!count) throw new KnowledgeStoreError('That question was already answered.', 'INVALID');
	return { status, facts_added: factsAdded };
}
