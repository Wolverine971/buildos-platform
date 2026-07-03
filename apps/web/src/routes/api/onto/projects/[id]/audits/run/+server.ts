// apps/web/src/routes/api/onto/projects/[id]/audits/run/+server.ts
import type { RequestHandler } from './$types';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { queueProjectAudit } from '$lib/server/project-audit-trigger.service';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import type { ProjectAuditDepth } from '@buildos/shared-types';

function isAuditDepth(value: unknown): value is ProjectAuditDepth {
	return value === 'standard' || value === 'deep';
}

export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Not found');

	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'write'
	});
	if (!access.ok) return access.response;

	let auditDepth: ProjectAuditDepth = 'standard';
	try {
		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		if (body.auditDepth !== undefined) {
			if (!isAuditDepth(body.auditDepth)) {
				return ApiResponse.badRequest('auditDepth must be standard or deep');
			}
			auditDepth = body.auditDepth;
		}
	} catch {
		return ApiResponse.badRequest('Invalid JSON body');
	}

	try {
		const result = await queueProjectAudit({
			projectId: access.projectId,
			userId: access.userId,
			triggerReason: 'manual',
			auditDepth
		});

		if (!result.queued && result.decision === 'queued') {
			return ApiResponse.error(
				result.reason,
				HttpStatus.SERVICE_UNAVAILABLE,
				'PROJECT_AUDIT_QUEUE_FAILED'
			);
		}

		return result.queued ? ApiResponse.created(result) : ApiResponse.success(result);
	} catch (error) {
		return ApiResponse.databaseError(error);
	}
};
