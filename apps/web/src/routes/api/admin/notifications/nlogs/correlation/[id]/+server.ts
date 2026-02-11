// apps/web/src/routes/api/admin/notifications/nlogs/correlation/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const correlationId = params.id;

		if (!correlationId) {
			return ApiResponse.badRequest('Correlation ID is required');
		}

		// Fetch all logs for this correlation ID
		const { data: logs, error: logsError } = await supabase
			.from('notification_logs')
			.select(
				`
				id,
				correlation_id,
				request_id,
				user_id,
				notification_event_id,
				notification_delivery_id,
				level,
				message,
				namespace,
				metadata,
				error_stack,
				created_at,
				users (
					id,
					email,
					full_name
				),
				notification_events (
					id,
					event_type,
					event_source
				),
				notification_deliveries (
					id,
					channel,
					status
				)
			`
			)
			.eq('correlation_id', correlationId)
			.order('created_at', { ascending: true });

		if (logsError) {
			console.error('Error fetching logs for correlation ID:', logsError);
			return ApiResponse.databaseError(logsError);
		}

		// Try to find the related notification event from metadata
		let notificationEvent = null;
		const firstLog = logs?.[0];
		if (firstLog?.notification_event_id) {
			const { data: event } = await supabase
				.from('notification_events')
				.select(
					`
					id,
					event_type,
					event_source,
					actor_user_id,
					payload,
					metadata,
					created_at,
					users!notification_events_actor_user_id_fkey (
						id,
						email,
						full_name
					)
				`
				)
				.eq('id', firstLog.notification_event_id)
				.single();

			notificationEvent = event;
		}

		// Get all related deliveries for this correlation
		let deliveries: Array<Record<string, unknown>> = [];
		if (notificationEvent) {
			const { data: deliveriesData } = await supabase
				.from('notification_deliveries')
				.select(
					`
					id,
					event_id,
					recipient_user_id,
					channel,
					channel_identifier,
					status,
					created_at,
					sent_at,
					delivered_at,
					failed_at,
					opened_at,
					clicked_at,
					last_error,
					users!notification_deliveries_recipient_user_id_fkey (
						id,
						email,
						full_name
					)
				`
				)
				.eq('event_id', notificationEvent.id);

			deliveries = deliveriesData || [];
		}

		// Group logs by namespace for better visualization
		const logsByNamespace = (logs || []).reduce(
			(acc, log) => {
				const ns = log.namespace || 'unknown';
				if (!acc[ns]) {
					acc[ns] = [];
				}
				acc[ns].push(log);
				return acc;
			},
			{} as Record<string, typeof logs>
		);

		// Calculate timeline statistics
		const timeline = {
			start: logs?.[0]?.created_at,
			end: logs?.[logs.length - 1]?.created_at,
			duration:
				logs && logs.length > 0
					? new Date(logs[logs.length - 1]!.created_at).getTime() -
						new Date(logs[0]!.created_at).getTime()
					: 0,
			log_count: logs?.length || 0,
			error_count:
				logs?.filter((l) => l.level === 'error' || l.level === 'fatal').length || 0,
			warn_count: logs?.filter((l) => l.level === 'warn').length || 0
		};

		// Get unique namespaces for navigation
		const namespaces = Object.keys(logsByNamespace).sort();

		return ApiResponse.success({
			correlation_id: correlationId,
			logs: logs || [],
			logs_by_namespace: logsByNamespace,
			notification_event: notificationEvent,
			deliveries,
			timeline,
			namespaces
		});
	} catch (error) {
		console.error('Error fetching correlation logs:', error);
		return ApiResponse.internalError(error, 'Failed to fetch correlation logs');
	}
};
