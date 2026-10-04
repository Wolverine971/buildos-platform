// apps/web/src/routes/auth/confirm/+server.ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeRedirectPath } from '$lib/utils/auth-redirect';

/**
 * Return address for signup confirmation emails. The register endpoint sets it as
 * `emailRedirectTo` when the signup carries a redirect (a Try in BuildOS chat launch, an invite).
 * Supabase confirms the email, then sends the browser here with a PKCE `code`. Exchanging it signs
 * the user in and forwards to `next`.
 *
 * Only the PKCE code is accepted. It is bound to this browser by the code-verifier cookie set at
 * signup, so a link cannot sign someone into another person's account. A bare `token_hash` is not:
 * GoTrue's `email` type also accepts recovery tokens, so anyone could mail a victim a link that
 * silently signs them into the sender's account (login CSRF). Do not add a token_hash branch here.
 *
 * When that fails (link opened in another browser, already used, expired), the email is usually
 * confirmed anyway, so they land on sign-in with the same destination instead of a dead end.
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const next = normalizeRedirectPath(url.searchParams.get('next'));
	const code = url.searchParams.get('code');

	let signedIn = false;
	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		signedIn = !error;
		if (error) console.warn('[auth/confirm] code exchange failed:', error.code ?? error.status);
	}

	// A second click in the same browser fails the exchange but already has the session.
	if (!signedIn) {
		const { session } = await safeGetSession();
		signedIn = Boolean(session);
	}

	if (signedIn) {
		throw redirect(303, next ?? '/today');
	}

	const params = new URLSearchParams({ error: 'email_link_failed' });
	if (next) params.set('redirect', next);
	throw redirect(303, `/auth/login?${params.toString()}`);
};
