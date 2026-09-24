// apps/web/src/lib/server/user-data-export.ts
//
// Reads for Settings → Your data. Every query runs on the caller's user-scoped
// client, so RLS (user_data_exports_owner_select) and the explicit user_id filter
// both limit rows to the signed-in user.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { DATA_EXPORT_REQUESTS_PER_DAY } from '$lib/privacy/retention-policy';
import {
	toExportView,
	type UserDataExportRow,
	type UserDataExportView
} from '$lib/privacy/user-data';

type UserClient = SupabaseClient<Database>;

export const USER_DATA_EXPORT_COLUMNS =
	'id, user_id, status, storage_path, byte_size, part_count, error_code, requested_at, started_at, completed_at, expires_at';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function loadExportById(
	supabase: UserClient,
	userId: string,
	exportId: string
): Promise<UserDataExportRow | null> {
	const { data, error } = await supabase
		.from('user_data_exports')
		.select(USER_DATA_EXPORT_COLUMNS)
		.eq('id', exportId)
		.eq('user_id', userId)
		.maybeSingle();
	if (error) throw error;
	return (data as UserDataExportRow | null) ?? null;
}

/**
 * The latest export plus how many more the user may start in the rolling 24 hours
 * (request_user_data_export() counts every request that did not fail).
 */
export async function loadExportStatus(
	supabase: UserClient,
	userId: string,
	now = Date.now()
): Promise<{ export: UserDataExportView | null; remainingToday: number }> {
	const since = new Date(now - DAY_MS).toISOString();
	const [latest, recent] = await Promise.all([
		supabase
			.from('user_data_exports')
			.select(USER_DATA_EXPORT_COLUMNS)
			.eq('user_id', userId)
			.order('requested_at', { ascending: false })
			.limit(1)
			.maybeSingle(),
		supabase
			.from('user_data_exports')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', userId)
			.gt('requested_at', since)
			.neq('status', 'failed')
	]);
	if (latest.error) throw latest.error;
	if (recent.error) throw recent.error;

	const row = (latest.data as UserDataExportRow | null) ?? null;
	return {
		export: row ? toExportView(row, now) : null,
		remainingToday: Math.max(0, DATA_EXPORT_REQUESTS_PER_DAY - (recent.count ?? 0))
	};
}
