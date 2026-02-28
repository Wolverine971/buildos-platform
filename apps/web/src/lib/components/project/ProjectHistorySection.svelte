<!-- apps/web/src/lib/components/project/ProjectHistorySection.svelte -->
<script lang="ts">
	import type { ProjectLogEntityType } from '@buildos/shared-types';

	let {
		canViewLogs,
		projectId,
		projectName,
		compact = false,
		onEntityClick
	}: {
		canViewLogs: boolean;
		projectId: string;
		projectName: string | null;
		compact?: boolean;
		onEntityClick: (entityType: ProjectLogEntityType, entityId: string) => void;
	} = $props();
</script>

{#if canViewLogs}
	<div class={compact ? 'relative py-3 mt-3' : 'relative py-2 sm:py-4'}>
		<div
			class={compact
				? 'absolute inset-0 flex items-center px-2'
				: 'absolute inset-0 flex items-center px-3 sm:px-4'}
		>
			<div class="w-full border-t border-border/40"></div>
		</div>
		<div class="relative flex justify-center">
			<span
				class={compact
					? 'bg-background px-2 text-[9px] font-medium text-muted-foreground/70 uppercase tracking-widest'
					: 'bg-background px-2 sm:px-3 text-[9px] sm:text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest'}
			>
				History
			</span>
		</div>
	</div>

	<div class={compact ? 'space-y-2' : 'space-y-3'}>
		{#await import('$lib/components/ontology/ProjectBriefsPanel.svelte') then { default: ProjectBriefsPanel }}
			<ProjectBriefsPanel {projectId} projectName={projectName || 'Project'} />
		{:catch}
			<div
				class="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground"
			>
				Unable to load daily briefs.
			</div>
		{/await}

		{#await import('$lib/components/ontology/ProjectActivityLogPanel.svelte') then { default: ProjectActivityLogPanel }}
			<ProjectActivityLogPanel {projectId} {onEntityClick} />
		{:catch}
			<div
				class="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground"
			>
				Unable to load activity log.
			</div>
		{/await}
	</div>
{/if}
