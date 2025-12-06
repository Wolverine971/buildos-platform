<!-- apps/web/src/routes/auth/login/+page.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { goto, invalidateAll, replaceState } from '$app/navigation';
	import { onMount } from 'svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { PUBLIC_GOOGLE_CLIENT_ID } from '$env/static/public';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { validateEmailClient } from '$lib/utils/client-email-validation';

	let loading = $state(false);
	let googleLoading = $state(false);
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let emailError = $state('');

	// Validate email on blur for instant feedback
	function validateEmail() {
		emailError = '';
		if (!email.trim()) {
			return;
		}

		const validation = validateEmailClient(email.trim());
		if (!validation.valid) {
			emailError = validation.error || 'Invalid email address';
		}
	}

	async function handleLogin() {
		if (loading || googleLoading) return;

		// Validation
		if (!email?.trim() || !password) {
			error = 'Email and password are required';
			return;
		}

		// Email format validation (helps catch typos)
		const emailValidation = validateEmailClient(email.trim());
		if (!emailValidation.valid) {
			emailError = emailValidation.error || 'Invalid email address';
			error = 'Please check your email address';
			return;
		}

		loading = true;
		error = '';
		emailError = '';

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
				return;
			}

			// Server has set the cookies, now just navigate using SvelteKit
			// This will trigger the layout to reload with the new session
			await goto('/', {
				invalidateAll: true // This ensures all load functions re-run
			});
		} catch (err: any) {
			console.error('Login error:', err);
			error = err.message || 'Login failed';
		} finally {
			loading = false;
		}
	}

	// Google OAuth remains the same but simplified
	async function handleGoogleLogin() {
		if (googleLoading || loading) return;

		googleLoading = true;
		error = '';

		const redirectUri = `${$page.url.origin}/auth/google/login-callback`;
		const state = crypto.randomUUID();

		const params = new URLSearchParams({
			client_id: PUBLIC_GOOGLE_CLIENT_ID,
			redirect_uri: redirectUri,
			response_type: 'code',
			scope: 'email profile openid',
			access_type: 'offline',
			prompt: 'consent',
			state,
			include_granted_scopes: 'true'
		});

		// Store state for verification
		sessionStorage.setItem('oauth_state', state);

		// Redirect to Google OAuth
		window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
	}

	function handleSubmit(event: Event) {
		event.preventDefault();
		handleLogin();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleLogin();
		}
	}

	// Show messages from URL params
	onMount(() => {
		const message = $page.url.searchParams.get('message');
		const urlError = $page.url.searchParams.get('error');

		if (message) {
			toastService.success(message);
			// Clean up URL
			const url = new URL($page.url);
			url.searchParams.delete('message');
			replaceState(url.toString(), {});
		}

		if (urlError) {
			toastService.error(urlError);
			// Clean up URL
			const url = new URL($page.url);
			url.searchParams.delete('error');
			replaceState(url.toString(), {});
		}
	});
</script>

<SEOHead
	title="Sign In - BuildOS | AI-First Project Organization"
	description="Sign in to BuildOS to access your projects, brain dumps, and AI-powered productivity tools. Transform scattered thoughts into structured action."
	canonical="https://build-os.com/auth/login"
	keywords="BuildOS login, sign in, project management login, AI productivity tools"
	noindex={true}
/>

<!-- Account for navbar height (64px = h-16) by using calc() -->
<div
	class="flex items-center justify-center px-4 sm:px-6 lg:px-8 bg-[var(--surface-scratch)] dither-pattern"
	style="min-height: calc(100vh - 64px);"
>
	<div class="max-w-md w-full space-y-8 py-12">
		<!-- Logo/Brand Section -->
		<div class="text-center">
			<div class="flex justify-center mb-6">
				<div class="utility-block w-16 h-16 rounded-sm flex items-center justify-center">
					<video
						src="/onboarding-assets/animations/brain-bolt-electric.mp4"
						class="w-12 h-12"
						autoplay
						loop
						muted
						playsinline
						aria-label="BuildOS Icon"
					></video>
				</div>
			</div>

			<h2 class="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Welcome back</h2>
			<p class="text-slate-700 dark:text-slate-300 mb-8">Sign in to your BuildOS account</p>
		</div>

		<!-- Form Section -->
		<div class="card-industrial py-8 px-6 relative noise-overlay">
			<!-- Google OAuth Button -->
			<div class="mb-6">
				<button
					type="button"
					onclick={handleGoogleLogin}
					disabled={googleLoading || loading}
					class="btn-secondary w-full px-6 py-3 text-base flex items-center justify-center"
				>
					{#if !googleLoading}
						<svg class="w-5 h-5 mr-3" viewBox="0 0 24 24">
							<path
								fill="currentColor"
								d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
							/>
							<path
								fill="currentColor"
								d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
							/>
							<path
								fill="currentColor"
								d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
							/>
							<path
								fill="currentColor"
								d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
							/>
						</svg>
					{/if}
					{googleLoading ? 'Signing in...' : 'Continue with Google'}
				</button>
			</div>

			<!-- Divider -->
			<div class="relative mb-6">
				<div class="absolute inset-0 flex items-center">
					<div class="w-full border-t border-slate-400 dark:border-slate-600"></div>
				</div>
				<div class="relative flex justify-center text-sm">
					<span
						class="px-2 bg-[var(--surface-elevated)] text-slate-600 dark:text-slate-400"
						>Or continue with email</span
					>
				</div>
			</div>

			<form onsubmit={handleSubmit} class="space-y-6">
				{#if error}
					<div class="badge-draft text-red-800 dark:text-red-300 px-4 py-3">
						{error}
					</div>
				{/if}

				<div class="space-y-5">
					<div>
						<label
							for="email"
							class="block text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2"
						>
							Email address <span class="text-[var(--accent-orange)]">*</span>
						</label>
						<input
							id="email"
							bind:value={email}
							type="email"
							autocomplete="email"
							inputmode="email"
							enterkeyhint="next"
							required
							disabled={loading || googleLoading}
							placeholder="Enter your email"
							onblur={validateEmail}
							class="input-scratchpad w-full dither-soft relative"
						/>
						{#if emailError}
							<p class="mt-1 text-sm text-red-600 dark:text-red-400">{emailError}</p>
						{/if}
					</div>

					<div>
						<label
							for="password"
							class="block text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2"
						>
							Password <span class="text-[var(--accent-orange)]">*</span>
						</label>
						<input
							id="password"
							bind:value={password}
							type="password"
							autocomplete="current-password"
							enterkeyhint="go"
							required
							disabled={loading || googleLoading}
							onkeydown={handleKeydown}
							placeholder="Enter your password"
							class="input-scratchpad w-full dither-soft relative"
						/>
					</div>
				</div>

				<div class="flex items-center justify-between">
					<div class="text-sm">
						<a
							href="/auth/forgot-password"
							class="font-medium text-[var(--accent-blue)] hover:brightness-110 transition-all"
						>
							Forgot your password?
						</a>
					</div>
				</div>

				<div>
					<button
						type="submit"
						disabled={loading || googleLoading}
						class="btn-tactile w-full px-6 py-3 text-base"
					>
						{loading ? 'Signing in...' : 'Sign in'}
					</button>
				</div>
			</form>

			<!-- Sign up link -->
			<div class="mt-6 text-center">
				<p class="text-sm text-slate-600 dark:text-slate-400">
					Don't have an account?
					<a
						href="/auth/register"
						class="font-medium text-[var(--accent-blue)] hover:brightness-110 transition-all"
					>
						Create one now
					</a>
				</p>
			</div>
		</div>
	</div>
</div>
