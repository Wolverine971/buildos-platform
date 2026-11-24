// apps/web/src/lib/server/research-costs.ts
//
// Admin read of what "Find more" research cost, for /admin/research-costs. Research runs are
// each person's own rows (RLS), so this uses the service-role client and callers check that
// the signed-in person is an admin first.
//
// Reads never select a run's whole `stats` or `input`: they hold the searches, the pages read
// and what the person typed. Only the cost split and how the run was started are pulled out.
// An entry's name is returned only for the viewer's own lookups: who someone else researched
// is theirs.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type {
	ResearchCostSplit,
	ResearchLookupRow
} from '$lib/services/admin/research-costs/research-costs';

const PAGE_SIZE = 1000;
const ID_CHUNK = 100;
/** The most lookups the page loads for one window. */
export const RESEARCH_LOOKUP_LIMIT = 10_000;

type TargetRow = {
	id: string;
	run_id: string;
	owner_user_id: string | null;
	entity_id: string | null;
	status: string;
	cost_usd: number | string | null;
	facts_added: number | null;
	created_at: string;
	finished_at: string | null;
};

type RunRow = { id: string; trigger: string | null; costs: unknown };
type EntityRow = { id: string; name: string | null; kind: string | null };

function adminClient(): SupabaseClient {
	// Untyped: the JSON-path columns are not in the generated types.
	return createAdminSupabaseClient() as unknown as SupabaseClient;
}

async function byIds<T>(
	client: SupabaseClient,
	table: string,
	columns: string,
	ids: string[],
	what: string
): Promise<T[]> {
	const rows: T[] = [];
	// Ids travel in the query string, so ask in chunks that keep the URL short.
	for (let start = 0; start < ids.length; start += ID_CHUNK) {
		const { data, error } = await client
			.from(table)
			.select(columns)
			.in('id', ids.slice(start, start + ID_CHUNK));
		if (error) throw new Error(`Could not load ${what} (${error.code ?? 'error'})`);
		rows.push(...((data ?? []) as unknown as T[]));
	}
	return rows;
}

function splitFrom(costs: unknown, entityId: string | null): ResearchCostSplit | null {
	if (!entityId || !costs || typeof costs !== 'object') return null;
	const entry = (costs as Record<string, unknown>)[entityId];
	if (!entry || typeof entry !== 'object') return null;
	const value = entry as Record<string, unknown>;
	const number = (key: string) => {
		const n = Number(value[key]);
		return Number.isFinite(n) && n > 0 ? n : 0;
	};
	return {
		searchUsd: number('search_usd'),
		modelUsd: number('model_usd'),
		searches: number('searches'),
		rounds: number('rounds'),
		kind: typeof value.kind === 'string' ? value.kind : null
	};
}

/** Every entry researched inside the window, newest first, with whose it was. */
export async function listResearchLookups(
	days: number,
	viewerId: string
): Promise<{ rows: ResearchLookupRow[]; emails: Record<string, string>; truncated: boolean }> {
	const since = new Date(Date.now() - days * 86_400_000).toISOString();
	const client = adminClient();
	const targets: TargetRow[] = [];
	while (targets.length <= RESEARCH_LOOKUP_LIMIT) {
		const { data, error } = await client
			.from('knowledge_run_targets')
			.select(
				'id, run_id, owner_user_id, entity_id, status, cost_usd, facts_added, created_at, finished_at'
			)
			.gte('created_at', since)
			.order('created_at', { ascending: false })
			.order('id', { ascending: true })
			.range(targets.length, targets.length + PAGE_SIZE - 1);
		if (error) throw new Error(`Could not load research lookups (${error.code ?? 'error'})`);
		const page = (data ?? []) as unknown as TargetRow[];
		targets.push(...page);
		if (page.length < PAGE_SIZE) break;
	}
	const truncated = targets.length > RESEARCH_LOOKUP_LIMIT;
	const kept = targets.slice(0, RESEARCH_LOOKUP_LIMIT);

	const unique = (values: Array<string | null>) => [
		...new Set(values.filter((value): value is string => !!value))
	];
	const [runs, entities, users] = await Promise.all([
		byIds<RunRow>(
			client,
			'knowledge_runs',
			'id, trigger:input->>trigger, costs:stats->costs',
			unique(kept.map((t) => t.run_id)),
			'research runs'
		),
		byIds<EntityRow>(
			client,
			'knowledge_entities',
			'id, name, kind',
			unique(kept.map((t) => t.entity_id)),
			'researched entries'
		),
		byIds<{ id: string; email: string | null }>(
			client,
			'users',
			'id, email',
			unique(kept.map((t) => t.owner_user_id)),
			'who ran the research'
		)
	]);
	const runById = new Map(runs.map((run) => [run.id, run]));
	const entityById = new Map(entities.map((entity) => [entity.id, entity]));
	const emails: Record<string, string> = {};
	for (const user of users) if (user.email) emails[user.id] = user.email;

	const rows = kept.map((target): ResearchLookupRow => {
		const run = runById.get(target.run_id);
		const entity = target.entity_id ? entityById.get(target.entity_id) : undefined;
		return {
			id: target.id,
			userId: target.owner_user_id,
			entityName: target.owner_user_id === viewerId ? (entity?.name ?? null) : null,
			entityKind: entity?.kind ?? null,
			status: target.status,
			costUsd: Number(target.cost_usd ?? 0) || 0,
			factsAdded: Number(target.facts_added ?? 0) || 0,
			at: target.finished_at ?? target.created_at,
			trigger: run?.trigger ?? null,
			split: splitFrom(run?.costs, target.entity_id)
		};
	});
	return { rows, emails, truncated };
}
