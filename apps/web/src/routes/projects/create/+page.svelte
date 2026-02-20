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
	import { toastService, TOAST_DURATION } from '$lib/stores/toast.store';
	import type { DataMutationSummary } from '$lib/components/agent/agent-chat.types';

	let AgentChatModal = $state<any>(null);
	let showChatModal = $state(false);
	let loadError = $state<string | null>(null);

	onMount(async () => {
		try {
			const module = await import('$lib/components/agent/AgentChatModal.svelte');
			AgentChatModal = module.default;
			showChatModal = true;
		} catch (err) {
			console.error('Failed to load AgentChatModal:', err);
			loadError = 'Failed to load chat interface. Please try again.';
		}
	});

	function handleClose(summary?: DataMutationSummary) {
		showChatModal = false;
		if (summary?.hasChanges && summary.affectedProjectIds.length > 0) {
			toastService.success('Project created! Head to Projects to explore it.', {
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
			<h2 class="text-lg font-semibold text-foreground mb-2">Unable to Load</h2>
			<p class="text-sm text-muted-foreground mb-4">{loadError}</p>
			<button
				type="button"
				class="px-4 py-2 bg-accent text-accent-foreground rounded-lg font-semibold shadow-ink pressable"
				onclick={() => goto('/projects')}
			>
				Back to Projects
			</button>
		</div>
	{:else if !AgentChatModal}
		<LoadingSkeleton message="Preparing project creation..." height="200px" />
	{/if}
</div>

<!-- Agent Chat Modal for Project Creation -->
{#if AgentChatModal && showChatModal}
	<AgentChatModal isOpen={showChatModal} contextType="project_create" onClose={handleClose} />
{/if}
