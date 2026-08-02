// apps/web/src/lib/server/question-tree-admin.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export async function getAdminUserId(params: {
	supabase: SupabaseClient;
	safeGetSession: () => Promise<{ user: { id?: string } | null }>;
}): Promise<string | null> {
	const { user } = await params.safeGetSession();
	if (!user?.id) return null;
	const { data, error } = await params.supabase
		.from('admin_users')
		.select('user_id')
		.eq('user_id', user.id)
		.maybeSingle();
	return error || !data ? null : user.id;
}
