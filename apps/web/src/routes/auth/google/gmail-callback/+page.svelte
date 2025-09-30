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

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
	<div class="max-w-md w-full space-y-8 px-4">
		<div class="text-center">
			<div class="flex justify-center mb-6">
				<img src="/brain-bolt.png" alt="BuildOS Icon" class="w-16 h-16" />
			</div>

			{#if error}
				<div class="space-y-4">
					<h2 class="text-2xl font-bold text-red-600 dark:text-red-400">
						Authentication Failed
					</h2>
					<div
						class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg"
					>
						{error}
					</div>
					<div class="space-y-2">
						<a
							href="/auth/login"
							class="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
					<p class="text-gray-600 dark:text-gray-400">
						The authentication process is taking longer than usual. Please try again.
					</p>
					<div class="space-y-2">
						<a
							href="/auth/login"
							class="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
						>
							Try Again
						</a>
					</div>
				</div>
			{:else}
				<div class="space-y-6">
					<h2 class="text-2xl font-bold text-gray-900 dark:text-white">
						Completing Sign In
					</h2>

					<div class="flex flex-col items-center space-y-4">
						<!-- Loading animation -->
						<div class="relative">
							<div
								class="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"
							></div>
						</div>

						<p class="text-gray-600 dark:text-gray-400 text-center">
							We're setting up your account and signing you in...
						</p>
					</div>

					<!-- Progress indicators -->
					<div class="space-y-2">
						<div
							class="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400"
						>
							<span>✓ Google authentication</span>
						</div>
						<div
							class="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400"
						>
							<span class="flex items-center">
								<div
									class="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"
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
