<!-- apps/web/src/lib/components/builder-profile/editor/UpdatesPanel.svelte -->
<!-- Your page > Updates: BuildOS drafts your Now line and a "this week" line per Live
     project from what moved; you edit, publish or skip each. Published lines land on
     your page and in your followers' daily brief. -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import PanelHead from './PanelHead.svelte';
	import ToggleRow from './ToggleRow.svelte';
	import { inputClass } from './editor-styles';
	import type { BuilderPageEditorState } from './builder-editor-state.svelte';

	let { editor }: { editor: BuilderPageEditorState } = $props();

	const hasLive = $derived(editor.placedRows.some((row) => row.level === 'live'));
	const hasPlaced = $derived(editor.placedRows.length > 0);
	const anyDraftBusy = $derived(Object.keys(editor.draftBusy).length > 0);
</script>

<PanelHead
	title="Updates"
	hint="Short lines about what moved. They show on your page and in followers' daily briefs."
/>

<div class="space-y-6">
	<div class="rounded-xl border border-border bg-card px-3.5">
		<ToggleRow
			id="page-weekly-drafts"
			label="Draft my update every Friday"
			hint="Nothing goes out until you publish it."
			checked={editor.settings.weekly_drafts}
			busy={!!editor.toggleBusy.weekly_drafts}
			error={editor.toggleError?.key === 'weekly_drafts' ? editor.toggleError.message : null}
			onchange={(next) => editor.setToggle('weekly_drafts', next)}
		/>
	</div>

	{#if editor.drafts.length}
		<section class="space-y-3" aria-labelledby="updates-waiting">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h3 id="updates-waiting" class="micro-label">
					Waiting for you · {editor.drafts.length}
				</h3>
				<Button
					variant="secondary"
					size="sm"
					loading={editor.weeklyBusy === 'publish_all'}
					disabled={editor.weeklyBusy !== null || anyDraftBusy}
					onclick={() => editor.publishAllDrafts()}>Publish all</Button
				>
			</div>
			<ul class="grid gap-3">
				{#each editor.drafts as draft (draft.id)}
					{@const limit = editor.draftLimit(draft)}
					{@const body = editor.draftBodies[draft.id] ?? draft.body}
					{@const busy = editor.draftBusy[draft.id]}
					{@const error = editor.draftErrors[draft.id]}
					<li class="space-y-2.5 rounded-xl border border-border bg-card p-3.5">
						<div class="flex items-baseline justify-between gap-2">
							<label
								for="weekly-draft-{draft.id}"
								class="text-sm font-semibold text-foreground"
							>
								{draft.project_id ? (draft.project_name ?? 'Project') : 'Now line'}
							</label>
							{#if body.length >= limit * 0.8}
								<span class="stamp text-xs text-muted-foreground"
									>{body.length}/{limit}</span
								>
							{/if}
						</div>
						<textarea
							id="weekly-draft-{draft.id}"
							rows="2"
							maxlength={limit}
							value={body}
							oninput={(event) =>
								(editor.draftBodies = {
									...editor.draftBodies,
									[draft.id]: event.currentTarget.value
								})}
							aria-describedby={error ? `weekly-draft-${draft.id}-error` : undefined}
							class="{inputClass} resize-none leading-relaxed"
						></textarea>
						{#if error}
							<p
								id="weekly-draft-{draft.id}-error"
								class="text-xs text-destructive"
								role="alert"
							>
								{error}
							</p>
						{/if}
						<div class="flex flex-wrap gap-2">
							<Button
								variant="primary"
								size="sm"
								loading={busy === 'publish'}
								disabled={!!busy || editor.weeklyBusy !== null}
								onclick={() => editor.decideDraft(draft.id, 'publish')}
								>Publish</Button
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
		</section>
	{:else}
		<div class="rounded-xl border border-dashed border-border-strong px-4 py-5 text-center">
			<p class="text-sm font-medium text-foreground">No lines waiting</p>
			<p class="mt-1 text-sm text-muted-foreground">
				{editor.settings.weekly_drafts
					? 'Friday’s drafts will show up here.'
					: 'Turn on Friday drafts, or draft this week now.'}
			</p>
		</div>
	{/if}

	<div class="space-y-2">
		<Button
			variant="outline"
			size="sm"
			loading={editor.weeklyBusy === 'draft'}
			disabled={editor.weeklyBusy !== null || !hasPlaced}
			onclick={() => editor.draftThisWeek()}
		>
			{editor.weeklyBusy === 'draft' ? 'Drafting…' : 'Draft this week now'}
		</Button>
		<p class="text-xs text-muted-foreground">
			{#if !hasPlaced}
				Add a project to your page first.
			{:else if editor.drafts.length}
				Drafting again replaces the lines above.
			{:else if !hasLive}
				Make a project Live to get a "this week" line for it.
			{:else}
				Writes your Now line and a line for each Live project.
			{/if}
		</p>
		<div aria-live="polite">
			{#if editor.weeklyMessage}<p class="text-sm text-foreground">
					{editor.weeklyMessage}
				</p>{/if}
		</div>
		{#if editor.weeklyError}
			<p class="text-sm text-destructive" role="alert">{editor.weeklyError}</p>
		{/if}
	</div>
</div>
