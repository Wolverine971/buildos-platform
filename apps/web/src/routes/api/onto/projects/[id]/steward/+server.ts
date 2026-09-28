// apps/web/src/routes/api/onto/projects/[id]/steward/+server.ts
//
// Project stewards beta (docs/product/project-agents-plan-2026-09-25.md).
//
// GET  /api/onto/projects/[id]/steward -> ProjectStewardStatus | { enabled: false }
// POST /api/onto/projects/[id]/steward { action: 'approve_charter', expected_sha256 }
// POST /api/onto/projects/[id]/steward { action: 'set_active', active: boolean }
//
// Behind the `project_steward` feature flag. Approving copies the charter
// document's current text into the caller's own profile row, which is the only
// charter the chat prompt follows, and only when that text still hashes to
// `expected_sha256` (the `charterSha256` of the text the user reviewed; 409
// otherwise). The switch changes only the caller's chat.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { FEATURE_KEYS, isFeatureEnabled } from '$lib/utils/feature-flags';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	ProjectStewardError,
	approveProjectStewardCharter,
	loadProjectStewardStatus,
	setProjectStewardActive
} from '$lib/server/project-steward.service';

const SHA256_HEX = /^[0-9a-f]{64}$/;

export const GET: RequestHandler = async ({ params, locals }) => {
	// Every project chat open asks, so accounts without the flag get their answer
	// from one flag read, before the project access checks.
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!(await isFeatureEnabled(locals.supabase, user.id, FEATURE_KEYS.projectSteward))) {
		return ApiResponse.success({ enabled: false });
	}

	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'read',
		user
	});
	if (!access.ok) return access.response;

	try {
		const status = await loadProjectStewardStatus({
			supabase: locals.supabase,
			userId: access.userId,
			projectId: access.projectId
		});
		return ApiResponse.success({ enabled: true, ...status });
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to load the project steward');
	}
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'write'
	});
	if (!access.ok) return access.response;

	if (!(await isFeatureEnabled(locals.supabase, access.userId, FEATURE_KEYS.projectSteward))) {
		return ApiResponse.forbidden('Project stewards are not enabled for this account');
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Request body must be JSON');
	}
	const fields: Record<string, unknown> =
		body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
	const { action, active, expected_sha256: expectedSha256 } = fields;

	if (
		action === 'approve_charter' &&
		(typeof expectedSha256 !== 'string' || !SHA256_HEX.test(expectedSha256))
	) {
		return ApiResponse.badRequest(
			'expected_sha256 must be the charterSha256 of the charter text you reviewed'
		);
	}

	const common = {
		supabase: locals.supabase,
		admin: createAdminSupabaseClient(),
		userId: access.userId,
		projectId: access.projectId
	};
	try {
		if (action === 'approve_charter' && typeof expectedSha256 === 'string') {
			return ApiResponse.success({
				enabled: true,
				...(await approveProjectStewardCharter({ ...common, expectedSha256 }))
			});
		}
		if (action === 'set_active' && typeof active === 'boolean') {
			return ApiResponse.success({
				enabled: true,
				...(await setProjectStewardActive({ ...common, active }))
			});
		}
		return ApiResponse.badRequest(
			"action must be 'approve_charter' with expected_sha256, or 'set_active' with a boolean active"
		);
	} catch (error) {
		if (error instanceof ProjectStewardError) {
			return ApiResponse.error(error.message, error.status);
		}
		return ApiResponse.internalError(error, 'Failed to update the project steward');
	}
};
