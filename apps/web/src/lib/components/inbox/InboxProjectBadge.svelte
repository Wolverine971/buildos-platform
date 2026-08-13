<!-- apps/web/src/lib/components/inbox/InboxProjectBadge.svelte -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { ExternalLink, FolderKanban } from '$lib/icons/lucide';

	type ProjectMeta = {
		id: string;
		name: string | null;
	};

	let {
		project,
		variant = 'badge'
	}: {
		project?: ProjectMeta | null;
		variant?: 'badge' | 'compact';
	} = $props();

	const projectLabel = $derived(project?.name?.trim() || 'Project');
</script>

{#if project}
	{#if variant === 'compact'}
		<div class="mb-1.5 flex min-w-0 items-start gap-1.5">
			<span class="micro-label inline-flex shrink-0 items-center gap-1 text-accent">
				<FolderKanban class="h-3 w-3 shrink-0" />
				Project
			</span>
			<span class="min-w-0 break-words text-xs font-semibold text-foreground">
				{projectLabel}
			</span>
		</div>
	{:else}
		<div
			class="mb-2 flex min-w-0 items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-2 py-1.5"
		>
			<span class="micro-label inline-flex shrink-0 items-center gap-1 text-accent">
				<FolderKanban class="h-3 w-3 shrink-0" />
				Project
			</span>
			<a
				href={resolve('/projects/[id]', { id: project.id })}
				class="min-w-0 flex-1 break-words rounded-md text-xs font-semibold text-foreground hover:text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
				title="Open {projectLabel}"
			>
				{projectLabel}
			</a>
			<ExternalLink class="h-3 w-3 shrink-0 text-accent" />
		</div>
	{/if}
{/if}
