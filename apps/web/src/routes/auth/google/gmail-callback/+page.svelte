<!-- apps/web/src/routes/auth/google/gmail-callback/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let error = '';
	let timeoutReached = false;

	onMount(() => {
		// Check for error in URL params
		const urlError = $page.url.searchParams.get('error');
		if (urlError) {
			error = urlError;
		}

		// Set a timeout in case the server load function doesn't redirect
		const timeout = setTimeout(() => {
			timeoutReached = true;
			if (!error) {
				console.warn('OAuth callback timeout reached, redirecting to login');
				goto('/auth/login?error=Authentication timeout. Please try again.');
			}
		}, 10000); // 10 second timeout

		// Cleanup timeout when component is destroyed
		return () => {
			clearTimeout(timeout);
		};
	});
</script>

<svelte:head>
	<title>Completing Sign In - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-background">
	<div class="max-w-md w-full space-y-8 px-4">
		<div class="text-center">
			<div class="flex justify-center mb-6">
				<div
					class="w-16 h-16 rounded-lg flex items-center justify-center border border-border bg-card shadow-ink tx tx-bloom tx-weak"
				>
					<img src="/brain-bolt.png" alt="BuildOS Icon" class="w-12 h-12" />
				</div>
			</div>

			{#if error}
				<div class="space-y-4">
					<h2 class="text-2xl font-bold text-destructive">Authentication Failed</h2>
					<div
						class="rounded-lg border border-destructive/50 bg-destructive/10 text-destructive px-4 py-3"
					>
						{error}
					</div>
					<div class="space-y-2">
						<a
							href="/auth/login"
							class="inline-block px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition-opacity"
						>
							Back to Sign In
						</a>
					</div>
				</div>
			{:else if timeoutReached}
				<div class="space-y-4">
					<h2 class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
						Taking Longer Than Expected
					</h2>
					<p class="text-muted-foreground">
						The authentication process is taking longer than usual. Please try again.
					</p>
					<div class="space-y-2">
						<a
							href="/auth/login"
							class="inline-block px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition-opacity"
						>
							Try Again
						</a>
					</div>
				</div>
			{:else}
				<div class="space-y-6">
					<h2 class="text-2xl font-bold text-foreground">Completing Sign In</h2>

					<div class="flex flex-col items-center space-y-4">
						<!-- Loading animation -->
						<div class="relative">
							<div
								class="w-12 h-12 border-4 border-accent/30 border-t-accent rounded-full animate-spin"
							></div>
						</div>

						<p class="text-muted-foreground text-center">
							We're setting up your account and signing you in...
						</p>
					</div>

					<!-- Progress indicators -->
					<div class="space-y-2">
						<div
							class="flex items-center justify-between text-sm text-muted-foreground"
						>
							<span>✓ Google authentication</span>
						</div>
						<div
							class="flex items-center justify-between text-sm text-muted-foreground"
						>
							<span class="flex items-center">
								<div
									class="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2"
								></div>
								Setting up your account
							</span>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
