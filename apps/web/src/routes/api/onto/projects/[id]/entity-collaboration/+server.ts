// apps/web/src/routes/api/onto/projects/[id]/entity-collaboration/+server.ts
import { dev } from '$app/environment';
import { PUBLIC_APP_URL } from '$env/static/public';
import type { RequestHandler } from './$types';
import { EmailService } from '$lib/services/email-service';
import { createTrackedInAppNotification } from '$lib/server/tracked-in-app-notification.service';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { ApiResponse } from '$lib/utils/api-response';
import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { logOntologyApiError } from '../../../shared/error-logging';

type EntityType = 'task' | 'document' | 'goal' | 'plan';
type EntitySummary = {
	id: string;
	project_id: string;
	title: string;
};
type ActorSummary = {
	id: string;
	user_id: string | null;
	name: string | null;
	email: string | null;
};
type DeliveryChannel = 'in_app' | 'email';
type CollaborationAction = 'ping' | 'assign';

const ENTITY_TYPES = new Set<EntityType>(['task', 'document', 'goal', 'plan']);
const MAX_MESSAGE_LENGTH = 1000;

function normalizeEntityType(value: unknown): EntityType | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase();
	return ENTITY_TYPES.has(normalized as EntityType) ? (normalized as EntityType) : null;
}

function normalizeDeliveryChannel(value: unknown): DeliveryChannel {
	return value === 'email' ? 'email' : 'in_app';
}

function normalizeAction(value: unknown): CollaborationAction | null {
	if (value === 'ping' || value === 'assign') return value;
	return null;
}

function normalizeMessage(value: unknown): string {
	return typeof value === 'string' ? value.trim().slice(0, MAX_MESSAGE_LENGTH) : '';
}

function getEntityLabel(entityType: EntityType): string {
	return entityType === 'task'
		? 'task'
		: entityType === 'document'
			? 'document'
			: entityType === 'goal'
				? 'goal'
				: 'plan';
}

function getIndefiniteArticle(label: string): string {
	return /^[aeiou]/i.test(label) ? 'an' : 'a';
}

function getEntityActionPath(entityType: EntityType, projectId: string, entityId: string): string {
	if (entityType === 'task') return `/projects/${projectId}/tasks/${entityId}`;
	if (entityType === 'document') return `/projects/${projectId}?doc=${entityId}`;
	return `/projects/${projectId}?entity=${encodeURIComponent(entityType)}&entity_id=${entityId}`;
}

function getDisplayName(actor: Pick<ActorSummary, 'name' | 'email'> | null | undefined): string {
	const name = actor?.name?.trim();
	if (name) return name;
	const email = actor?.email?.trim();
	if (email) return email.split('@')[0] ?? email;
	return 'A teammate';
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function getBaseUrl(request: Request): string {
	if (PUBLIC_APP_URL) return PUBLIC_APP_URL.replace(/\/$/, '');
	if (dev) return new URL(request.url).origin;
	return 'https://build-os.com';
}

async function fetchEntity({
	supabase,
	entityType,
	entityId,
	projectId
}: {
	supabase: App.Locals['supabase'];
	entityType: EntityType;
	entityId: string;
	projectId: string;
}): Promise<{ entity: EntitySummary | null; error: unknown | null }> {
	if (entityType === 'task') {
		const { data, error } = await supabase
			.from('onto_tasks')
			.select('id, project_id, title')
			.eq('id', entityId)
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.maybeSingle();
		return {
			entity: data ? { id: data.id, project_id: data.project_id, title: data.title } : null,
			error
		};
	}

	if (entityType === 'document') {
		const { data, error } = await supabase
			.from('onto_documents')
			.select('id, project_id, title')
			.eq('id', entityId)
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.maybeSingle();
		return {
			entity: data ? { id: data.id, project_id: data.project_id, title: data.title } : null,
			error
		};
	}

	if (entityType === 'goal') {
		const { data, error } = await supabase
			.from('onto_goals')
			.select('id, project_id, name')
			.eq('id', entityId)
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.maybeSingle();
		return {
			entity: data ? { id: data.id, project_id: data.project_id, title: data.name } : null,
			error
		};
	}

	const { data, error } = await supabase
		.from('onto_plans')
		.select('id, project_id, name')
		.eq('id', entityId)
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.maybeSingle();
	return {
		entity: data ? { id: data.id, project_id: data.project_id, title: data.name } : null,
		error
	};
}

async function fetchProjectName(supabase: App.Locals['supabase'], projectId: string) {
	const { data } = await supabase
		.from('onto_projects')
		.select('name')
		.eq('id', projectId)
		.maybeSingle();
	return data?.name ?? 'Project';
}

async function fetchActor(
	supabase: App.Locals['supabase'],
	actorId: string
): Promise<ActorSummary | null> {
	const { data, error } = await supabase
		.from('onto_actors')
		.select('id, user_id, name, email')
		.eq('id', actorId)
		.maybeSingle();

	if (error || !data) return null;
	return data;
}

async function fetchActiveProjectMemberActor(
	supabase: App.Locals['supabase'],
	projectId: string,
	actorId: string
): Promise<ActorSummary | null> {
	const { data, error } = await supabase
		.from('onto_project_members')
		.select('actor:onto_actors!onto_project_members_actor_id_fkey(id, user_id, name, email)')
		.eq('project_id', projectId)
		.eq('actor_id', actorId)
		.is('removed_at', null)
		.maybeSingle();

	if (error || !data?.actor) return null;
	const actor = Array.isArray(data.actor) ? data.actor[0] : data.actor;
	return actor ?? null;
}

async function fetchMembersAndAssignments({
	supabase,
	projectId,
	entityType,
	entityId
}: {
	supabase: App.Locals['supabase'];
	projectId: string;
	entityType: EntityType;
	entityId: string;
}) {
	const [membersResult, assignmentsResult] = await Promise.all([
		supabase
			.from('onto_project_members')
			.select(
				'id, project_id, actor_id, role_key, access, role_name, created_at, removed_at, actor:onto_actors!onto_project_members_actor_id_fkey(id, user_id, name, email)'
			)
			.eq('project_id', projectId)
			.is('removed_at', null)
			.order('created_at', { ascending: true }),
		supabase
			.from('onto_assignments')
			.select(
				'id, actor_id, object_kind, object_id, role_key, created_at, actor:onto_actors!onto_assignments_actor_id_fkey(id, user_id, name, email)'
			)
			.eq('object_kind', entityType)
			.eq('object_id', entityId)
			.eq('role_key', 'owner')
			.order('created_at', { ascending: false })
	]);

	return {
		membersResult,
		assignmentsResult
	};
}

async function notifyInApp({
	supabase,
	recipientUserId,
	actorUserId,
	projectId,
	projectName,
	entityType,
	entityId,
	entityTitle,
	actorName,
	message,
	actionPath,
	action
}: {
	supabase: App.Locals['supabase'];
	recipientUserId: string;
	actorUserId: string;
	projectId: string;
	projectName: string;
	entityType: EntityType;
	entityId: string;
	entityTitle: string;
	actorName: string;
	message: string;
	actionPath: string;
	action: CollaborationAction;
}) {
	const entityLabel = getEntityLabel(entityType);
	const defaultMessage =
		action === 'assign'
			? `${actorName} assigned you as owner of ${getIndefiniteArticle(entityLabel)} ${entityLabel} in ${projectName}.`
			: `${actorName} pinged you about ${getIndefiniteArticle(entityLabel)} ${entityLabel} in ${projectName}.`;
	const fullMessage = message ? `${defaultMessage} ${message}` : defaultMessage;

	return createTrackedInAppNotification({
		supabase,
		recipientUserId,
		eventType: 'entity.tagged',
		actorUserId,
		eventSource: 'api_action',
		type: action === 'assign' ? 'entity_assigned' : 'entity_pinged',
		title: action === 'assign' ? 'Entity assigned to you' : 'BuildOS ping',
		message: fullMessage,
		actionUrl: actionPath,
		payload: {
			project_id: projectId,
			project_name: projectName,
			entity_type: entityType,
			entity_id: entityId,
			entity_title: entityTitle,
			actor_user_id: actorUserId,
			source: action === 'assign' ? 'manual_assignment' : 'manual_ping'
		},
		data: {
			project_id: projectId,
			entity_type: entityType,
			entity_id: entityId,
			entity_title: entityTitle,
			actor_user_id: actorUserId,
			source: action === 'assign' ? 'manual_assignment' : 'manual_ping',
			...(message ? { message } : {})
		}
	});
}

async function sendEntityEmail({
	supabase,
	request,
	recipient,
	recipientUserId,
	actorUserId,
	projectName,
	entityType,
	entityId,
	entityTitle,
	actorName,
	message,
	actionPath,
	action
}: {
	supabase: App.Locals['supabase'];
	request: Request;
	recipient: ActorSummary;
	recipientUserId: string | null;
	actorUserId: string;
	projectName: string;
	entityType: EntityType;
	entityId: string;
	entityTitle: string;
	actorName: string;
	message: string;
	actionPath: string;
	action: CollaborationAction;
}) {
	if (!recipient.email) {
		return { success: false, error: 'Selected collaborator does not have an email address' };
	}

	const entityLabel = getEntityLabel(entityType);
	const baseUrl = getBaseUrl(request);
	const actionUrl = new URL(actionPath, baseUrl).toString();
	const subject =
		action === 'assign'
			? `${actorName} assigned you a ${entityLabel} in BuildOS`
			: `${actorName} pinged you about ${entityTitle}`;
	const intro =
		action === 'assign'
			? `${actorName} assigned you as owner of ${getIndefiniteArticle(entityLabel)} ${entityLabel} in ${projectName}.`
			: `${actorName} asked you to look at ${getIndefiniteArticle(entityLabel)} ${entityLabel} in ${projectName}.`;
	const escapedMessage = escapeHtml(message || 'No extra message included.');
	const html = generateMinimalEmailHTML({
		subject,
		content: `
			<p>${escapeHtml(intro)}</p>
			<p><strong>${escapeHtml(entityTitle)}</strong></p>
			<blockquote style="border-left:3px solid #D6D3CC;margin:16px 0;padding:8px 0 8px 14px;color:#3f3f46;">${escapedMessage.replace(/\n/g, '<br>')}</blockquote>
			<p><a href="${escapeHtml(actionUrl)}">Open in BuildOS</a></p>
		`
	});
	const body = `${intro}\n\n${entityTitle}\n\n${message || 'No extra message included.'}\n\nOpen in BuildOS: ${actionUrl}`;

	const emailService = new EmailService(supabase as any);
	return emailService.sendEmail({
		to: recipient.email,
		subject,
		body,
		html,
		from: 'dj',
		userId: recipientUserId,
		createdBy: actorUserId,
		trackingEnabled: true,
		metadata: {
			notification_type: 'entity_collaboration',
			project_name: projectName,
			entity_type: entityType,
			entity_id: entityId,
			entity_title: entityTitle,
			action
		}
	});
}

async function logCollaborationAction({
	supabase,
	projectId,
	entityType,
	entityId,
	changedBy,
	changedByActorId,
	action,
	targetActorId,
	channel,
	message
}: {
	supabase: App.Locals['supabase'];
	projectId: string;
	entityType: EntityType;
	entityId: string;
	changedBy: string;
	changedByActorId: string;
	action: CollaborationAction;
	targetActorId: string;
	channel: DeliveryChannel;
	message: string;
}) {
	await supabase.from('onto_project_logs').insert({
		project_id: projectId,
		entity_type: entityType,
		entity_id: entityId,
		action: 'updated',
		changed_by: changedBy,
		changed_by_actor_id: changedByActorId,
		change_source: 'api',
		after_data: {
			event: action === 'assign' ? 'entity_owner_assigned' : 'entity_ping_sent',
			target_actor_id: targetActorId,
			channel,
			has_message: message.length > 0
		}
	});
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const supabase = locals.supabase;
	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'read'
	});
	if (!access.ok) return access.response;

	const entityType = normalizeEntityType(url.searchParams.get('entity_type'));
	const entityId = url.searchParams.get('entity_id') ?? '';
	if (!entityType) return ApiResponse.badRequest('Invalid entity_type');
	if (!isValidUUID(entityId)) return ApiResponse.badRequest('Invalid entity_id');

	try {
		const { entity, error: entityError } = await fetchEntity({
			supabase,
			entityType,
			entityId,
			projectId: access.projectId
		});
		if (entityError) return ApiResponse.databaseError(entityError as Error);
		if (!entity) return ApiResponse.notFound('Entity');

		const projectName = await fetchProjectName(supabase, access.projectId);
		const { membersResult, assignmentsResult } = await fetchMembersAndAssignments({
			supabase,
			projectId: access.projectId,
			entityType,
			entityId
		});

		if (membersResult.error) return ApiResponse.databaseError(membersResult.error);
		if (assignmentsResult.error) return ApiResponse.databaseError(assignmentsResult.error);

		return ApiResponse.success({
			entity,
			projectName,
			members: membersResult.data ?? [],
			assignments: assignmentsResult.data ?? [],
			actorId: access.actorId
		});
	} catch (error) {
		console.error('[Entity Collaboration GET] Failed:', error);
		await logOntologyApiError({
			supabase,
			error,
			endpoint: `/api/onto/projects/${access.projectId}/entity-collaboration`,
			method: 'GET',
			userId: access.userId,
			projectId: access.projectId,
			entityType,
			entityId,
			operation: 'entity_collaboration_fetch'
		});
		return ApiResponse.internalError(error, 'Failed to load collaboration data');
	}
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const supabase = locals.supabase;
	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'write'
	});
	if (!access.ok) return access.response;

	try {
		const body = (await request.json()) as Record<string, unknown>;
		const entityType = normalizeEntityType(body.entity_type ?? body.entityType);
		const entityId =
			typeof (body.entity_id ?? body.entityId) === 'string'
				? ((body.entity_id ?? body.entityId) as string).trim()
				: '';
		const targetActorId =
			typeof (body.actor_id ?? body.actorId) === 'string'
				? ((body.actor_id ?? body.actorId) as string).trim()
				: '';
		const action = normalizeAction(body.action);
		const channel = normalizeDeliveryChannel(body.channel);
		const message = normalizeMessage(body.message);

		if (!entityType) return ApiResponse.badRequest('Invalid entity_type');
		if (!isValidUUID(entityId)) return ApiResponse.badRequest('Invalid entity_id');
		if (!isValidUUID(targetActorId)) return ApiResponse.badRequest('Invalid actor_id');
		if (!action) return ApiResponse.badRequest('Invalid action');
		if (action === 'ping' && !message) {
			return ApiResponse.badRequest('Message is required when pinging a collaborator');
		}

		const { entity, error: entityError } = await fetchEntity({
			supabase,
			entityType,
			entityId,
			projectId: access.projectId
		});
		if (entityError) return ApiResponse.databaseError(entityError as Error);
		if (!entity) return ApiResponse.notFound('Entity');

		const [projectName, targetActor, actor] = await Promise.all([
			fetchProjectName(supabase, access.projectId),
			fetchActiveProjectMemberActor(supabase, access.projectId, targetActorId),
			fetchActor(supabase, access.actorId)
		]);

		if (!targetActor) {
			return ApiResponse.badRequest('Selected collaborator must be an active project member');
		}

		if (action === 'ping' && targetActor.id === access.actorId) {
			return ApiResponse.badRequest('Choose another collaborator to ping');
		}

		if (action === 'assign') {
			const { error: deleteError } = await supabase
				.from('onto_assignments')
				.delete()
				.eq('object_kind', entityType)
				.eq('object_id', entityId)
				.eq('role_key', 'owner');
			if (deleteError) return ApiResponse.databaseError(deleteError);

			const { error: insertError } = await supabase.from('onto_assignments').insert({
				actor_id: targetActor.id,
				object_kind: entityType,
				object_id: entityId,
				role_key: 'owner'
			});
			if (insertError) return ApiResponse.databaseError(insertError);
		}

		const actorName = getDisplayName(actor);
		const actionPath = getEntityActionPath(entityType, access.projectId, entityId);
		let deliveryResult: { success: boolean; error?: string | null } | null = null;

		if (targetActor.user_id && targetActor.user_id !== access.userId && channel === 'in_app') {
			deliveryResult = await notifyInApp({
				supabase,
				recipientUserId: targetActor.user_id,
				actorUserId: access.userId,
				projectId: access.projectId,
				projectName,
				entityType,
				entityId,
				entityTitle: entity.title,
				actorName,
				message,
				actionPath,
				action
			});
			if (!deliveryResult.success) {
				return ApiResponse.error(
					deliveryResult.error ?? 'Failed to send BuildOS notification',
					500
				);
			}
		}

		if (channel === 'email') {
			deliveryResult = await sendEntityEmail({
				supabase,
				request,
				recipient: targetActor,
				recipientUserId: targetActor.user_id,
				actorUserId: access.userId,
				projectName,
				entityType,
				entityId,
				entityTitle: entity.title,
				actorName,
				message,
				actionPath,
				action
			});
			if (!deliveryResult.success) {
				return ApiResponse.error(deliveryResult.error ?? 'Failed to send email', 500);
			}
		}

		await logCollaborationAction({
			supabase,
			projectId: access.projectId,
			entityType,
			entityId,
			changedBy: access.userId,
			changedByActorId: access.actorId,
			action,
			targetActorId: targetActor.id,
			channel,
			message
		});

		return ApiResponse.success({
			action,
			channel,
			entity,
			targetActor,
			assigned: action === 'assign',
			delivered: Boolean(deliveryResult?.success)
		});
	} catch (error) {
		console.error('[Entity Collaboration POST] Failed:', error);
		await logOntologyApiError({
			supabase,
			error,
			endpoint: `/api/onto/projects/${access.projectId}/entity-collaboration`,
			method: 'POST',
			userId: access.userId,
			projectId: access.projectId,
			entityType: 'project',
			operation: 'entity_collaboration_mutate'
		});
		return ApiResponse.internalError(error, 'Failed to update collaboration state');
	}
};
