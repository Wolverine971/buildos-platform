import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { PreparedPromptRow } from './prepared-prompt-cache';

type PreparedPromptStoreClient = Pick<SupabaseClient<Database>, 'from'>;
type PreparedPromptInsert = Database['public']['Tables']['agentic_chat_prepared_prompts']['Insert'];

/**
 * Controlled storage boundary for prepared-prompt content.
 *
 * Callers must provide a service-role client after authenticating and validating
 * the user-facing request. Keeping every content read/write in a `.server.ts`
 * module lets Phase 2 revoke authenticated table access without changing the
 * legacy SSE or prewarm behavior.
 */
export async function writePreparedPromptContent(params: {
	supabase: PreparedPromptStoreClient;
	userId: string;
	row: PreparedPromptInsert;
}): Promise<{ error: unknown | null }> {
	if (params.row.user_id !== params.userId) {
		throw new Error('Prepared prompt owner does not match the authenticated user');
	}

	const { error } = await params.supabase
		.from('agentic_chat_prepared_prompts')
		.insert(params.row);
	return { error };
}

export async function readPreparedPromptContent(params: {
	supabase: PreparedPromptStoreClient;
	id: string;
}): Promise<{ row: PreparedPromptRow | null; error: unknown | null }> {
	const { data, error } = await params.supabase
		.from('agentic_chat_prepared_prompts')
		.select('*')
		.eq('id', params.id)
		.maybeSingle();

	return {
		row: (data as PreparedPromptRow | null) ?? null,
		error
	};
}

export async function claimPreparedPromptContent(params: {
	supabase: PreparedPromptStoreClient;
	id: string;
	userId: string;
	consumedAt: string;
}): Promise<{ claimed: boolean; error: unknown | null }> {
	const { data, error } = await params.supabase
		.from('agentic_chat_prepared_prompts')
		.update({ consumed_at: params.consumedAt, updated_at: params.consumedAt })
		.eq('id', params.id)
		.eq('user_id', params.userId)
		.is('consumed_at', null)
		.select('id')
		.maybeSingle();

	return {
		claimed: Boolean(data?.id),
		error
	};
}
