// apps/web/scripts/agentic-e2e/semantic/run-tier1.ts
//
// Tier-1 semantic-discovery retrieval eval — the Phase 2 gate
// (docs/architecture/semantic-discovery/README.md §Eval plan, tasker/71).
//
// Drives the REAL tool path: each labeled theme goes through exploreProject()
// from @buildos/agentic-chat-runtime (query embedding → onto_search_semantic
// RPC → shared dedupe/normalize/rank), scoped to the seeded Driftline fixture.
//
//   cd apps/web
//   pnpm exec tsx scripts/agentic-e2e/semantic/run-tier1.ts            # eval only
//   pnpm exec tsx scripts/agentic-e2e/semantic/run-tier1.ts --embed    # embed fixture first
//   pnpm exec tsx scripts/agentic-e2e/semantic/run-tier1.ts --verbose  # show per-query results
//
// --embed composes + embeds the fixture's entities directly through the same
// shared-agent-ops module the worker job uses (hash-skip upserts), so the eval
// does not depend on the worker deploy or a full backfill.
//
// Scoring (per query):
//   recall     = expected hits found in top `limit` / expected hits
//   violation  = an expected-miss entity inside the top max(5, |hits|) window
// Gate: mean recall ≥ 0.75 AND zero violations. Exit 1 on failure.
//
// Env (apps/web/.env): PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY,
// DEMO_USER_EMAIL, PRIVATE_OPENAI_API_KEY (needs OpenAI org credits).

import {
	exploreProject,
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
	createOpenAiEmbeddingsClient
} from '@buildos/shared-agent-ops/embeddings/openai-embeddings';
import { createCustomClient } from '@buildos/supabase-client';
import dotenv from 'dotenv';
import path from 'path';
import { FIXTURE_PROJECT_NAME, TIER1_BATTERY } from './fixture';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.PRIVATE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || 'demo-author@build-os.com';
const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim() || process.env.PRIVATE_OPENAI_API_KEY?.trim();
const EMBED = process.argv.includes('--embed');
const VERBOSE = process.argv.includes('--verbose');

const RECALL_GATE = 0.75;

if (!SUPABASE_URL || !SERVICE_KEY) {
	console.error('Missing PUBLIC_SUPABASE_URL or PRIVATE_SUPABASE_SERVICE_KEY');
	process.exit(1);
}
if (!OPENAI_KEY) {
	console.error('Missing PRIVATE_OPENAI_API_KEY (embeddings are direct OpenAI)');
	process.exit(1);
}

const admin = createCustomClient(SUPABASE_URL, SERVICE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false }
});
const embeddings = createOpenAiEmbeddingsClient({ apiKey: OPENAI_KEY });

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

async function resolveFixture(): Promise<{ id: string; actorId: string }> {
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
	return { id: data[0]!.id, actorId };
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
			.select('entity_id, chunk_index, content_hash')
			.eq('entity_type', entityType)
			.in('entity_id', entityIds);
		if (existingError) throw new Error(`existing lookup failed: ${existingError.message}`);
		const existingHash = new Map<string, string>(
			(existingRows ?? []).map((row) => [`${row.entity_id}:${row.chunk_index}`, row.content_hash])
		);

		const pending: Array<{ entityId: string; chunk: ReturnType<typeof composeOntoEmbeddingChunks>[number] }> =
			[];
		for (const row of rows) {
			const entityId = String(row.id);
			for (const chunk of composeOntoEmbeddingChunks(entityType, row)) {
				if (existingHash.get(`${entityId}:${chunk.chunk_index}`) === chunk.content_hash) {
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
			embedding_model: ONTO_EMBEDDING_MODEL,
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
	for (const query of TIER1_BATTERY) {
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
	const { id: projectId, actorId } = await resolveFixture();
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

	const context: AgenticChatSharedReadContextV1 = {
		client: admin as never,
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
	const failures: string[] = [];

	console.log('');
	console.log('query                    recall   violations');
	console.log('─'.repeat(60));

	for (const query of TIER1_BATTERY) {
		const payload = await exploreProject(context, {
			theme: query.theme,
			project_id: projectId,
			limit: query.limit ?? 10
		});
		const returnedKeys = payload.results.map((row) => `${row.type}:${row.id}`);

		const hitIds = query.expected_hits.map((key) => expectationIds.get(key)!);
		const missIds = new Set(query.expected_misses.map((key) => expectationIds.get(key)!));

		const found = hitIds.filter((id) => returnedKeys.includes(id));
		const recall = hitIds.length === 0 ? 1 : found.length / hitIds.length;

		const violationWindow = Math.max(5, hitIds.length);
		const windowKeys = returnedKeys.slice(0, violationWindow);
		const violations = windowKeys.filter((id) => missIds.has(id));

		totalRecall += recall;
		totalViolations += violations.length;

		const marker = recall >= RECALL_GATE && violations.length === 0 ? ' ' : '✗';
		console.log(
			`${marker} ${query.id.padEnd(22)} ${found.length}/${hitIds.length}      ${violations.length}`
		);

		if (recall < RECALL_GATE || violations.length > 0) {
			const missing = hitIds
				.filter((id) => !returnedKeys.includes(id))
				.map(
					(id) =>
						[...expectationIds.entries()].find(([, resolvedId]) => resolvedId === id)?.[0] ?? id
				);
			failures.push(
				`${query.id}: recall=${recall.toFixed(2)} missing=[${missing.join('; ')}] violations=[${violations
					.map(
						(id) =>
							[...expectationIds.entries()].find(([, resolvedId]) => resolvedId === id)?.[0] ??
							id
					)
					.join('; ')}]${query.notes ? ` — ${query.notes}` : ''}`
			);
		}

		if (VERBOSE) {
			for (const row of payload.results.slice(0, violationWindow)) {
				const key = `${row.type}:${row.id}`;
				const tag = missIds.has(key) ? 'DECOY' : hitIds.includes(key) ? 'hit' : '·';
				console.log(
					`      ${tag.padEnd(6)} ${row.type.padEnd(11)} ${String(row.title ?? '').slice(0, 48)} (${row.score?.toFixed?.(3) ?? '?'})`
				);
			}
		}
	}

	const meanRecall = totalRecall / TIER1_BATTERY.length;
	const pass = meanRecall >= RECALL_GATE && totalViolations === 0;

	console.log('─'.repeat(60));
	console.log(
		`mean recall ${meanRecall.toFixed(3)} (gate ≥ ${RECALL_GATE})   decoy violations ${totalViolations} (gate 0)`
	);
	console.log(pass ? '\nTIER-1 GATE: PASS' : '\nTIER-1 GATE: FAIL');
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
