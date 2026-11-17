// apps/web/src/routes/api/knowledge/youtube/+server.ts
/**
 * POST /api/knowledge/youtube  { urls: string[], own?: boolean }
 * Add up to 50 YouTube videos at once. Each gets its real title, channel and thumbnail from
 * YouTube's free oEmbed endpoint and is linked to its channel; with `own`, they're yours.
 * Pasting a video again lands on the same entry (keyed by video id).
 */
import type { RequestHandler } from './$types';
import {
	fetchYouTubeOEmbed,
	planYouTubeVideos,
	youtubeVideoId
} from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import { knowledgeErrorResponse, knowledgeStoreFor } from '$lib/server/knowledge/knowledge.server';

export const config = { maxDuration: 60 };
const MAX_VIDEOS = 50;

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	let body: { urls?: unknown; own?: unknown };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	const urls = (Array.isArray(body.urls) ? body.urls : [])
		.filter((u): u is string => typeof u === 'string')
		.map((u) => u.trim())
		.filter(Boolean);
	const seen = new Set<string>();
	const videos = urls.filter((url) => {
		const id = youtubeVideoId(url);
		if (!id || seen.has(id)) return false;
		seen.add(id);
		return true;
	});
	if (!videos.length) return ApiResponse.badRequest('Paste at least one YouTube video link');
	if (videos.length > MAX_VIDEOS)
		return ApiResponse.badRequest(`Add up to ${MAX_VIDEOS} videos at a time`);

	// Six lookups at a time keeps YouTube happy and the request quick.
	const items: Array<{ url: string; oembed: Awaited<ReturnType<typeof fetchYouTubeOEmbed>> }> =
		[];
	for (let i = 0; i < videos.length; i += 6) {
		const group = videos.slice(i, i + 6);
		const results = await Promise.all(group.map((url) => fetchYouTubeOEmbed(url, fetch)));
		group.forEach((url, j) => items.push({ url, oembed: results[j] ?? null }));
	}

	try {
		const receipt = await knowledgeStoreFor(locals.supabase, user.id).record(
			planYouTubeVideos(items, { own: body.own === true }),
			{ via: 'manual' }
		);
		const added = receipt.entities.filter((e) => e.kind === 'video');
		return ApiResponse.success({
			videos: added.map((e) => ({ id: e.id, name: e.name, new: e.matched === 'created' })),
			channels: receipt.entities.filter((e) => e.kind === 'channel').length,
			not_found: items.filter((item) => !item.oembed).length,
			skipped: urls.length - videos.length
		});
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not add those videos');
	}
};
