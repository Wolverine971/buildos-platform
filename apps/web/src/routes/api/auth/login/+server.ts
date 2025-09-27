// src/routes/api/auth/login/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { supabase, safeGetSession } = locals;
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

		// Update locals immediately for this request
		locals.session = data.session;
		locals.user = null; // Will be loaded by safeGetSession

		// Force load user data
		const { user } = await safeGetSession();

		// Return success with user data
		return json({
			success: true,
			user: user || data.user
		});
	} catch (err: any) {
		console.error('Server login error:', err);
		return json({ error: 'Login failed' }, { status: 500 });
	}
};
