<!-- apps/web/src/routes/ontology/templates/+error.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import { AlertCircle, ArrowLeft, RefreshCw, Archive } from 'lucide-svelte';

	const status = $derived($page.status);
	const message = $derived($page.error?.message || 'An unexpected error occurred');

	const errorTitle = $derived.by(() => {
		switch (status) {
			case 404:
				return 'Templates Not Found';
			case 401:
				return 'Authentication Required';
			case 403:
				return 'Admin Access Required';
			case 500:
				return 'Failed to Load Templates';
			default:
				return 'Template Error';
		}
	});

	const errorDescription = $derived.by(() => {
		switch (status) {
			case 404:
				return 'The template catalog could not be found or is temporarily unavailable.';
			case 401:
				return 'Please log in to access the template library.';
			case 403:
				return 'Template management requires administrator privileges. Contact your admin for access.';
			case 500:
				return 'There was a problem loading the template catalog. Please try again in a few moments.';
			default:
				return 'An unexpected error occurred while accessing the template library.';
		}
	});

	function handleRetry() {
		window.location.reload();
	}

	function handleGoBack() {
		goto('/ontology');
	}

	function handleLogin() {
		goto('/auth/login');
	}
</script>

<svelte:head>
	<title>{errorTitle} | Templates | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
	<div class="max-w-lg w-full">
		<Card variant="elevated">
			<CardBody padding="lg" class="text-center">
				<!-- Error Icon -->
				<div
					class="w-20 h-20 mx-auto mb-6 rounded-full {status === 403
						? 'bg-amber-100 dark:bg-amber-900/20'
						: 'bg-red-100 dark:bg-red-900/20'} flex items-center justify-center"
				>
					{#if status === 403}
						<Archive class="w-10 h-10 text-amber-600 dark:text-amber-400" />
					{:else}
						<AlertCircle class="w-10 h-10 text-red-600 dark:text-red-400" />
					{/if}
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
						class="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-3 mb-6 text-sm text-gray-700 dark:text-gray-300 text-left"
					>
						<strong>Technical Details:</strong> {message}
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="flex flex-col sm:flex-row gap-3 justify-center">
					{#if status === 401}
						<Button variant="primary" size="md" onclick={handleLogin}>
							Log In to Continue
						</Button>
					{:else if status === 403}
						<Button variant="primary" size="md" onclick={handleGoBack}>
							<ArrowLeft class="w-4 h-4" />
							Back to Dashboard
						</Button>
						<Button variant="outline" size="md" onclick={() => goto('/')}>
							Go to Home
						</Button>
					{:else if status === 500}
						<Button variant="primary" size="md" onclick={handleRetry}>
							<RefreshCw class="w-4 h-4" />
							Try Again
						</Button>
						<Button variant="outline" size="md" onclick={handleGoBack}>
							<ArrowLeft class="w-4 h-4" />
							Back to Dashboard
						</Button>
					{:else}
						<Button variant="primary" size="md" onclick={handleGoBack}>
							<ArrowLeft class="w-4 h-4" />
							Back to Dashboard
						</Button>
					{/if}
				</div>

				<!-- Additional Information -->
				{#if status === 403}
					<div
						class="mt-6 p-4 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800"
					>
						<p class="text-sm text-amber-900 dark:text-amber-200">
							<strong>Need Admin Access?</strong>
						</p>
						<p class="text-sm text-amber-800 dark:text-amber-300 mt-1">
							Template management is restricted to administrators. If you need access, please
							contact your system administrator.
						</p>
					</div>
				{/if}

				<!-- Help Text -->
				<p class="text-sm text-gray-500 dark:text-gray-400 mt-6">
					If you continue to experience issues, please
					<a href="mailto:support@buildos.dev" class="text-blue-600 dark:text-blue-400 hover:underline"
						>contact support</a
					>
					or check the
					<a href="https://status.buildos.dev" class="text-blue-600 dark:text-blue-400 hover:underline"
						>system status</a
					>.
				</p>
			</CardBody>
		</Card>
	</div>
</div>