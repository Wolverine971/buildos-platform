// apps/web/src/routes/admin/gmail-relevance/review/+page.server.ts
import { env as privateEnv } from '$env/dynamic/private';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isGmailRelevancePhaseAReviewUserAllowed } from '$lib/server/gmail-relevance/config';
import {
	createEmailRelevanceReviewService,
	EmailRelevanceReviewServiceError
} from '$lib/server/gmail-relevance/review-evaluation';

export const config = {
	maxDuration: 60
};

type SafeSession = () => Promise<{ user: { id: string } | null }>;

async function requireReviewUser(safeGetSession: SafeSession): Promise<string> {
	const { user } = await safeGetSession();
	if (!user) throw redirect(303, '/auth/login');
	if (!isGmailRelevancePhaseAReviewUserAllowed(user.id, privateEnv)) {
		throw error(404, 'Not found');
	}
	return user.id;
}

function noStore(setHeaders: (headers: Record<string, string>) => void): void {
	setHeaders({
		'cache-control': 'private, no-store, max-age=0',
		pragma: 'no-cache',
		'referrer-policy': 'no-referrer'
	});
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

function optionalString(form: FormData, key: string): string | null | undefined {
	const value = oneString(form, key);
	if (value === null) return undefined;
	return value.trim() ? value : null;
}

function actionFailure(cause: unknown) {
	const code =
		cause instanceof EmailRelevanceReviewServiceError ? cause.code : 'storage_unavailable';
	const status = ['run_unavailable', 'sample_unavailable', 'project_unavailable'].includes(code)
		? 404
		: code === 'idempotency_conflict'
			? 409
			: ['provider_timeout', 'provider_rejected', 'connection_unavailable'].includes(code)
				? 502
				: code === 'storage_unavailable'
					? 500
					: 400;
	return fail(status, { kind: 'error' as const, error_code: code });
}

export const load: PageServerLoad = async ({ locals: { safeGetSession }, url, setHeaders }) => {
	noStore(setHeaders);
	const userId = await requireReviewUser(safeGetSession);
	try {
		return await createEmailRelevanceReviewService().dashboard(
			userId,
			url.searchParams.get('run_id')
		);
	} catch (cause) {
		if (cause instanceof EmailRelevanceReviewServiceError && cause.code === 'run_unavailable') {
			throw error(404, 'Review run not found');
		}
		throw error(500, 'Could not load the review queue');
	}
};

export const actions: Actions = {
	prepare: async ({ request, locals: { safeGetSession }, setHeaders }) => {
		noStore(setHeaders);
		const userId = await requireReviewUser(safeGetSession);
		const form = await request.formData();
		if (!hasExactFields(form, ['run_id'])) {
			return fail(400, { kind: 'error', error_code: 'invalid_input' });
		}
		const runId = oneString(form, 'run_id');
		if (!runId) return fail(400, { kind: 'error', error_code: 'invalid_input' });
		try {
			const sample = await createEmailRelevanceReviewService().prepareSample(userId, runId);
			return { kind: 'prepared' as const, ...sample };
		} catch (cause) {
			return actionFailure(cause);
		}
	},

	open: async ({ request, locals: { safeGetSession }, setHeaders }) => {
		noStore(setHeaders);
		const userId = await requireReviewUser(safeGetSession);
		const form = await request.formData();
		if (!hasExactFields(form, ['run_id', 'sample_id'])) {
			return fail(400, { kind: 'error', error_code: 'invalid_input' });
		}
		const runId = oneString(form, 'run_id');
		const sampleId = oneString(form, 'sample_id');
		if (!runId || !sampleId) {
			return fail(400, { kind: 'error', error_code: 'invalid_input' });
		}
		try {
			const review_context = await createEmailRelevanceReviewService().openSample({
				user_id: userId,
				run_id: runId,
				sample_id: sampleId
			});
			return { kind: 'opened' as const, review_context };
		} catch (cause) {
			return actionFailure(cause);
		}
	},

	adjudicate: async ({ request, locals: { safeGetSession }, setHeaders }) => {
		noStore(setHeaders);
		const userId = await requireReviewUser(safeGetSession);
		const form = await request.formData();
		if (
			!hasExactFields(form, [
				'run_id',
				'sample_id',
				'idempotency_key',
				'decision',
				'correction_reason',
				'corrected_project_id',
				'rule_proposal'
			])
		) {
			return fail(400, { kind: 'error', error_code: 'invalid_input' });
		}
		const runId = oneString(form, 'run_id');
		const sampleId = oneString(form, 'sample_id');
		const idempotencyKey = oneString(form, 'idempotency_key');
		const decision = oneString(form, 'decision');
		const correctionReason = optionalString(form, 'correction_reason');
		const correctedProjectId = optionalString(form, 'corrected_project_id');
		const ruleProposal = optionalString(form, 'rule_proposal');
		if (
			!runId ||
			!sampleId ||
			!idempotencyKey ||
			!decision ||
			correctionReason === undefined ||
			correctedProjectId === undefined ||
			ruleProposal === undefined
		) {
			return fail(400, { kind: 'error', error_code: 'invalid_input' });
		}
		try {
			const result = await createEmailRelevanceReviewService().adjudicate({
				user_id: userId,
				run_id: runId,
				sample_id: sampleId,
				idempotency_key: idempotencyKey,
				decision,
				correction_reason: correctionReason,
				corrected_project_id: correctedProjectId,
				rule_proposal: ruleProposal
			});
			return { kind: 'adjudicated' as const, ...result };
		} catch (cause) {
			return actionFailure(cause);
		}
	}
};
