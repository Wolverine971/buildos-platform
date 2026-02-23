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

interface ProjectBatchRow {
	id: string;
	project_id: string;
	event_count: number;
	action_counts: Record<string, number> | null;
	actor_counts: Record<string, number> | null;
	window_start: string;
	window_end: string;
	flush_after: string;
	latest_event_at: string | null;
	status: 'pending' | 'processing' | 'failed' | 'flushed';
	last_error: string | null;
	created_at: string;
}

function normalizeBatchStatus(status: ProjectBatchRow['status']): 'pending' | 'failed' {
	if (status === 'failed') return 'failed';
	return 'pending';
}

function extractBatchIdFromEvent(
	metadata: Record<string, unknown> | null | undefined,
	payload: unknown
): string | null {
	const batchIdFromMetadata =
		metadata && typeof metadata.batchId === 'string' ? metadata.batchId : null;
	if (batchIdFromMetadata && batchIdFromMetadata.length > 0) {
		return batchIdFromMetadata;
	}

	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return null;
	}

	const payloadObj = payload as Record<string, unknown>;
	const directBatchId =
		typeof payloadObj.batch_id === 'string' && payloadObj.batch_id.length > 0
			? payloadObj.batch_id
			: null;
	if (directBatchId) {
		return directBatchId;
	}

	const payloadData = payloadObj.data;
	if (!payloadData || typeof payloadData !== 'object' || Array.isArray(payloadData)) {
		return null;
	}

	const batchIdFromPayloadData =
		typeof (payloadData as Record<string, unknown>).batch_id === 'string'
			? ((payloadData as Record<string, unknown>).batch_id as string)
			: null;
	if (batchIdFromPayloadData && batchIdFromPayloadData.length > 0) {
		return batchIdFromPayloadData;
	}

	return null;
}

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

	// Fallback source: unresolved batch rows (pending/processing/failed) so shared project activity
	// is still visible in /notifications if batch flush to notification_events fails.
	const { data: pendingBatches, error: pendingBatchesError } = await supabase
		.from('project_notification_batches')
		.select(
			'id, project_id, event_count, action_counts, actor_counts, window_start, window_end, flush_after, latest_event_at, status, last_error, created_at'
		)
		.eq('recipient_user_id', user.id)
		.in('status', ['pending', 'processing', 'failed'])
		.order('created_at', { ascending: false })
		.limit(100);

	if (pendingBatchesError) {
		console.error(
			'[Notifications] Failed to load project notification batches',
			pendingBatchesError
		);
	}

	const pendingBatchRows = (pendingBatches ?? []) as ProjectBatchRow[];
	const pendingBatchProjectIds = Array.from(
		new Set(pendingBatchRows.map((row) => row.project_id).filter(Boolean))
	);

	const projectNameById = new Map<string, string>();
	if (pendingBatchProjectIds.length > 0) {
		const { data: projects, error: projectsError } = await supabase
			.from('onto_projects')
			.select('id, name')
			.in('id', pendingBatchProjectIds);

		if (projectsError) {
			console.error(
				'[Notifications] Failed to resolve project names for batch rows',
				projectsError
			);
		} else {
			for (const project of projects ?? []) {
				projectNameById.set(project.id, project.name || 'this project');
			}
		}
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

	const seenBatchIds = new Set<string>();
	for (const row of deliveries) {
		const metadata = row.notification_events?.metadata ?? null;
		const batchId = extractBatchIdFromEvent(metadata, row.notification_events?.payload);
		if (batchId) seenBatchIds.add(batchId);
	}
	for (const eventRow of projectEvents ?? []) {
		const metadata = (eventRow.metadata ?? null) as Record<string, unknown> | null;
		const batchId = extractBatchIdFromEvent(metadata, eventRow.payload);
		if (batchId) seenBatchIds.add(batchId);
	}

	const batchFallbackRows: NotificationFeedRow[] = pendingBatchRows
		.filter((batchRow) => !seenBatchIds.has(batchRow.id))
		.map((batchRow) => {
			const projectName = projectNameById.get(batchRow.project_id) || 'this project';
			const eventCount = Number.isFinite(batchRow.event_count) ? batchRow.event_count : 0;
			const title =
				eventCount > 0
					? `${eventCount} teammate update${eventCount === 1 ? '' : 's'} in ${projectName}`
					: `Team updates in ${projectName}`;
			const body =
				batchRow.status === 'failed'
					? `Project activity batch failed to flush. Showing staged updates from ${projectName}.`
					: `Shared project activity is being prepared for ${projectName}.`;
			const createdAt = batchRow.latest_event_at ?? batchRow.created_at;
			const syntheticStatus = normalizeBatchStatus(batchRow.status);

			const syntheticRow = {
				id: `batch-${batchRow.id}`,
				event_id: null,
				recipient_user_id: user.id,
				subscription_id: null,
				channel: 'in_app',
				channel_identifier: null,
				payload: {
					title,
					body,
					event_type: 'project.activity.batched',
					project_id: batchRow.project_id,
					project_name: projectName,
					event_count: eventCount,
					action_counts: batchRow.action_counts ?? {},
					actor_counts: batchRow.actor_counts ?? {},
					window_start: batchRow.window_start,
					window_end: batchRow.window_end,
					data: {
						url: `/projects/${batchRow.project_id}`,
						project_id: batchRow.project_id,
						batch_id: batchRow.id
					}
				} as any,
				// Synthetic feed entry sourced from project_notification_batches.
				status: syntheticStatus,
				attempts: 0,
				max_attempts: 0,
				sent_at: null,
				delivered_at: null,
				opened_at: null,
				clicked_at: null,
				failed_at: syntheticStatus === 'failed' ? createdAt : null,
				last_error: batchRow.last_error,
				external_id: null,
				tracking_id: null,
				metadata: {} as any,
				correlation_id: null,
				created_at: createdAt,
				updated_at: createdAt,
				feed_kind: 'delivery' as const,
				notification_events: {
					id: `batch-${batchRow.id}`,
					event_type: 'project.activity.batched',
					event_source: 'database_trigger',
					actor_user_id: null,
					target_user_id: user.id,
					payload: {
						project_id: batchRow.project_id,
						project_name: projectName,
						event_count: eventCount,
						action_counts: batchRow.action_counts ?? {},
						actor_counts: batchRow.actor_counts ?? {},
						window_start: batchRow.window_start,
						window_end: batchRow.window_end
					},
					correlation_id: null,
					metadata: {
						batchId: batchRow.id,
						status: batchRow.status,
						flushAfter: batchRow.flush_after
					},
					created_at: createdAt
				}
			};
			return syntheticRow as NotificationFeedRow;
		});

	const deliveryRows: NotificationFeedRow[] = deliveries.map((row) => ({
		...row,
		feed_kind: 'delivery'
	}));

	const notifications = [...deliveryRows, ...syntheticRows, ...batchFallbackRows]
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
