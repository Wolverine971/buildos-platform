<!-- apps/web/src/lib/components/builder-profile/editor/ProjectDetail.svelte -->
<!-- One project on your page: Listed or Live, the public name, pitch, link and who sees
     it. Live adds the goals to show, the next milestone, "Looking for" with where
     "I'm interested" goes, and "This week", and gets its own page. Changes save a
     moment after you stop typing. -->
<script lang="ts">
	import { ArrowLeft, ArrowUpRight, Trash2, TriangleAlert } from '$lib/icons/lucide';
	import {
		isEmailReply,
		normalizeReplyUrl,
		projectPaths
	} from '$lib/builder-profile/project-pages';
	import type { BuilderAudience, BuilderProjectLevel } from '$lib/builder-profile/types';
	import { shortDate } from '$lib/builder-profile/format';
	import EditorField from './EditorField.svelte';
	import Segmented from './Segmented.svelte';
	import ToggleRow from './ToggleRow.svelte';
	import { textButtonClass } from './editor-styles';
	import {
		LIMITS,
		projectActivityLine,
		sharedWithCount,
		suggestProjectLink,
		type EditorProjectRow
	} from './builder-editor';
	import type { BuilderPageEditorState } from './builder-editor-state.svelte';

	let { editor, row }: { editor: BuilderPageEditorState; row: EditorProjectRow } = $props();

	let linkTouched = $state(false);
	let replyTouched = $state(false);
	const project = $derived(row.project);
	const id = $derived(project.project_id);
	const live = $derived(row.level === 'live');
	const shared = $derived(sharedWithCount(project));
	const linkError = $derived(linkTouched ? (editor.projectErrors[id] ?? null) : null);
	const goalsFull = $derived(row.goal_ids.length >= LIMITS.goals);
	const milestoneDate = $derived(shortDate(project.next_milestone?.due_at));
	const replyError = $derived(replyTouched ? (editor.replyErrors[id] ?? null) : null);
	const replyIsEmail = $derived(isEmailReply(normalizeReplyUrl(row.reply_url)));
	const suggestedLink = $derived(suggestProjectLink(row, editor.links));
	// The project's own page, once what's on screen is saved (a renamed project moves).
	const pagePath = $derived.by(() => {
		if (!live || !editor.handle || editor.projectsDirty) return null;
		const cards = editor.placedRows.map((r) => ({
			id: r.project.project_id,
			name: r.public_name.trim() || r.project.name,
			level: r.level === 'live' ? ('live' as const) : ('listed' as const)
		}));
		return projectPaths(editor.handle, cards).get(id) ?? null;
	});

	const levels: { value: BuilderProjectLevel; label: string }[] = [
		{ value: 'listed', label: 'Listed' },
		{ value: 'live', label: 'Live' }
	];
	const audiences: { value: BuilderAudience; label: string }[] = [
		{ value: 'anyone', label: 'Anyone' },
		{ value: 'collaborators', label: 'People I work with' }
	];
</script>

<div class="mb-4">
	<button
		type="button"
		class="{textButtonClass} -ml-2 text-foreground"
		onclick={() => editor.open('projects')}
	>
		<ArrowLeft class="h-4 w-4" aria-hidden="true" />All projects
	</button>
</div>

<div class="mb-5 flex items-center gap-3">
	<span
		class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-xl leading-none"
		aria-hidden="true">{project.glyphs.join('') || project.name.slice(0, 1).toUpperCase()}</span
	>
	<div class="min-w-0">
		<h2 class="truncate text-lg font-semibold tracking-tight text-foreground">
			{project.name}
		</h2>
		<p class="truncate text-xs text-muted-foreground">{projectActivityLine(project)}</p>
	</div>
	{#if pagePath}
		<a
			href={pagePath}
			target="_blank"
			rel="noopener"
			class="{textButtonClass} ml-auto shrink-0 text-accent"
			>Open page<ArrowUpRight class="h-3.5 w-3.5" aria-hidden="true" /></a
		>
	{/if}
</div>

<div class="grid gap-5">
	{#if shared}
		<p
			class="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-foreground"
		>
			<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
			<span>
				{shared}
				{shared === 1 ? 'other person is' : 'other people are'} in this project. Use a public
				name that's fine to show.
			</span>
		</p>
	{/if}

	<div class="space-y-2">
		<p id="level-{id}" class="text-sm font-medium text-foreground">Shows as</p>
		<Segmented
			options={levels}
			value={row.level === 'live' ? 'live' : 'listed'}
			label="Shows as"
			class="w-full [&>button]:flex-1"
			onchange={(level) => editor.setLevel(id, level)}
		/>
		<p class="text-xs text-muted-foreground">
			{live
				? 'Its own page with goals, updates and a year of activity, plus Follow and Ask to join.'
				: 'Name, pitch, stage and when it was last active. Opens its link, if it has one.'}
		</p>
	</div>

	<EditorField
		id="project-name-{id}"
		label="Public name"
		bind:value={() => row.public_name, (v: string) => editor.patchRow(id, { public_name: v })}
		max={LIMITS.public_name}
		placeholder={project.name}
		hint="Leave empty to use the project's name."
	/>
	<EditorField
		id="project-pitch-{id}"
		label="Pitch"
		bind:value={() => row.pitch, (v: string) => editor.patchRow(id, { pitch: v })}
		max={LIMITS.pitch}
		multiline
		rows={2}
		placeholder="One line on what it's for, so a stranger gets it."
	/>
	<EditorField
		id="project-link-{id}"
		label="Link (optional)"
		type="url"
		inputmode="url"
		bind:value={() => row.link_url, (v: string) => editor.patchRow(id, { link_url: v })}
		placeholder="example.com"
		error={linkError}
		onblur={() => (linkTouched = true)}
	/>
	{#if suggestedLink}
		<div class="-mt-3">
			<button
				type="button"
				class="inline-flex min-h-8 items-center rounded-full border border-dashed border-border-strong px-3 text-xs font-medium text-foreground hover:bg-muted"
				onclick={() =>
					editor.patchRow(id, { link_url: suggestedLink.replace(/^https:\/\//, '') })}
				>Use {suggestedLink.replace(/^https?:\/\//, '').replace(/\/$/, '')}</button
			>
		</div>
	{/if}
	<div class="space-y-2">
		<p class="text-sm font-medium text-foreground">Who sees it</p>
		<Segmented
			options={audiences}
			value={row.audience}
			label="Who sees this project"
			class="w-full [&>button]:flex-1"
			onchange={(audience) => editor.patchRow(id, { audience })}
		/>
	</div>

	{#if live}
		<div class="grid gap-5 rounded-xl border border-border bg-card p-4">
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

			<ToggleRow
				id="project-milestone-{id}"
				label="Show next milestone"
				hint={project.next_milestone
					? `${project.next_milestone.title}${milestoneDate ? ` · ${milestoneDate}` : ''}`
					: 'No upcoming milestone with a date.'}
				checked={row.show_next_milestone}
				onchange={(next) => editor.patchRow(id, { show_next_milestone: next })}
			/>

			<EditorField
				id="project-looking-{id}"
				label="Looking for"
				bind:value={
					() => row.looking_for, (v: string) => editor.patchRow(id, { looking_for: v })
				}
				max={LIMITS.looking_for}
				placeholder="Five people for a free beta session"
			/>
			<EditorField
				id="project-reply-{id}"
				label="Where “I’m interested” goes"
				bind:value={
					() => row.reply_url, (v: string) => editor.patchRow(id, { reply_url: v })
				}
				placeholder="A sign-up form, Calendly link or email"
				error={replyError}
				onblur={() => (replyTouched = true)}
				hint={replyIsEmail
					? 'Your email address will show on your page as a link.'
					: row.reply_url.trim()
						? 'Visitors who tap “I’m interested” go here.'
						: 'Leave empty to hide the button.'}
			/>
			<EditorField
				id="project-week-{id}"
				label="This week"
				bind:value={
					() => row.this_week, (v: string) => editor.patchRow(id, { this_week: v })
				}
				max={LIMITS.this_week}
				multiline
				rows={2}
				placeholder="What moved this week, in a line."
				hint="A new line also reaches your followers' daily brief."
			/>
		</div>
	{/if}

	<div class="border-t border-border pt-4">
		<button
			type="button"
			class="{textButtonClass} -ml-2 text-destructive hover:bg-destructive/10"
			onclick={() => editor.removeProject(id)}
		>
			<Trash2 class="h-4 w-4" aria-hidden="true" />Remove from page
		</button>
	</div>
</div>
