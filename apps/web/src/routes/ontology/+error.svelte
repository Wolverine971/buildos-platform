<!-- apps/web/src/routes/ontology/+error.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import { AlertCircle, Home, RefreshCw } from 'lucide-svelte';

	const status = $derived($page.status);
	const message = $derived($page.error?.message || 'An unexpected error occurred');

	const errorTitle = $derived.by(() => {
		switch (status) {
			case 404:
				return 'Page Not Found';
			case 401:
				return 'Authentication Required';
			case 403:
				return 'Access Denied';
			case 500:
				return 'Server Error';
			default:
				return 'Error';
		}
	});

	const errorDescription = $derived.by(() => {
		switch (status) {
			case 404:
				return "The page you're looking for doesn't exist or has been moved.";
			case 401:
				return 'Please log in to access this page.';
			case 403:
				return 'You do not have permission to access this resource. Admin privileges may be required.';
			case 500:
				return 'Something went wrong on our end. Please try again later.';
			default:
				return 'An unexpected error occurred. Please try again.';
		}
	});

	function handleRetry() {
		window.location.reload();
	}

	function handleGoHome() {
		window.location.href = '/';
	}

	function handleGoToDashboard() {
		window.location.href = '/ontology';
	}
</script>

<svelte:head>
	<title>{errorTitle} | Ontology | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
	<div class="max-w-md w-full">
		<Card variant="elevated">
			<CardBody padding="lg" class="text-center">
				<!-- Error Icon -->
				<div
					class="w-20 h-20 mx-auto mb-6 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center"
				>
					<AlertCircle class="w-10 h-10 text-red-600 dark:text-red-400" />
				</div>

				<!-- Error Status -->
				<div class="text-6xl font-bold text-gray-900 dark:text-white mb-2">
					{status}
				</div>

				<!-- Error Title -->
				<h1 class="text-2xl font-semibold text-gray-900 dark:text-white mb-3">
					{errorTitle}
				</h1>

				<!-- Error Description -->
				<p class="text-gray-600 dark:text-gray-400 mb-6">
					{errorDescription}
				</p>

				<!-- Error Details (if available) -->
				{#if message && message !== errorDescription}
					<div
						class="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-3 mb-6 text-sm text-gray-700 dark:text-gray-300 text-left font-mono"
					>
						{message}
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="flex flex-col sm:flex-row gap-3 justify-center">
					{#if status === 401}
						<Button variant="primary" size="md" onclick={() => goto('/auth/login')}>
							Log In
						</Button>
					{:else if status === 403}
						<Button variant="primary" size="md" onclick={handleGoHome}>
							<Home class="w-4 h-4" />
							Go Home
						</Button>
					{:else if status === 404}
						<Button variant="primary" size="md" onclick={handleGoToDashboard}>
							Go to Dashboard
						</Button>
					{:else}
						<Button variant="primary" size="md" onclick={handleRetry}>
							<RefreshCw class="w-4 h-4" />
							Try Again
						</Button>
					{/if}

					<Button variant="outline" size="md" onclick={handleGoHome}>
						<Home class="w-4 h-4" />
						Home Page
					</Button>
				</div>

				<!-- Help Text -->
				<p class="text-sm text-gray-500 dark:text-gray-400 mt-6">
					If this problem persists, please contact support or check the
					<a
						href="https://status.buildos.dev"
						class="text-blue-600 dark:text-blue-400 hover:underline">system status</a
					>.
				</p>
			</CardBody>
		</Card>
	</div>
</div>
