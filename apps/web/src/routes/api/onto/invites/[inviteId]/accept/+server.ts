// apps/web/src/routes/api/onto/invites/[inviteId]/accept/+server.ts
/**
 * Accept a project invite by invite id.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../shared/error-logging';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { randomUUID } from 'crypto';

export const POST: RequestHandler = async ({ params, locals }) => {
	const supabase = locals.supabase;
	let userId: string | undefined;
	let projectId: string | undefined;
	const inviteId = params.inviteId?.trim();

	try {
		const { user } = await locals.safeGetSession();
		userId = user?.id;
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		if (!inviteId) {
			return ApiResponse.badRequest('Invite ID required');
		}

		const { data, error } = await supabase.rpc('accept_project_invite_by_id', {
			p_invite_id: inviteId
		});

		if (error) {
			await logOntologyApiError({
				supabase,
				error,
				endpoint: `/api/onto/invites/${inviteId}/accept`,
				method: 'POST',
				userId: user.id,
				entityType: 'project_invite',
				operation: 'project_invite_accept'
			});
			return ApiResponse.error(error.message, 400);
		}

		const result = Array.isArray(data) ? data[0] : data;
		projectId = result?.project_id as string | undefined;

		// Log acceptance to project activity + notify owners
		if (projectId) {
			const actorId = await ensureActorId(supabase, user.id);

			// Activity log entry for project feed
			const { error: logError } = await supabase.from('onto_project_logs').insert({
				project_id: projectId,
				entity_type: 'project',
				entity_id: projectId,
				action: 'updated',
				changed_by: user.id,
				changed_by_actor_id: actorId,
				change_source: 'api',
				after_data: {
					event: 'invite_accepted',
					role_key: result?.role_key ?? null,
					access: result?.access ?? null,
					actor_id: actorId
				}
			});
			if (logError) {
				console.warn('[Invite Accept API] Failed to log invite acceptance:', logError);
				void logOntologyApiError({
					supabase,
					error: logError,
					endpoint: `/api/onto/invites/${inviteId}/accept`,
					method: 'POST',
					userId,
					projectId,
					entityType: 'project_invite',
					operation: 'project_invite_accept_log'
				});
			}

			// Build in-app notification for project owners (and inviter if distinct)
			const { data: project, error: projectError } = await supabase
				.from('onto_projects')
				.select('id, name')
				.eq('id', projectId)
				.maybeSingle();
			if (projectError) {
				void logOntologyApiError({
					supabase,
					error: projectError,
					endpoint: `/api/onto/invites/${inviteId}/accept`,
					method: 'POST',
					userId,
					projectId,
					entityType: 'project_invite',
					operation: 'project_invite_accept_project_fetch'
				});
			}

			const { data: owners, error: ownersError } = await supabase
				.from('onto_project_members')
				.select(
					'actor_id, role_key, access, removed_at, actor:onto_actors!onto_project_members_actor_id_fkey(user_id)'
				)
				.eq('project_id', projectId)
				.eq('role_key', 'owner')
				.is('removed_at', null);
			if (ownersError) {
				void logOntologyApiError({
					supabase,
					error: ownersError,
					endpoint: `/api/onto/invites/${inviteId}/accept`,
					method: 'POST',
					userId,
					projectId,
					entityType: 'project_invite',
					operation: 'project_invite_accept_owner_fetch'
				});
			}

			const recipients = new Set<string>();
			for (const owner of owners ?? []) {
				const uid = (owner as any)?.actor?.user_id as string | null;
				if (uid) recipients.add(uid);
			}

			// Ensure inviter also gets notified if available
			const { data: inviteRow, error: inviteRowError } = await supabase
				.from('onto_project_invites')
				.select('invited_by_actor_id, invited_by:invited_by_actor_id(user_id)')
				.eq('id', inviteId)
				.maybeSingle();
			if (inviteRowError) {
				void logOntologyApiError({
					supabase,
					error: inviteRowError,
					endpoint: `/api/onto/invites/${inviteId}/accept`,
					method: 'POST',
					userId,
					projectId,
					entityType: 'project_invite',
					operation: 'project_invite_accept_inviter_fetch'
				});
			}

			const inviterUserId = (inviteRow as any)?.invited_by?.user_id as string | null;
			if (inviterUserId) {
				recipients.add(inviterUserId);
			}

			if (recipients.size > 0) {
				const correlationId = randomUUID();
				const displayName = user.name || user.email || 'A teammate';
				const projectName = project?.name || 'project';
				const payload = {
					title: `${displayName} joined ${projectName}`,
					body: `${displayName} accepted an invite as ${result?.role_key ?? 'member'}`,
					project_id: projectId,
					actor_user_id: user.id,
					actor_actor_id: actorId,
					role_key: result?.role_key ?? null,
					access: result?.access ?? null
				};

				const { data: eventInsert, error: eventError } = await supabase
					.from('notification_events')
					.insert({
						event_type: 'project.invite.accepted',
						event_source: 'api_action',
						actor_user_id: user.id,
						target_user_id: null,
						payload,
						metadata: { correlationId },
						correlation_id: correlationId
					})
					.select('id')
					.single();

				if (!eventError && eventInsert?.id) {
					const deliveries = Array.from(recipients).map((recipientId) => ({
						event_id: eventInsert.id,
						recipient_user_id: recipientId,
						channel: 'in_app',
						status: 'delivered',
						payload,
						correlation_id: correlationId
					}));

					const { error: deliveryError } = await supabase
						.from('notification_deliveries')
						.insert(deliveries);

					if (deliveryError) {
						console.warn(
							'[Invite Accept API] Failed to create notification deliveries:',
							deliveryError
						);
						void logOntologyApiError({
							supabase,
							error: deliveryError,
							endpoint: `/api/onto/invites/${inviteId}/accept`,
							method: 'POST',
							userId,
							projectId,
							entityType: 'project_invite',
							operation: 'project_invite_accept_notify_deliveries'
						});
					}
				} else if (eventError) {
					console.warn(
						'[Invite Accept API] Failed to create notification event:',
						eventError
					);
					void logOntologyApiError({
						supabase,
						error: eventError,
						endpoint: `/api/onto/invites/${inviteId}/accept`,
						method: 'POST',
						userId,
						projectId,
						entityType: 'project_invite',
						operation: 'project_invite_accept_notify_event'
					});
				}
			}
		}

		return ApiResponse.success({
			projectId: result?.project_id,
			role_key: result?.role_key,
			access: result?.access
		});
	} catch (error) {
		console.error('[Invite Accept API] Failed to accept invite:', error);
		await logOntologyApiError({
			supabase,
			error,
			endpoint: inviteId
				? `/api/onto/invites/${inviteId}/accept`
				: '/api/onto/invites/:inviteId/accept',
			method: 'POST',
			userId,
			projectId,
			entityType: 'project_invite',
			entityId: inviteId,
			operation: 'project_invite_accept'
		});
		return ApiResponse.internalError(error, 'Failed to accept invite');
	}
};
