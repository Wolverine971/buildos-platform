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
	} from '$lib/icons/lucide';
	import type { CreatedEntityRef } from './agent-chat.types';

	let { entities }: { entities: CreatedEntityRef[] } = $props();
	const projects = $derived(entities.filter((entity) => entity.kind === 'project'));
	const detailEntities = $derived(entities.filter((entity) => entity.kind !== 'project'));

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

{#each projects as project (project.id)}
	{@const related = detailEntities.filter((entity) => entity.projectId === project.id)}
	{@const task = related.find((entity) => entity.kind === 'task')}
	<section
		class="mb-3 min-w-0 rounded-xl border border-accent/30 bg-accent/5 p-4"
		aria-label={`Saved project: ${project.name}`}
	>
		<p class="text-xs font-semibold uppercase tracking-wide text-accent">Project saved</p>
		<h3 class="mt-1 text-base font-semibold text-foreground [overflow-wrap:anywhere]">
			{project.name}
		</h3>
		<p class="mt-2 text-sm text-muted-foreground">
			Open what’s saved, or keep shaping it in this conversation.
		</p>
		{#if related.length}
			<p class="mt-2 text-xs text-muted-foreground">
				Saved in this conversation:
				{['goal', 'task', 'document', 'plan', 'milestone', 'risk']
					.flatMap((kind) => {
						const count = related.filter((entity) => entity.kind === kind).length;
						return count ? [`${count} ${kind}${count === 1 ? '' : 's'}`] : [];
					})
					.join(' · ')}
			</p>
		{/if}
		<div class="mt-3 flex flex-wrap gap-2">
			<a
				href={hrefFor(project)}
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground shadow-ink hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				Open project <ExternalLink class="h-4 w-4 shrink-0" aria-hidden="true" /><span
					class="sr-only">in a new tab</span
				>
			</a>
			{#if task}
				<a
					href={hrefFor(task)}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					title={task.name}
				>
					Open a task <ExternalLink class="h-4 w-4 shrink-0" aria-hidden="true" /><span
						class="sr-only">in a new tab: {task.name}</span
					>
				</a>
			{/if}
		</div>
	</section>
{/each}

{#if detailEntities.length}
	<div class="flex flex-col gap-1.5">
		<div
			class="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
		>
			<Sparkles class="h-3 w-3 text-accent" />
			<span
				>{detailEntities.length === 1
					? 'Created'
					: `Created ${detailEntities.length}`}</span
			>
		</div>

		<div class="flex flex-wrap gap-1.5">
			{#each detailEntities as entity (entity.id)}
				{@const meta = kindMeta[entity.kind] ?? { icon: Sparkles, label: entity.kind }}
				{@const EntityIcon = meta.icon}
				{@const href = hrefFor(entity)}
				{#if href}
					<a
						{href}
						target="_blank"
						rel="noopener noreferrer"
						class="entity-card group inline-flex min-h-11 max-w-full sm:max-w-[15rem] items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-ink pressable hover:border-accent hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
								class="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
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
								class="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
								>{meta.label}</span
							>
						</span>
					</span>
				{/if}
			{/each}
		</div>
	</div>
{/if}

<style>
	/* Reuse the global "just created" entrance so new chips rise in with an ink-bloom. */
	.entity-card {
		animation: entity-just-created 1.6s cubic-bezier(0.22, 1, 0.36, 1);
	}
	@media (prefers-reduced-motion: reduce) {
		.entity-card {
			animation: none;
		}
	}
</style>
