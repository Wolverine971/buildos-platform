<!-- apps/web/src/routes/projects/projects/[id]/+error.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import { AlertCircle, ArrowLeft, RefreshCw, FileX } from 'lucide-svelte';

	const status = $derived($page.status);
	const message = $derived($page.error?.message || 'An unexpected error occurred');
	const projectId = $derived($page.params.id);

	const errorTitle = $derived.by(() => {
		switch (status) {
			case 404:
				return 'Project Not Found';
			case 403:
				return 'Access Denied';
			case 500:
				return 'Failed to Load Project';
			default:
				return 'Project Error';
		}
	});

	const errorDescription = $derived.by(() => {
		switch (status) {
			case 404:
				return `The project with ID "${projectId}" could not be found. It may have been deleted or you may not have permission to view it.`;
			case 403:
				return 'You do not have permission to access this project. Admin privileges may be required.';
			case 500:
				return 'There was a problem loading this project. Please try again in a few moments.';
			default:
				return 'An unexpected error occurred while loading this project.';
		}
	});

	function handleRetry() {
		window.location.reload();
	}

	function handleGoBack() {
		goto('/projects');
	}
</script>

<svelte:head>
	<title>{errorTitle} | Ontology | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
	<div class="max-w-lg w-full">
		<Card variant="elevated">
			<CardBody padding="lg" class="text-center">
				<!-- Error Icon -->
				<div
					class="w-20 h-20 mx-auto mb-6 rounded-full {status === 404
						? 'bg-amber-100 dark:bg-amber-900/20'
						: 'bg-red-100 dark:bg-red-900/20'} flex items-center justify-center"
				>
					{#if status === 404}
						<FileX class="w-10 h-10 text-amber-600 dark:text-amber-400" />
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

				<!-- Project ID Display -->
				{#if projectId && status === 404}
					<div
						class="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-3 mb-6 text-sm font-mono text-gray-700 dark:text-gray-300"
					>
						Project ID: {projectId}
					</div>
				{/if}

				<!-- Error Details (if available and different from description) -->
				{#if message && message !== errorDescription && !message.includes('not found')}
					<div
						class="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-3 mb-6 text-sm text-gray-700 dark:text-gray-300 text-left"
					>
						<strong>Details:</strong>
						{message}
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="flex flex-col sm:flex-row gap-3 justify-center">
					{#if status === 404}
						<Button variant="primary" size="md" onclick={handleGoBack}>
							<ArrowLeft class="w-4 h-4" />
							View All Projects
						</Button>
						<Button
							variant="outline"
							size="md"
							onclick={() => goto('/projects/create')}
						>
							Create New Project
						</Button>
					{:else}
						<Button variant="primary" size="md" onclick={handleRetry}>
							<RefreshCw class="w-4 h-4" />
							Try Again
						</Button>
						<Button variant="outline" size="md" onclick={handleGoBack}>
							<ArrowLeft class="w-4 h-4" />
							Back to Projects
						</Button>
					{/if}
				</div>

				<!-- Help Text -->
				<div class="text-sm text-gray-500 dark:text-gray-400 mt-6 space-y-2">
					<p>
						{#if status === 404}
							If you believe this project should exist, try:
						{:else}
							If this problem persists:
						{/if}
					</p>
					<ul class="list-disc list-inside text-left max-w-sm mx-auto">
						{#if status === 404}
							<li>Checking the project ID is correct</li>
							<li>Verifying you have the right permissions</li>
							<li>Contacting the project owner</li>
						{:else}
							<li>Refreshing the page</li>
							<li>Clearing your browser cache</li>
							<li>Checking your internet connection</li>
						{/if}
					</ul>
				</div>
			</CardBody>
		</Card>
	</div>
</div>
