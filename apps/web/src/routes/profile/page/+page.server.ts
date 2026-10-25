// apps/web/src/routes/profile/page/+page.server.ts
//
// The "Your page" editor for build-os.com/@handle. Loads the editor data and the page
// as it renders today in one go, so the editor opens ready (no spinner, no extra calls).

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { redirectToLogin } from '$lib/server/auth-redirects';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { BuilderPageSection, BuilderProfileView } from '$lib/builder-profile/types';
import {
	loadBuilderProfileAs,
	loadEditorData
} from '$lib/server/builder-profile/builder-profile.service';

const SECTIONS: BuilderPageSection[] = ['profile', 'links', 'projects', 'updates', 'settings'];

function signInAvatar(user: unknown): string | null {
	const meta = (user as { user_metadata?: Record<string, unknown> } | null)?.user_metadata ?? {};
	const url = meta.avatar_url ?? meta.picture;
	return typeof url === 'string' && url.startsWith('https://') ? url : null;
}

export const load: PageServerLoad = async ({ locals, url, setHeaders }) => {
	const { user } = await locals.safeGetSession();
	if (!user) redirectToLogin(url);
	setHeaders({ 'cache-control': 'private, no-store' });

	const admin = createAdminSupabaseClient() as any;
	try {
		const editor = await loadEditorData({
			admin,
			userId: user.id,
			signInAvatarUrl: signInAvatar(user)
		});
		let preview: BuilderProfileView | null = null;
		if (editor.handle) {
			const result = await loadBuilderProfileAs(admin, editor.handle, user.id);
			preview = result.found ? result : null;
		}
		const asked = url.searchParams.get('section') as BuilderPageSection | null;
		const project = url.searchParams.get('project');
		return {
			editor,
			preview,
			origin: url.origin,
			section: asked && SECTIONS.includes(asked) ? asked : ('profile' as BuilderPageSection),
			projectId: project && /^[0-9a-f-]{36}$/i.test(project) ? project : null
		};
	} catch (err) {
		console.error('[BuilderProfile] editor page load failed', err);
		throw error(500, 'Your page could not load. Try again in a moment.');
	}
};
