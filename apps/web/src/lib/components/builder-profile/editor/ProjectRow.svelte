<!-- apps/web/src/lib/components/builder-profile/editor/ProjectRow.svelte -->
<!-- One owned project in Your page > Projects: glyphs, name, what's happened in it this
     year, a warning when others share it, and Hidden / Listed / Live. A project on the
     page opens to edit its public name, pitch, link and audience; Live adds goals, the
     next milestone, "Looking for" and "This week". -->
<script lang="ts">
	import { ArrowDown, ArrowUp, ChevronDown, TriangleAlert } from '$lib/icons/lucide';
	import { shortDate } from '$lib/builder-profile/format';
	import AudienceSelect from './AudienceSelect.svelte';
	import EditorField from './EditorField.svelte';
	import Segmented from './Segmented.svelte';
	import { iconButtonClass } from './editor-styles';
	import {
		LIMITS,
		projectActivityLine,
		sharedWithLabel,
		type EditorLevel,
		type EditorProjectRow
	} from './builder-editor';
	import type { BuilderPageEditorState } from './builder-editor-state.svelte';

	let {
		editor,
		row,
		placedIndex = -1,
		placedTotal = 0,
		expanded = false,
		atLimit = false,
		ontoggle,
		onlevel
	}: {
		editor: BuilderPageEditorState;
		/** Read-only here; edits go through editor.patchRow so the editor owns the rows. */
		row: EditorProjectRow;
		/** Position among the projects on the page, or -1 when hidden. */
		placedIndex?: number;
		placedTotal?: number;
		expanded?: boolean;
		/** The page already holds the most projects it can. */
		atLimit?: boolean;
		ontoggle: () => void;
		onlevel: (level: EditorLevel) => void;
	} = $props();

	let linkTouched = $state(false);
	const project = $derived(row.project);
	const id = $derived(project.project_id);
	const placed = $derived(row.level !== 'hidden');
	const shared = $derived(sharedWithLabel(project));
	const shownName = $derived(row.public_name.trim() || project.name);
	const linkError = $derived(
		editor.projectsAttempted || linkTouched ? (editor.projectErrors[id] ?? null) : null
	);
	const goalsFull = $derived(row.goal_ids.length >= LIMITS.goals);
	const milestoneDate = $derived(shortDate(project.next_milestone?.due_at));

	const levelOptions = $derived<{ value: EditorLevel; label: string; disabled?: boolean; title?: string }[]>([
		{ value: 'hidden', label: 'Hidden' },
		{
			value: 'listed',
			label: 'Listed',
			disabled: !placed && atLimit,
			title: !placed && atLimit ? `Your page holds up to ${LIMITS.projects} projects` : undefined
		},
		{
			value: 'live',
			label: 'Live',
			disabled: !placed && atLimit,
			title: !placed && atLimit ? `Your page holds up to ${LIMITS.projects} projects` : undefined
		}
	]);
</script>

<li class="rounded-lg border bg-background {placed ? 'border-border-strong' : 'border-border'}">
	<div class="flex flex-wrap items-start gap-x-3 gap-y-2 p-3">
		<span class="mt-0.5 w-7 shrink-0 text-center text-lg leading-6" aria-hidden="true"
			>{project.glyphs.join('') || '·'}</span
		>
		<div class="min-w-0 flex-1 basis-48">
			<p class="truncate text-sm font-semibold text-foreground">{project.name}</p>
			<p class="text-xs text-muted-foreground">{projectActivityLine(project)}</p>
			{#if shared}
				<p class="mt-0.5 flex items-start gap-1 text-xs text-warning">
					<TriangleAlert class="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span>{shared}</span>
				</p>
			{/if}
		</div>
		<Segmented
			options={levelOptions}
			value={row.level}
			label="Show {project.name} on your page"
			idPrefix="project-level-{id}"
			onchange={onlevel}
		/>
	</div>

	{#if placed}
		<div class="flex items-center justify-between gap-2 border-t border-border px-1.5 py-0.5">
			<button
				type="button"
				class="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-expanded={expanded}
				aria-controls="project-details-{id}"
				onclick={ontoggle}
			>
				<ChevronDown
					class="h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none {expanded
						? 'rotate-180'
						: ''}"
					aria-hidden="true"
				/>
				<span class="min-w-0 truncate text-sm">
					<span class="font-medium text-foreground">{shownName}</span>
					<span class="text-muted-foreground">
						· {row.pitch.trim() || 'No pitch yet'}{row.audience === 'collaborators'
							? ' · people I work with'
							: ''}</span
					>
				</span>
				<span class="sr-only">{expanded ? 'Hide details' : 'Edit details'}</span>
			</button>
			<div class="flex shrink-0 items-center">
				<button
					type="button"
					class={iconButtonClass}
					aria-label="Move {shownName} up"
					disabled={placedIndex <= 0}
					onclick={() => editor.moveProject(id, -1)}
				>
					<ArrowUp class="h-4 w-4" aria-hidden="true" />
				</button>
				<button
					type="button"
					class={iconButtonClass}
					aria-label="Move {shownName} down"
					disabled={placedIndex < 0 || placedIndex >= placedTotal - 1}
					onclick={() => editor.moveProject(id, 1)}
				>
					<ArrowDown class="h-4 w-4" aria-hidden="true" />
				</button>
			</div>
		</div>

		{#if expanded}
			<div id="project-details-{id}" class="space-y-4 border-t border-border p-3">
				<div class="grid gap-4 sm:grid-cols-2">
					<EditorField
						id="project-name-{id}"
						label="Public name"
						bind:value={() => row.public_name, (v: string) => editor.patchRow(id, { public_name: v })}
						max={LIMITS.public_name}
						placeholder={project.name}
						hint={shared
							? 'Others are in this project. Use a name that’s fine to show.'
							: 'Leave empty to use the project’s name.'}
					/>
					<AudienceSelect
						id="project-audience-{id}"
						value={row.audience}
						label="Who sees this project"
						visibleLabel
						onchange={(audience) => editor.patchRow(id, { audience })}
					/>
				</div>
				<EditorField
					id="project-pitch-{id}"
					label="Pitch"
					bind:value={() => row.pitch, (v: string) => editor.patchRow(id, { pitch: v })}
					max={LIMITS.pitch}
					multiline
					rows={2}
					placeholder="One line on what it's for, so a stranger gets it."
				/>
				<div class="space-y-1.5">
					<EditorField
						id="project-link-{id}"
						label="Project link"
						type="url"
						inputmode="url"
						bind:value={() => row.link_url, (v: string) => editor.patchRow(id, { link_url: v })}
						placeholder="example.com"
						error={linkError}
						onblur={() => (linkTouched = true)}
					/>
				</div>

				{#if row.level === 'live'}
					<fieldset class="space-y-1">
						<legend class="text-sm font-medium text-foreground">
							Goals to show <span class="font-normal text-muted-foreground"
								>(up to {LIMITS.goals})</span
							>
						</legend>
						{#if project.goals.length === 0}
							<p class="text-xs text-muted-foreground">This project has no goals yet.</p>
						{:else}
							{#each project.goals as goal (goal.id)}
								{@const checked = row.goal_ids.includes(goal.id)}
								<label
									class="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 text-sm text-foreground hover:bg-muted/50 {goalsFull &&
									!checked
										? 'cursor-not-allowed opacity-50'
										: ''}"
								>
									<input
										type="checkbox"
										class="h-4 w-4 shrink-0 rounded border-border-strong accent-accent focus-visible:ring-2 focus-visible:ring-ring"
										{checked}
										disabled={goalsFull && !checked}
										onchange={() => editor.toggleGoal(id, goal.id)}
									/>
									<span class="min-w-0">{goal.name}</span>
								</label>
							{/each}
						{/if}
					</fieldset>

					<label class="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-1 py-2 hover:bg-muted/50">
						<input
							type="checkbox"
							class="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-accent focus-visible:ring-2 focus-visible:ring-ring"
							bind:checked={() => row.show_next_milestone, (v: boolean) => editor.patchRow(id, { show_next_milestone: v })}
						/>
						<span class="min-w-0 text-sm">
							<span class="font-medium text-foreground">Show next milestone</span>
							<span class="block text-xs text-muted-foreground">
								{#if project.next_milestone}
									{project.next_milestone.title}{milestoneDate ? ` · ${milestoneDate}` : ''}
								{:else}
									No upcoming milestone with a date.
								{/if}
							</span>
						</span>
					</label>

					<EditorField
						id="project-looking-{id}"
						label="Looking for"
						bind:value={() => row.looking_for, (v: string) => editor.patchRow(id, { looking_for: v })}
						max={LIMITS.looking_for}
						placeholder="Five people for a free beta session"
						hint="Shown with an Ask to join button."
					/>
					<EditorField
						id="project-week-{id}"
						label="This week"
						bind:value={() => row.this_week, (v: string) => editor.patchRow(id, { this_week: v })}
						max={LIMITS.this_week}
						multiline
						rows={2}
						placeholder="What moved this week, in a line."
						hint="A new line also goes to your followers' daily brief when you save."
					/>
				{/if}
			</div>
		{/if}
	{/if}
</li>
