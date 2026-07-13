// apps/web/src/lib/tests/agentic-e2e/harness/auth.ts
//
// Authenticates against the running dev server the same way the login page does:
// POST /api/auth/login (the JSON endpoint the app's own login form calls). The
// server-side @supabase/ssr client writes the auth cookies on the response; we
// harvest those Set-Cookie headers into a jar string and replay it as `Cookie:`
// on every /api/agent/v2/stream request.
//
// NOTE: /auth/login (no /api) is a *page form action* and rejects JSON with 415 —
// use the /api/auth/login endpoint.

/** Parse a fetch response's Set-Cookie headers into a `name=value; name2=value2` jar. */
function harvestCookies(response: Response): string {
	// Node/undici exposes getSetCookie() to read multiple Set-Cookie headers.
	const setCookies: string[] =
		typeof (response.headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
			? (response.headers as { getSetCookie: () => string[] }).getSetCookie()
			: response.headers.get('set-cookie')
				? [response.headers.get('set-cookie') as string]
				: [];

	const pairs: string[] = [];
	for (const raw of setCookies) {
		const [pair] = raw.split(';');
		if (pair && pair.includes('=')) pairs.push(pair.trim());
	}
	return pairs.join('; ');
}

export interface LoginResult {
	cookie: string;
	userId: string;
}

/**
 * Log the test user in and return the cookie jar string + authoritative user id.
 * Throws with a clear message if the dev server is unreachable or creds are bad.
 */
export async function loginAndGetCookie(params: {
	baseUrl: string;
	email: string;
	password: string;
}): Promise<LoginResult> {
	let response: Response;
	try {
		response = await fetch(`${params.baseUrl}/api/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: params.email, password: params.password })
		});
	} catch (err) {
		throw new Error(
			`[agentic-e2e] Could not reach the dev server at ${params.baseUrl}. ` +
				`Start it first: \`pnpm dev --filter=@buildos/web\`. Original error: ${
					err instanceof Error ? err.message : String(err)
				}`
		);
	}

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new Error(
			`[agentic-e2e] Login failed (${response.status}) for ${params.email}. ` +
				`Check AGENTIC_TEST_USER_EMAIL/PASSWORD and that the user exists + is not frozen. Body: ${body.slice(
					0,
					300
				)}`
		);
	}

	const cookie = harvestCookies(response);
	if (!cookie.includes('auth-token')) {
		throw new Error(
			`[agentic-e2e] Login succeeded but no Supabase auth cookie was set. Got jar: "${cookie}".`
		);
	}

	const payload = (await response.json().catch(() => null)) as {
		data?: { user?: { id?: string } };
	} | null;
	const userId = payload?.data?.user?.id;
	if (!userId) {
		throw new Error('[agentic-e2e] Login response did not include a user id.');
	}

	return { cookie, userId };
}
