// apps/web/src/routes/api/onto/projects/[id]/emoji/+server.ts
//
// PUT { glyphs: string[] } — choose the project's tile emojis: one or two standard emoji, or
// none for initials. Needs write access (RLS enforces it on the update too). The choice is
// marked `source: 'user'` so a later automatic re-pick leaves it alone; the automatic
// pick's suggestions stay, for the picker. Like the automatic pick, it does not bump updated_at.
import type { RequestHandler } from './$types';
import type { Json } from '@buildos/shared-types';
import { ApiResponse } from '$lib/utils/api-response';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import {
	normalizeEmojiSelection,
	readProjectEmoji
} from '$lib/components/project/emoji/project-emoji';

export const PUT: RequestHandler = async ({ params, locals, request }) => {
	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'write',
		forbiddenMessage: 'You need edit access to change this project’s emoji'
	});
	if (!access.ok) return access.response;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON body');
	}
	const glyphs = normalizeEmojiSelection((body as { glyphs?: unknown } | null)?.glyphs);
	if (!glyphs) return ApiResponse.badRequest('Choose up to two emoji');

	const { data: current, error: readError } = await locals.supabase
		.from('onto_projects')
		.select('icon_emoji')
		.eq('id', access.projectId)
		.maybeSingle();
	if (readError) return ApiResponse.databaseError(readError);

	const previous =
		current?.icon_emoji &&
		typeof current.icon_emoji === 'object' &&
		!Array.isArray(current.icon_emoji)
			? current.icon_emoji
			: {};
	const next = {
		...previous,
		glyphs,
		source: 'user',
		chosen_at: new Date().toISOString(),
		chosen_by: access.actorId
	};
	const { data: updated, error: updateError } = await locals.supabase
		.from('onto_projects')
		.update({ icon_emoji: next as Json })
		.eq('id', access.projectId)
		.select('id')
		.maybeSingle();
	if (updateError) return ApiResponse.databaseError(updateError);
	if (!updated)
		return ApiResponse.forbidden('You need edit access to change this project’s emoji');

	return ApiResponse.success({ emoji: readProjectEmoji(next) });
};
