// apps/web/src/routes/api/knowledge/entities/+server.ts
/**
 * GET  /api/knowledge/entities?kind=person&filter=known&q=sam&limit=50&offset=0
 *        [&researched=yes|no][&sort=recent|name|researched]
 *      Browse the caller's knowledge graph (their private entries plus public ones they've
 *      recorded something about), with per-kind counts and researched / not researched counts.
 * POST /api/knowledge/entities  { kind, name, summary?, know?, own?, facts? }
 *      Add an entry by hand. `know` records "I know them"; `own` records "I own this".
 */
import type { RequestHandler } from './$types';
import {
	isKnowledgeKind,
	type KnowledgeKind,
	type KnowledgeWriteBatch,
	type KnowledgeWriteFact
} from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import {
	knowledgeErrorResponse,
	knowledgeStoreFor,
	UUID_PATTERN
} from '$lib/server/knowledge/knowledge.server';

const FILTERS = ['all', 'known', 'owned'] as const;
const RESEARCHED = ['any', 'yes', 'no'] as const;
const SORTS = ['recent', 'name', 'researched'] as const;

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
	return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const kindParam = url.searchParams.get('kind');
	const kinds = kindParam ? kindParam.split(',').filter(isKnowledgeKind) : undefined;
	const filterParam = url.searchParams.get('filter') ?? 'all';
	const filter = (FILTERS as readonly string[]).includes(filterParam)
		? (filterParam as (typeof FILTERS)[number])
		: 'all';
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
	const researched = pick(url.searchParams.get('researched'), RESEARCHED, 'any');
	const sort = pick(url.searchParams.get('sort'), SORTS, 'recent');
	const limit = Number(url.searchParams.get('limit') ?? 50);
	const offset = Number(url.searchParams.get('offset') ?? 0);

	try {
		const result = await knowledgeStoreFor(locals.supabase, user.id).list({
			...(kinds?.length ? { kinds } : {}),
			filter,
			researched,
			sort,
			...(q ? { query: q } : {}),
			limit: Number.isFinite(limit) ? limit : 50,
			offset: Number.isFinite(offset) ? offset : 0
		});
		return ApiResponse.success(result);
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not load your knowledge');
	}
};

interface CreateBody {
	kind?: string;
	name?: string;
	summary?: string;
	know?: boolean;
	own?: boolean;
	facts?: Array<{
		predicate?: string;
		value?: string;
		object_id?: string;
		qualifiers?: Record<string, unknown>;
	}>;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	let body: CreateBody;
	try {
		body = (await request.json()) as CreateBody;
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	const name = body.name?.trim() ?? '';
	if (!isKnowledgeKind(body.kind))
		return ApiResponse.badRequest('Pick what kind of entry this is');
	if (!name || name.length > 300)
		return ApiResponse.badRequest('Give it a name (up to 300 characters)');

	const kind = body.kind as KnowledgeKind;
	const facts: KnowledgeWriteFact[] = [];
	const batch: KnowledgeWriteBatch = {
		entities: [
			{
				ref: 'new',
				kind,
				name,
				...(body.summary?.trim() ? { summary: body.summary.trim() } : {})
			}
		],
		facts
	};
	if (body.know && kind === 'person') {
		batch.entities.push({ ref: 'self', self: true, kind: 'person', name: 'Me' });
		facts.push({
			subject: 'self',
			predicate: 'knows',
			object: 'new',
			qualifiers: { via: 'met' }
		});
	}
	if (body.own && ['website', 'channel', 'video', 'product', 'org'].includes(kind)) {
		if (!batch.entities.some((e) => e.ref === 'self')) {
			batch.entities.push({ ref: 'self', self: true, kind: 'person', name: 'Me' });
		}
		facts.push({ subject: 'self', predicate: 'owns', object: 'new' });
	}
	for (const fact of (body.facts ?? []).slice(0, 50)) {
		if (!fact.predicate) continue;
		if (fact.object_id && UUID_PATTERN.test(fact.object_id)) {
			facts.push({
				subject: 'new',
				predicate: fact.predicate,
				object: fact.object_id,
				qualifiers: fact.qualifiers
			});
		} else if (fact.value?.trim()) {
			facts.push({
				subject: 'new',
				predicate: fact.predicate,
				value: fact.value.trim(),
				qualifiers: fact.qualifiers
			});
		}
	}

	try {
		const receipt = await knowledgeStoreFor(locals.supabase, user.id).record(batch, {
			via: 'manual'
		});
		const created = receipt.entities.find((e) => e.ref === 'new');
		if (!created)
			return ApiResponse.badRequest(receipt.problems[0]?.message ?? 'Could not save that');
		return ApiResponse.success({
			entity_id: created.id,
			matched: created.matched,
			problems: receipt.problems
		});
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not save that');
	}
};
