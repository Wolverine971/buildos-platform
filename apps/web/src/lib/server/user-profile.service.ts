// apps/web/src/lib/server/user-profile.service.ts
//
// The `user_profiles` row is the parent of a person's Contacts. The profile
// knowledge base it once fronted (summary, chapters, fragments, background
// extraction) was never turned on and was removed on 2026-10-25 (tasker 146);
// only the row and its actor lookup remain.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

type AnySupabase = SupabaseClient<Database>;

const DEFAULT_DOC_STRUCTURE = { version: 1, root: [] };

export async function resolveProfileActorId(
	supabase: AnySupabase,
	userId: string
): Promise<string | null> {
	const { data, error } = await supabase.rpc('ensure_actor_for_user', { p_user_id: userId });
	if (error || !data) return null;
	return typeof data === 'string' ? data : null;
}

export async function ensureUserProfile(
	supabase: AnySupabase,
	userId: string
): Promise<Record<string, any>> {
	const supabaseAny = supabase as any;

	const { data: existing, error: existingError } = await supabaseAny
		.from('user_profiles')
		.select('*')
		.eq('user_id', userId)
		.maybeSingle();

	if (existingError) {
		throw new Error(`Failed to load user profile: ${existingError.message}`);
	}
	if (existing) return existing;

	const actorId = await resolveProfileActorId(supabase, userId);

	const { data: inserted, error: insertError } = await supabaseAny
		.from('user_profiles')
		.insert({
			user_id: userId,
			actor_id: actorId,
			extraction_enabled: false,
			doc_structure: DEFAULT_DOC_STRUCTURE
		})
		.select('*')
		.single();

	if (!insertError && inserted) return inserted;

	const { data: raced, error: raceError } = await supabaseAny
		.from('user_profiles')
		.select('*')
		.eq('user_id', userId)
		.maybeSingle();
	if (raceError || !raced) {
		throw new Error(
			`Failed to create user profile: ${insertError?.message ?? raceError?.message ?? 'unknown'}`
		);
	}
	return raced;
}
