<!-- apps/web/src/lib/components/builder-profile/editor/ProjectsPanel.svelte -->
<!-- Your page > Projects. The projects on your page, in page order (drag to reorder);
     open one to edit how it shows. "Add a project" searches the ones you own that aren't
     on the page yet. Every project starts hidden; raw task titles never show. -->
<script lang="ts">
	import { tick } from 'svelte';
	import { ChevronRight, GripVertical, Plus, Search, X } from '$lib/icons/lucide';
	import PanelHead from './PanelHead.svelte';
	import ProjectDetail from './ProjectDetail.svelte';
	import { dragHandle } from './drag-reorder';
	import { iconButtonClass, inputClass, textButtonClass } from './editor-styles';
	import { LIMITS, projectActivityLine, sharedWithCount } from './builder-editor';
	import type { BuilderPageEditorState } from './builder-editor-state.svelte';

	let { editor }: { editor: BuilderPageEditorState } = $props();

	let picking = $state(false);
	let query = $state('');
	let searchInput = $state<HTMLInputElement | null>(null);

	const placed = $derived(editor.placedRows);
	const atLimit = $derived(placed.length >= LIMITS.projects);
	const openRow = $derived(
		editor.openProjectId
			? (editor.rows.find((r) => r.project.project_id === editor.openProjectId) ?? null)
			: null
	);
	const matches = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const hidden = editor.hiddenRows;
		return q ? hidden.filter((row) => row.project.name.toLowerCase().includes(q)) : hidden;
	});

	async function startPicking() {
		picking = true;
		query = '';
		await tick();
		searchInput?.focus();
	}

	function add(projectId: string) {
		if (editor.addProject(projectId)) picking = false;
	}

	const rowClass =
		'rounded-xl border border-border bg-card transition-shadow data-[dragging=true]:relative data-[dragging=true]:z-10 data-[dragging=true]:border-accent data-[dragging=true]:shadow-ink-strong motion-reduce:transition-none';
</script>

{#if openRow}
	<ProjectDetail {editor} row={openRow} />
{:else}
	<PanelHead
		title="Projects"
		hint="Listed shows a card. Live adds goals, weekly activity, and lets people follow or ask to join."
	/>

	<div class="space-y-3">
		{#if placed.length}
			<ul class="grid gap-2">
				{#each placed as row, index (row.project.project_id)}
					{@const name = row.public_name.trim() || row.project.name}
					{@const live = row.level === 'live'}
					<li data-reorder-item class={rowClass}>
						<div class="flex items-center gap-1 p-1">
							<button
								type="button"
								class="inline-flex h-11 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
								aria-label="Move {name}. Drag, or use the arrow keys."
								use:dragHandle={{
									index,
									onmove: (from, to) => editor.movePlaced(from, to)
								}}
							>
								<GripVertical class="h-4 w-4" aria-hidden="true" />
							</button>
							<button
								type="button"
								class="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-md px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onclick={() => editor.open('projects', row.project.project_id)}
							>
								<span
									class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-base leading-none"
									aria-hidden="true"
									>{row.project.glyphs.join('') ||
										name.slice(0, 1).toUpperCase()}</span
								>
								<span class="grid min-w-0 flex-1">
									<span class="flex min-w-0 items-center gap-2">
										<span class="truncate text-sm font-semibold text-foreground"
											>{name}</span
										>
										<span
											class="shrink-0 rounded-full border px-1.5 py-px font-mono text-2xs uppercase {live
												? 'border-success/60 text-success'
												: 'border-border-strong text-muted-foreground'}"
											>{live ? 'Live' : 'Listed'}</span
										>
										{#if row.audience === 'collaborators'}
											<span class="shrink-0 text-2xs text-info"
												>people I work with</span
											>
										{/if}
									</span>
									<span
										class="truncate text-xs {row.pitch.trim()
											? 'text-muted-foreground'
											: 'text-warning'}"
										>{row.pitch.trim() ||
											'Add a pitch so strangers get it'}</span
									>
								</span>
								<ChevronRight
									class="h-4 w-4 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<div class="rounded-xl border border-dashed border-border-strong px-4 py-5 text-center">
				<p class="text-sm font-medium text-foreground">Nothing on your page yet</p>
				<p class="mt-1 text-sm text-muted-foreground">
					Add the projects you want people to see.
				</p>
			</div>
		{/if}

		{#if picking}
			<div class="rounded-xl border border-border-strong bg-card shadow-ink">
				<div class="flex items-center gap-2 border-b border-border p-2">
					<Search
						class="ml-1.5 h-4 w-4 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
					<label for="project-search" class="sr-only">Find a project</label>
					<input
						id="project-search"
						bind:this={searchInput}
						bind:value={query}
						placeholder="Find a project"
						autocomplete="off"
						class="{inputClass} min-h-10 border-0 bg-transparent px-1 focus:ring-0"
						onkeydown={(event) => {
							if (event.key === 'Escape') picking = false;
						}}
					/>
					<button
						type="button"
						class={iconButtonClass}
						aria-label="Close"
						onclick={() => (picking = false)}
					>
						<X class="h-4 w-4" aria-hidden="true" />
					</button>
				</div>
				{#if matches.length}
					<ul class="max-h-80 overflow-y-auto p-1">
						{#each matches as row (row.project.project_id)}
							{@const shared = sharedWithCount(row.project)}
							<li>
								<button
									type="button"
									class="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
									disabled={atLimit}
									onclick={() => add(row.project.project_id)}
								>
									<span
										class="w-7 shrink-0 text-center text-lg leading-none"
										aria-hidden="true"
										>{row.project.glyphs.join('') || '·'}</span
									>
									<span class="grid min-w-0 flex-1">
										<span class="truncate text-sm font-medium text-foreground"
											>{row.project.name}</span
										>
										<span class="truncate text-xs text-muted-foreground"
											>{projectActivityLine(row.project)}{shared
												? ` · shared with ${shared}`
												: ''}</span
										>
									</span>
									<Plus class="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="px-4 py-5 text-center text-sm text-muted-foreground">
						{editor.hiddenRows.length
							? 'No project by that name.'
							: 'Every project you own is on your page.'}
					</p>
				{/if}
			</div>
		{:else if editor.hiddenRows.length}
			<button type="button" class={textButtonClass} disabled={atLimit} onclick={startPicking}>
				<Plus class="h-4 w-4" aria-hidden="true" />Add a project
			</button>
		{/if}

		{#if atLimit}
			<p class="text-xs text-muted-foreground">
				Your page holds up to {LIMITS.projects} projects.
			</p>
		{/if}
		{#if editor.rows.length === 0}
			<p class="text-sm text-muted-foreground">
				You don't own any projects yet. Projects you start show up here, hidden until you
				add them.
			</p>
		{/if}
		{#if editor.projectsError}
			<p class="text-sm text-destructive" role="alert">{editor.projectsError}</p>
		{/if}
	</div>
{/if}
