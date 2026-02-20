// apps/web/src/lib/server/tracked-in-app-notification.service.ts
import { generateCorrelationId } from '@buildos/shared-utils';
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';

export type NotificationEventSource =
	| 'database_trigger'
	| 'worker_job'
	| 'api_action'
	| 'cron_scheduler';

export interface CreateTrackedInAppNotificationInput {
	supabase: Pick<SupabaseClient<Database>, 'from'>;
	recipientUserId: string;
	eventType: string;
	title: string;
	message: string;
	type?: string;
	priority?: string | null;
	actionUrl?: string | null;
	expiresAt?: string | null;
	actorUserId?: string | null;
	eventSource?: NotificationEventSource;
	payload?: Record<string, unknown> | null;
	data?: Record<string, unknown> | null;
	metadata?: Record<string, unknown> | null;
	nowIso?: string;
}

export interface CreateTrackedInAppNotificationResult {
	success: boolean;
	eventId: string | null;
	deliveryId: string | null;
	userNotificationId: string | null;
	correlationId: string;
	error?: string;
}

function buildCorrelationId(metadata: Record<string, unknown> | null | undefined): string {
	const maybeCorrelationId = metadata?.correlationId;
	if (typeof maybeCorrelationId === 'string' && maybeCorrelationId.trim().length > 0) {
		return maybeCorrelationId;
	}
	return generateCorrelationId();
}

export async function createTrackedInAppNotification(
	input: CreateTrackedInAppNotificationInput
): Promise<CreateTrackedInAppNotificationResult> {
	const sb = input.supabase as any;
	const nowIso = input.nowIso ?? new Date().toISOString();
	const correlationId = buildCorrelationId(input.metadata);
	const notificationType = input.type ?? 'info';
	const priority = input.priority ?? 'normal';
	const eventSource = input.eventSource ?? 'api_action';

	const deliveryPayload: Record<string, unknown> = {
		...(input.payload ?? {}),
		title: input.title,
		body: input.message,
		event_type: input.eventType,
		type: notificationType,
		priority,
		...(input.actionUrl ? { action_url: input.actionUrl } : {}),
		...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
		...(input.data ? { data: input.data } : {})
	};

	const eventPayload: Record<string, unknown> = {
		...deliveryPayload,
		...(input.data ? { data: input.data } : {})
	};

	const eventMetadata: Record<string, unknown> = {
		...(input.metadata ?? {}),
		correlationId
	};

	const { data: eventRow, error: eventError } = await sb
		.from('notification_events')
		.insert({
			event_type: input.eventType,
			event_source: eventSource,
			actor_user_id: input.actorUserId ?? null,
			target_user_id: input.recipientUserId,
			payload: eventPayload,
			metadata: eventMetadata,
			correlation_id: correlationId
		})
		.select('id')
		.single();

	if (eventError || !eventRow?.id) {
		return {
			success: false,
			eventId: null,
			deliveryId: null,
			userNotificationId: null,
			correlationId,
			error: eventError?.message ?? 'Failed to create notification event'
		};
	}

	const { data: deliveryRow, error: deliveryError } = await sb
		.from('notification_deliveries')
		.insert({
			event_id: eventRow.id,
			recipient_user_id: input.recipientUserId,
			channel: 'in_app',
			payload: deliveryPayload,
			status: 'delivered',
			attempts: 1,
			max_attempts: 1,
			sent_at: nowIso,
			delivered_at: nowIso,
			correlation_id: correlationId
		})
		.select('id')
		.single();

	if (deliveryError || !deliveryRow?.id) {
		return {
			success: false,
			eventId: eventRow.id,
			deliveryId: null,
			userNotificationId: null,
			correlationId,
			error: deliveryError?.message ?? 'Failed to create notification delivery'
		};
	}

	const { data: notificationRow, error: notificationError } = await sb
		.from('user_notifications')
		.insert({
			event_id: eventRow.id,
			delivery_id: deliveryRow.id,
			user_id: input.recipientUserId,
			type: notificationType,
			title: input.title,
			message: input.message,
			priority,
			action_url: input.actionUrl ?? null,
			event_type: input.eventType,
			data: input.data ?? null,
			expires_at: input.expiresAt ?? null
		})
		.select('id')
		.single();

	if (notificationError || !notificationRow?.id) {
		return {
			success: false,
			eventId: eventRow.id,
			deliveryId: deliveryRow.id,
			userNotificationId: null,
			correlationId,
			error: notificationError?.message ?? 'Failed to create in-app notification row'
		};
	}

	return {
		success: true,
		eventId: eventRow.id,
		deliveryId: deliveryRow.id,
		userNotificationId: notificationRow.id,
		correlationId
	};
}
