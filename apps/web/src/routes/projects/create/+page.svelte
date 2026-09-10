<!-- apps/web/src/routes/projects/create/+page.svelte -->
<!--
	Create Project Page

	This page opens the AgentChatModal for project creation.
	The AI chat flow handles all project setup through conversation.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import LoadingSkeleton from '$lib/components/ui/LoadingSkeleton.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService, TOAST_DURATION } from '$lib/stores/toast.store';
	import type { DataMutationSummary } from '$lib/components/agent/agent-chat.types';

	let AgentChatModal = $state<any>(null);
	let showChatModal = $state(false);
	let loadError = $state<string | null>(null);
	let isLoading = $state(false);

	async function loadChat() {
		if (isLoading) return;
		isLoading = true;
		loadError = null;
		try {
			const module = await import('$lib/components/agent/AgentChatModal.svelte');
			AgentChatModal = module.default;
			showChatModal = true;
		} catch (err) {
			console.error('Failed to load AgentChatModal:', err);
			loadError = 'Failed to load chat interface. Please try again.';
		} finally {
			isLoading = false;
		}
	}
	onMount(() => {
		void loadChat();
	});

	function handleClose(summary?: DataMutationSummary) {
		showChatModal = false;
		if (summary?.hasChanges && summary.affectedProjectIds.length > 0) {
			toastService.success('Project changes saved. Open your project to review them.', {
				duration: TOAST_DURATION.LONG
			});
		}
		goto('/projects');
	}
</script>

<svelte:head>
	<title>Create Project | BuildOS</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-background p-4">
	{#if loadError}
		<div
			class="rounded-lg border border-border bg-card p-6 text-center shadow-ink max-w-md w-full"
		>
			<h2 class="text-lg font-semibold text-foreground mb-2">Couldn’t open project setup</h2>
			<p class="text-sm text-muted-foreground mb-4">{loadError}</p>
			<div class="flex flex-wrap justify-center gap-2">
				<Button variant="primary" onclick={loadChat}>Try again</Button>
				<Button variant="outline" onclick={() => goto('/projects')}>Back to Projects</Button
				>
			</div>
		</div>
	{:else if !AgentChatModal}
		<LoadingSkeleton message="Preparing project creation..." height="200px" />
	{/if}
</div>

<!-- Agent Chat Modal for Project Creation -->
{#if AgentChatModal && showChatModal}
	<AgentChatModal isOpen={showChatModal} contextType="project_create" onClose={handleClose} />
{/if}
