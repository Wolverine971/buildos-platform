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
	import { normalizeRedirectPath } from '$lib/utils/auth-redirect';
	import { logAuthClientError } from '$lib/utils/auth-client-logger';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	let loading = $state(false);
	let googleLoading = $state(false);
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let emailError = $state('');
	let redirectParam = $derived(normalizeRedirectPath($page.url.searchParams.get('redirect')));
	let redirectQuery = $derived(
		redirectParam ? `?redirect=${encodeURIComponent(redirectParam)}` : ''
	);

	function resolveRedirectTarget() {
		return normalizeRedirectPath($page.url.searchParams.get('redirect'));
	}

	function encodeOAuthState(redirectPath: string | null) {
		const payload = {
			nonce: crypto.randomUUID(),
			redirect: redirectPath
		};
		const json = JSON.stringify(payload);
		const base64 = btoa(json);
		return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	}

	function getEmailDomain(value: string): string | null {
		const trimmed = value.trim().toLowerCase();
		const atIndex = trimmed.lastIndexOf('@');
		if (atIndex <= 0 || atIndex === trimmed.length - 1) return null;
		return trimmed.slice(atIndex + 1);
	}

	async function resolvePendingInviteRedirect() {
		let responseStatus: number | null = null;
		try {
			const response = await fetch('/api/onto/invites/pending');
			responseStatus = response.status;
			if (!response.ok) {
				void logOntologyClientError(new Error('Pending invite check failed'), {
					endpoint: '/api/onto/invites/pending',
					method: 'GET',
					entityType: 'project_invite',
					operation: 'project_invites_pending_check',
					metadata: {
						source: 'auth_login',
						status: responseStatus
					}
				});
				return null;
			}
			const payload = await response.json();
			const invites = payload?.data?.invites ?? [];
			if (invites.length > 0) {
				return `/invites?message=${encodeURIComponent('You have pending invites')}`;
			}
		} catch (err) {
			console.warn('[Auth] Failed to check pending invites:', err);
			void logOntologyClientError(err, {
				endpoint: '/api/onto/invites/pending',
				method: 'GET',
				entityType: 'project_invite',
				operation: 'project_invites_pending_check',
				metadata: {
					source: 'auth_login',
					status: responseStatus
				}
			});
		}
		return null;
	}

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

		const emailDomain = getEmailDomain(email);
		let responseStatus: number | null = null;
		let responseCode: string | undefined;

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

			responseStatus = response.status;
			const result = await response.json().catch(() => null);
			responseCode = result?.code;

			if (!response.ok) {
				const message = result?.error || 'Login failed';
				void logAuthClientError(new Error(message), {
					endpoint: '/api/auth/login',
					method: 'POST',
					operation: 'auth_login',
					metadata: {
						status: responseStatus,
						code: responseCode,
						emailDomain,
						flow: 'password'
					}
				});
				error = message;
				return;
			}

			// Server has set the cookies, now just navigate using SvelteKit
			// This will trigger the layout to reload with the new session
			const redirectTarget = resolveRedirectTarget();
			const pendingRedirect = redirectTarget ? null : await resolvePendingInviteRedirect();
			const destination = redirectTarget ?? pendingRedirect ?? '/';

			await goto(destination, {
				invalidateAll: true // This ensures all load functions re-run
			});
		} catch (err: any) {
			console.error('Login error:', err);
			void logAuthClientError(err, {
				endpoint: '/api/auth/login',
				method: 'POST',
				operation: 'auth_login',
				metadata: {
					status: responseStatus,
					code: responseCode,
					emailDomain,
					flow: 'password'
				}
			});
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
		const state = encodeOAuthState(resolveRedirectTarget());

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
	class="flex items-center justify-center px-4 sm:px-6 lg:px-8 bg-background"
	style="min-height: calc(100vh - 64px);"
>
	<div class="max-w-md w-full space-y-8 py-12">
		<!-- Logo/Brand Section -->
		<div class="text-center">
			<div class="flex justify-center mb-6">
				<div
					class="w-16 h-16 rounded-lg flex items-center justify-center border border-border bg-card shadow-ink tx tx-bloom tx-weak"
				>
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

			<h2 class="text-3xl font-bold text-foreground mb-2">Welcome back</h2>
			<p class="text-muted-foreground mb-8">Sign in to your BuildOS account</p>
		</div>

		<!-- Form Section -->
		<div
			class="rounded-lg border border-border bg-card py-8 px-6 shadow-ink tx tx-grain tx-weak"
		>
			<!-- Google OAuth Button -->
			<div class="mb-6">
				<button
					type="button"
					onclick={handleGoogleLogin}
					disabled={googleLoading || loading}
					class="w-full px-6 py-3 text-base flex items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-ink hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed pressable"
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
					<div class="w-full border-t border-border"></div>
				</div>
				<div class="relative flex justify-center text-sm">
					<span class="px-2 bg-card text-muted-foreground">Or continue with email</span>
				</div>
			</div>

			<form onsubmit={handleSubmit} class="space-y-6">
				{#if error}
					<div
						class="rounded-lg border border-destructive/50 bg-destructive/10 text-destructive px-4 py-3"
					>
						{error}
					</div>
				{/if}

				<div class="space-y-5">
					<div>
						<label for="email" class="block text-sm font-semibold text-foreground mb-2">
							Email address <span class="text-accent">*</span>
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
							class="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
						/>
						{#if emailError}
							<p class="mt-1 text-sm text-destructive">{emailError}</p>
						{/if}
					</div>

					<div>
						<label
							for="password"
							class="block text-sm font-semibold text-foreground mb-2"
						>
							Password <span class="text-accent">*</span>
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
							class="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
						/>
					</div>
				</div>

				<div class="flex items-center justify-between">
					<div class="text-sm">
						<a
							href="/auth/forgot-password"
							class="font-medium text-accent hover:opacity-80 transition-opacity"
						>
							Forgot your password?
						</a>
					</div>
				</div>

				<div>
					<button
						type="submit"
						disabled={loading || googleLoading}
						class="w-full px-6 py-3 text-base rounded-lg bg-accent text-accent-foreground font-medium shadow-ink hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed pressable"
					>
						{loading ? 'Signing in...' : 'Sign in'}
					</button>
				</div>
			</form>

			<!-- Sign up link -->
			<div class="mt-6 text-center">
				<p class="text-sm text-muted-foreground">
					Don't have an account?
					<a
						href={`/auth/register${redirectQuery}`}
						class="font-medium text-accent hover:opacity-80 transition-opacity"
					>
						Create one now
					</a>
				</p>
			</div>
		</div>
	</div>
</div>
