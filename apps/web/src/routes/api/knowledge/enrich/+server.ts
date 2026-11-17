// apps/web/src/routes/api/knowledge/enrich/+server.ts
/**
 * POST /api/knowledge/enrich
 *   { entity_ids: string[], fields?: string[], instructions?: string,
 *     entry_instructions?: { [entity_id]: string } }
 *
 * "Find more" / "Enrich N": queue background web research for up to 75 entries, split into
 * runs of 25 (tasker 164). Paid; capped per entry, per run, per day and at 3 runs at once in
 * startKnowledgeEnrichment. When a later run is refused, the entries already queued stay queued
 * and the response lists the rest under not_queued with the reason. Runs and queue jobs are
 * server-only, so this uses the admin client after checking the session; the store still
 * filters to what the caller can see.
 */
import type { RequestHandler } from './$types';
import {
	MAX_ENRICH_BATCH,
	MAX_ENRICH_ENTRY_NOTE_CHARS,
	MAX_ENRICH_INSTRUCTIONS_CHARS,
	startKnowledgeEnrichmentBatches
} from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { knowledgeErrorResponse, UUID_PATTERN } from '$lib/server/knowledge/knowledge.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	let body: {
		entity_ids?: unknown;
		fields?: unknown;
		instructions?: unknown;
		entry_instructions?: unknown;
	};
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	const entityIds = Array.isArray(body.entity_ids)
		? [
				...new Set(
					body.entity_ids.filter(
						(id): id is string => typeof id === 'string' && UUID_PATTERN.test(id)
					)
				)
			]
		: [];
	if (!entityIds.length) return ApiResponse.badRequest('Pick at least one entry');
	if (entityIds.length > MAX_ENRICH_BATCH)
		return ApiResponse.badRequest(`Pick up to ${MAX_ENRICH_BATCH} entries at a time`);
	const fields = Array.isArray(body.fields)
		? body.fields.filter((f): f is string => typeof f === 'string').slice(0, 20)
		: undefined;
	const instructions =
		typeof body.instructions === 'string'
			? body.instructions.slice(0, MAX_ENRICH_INSTRUCTIONS_CHARS)
			: undefined;
	const entryInstructions: Record<string, string> = {};
	if (body.entry_instructions && typeof body.entry_instructions === 'object') {
		for (const [id, note] of Object.entries(
			body.entry_instructions as Record<string, unknown>
		)) {
			if (entityIds.includes(id) && typeof note === 'string' && note.trim()) {
				entryInstructions[id] = note.trim().slice(0, MAX_ENRICH_ENTRY_NOTE_CHARS);
			}
		}
	}

	try {
		const result = await startKnowledgeEnrichmentBatches(createAdminSupabaseClient(), user.id, {
			entityIds,
			...(fields?.length ? { fields } : {}),
			...(instructions?.trim() ? { instructions } : {}),
			...(Object.keys(entryInstructions).length ? { entryInstructions } : {}),
			trigger: 'ui'
		});
		return ApiResponse.success({
			runs: result.runs.map((run) => ({
				runId: run.runId,
				budget_usd: run.budget_usd,
				targets: run.targets.length
			})),
			// Kept for older callers that started one run.
			runId: result.runs[0]?.runId ?? null,
			queued: result.runs.reduce((sum, run) => sum + run.targets.length, 0),
			budget_usd: Number(
				result.runs.reduce((sum, run) => sum + run.budget_usd, 0).toFixed(4)
			),
			skipped: result.skipped,
			not_queued: result.not_queued,
			refused: result.refused
		});
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not start the research');
	}
};
