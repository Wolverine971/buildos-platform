<!-- apps/web/src/routes/projects/[id]/+error.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import { AlertCircle, ArrowLeft, FileX, LogOut, RefreshCw } from '$lib/icons/lucide';

	const status = $derived($page.status);
	const message = $derived($page.error?.message || 'An unexpected error occurred');
	const projectId = $derived($page.params.id);
	const userEmail = $derived(
		typeof $page.data?.user?.email === 'string' ? $page.data.user.email : ''
	);

	const errorTitle = $derived.by(() => {
		switch (status) {
			case 404:
				return 'Project Not Found';
			case 403:
				return 'You do not have access to this project';
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
				return userEmail
					? 'This email does not have access to this project.'
					: 'Your current account does not have access to this project.';
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

	function handleSwitchAccount() {
		const destination = `${$page.url.pathname}${$page.url.search}`;
		const loginUrl = `/auth/login?redirect=${encodeURIComponent(destination)}`;
		window.location.href = `/auth/logout?redirect=${encodeURIComponent(loginUrl)}`;
	}
</script>

<svelte:head>
	<title>{errorTitle} | Ontology | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background flex items-center justify-center px-4">
	<div class="max-w-lg w-full">
		<Card variant="elevated" class="tx tx-static tx-weak">
			<CardBody padding="lg" class="text-center">
				<!-- Error Icon -->
				<div
					class="w-20 h-20 mx-auto mb-6 rounded-full {status === 404
						? 'bg-warning/15'
						: 'bg-destructive/15'} flex items-center justify-center"
				>
					{#if status === 404}
						<FileX class="w-10 h-10 text-warning" />
					{:else}
						<AlertCircle class="w-10 h-10 text-destructive" />
					{/if}
				</div>

				<!-- Error Status -->
				<div class="text-6xl font-bold text-foreground mb-2">
					{status}
				</div>

				<!-- Error Title -->
				<h1 class="text-2xl font-semibold text-foreground mb-3">
					{errorTitle}
				</h1>

				<!-- Error Description -->
				<p class="text-muted-foreground mb-6">
					{errorDescription}
				</p>

				{#if status === 403 && userEmail}
					<div
						class="mb-6 min-w-0 rounded-lg border border-border bg-muted px-4 py-3 text-left"
					>
						<p class="micro-label mb-1 text-muted-foreground">Signed in as</p>
						<p class="truncate text-sm font-medium text-foreground" title={userEmail}>
							{userEmail}
						</p>
					</div>
				{/if}

				<!-- Project ID Display -->
				{#if projectId && status === 404}
					<div
						class="bg-muted rounded-lg px-4 py-3 mb-6 text-sm font-mono text-muted-foreground border border-border"
					>
						Project ID: {projectId}
					</div>
				{/if}

				<!-- Error Details (if available and different from description) -->
				{#if status !== 403 && message && message !== errorDescription && !message.includes('not found')}
					<div
						class="bg-muted rounded-lg px-4 py-3 mb-6 text-sm text-muted-foreground text-left border border-border"
					>
						<strong class="text-foreground">Details:</strong>
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
					{:else if status === 403}
						<Button variant="primary" size="md" onclick={handleSwitchAccount}>
							<LogOut class="h-4 w-4 shrink-0" />
							Switch account
						</Button>
						<Button variant="outline" size="md" onclick={handleGoBack}>
							<ArrowLeft class="h-4 w-4 shrink-0" />
							Back to Projects
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
				<div class="text-sm text-muted-foreground mt-6 space-y-2">
					<p>
						{#if status === 404}
							If you believe this project should exist, try:
						{:else if status === 403}
							Ask the project owner to invite this email, or switch to the invited
							account.
						{:else}
							If this problem persists:
						{/if}
					</p>
					{#if status !== 403}
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
					{/if}
				</div>
			</CardBody>
		</Card>
	</div>
</div>
