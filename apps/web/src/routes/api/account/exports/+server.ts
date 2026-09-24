// apps/web/src/routes/api/account/exports/+server.ts
// "Download my data": start an export (POST) and read the latest one (GET).
// request_user_data_export() enforces one active export per user, at most 3 per
// rolling 24 hours, and no export for an account being deleted.
import type { RequestHandler } from './$types';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import { routeErrorResponse } from '$lib/server/route-error';
import { loadExportById, loadExportStatus } from '$lib/server/user-data-export';
import { toExportView, type ExportStatusPayload } from '$lib/privacy/user-data';

type RequestOutcome = {
	outcome?: 'created' | 'active' | 'rate_limited' | 'account_deletion_pending';
	export_id?: string | null;
	next_allowed_at?: string | null;
};

export const GET: RequestHandler = async (event) => {
	const {
		locals: { safeGetSession, supabase }
	} = event;
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const payload: ExportStatusPayload = await loadExportStatus(supabase, user.id);
		return ApiResponse.success(payload);
	} catch (error) {
		return routeErrorResponse(event, error, {
			operation: 'account.exports.status',
			userId: user.id,
			message: 'Could not load your export'
		});
	}
};

export const POST: RequestHandler = async (event) => {
	const {
		locals: { safeGetSession, supabase }
	} = event;
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const { data, error } = await supabase.rpc('request_user_data_export');
		if (error) throw error;
		const result = (data ?? {}) as RequestOutcome;

		if (result.outcome === 'rate_limited') {
			return ApiResponse.error(
				'You can start 3 exports a day. Try again later.',
				HttpStatus.TOO_MANY_REQUESTS,
				ErrorCode.RATE_LIMITED,
				{ nextAllowedAt: result.next_allowed_at ?? null }
			);
		}
		if (result.outcome === 'account_deletion_pending') {
			return ApiResponse.error(
				'This account is being deleted, so it can’t be exported.',
				HttpStatus.CONFLICT,
				ErrorCode.OPERATION_FAILED
			);
		}
		if ((result.outcome !== 'created' && result.outcome !== 'active') || !result.export_id) {
			throw new Error('request_user_data_export returned no export');
		}

		const row = await loadExportById(supabase, user.id, result.export_id);
		if (!row) throw new Error('requested export is not readable');
		const view = toExportView(row);
		return result.outcome === 'created'
			? ApiResponse.created({ export: view })
			: ApiResponse.success({ export: view });
	} catch (error) {
		return routeErrorResponse(event, error, {
			operation: 'account.exports.request',
			userId: user.id,
			message: 'Could not start your export'
		});
	}
};
