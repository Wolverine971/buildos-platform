// apps/worker/src/workers/knowledge/knowledgeSortSweep.ts
//
// What matters to you (tasker 169): every hour, sort the people and orgs that readers added to
// a user's knowledge graph since the last run. Each entry is either part of the user's world
// (shown on /knowledge), just mentioned (kept and searchable, off the default list), not a name
// at all (hidden, reversible) or the same as a similar entry (merge suggestion). Batched: a user
// is sorted once 25 entries wait or the oldest has waited a day, 20 entries per model call
// (~$0.0006 a call). Structured signals settle most entries for free; the user's own answers
// always win and are passed to the model as examples.
//
// Off unless KNOWLEDGE_SORT_USER_IDS is set: a comma-separated list of user ids, or * for
// everyone. It spends model money, so it is opt-in per environment.

import {
	type IdentityDecider,
	type KnowledgeDataClient,
	findEntriesToSort,
	sortKnowledgeEntries
} from '@buildos/shared-agent-ops/knowledge';
import { getKnowledgeDecider } from './knowledgeEnrichWorker';

/** Users sorted per run, and model-judged entries per user per run (10 calls). */
const MAX_USERS_PER_RUN = 20;
const MAX_MODEL_ENTRIES_PER_USER = 200;

export function knowledgeSortUsers(env = process.env): '*' | string[] | null {
	const raw = env.KNOWLEDGE_SORT_USER_IDS?.trim();
	if (!raw) return null;
	if (raw === '*') return '*';
	const ids = raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return ids.length ? ids : null;
}

export interface KnowledgeSortSweepResult {
	users: number;
	sorted: number;
	modelAsked: number;
	calls: number;
	costUsd: number;
	notAName: number;
	mergeSuggestions: number;
	failed: number;
}

export async function runKnowledgeSortSweep(deps: {
	db: KnowledgeDataClient;
	users: '*' | string[];
	decider?: IdentityDecider | null;
	now?: () => Date;
	log?: (message: string, detail?: unknown) => void;
}): Promise<KnowledgeSortSweepResult> {
	const decider = deps.decider === undefined ? getKnowledgeDecider() : deps.decider;
	const total: KnowledgeSortSweepResult = {
		users: 0,
		sorted: 0,
		modelAsked: 0,
		calls: 0,
		costUsd: 0,
		notAName: 0,
		mergeSuggestions: 0,
		failed: 0
	};
	// Without the model nothing ambiguous can be decided; don't churn.
	if (!decider) return total;

	const userIds = deps.users === '*' ? await usersWithUnsortedEntries(deps.db) : deps.users;
	for (const userId of userIds.slice(0, MAX_USERS_PER_RUN)) {
		try {
			const waiting = await findEntriesToSort(deps.db, userId, deps.now);
			if (!waiting.ripe) continue;
			const result = await sortKnowledgeEntries(deps.db, userId, waiting.ids, {
				decider,
				maxModelEntries: MAX_MODEL_ENTRIES_PER_USER,
				now: deps.now
			});
			total.users++;
			total.sorted += result.sorted;
			total.modelAsked += result.modelAsked;
			total.calls += result.calls;
			total.costUsd += result.costUsd;
			total.notAName += result.notAName;
			total.mergeSuggestions += result.mergeSuggestions;
			deps.log?.('🗂️ Knowledge sorted', {
				userId,
				...waiting.why,
				inner: result.inner,
				public: result.public,
				unsure: result.unsure,
				notAName: result.notAName,
				merges: result.mergeSuggestions,
				calls: result.calls,
				costUsd: Number(result.costUsd.toFixed(4))
			});
		} catch (error) {
			total.failed++;
			deps.log?.('🗂️ Knowledge sort failed', {
				userId,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}
	return total;
}

/** Owners with at least one never-sorted person or org (the cheap first cut for "*"). */
async function usersWithUnsortedEntries(db: KnowledgeDataClient): Promise<string[]> {
	const { data, error } = await db
		.from('knowledge_entities')
		.select('owner_user_id')
		.eq('scope', 'private')
		.eq('status', 'active')
		.in('kind', ['person', 'org'])
		.or('circle_source.is.null,circle_source.eq.model')
		.limit(5000);
	if (error) throw new Error(`Find users to sort: ${error.message}`);
	return [
		...new Set(
			((data ?? []) as Array<{ owner_user_id: string | null }>)
				.map((r) => r.owner_user_id)
				.filter((id): id is string => Boolean(id))
		)
	];
}
