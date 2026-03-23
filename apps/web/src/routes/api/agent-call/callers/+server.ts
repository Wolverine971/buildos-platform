// apps/web/src/routes/api/agent-call/callers/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { BuildosAgentCallerRevokeRequest } from '@buildos/shared-types';
import {
	CallerProvisioningError,
	CallerProvisioningService
} from '$lib/server/agent-call/caller-provisioning.service';

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

export const GET: RequestHandler = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	try {
		const service = new CallerProvisioningService();
		return json(await service.listForUser(user.id));
	} catch (error) {
		const { status, body } = toErrorResponse(error);
		if (status >= 500) {
			console.error('Failed to list agent callers:', error);
		}
		return json(body, { status });
	}
};

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return json({ error: 'Request body must be valid JSON' }, { status: 400 });
	}

	try {
		const service = new CallerProvisioningService();
		return json(await service.provisionForUser(user.id, body));
	} catch (error) {
		const { status, body: errorBody } = toErrorResponse(error);
		if (status >= 500) {
			console.error('Failed to provision agent caller:', error);
		}
		return json(errorBody, { status });
	}
};

export const DELETE: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return json({ error: 'Request body must be valid JSON' }, { status: 400 });
	}

	const callerId = (body as BuildosAgentCallerRevokeRequest | null)?.caller_id;
	if (typeof callerId !== 'string') {
		return json({ error: 'caller_id is required' }, { status: 400 });
	}

	try {
		const service = new CallerProvisioningService();
		return json(await service.revokeForUser(user.id, callerId));
	} catch (error) {
		const { status, body: errorBody } = toErrorResponse(error);
		if (status >= 500) {
			console.error('Failed to revoke agent caller:', error);
		}
		return json(errorBody, { status });
	}
};
