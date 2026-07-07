<!-- apps/web/src/lib/components/inbox/InboxProjectBadge.svelte -->
<script lang="ts">
	import { ExternalLink, FolderKanban } from '$lib/icons/lucide';

	type ProjectMeta = {
		id: string;
		name: string | null;
	};

	let { project }: { project?: ProjectMeta | null } = $props();

	const projectLabel = $derived(project?.name?.trim() || 'Project');
</script>

{#if project}
	<div
		class="mb-2 flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-2 py-1.5"
	>
		<span
			class="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase text-accent"
		>
			<FolderKanban class="h-3 w-3" />
			Project
		</span>
		<a
			href="/projects/{project.id}"
			class="min-w-0 truncate text-xs font-semibold text-foreground hover:text-accent hover:underline"
			title="Open {projectLabel}"
		>
			{projectLabel}
		</a>
		<ExternalLink class="h-3 w-3 shrink-0 text-accent" />
	</div>
{/if}
