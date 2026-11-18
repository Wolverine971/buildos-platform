// apps/web/src/routes/api/knowledge/lens/adopt/+server.ts
/**
 * POST /api/knowledge/lens/adopt
 *   { project_id, record_kind: 'task'|'document', record_id, from_entity_id, into_entity_id }
 *
 * "Add to my People" on a name another member filed (tasker 168): copies the public-web facts
 * their entry shows in this project into the caller's OWN entry, each with its web source.
 * The lens is recomputed here (the client's copy is never trusted). Never copied: contact
 * details or anything else they only shared with you (a grant can be revoked, a copy couldn't),
 * and facts with no public source. → { copied }
 */
import type { RequestHandler } from './$types';
import type { KnowledgeWriteBatch } from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import {
	knowledgeErrorResponse,
	knowledgeStoreFor,
	UUID_PATTERN
} from '$lib/server/knowledge/knowledge.server';
import { loadProjectLens } from '$lib/server/knowledge/sharing.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	const ids = ['project_id', 'record_id', 'from_entity_id', 'into_entity_id'].map((key) =>
		typeof body[key] === 'string' ? (body[key] as string) : ''
	);
	if (!ids.every((id) => UUID_PATTERN.test(id))) return ApiResponse.badRequest('Invalid ids');
	const [projectId, recordId, fromId, intoId] = ids as [string, string, string, string];
	const recordKind = body.record_kind === 'document' ? 'document' : 'task';

	try {
		const store = knowledgeStoreFor(locals.supabase, user.id);
		const mine = await store.getEntity(intoId);
		if (!mine || mine.entity.scope !== 'private') return ApiResponse.notFound('Your entry');
		const entries = await loadProjectLens(locals.supabase, {
			projectId,
			recordKind,
			recordIds: [recordId]
		});
		const entry = entries.find((e) => e.entity.id === fromId);
		if (!entry) return ApiResponse.success({ copied: 0 });

		const batch: KnowledgeWriteBatch = { entities: [], facts: [], sources: [] };
		const sourceRefs = new Map<string, string>();
		for (const fact of entry.facts) {
			if (fact.via !== 'shared' || !fact.source_url) continue;
			let ref = sourceRefs.get(fact.source_url);
			if (!ref) {
				ref = `s${sourceRefs.size}`;
				sourceRefs.set(fact.source_url, ref);
				batch.sources!.push({ ref, type: 'web', url: fact.source_url });
			}
			if (fact.object_name && fact.object_kind) {
				const objectRef = `o${batch.entities.length}`;
				batch.entities.push({
					ref: objectRef,
					kind: fact.object_kind as never,
					name: fact.object_name
				});
				batch.facts.push({
					subject: intoId,
					predicate: fact.predicate,
					object: objectRef,
					qualifiers: fact.qualifiers ?? undefined,
					sources: [ref]
				});
			} else if (fact.value) {
				batch.facts.push({
					subject: intoId,
					predicate: fact.predicate,
					value: fact.value,
					qualifiers: fact.qualifiers ?? undefined,
					sources: [ref]
				});
			}
		}
		if (!batch.facts.length) return ApiResponse.success({ copied: 0 });
		const receipt = await store.record(batch, { via: 'manual' });
		return ApiResponse.success({ copied: receipt.facts.added });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not copy those details');
	}
};
