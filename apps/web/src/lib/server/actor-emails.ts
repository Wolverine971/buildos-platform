// apps/web/src/lib/server/actor-emails.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';

/**
 * Signed-in clients cannot read `onto_actors.email` (Tasker 158): a co-member must not be
 * able to pull other members' addresses through the table API. Callers that are entitled
 * to an email (the owner's member list, a ping sent by email, your own row) read it here,
 * server-side, and only after their own access check.
 */
export async function loadActorEmails(actorIds: readonly string[]): Promise<Map<string, string>> {
	const emails = new Map<string, string>();
	const ids = [...new Set(actorIds.filter(Boolean))];
	if (ids.length === 0) return emails;
	const { data, error } = await createAdminSupabaseClient()
		.from('onto_actors')
		.select('id, email')
		.in('id', ids);
	if (error) throw error;
	for (const row of (data ?? []) as Array<{ id: string; email: string | null }>) {
		if (typeof row.email === 'string' && row.email.trim()) emails.set(row.id, row.email);
	}
	return emails;
}
