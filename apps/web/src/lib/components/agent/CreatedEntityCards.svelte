<!-- apps/web/src/lib/components/agent/CreatedEntityCards.svelte -->
<!--
	Horizontal "Created" chips shown at the bottom of the conversation. Each chip opens
	the entity in a NEW TAB so the user keeps their place in the chat. Driven by the
	session's accumulated created entities (persisted/re-derived on reload).
-->
<script lang="ts">
	import {
		FolderKanban,
		ListChecks,
		Target,
		Calendar,
		FileText,
		Flag,
		TriangleAlert,
		Sparkles,
		ExternalLink
	} from 'lucide-svelte';
	import type { CreatedEntityRef } from './agent-chat.types';

	let { entities }: { entities: CreatedEntityRef[] } = $props();

	const kindMeta: Record<string, { icon: typeof Target; label: string }> = {
		project: { icon: FolderKanban, label: 'Project' },
		task: { icon: ListChecks, label: 'Task' },
		goal: { icon: Target, label: 'Goal' },
		plan: { icon: Calendar, label: 'Plan' },
		document: { icon: FileText, label: 'Document' },
		milestone: { icon: Flag, label: 'Milestone' },
		risk: { icon: TriangleAlert, label: 'Risk' }
	};

	// Deep-link via the project page's query handlers (?doc= opens a document;
	// ?entity=&entity_id= opens the entity editor); projects open directly.
	function hrefFor(e: CreatedEntityRef): string | null {
		if (e.kind === 'project') return `/projects/${e.id}`;
		if (!e.projectId) return null;
		if (e.kind === 'document') return `/projects/${e.projectId}?doc=${e.id}`;
		return `/projects/${e.projectId}?entity=${e.kind}&entity_id=${e.id}`;
	}
</script>

<div class="flex flex-col gap-1.5">
	<div
		class="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground"
	>
		<Sparkles class="h-3 w-3 text-accent" />
		<span>{entities.length === 1 ? 'Created' : `Created ${entities.length}`}</span>
	</div>

	<div class="flex flex-wrap gap-1.5">
		{#each entities as entity (entity.id)}
			{@const meta = kindMeta[entity.kind] ?? { icon: Sparkles, label: entity.kind }}
			{@const EntityIcon = meta.icon}
			{@const href = hrefFor(entity)}
			{#if href}
				<a
					{href}
					target="_blank"
					rel="noopener noreferrer"
					class="entity-card group inline-flex max-w-[15rem] items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-ink transition-all pressable hover:border-accent hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					title={`Open ${meta.label.toLowerCase()} in a new tab: ${entity.name}`}
				>
					<span class="text-accent" aria-hidden="true">
						<EntityIcon class="h-3.5 w-3.5" />
					</span>
					<span class="flex min-w-0 flex-col leading-tight">
						<span class="truncate text-sm font-medium text-foreground"
							>{entity.name}</span
						>
						<span
							class="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
							>{meta.label}</span
						>
					</span>
					<ExternalLink
						class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:text-accent"
					/>
				</a>
			{:else}
				<span
					class="entity-card inline-flex max-w-[15rem] items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-ink"
					title={entity.name}
				>
					<span class="text-accent" aria-hidden="true">
						<EntityIcon class="h-3.5 w-3.5" />
					</span>
					<span class="flex min-w-0 flex-col leading-tight">
						<span class="truncate text-sm font-medium text-foreground"
							>{entity.name}</span
						>
						<span
							class="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
							>{meta.label}</span
						>
					</span>
				</span>
			{/if}
		{/each}
	</div>
</div>

<style>
	/* Reuse the global "just created" entrance so new chips rise in with an ink-bloom. */
	.entity-card {
		animation: entity-just-created 1.6s cubic-bezier(0.22, 1, 0.36, 1);
	}
</style>
