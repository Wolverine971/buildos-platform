<!-- apps/web/src/lib/components/builder-profile/editor/WeeklyUpdateEditor.svelte -->
<!-- Your page > Weekly update: BuildOS drafts your Now line and a "this week" line per
     Live project from what moved; you edit, publish or skip each. Published lines land
     on your page and in your followers' daily brief. -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import EditorGroup from './EditorGroup.svelte';
	import ToggleRow from './ToggleRow.svelte';
	import { inputClass } from './editor-styles';
	import { isPlaced } from './builder-editor';
	import type { BuilderPageEditorState } from './builder-editor-state.svelte';

	let { editor }: { editor: BuilderPageEditorState } = $props();

	const hasSavedProjects = $derived(editor.savedRows.some(isPlaced));
	const anyDraftBusy = $derived(Object.keys(editor.draftBusy).length > 0);
</script>

<EditorGroup
	id="your-page-weekly"
	title="Weekly update"
	hint="Published lines show on your page and in your followers' daily brief."
>
	<ToggleRow
		id="your-page-weekly-drafts"
		label="Draft my weekly update every Friday"
		hint="BuildOS drafts your Now line and a line for each Live project from what moved that week. Nothing goes out until you publish it."
		checked={editor.settings.weekly_drafts}
		busy={!!editor.toggleBusy.weekly_drafts}
		error={editor.toggleError?.key === 'weekly_drafts' ? editor.toggleError.message : null}
		onchange={(next) => editor.setToggle('weekly_drafts', next)}
	/>

	{#if editor.drafts.length}
		<div class="space-y-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="micro-label">Waiting for you · {editor.drafts.length}</p>
				<Button
					variant="secondary"
					size="sm"
					loading={editor.weeklyBusy === 'publish_all'}
					disabled={editor.weeklyBusy !== null || anyDraftBusy}
					onclick={() => editor.publishAllDrafts()}>Publish all</Button
				>
			</div>
			<ul class="space-y-3">
				{#each editor.drafts as draft (draft.id)}
					{@const limit = editor.draftLimit(draft)}
					{@const body = editor.draftBodies[draft.id] ?? draft.body}
					{@const busy = editor.draftBusy[draft.id]}
					{@const error = editor.draftErrors[draft.id]}
					<li class="space-y-2 rounded-lg border border-border bg-background p-3">
						<div class="flex items-baseline justify-between gap-2">
							<label for="weekly-draft-{draft.id}" class="text-sm font-medium text-foreground">
								{draft.project_id ? (draft.project_name ?? 'Project') : 'Now line'}
							</label>
							<span class="stamp text-xs {body.length >= limit ? 'font-semibold text-foreground' : 'text-muted-foreground'}"
								>{body.length}/{limit}</span
							>
						</div>
						<textarea
							id="weekly-draft-{draft.id}"
							rows="2"
							maxlength={limit}
							value={body}
							oninput={(event) =>
								(editor.draftBodies = { ...editor.draftBodies, [draft.id]: event.currentTarget.value })}
							aria-describedby={error ? `weekly-draft-${draft.id}-error` : undefined}
							class="{inputClass} resize-y leading-relaxed"
						></textarea>
						{#if error}
							<p id="weekly-draft-{draft.id}-error" class="text-xs text-destructive" role="alert">
								{error}
							</p>
						{/if}
						<div class="flex flex-wrap gap-2">
							<Button
								variant="primary"
								size="sm"
								loading={busy === 'publish'}
								disabled={!!busy || editor.weeklyBusy !== null}
								onclick={() => editor.decideDraft(draft.id, 'publish')}>Publish</Button
							>
							<Button
								variant="ghost"
								size="sm"
								loading={busy === 'skip'}
								disabled={!!busy || editor.weeklyBusy !== null}
								onclick={() => editor.decideDraft(draft.id, 'skip')}>Skip</Button
							>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{:else}
		<p class="rounded-lg border border-dashed border-border-strong px-3 py-3 text-sm text-muted-foreground">
			No lines waiting.
			{editor.settings.weekly_drafts
				? 'Friday’s drafts will show up here.'
				: 'Turn on Friday drafts, or draft this week now.'}
		</p>
	{/if}

	<div class="flex flex-wrap items-center gap-3">
		<Button
			variant="outline"
			size="sm"
			loading={editor.weeklyBusy === 'draft'}
			disabled={editor.weeklyBusy !== null || !hasSavedProjects}
			onclick={() => editor.draftThisWeek()}
		>
			{editor.weeklyBusy === 'draft' ? 'Drafting…' : 'Draft this week now'}
		</Button>
		{#if !hasSavedProjects}
			<span class="text-xs text-muted-foreground">Save a project to your page first.</span>
		{:else if editor.drafts.length}
			<span class="text-xs text-muted-foreground">Drafting again replaces the lines above.</span>
		{/if}
	</div>
	<div aria-live="polite">
		{#if editor.weeklyMessage}
			<p class="text-sm text-foreground">{editor.weeklyMessage}</p>
		{/if}
	</div>
	{#if editor.weeklyError}
		<p class="text-sm text-destructive" role="alert">{editor.weeklyError}</p>
	{/if}
</EditorGroup>
