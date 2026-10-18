// apps/web/src/routes/admin/gmail-relevance/review/+page.server.ts
import { randomUUID } from 'node:crypto';
import { env as privateEnv } from '$env/dynamic/private';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	isGmailRelevancePhaseAReviewUserAllowed,
	isGmailRelevancePhaseAUserAllowed
} from '$lib/server/gmail-relevance/config';
import {
	createGmailRelevancePilotService,
	MAX_SCAN_PROJECTS,
	type GmailRelevanceScanSetup
} from '$lib/server/gmail-relevance/manual-pilot';
import {
	createEmailRelevanceReviewService,
	EmailRelevanceReviewServiceError
} from '$lib/server/gmail-relevance/review-evaluation';

export const config = {
	// One scan step may spend up to 60 s talking to Gmail before it settles.
	maxDuration: 120
};

/**
 * Scan errors the page knows how to explain. Anything else is reported as
 * `internal_error` so no provider or storage detail reaches the browser.
 */
const SCAN_ERROR_CODES = new Set([
	'phase_a_disabled',
	'user_not_allowed',
	'invalid_input',
	'connection_unavailable',
	'connection_disconnected',
	'project_unavailable',
	'profile_unavailable',
	'concurrent_publication_conflict',
	'idempotency_conflict',
	'scope_unavailable',
	'manifest_expired',
	'budget_exceeded',
	'provider_timeout',
	'provider_rejected',
	'storage_unavailable',
	'internal_error'
]);

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

function scanFailure(cause: unknown) {
	const raw =
		cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string'
			? cause.code
			: 'internal_error';
	const code = SCAN_ERROR_CODES.has(raw) ? raw : 'internal_error';
	const status = ['phase_a_disabled', 'user_not_allowed'].includes(code)
		? 403
		: ['connection_unavailable', 'project_unavailable', 'scope_unavailable'].includes(code)
			? 404
			: code === 'idempotency_conflict'
				? 409
				: ['provider_timeout', 'provider_rejected'].includes(code)
					? 502
					: ['storage_unavailable', 'internal_error'].includes(code)
						? 500
						: 400;
	return fail(status, { kind: 'error' as const, error_code: code });
}

type ScanSection = GmailRelevanceScanSetup & {
	/** False when the scan switch is off for this user; the review steps still work. */
	enabled: boolean;
	/** True when the scan choices could not be loaded. */
	unavailable: boolean;
	/** A fresh key per page load, so a double-click resumes the same scan. */
	start_key: string;
	max_projects: number;
};

async function loadScanSection(userId: string): Promise<ScanSection> {
	const base = {
		accounts: [],
		projects: [],
		latest_run: null,
		start_key: randomUUID(),
		max_projects: MAX_SCAN_PROJECTS
	};
	if (!isGmailRelevancePhaseAUserAllowed(userId, privateEnv)) {
		return { ...base, enabled: false, unavailable: false };
	}
	try {
		const setup = await createGmailRelevancePilotService().scanSetup(userId);
		return { ...base, ...setup, enabled: true, unavailable: false };
	} catch {
		return { ...base, enabled: true, unavailable: true };
	}
}

export const load: PageServerLoad = async ({ locals: { safeGetSession }, url, setHeaders }) => {
	noStore(setHeaders);
	const userId = await requireReviewUser(safeGetSession);
	const [dashboard, scan] = await Promise.all([
		createEmailRelevanceReviewService()
			.dashboard(userId, url.searchParams.get('run_id'))
			.catch((cause: unknown) => {
				if (
					cause instanceof EmailRelevanceReviewServiceError &&
					cause.code === 'run_unavailable'
				) {
					throw error(404, 'Review run not found');
				}
				throw error(500, 'Could not load the review queue');
			}),
		loadScanSection(userId)
	]);
	return { ...dashboard, scan };
};

export const actions: Actions = {
	/** Starts a scan of every connected Gmail account against the chosen projects. */
	startScan: async ({ request, locals: { safeGetSession } }) => {
		const userId = await requireReviewUser(safeGetSession);
		const form = await request.formData();
		if (!hasExactFields(form, ['idempotency_key', 'project_id'])) {
			return fail(400, { kind: 'error', error_code: 'invalid_input' });
		}
		const idempotencyKey = oneString(form, 'idempotency_key');
		const projectIds = form
			.getAll('project_id')
			.filter((value): value is string => typeof value === 'string');
		if (!idempotencyKey || projectIds.length === 0) {
			return fail(400, { kind: 'error', error_code: 'invalid_input' });
		}
		try {
			const pilot = createGmailRelevancePilotService();
			const started = await pilot.startScan({
				user_id: userId,
				idempotency_key: idempotencyKey,
				project_ids: projectIds
			});
			return {
				kind: 'scan_started' as const,
				progress: await pilot.scanProgress(userId, started.run_id)
			};
		} catch (cause) {
			return scanFailure(cause);
		}
	},

	/**
	 * Runs exactly one bounded step (one Gmail list page or one metadata batch)
	 * for one account. The page calls this repeatedly while it is open; the
	 * server never loops.
	 */
	scanStep: async ({ request, locals: { safeGetSession } }) => {
		const userId = await requireReviewUser(safeGetSession);
		const form = await request.formData();
		if (!hasExactFields(form, ['run_id', 'connection_scope_id'])) {
			return fail(400, { kind: 'error', error_code: 'invalid_input' });
		}
		const runId = oneString(form, 'run_id');
		const connectionScopeId = oneString(form, 'connection_scope_id');
		if (!runId || !connectionScopeId) {
			return fail(400, { kind: 'error', error_code: 'invalid_input' });
		}
		try {
			const pilot = createGmailRelevancePilotService();
			const step = await pilot.runOneOperation({
				user_id: userId,
				run_id: runId,
				connection_scope_id: connectionScopeId
			});
			return {
				kind: 'scan_step' as const,
				status: step.status,
				step_error_code: step.error_code,
				progress: await pilot.scanProgress(userId, runId)
			};
		} catch (cause) {
			return scanFailure(cause);
		}
	},

	cancelScan: async ({ request, locals: { safeGetSession } }) => {
		const userId = await requireReviewUser(safeGetSession);
		const form = await request.formData();
		if (!hasExactFields(form, ['run_id'])) {
			return fail(400, { kind: 'error', error_code: 'invalid_input' });
		}
		const runId = oneString(form, 'run_id');
		if (!runId) return fail(400, { kind: 'error', error_code: 'invalid_input' });
		try {
			await createGmailRelevancePilotService().controlRun({
				user_id: userId,
				run_id: runId,
				action: 'cancel'
			});
			return { kind: 'scan_cancelled' as const };
		} catch (cause) {
			return scanFailure(cause);
		}
	},

	prepare: async ({ request, locals: { safeGetSession } }) => {
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

	open: async ({ request, locals: { safeGetSession } }) => {
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

	adjudicate: async ({ request, locals: { safeGetSession } }) => {
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
