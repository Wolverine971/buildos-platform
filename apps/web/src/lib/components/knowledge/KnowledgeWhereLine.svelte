<!-- apps/web/src/lib/components/knowledge/KnowledgeWhereLine.svelte -->
<!--
	Phones: "where it shows up" as one quiet line under the name, indented to line up with it
	("BuildOS, Cadre · 3 tasks · 2 docs"). Tapping it opens the pills right in the row, edge to
	edge so each strip gets the whole width: projects, tasks and docs, each scrolling sideways.
	Tapping a pill opens that project's references, task or doc.
-->
<script lang="ts">
	import { ChevronRight } from '$lib/icons/lucide';
	import KnowledgeWherePills from './KnowledgeWherePills.svelte';
	import {
		whereSummary,
		type KnowledgeWhere,
		type KnowledgeWhereProject,
		type KnowledgeWhereRecord
	} from './where-types';

	interface Props {
		where: KnowledgeWhere;
		expanded: boolean;
		onToggle: () => void;
		onProject: (project: KnowledgeWhereProject) => void;
		onRecord: (record: KnowledgeWhereRecord) => void;
	}

	let { where, expanded, onToggle, onProject, onRecord }: Props = $props();
	const id = $props.id();
</script>

<div class="min-w-0">
	<button
		type="button"
		class="flex min-h-7 w-full min-w-0 items-center gap-1 pl-[5.75rem] pr-3 text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-expanded={expanded}
		aria-controls="{id}-where"
		onclick={onToggle}
	>
		<ChevronRight
			class="h-3 w-3 shrink-0 transition-transform duration-150 motion-reduce:transition-none {expanded
				? 'rotate-90'
				: ''}"
			aria-hidden="true"
		/>
		<span class="truncate">{whereSummary(where)}</span>
	</button>
	{#if expanded}
		<div id="{id}-where" class="mt-1.5 flex flex-col gap-1.5 px-3 pb-1">
			{#if where.projects.length}
				<KnowledgeWherePills
					group="projects"
					items={where.projects}
					onPick={onProject}
					label="Projects"
				/>
			{/if}
			{#if where.tasks.length}
				<KnowledgeWherePills
					group="tasks"
					items={where.tasks}
					onPick={onRecord}
					label="Tasks"
				/>
			{/if}
			{#if where.documents.length}
				<KnowledgeWherePills
					group="documents"
					items={where.documents}
					onPick={onRecord}
					label="Docs"
				/>
			{/if}
		</div>
	{/if}
</div>
