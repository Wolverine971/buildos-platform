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

		// Log acceptance to project activity + notify owners/inviter
		if (projectId) {
			const actorId = await ensureActorId(supabase, user.id);
			const nowIso = new Date().toISOString();

			// Keep project-activity event subscription aligned with project-level settings.
			const { data: settingsRows, error: settingsError } = await supabase.rpc(
				'get_project_notification_settings',
				{
					p_project_id: projectId
				}
			);

			if (settingsError) {
				void logOntologyApiError({
					supabase,
					error: settingsError,
					endpoint: `/api/onto/invites/${inviteId}/accept`,
					method: 'POST',
					userId,
					projectId,
					entityType: 'project_invite',
					operation: 'project_invite_accept_settings_fetch'
				});
			} else {
				const settingsRow = Array.isArray(settingsRows)
					? (settingsRows[0] as { effective_enabled?: boolean } | undefined)
					: undefined;

				if (settingsRow?.effective_enabled) {
					const { error: subscriptionUpsertError } = await supabase
						.from('notification_subscriptions')
						.upsert(
							{
								user_id: user.id,
								event_type: 'project.activity.batched',
								is_active: true,
								admin_only: false,
								created_by: user.id,
								updated_at: nowIso
							},
							{ onConflict: 'user_id,event_type' }
						);

					if (subscriptionUpsertError) {
						void logOntologyApiError({
							supabase,
							error: subscriptionUpsertError,
							endpoint: `/api/onto/invites/${inviteId}/accept`,
							method: 'POST',
							userId,
							projectId,
							entityType: 'project_invite',
							operation: 'project_invite_accept_project_activity_subscription_upsert'
						});
					}
				}
			}

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

			// Build notifications for project owners (and inviter if distinct)
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

			const recipientIds = Array.from(recipients).filter(
				(recipientId) => recipientId !== user.id
			);

			if (recipientIds.length > 0) {
				const eventType = 'project.invite.accepted';
				const correlationId = randomUUID();
				const displayName = user.name || user.email || 'A teammate';
				const projectName = project?.name || 'project';
				const payload = {
					title: `${displayName} joined ${projectName}`,
					body: `${displayName} accepted an invite as ${result?.role_key ?? 'member'}`,
					action_url: `/projects/${projectId}`,
					project_id: projectId,
					project_name: projectName,
					actor_user_id: user.id,
					actor_name: displayName,
					actor_actor_id: actorId,
					role_key: result?.role_key ?? null,
					access: result?.access ?? null
				};

				// Ensure recipients are explicitly subscribed for this event type.
				// Missing subscriptions are created; existing records are respected as-is.
				const { data: existingSubscriptions, error: existingSubscriptionsError } =
					await supabase
						.from('notification_subscriptions')
						.select('user_id')
						.eq('event_type', eventType)
						.in('user_id', recipientIds);

				if (existingSubscriptionsError) {
					void logOntologyApiError({
						supabase,
						error: existingSubscriptionsError,
						endpoint: `/api/onto/invites/${inviteId}/accept`,
						method: 'POST',
						userId,
						projectId,
						entityType: 'project_invite',
						operation: 'project_invite_accept_subscription_check'
					});
				}

				const existingSubscriptionUserIds = new Set(
					(existingSubscriptions ?? []).map((subscription) => subscription.user_id)
				);

				const missingSubscriptions = recipientIds
					.filter((recipientId) => !existingSubscriptionUserIds.has(recipientId))
					.map((recipientId) => ({
						user_id: recipientId,
						event_type: eventType,
						is_active: true,
						admin_only: false,
						created_by: user.id,
						updated_at: nowIso
					}));

				if (missingSubscriptions.length > 0) {
					const { error: subscriptionUpsertError } = await supabase
						.from('notification_subscriptions')
						.upsert(missingSubscriptions, {
							onConflict: 'user_id,event_type'
						});

					if (subscriptionUpsertError) {
						void logOntologyApiError({
							supabase,
							error: subscriptionUpsertError,
							endpoint: `/api/onto/invites/${inviteId}/accept`,
							method: 'POST',
							userId,
							projectId,
							entityType: 'project_invite',
							operation: 'project_invite_accept_subscription_upsert'
						});
					}
				}

				await Promise.all(
					recipientIds.map(async (recipientId) => {
						const { error: emitError } = await (supabase.rpc as any)(
							'emit_notification_event',
							{
								p_event_type: eventType,
								p_event_source: 'api_action',
								p_actor_user_id: user.id,
								p_target_user_id: recipientId,
								p_payload: payload,
								p_metadata: {
									correlationId,
									projectId,
									recipientUserId: recipientId,
									inviteId
								}
							}
						);

						if (emitError) {
							void logOntologyApiError({
								supabase,
								error: emitError,
								endpoint: `/api/onto/invites/${inviteId}/accept`,
								method: 'POST',
								userId,
								projectId,
								entityType: 'project_invite',
								operation: 'project_invite_accept_notify_emit'
							});
						}
					})
				);
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
