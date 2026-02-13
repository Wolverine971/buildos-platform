// apps/web/src/routes/auth/reset-password/+page.server.ts
import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const RESET_PASSWORD_PATH = '/auth/reset-password';
const RECOVERY_LINK_INVALID_MESSAGE =
	'This password reset link is invalid or expired. Please request a new one.';
const RECOVERY_SESSION_MISSING_MESSAGE =
	'Your reset session is missing or expired. Request a new password reset link and try again.';
const decodeAuthError = (value: string) => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

export const load: PageServerLoad = async ({ url, locals: { safeGetSession, supabase } }) => {
	const code = url.searchParams.get('code');
	const tokenHash = url.searchParams.get('token_hash');
	const type = url.searchParams.get('type');
	const authError = url.searchParams.get('error_description') ?? url.searchParams.get('error');

	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			throw redirect(303, RESET_PASSWORD_PATH);
		}

		const { session } = await safeGetSession();
		if (session) {
			throw redirect(303, RESET_PASSWORD_PATH);
		}

		return {
			hasRecoverySession: false,
			recoveryError: RECOVERY_LINK_INVALID_MESSAGE
		};
	}

	if (tokenHash && type === 'recovery') {
		const { error } = await supabase.auth.verifyOtp({
			type: 'recovery',
			token_hash: tokenHash
		});

		if (!error) {
			throw redirect(303, RESET_PASSWORD_PATH);
		}

		const { session } = await safeGetSession();
		if (session) {
			throw redirect(303, RESET_PASSWORD_PATH);
		}

		return {
			hasRecoverySession: false,
			recoveryError: RECOVERY_LINK_INVALID_MESSAGE
		};
	}

	if (authError) {
		return {
			hasRecoverySession: false,
			recoveryError: decodeAuthError(authError)
		};
	}

	const { session } = await safeGetSession();

	return {
		hasRecoverySession: Boolean(session),
		recoveryError: null
	};
};

export const actions: Actions = {
	default: async ({ request, locals: { supabase, safeGetSession } }) => {
		const formData = await request.formData();
		const password = formData.get('password') as string;
		const confirmPassword = formData.get('confirmPassword') as string;
		const { session } = await safeGetSession();

		if (!session) {
			return fail(401, {
				error: RECOVERY_SESSION_MISSING_MESSAGE
			});
		}

		if (!password || !confirmPassword) {
			return fail(400, {
				error: 'Password and confirm password are required'
			});
		}

		if (password !== confirmPassword) {
			return fail(400, {
				error: 'Passwords do not match'
			});
		}

		if (password.length < 6) {
			return fail(400, {
				error: 'Password must be at least 6 characters long'
			});
		}

		const { error } = await supabase.auth.updateUser({
			password
		});

		if (error) {
			if (error.message.toLowerCase().includes('auth session')) {
				return fail(401, {
					error: RECOVERY_SESSION_MISSING_MESSAGE
				});
			}

			return fail(400, {
				error: error.message
			});
		}

		throw redirect(303, '/auth/login?message=Password updated successfully');
	}
};
