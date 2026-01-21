// apps/web/src/routes/notifications/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Database } from '@buildos/shared-types';

type NotificationDeliveryRow = Database['public']['Tables']['notification_deliveries']['Row'] & {
	notification_events?: {
		id: string;
		event_type: string;
		event_source: string;
		actor_user_id: string | null;
		target_user_id: string | null;
		payload: Record<string, unknown>;
		created_at: string | null;
		metadata?: Record<string, unknown> | null;
	} | null;
};

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw redirect(303, '/auth/login');
	}

	const supabase = locals.supabase;
	const { data, error } = await supabase
		.from('notification_deliveries')
		.select(
			`
        id,
        status,
        channel,
        created_at,
        payload,
        correlation_id,
        event_id,
        notification_events!inner (
          id,
          event_type,
          event_source,
          actor_user_id,
          target_user_id,
          payload,
          metadata,
          created_at
        )
      `
		)
		.eq('recipient_user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(50);

	if (error) {
		console.error('[Notifications] Failed to load deliveries', error);
		return {
			notifications: [] as NotificationDeliveryRow[],
			error: 'Failed to load notifications. Please try again.'
		};
	}

	return {
		notifications: (data ?? []) as NotificationDeliveryRow[]
	};
};
