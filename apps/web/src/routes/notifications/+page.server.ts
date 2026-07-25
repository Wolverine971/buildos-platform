// apps/web/src/routes/notifications/+page.server.ts
//
// Renders page 1 of the activity timeline. Subsequent pages are fetched from
// /api/activity as the user scrolls. Visiting this page also clears the unread
// badge, which is why the delivery mark-as-opened pass lives here rather than in
// the timeline service (the service is read-only and used by the API too).

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadActivityTimeline } from '$lib/server/activity-timeline.service';

const FIRST_PAGE_SIZE = 30;
/** Channels whose "unread" state is owned by this page, per the nav badge query. */
const IN_APP_CHANNELS = ['in_app', 'push'];
const UNOPENED_STATUSES = ['sent', 'delivered'];

async function markInAppDeliveriesOpened(
	supabase: App.Locals['supabase'],
	userId: string
): Promise<void> {
	const openedAt = new Date().toISOString();

	const { data: unopened, error: selectError } = await supabase
		.from('notification_deliveries')
		.select('id')
		.eq('recipient_user_id', userId)
		.in('channel', IN_APP_CHANNELS as any)
		.in('status', UNOPENED_STATUSES as any)
		.is('opened_at', null)
		.limit(500);

	if (selectError) {
		console.error('[Notifications] Failed to find unopened deliveries', selectError);
		return;
	}

	const ids = (unopened ?? []).map((row) => row.id);
	if (ids.length === 0) return;

	const { error: updateError } = await supabase
		.from('notification_deliveries')
		.update({ opened_at: openedAt, status: 'opened', updated_at: openedAt })
		.eq('recipient_user_id', userId)
		.in('id', ids);

	if (updateError) {
		console.error('[Notifications] Failed to mark deliveries opened', updateError);
		return;
	}

	const { error: readStateError } = await supabase
		.from('user_notifications')
		.update({ read_at: openedAt })
		.in('delivery_id', ids)
		.is('read_at', null);

	if (readStateError) {
		console.error('[Notifications] Failed to mark user notifications read', readStateError);
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw redirect(303, '/auth/login');
	}

	try {
		// The read pass runs first so the timeline reflects the state the user is
		// about to see, rather than showing rows as unread that we just cleared.
		await markInAppDeliveriesOpened(locals.supabase, user.id);

		const page = await loadActivityTimeline({
			supabase: locals.supabase,
			userId: user.id,
			limit: FIRST_PAGE_SIZE,
			timing: locals.serverTiming
		});

		return { page, error: null };
	} catch (error) {
		console.error('[Notifications] Failed to load activity timeline', error);
		return {
			page: { entries: [], nextCursor: null, hasMore: false, degraded: [] },
			error: 'Failed to load activity. Please try again.'
		};
	}
};
