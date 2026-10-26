// apps/web/src/lib/server/email-campaigns/http.ts
// Small shared pieces for the admin email-campaign API routes.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import { CampaignError } from './campaigns';

export type AdminRouteLocals = Pick<App.Locals, 'supabase' | 'safeGetSession'>;

export type AdminContext =
	| { ok: true; userId: string; supabase: SupabaseClient<Database> }
	| { ok: false; response: Response };

export async function requireAdmin(locals: AdminRouteLocals): Promise<AdminContext> {
	const { user } = await locals.safeGetSession();
	if (!user?.is_admin) {
		return { ok: false, response: ApiResponse.forbidden('Admin access required') };
	}
	return { ok: true, userId: user.id, supabase: locals.supabase };
}

/** Maps a thrown error to a response: CampaignError messages go to the UI as-is. */
export function campaignErrorResponse(error: unknown, fallback: string): Response {
	if (error instanceof CampaignError) {
		if (error.status === 404) {
			return ApiResponse.error(error.message, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
		}
		if (error.status === 409) return ApiResponse.conflict(error.message);
		return ApiResponse.badRequest(error.message);
	}
	console.error(`${fallback}:`, error);
	return ApiResponse.internalError(error, fallback);
}
