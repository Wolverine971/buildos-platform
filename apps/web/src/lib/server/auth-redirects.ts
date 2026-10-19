// apps/web/src/lib/server/auth-redirects.ts
import { redirect } from '@sveltejs/kit';

/** Keep the page and its chat link through password and OAuth sign-in. */
export function redirectToLogin(url: URL): never {
	throw redirect(303, `/auth/login?redirect=${encodeURIComponent(url.pathname + url.search)}`);
}
