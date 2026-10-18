// apps/web/src/routes/admin/model-incidents/[id]/export/+server.ts
//
// One incident as a markdown investigation packet for Claude Code or Codex.
// Logged as an admin export before the content leaves the server.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logAdminChatContentAccess } from '$lib/server/admin-chat-content-access';
import { getModelIncident } from '$lib/server/model-incidents';
import {
	incidentPacketFilename,
	renderIncidentPacket
} from '$lib/services/admin/model-incidents/packet';

const privateNoStore = (response: Response): Response => {
	response.headers.set('Cache-Control', 'private, no-store');
	return response;
};

export const GET: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return privateNoStore(ApiResponse.unauthorized());
	if (!user.is_admin) return privateNoStore(ApiResponse.forbidden('Admin access required'));
	const row = await getModelIncident(params.id);
	await logAdminChatContentAccess({
		adminUserId: user.id,
		action: 'export',
		route: '/admin/model-incidents/[id]/export',
		targetType: 'llm_call_incident',
		targetId: row.id,
		targetUserIds: [row.user_id],
		rowCounts: { llm_call_incidents: 1 },
		request
	});
	return privateNoStore(
		new Response(renderIncidentPacket(row), {
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
				'Content-Disposition': `attachment; filename="${incidentPacketFilename(row)}"`
			}
		})
	);
};
