// apps/web/src/routes/api/account/data-summary/+server.ts
// Settings → Your data: live counts, connections, and the latest export in one request.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { routeErrorResponse } from '$lib/server/route-error';
import { loadExportStatus } from '$lib/server/user-data-export';
import { toDataSummary, type DataPanelPayload } from '$lib/privacy/user-data';

export const GET: RequestHandler = async (event) => {
	const {
		locals: { safeGetSession, supabase }
	} = event;
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const [summary, exportStatus] = await Promise.all([
			supabase.rpc('get_my_data_summary'),
			loadExportStatus(supabase, user.id)
		]);
		if (summary.error) throw summary.error;

		const payload: DataPanelPayload = {
			summary: toDataSummary(summary.data),
			export: exportStatus.export,
			remainingToday: exportStatus.remainingToday
		};
		return ApiResponse.success(payload);
	} catch (error) {
		return routeErrorResponse(event, error, {
			operation: 'account.data_summary.load',
			userId: user.id,
			message: 'Could not load your data summary'
		});
	}
};
