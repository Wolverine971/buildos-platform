<!-- apps/web/src/lib/components/agent/ContextSelectionChips.svelte -->
<!--
	"Working from": the project records Jev ranked for this message, shown under the user's
	message before the answer. Solid chips were selected in full (their best sections for
	documents); dashed chips were summaries only. A tick means the model's tools read it.
	Global chat adds a "Looking in" row first: the projects Jev judged the message to be about,
	each with a button that continues the chat inside that project.
	Specs: docs/architecture/JEV_CONTEXT_RANKER_2026-09-22.md,
	docs/architecture/JEV_GLOBAL_CONTEXT_2026-09-23.md.
-->
<script lang="ts">
	import type { ContextSelectionChipV1, ContextSelectionEventV1 } from '@buildos/shared-types';
	import {
		ArrowRight,
		Check,
		ChevronDown,
		ChevronUp,
		FileText,
		FolderOpen,
		ListTodo,
		Map as MapIcon,
		Milestone,
		Target,
		TriangleAlert
	} from '$lib/icons/lucide';
	import {
		COLLAPSED_CHIP_COUNT,
		chipHref,
		orderedChips,
		projectHref,
		projectsLabel
	} from './context-selection-chips';

	let {
		selection,
		readIds = new Set<string>(),
		onContinueInProject
	}: {
		selection: ContextSelectionEventV1;
		readIds?: ReadonlySet<string>;
		/** Global chat only: move this conversation into the project's focus. */
		onContinueInProject?: (project: { id: string; name: string }) => void;
	} = $props();

	let expanded = $state(false);

	const chips = $derived(orderedChips(selection));
	const shown = $derived(expanded ? chips : chips.slice(0, COLLAPSED_CHIP_COUNT));
	const hidden = $derived(chips.length - shown.length);
	const panelId = $derived(`context-selection-${selection.turn_run_id}`);

	const ICONS = {
		document: FileText,
		task: ListTodo,
		goal: Target,
		plan: MapIcon,
		milestone: Milestone,
		risk: TriangleAlert
	} as const;

	const isRead = (chip: ContextSelectionChipV1) => readIds.has(chip.id.toLowerCase());
	const percent = (p: number | null) => (p === null ? '' : `${Math.round(p * 100)}%`);
	const describe = (chip: ContextSelectionChipV1) =>
		[
			`${chip.kind}: ${chip.label}`,
			chip.tier === 'full' ? 'selected in full' : 'summary only',
			chip.sections.length ? `sections: ${chip.sections.join(', ')}` : '',
			chip.p !== null ? `relevance ${percent(chip.p)}` : '',
			isRead(chip) ? 'read by the model' : ''
		]
			.filter(Boolean)
			.join(' · ');
</script>

<div class="w-full max-w-[88%] space-y-1 sm:max-w-[85%]" data-testid="context-selection-chips">
	{#if selection.status === 'selected' && selection.projects.length > 0}
		<div
			class="flex flex-wrap items-center justify-end gap-1"
			aria-label="Projects this message is about"
			data-testid="context-selection-projects"
		>
			<span class="mr-0.5 text-2xs font-medium text-muted-foreground"
				>{projectsLabel(selection)}</span
			>
			{#each selection.projects as project (project.id)}
				<span
					class="inline-flex max-w-[18rem] items-center overflow-hidden rounded-full border border-accent/40 bg-accent/10 text-2xs leading-4 text-foreground"
				>
					<a
						href={projectHref(project.id)}
						title={`${project.name}${project.p !== null ? ` · relevance ${percent(project.p)}` : ''}`}
						class="inline-flex min-w-0 items-center gap-1 py-0.5 pl-2 pr-1.5 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
					>
						<FolderOpen class="h-3 w-3 shrink-0" aria-hidden="true" />
						<span class="truncate">{project.name}</span>
					</a>
					{#if onContinueInProject}
						<button
							type="button"
							class="inline-flex min-h-6 items-center self-stretch border-l border-accent/30 px-1.5 text-muted-foreground hover:bg-accent/15 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
							title={`Continue this chat in ${project.name}`}
							aria-label={`Continue this chat in ${project.name}`}
							onclick={() =>
								onContinueInProject({ id: project.id, name: project.name })}
						>
							<ArrowRight class="h-3 w-3" aria-hidden="true" />
						</button>
					{/if}
				</span>
			{/each}
		</div>
	{/if}
	{#if selection.status === 'selected' && chips.length > 0}
		<div
			class="flex flex-wrap items-center justify-end gap-1"
			id={panelId}
			aria-label="Project context for this message"
		>
			<span class="mr-0.5 text-2xs font-medium text-muted-foreground">Working from</span>
			{#each shown as chip (chip.id)}
				{@const Icon = ICONS[chip.kind]}
				{@const href = chipHref(chip, selection.project_id)}
				<svelte:element
					this={href ? 'a' : 'span'}
					{href}
					title={describe(chip)}
					aria-label={describe(chip)}
					class="inline-flex max-w-[16rem] items-center gap-1 rounded-full border px-2 py-0.5 text-2xs leading-4 transition-colors {chip.tier ===
					'full'
						? 'border-accent/40 bg-accent/10 text-foreground'
						: 'border-dashed border-border bg-transparent text-muted-foreground'} {href
						? 'hover:border-accent/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent'
						: ''}"
				>
					<Icon class="h-3 w-3 shrink-0" aria-hidden="true" />
					<span class="truncate">{chip.label}</span>
					{#if chip.tier === 'full' && chip.sections[0]}
						<span class="hidden truncate text-muted-foreground sm:inline"
							>› {chip.sections[0]}</span
						>
					{/if}
					{#if isRead(chip)}
						<Check class="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
					{/if}
				</svelte:element>
			{/each}
			{#if chips.length > COLLAPSED_CHIP_COUNT}
				<button
					type="button"
					class="inline-flex min-h-6 items-center gap-0.5 rounded-full px-1.5 text-2xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
					aria-expanded={expanded}
					aria-controls={panelId}
					onclick={() => (expanded = !expanded)}
				>
					{#if expanded}
						Less <ChevronUp class="h-3 w-3" aria-hidden="true" />
					{:else}
						+{hidden} more · {selection.counts.checked} checked
						<ChevronDown class="h-3 w-3" aria-hidden="true" />
					{/if}
				</button>
			{/if}
		</div>
		{#if expanded}
			<ul class="mt-1.5 space-y-0.5 text-right text-2xs text-muted-foreground">
				{#each chips.filter((chip) => chip.tier === 'full' && chip.sections.length) as chip (chip.id)}
					<li class="truncate">
						<span class="text-foreground">{chip.label}</span> › {chip.sections.join(
							' · '
						)}
						<span class="tabular-nums">· {percent(chip.p)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if selection.status === 'unavailable'}
		<p class="text-right text-2xs text-muted-foreground" role="status">
			{selection.workspace || !selection.project_id
				? 'Working from the usual context (project matching unavailable)'
				: 'Working from the usual project context (relevance ranking unavailable)'}
		</p>
	{:else if selection.status === 'empty' && selection.workspace}
		<p class="text-right text-2xs text-muted-foreground" role="status">
			Checked {selection.workspace.checked} projects · none clearly matches
		</p>
	{/if}
</div>
