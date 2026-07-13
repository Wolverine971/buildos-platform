// apps/web/src/lib/tests/agentic-e2e/harness/test-user.ts
//
// Provisions the dedicated test user (idempotent) so the harness can seed data
// under it and drive the chat as it. Three things must be true before the stream
// endpoint accepts the user:
//   1. an auth.users row (so login works)                 -> admin.auth.admin.createUser
//   2. a public.users row (safeGetSession rejects without it) -> upsert {id,email}
//   3. an ontology actor (onto_* rows are actor-scoped)   -> ensureActorId RPC
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ensureActorId } from '@buildos/shared-agent-ops';
import type { DbView } from './types';

/** Best-effort creation of the auth user. Safe to call when the user exists. */
export async function ensureTestAuthUser(params: {
	email: string;
	password: string;
}): Promise<void> {
	const admin = createAdminSupabaseClient();
	const { error } = await admin.auth.admin.createUser({
		email: params.email,
		password: params.password,
		email_confirm: true
	});

	if (!error) return;

	// Already-registered is the expected steady-state; anything else is fatal.
	const message = (error.message || '').toLowerCase();
	const alreadyExists =
		message.includes('already been registered') ||
		message.includes('already registered') ||
		message.includes('already exists') ||
		error.status === 422;
	if (!alreadyExists) {
		throw new Error(`[agentic-e2e] Failed to create test auth user: ${error.message}`);
	}
}

/**
 * Ensure the public.users row + ontology actor exist for a known user id, and
 * return the DbView (admin client + ids) the harness threads into assertions.
 */
export async function provisionTestUser(params: {
	userId: string;
	email: string;
}): Promise<DbView> {
	const admin = createAdminSupabaseClient();

	const { error: upsertError } = await admin
		.from('users')
		.upsert({ id: params.userId, email: params.email }, { onConflict: 'id' });
	if (upsertError) {
		throw new Error(`[agentic-e2e] Failed to upsert public.users row: ${upsertError.message}`);
	}

	const actorId = await ensureActorId(admin, params.userId);

	return { admin, userId: params.userId, actorId };
}
