<!-- apps/web/src/routes/auth/login/+page.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { afterNavigate, goto, preloadCode, replaceState } from '$app/navigation';
	import { PUBLIC_GOOGLE_CLIENT_ID } from '$env/static/public';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import AnimatedBrainBolt from '$lib/components/layout/AnimatedBrainBolt.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { CircleCheck, Eye, EyeOff } from '$lib/icons/lucide';
	import { validateEmailClient } from '$lib/utils/client-email-validation';
	import { normalizeRedirectPath } from '$lib/utils/auth-redirect';
	import { logAuthClientError } from '$lib/utils/auth-client-logger';

	// Status handed over in the URL (sign-out, password reset, OAuth failures) is read once so
	// the server render already shows it. Toasts are not mounted for signed-out visitors, so
	// these render inline.
	const initialParams = new URL($page.url).searchParams;
	const signedOut = initialParams.has('signed_out');

	let loading = $state(false);
	let googleLoading = $state(false);
	let email = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let error = $state(initialParams.get('error') ?? '');
	let notice = $state(initialParams.get('message') ?? '');
	let emailError = $state('');
	let redirectParam = $derived(normalizeRedirectPath($page.url.searchParams.get('redirect')));
	let redirectQuery = $derived(
		redirectParam ? `?redirect=${encodeURIComponent(redirectParam)}` : ''
	);
	let busy = $derived(loading || googleLoading);
	let destinationPreloaded = false;

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

	function resolveLoginErrorMessage(result: {
		error?: string;
		code?: string;
		status?: number;
		details?: unknown;
	}): string {
		const rawMessage = result.error || 'Login failed';
		const details =
			result.details && typeof result.details === 'object'
				? (result.details as Record<string, unknown>)
				: null;
		const reason = typeof details?.reason === 'string' ? details.reason : null;
		const lowerMessage = rawMessage.toLowerCase();

		if (
			result.code === 'EMAIL_NOT_CONFIRMED' ||
			reason === 'email_not_confirmed' ||
			lowerMessage.includes('email not confirmed')
		) {
			return 'Your email is not confirmed yet. Check your inbox and spam folder for the confirmation email.';
		}

		return rawMessage;
	}

	const PENDING_INVITES_PATH = `/invites?message=${encodeURIComponent('You have project invites to review')}`;

	// Fetch the likely destination's code while the person is still typing, so the jump
	// after sign-in only waits on data.
	function preloadDestination() {
		if (destinationPreloaded) return;
		destinationPreloaded = true;
		const target = new URL(resolveRedirectTarget() ?? '/dashboard', $page.url.origin);
		void preloadCode(target.pathname).catch(() => {});
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

		const normalizedEmail = email.trim().toLowerCase();
		const emailDomain = getEmailDomain(normalizedEmail);
		let responseStatus: number | null = null;
		let responseCode: string | undefined;
		let requestTimedOut = false;
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		const controller = new AbortController();

		loading = true;
		error = '';
		notice = '';
		emailError = '';

		try {
			timeoutId = setTimeout(() => {
				requestTimedOut = true;
				controller.abort();
			}, 15000);

			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				signal: controller.signal,
				body: JSON.stringify({
					email: normalizedEmail,
					password
				})
			});

			responseStatus = response.status;
			const result = await response.json();
			responseCode = result?.code;

			if (!response.ok) {
				const message = resolveLoginErrorMessage({
					error: result?.error,
					code: result?.code,
					status: responseStatus,
					details: result?.details
				});
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
			const pendingRedirect =
				!redirectTarget && result?.data?.hasPendingInvites ? PENDING_INVITES_PATH : null;
			const destination = redirectTarget ?? pendingRedirect ?? '/dashboard';

			await goto(destination, {
				invalidateAll: true // This ensures all load functions re-run
			});
		} catch (err: any) {
			console.error('Login error:', err);
			const isTimeout = requestTimedOut || err?.name === 'AbortError';
			void logAuthClientError(err, {
				endpoint: '/api/auth/login',
				method: 'POST',
				operation: 'auth_login',
				metadata: {
					status: responseStatus,
					code: responseCode,
					emailDomain,
					flow: 'password',
					timedOut: isTimeout
				}
			});
			error = isTimeout
				? 'Login request timed out. Please try again.'
				: err.message || 'Login failed';
		} finally {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			loading = false;
		}
	}

	// Google OAuth remains the same but simplified
	async function handleGoogleLogin() {
		if (googleLoading || loading) return;

		googleLoading = true;
		error = '';
		notice = '';

		const googleClientId = PUBLIC_GOOGLE_CLIENT_ID;
		if (!googleClientId) {
			error = 'Google sign-in is temporarily unavailable';
			googleLoading = false;
			return;
		}

		const redirectUri = `${$page.url.origin}/auth/google/login-callback`;
		const state = encodeOAuthState(resolveRedirectTarget());

		const params = new URLSearchParams({
			client_id: googleClientId,
			redirect_uri: redirectUri,
			response_type: 'code',
			scope: 'email profile openid',
			// Sign-in only needs the ID token, so returning users pick an account instead of
			// re-approving consent every time.
			prompt: 'select_account',
			state,
			include_granted_scopes: 'true'
		});

		// Store state for verification
		persistOAuthState(state);

		// Redirect to Google OAuth
		window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
	}

	function handleSubmit(event: Event) {
		event.preventDefault();
		handleLogin();
	}

	// Coming back from Google via the browser's back button restores this page from the
	// back/forward cache mid-"Opening Google…"; re-enable the buttons.
	function handlePageShow(event: PageTransitionEvent) {
		if (event.persisted) googleLoading = false;
	}

	// Drop the one-time status params so a refresh or bookmark doesn't replay them.
	afterNavigate(() => {
		const url = new URL($page.url);
		const hadStatus = ['signed_out', 'message', 'error'].some((key) =>
			url.searchParams.has(key)
		);
		if (!hadStatus) return;
		url.searchParams.delete('signed_out');
		url.searchParams.delete('message');
		url.searchParams.delete('error');
		// The first afterNavigate runs just before SvelteKit marks its router started, and
		// replaceState throws in dev until then; one microtask later it is ready.
		queueMicrotask(() => replaceState(url.toString(), {}));
	});
</script>

<svelte:window onpageshow={handlePageShow} />

<SEOHead
	title="Sign In - BuildOS"
	description="Sign in to BuildOS to access your projects, captured context, and project memory. Transform scattered thoughts into structured action."
	canonical="https://build-os.com/auth/login"
	keywords="BuildOS login, sign in, project memory, thinking environment"
	noindex={true}
/>

<AuthShell>
	<div class="text-center">
		<AnimatedBrainBolt class="mx-auto w-12 rounded-lg" />
		<h1
			id="login-heading"
			class="mt-5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
		>
			{signedOut ? 'You’re signed out' : 'Welcome back'}
		</h1>
		<p id="login-description" class="mt-2 text-sm text-muted-foreground sm:text-base">
			{signedOut
				? 'Sign back in whenever you’re ready.'
				: 'Sign in to pick up where you left off.'}
		</p>
	</div>

	<div
		class="mt-6 border border-border bg-card p-5 shadow-ink sm:p-6 tx tx-frame tx-weak wt-card"
	>
		{#if notice}
			<div
				role="status"
				class="mb-5 flex items-start gap-2.5 rounded-lg border border-success/40 bg-success/10 px-3 py-2.5 text-sm text-foreground"
			>
				<CircleCheck class="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
				<span>{notice}</span>
			</div>
		{/if}

		{#if error}
			<div
				role="alert"
				aria-live="assertive"
				aria-atomic="true"
				class="mb-5 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-sm text-destructive tx tx-static tx-weak"
			>
				<span class="sr-only">Error: </span>{error}
			</div>
		{/if}

		<Button
			variant="outline"
			fullWidth
			loading={googleLoading}
			disabled={busy}
			onclick={handleGoogleLogin}
		>
			{#if !googleLoading}
				<svg class="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
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
			{googleLoading ? 'Opening Google…' : 'Continue with Google'}
		</Button>

		<div class="my-5 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
			<span class="h-px flex-1 bg-border"></span>
			or use email
			<span class="h-px flex-1 bg-border"></span>
		</div>

		<form
			onsubmit={handleSubmit}
			onfocusin={preloadDestination}
			class="space-y-4"
			aria-labelledby="login-heading"
			aria-describedby="login-description"
		>
			<div>
				<label for="email" class="mb-1.5 block text-sm font-medium text-foreground">
					Email
				</label>
				<div class="relative tx tx-grid tx-weak rounded-lg overflow-hidden">
					<input
						id="email"
						bind:value={email}
						type="email"
						autocomplete="email"
						inputmode="email"
						enterkeyhint="next"
						required
						aria-required="true"
						aria-invalid={emailError ? 'true' : undefined}
						aria-describedby={emailError ? 'email-error' : undefined}
						disabled={busy}
						placeholder="you@example.com"
						onblur={validateEmail}
						class="relative z-10 h-11 w-full rounded-lg border border-border bg-background px-3.5 text-base text-foreground shadow-ink-inner transition-colors placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 sm:text-sm"
					/>
				</div>
				{#if emailError}
					<p id="email-error" class="mt-1.5 text-sm text-destructive" role="alert">
						{emailError}
					</p>
				{/if}
			</div>

			<div>
				<label for="password" class="mb-1.5 block text-sm font-medium text-foreground">
					Password
				</label>
				<div class="relative tx tx-grid tx-weak rounded-lg overflow-hidden">
					<input
						id="password"
						bind:value={password}
						type={showPassword ? 'text' : 'password'}
						autocomplete="current-password"
						enterkeyhint="go"
						required
						aria-required="true"
						disabled={busy}
						placeholder="Your password"
						class="relative z-10 h-11 w-full rounded-lg border border-border bg-background pl-3.5 pr-11 text-base text-foreground shadow-ink-inner transition-colors placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 sm:text-sm"
					/>
					<button
						type="button"
						onclick={() => (showPassword = !showPassword)}
						aria-label={showPassword ? 'Hide password' : 'Show password'}
						aria-pressed={showPassword}
						aria-controls="password"
						class="absolute inset-y-0 right-0 z-20 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
					>
						{#if showPassword}
							<EyeOff class="h-4 w-4" aria-hidden="true" />
						{:else}
							<Eye class="h-4 w-4" aria-hidden="true" />
						{/if}
					</button>
				</div>
				<div class="mt-2 flex justify-end">
					<a
						href="/auth/forgot-password"
						class="rounded text-sm font-medium text-accent transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						Forgot password?
					</a>
				</div>
			</div>

			<Button type="submit" variant="primary" fullWidth {loading} disabled={busy}>
				{loading ? 'Signing in…' : 'Sign in'}
			</Button>
		</form>
	</div>

	<p class="mt-6 text-center text-sm text-muted-foreground">
		New to BuildOS?
		<a
			href={`/auth/register${redirectQuery}`}
			class="rounded font-medium text-accent transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			Create an account
		</a>
	</p>
</AuthShell>
