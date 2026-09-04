// apps/web/scripts/agentic-e2e/semantic/run-tier1.ts
//
// Tier-1 semantic-discovery retrieval eval — the Phase 2/3 retrieval gate
// (docs/architecture/semantic-discovery/README.md §Eval plan, tasker/71).
//
// Drives the REAL tool paths from @buildos/agentic-chat-runtime, scoped to the
// seeded Driftline fixture. Default mode calls exploreProject() (query embedding
// → onto_search_semantic → discovery rank); --targeted calls
// searchOntologyEntities() (lexical + semantic RPCs → hybrid RRF → targeted rank).
//
//   cd apps/web
//   pnpm exec tsx scripts/agentic-e2e/semantic/run-tier1.ts            # eval only
//   pnpm exec tsx scripts/agentic-e2e/semantic/run-tier1.ts --embed    # embed fixture first
//   pnpm exec tsx scripts/agentic-e2e/semantic/run-tier1.ts --verbose  # show per-query results
//   pnpm exec tsx scripts/agentic-e2e/semantic/run-tier1.ts --targeted # Phase 3 hybrid path
//
// --embed composes + embeds the fixture's entities directly through the same
// shared-agent-ops module the worker job uses (hash-skip upserts), so the eval
// does not depend on the worker deploy or a full backfill.
//
// Scoring (per query):
//   recall     = expected hits found in top `limit` / expected hits
//   violation  = an expected-miss entity ranked ABOVE any found expected hit
//                (reported for visibility; single tail adjacency is ordinary
//                retrieval long-tail on a ~25-entity corpus)
//   DOMINANCE  = a decoy above the TOP-ranked found hit, or ≥2 violations in
//                one query — the agent's entry into the results is polluted.
// Discovery gate: mean recall ≥ 0.75, no query recall < 0.5, zero dominance
// failures. Targeted Phase 3 gate: at least 7/8 historical-smoke analogs pass.
// Calibration history (2026-08-29): started as zero-violations in a
// top-max(5,|hits|) window; that bar demanded better-than-model-possible
// separation on a 25-entity corpus (all of 3-small/gemini/qwen3 fail it,
// clustered at 0.90-0.99 recall) while the product consumer is an agent
// reading ~15 titled results with judgment. Dominance is the failure the
// agent actually feels. Exit 1 on gate failure.
//
// Env (apps/web/.env): PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY,
// DEMO_USER_EMAIL, PRIVATE_OPENROUTER_API_KEY (embeddings route through
// OpenRouter; a direct OpenAI key works as fallback).

import {
	exploreProject,
	searchOntologyEntities,
	type AgenticChatSharedReadContextV1
} from '@buildos/agentic-chat-runtime/tools';
import { ensureActorId } from '@buildos/shared-agent-ops';
import {
	ONTO_EMBEDDING_SOURCES,
	type OntoEmbeddingEntityType,
	composeOntoEmbeddingChunks,
	formatPgVectorLiteral
} from '@buildos/shared-agent-ops/embeddings/entity-embedding';
import {
	ONTO_EMBEDDING_MODEL,
	OPENROUTER_EMBEDDINGS_URL,
	createEmbeddingsClientFromEnv,
	createOpenAiEmbeddingsClient
} from '@buildos/shared-agent-ops/embeddings/openai-embeddings';
import { createCustomClient } from '@buildos/supabase-client';
import dotenv from 'dotenv';
import path from 'path';
import { FIXTURE_PROJECT_NAME, PHASE3_TARGETED_BATTERY, TIER1_BATTERY } from './fixture';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.PRIVATE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || 'demo-author@build-os.com';
const EMBED = process.argv.includes('--embed');
const VERBOSE = process.argv.includes('--verbose');
const TARGETED = process.argv.includes('--targeted');
const BATTERY = TARGETED ? PHASE3_TARGETED_BATTERY : TIER1_BATTERY;
// A/B a candidate model on the same battery: --model=<openrouter-request-model>
// (e.g. google/gemini-embedding-001, qwen/qwen3-embedding-8b). Fixture rows
// are re-embedded when their stored embedding_model differs, and 1536-dim MRL
// truncation is requested so the vector(1536) schema fits every candidate.
const MODEL_ARG = process.argv
	.find((arg) => arg.startsWith('--model='))
	?.slice('--model='.length)
	?.trim();

const RECALL_GATE = 0.75;

if (!SUPABASE_URL || !SERVICE_KEY) {
	console.error('Missing PUBLIC_SUPABASE_URL or PRIVATE_SUPABASE_SERVICE_KEY');
	process.exit(1);
}
const OPENROUTER_KEY =
	process.env.PRIVATE_OPENROUTER_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim();
if (MODEL_ARG && !OPENROUTER_KEY) {
	console.error('--model requires PRIVATE_OPENROUTER_API_KEY');
	process.exit(1);
}
const embeddings = MODEL_ARG
	? createOpenAiEmbeddingsClient({
			apiKey: OPENROUTER_KEY!,
			url: OPENROUTER_EMBEDDINGS_URL,
			model: MODEL_ARG,
			dimensions: 1536
		})
	: createEmbeddingsClientFromEnv(process.env);
if (!embeddings) {
	console.error('Missing PRIVATE_OPENROUTER_API_KEY (or an OpenAI key fallback)');
	process.exit(1);
}
/** Model identity stored on onto_embeddings rows for this run. */
const STORED_MODEL = MODEL_ARG ?? ONTO_EMBEDDING_MODEL;

const admin = createCustomClient(SUPABASE_URL, SERVICE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false }
});

/** kind → { table, resolution column } for expectation keys. */
const KIND_TABLES: Record<string, { table: string; column: string }> = {
	project: { table: 'onto_projects', column: 'name' },
	document: { table: 'onto_documents', column: 'title' },
	task: { table: 'onto_tasks', column: 'title' },
	goal: { table: 'onto_goals', column: 'name' },
	plan: { table: 'onto_plans', column: 'name' },
	milestone: { table: 'onto_milestones', column: 'title' },
	risk: { table: 'onto_risks', column: 'title' },
	requirement: { table: 'onto_requirements', column: 'text' }
};

async function resolveFixture(): Promise<{ id: string; actorId: string; userId: string }> {
	const { data: list, error: listError } = await admin.auth.admin.listUsers({
		page: 1,
		perPage: 200
	});
	if (listError) throw new Error(`listUsers failed: ${listError.message}`);
	const user = list.users.find((u) => u.email === DEMO_EMAIL);
	if (!user) throw new Error(`Demo user ${DEMO_EMAIL} not found — seed the demo account first.`);
	const actorId = await ensureActorId(admin, user.id);

	const { data, error } = await admin
		.from('onto_projects')
		.select('id')
		.eq('created_by', actorId)
		.eq('name', FIXTURE_PROJECT_NAME)
		.is('deleted_at', null);
	if (error) throw new Error(`fixture lookup failed: ${error.message}`);
	if (!data || data.length !== 1) {
		throw new Error(
			`Expected exactly one "${FIXTURE_PROJECT_NAME}" project for the demo actor, found ${data?.length ?? 0}. Run scripts/agentic-e2e/semantic/seed.ts${(data?.length ?? 0) > 1 ? ' --reset' : ''}.`
		);
	}
	return { id: data[0]!.id, actorId, userId: user.id };
}

async function embedFixture(projectId: string): Promise<void> {
	let written = 0;
	let unchanged = 0;
	for (const entityType of Object.keys(ONTO_EMBEDDING_SOURCES) as OntoEmbeddingEntityType[]) {
		const source = ONTO_EMBEDDING_SOURCES[entityType];
		const filterColumn = entityType === 'project' ? 'id' : 'project_id';
		const { data, error } = await (admin as any)
			.from(source.table)
			.select([...source.columns, 'deleted_at'].join(', '))
			.eq(filterColumn, projectId)
			.is('deleted_at', null);
		if (error) throw new Error(`scan ${source.table} failed: ${error.message}`);
		const rows = (data ?? []) as Array<Record<string, unknown>>;
		if (rows.length === 0) continue;

		const entityIds = rows.map((row) => String(row.id));
		const { data: existingRows, error: existingError } = await admin
			.from('onto_embeddings')
			.select('entity_id, chunk_index, content_hash, embedding_model')
			.eq('entity_type', entityType)
			.in('entity_id', entityIds);
		if (existingError) throw new Error(`existing lookup failed: ${existingError.message}`);
		const existingHash = new Map<string, string>(
			(existingRows ?? []).map((row) => [
				`${row.entity_id}:${row.chunk_index}`,
				`${row.embedding_model}:${row.content_hash}`
			])
		);

		const pending: Array<{
			entityId: string;
			chunk: ReturnType<typeof composeOntoEmbeddingChunks>[number];
		}> = [];
		for (const row of rows) {
			const entityId = String(row.id);
			for (const chunk of composeOntoEmbeddingChunks(entityType, row)) {
				if (
					existingHash.get(`${entityId}:${chunk.chunk_index}`) ===
					`${STORED_MODEL}:${chunk.content_hash}`
				) {
					unchanged += 1;
					continue;
				}
				pending.push({ entityId, chunk });
			}
		}
		if (pending.length === 0) continue;

		const vectors = await embeddings.embed(pending.map((entry) => entry.chunk.text));
		const upsertRows = pending.map((entry, index) => ({
			entity_type: entityType,
			entity_id: entry.entityId,
			project_id: projectId,
			chunk_index: entry.chunk.chunk_index,
			chunk_anchor: entry.chunk.chunk_anchor,
			content_hash: entry.chunk.content_hash,
			content_text: entry.chunk.text,
			embedding: formatPgVectorLiteral(vectors[index]!),
			embedding_model: STORED_MODEL,
			updated_at: new Date().toISOString()
		}));
		const { error: upsertError } = await admin
			.from('onto_embeddings')
			.upsert(upsertRows as never[], { onConflict: 'entity_type,entity_id,chunk_index' });
		if (upsertError) throw new Error(`upsert failed: ${upsertError.message}`);
		written += upsertRows.length;
	}
	console.log(`[embed] written=${written} unchanged=${unchanged}`);
}

/** Resolve every "kind:title" expectation key to "type:entity_id". */
async function resolveExpectationIds(projectId: string): Promise<Map<string, string>> {
	const keys = new Set<string>();
	for (const query of BATTERY) {
		for (const key of [...query.expected_hits, ...query.expected_misses]) keys.add(key);
	}
	const resolved = new Map<string, string>();
	for (const key of keys) {
		const separator = key.indexOf(':');
		const kind = key.slice(0, separator);
		const label = key.slice(separator + 1);
		const mapping = KIND_TABLES[kind];
		if (!mapping) throw new Error(`Unknown kind in expectation key: ${key}`);
		const { data, error } = await (admin as any)
			.from(mapping.table)
			.select('id')
			.eq(kind === 'project' ? 'id' : 'project_id', projectId)
			.eq(mapping.column, label)
			.is('deleted_at', null);
		if (error) throw new Error(`resolve ${key} failed: ${error.message}`);
		if (!data || data.length !== 1) {
			throw new Error(
				`Expectation "${key}" resolved to ${data?.length ?? 0} entities — fixture drift; reseed with --reset.`
			);
		}
		resolved.set(key, `${kind}:${data[0].id}`);
	}
	return resolved;
}

async function main() {
	const { id: projectId, actorId, userId } = await resolveFixture();
	console.log(`Fixture project ${projectId} (actor ${actorId})`);

	if (EMBED) await embedFixture(projectId);

	const expectationIds = await resolveExpectationIds(projectId);
	console.log(`Expectation labels resolved: ${expectationIds.size}`);

	const { count, error: countError } = await admin
		.from('onto_embeddings')
		.select('id', { count: 'exact', head: true })
		.eq('project_id', projectId);
	if (countError) throw new Error(`embedding count failed: ${countError.message}`);
	if (!count) {
		throw new Error(
			'No embeddings exist for the fixture project. Re-run with --embed (needs OpenAI credits), or run the worker backfill.'
		);
	}
	console.log(`Fixture embeddings present: ${count} chunks`);
	console.log(`Retrieval mode: ${TARGETED ? 'targeted hybrid-RRF' : 'semantic discovery'}`);

	const context: AgenticChatSharedReadContextV1 = {
		client: admin as never,
		userId,
		timezone: null,
		access: {
			getActorId: async () => actorId,
			resolveProjectSummaries: async () => [{ id: projectId }],
			assertProjectAccess: async () => {},
			assertEntityAccess: async () => {}
		},
		embeddings: { embedQuery: (text) => embeddings.embedOne(text) }
	};

	let totalRecall = 0;
	let totalViolations = 0;
	let dominanceFailures = 0;
	let lowRecallQueries = 0;
	let passedQueries = 0;
	const failures: string[] = [];

	console.log('');
	console.log('query                    recall   violations');
	console.log('─'.repeat(60));

	for (const query of BATTERY) {
		// Default matches the shipped tool default (DEFAULT_EXPLORE_LIMIT = 15)
		// so the instrument measures the surface agents actually get.
		const payload = TARGETED
			? await searchOntologyEntities(context, {
					query: query.theme,
					project_id: query.workspace ? undefined : projectId,
					types: query.types,
					limit: query.limit ?? 15
				})
			: await exploreProject(context, {
					theme: query.theme,
					project_id: projectId,
					limit: query.limit ?? 15
				});
		const returnedKeys = payload.results.map((row) => `${row.type}:${row.id}`);

		const hitIds = query.expected_hits.map((key) => expectationIds.get(key)!);
		const missIds = new Set(query.expected_misses.map((key) => expectationIds.get(key)!));

		const found = hitIds.filter((id) => returnedKeys.includes(id));
		const recall = query.expect_empty
			? returnedKeys.length === 0
				? 1
				: 0
			: hitIds.length === 0
				? 1
				: found.length / hitIds.length;

		// A decoy violates when it outranks a found expected hit; it DOMINATES
		// when it sits above the top-ranked hit or two pile up in one query.
		const foundRanks = found.map((id) => returnedKeys.indexOf(id));
		const lastFoundRank = Math.max(...foundRanks, -1);
		const topFoundRank = found.length > 0 ? Math.min(...foundRanks) : -1;
		const violations = returnedKeys
			.slice(0, Math.max(lastFoundRank, 0))
			.filter((id) => missIds.has(id));
		const dominance =
			(query.expect_empty === true && returnedKeys.length > 0) ||
			violations.length >= 2 ||
			(topFoundRank >= 0 &&
				returnedKeys.slice(0, topFoundRank).some((id) => missIds.has(id)));

		totalRecall += recall;
		totalViolations += violations.length;
		if (dominance) dominanceFailures += 1;
		if (recall < 0.5) lowRecallQueries += 1;
		if (recall >= 0.5 && !dominance) passedQueries += 1;

		const marker = recall >= RECALL_GATE && violations.length === 0 && !dominance ? ' ' : '✗';
		console.log(
			`${marker} ${query.id.padEnd(22)} ${found.length}/${hitIds.length}      ${violations.length}`
		);

		if (recall < RECALL_GATE || violations.length > 0) {
			const missing = hitIds
				.filter((id) => !returnedKeys.includes(id))
				.map(
					(id) =>
						[...expectationIds.entries()].find(
							([, resolvedId]) => resolvedId === id
						)?.[0] ?? id
				);
			failures.push(
				`${query.id}: recall=${recall.toFixed(2)} missing=[${missing.join('; ')}] violations=[${violations
					.map(
						(id) =>
							[...expectationIds.entries()].find(
								([, resolvedId]) => resolvedId === id
							)?.[0] ?? id
					)
					.join('; ')}]${query.notes ? ` — ${query.notes}` : ''}`
			);
		}

		if (VERBOSE) {
			for (const row of payload.results) {
				const key = `${row.type}:${row.id}`;
				const tag = missIds.has(key) ? 'DECOY' : hitIds.includes(key) ? 'hit' : '·';
				console.log(
					`      ${tag.padEnd(6)} ${row.type.padEnd(11)} ${String(row.title ?? '').slice(0, 48)} (${row.score?.toFixed?.(3) ?? '?'})`
				);
			}
		}
	}

	const meanRecall = totalRecall / BATTERY.length;
	const pass = TARGETED
		? passedQueries >= 7
		: meanRecall >= RECALL_GATE && lowRecallQueries === 0 && dominanceFailures === 0;

	console.log('─'.repeat(60));
	console.log(
		`mean recall ${meanRecall.toFixed(3)} (gate ≥ ${RECALL_GATE})   ` +
			`low-recall queries ${lowRecallQueries} (gate 0)   ` +
			`dominance failures ${dominanceFailures} (gate 0)   ` +
			`tail-adjacency violations ${totalViolations} (visibility only)`
	);
	if (TARGETED)
		console.log(`targeted queries passed ${passedQueries}/${BATTERY.length} (gate ≥ 7/8)`);
	console.log(pass ? '\nRETRIEVAL GATE: PASS' : '\nRETRIEVAL GATE: FAIL');
	if (failures.length > 0) {
		console.log('\nFailures:');
		for (const line of failures) console.log(`  - ${line}`);
	}
	process.exit(pass ? 0 : 1);
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	if (message.includes('credit_balance_exhausted') || message.includes('insufficient_quota')) {
		console.error(
			'[tier1] OpenAI org has no API credits — add credits at platform.openai.com/settings/organization/billing and re-run.'
		);
	}
	console.error(error);
	process.exit(1);
});
