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
	import { normalizeRedirectPath } from '$lib/utils/auth-redirect';
	import { logAuthClientError } from '$lib/utils/auth-client-logger';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	let loading = $state(false);
	let googleLoading = $state(false);
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let name = $state('');
	let error = $state('');
	let showExistingAccountHint = $state(false);
	let success = $state(false);
	let successMessage = $state('');
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

	function persistOAuthState(state: string) {
		sessionStorage.setItem('oauth_state', state);
		const secure = window.location.protocol === 'https:' ? '; Secure' : '';
		document.cookie = `buildos_oauth_state=${state}; Max-Age=600; Path=/; SameSite=Lax${secure}`;
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
						source: 'auth_register',
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
					source: 'auth_register',
					status: responseStatus
				}
			});
		}
		return null;
	}

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
		persistOAuthState(state);

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

		const emailDomain = getEmailDomain(email);
		let responseStatus: number | null = null;
		let responseCode: string | undefined;

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

			responseStatus = response.status;
			const result = await response.json();
			responseCode = result?.code;

			if (!response.ok) {
				const errorMessage = result?.error || result?.message || 'Registration failed';
				void logAuthClientError(new Error(errorMessage), {
					endpoint: '/api/auth/register',
					method: 'POST',
					operation: 'auth_register',
					metadata: {
						status: responseStatus,
						code: responseCode,
						emailDomain,
						flow: 'password'
					}
				});

				// Handle specific error codes
				if (result?.code === 'ALREADY_EXISTS' || result?.code === 'USER_EXISTS') {
					error = errorMessage;
					showExistingAccountHint = true;
				} else {
					error = errorMessage;
					showExistingAccountHint = false;
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
				const redirectTarget = resolveRedirectTarget();
				const pendingRedirect = redirectTarget
					? null
					: await resolvePendingInviteRedirect();
				const destination = redirectTarget ?? pendingRedirect ?? '/?onboarding=true';

				// Auto-login successful - navigate to destination
				await goto(destination, {
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
			void logAuthClientError(err, {
				endpoint: '/api/auth/register',
				method: 'POST',
				operation: 'auth_register',
				metadata: {
					status: responseStatus,
					code: responseCode,
					emailDomain,
					flow: 'password'
				}
			});
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
	let prefersReducedMotion = $state(false);

	onMount(() => {
		// Check for reduced motion preference
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mediaQuery.matches;

		// Listen for changes
		const handleChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};
		mediaQuery.addEventListener('change', handleChange);

		return () => mediaQuery.removeEventListener('change', handleChange);
	});

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
	description="Create your BuildOS account and transform brain dumps into shared project context. AI-powered project collaboration for ADHD minds, founders, and creators. No credit card required."
	canonical="https://build-os.com/auth/register"
	keywords="BuildOS sign up, free trial, AI project management, ADHD productivity, brain dump app"
	noindex={true}
/>

<!-- Account for navbar height -->
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
						autoplay={!prefersReducedMotion}
						loop
						muted
						playsinline
						aria-hidden="true"
					></video>
				</div>
			</div>

			<h1 class="text-3xl font-bold text-foreground mb-2">Join BuildOS</h1>
			<p class="text-muted-foreground mb-8">Create your personal operating system</p>
		</div>

		<!-- Form Section -->
		<div
			class="rounded-lg border border-border bg-card py-8 px-6 shadow-ink tx tx-grain tx-weak"
		>
			<!-- Google OAuth Button -->
			<div class="mb-6">
				<button
					type="button"
					onclick={handleGoogleSignUp}
					disabled={googleLoading || loading || success}
					class="w-full px-6 py-3 text-base flex items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-ink hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					{#if !googleLoading}
						<svg
							class="w-5 h-5 mr-3"
							viewBox="0 0 24 24"
							aria-hidden="true"
							focusable="false"
						>
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
					<div class="w-full border-t border-border"></div>
				</div>
				<div class="relative flex justify-center text-sm">
					<span class="px-2 bg-card text-muted-foreground"
						>Or create account with email</span
					>
				</div>
			</div>

			{#if !success}
				<form onsubmit={handleSubmit} class="space-y-6">
					{#if error}
						<div
							class="rounded-lg border border-destructive/50 bg-destructive/10 text-destructive px-4 py-3 tx tx-static tx-weak"
							role="alert"
							aria-live="assertive"
						>
							<span class="sr-only">Error: </span>{error}
							{#if showExistingAccountHint}
								<p class="mt-2 text-sm">
									<a
										href={`/auth/login${redirectQuery}`}
										class="font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
									>
										Sign in to your existing account &rarr;
									</a>
								</p>
							{/if}
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
								<p class="mt-1 text-sm text-destructive">
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
											<div class="h-1 w-full rounded-full bg-muted">
												<div
													class="h-full rounded-full transition-colors {passwordStrength.score >
													i
														? passwordStrength.score === 4
															? 'bg-accent'
															: passwordStrength.score >= 2
																? 'bg-accent/60'
																: 'bg-destructive'
														: ''}"
												></div>
											</div>
										{/each}
									</div>
									<div class="text-xs text-muted-foreground">
										<span class="block">Password requirements:</span>
										<ul class="mt-1 space-y-0.5">
											<li
												class={passwordStrength.checks.length
													? 'text-accent'
													: ''}
											>
												✓ At least 8 characters
											</li>
											<li
												class={passwordStrength.checks.uppercase
													? 'text-accent'
													: ''}
											>
												✓ One uppercase letter
											</li>
											<li
												class={passwordStrength.checks.lowercase
													? 'text-accent'
													: ''}
											>
												✓ One lowercase letter
											</li>
											<li
												class={passwordStrength.checks.number
													? 'text-accent'
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
								error={Boolean(confirmPassword) && !passwordsMatch}
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

					<div class="text-xs text-muted-foreground text-center">
						By signing up, you agree to our terms of service and privacy policy.
					</div>
				</form>
			{:else}
				<!-- Success message -->
				<div
					class="rounded-lg border border-accent/50 bg-accent/10 text-foreground px-4 py-3 tx tx-bloom tx-weak"
					role="status"
					aria-live="polite"
				>
					<h2 class="font-semibold mb-2 text-accent">Check your email!</h2>
					<p>{successMessage}</p>
				</div>

				<div class="mt-4 text-center">
					<a href={`/auth/login${redirectQuery}`}>
						<Button variant="secondary" fullWidth={true} size="lg">
							Go to Sign In
						</Button>
					</a>
				</div>
			{/if}

			<!-- Sign in link -->
			{#if !success}
				<div class="mt-6 text-center">
					<p class="text-sm text-muted-foreground">
						Already have an account?
						<a
							href={`/auth/login${redirectQuery}`}
							class="font-medium text-accent hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
						>
							Sign in here
						</a>
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>
