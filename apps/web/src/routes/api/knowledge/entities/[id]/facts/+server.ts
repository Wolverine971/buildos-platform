// apps/web/src/routes/api/knowledge/entities/[id]/facts/+server.ts
/**
 * POST /api/knowledge/entities/:id/facts
 *   { facts: [{ predicate, value? , object_id?, object_new?: { kind, name }, qualifiers? }] }
 * Add details or relationships by hand. A new related entry (object_new) is created privately.
 */
import type { RequestHandler } from './$types';
import { isKnowledgeKind, type KnowledgeWriteBatch } from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import {
	knowledgeErrorResponse,
	knowledgeStoreFor,
	UUID_PATTERN
} from '$lib/server/knowledge/knowledge.server';

interface FactInput {
	predicate?: string;
	value?: string;
	object_id?: string;
	object_new?: { kind?: string; name?: string };
	qualifiers?: Record<string, unknown>;
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID_PATTERN.test(params.id)) return ApiResponse.badRequest('Invalid id');

	let body: { facts?: FactInput[] };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	const inputs = (body.facts ?? []).slice(0, 50);
	if (!inputs.length) return ApiResponse.badRequest('Nothing to add');

	const batch: KnowledgeWriteBatch = { entities: [], facts: [] };
	inputs.forEach((fact, i) => {
		if (!fact.predicate) return;
		if (fact.object_new?.name?.trim() && isKnowledgeKind(fact.object_new.kind)) {
			const ref = `new${i}`;
			batch.entities.push({
				ref,
				kind: fact.object_new.kind,
				name: fact.object_new.name.trim()
			});
			batch.facts.push({
				subject: params.id,
				predicate: fact.predicate,
				object: ref,
				qualifiers: fact.qualifiers
			});
		} else if (fact.object_id && UUID_PATTERN.test(fact.object_id)) {
			batch.facts.push({
				subject: params.id,
				predicate: fact.predicate,
				object: fact.object_id,
				qualifiers: fact.qualifiers
			});
		} else if (fact.value?.trim()) {
			batch.facts.push({
				subject: params.id,
				predicate: fact.predicate,
				value: fact.value.trim(),
				qualifiers: fact.qualifiers
			});
		}
	});

	try {
		const receipt = await knowledgeStoreFor(locals.supabase, user.id).record(batch, {
			via: 'manual'
		});
		if (receipt.problems.length && !receipt.facts.added && !receipt.facts.existing) {
			return ApiResponse.badRequest(receipt.problems[0]!.message);
		}
		return ApiResponse.success({ facts: receipt.facts, problems: receipt.problems });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not save that');
	}
};
