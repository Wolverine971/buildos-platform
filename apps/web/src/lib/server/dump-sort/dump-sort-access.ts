// apps/web/src/lib/server/dump-sort/dump-sort-access.ts
// The "watch it sort" lab makes paid model calls, so only admins can open it.
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function isDumpSortAdmin(
	session: SupabaseClient<Database>,
	userId: string
): Promise<boolean> {
	const { data, error } = await session
		.from('users')
		.select('is_admin')
		.eq('id', userId)
		.single();
	return !error && data?.is_admin === true;
}
