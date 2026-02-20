// apps/web/src/routes/api/onto/projects/[id]/notification-settings/+server.ts
/**
 * Project-scoped notification settings (shared project activity).
 *
 * - GET: load effective settings for current actor
 * - PATCH: update member override and/or project default (admin-only for project default)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { logOntologyApiError } from '../../../shared/error-logging';

interface ProjectNotificationSettingsRow {
	project_id: string;
	member_count: number;
	is_shared_project: boolean;
	project_default_enabled: boolean;
	member_enabled: boolean;
	effective_enabled: boolean;
	member_overridden: boolean;
	can_manage_default: boolean;
}

function mapRpcError(message: string | undefined) {
	if (!message) return null;
	if (message.includes('Access denied')) {
		return ApiResponse.forbidden('Access denied');
	}
	if (message.includes('Only project admins')) {
		return ApiResponse.forbidden(message);
	}
	if (message.includes('Only collaborators')) {
		return ApiResponse.forbidden(message);
	}
	if (message.includes('Project not found')) {
		return ApiResponse.notFound('Project');
	}
	if (message.includes('At least one setting') || message.includes('Project ID is required')) {
		return ApiResponse.badRequest(message);
	}
	return null;
}

function normalizeSettings(
	row: Record<string, unknown> | null
): ProjectNotificationSettingsRow | null {
	if (!row) {
		return null;
	}

	return {
		project_id: String(row.project_id || ''),
		member_count: Number(row.member_count || 0),
		is_shared_project: Boolean(row.is_shared_project),
		project_default_enabled: Boolean(row.project_default_enabled),
		member_enabled: Boolean(row.member_enabled),
		effective_enabled: Boolean(row.effective_enabled),
		member_overridden: Boolean(row.member_overridden),
		can_manage_default: Boolean(row.can_manage_default)
	};
}

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const projectId = params.id;
		if (!projectId) {
			return ApiResponse.badRequest('Project ID required');
		}

		const supabase = locals.supabase;
		await ensureActorId(supabase, user.id);

		const { data, error } = await supabase.rpc('get_project_notification_settings', {
			p_project_id: projectId
		});

		if (error) {
			await logOntologyApiError({
				supabase,
				error,
				endpoint: `/api/onto/projects/${projectId}/notification-settings`,
				method: 'GET',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_notification_settings_get'
			});

			const mapped = mapRpcError(error.message);
			if (mapped) {
				return mapped;
			}
			return ApiResponse.internalError(error, 'Failed to load notification settings');
		}

		const row = Array.isArray(data) ? (data[0] as Record<string, unknown>) : null;
		const settings = normalizeSettings(row);
		if (!settings || !settings.project_id) {
			return ApiResponse.notFound('Project');
		}

		return ApiResponse.success({ settings });
	} catch (error) {
		console.error('[Project Notification Settings API] Failed to load settings:', error);
		return ApiResponse.internalError(error, 'Failed to load notification settings');
	}
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const projectId = params.id;
		if (!projectId) {
			return ApiResponse.badRequest('Project ID required');
		}

		const body = await request.json().catch(() => null);
		const memberEnabled =
			typeof body?.member_enabled === 'boolean' ? (body.member_enabled as boolean) : null;
		const projectDefaultEnabled =
			typeof body?.project_default_enabled === 'boolean'
				? (body.project_default_enabled as boolean)
				: null;

		if (memberEnabled === null && projectDefaultEnabled === null) {
			return ApiResponse.badRequest(
				'At least one setting must be provided: member_enabled or project_default_enabled'
			);
		}

		const supabase = locals.supabase;
		await ensureActorId(supabase, user.id);

		const { data, error } = await supabase.rpc('set_project_notification_settings', {
			p_project_id: projectId,
			p_member_enabled: memberEnabled ?? undefined,
			p_project_default_enabled: projectDefaultEnabled ?? undefined
		});

		if (error) {
			await logOntologyApiError({
				supabase,
				error,
				endpoint: `/api/onto/projects/${projectId}/notification-settings`,
				method: 'PATCH',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_notification_settings_update'
			});

			const mapped = mapRpcError(error.message);
			if (mapped) {
				return mapped;
			}
			return ApiResponse.internalError(error, 'Failed to update notification settings');
		}

		const row = Array.isArray(data) ? (data[0] as Record<string, unknown>) : null;
		const settings = normalizeSettings(row);
		if (!settings || !settings.project_id) {
			return ApiResponse.notFound('Project');
		}

		if (settings.effective_enabled) {
			const { error: subscriptionUpsertError } = await supabase
				.from('notification_subscriptions')
				.upsert(
					{
						user_id: user.id,
						event_type: 'project.activity.batched',
						is_active: true,
						admin_only: false,
						created_by: user.id,
						updated_at: new Date().toISOString()
					},
					{ onConflict: 'user_id,event_type' }
				);

			if (subscriptionUpsertError) {
				await logOntologyApiError({
					supabase,
					error: subscriptionUpsertError,
					endpoint: `/api/onto/projects/${projectId}/notification-settings`,
					method: 'PATCH',
					userId: user.id,
					projectId,
					entityType: 'project',
					operation: 'project_notification_settings_subscription_upsert'
				});
			}
		}

		return ApiResponse.success({ settings });
	} catch (error) {
		console.error('[Project Notification Settings API] Failed to update settings:', error);
		return ApiResponse.internalError(error, 'Failed to update notification settings');
	}
};
