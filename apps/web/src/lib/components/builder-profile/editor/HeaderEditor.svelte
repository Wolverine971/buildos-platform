<!-- apps/web/src/lib/components/builder-profile/editor/HeaderEditor.svelte -->
<!-- Your page > Header: photo, headline, location, bio and the Now line. Each field
     saves when you leave it. "Draft my page" offers a headline, bio and pitches written
     from your projects, to use per item or all at once. -->
<script lang="ts">
	import { Check, Pencil, X } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import { initialsOf } from '$lib/builder-profile/format';
	import EditorField from './EditorField.svelte';
	import EditorGroup from './EditorGroup.svelte';
	import { iconButtonClass, textButtonClass } from './editor-styles';
	import { LIMITS } from './builder-editor';
	import type { BuilderPageEditorState } from './builder-editor-state.svelte';

	let { editor }: { editor: BuilderPageEditorState } = $props();

	const avatar = $derived(editor.settings.avatar_url);
	const googlePhoto = $derived(editor.signInAvatarUrl);
	const initials = $derived(initialsOf(editor.name, editor.handle || 'you'));
	const suggestion = $derived(editor.suggestion);
	const suggestionEmpty = $derived(
		!!suggestion && !suggestion.headline && !suggestion.bio && suggestion.pitches.length === 0
	);
	const allUsed = $derived.by(() => {
		if (!suggestion) return false;
		const keys = [
			...(suggestion.headline ? ['headline'] : []),
			...(suggestion.bio ? ['bio'] : []),
			...suggestion.pitches.map((p) => `pitch:${p.project_id}`)
		];
		return keys.length > 0 && keys.every((key) => editor.usedSuggestions.includes(key));
	});

	function rowFor(projectId: string) {
		return editor.rows.find((r) => r.project.project_id === projectId) ?? null;
	}
</script>

{#snippet useButton(key: string, label: string, onuse: () => void)}
	{#if editor.usedSuggestions.includes(key)}
		<span class="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-success"
			><Check class="h-4 w-4" aria-hidden="true" />Used</span
		>
	{:else}
		<button type="button" class={textButtonClass} onclick={onuse} aria-label={label}>Use this</button>
	{/if}
{/snippet}

<EditorGroup id="your-page-header" title="Header" hint="Who you are and what you're on right now.">
	<div class="flex flex-wrap items-center gap-4">
		{#if avatar}
			<img
				src={avatar}
				alt=""
				width="64"
				height="64"
				referrerpolicy="no-referrer"
				class="h-16 w-16 shrink-0 rounded-full border border-border bg-muted object-cover"
			/>
		{:else}
			<div
				class="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-foreground text-xl font-semibold text-background"
				aria-hidden="true"
			>
				{initials}
			</div>
		{/if}
		<div class="min-w-0 flex-1 space-y-1">
			<div class="flex flex-wrap items-center gap-2">
				{#if googlePhoto && avatar !== googlePhoto}
					<Button
						variant="outline"
						size="sm"
						loading={editor.fieldSaving === 'avatar_url'}
						disabled={editor.fieldSaving === 'avatar_url'}
						onclick={() => editor.setAvatar(googlePhoto)}>Use my Google photo</Button
					>
				{/if}
				{#if avatar}
					<Button
						variant="ghost"
						size="sm"
						disabled={editor.fieldSaving === 'avatar_url'}
						onclick={() => editor.setAvatar(null)}>Remove photo</Button
					>
				{/if}
				<span class="text-xs" aria-live="polite">
					{#if editor.justSaved === 'avatar_url'}
						<span class="inline-flex items-center gap-1 text-success"
							><Check class="h-3.5 w-3.5" aria-hidden="true" />Saved</span
						>
					{/if}
				</span>
			</div>
			{#if !avatar}
				<p class="text-xs text-muted-foreground">
					{googlePhoto
						? 'Your initials show until you add a photo.'
						: 'Your initials show in place of a photo.'}
				</p>
			{/if}
			{#if editor.fieldErrors.avatar_url}
				<p class="text-xs text-destructive" role="alert">{editor.fieldErrors.avatar_url}</p>
			{/if}
		</div>
	</div>

	<div class="grid gap-4 sm:grid-cols-2">
		<EditorField
			id="your-page-headline"
			label="Headline"
			bind:value={editor.header.headline}
			max={LIMITS.headline}
			placeholder="Founder, BuildOS"
			saving={editor.fieldSaving === 'headline'}
			saved={editor.justSaved === 'headline'}
			error={editor.fieldErrors.headline ?? null}
			onblur={() => editor.saveField('headline')}
		/>
		<EditorField
			id="your-page-location"
			label="Location"
			bind:value={editor.header.location}
			max={LIMITS.location}
			placeholder="Baltimore, MD"
			saving={editor.fieldSaving === 'location'}
			saved={editor.justSaved === 'location'}
			error={editor.fieldErrors.location ?? null}
			onblur={() => editor.saveField('location')}
		/>
	</div>
	<EditorField
		id="your-page-bio"
		label="Bio"
		bind:value={editor.header.bio}
		max={LIMITS.bio}
		multiline
		rows={3}
		placeholder="A sentence or two about what you make."
		saving={editor.fieldSaving === 'bio'}
		saved={editor.justSaved === 'bio'}
		error={editor.fieldErrors.bio ?? null}
		onblur={() => editor.saveField('bio')}
	/>
	<EditorField
		id="your-page-now"
		label="Now"
		bind:value={editor.header.now_text}
		max={LIMITS.now_text}
		placeholder="Getting the first five beta users through onboarding."
		hint="What you're on this week. A new Now line also goes to your followers' daily brief."
		saving={editor.fieldSaving === 'now_text'}
		saved={editor.justSaved === 'now_text'}
		error={editor.fieldErrors.now_text ?? null}
		onblur={() => editor.saveField('now_text')}
	/>

	<div class="space-y-3 rounded-lg border border-border bg-background p-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<p class="min-w-0 flex-1 text-sm text-muted-foreground">
				Stuck on what to say? BuildOS can write a first pass from your projects. Nothing
				changes until you use it.
			</p>
			<Button
				variant="outline"
				size="sm"
				icon={Pencil}
				loading={editor.suggestionBusy}
				disabled={editor.suggestionBusy}
				onclick={() => editor.draftPage()}
			>
				{editor.suggestionBusy ? 'Drafting…' : suggestion ? 'Draft again' : 'Draft my page'}
			</Button>
		</div>
		{#if editor.suggestionError}
			<p class="text-sm text-destructive" role="alert">{editor.suggestionError}</p>
		{/if}

		{#if suggestion}
			<div
				class="space-y-3 rounded-md border border-dashed border-accent bg-accent/5 p-3"
				role="region"
				aria-label="Draft from your projects"
			>
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0 space-y-0.5">
						<p class="micro-label text-accent">A draft from your projects</p>
						<p class="text-xs text-muted-foreground">
							BuildOS wrote this from your project notes. Edit anything before you publish.
						</p>
					</div>
					<button
						type="button"
						class={iconButtonClass}
						aria-label="Close the draft"
						onclick={() => editor.dismissSuggestion()}
					>
						<X class="h-4 w-4" aria-hidden="true" />
					</button>
				</div>

				{#if suggestionEmpty}
					<p class="text-sm text-foreground">
						There wasn't enough in these projects to draft from. Add a description to a
						project, then try again.
					</p>
				{:else}
					<ul class="divide-y divide-border">
						{#if suggestion.headline}
							<li class="flex items-start justify-between gap-3 py-2">
								<div class="min-w-0">
									<p class="micro-label">Headline</p>
									<p class="text-sm text-foreground">{suggestion.headline}</p>
								</div>
								{@render useButton('headline', 'Use this headline', () =>
									editor.useSuggestedText('headline')
								)}
							</li>
						{/if}
						{#if suggestion.bio}
							<li class="flex items-start justify-between gap-3 py-2">
								<div class="min-w-0">
									<p class="micro-label">Bio</p>
									<p class="text-sm text-foreground">{suggestion.bio}</p>
								</div>
								{@render useButton('bio', 'Use this bio', () => editor.useSuggestedText('bio'))}
							</li>
						{/if}
						{#each suggestion.pitches as item (item.project_id)}
							{@const row = rowFor(item.project_id)}
							{@const projectName = row?.public_name.trim() || row?.project.name || 'Project'}
							<li class="flex items-start justify-between gap-3 py-2">
								<div class="min-w-0">
									<p class="micro-label">Pitch · {projectName}</p>
									<p class="text-sm text-foreground">{item.pitch}</p>
									{#if row?.level === 'hidden' && !editor.usedSuggestions.includes(`pitch:${item.project_id}`)}
										<p class="text-xs text-muted-foreground">Using it adds this project as Listed.</p>
									{/if}
								</div>
								{@render useButton(`pitch:${item.project_id}`, `Use this pitch for ${projectName}`, () =>
									editor.useSuggestedPitch(item.project_id)
								)}
							</li>
						{/each}
					</ul>
					{#if !allUsed}
						<div class="flex justify-end">
							<Button
								variant="secondary"
								size="sm"
								disabled={editor.projectsBusy || editor.fieldSaving !== null}
								onclick={() => editor.useAllSuggestions()}>Use all</Button
							>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</EditorGroup>
