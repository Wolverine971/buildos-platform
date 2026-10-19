import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPublicChatShare } from '$lib/server/chat-share.service';
export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
	// Revocations take effect on the next request, including SvelteKit data requests.
	setHeaders({
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex, nofollow',
		'referrer-policy': 'no-referrer'
	});
	const share = await getPublicChatShare(params.token);
	if (!share) error(404, 'This chat is no longer shared.');
	return { share, viewerSignedIn: Boolean(locals.user) };
};
