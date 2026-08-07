// apps/web/src/routes/api/onto/search/+server.ts
/**
 * POST /api/onto/search
 * UI compatibility envelope over the shared cross-entity search implementation.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { createWebAgenticChatSharedReadContext } from '$lib/services/agentic-chat/tools/core/executors/web-access-adapter';
import {
	AgenticChatOntologySearchInputError,
	AgenticChatOntologySearchProjectNotFoundError,
	AgenticChatOntologySearchQueryError,
	AgenticChatToolAccessDeniedError,
	searchOntologyEntities,
	type SharedOntologySearchRequest
} from '@buildos/agentic-chat-runtime/tools';

class OntologySearchActorResolutionError extends Error {
	readonly cause: unknown;

	constructor(cause: unknown) {
		super('Failed to resolve user actor');
		this.cause = cause;
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) return ApiResponse.unauthorized('Authentication required');
		const userId = session.user.id;

		const body = (await request.json().catch(() => null)) as SharedOntologySearchRequest | null;
		if (!body || typeof body !== 'object') {
			return ApiResponse.badRequest('Invalid request body');
		}

		let actorPromise: Promise<string> | undefined;
		const getActorId = () => {
			actorPromise ??= ensureActorId(locals.supabase, userId).catch((error) => {
				throw new OntologySearchActorResolutionError(error);
			});
			return actorPromise;
		};
		const payload = await searchOntologyEntities(
			createWebAgenticChatSharedReadContext({
				supabase: locals.supabase as never,
				getActorId
			}),
			body
		);

		return ApiResponse.success(payload);
	} catch (error) {
		if (error instanceof AgenticChatOntologySearchInputError) {
			return ApiResponse.badRequest(error.message);
		}
		if (error instanceof AgenticChatToolAccessDeniedError) {
			return ApiResponse.forbidden('You do not have access to this project');
		}
		if (error instanceof AgenticChatOntologySearchProjectNotFoundError) {
			return ApiResponse.notFound('Project');
		}
		if (error instanceof AgenticChatOntologySearchQueryError) {
			console.error(`[Ontology Search API] ${error.stage} query failed:`, error.cause);
			return ApiResponse.databaseError(error.cause as never);
		}
		if (error instanceof OntologySearchActorResolutionError) {
			console.error('[Ontology Search API] Failed to resolve actor:', error.cause);
			return ApiResponse.internalError(error.cause, error.message);
		}

		console.error('[Ontology Search API] Unexpected error:', error);
		return ApiResponse.internalError(error, 'Failed to search ontology');
	}
};
