// apps/web/src/routes/auth/login/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
	const { email, password } = await request.json();

	if (!email || !password) {
		return json({ error: 'Email and password are required' }, { status: 400 });
	}

	try {
		// Sign in using the server-side client
		const { data, error } = await supabase.auth.signInWithPassword({
			email: email.trim(),
			password
		});

		if (error) {
			return json({ error: error.message }, { status: 401 });
		}

		if (!data.session) {
			return json({ error: 'Login failed - no session created' }, { status: 401 });
		}

		// The server-side client automatically sets cookies
		// Return success
		return json({
			success: true,
			user: data.user,
			redirectTo: '/?auth_success=true&message=' + encodeURIComponent('Welcome back!')
		});
	} catch (err: unknown) {
		console.error('Server login error:', err);
		return json({ error: 'Login failed' }, { status: 500 });
	}
};
