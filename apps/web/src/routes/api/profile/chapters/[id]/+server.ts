// apps/web/src/routes/api/profile/chapters/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	deleteProfileChapter,
	getProfileChapter,
	insertProfileAuditEvent,
	resolveProfileActorId,
	updateProfileChapter
} from '$lib/server/user-profile.service';

export const GET: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const chapterId = params.id;
	if (!chapterId) {
		return ApiResponse.badRequest('Chapter id is required');
	}

	try {
		const actorId = await resolveProfileActorId(supabase, user.id);
		const { profile, chapter } = await getProfileChapter(supabase, user.id, chapterId);
		if (!chapter) return ApiResponse.notFound('Profile chapter');

		await insertProfileAuditEvent({
			supabase,
			profileId: profile.id,
			actorId,
			accessType: 'doc_read',
			contextType: 'profile',
			documentIds: [chapterId],
			reason: 'profile_chapter_get'
		});

		return ApiResponse.success({ chapter });
	} catch (error) {
		console.error('[Profile API] Failed to fetch chapter:', error);
		return ApiResponse.internalError(error, 'Failed to load profile chapter');
	}
};

export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { safeGetSession, supabase }
}) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const chapterId = params.id;
	if (!chapterId) {
		return ApiResponse.badRequest('Chapter id is required');
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
		props?: unknown;
	};

	try {
		const actorId = await resolveProfileActorId(supabase, user.id);
		const { chapter, updated } = await updateProfileChapter({
			supabase,
			userId: user.id,
			chapterId,
			title:
				typeof payload.title === 'string' || payload.title === null
					? payload.title
					: undefined,
			typeKey:
				typeof payload.type_key === 'string' || payload.type_key === null
					? payload.type_key
					: undefined,
			content:
				typeof payload.content === 'string' || payload.content === null
					? payload.content
					: undefined,
			summary:
				typeof payload.summary === 'string' || payload.summary === null
					? payload.summary
					: undefined,
			sensitivity:
				payload.sensitivity === 'standard' || payload.sensitivity === 'sensitive'
					? payload.sensitivity
					: undefined,
			usageScope:
				payload.usage_scope === 'all_agents' ||
				payload.usage_scope === 'profile_only' ||
				payload.usage_scope === 'never_prompt'
					? payload.usage_scope
					: undefined,
			props:
				payload.props && typeof payload.props === 'object' && !Array.isArray(payload.props)
					? (payload.props as Record<string, any>)
					: undefined
		});

		if (!chapter) return ApiResponse.notFound('Profile chapter');

		if (updated) {
			const { profile } = await getProfileChapter(supabase, user.id, chapterId);
			await insertProfileAuditEvent({
				supabase,
				profileId: profile.id,
				actorId,
				accessType: 'doc_write',
				contextType: 'profile',
				documentIds: [chapterId],
				reason: 'profile_chapter_patch'
			});
		}

		return ApiResponse.success({ chapter, updated });
	} catch (error) {
		console.error('[Profile API] Failed to update chapter:', error);
		return ApiResponse.internalError(error, 'Failed to update profile chapter');
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const chapterId = params.id;
	if (!chapterId) {
		return ApiResponse.badRequest('Chapter id is required');
	}

	try {
		const actorId = await resolveProfileActorId(supabase, user.id);
		const { profile, chapter } = await getProfileChapter(supabase, user.id, chapterId);
		if (!chapter) return ApiResponse.notFound('Profile chapter');

		const result = await deleteProfileChapter({
			supabase,
			userId: user.id,
			chapterId
		});

		if (result.deleted) {
			await insertProfileAuditEvent({
				supabase,
				profileId: profile.id,
				actorId,
				accessType: 'doc_write',
				contextType: 'profile',
				documentIds: [chapterId],
				reason: 'profile_chapter_delete'
			});
		}

		return ApiResponse.success({ deleted: result.deleted });
	} catch (error) {
		console.error('[Profile API] Failed to delete chapter:', error);
		return ApiResponse.internalError(error, 'Failed to delete profile chapter');
	}
};
