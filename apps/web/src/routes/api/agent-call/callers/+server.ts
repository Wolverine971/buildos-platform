// apps/web/src/routes/api/agent-call/callers/+server.ts
import type { RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { BuildosAgentCallerRevokeRequest } from '@buildos/shared-types';
import {
	CallerProvisioningError,
	CallerProvisioningService
} from '$lib/server/agent-call/caller-provisioning.service';
import { getSecurityEventLogOptions } from '$lib/server/security-event-logger';
import { ApiResponse, ErrorCode } from '$lib/utils/api-response';
import { routeErrorResponse } from '$lib/server/route-error';

function toErrorResponse(error: unknown) {
	if (error instanceof CallerProvisioningError) {
		return {
			status: error.status,
			body: {
				error: error.message,
				data: error.data
			}
		};
	}

	return {
		status: 500,
		body: {
			error: error instanceof Error ? error.message : 'Agent caller provisioning failed'
		}
	};
}

function apiErrorCodeForStatus(status: number): string {
	if (status === 401) return ErrorCode.UNAUTHORIZED;
	if (status === 403) return ErrorCode.FORBIDDEN;
	if (status === 404) return ErrorCode.NOT_FOUND;
	if (status === 409) return ErrorCode.ALREADY_EXISTS;
	if (status >= 500) return ErrorCode.INTERNAL_ERROR;
	return ErrorCode.INVALID_REQUEST;
}

async function provisioningErrorResponse(event: RequestEvent, error: unknown, operation: string) {
	const { status, body } = toErrorResponse(error);

	if (status >= 500) {
		return routeErrorResponse(event, error, {
			operation,
			message: body.error,
			status,
			details: body.data
		});
	}

	return ApiResponse.error(body.error, status, apiErrorCodeForStatus(status), body.data);
}

export const GET: RequestHandler = async (event) => {
	const {
		locals: { safeGetSession }
	} = event;
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Not authenticated');
	}

	try {
		const service = new CallerProvisioningService();
		return ApiResponse.success(await service.listForUser(user.id));
	} catch (error) {
		return provisioningErrorResponse(event, error, 'agent_call.callers.list');
	}
};

export const POST: RequestHandler = async (event) => {
	const {
		request,
		platform,
		locals: { safeGetSession }
	} = event;
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Not authenticated');
	}

	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Request body must be valid JSON');
	}

	try {
		const service = new CallerProvisioningService(
			undefined,
			getSecurityEventLogOptions(platform)
		);
		return ApiResponse.success(
			await service.provisionForUser(user.id, body, {
				baseUrl: new URL(request.url).origin
			})
		);
	} catch (error) {
		return provisioningErrorResponse(event, error, 'agent_call.callers.provision');
	}
};

export const DELETE: RequestHandler = async (event) => {
	const {
		request,
		platform,
		locals: { safeGetSession }
	} = event;
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Not authenticated');
	}

	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Request body must be valid JSON');
	}

	const callerId = (body as BuildosAgentCallerRevokeRequest | null)?.caller_id;
	if (typeof callerId !== 'string') {
		return ApiResponse.badRequest('caller_id is required');
	}

	try {
		const service = new CallerProvisioningService(
			undefined,
			getSecurityEventLogOptions(platform)
		);
		return ApiResponse.success(await service.revokeForUser(user.id, callerId));
	} catch (error) {
		return provisioningErrorResponse(event, error, 'agent_call.callers.revoke');
	}
};
