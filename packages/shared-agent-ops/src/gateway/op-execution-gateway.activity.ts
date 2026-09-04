// packages/shared-agent-ops/src/gateway/op-execution-gateway.activity.ts
//
// Activity context and task write side effects for gateway mutations.
import {
	logCreateAsync,
	logUpdateAsync,
	type ActivityLogActorContext
} from '../ops/async-activity-logger';
import {
	notifyEntityMentionsAdded,
	resolveEntityMentionUserIds
} from '../ops/entity-mention-notification.service';
import { notifyTaskAssignmentAdded } from '../ops/task-assignment-notification.service';
import type { OntologyProjectSummary } from '../ontology/ontology-projects.service';
import type { GatewayCalendarSyncMode } from './op-execution-gateway.normalization';
import {
	asTaskEventSyncSummary,
	type TaskCalendarEventReceipt,
	type ToolExecutionContext
} from './op-execution-gateway.types';

/**
 * What the calendar side of a task write actually did, reported verbatim in the
 * tool receipt. Before this existed a receipt built from the task row alone let
 * the chat truthfully say "no event was created" while an event had just been
 * created and queued for Google sync.
 */
export type GatewayCalendarSyncReceipt = {
	/**
	 * synced   - sync ran; `calendar_events` lists the resulting events.
	 * skipped  - caller passed calendar_sync: 'none'; nothing was created/queued.
	 * unchanged- no field changed that requires event reconciliation.
	 * failed   - sync ran and threw; the task write still committed.
	 */
	calendar_sync: 'synced' | 'skipped' | 'unchanged' | 'failed';
	calendar_events?: TaskCalendarEventReceipt[];
	removed_calendar_event_count?: number;
};

function syncedReceipt(result: unknown): GatewayCalendarSyncReceipt {
	const summary = asTaskEventSyncSummary(result);
	if (!summary) return { calendar_sync: 'synced', calendar_events: [] };
	return {
		calendar_sync: 'synced',
		calendar_events: summary.events,
		...(summary.removed_event_count > 0
			? { removed_calendar_event_count: summary.removed_event_count }
			: {})
	};
}

export function getExternalAgentActivityContext(
	context: ToolExecutionContext
): ActivityLogActorContext | undefined {
	if (!context.callerId && !context.callSessionId) {
		return undefined;
	}

	return {
		externalAgentCallerId: context.callerId ?? null,
		agentCallSessionId: context.callSessionId ?? null
	};
}

export async function syncCreatedTaskSideEffects(params: {
	context: ToolExecutionContext;
	project: OntologyProjectSummary;
	actorId: string;
	task: Record<string, unknown>;
	addedAssigneeActorIds?: string[];
	/** 'none' suppresses every calendar side effect for this write. */
	calendarSync?: GatewayCalendarSyncMode;
}): Promise<GatewayCalendarSyncReceipt> {
	const actorDisplayName = 'BuildOS agent';
	const mentionUserIds = await resolveEntityMentionUserIds({
		supabase: params.context.admin,
		projectId: params.project.id,
		projectOwnerActorId: params.project.owner_actor_id,
		actorUserId: params.context.userId,
		nextTextValues: [
			typeof params.task.title === 'string' ? params.task.title : null,
			typeof params.task.description === 'string' ? params.task.description : null
		]
	});

	let assignmentRecipientUserIds: string[] = [];
	if (params.addedAssigneeActorIds) {
		const { recipientUserIds } = await notifyTaskAssignmentAdded({
			supabase: params.context.admin,
			projectId: params.project.id,
			projectName: params.project.name,
			taskId: String(params.task.id),
			taskTitle: typeof params.task.title === 'string' ? params.task.title : 'Task',
			actorUserId: params.context.userId,
			actorDisplayName,
			addedAssigneeActorIds: params.addedAssigneeActorIds,
			coalescedMentionUserIds: mentionUserIds
		});
		assignmentRecipientUserIds = recipientUserIds;
	}

	await notifyEntityMentionsAdded({
		supabase: params.context.admin,
		projectId: params.project.id,
		projectName: params.project.name,
		entityType: 'task',
		entityId: String(params.task.id),
		entityTitle: typeof params.task.title === 'string' ? params.task.title : null,
		actorUserId: params.context.userId,
		actorDisplayName,
		mentionedUserIds: mentionUserIds,
		skipUserIds: assignmentRecipientUserIds,
		source: 'agent_ping'
	});

	let calendarReceipt: GatewayCalendarSyncReceipt =
		params.calendarSync === 'none'
			? { calendar_sync: 'skipped' }
			: { calendar_sync: 'unchanged' };

	if (params.calendarSync !== 'none' && params.context.taskSync) {
		try {
			const syncResult = await params.context.taskSync.syncTaskEvents(
				params.context.userId,
				params.actorId,
				params.task as any,
				{
					activityLog: {
						changeSource: 'agent_call',
						actorContext: getExternalAgentActivityContext(params.context)
					}
				}
			);
			calendarReceipt = syncedReceipt(syncResult);
		} catch (eventError) {
			calendarReceipt = { calendar_sync: 'failed' };
			console.warn(
				'[External Tool Gateway] Failed to sync task events on create:',
				eventError
			);
		}
	}

	await logCreateAsync(
		params.context.admin,
		params.project.id,
		'task',
		String(params.task.id),
		{
			title: params.task.title,
			type_key: params.task.type_key,
			state_key: params.task.state_key
		},
		params.context.userId,
		'agent_call',
		params.context.chatSessionId,
		getExternalAgentActivityContext(params.context)
	);

	return calendarReceipt;
}

export async function syncUpdatedTaskSideEffects(params: {
	context: ToolExecutionContext;
	project: OntologyProjectSummary;
	actorId: string;
	existingTask: Record<string, unknown>;
	updatedTask: Record<string, unknown>;
	changedArgs: Record<string, unknown>;
	addedAssigneeActorIds?: string[];
	/** 'none' suppresses every calendar side effect for this write. */
	calendarSync?: GatewayCalendarSyncMode;
}): Promise<GatewayCalendarSyncReceipt> {
	const isTransitioningToDone =
		params.changedArgs.state_key !== undefined &&
		params.existingTask.state_key !== 'done' &&
		params.updatedTask.state_key === 'done';
	const isTransitioningFromDone =
		params.changedArgs.state_key !== undefined &&
		params.existingTask.state_key === 'done' &&
		params.updatedTask.state_key !== 'done';
	const hasSchedulingEdit =
		params.changedArgs.start_at !== undefined || params.changedArgs.due_at !== undefined;
	const shouldSyncFromTitleEdit =
		params.changedArgs.title !== undefined && !isTransitioningFromDone;
	const shouldSyncEvents = shouldSyncFromTitleEdit || hasSchedulingEdit || isTransitioningToDone;

	let calendarReceipt: GatewayCalendarSyncReceipt =
		params.calendarSync === 'none'
			? { calendar_sync: 'skipped' }
			: { calendar_sync: 'unchanged' };

	if (params.calendarSync !== 'none' && shouldSyncEvents && params.context.taskSync) {
		try {
			const syncResult = await params.context.taskSync.syncTaskEvents(
				params.context.userId,
				params.actorId,
				params.updatedTask as any,
				{
					activityLog: {
						changeSource: 'agent_call',
						actorContext: getExternalAgentActivityContext(params.context)
					}
				}
			);
			calendarReceipt = syncedReceipt(syncResult);
		} catch (eventError) {
			calendarReceipt = { calendar_sync: 'failed' };
			console.warn(
				'[External Tool Gateway] Failed to sync task events on update:',
				eventError
			);
		}
	}

	const actorDisplayName = 'BuildOS agent';
	const mentionUserIds = await resolveEntityMentionUserIds({
		supabase: params.context.admin,
		projectId: params.project.id,
		projectOwnerActorId: params.project.owner_actor_id,
		actorUserId: params.context.userId,
		nextTextValues: [
			typeof params.updatedTask.title === 'string' ? params.updatedTask.title : null,
			typeof params.updatedTask.description === 'string'
				? params.updatedTask.description
				: null
		],
		previousTextValues: [
			typeof params.existingTask.title === 'string' ? params.existingTask.title : null,
			typeof params.existingTask.description === 'string'
				? params.existingTask.description
				: null
		]
	});
	let assignmentRecipientUserIds: string[] = [];

	if (params.addedAssigneeActorIds) {
		const { recipientUserIds } = await notifyTaskAssignmentAdded({
			supabase: params.context.admin,
			projectId: params.project.id,
			projectName: params.project.name,
			taskId: String(params.updatedTask.id),
			taskTitle:
				typeof params.updatedTask.title === 'string' ? params.updatedTask.title : 'Task',
			actorUserId: params.context.userId,
			actorDisplayName,
			addedAssigneeActorIds: params.addedAssigneeActorIds,
			coalescedMentionUserIds: mentionUserIds
		});
		assignmentRecipientUserIds = recipientUserIds;
	}

	await notifyEntityMentionsAdded({
		supabase: params.context.admin,
		projectId: params.project.id,
		projectName: params.project.name,
		entityType: 'task',
		entityId: String(params.updatedTask.id),
		entityTitle: typeof params.updatedTask.title === 'string' ? params.updatedTask.title : null,
		actorUserId: params.context.userId,
		actorDisplayName,
		mentionedUserIds: mentionUserIds,
		skipUserIds: assignmentRecipientUserIds,
		source: 'agent_ping'
	});

	await logUpdateAsync(
		params.context.admin,
		params.project.id,
		'task',
		String(params.updatedTask.id),
		{
			title: params.existingTask.title,
			state_key: params.existingTask.state_key,
			props: params.existingTask.props
		},
		{
			title: params.updatedTask.title,
			state_key: params.updatedTask.state_key,
			props: params.updatedTask.props
		},
		params.context.userId,
		'agent_call',
		params.context.chatSessionId,
		getExternalAgentActivityContext(params.context)
	);

	return calendarReceipt;
}
