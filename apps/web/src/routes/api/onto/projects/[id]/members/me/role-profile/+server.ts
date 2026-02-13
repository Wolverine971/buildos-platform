// apps/web/src/routes/api/onto/projects/[id]/members/me/role-profile/+server.ts
/**
 * Manage the current member's project role profile.
 * - PATCH: manually update role_name / role_description
 * - POST: generate role profile from freeform role context (AI-assisted), optionally save
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { cleanJSONResponse } from '$lib/services/smart-llm/response-parsing';
import { logOntologyApiError } from '../../../../../shared/error-logging';

const ROLE_NAME_MIN = 2;
const ROLE_NAME_MAX = 80;
const ROLE_DESCRIPTION_MIN = 8;
const ROLE_DESCRIPTION_MAX = 600;
const ROLE_CONTEXT_MIN = 12;
const ROLE_CONTEXT_MAX = 2500;

type RoleProfile = {
	role_name: string;
	role_description: string;
};

type ActiveMemberRow = {
	id: string;
	project_id: string;
	actor_id: string;
	role_key: string;
	role_name: string | null;
	role_description: string | null;
	removed_at: string | null;
};

const DEFAULT_ROLE_PROFILE_BY_KEY = {
	owner: {
		role_name: 'Project Owner',
		role_description: 'Owns project direction, decision-making, and final approval.'
	},
	editor: {
		role_name: 'Collaborator',
		role_description:
			'Contributes actively by creating, editing, and coordinating project work.'
	},
	viewer: {
		role_name: 'Observer',
		role_description:
			'Tracks progress and context, with read-only visibility into project work.'
	}
} as const;

function normalizeNullableString(value: unknown): string | null {
	if (value === null) return null;
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function validateRoleName(value: string | null): string | null {
	if (value === null) return null;
	if (value.length < ROLE_NAME_MIN || value.length > ROLE_NAME_MAX) return null;
	return value;
}

function validateRoleDescription(value: string | null): string | null {
	if (value === null) return null;
	if (value.length < ROLE_DESCRIPTION_MIN || value.length > ROLE_DESCRIPTION_MAX) return null;
	return value;
}

function getDefaultRoleProfile(roleKey: string | null | undefined): RoleProfile {
	if (roleKey === 'owner') return DEFAULT_ROLE_PROFILE_BY_KEY.owner;
	if (roleKey === 'editor') return DEFAULT_ROLE_PROFILE_BY_KEY.editor;
	return DEFAULT_ROLE_PROFILE_BY_KEY.viewer;
}

function normalizeGeneratedRoleProfile(
	raw: unknown,
	fallbackRoleKey: string | null | undefined
): RoleProfile | null {
	if (!raw || typeof raw !== 'object') return null;
	const record = raw as Record<string, unknown>;

	const parsedName = validateRoleName(normalizeNullableString(record.role_name));
	const parsedDescription = validateRoleDescription(
		normalizeNullableString(record.role_description)
	);
	const fallback = getDefaultRoleProfile(fallbackRoleKey);

	const role_name = parsedName ?? fallback.role_name;
	const role_description = parsedDescription ?? fallback.role_description;

	if (!role_name || !role_description) return null;
	return { role_name, role_description };
}

async function resolveMemberContext(params: {
	supabase: any;
	userId: string;
	projectId: string;
	endpoint: string;
	method: 'PATCH' | 'POST';
}): Promise<
	| { success: true; actorId: string; member: ActiveMemberRow; projectName: string | null }
	| { success: false; response: Response }
> {
	const { supabase, userId, projectId, endpoint, method } = params;

	const actorId = await ensureActorId(supabase, userId);
	const { data: hasAccess, error: accessError } = await supabase.rpc(
		'current_actor_has_project_access',
		{
			p_project_id: projectId,
			p_required_access: 'read'
		}
	);

	if (accessError) {
		await logOntologyApiError({
			supabase,
			error: accessError,
			endpoint,
			method,
			userId,
			projectId,
			entityType: 'project',
			operation: 'project_member_profile_access'
		});
		return {
			success: false,
			response: ApiResponse.internalError(accessError, 'Failed to check project access')
		};
	}

	if (!hasAccess) {
		return { success: false, response: ApiResponse.forbidden('Access denied') };
	}

	const { data: member, error: memberError } = await supabase
		.from('onto_project_members')
		.select('id, project_id, actor_id, role_key, role_name, role_description, removed_at')
		.eq('project_id', projectId)
		.eq('actor_id', actorId)
		.is('removed_at', null)
		.maybeSingle();

	if (memberError) {
		await logOntologyApiError({
			supabase,
			error: memberError,
			endpoint,
			method,
			userId,
			projectId,
			entityType: 'project_member',
			operation: 'project_member_profile_member_fetch',
			tableName: 'onto_project_members'
		});
		return { success: false, response: ApiResponse.databaseError(memberError) };
	}

	if (!member) {
		return {
			success: false,
			response: ApiResponse.forbidden('You must be an active project member')
		};
	}

	const { data: project, error: projectError } = await supabase
		.from('onto_projects')
		.select('name')
		.eq('id', projectId)
		.is('deleted_at', null)
		.maybeSingle();

	if (projectError) {
		await logOntologyApiError({
			supabase,
			error: projectError,
			endpoint,
			method,
			userId,
			projectId,
			entityType: 'project',
			operation: 'project_member_profile_project_fetch',
			tableName: 'onto_projects'
		});
	}

	return {
		success: true,
		actorId,
		member: member as ActiveMemberRow,
		projectName: project?.name ?? null
	};
}

async function updateMemberRoleProfile(params: {
	supabase: any;
	projectId: string;
	actorId: string;
	memberId: string;
	roleName: string | null;
	roleDescription: string | null;
	userId: string;
	eventName: 'member_role_profile_updated' | 'member_role_profile_generated';
}): Promise<{ success: true } | { success: false; response: Response }> {
	const { supabase, projectId, actorId, memberId, roleName, roleDescription, userId, eventName } =
		params;

	const { error: updateError } = await supabase
		.from('onto_project_members')
		.update({
			role_name: roleName,
			role_description: roleDescription
		})
		.eq('id', memberId)
		.eq('project_id', projectId)
		.eq('actor_id', actorId)
		.is('removed_at', null);

	if (updateError) {
		return { success: false, response: ApiResponse.databaseError(updateError) };
	}

	await supabase.from('onto_project_logs').insert({
		project_id: projectId,
		entity_type: 'project',
		entity_id: projectId,
		action: 'updated',
		changed_by: userId,
		changed_by_actor_id: actorId,
		change_source: 'api',
		after_data: {
			event: eventName,
			member_id: memberId,
			actor_id: actorId,
			role_name: roleName,
			role_description: roleDescription
		}
	});

	return { success: true };
}

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const supabase = locals.supabase;
	const endpoint = '/api/onto/projects/:id/members/me/role-profile';

	try {
		const { user } = await locals.safeGetSession();
		if (!user) return ApiResponse.unauthorized('Authentication required');

		const projectId = params.id?.trim();
		if (!projectId) return ApiResponse.badRequest('Project ID required');

		const body = await request.json().catch(() => null);
		const hasRoleName = body && Object.prototype.hasOwnProperty.call(body, 'role_name');
		const hasRoleDescription =
			body && Object.prototype.hasOwnProperty.call(body, 'role_description');

		if (!hasRoleName && !hasRoleDescription) {
			return ApiResponse.badRequest('Provide role_name and/or role_description');
		}

		const ctx = await resolveMemberContext({
			supabase,
			userId: user.id,
			projectId,
			endpoint,
			method: 'PATCH'
		});
		if (!ctx.success) return ctx.response;

		const roleNameRaw = hasRoleName
			? normalizeNullableString((body as Record<string, unknown>).role_name)
			: ctx.member.role_name;
		const roleDescriptionRaw = hasRoleDescription
			? normalizeNullableString((body as Record<string, unknown>).role_description)
			: ctx.member.role_description;

		const roleName = validateRoleName(roleNameRaw);
		const roleDescription = validateRoleDescription(roleDescriptionRaw);

		if (roleNameRaw !== null && roleName === null) {
			return ApiResponse.badRequest(
				`role_name must be between ${ROLE_NAME_MIN} and ${ROLE_NAME_MAX} characters`
			);
		}

		if (roleDescriptionRaw !== null && roleDescription === null) {
			return ApiResponse.badRequest(
				`role_description must be between ${ROLE_DESCRIPTION_MIN} and ${ROLE_DESCRIPTION_MAX} characters`
			);
		}

		const update = await updateMemberRoleProfile({
			supabase,
			projectId,
			actorId: ctx.actorId,
			memberId: ctx.member.id,
			roleName,
			roleDescription,
			userId: user.id,
			eventName: 'member_role_profile_updated'
		});
		if (!update.success) return update.response;

		return ApiResponse.success({
			member_id: ctx.member.id,
			role_name: roleName,
			role_description: roleDescription
		});
	} catch (error) {
		console.error('[Project Member Role Profile API] PATCH failed:', error);
		return ApiResponse.internalError(error, 'Failed to update role profile');
	}
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const supabase = locals.supabase;
	const endpoint = '/api/onto/projects/:id/members/me/role-profile';

	try {
		const { user } = await locals.safeGetSession();
		if (!user) return ApiResponse.unauthorized('Authentication required');

		const projectId = params.id?.trim();
		if (!projectId) return ApiResponse.badRequest('Project ID required');

		const body = await request.json().catch(() => null);
		const roleContext = normalizeNullableString(body?.role_context);
		const save = body?.save !== false;

		if (!roleContext) {
			return ApiResponse.badRequest('role_context is required');
		}

		if (roleContext.length < ROLE_CONTEXT_MIN || roleContext.length > ROLE_CONTEXT_MAX) {
			return ApiResponse.badRequest(
				`role_context must be between ${ROLE_CONTEXT_MIN} and ${ROLE_CONTEXT_MAX} characters`
			);
		}

		const ctx = await resolveMemberContext({
			supabase,
			userId: user.id,
			projectId,
			endpoint,
			method: 'POST'
		});
		if (!ctx.success) return ctx.response;

		const llm = new SmartLLMService({
			supabase,
			httpReferer: request.headers.get('referer') ?? undefined,
			appName: 'BuildOS Project Collaboration'
		});

		const systemPrompt = [
			'You create concise project role profiles.',
			`Return JSON only with keys: role_name, role_description.`,
			`role_name must be ${ROLE_NAME_MIN}-${ROLE_NAME_MAX} chars and should be a short title.`,
			`role_description must be ${ROLE_DESCRIPTION_MIN}-${ROLE_DESCRIPTION_MAX} chars and should focus on responsibilities and outcomes.`,
			'Avoid generic fluff and avoid permission labels like owner/editor/viewer unless explicitly described.'
		].join('\n');

		const userPrompt = JSON.stringify(
			{
				project_name: ctx.projectName,
				project_member_permission_role: ctx.member.role_key,
				role_context: roleContext
			},
			null,
			2
		);

		const response = await llm.generateText({
			systemPrompt,
			prompt: `Generate role profile JSON from this input:\n${userPrompt}`,
			temperature: 0.2,
			maxTokens: 220,
			operationType: 'project_member_role_profile_generate',
			userId: user.id,
			projectId
		});

		let parsed: unknown;
		try {
			parsed = JSON.parse(cleanJSONResponse(response));
		} catch (parseError) {
			await logOntologyApiError({
				supabase,
				error: parseError,
				endpoint,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project_member',
				operation: 'project_member_role_profile_generate_parse'
			});
			return ApiResponse.error('Failed to generate a valid role profile', 502);
		}

		const profile = normalizeGeneratedRoleProfile(parsed, ctx.member.role_key);
		if (!profile) {
			return ApiResponse.error('Failed to generate a usable role profile', 502);
		}

		if (save) {
			const update = await updateMemberRoleProfile({
				supabase,
				projectId,
				actorId: ctx.actorId,
				memberId: ctx.member.id,
				roleName: profile.role_name,
				roleDescription: profile.role_description,
				userId: user.id,
				eventName: 'member_role_profile_generated'
			});
			if (!update.success) return update.response;
		}

		return ApiResponse.success({
			member_id: ctx.member.id,
			role_name: profile.role_name,
			role_description: profile.role_description,
			saved: save
		});
	} catch (error) {
		console.error('[Project Member Role Profile API] POST failed:', error);
		return ApiResponse.internalError(error, 'Failed to generate role profile');
	}
};
