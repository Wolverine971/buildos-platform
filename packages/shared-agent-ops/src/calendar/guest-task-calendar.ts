// packages/shared-agent-ops/src/calendar/guest-task-calendar.ts
import type { Json } from '@buildos/shared-types';
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Server-owned metadata, protected and copied to derived events by the DB trigger. */
export const GUEST_TASK_CALENDAR_USER = 'guest_agent_calendar_user_id';

export function guestTaskCalendarUserId(row: { props?: unknown }): string | null {
	const props = row.props;
	if (!props || typeof props !== 'object' || Array.isArray(props)) return null;
	const value = (props as Record<string, unknown>)[GUEST_TASK_CALENDAR_USER];
	return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Never accept a recipient supplied through arbitrary tool properties. */
export function withGuestTaskCalendarUser(props: unknown, userId: string | null): Json {
	const next =
		props && typeof props === 'object' && !Array.isArray(props)
			? { ...(props as Record<string, Json | undefined>) }
			: {};
	delete next[GUEST_TASK_CALENDAR_USER];
	if (userId) next[GUEST_TASK_CALENDAR_USER] = userId;
	return next;
}

export function guestCalendarWriteUser(params: {
	context: { callerId?: string; userId: string };
	project: { owner_actor_id: string };
	actorId: string;
}): string | null {
	return params.context.callerId && params.project.owner_actor_id !== params.actorId
		? params.context.userId
		: null;
}

/** Queue with the recipient's credentials, even when an owner edited the task/event. */
export async function enqueueGuestTaskCalendarSync(
	client: SupabaseClient<Database>,
	event: Database['public']['Tables']['onto_events']['Row'],
	action: 'upsert' | 'delete',
	triggeredByUserId: string,
	calendarSyncUserId?: string
): Promise<string> {
	const targetUserId = guestTaskCalendarUserId(event) ?? calendarSyncUserId;
	if (!targetUserId || !event.project_id) throw new Error('Missing restricted calendar target');
	const eventVersion = event.updated_at ?? event.created_at;
	const targets: Array<{ userId: string; action: 'upsert' | 'delete' }> = [
		{ userId: targetUserId, action }
	];
	if (guestTaskCalendarUserId(event)) {
		// A task adopted from the old fan-out policy may already have other copies.
		// Delete only explicitly owned mappings; never infer a recipient from shared IDs.
		const { data, error } = await client
			.from('onto_event_sync')
			.select('user_id')
			.eq('event_id', event.id)
			.eq('provider', 'google')
			.neq('sync_status', 'cancelled');
		if (error) throw new Error(error.message);
		for (const userId of new Set((data ?? []).map((row) => row.user_id))) {
			if (userId && userId !== targetUserId) targets.push({ userId, action: 'delete' });
		}
	}
	for (const target of targets) {
		const { error } = await client.rpc('add_queue_job', {
			p_user_id: target.userId,
			p_job_type: 'sync_calendar',
			p_priority: 5,
			p_scheduled_for: new Date().toISOString(),
			p_dedup_key: [
				'onto-project-event-sync',
				target.action,
				event.id,
				target.userId,
				eventVersion
			].join(':'),
			p_metadata: {
				kind: 'onto_project_event_sync',
				action: target.action,
				eventId: event.id,
				projectId: event.project_id,
				targetUserId: target.userId,
				triggeredByUserId,
				restrictToTargetUser: true,
				createCalendarIfMissing:
					target.userId === targetUserId && targetUserId === triggeredByUserId,
				eventUpdatedAt: eventVersion
			}
		});
		if (error) throw new Error(error.message);
	}
	return targetUserId;
}
