// apps/web/src/routes/api/knowledge/shares/mine/+server.ts
/**
 * GET /api/knowledge/shares/mine → Profile › People & agents › Shared knowledge (tasker 168):
 * { asks: waiting asks on your entries (newest first),
 *   given: what you've shared and haven't stopped: [{ id, entity: {id, kind, name}, what,
 *          predicates, duration, expires_at, project: {id, name} | null,
 *          grantee: {user_id, name} | null }] }
 * Rows come through the caller's own client (RLS: owner rows only). Names of the people you
 * shared with are looked up with the admin client: they are members of your projects already.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { loadShareInbox, sharingErrorResponse } from '$lib/server/knowledge/sharing.server';

type GivenRow = {
	id: string;
	what: string;
	predicates: string[];
	duration: string;
	expires_at: string | null;
	grantee_user_id: string | null;
	entity: { id: string; kind: string; name: string } | null;
	project: { id: string; name: string } | null;
};

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	try {
		const [asks, given] = await Promise.all([
			loadShareInbox(locals.supabase),
			(locals.supabase as any)
				.from('knowledge_shares')
				.select(
					'id, what, predicates, duration, expires_at, grantee_user_id, entity:knowledge_entities(id, kind, name), project:onto_projects(id, name)'
				)
				.eq('owner_user_id', user.id)
				.eq('status', 'granted')
				.order('decided_at', { ascending: false })
				.limit(200)
		]);
		if (given.error) throw new Error(given.error.message);
		const now = Date.now();
		const rows = ((given.data ?? []) as GivenRow[]).filter(
			(row) => row.entity && (!row.expires_at || new Date(row.expires_at).getTime() > now)
		);
		const ids = [...new Set(rows.map((r) => r.grantee_user_id).filter(Boolean))] as string[];
		const names = new Map<string, string>();
		if (ids.length) {
			const admin = createAdminSupabaseClient();
			await Promise.all(
				ids.map(async (id) => {
					const { data } = await (admin as any).rpc('people_layer_display_name', {
						p_user_id: id
					});
					names.set(id, typeof data === 'string' ? data : 'Someone');
				})
			);
		}
		return ApiResponse.success({
			asks,
			given: rows.map((row) => ({
				id: row.id,
				entity: row.entity,
				what: row.what,
				predicates: row.predicates,
				duration: row.duration,
				expires_at: row.expires_at,
				project: row.project,
				grantee: row.grantee_user_id
					? {
							user_id: row.grantee_user_id,
							name: names.get(row.grantee_user_id) ?? 'Someone'
						}
					: null
			}))
		});
	} catch (error) {
		return sharingErrorResponse(error, ApiResponse, 'Could not load shared knowledge');
	}
};
