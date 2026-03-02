// apps/web/src/routes/api/profile/chapters/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	createProfileChapter,
	insertProfileAuditEvent,
	listProfileChapters,
	resolveProfileActorId
} from '$lib/server/user-profile.service';

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized('Authentication required');
	}

	try {
		const { profile, chapters } = await listProfileChapters(supabase, user.id);
		return ApiResponse.success({
			profile: {
				id: profile.id,
				user_id: profile.user_id,
				doc_structure: profile.doc_structure,
				extraction_enabled: profile.extraction_enabled,
				summary: profile.summary,
				safe_summary: profile.safe_summary,
				summary_updated_at: profile.summary_updated_at,
				created_at: profile.created_at,
				updated_at: profile.updated_at
			},
			chapters
		});
	} catch (error) {
		console.error('[Profile API] Failed to list chapters:', error);
		return ApiResponse.internalError(error, 'Failed to list profile chapters');
	}
};

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return ApiResponse.badRequest('Invalid request body');
	}

	const payload = body as {
		title?: unknown;
		type_key?: unknown;
		content?: unknown;
		summary?: unknown;
		sensitivity?: unknown;
		usage_scope?: unknown;
		parent_id?: unknown;
		position?: unknown;
		props?: unknown;
	};

	if (typeof payload.title !== 'string' || payload.title.trim().length === 0) {
		return ApiResponse.badRequest('title is required');
	}

	const typeKey = typeof payload.type_key === 'string' ? payload.type_key : null;
	const content = typeof payload.content === 'string' ? payload.content : null;
	const summary = typeof payload.summary === 'string' ? payload.summary : null;
	const sensitivity =
		payload.sensitivity === 'standard' || payload.sensitivity === 'sensitive'
			? payload.sensitivity
			: 'standard';
	const usageScope =
		payload.usage_scope === 'all_agents' ||
		payload.usage_scope === 'profile_only' ||
		payload.usage_scope === 'never_prompt'
			? payload.usage_scope
			: 'all_agents';
	const parentId = typeof payload.parent_id === 'string' ? payload.parent_id : null;
	const position = typeof payload.position === 'number' ? payload.position : undefined;

	try {
		const actorId = await resolveProfileActorId(supabase, user.id);
		const { profile, chapter } = await createProfileChapter({
			supabase,
			userId: user.id,
			title: payload.title,
			typeKey,
			content,
			summary,
			sensitivity,
			usageScope,
			parentId,
			position,
			props:
				payload.props && typeof payload.props === 'object' && !Array.isArray(payload.props)
					? (payload.props as Record<string, any>)
					: undefined
		});

		await insertProfileAuditEvent({
			supabase,
			profileId: profile.id,
			actorId,
			accessType: 'doc_write',
			contextType: 'profile',
			documentIds: [chapter.id],
			reason: 'profile_chapter_create'
		});

		return ApiResponse.success({ chapter }, 'Chapter created');
	} catch (error) {
		console.error('[Profile API] Failed to create chapter:', error);
		return ApiResponse.internalError(error, 'Failed to create profile chapter');
	}
};
