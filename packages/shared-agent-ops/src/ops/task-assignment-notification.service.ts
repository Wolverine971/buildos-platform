import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTrackedInAppNotification } from './tracked-in-app-notification.service';

type AssignmentSupabase = Pick<SupabaseClient<Database>, 'from'>;

/**
 * Notify only newly added task assignees. Mention recipients are supplied so a
 * single assignment notification can carry the same coalescing marker as the
 * legacy web route and suppress the duplicate mention notification.
 */
export async function notifyTaskAssignmentAdded({
	supabase,
	notificationSupabase = supabase,
	projectId,
	projectName,
	taskId,
	taskTitle,
	actorUserId,
	actorDisplayName,
	addedAssigneeActorIds,
	coalescedMentionUserIds = []
}: {
	supabase: AssignmentSupabase;
	notificationSupabase?: AssignmentSupabase;
	projectId: string;
	projectName: string | null | undefined;
	taskId: string;
	taskTitle: string;
	actorUserId: string;
	actorDisplayName: string;
	addedAssigneeActorIds: string[];
	coalescedMentionUserIds?: string[];
}): Promise<{ recipientUserIds: string[] }> {
	if (addedAssigneeActorIds.length === 0) {
		return { recipientUserIds: [] };
	}

	const { data: actorRows, error: actorError } = await (supabase as any)
		.from('onto_actors')
		.select('id, user_id')
		.in('id', addedAssigneeActorIds);

	if (actorError) {
		console.error('[Task Assignment] Failed to resolve assignee users:', actorError);
		return { recipientUserIds: [] };
	}

	const recipientUserIds = Array.from(
		new Set(
			((actorRows ?? []) as Array<{ user_id?: string | null }>)
				.map((row) => row.user_id)
				.filter((userId): userId is string => Boolean(userId && userId !== actorUserId))
		)
	);

	if (recipientUserIds.length === 0) {
		return { recipientUserIds: [] };
	}

	const actorName = actorDisplayName || 'A teammate';
	const projectLabel = projectName || 'your project';
	const message = `${actorName} assigned you a task in ${projectLabel}.`;
	const actionUrl = `/projects/${projectId}/tasks/${taskId}`;
	const coalescedMentionSet = new Set<string>(coalescedMentionUserIds);
	const results = await Promise.all(
		recipientUserIds.map(async (userId) =>
			createTrackedInAppNotification({
				supabase: notificationSupabase,
				recipientUserId: userId,
				eventType: 'task.assigned',
				actorUserId,
				eventSource: 'api_action',
				type: 'task_assigned',
				title: 'Task assigned to you',
				message,
				actionUrl,
				payload: {
					project_id: projectId,
					project_name: projectName ?? null,
					task_id: taskId,
					task_title: taskTitle,
					entity_type: 'task',
					entity_id: taskId,
					actor_user_id: actorUserId,
					source: 'assignment'
				},
				data: {
					project_id: projectId,
					entity_type: 'task',
					entity_id: taskId,
					entity_title: taskTitle,
					task_id: taskId,
					actor_user_id: actorUserId,
					coalesced_from_mention: coalescedMentionSet.has(userId),
					source: 'assignment'
				}
			})
		)
	);

	const failed = results.filter((result) => !result.success);
	if (failed.length > 0) {
		console.error('[Task Assignment] Failed to create assignment notifications:', failed);
	}

	return { recipientUserIds };
}
