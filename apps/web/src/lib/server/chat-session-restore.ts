// apps/web/src/lib/server/chat-session-restore.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { ChatSessionRestore } from '$lib/types/chat-session-restore';

/** Called only after authentication/ownership; SQL repeats ownership defensively.
 * STABLE SQL gives messages, terminal state, activity and workflow one MVCC view.
 * Never fall back to independent reads when the migration/RPC is unavailable.
 */
export async function loadChatSessionRestore(sessionId: string, userId: string) {
	const { data, error } = await createAdminSupabaseClient().rpc('get_chat_session_restore_v1', {
		p_session_id: sessionId,
		p_user_id: userId
	});
	return { data: data as ChatSessionRestore | null, error };
}
