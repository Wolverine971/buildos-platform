<!-- apps/web/src/routes/auth/register/+page.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { goto, replaceState } from '$app/navigation';
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
	let confirmPassword = $state('');
	let name = $state('');
	let error = $state('');
	let success = $state(false);
	let successMessage = $state('');
	let emailError = $state('');

	// Show any URL messages as toasts
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

	// Google OAuth remains the same
	async function handleGoogleSignUp() {
		if (googleLoading || loading) return;

		googleLoading = true;
		error = '';

		const redirectUri = `${$page.url.origin}/auth/google/register-callback`;
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

	// Client-side validation before submission
	function validateForm() {
		error = '';
		emailError = '';

		// Trim inputs
		email = email.trim();
		name = name.trim();

		// Basic validation
		if (!email || !password || !confirmPassword) {
			error = 'Email, password, and confirm password are required';
			return false;
		}

		// Email validation (enhanced security)
		const emailValidation = validateEmailClient(email);
		if (!emailValidation.valid) {
			emailError = emailValidation.error || 'Invalid email address';
			error = emailValidation.error || 'Invalid email address';
			return false;
		}

		// Password match validation
		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return false;
		}

		return true;
	}

	async function handleRegister() {
		if (loading || googleLoading) return;

		if (!validateForm()) {
			return;
		}

		loading = true;
		error = '';
		success = false;

		try {
			const response = await fetch('/api/auth/register', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: email.trim(),
					password,
					name: name || undefined
				})
			});

			const result = await response.json();

			if (!response.ok) {
				const errorMessage = result?.error || result?.message || 'Registration failed';

				// Handle specific error codes
				if (result?.code === 'USER_EXISTS') {
					// Offer to redirect to login
					error = errorMessage;
					setTimeout(() => {
						if (confirm('Would you like to sign in instead?')) {
							goto('/auth/login');
						}
					}, 100);
				} else {
					error = errorMessage;
				}
				return;
			}

			const requiresEmailConfirmation =
				result?.data?.requiresEmailConfirmation ??
				result?.requiresEmailConfirmation ??
				false;

			// Handle successful registration
			if (requiresEmailConfirmation) {
				// Show success message for email confirmation
				success = true;
				successMessage =
					result?.message ??
					'Registration successful! Please check your email to confirm your account before signing in.';

				// Clear form
				email = '';
				password = '';
				confirmPassword = '';
				name = '';
			} else {
				// Auto-login successful - navigate to home with onboarding
				await goto('/?onboarding=true', {
					invalidateAll: true
				});

				// Show welcome message after navigation
				toastService.success(
					result?.message ||
						'Welcome to BuildOS! Your account has been created successfully.'
				);
			}
		} catch (err: any) {
			console.error('Registration error:', err);
			error = err.message || 'Registration failed';
		} finally {
			loading = false;
		}
	}

	function handleSubmit(event: Event) {
		event.preventDefault();
		handleRegister();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleRegister();
		}
	}

	// Real-time password validation feedback
	let passwordStrength = $derived.by(() => {
		if (!password) {
			return null;
		}

		const checks = {
			length: password.length >= 8,
			uppercase: /[A-Z]/.test(password),
			lowercase: /[a-z]/.test(password),
			number: /\d/.test(password)
		};

		const score = Object.values(checks).filter(Boolean).length;
		return { checks, score };
	});

	let passwordsMatch = $derived(!confirmPassword || password === confirmPassword);
</script>

<SEOHead
	title="Sign Up - BuildOS | Start Your 14-Day Free Trial"
	description="Create your BuildOS account and transform brain dumps into structured projects. AI-powered project organization for ADHD minds, founders, and creators. No credit card required."
	canonical="https://build-os.com/auth/register"
	keywords="BuildOS sign up, free trial, AI project management, ADHD productivity, brain dump app"
	noindex={true}
/>

<!-- Account for navbar height -->
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

			<h2 class="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Join BuildOS</h2>
			<p class="text-slate-700 dark:text-slate-300 mb-8">
				Create your personal operating system
			</p>
		</div>

		<!-- Form Section -->
		<div class="card-industrial py-8 px-6 relative noise-overlay">
			<!-- Google OAuth Button -->
			<div class="mb-6">
				<button
					type="button"
					onclick={handleGoogleSignUp}
					disabled={googleLoading || loading || success}
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
					{googleLoading ? 'Creating account...' : 'Continue with Google'}
				</button>
			</div>

			<!-- Divider -->
			<div class="relative mb-6">
				<div class="absolute inset-0 flex items-center">
					<div class="w-full border-t border-gray-300 dark:border-gray-600"></div>
				</div>
				<div class="relative flex justify-center text-sm">
					<span class="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400"
						>Or create account with email</span
					>
				</div>
			</div>

			{#if !success}
				<form onsubmit={handleSubmit} class="space-y-6">
					{#if error}
						<div
							class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg"
						>
							{error}
						</div>
					{/if}

					<div class="space-y-5">
						<FormField
							label="Full name"
							labelFor="name"
							required={false}
							showOptional={true}
						>
							<TextInput
								id="name"
								bind:value={name}
								type="text"
								autocomplete="name"
								enterkeyhint="next"
								disabled={loading || googleLoading}
								placeholder="Enter your full name"
								size="lg"
							/>
						</FormField>

						<FormField label="Email address" labelFor="email" required={true}>
							<TextInput
								id="email"
								bind:value={email}
								type="email"
								autocomplete="email"
								inputmode="email"
								enterkeyhint="next"
								required
								disabled={loading || googleLoading}
								placeholder="Enter your email"
								size="lg"
								onblur={validateEmail}
							/>
							{#if emailError}
								<p class="mt-1 text-sm text-red-600 dark:text-red-400">
									{emailError}
								</p>
							{/if}
						</FormField>

						<FormField label="Password" labelFor="password" required={true}>
							<TextInput
								id="password"
								bind:value={password}
								type="password"
								autocomplete="new-password"
								enterkeyhint="next"
								required
								disabled={loading || googleLoading}
								placeholder="Enter your password"
								size="lg"
							/>

							<!-- Password strength indicator -->
							{#if passwordStrength}
								<div class="mt-2 space-y-1">
									<div class="flex space-x-1">
										{#each Array(4) as _, i}
											<div
												class="h-1 w-full rounded-full bg-gray-200 dark:bg-gray-600"
											>
												<div
													class="h-full rounded-full transition-colors {passwordStrength.score >
													i
														? passwordStrength.score === 4
															? 'bg-green-500'
															: passwordStrength.score >= 2
																? 'bg-yellow-500'
																: 'bg-red-500'
														: ''}"
												></div>
											</div>
										{/each}
									</div>
									<div class="text-xs text-gray-600 dark:text-gray-400">
										<span class="block">Password requirements:</span>
										<ul class="mt-1 space-y-0.5">
											<li
												class={passwordStrength.checks.length
													? 'text-green-600 dark:text-green-400'
													: ''}
											>
												✓ At least 8 characters
											</li>
											<li
												class={passwordStrength.checks.uppercase
													? 'text-green-600 dark:text-green-400'
													: ''}
											>
												✓ One uppercase letter
											</li>
											<li
												class={passwordStrength.checks.lowercase
													? 'text-green-600 dark:text-green-400'
													: ''}
											>
												✓ One lowercase letter
											</li>
											<li
												class={passwordStrength.checks.number
													? 'text-green-600 dark:text-green-400'
													: ''}
											>
												✓ One number
											</li>
										</ul>
									</div>
								</div>
							{/if}
						</FormField>

						<FormField
							label="Confirm password"
							labelFor="confirmPassword"
							required={true}
							error={confirmPassword && !passwordsMatch
								? 'Passwords do not match'
								: ''}
						>
							<TextInput
								id="confirmPassword"
								bind:value={confirmPassword}
								type="password"
								autocomplete="new-password"
								enterkeyhint="done"
								required
								disabled={loading || googleLoading}
								onkeydown={handleKeydown}
								placeholder="Confirm your password"
								size="lg"
								error={confirmPassword && !passwordsMatch}
							/>
						</FormField>
					</div>

					<div>
						<Button
							type="submit"
							disabled={loading || googleLoading}
							{loading}
							fullWidth={true}
							variant="primary"
							size="lg"
							class=""
						>
							{loading ? 'Creating account...' : 'Create account'}
						</Button>
					</div>

					<div class="text-xs text-gray-500 dark:text-gray-400 text-center">
						By signing up, you agree to our terms of service and privacy policy.
					</div>
				</form>
			{:else}
				<!-- Success message -->
				<div
					class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg"
				>
					<h3 class="font-semibold mb-2">Check your email!</h3>
					<p>{successMessage}</p>
				</div>

				<div class="mt-4 text-center">
					<a href="/auth/login">
						<Button variant="secondary" fullWidth={true} size="lg">
							Go to Sign In
						</Button>
					</a>
				</div>
			{/if}

			<!-- Sign in link -->
			{#if !success}
				<div class="mt-6 text-center">
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Already have an account?
						<a
							href="/auth/login"
							class="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors"
						>
							Sign in here
						</a>
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>
