import { env as privateEnv } from '$env/dynamic/private';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isGmailRelevancePhaseAUserAllowed } from '$lib/server/gmail-relevance/config';
import {
	createGmailRelevancePilotService,
	GmailRelevancePilotServiceError
} from '$lib/server/gmail-relevance/manual-pilot';

type SafeSession = () => Promise<{ user: { id: string } | null }>;

async function requirePilotUser(safeGetSession: SafeSession): Promise<string> {
	const { user } = await safeGetSession();
	if (!user) throw redirect(303, '/auth/login');
	if (!isGmailRelevancePhaseAUserAllowed(user.id, privateEnv)) {
		throw error(404, 'Not found');
	}
	return user.id;
}

function hasExactFields(form: FormData, allowed: readonly string[]): boolean {
	const allowedSet = new Set(allowed);
	return [...form.entries()].every(
		([key, value]) => allowedSet.has(key) && typeof value === 'string'
	);
}

function oneString(form: FormData, key: string): string | null {
	const values = form.getAll(key);
	return values.length === 1 && typeof values[0] === 'string' ? values[0] : null;
}

function manyStrings(form: FormData, key: string): string[] | null {
	const values = form.getAll(key);
	return values.length > 0 && values.every((value) => typeof value === 'string')
		? (values as string[])
		: null;
}

function safeErrorCode(cause: unknown): string {
	if (cause instanceof GmailRelevancePilotServiceError) return cause.code;
	const allowed = new Set([
		'phase_a_disabled',
		'user_not_allowed',
		'invalid_input',
		'invalid_manifest',
		'idempotency_conflict',
		'ownership_mismatch',
		'connection_unavailable',
		'project_unavailable',
		'profile_unavailable',
		'concurrent_publication_conflict',
		'scope_unavailable',
		'manifest_expired',
		'storage_unavailable',
		'internal_error'
	]);
	if (
		cause &&
		typeof cause === 'object' &&
		'code' in cause &&
		typeof cause.code === 'string' &&
		allowed.has(cause.code)
	) {
		return cause.code;
	}
	return 'internal_error';
}

function actionFailure(cause: unknown) {
	const errorCode = safeErrorCode(cause);
	const status = ['connection_unavailable', 'project_unavailable', 'scope_unavailable'].includes(
		errorCode
	)
		? 404
		: errorCode === 'idempotency_conflict'
			? 409
			: errorCode === 'internal_error' || errorCode === 'storage_unavailable'
				? 500
				: 400;
	return fail(status, { error_code: errorCode });
}

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const userId = await requirePilotUser(safeGetSession);
	const options = await createGmailRelevancePilotService().listOptions(userId);
	return {
		connections: options.connection_ids.map((id, index) => ({
			id,
			label: `Connection ${index + 1}`
		})),
		projects: options.project_ids.map((id, index) => ({
			id,
			label: `Project ${index + 1}`
		}))
	};
};

export const actions: Actions = {
	createRun: async ({ request, locals: { safeGetSession } }) => {
		const userId = await requirePilotUser(safeGetSession);
		const form = await request.formData();
		if (!hasExactFields(form, ['idempotency_key', 'connection_id', 'project_id'])) {
			return fail(400, { error_code: 'invalid_input' });
		}
		const idempotencyKey = oneString(form, 'idempotency_key');
		const connectionIds = manyStrings(form, 'connection_id');
		const projectIds = manyStrings(form, 'project_id');
		if (!idempotencyKey || !connectionIds || !projectIds) {
			return fail(400, { error_code: 'invalid_input' });
		}
		try {
			return await createGmailRelevancePilotService().createOrResumeRun({
				user_id: userId,
				idempotency_key: idempotencyKey,
				connection_ids: connectionIds,
				project_ids: projectIds
			});
		} catch (cause) {
			return actionFailure(cause);
		}
	},

	runOne: async ({ request, locals: { safeGetSession } }) => {
		const userId = await requirePilotUser(safeGetSession);
		const form = await request.formData();
		if (!hasExactFields(form, ['run_id', 'connection_scope_id'])) {
			return fail(400, { error_code: 'invalid_input' });
		}
		const runId = oneString(form, 'run_id');
		const connectionScopeId = oneString(form, 'connection_scope_id');
		if (!runId || !connectionScopeId) {
			return fail(400, { error_code: 'invalid_input' });
		}
		try {
			return await createGmailRelevancePilotService().runOneOperation({
				user_id: userId,
				run_id: runId,
				connection_scope_id: connectionScopeId
			});
		} catch (cause) {
			return actionFailure(cause);
		}
	},

	pause: ({ request, locals: { safeGetSession } }) =>
		controlAction(request, safeGetSession, 'pause'),
	resume: ({ request, locals: { safeGetSession } }) =>
		controlAction(request, safeGetSession, 'resume'),
	cancel: ({ request, locals: { safeGetSession } }) =>
		controlAction(request, safeGetSession, 'cancel'),
	expire: ({ request, locals: { safeGetSession } }) =>
		controlAction(request, safeGetSession, 'expire')
};

async function controlAction(
	request: Request,
	safeGetSession: SafeSession,
	action: 'pause' | 'resume' | 'cancel' | 'expire'
) {
	const userId = await requirePilotUser(safeGetSession);
	const form = await request.formData();
	if (!hasExactFields(form, ['run_id'])) {
		return fail(400, { error_code: 'invalid_input' });
	}
	const runId = oneString(form, 'run_id');
	if (!runId) return fail(400, { error_code: 'invalid_input' });
	try {
		const state = await createGmailRelevancePilotService().controlRun({
			user_id: userId,
			run_id: runId,
			action
		});
		return { state };
	} catch (cause) {
		return actionFailure(cause);
	}
}
