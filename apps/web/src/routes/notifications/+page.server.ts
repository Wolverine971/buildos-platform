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
		correlation_id?: string | null;
		metadata?: Record<string, unknown> | null;
	} | null;
};

type NotificationFeedRow = NotificationDeliveryRow & {
	feed_kind: 'delivery' | 'activity_event';
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
        sent_at,
        delivered_at,
        opened_at,
        clicked_at,
        failed_at,
        last_error,
        attempts,
        max_attempts,
        notification_events!inner (
          id,
          event_type,
          event_source,
          actor_user_id,
          target_user_id,
          payload,
          correlation_id,
          metadata,
          created_at
        )
      `
		)
		.eq('recipient_user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(200);

	if (error) {
		console.error('[Notifications] Failed to load deliveries', error);
		return {
			notifications: [] as NotificationFeedRow[],
			error: 'Failed to load notifications. Please try again.'
		};
	}

	const deliveries = (data ?? []) as NotificationDeliveryRow[];
	const deliveredEventIds = new Set(
		deliveries
			.map((row) => row.notification_events?.id)
			.filter((value): value is string => typeof value === 'string' && value.length > 0)
	);

	// Shared project activity can be emitted as events even when channel delivery is suppressed
	// (e.g. global in-app/push disabled). Include those events in the feed.
	const { data: projectEvents, error: projectEventsError } = await supabase
		.from('notification_events')
		.select(
			'id, event_type, event_source, actor_user_id, target_user_id, payload, metadata, correlation_id, created_at'
		)
		.eq('target_user_id', user.id)
		.eq('event_type', 'project.activity.batched')
		.order('created_at', { ascending: false })
		.limit(100);

	if (projectEventsError) {
		console.error(
			'[Notifications] Failed to load shared project activity events',
			projectEventsError
		);
	}

	const syntheticRows: NotificationFeedRow[] = (projectEvents ?? [])
		.filter((eventRow) => !deliveredEventIds.has(eventRow.id))
		.map((eventRow) => {
			const syntheticRow = {
				id: `event-${eventRow.id}`,
				event_id: eventRow.id,
				recipient_user_id: user.id,
				subscription_id: null,
				channel: 'in_app',
				channel_identifier: null,
				payload: (eventRow.payload ?? {}) as any,
				// Synthetic feed entry: represents a batched activity event without a delivery row.
				status: 'pending',
				attempts: 0,
				max_attempts: 0,
				sent_at: eventRow.created_at,
				delivered_at: null,
				opened_at: null,
				clicked_at: null,
				failed_at: null,
				last_error: null,
				external_id: null,
				tracking_id: null,
				metadata: {} as any,
				correlation_id: eventRow.correlation_id,
				created_at: eventRow.created_at,
				updated_at: eventRow.created_at ?? new Date().toISOString(),
				feed_kind: 'activity_event' as const,
				notification_events: {
					id: eventRow.id,
					event_type: eventRow.event_type,
					event_source: eventRow.event_source,
					actor_user_id: eventRow.actor_user_id,
					target_user_id: eventRow.target_user_id,
					payload: (eventRow.payload ?? {}) as Record<string, unknown>,
					correlation_id: eventRow.correlation_id,
					metadata: (eventRow.metadata ?? null) as Record<string, unknown> | null,
					created_at: eventRow.created_at
				}
			};
			return syntheticRow as NotificationFeedRow;
		});

	const deliveryRows: NotificationFeedRow[] = deliveries.map((row) => ({
		...row,
		feed_kind: 'delivery'
	}));

	const notifications = [...deliveryRows, ...syntheticRows]
		.sort((a, b) => {
			const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
			const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
			return bTime - aTime;
		})
		.slice(0, 100);

	return {
		notifications
	};
};
