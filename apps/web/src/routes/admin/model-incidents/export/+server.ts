// apps/web/src/routes/admin/model-incidents/export/+server.ts
//
// The filtered window as one markdown pattern summary: counts by reason,
// provider and source, and each incident's story. Metadata only (no prompt or
// reply text); still logged as an admin export.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logAdminChatContentAccess } from '$lib/server/admin-chat-content-access';
import { listModelIncidents, modelIncidentFiltersFromUrl } from '$lib/server/model-incidents';
import { renderIncidentSummaryPacket } from '$lib/services/admin/model-incidents/packet';

const privateNoStore = (response: Response): Response => {
	response.headers.set('Cache-Control', 'private, no-store');
	return response;
};

export const GET: RequestHandler = async ({ url, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return privateNoStore(ApiResponse.unauthorized());
	if (!user.is_admin) return privateNoStore(ApiResponse.forbidden('Admin access required'));
	const filters = modelIncidentFiltersFromUrl(url);
	const { rows } = await listModelIncidents(filters);
	await logAdminChatContentAccess({
		adminUserId: user.id,
		action: 'export',
		route: '/admin/model-incidents/export',
		targetType: 'llm_call_incident_export',
		targetId: null,
		targetUserIds: rows.map((row) => row.user_id),
		rowCounts: { llm_call_incidents: rows.length },
		request,
		details: {
			days: filters.days,
			kind: filters.kind,
			lane: filters.lane,
			pass_role: filters.passRole,
			provider: filters.provider
		}
	});
	const stamp = new Date().toISOString().slice(0, 10);
	return privateNoStore(
		new Response(renderIncidentSummaryPacket(rows, { days: filters.days }), {
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
				'Content-Disposition': `attachment; filename="buildos-model-incidents-${stamp}-${filters.days}d.md"`
			}
		})
	);
};
