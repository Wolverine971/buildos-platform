// src/routes/auth/login/+server.ts
import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals: { supabase }, cookies }) => {
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
	} catch (err: any) {
		console.error('Server login error:', err);
		return json({ error: 'Login failed' }, { status: 500 });
	}
};

// Update your login component to use this endpoint:
// In src/routes/auth/login/+page.svelte
async function handleLogin() {
	if (loading || googleLoading) return;

	// Validation
	if (!email?.trim() || !password) {
		error = 'Email and password are required';
		return;
	}

	loading = true;
	error = '';

	try {
		const response = await fetch('/api/auth/login', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email: email.trim(),
				password
			})
		});

		const result = await response.json();

		if (!response.ok) {
			error = result.error || 'Login failed';
			loading = false;
			return;
		}

		console.log('Login successful via server');

		// Server has set the cookies, now navigate
		window.location.href = result.redirectTo;
	} catch (err: any) {
		console.error('Login error:', err);
		error = err.message || 'Login failed';
		loading = false;
	}
}
