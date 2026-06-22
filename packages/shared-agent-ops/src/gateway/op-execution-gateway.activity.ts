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
import type { OntologyProjectSummary } from '../ontology/ontology-projects.service';
import type { ToolExecutionContext } from './op-execution-gateway.types';

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
}): Promise<void> {
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
		source: 'agent_ping'
	});

	if (params.context.taskSync) {
		try {
			await params.context.taskSync.syncTaskEvents(
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
		} catch (eventError) {
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
		undefined,
		getExternalAgentActivityContext(params.context)
	);
}

export async function syncUpdatedTaskSideEffects(params: {
	context: ToolExecutionContext;
	project: OntologyProjectSummary;
	actorId: string;
	existingTask: Record<string, unknown>;
	updatedTask: Record<string, unknown>;
	changedArgs: Record<string, unknown>;
}): Promise<void> {
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

	if (shouldSyncEvents && params.context.taskSync) {
		try {
			await params.context.taskSync.syncTaskEvents(
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
		} catch (eventError) {
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
		undefined,
		getExternalAgentActivityContext(params.context)
	);
}
