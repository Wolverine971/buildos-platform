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

	let loading = false;
	let googleLoading = false;
	let email = '';
	let password = '';
	let error = '';

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
	class="flex items-center justify-center px-4 sm:px-6 lg:px-8"
	style="min-height: calc(100vh - 64px);"
>
	<div class="max-w-md w-full space-y-8 py-12">
		<!-- Logo/Brand Section -->
		<div class="text-center">
			<div class="flex justify-center mb-6">
				<video
					src="/onboarding-assets/animations/brain-bolt-electric.mp4"
					class="w-16 h-16"
					autoplay
					loop
					muted
					playsinline
					aria-label="BuildOS Icon"
				></video>
			</div>

			<h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Welcome back</h2>
			<p class="text-gray-600 dark:text-gray-400 mb-8">Sign in to your BuildOS account</p>
		</div>

		<!-- Form Section -->
		<div class="bg-white dark:bg-gray-800 py-8 px-6 shadow-sm rounded-lg">
			<!-- Google OAuth Button -->
			<div class="mb-6">
				<Button
					type="button"
					on:click={handleGoogleLogin}
					disabled={googleLoading || loading}
					loading={googleLoading}
					fullWidth={true}
					variant="secondary"
					size="lg"
					class="border-gray-300 dark:border-gray-600"
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
				</Button>
			</div>

			<!-- Divider -->
			<div class="relative mb-6">
				<div class="absolute inset-0 flex items-center">
					<div class="w-full border-t border-gray-300 dark:border-gray-600"></div>
				</div>
				<div class="relative flex justify-center text-sm">
					<span class="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400"
						>Or continue with email</span
					>
				</div>
			</div>

			<form on:submit={handleSubmit} class="space-y-6">
				{#if error}
					<div
						class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg"
					>
						{error}
					</div>
				{/if}

				<div class="space-y-5">
					<FormField label="Email address" labelFor="email" required={true}>
						<TextInput
							id="email"
							bind:value={email}
							type="email"
							autocomplete="email"
							required
							disabled={loading || googleLoading}
							placeholder="Enter your email"
							size="lg"
						/>
					</FormField>

					<FormField label="Password" labelFor="password" required={true}>
						<TextInput
							id="password"
							bind:value={password}
							type="password"
							autocomplete="current-password"
							required
							disabled={loading || googleLoading}
							on:keydown={handleKeydown}
							placeholder="Enter your password"
							size="lg"
						/>
					</FormField>
				</div>

				<div class="flex items-center justify-between">
					<div class="text-sm">
						<a
							href="/auth/forgot-password"
							class="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors"
						>
							Forgot your password?
						</a>
					</div>
				</div>

				<div>
					<Button
						type="submit"
						disabled={loading || googleLoading}
						{loading}
						fullWidth={true}
						variant="primary"
						size="lg"
						class="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg"
					>
						{loading ? 'Signing in...' : 'Sign in'}
					</Button>
				</div>
			</form>

			<!-- Sign up link -->
			<div class="mt-6 text-center">
				<p class="text-sm text-gray-600 dark:text-gray-400">
					Don't have an account?
					<a
						href="/auth/register"
						class="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors"
					>
						Create one now
					</a>
				</p>
			</div>
		</div>
	</div>
</div>
