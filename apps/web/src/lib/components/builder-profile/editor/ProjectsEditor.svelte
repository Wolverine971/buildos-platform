<!-- apps/web/src/lib/components/builder-profile/editor/ProjectsEditor.svelte -->
<!-- Your page > Projects: every project you own. The ones on your page sit on top in
     page order; the rest stay hidden. "Save projects" puts the placed ones, in order. -->
<script lang="ts">
	import { tick } from 'svelte';
	import EditorGroup from './EditorGroup.svelte';
	import ProjectRow from './ProjectRow.svelte';
	import SaveBar from './SaveBar.svelte';
	import { textButtonClass } from './editor-styles';
	import { LIMITS, isPlaced, type EditorLevel } from './builder-editor';
	import type { BuilderPageEditorState } from './builder-editor-state.svelte';

	let { editor }: { editor: BuilderPageEditorState } = $props();

	const HIDDEN_PREVIEW = 8;

	let expanded = $state<Record<string, boolean>>({});
	let showAllHidden = $state(false);

	const placed = $derived(editor.rows.filter(isPlaced));
	const hidden = $derived(editor.rows.filter((row) => !isPlaced(row)));
	const shownHidden = $derived(showAllHidden ? hidden : hidden.slice(0, HIDDEN_PREVIEW));
	const atLimit = $derived(placed.length >= LIMITS.projects);

	async function changeLevel(projectId: string, level: EditorLevel) {
		const wasPlaced = placed.some((row) => row.project.project_id === projectId);
		editor.setLevel(projectId, level);
		const nowPlaced = level !== 'hidden';
		if (!wasPlaced && nowPlaced) expanded = { ...expanded, [projectId]: true };
		if (wasPlaced !== nowPlaced) {
			// The row moved between groups; keep focus on the button that moved it.
			await tick();
			document.getElementById(`project-level-${projectId}-${level}`)?.focus();
		}
	}

	function toggle(projectId: string) {
		expanded = { ...expanded, [projectId]: !expanded[projectId] };
	}
</script>

<EditorGroup
	id="your-page-projects"
	title="Projects"
	hint="Every project starts hidden. Raw task titles never appear on your page."
>
	<p class="text-sm text-muted-foreground">
		<span class="font-medium text-foreground">Listed</span> shows the name, a one-line pitch and
		the stage. <span class="font-medium text-foreground">Live</span> adds goals you pick, the
		next milestone, weekly activity, a line about this week, and lets people follow or ask to
		join.
	</p>

	{#if editor.rows.length === 0}
		<p class="rounded-lg border border-dashed border-border-strong px-3 py-4 text-sm text-muted-foreground">
			You don't own any projects yet. Projects you start show up here, hidden until you pick
			them.
		</p>
	{:else}
		<div class="space-y-2">
			<p class="micro-label">On your page · {placed.length}</p>
			{#if placed.length === 0}
				<p class="rounded-lg border border-dashed border-border-strong px-3 py-3 text-sm text-muted-foreground">
					Nothing on your page yet. Pick Listed or Live on a project below.
				</p>
			{:else}
				<ul class="space-y-2">
					{#each placed as row, index (row.project.project_id)}
						<ProjectRow
							{editor}
							{row}
							placedIndex={index}
							placedTotal={placed.length}
							expanded={!!expanded[row.project.project_id]}
							{atLimit}
							ontoggle={() => toggle(row.project.project_id)}
							onlevel={(level) => changeLevel(row.project.project_id, level)}
						/>
					{/each}
				</ul>
			{/if}
		</div>

		{#if hidden.length}
			<div class="space-y-2">
				<p class="micro-label">Hidden · {hidden.length}</p>
				<ul class="space-y-2">
					{#each shownHidden as row (row.project.project_id)}
						<ProjectRow
							{editor}
							{row}
							{atLimit}
							ontoggle={() => toggle(row.project.project_id)}
							onlevel={(level) => changeLevel(row.project.project_id, level)}
						/>
					{/each}
				</ul>
				{#if hidden.length > HIDDEN_PREVIEW}
					<button
						type="button"
						class={textButtonClass}
						aria-expanded={showAllHidden}
						onclick={() => (showAllHidden = !showAllHidden)}
					>
						{showAllHidden
							? 'Show fewer'
							: `Show ${hidden.length - HIDDEN_PREVIEW} more hidden project${hidden.length - HIDDEN_PREVIEW === 1 ? '' : 's'}`}
					</button>
				{/if}
			</div>
		{/if}
	{/if}

	<SaveBar
		label="Save projects"
		dirty={editor.projectsDirty}
		busy={editor.projectsBusy}
		saved={editor.projectsJustSaved}
		error={editor.projectsError}
		note={atLimit ? `Your page holds up to ${LIMITS.projects} projects.` : ''}
		onsave={() => editor.saveProjects()}
	/>
</EditorGroup>
