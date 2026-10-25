<!-- apps/web/src/lib/components/builder-profile/editor/ProfilePanel.svelte -->
<!-- Your page > Profile: cover and photo (pick a file, position it, done), name,
     headline, location, bio and the Now line. Text saves when you leave a field.
     "Draft from my projects" offers a headline, bio and pitches to use one by one. -->
<script lang="ts">
	import { Check, ImagePlus, Sparkles, X } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import { initialsOf } from '$lib/builder-profile/format';
	import EditorField from './EditorField.svelte';
	import ImageCropDialog from './ImageCropDialog.svelte';
	import PanelHead from './PanelHead.svelte';
	import { iconButtonClass, textButtonClass } from './editor-styles';
	import { LIMITS } from './builder-editor';
	import type { CropShape } from './image-crop';
	import type { BuilderPageEditorState } from './builder-editor-state.svelte';

	let { editor }: { editor: BuilderPageEditorState } = $props();

	let pickedFile = $state<File | null>(null);
	let pickedShape = $state<CropShape>('avatar');
	let photoInput = $state<HTMLInputElement | null>(null);
	let coverInput = $state<HTMLInputElement | null>(null);

	const avatar = $derived(editor.settings.avatar_url);
	const cover = $derived(editor.settings.cover_url);
	const googlePhoto = $derived(editor.signInAvatarUrl);
	const initials = $derived(
		initialsOf(editor.header.name || editor.name, editor.handle || 'you')
	);
	const suggestion = $derived(editor.suggestion);
	const suggestionEmpty = $derived(
		!!suggestion && !suggestion.headline && !suggestion.bio && suggestion.pitches.length === 0
	);

	function pick(shape: CropShape, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		input.value = '';
		if (!file) return;
		pickedShape = shape;
		pickedFile = file;
	}

	async function useCrop(blob: Blob) {
		const ok = await editor.uploadImage(pickedShape, blob);
		if (!ok) throw new Error(editor.imageError ?? 'Could not save that image. Try again.');
		pickedFile = null;
	}

	function rowName(projectId: string) {
		const row = editor.rows.find((r) => r.project.project_id === projectId);
		return row?.public_name.trim() || row?.project.name || 'Project';
	}
</script>

<PanelHead title="Profile" hint="Your photo, your name, and what you're on right now." />

<div class="space-y-6">
	<div>
		<div class="relative">
			<button
				type="button"
				class="group relative block h-28 w-full overflow-hidden rounded-xl border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={() => coverInput?.click()}
				disabled={editor.imageBusy !== null}
				aria-label={cover ? 'Change cover image' : 'Add a cover image'}
			>
				{#if cover}
					<img src={cover} alt="" class="h-full w-full object-cover" />
				{:else}
					<span class="tx tx-frame tx-med absolute inset-0"></span>
				{/if}
				<span
					class="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold text-foreground shadow-ink transition-opacity group-hover:opacity-100 {cover
						? 'opacity-0 group-focus-visible:opacity-100'
						: ''}"
				>
					<ImagePlus class="h-3.5 w-3.5" aria-hidden="true" />
					{editor.imageBusy === 'cover'
						? 'Saving…'
						: cover
							? 'Change cover'
							: 'Add cover'}
				</span>
			</button>
			<button
				type="button"
				class="group absolute -bottom-9 left-4 grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-foreground text-xl font-semibold text-background ring-4 ring-background focus-visible:outline-none focus-visible:ring-ring"
				onclick={() => photoInput?.click()}
				disabled={editor.imageBusy !== null}
				aria-label={avatar ? 'Change photo' : 'Add a photo'}
			>
				{#if avatar}
					<img
						src={avatar}
						alt=""
						referrerpolicy="no-referrer"
						class="h-full w-full object-cover"
					/>
				{:else}
					<span aria-hidden="true">{initials}</span>
				{/if}
				<span
					class="absolute inset-0 grid place-items-center bg-foreground/55 text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 {editor.imageBusy ===
					'avatar'
						? 'opacity-100'
						: ''}"
					aria-hidden="true"
				>
					{#if editor.imageBusy === 'avatar'}
						<span class="text-xs font-semibold">Saving…</span>
					{:else}
						<ImagePlus class="h-5 w-5" />
					{/if}
				</span>
			</button>
		</div>
		<div class="ml-[6.5rem] mt-1.5 flex min-h-11 flex-wrap items-center gap-x-1 text-sm">
			{#if !avatar}
				<button type="button" class={textButtonClass} onclick={() => photoInput?.click()}
					>Add photo</button
				>
			{/if}
			{#if googlePhoto && avatar !== googlePhoto}
				<button
					type="button"
					class={textButtonClass}
					disabled={editor.fieldSaving === 'avatar_url'}
					onclick={() => editor.setAvatar(googlePhoto)}>Use Google photo</button
				>
			{/if}
			{#if avatar}
				<button
					type="button"
					class="{textButtonClass} text-muted-foreground"
					disabled={editor.imageBusy !== null}
					onclick={() => editor.removeImage('avatar')}>Remove photo</button
				>
			{/if}
			{#if cover}
				<button
					type="button"
					class="{textButtonClass} text-muted-foreground"
					disabled={editor.imageBusy !== null}
					onclick={() => editor.removeImage('cover')}>Remove cover</button
				>
			{/if}
		</div>
		{#if editor.imageError && !pickedFile}
			<p class="mt-1 text-sm text-destructive" role="alert">{editor.imageError}</p>
		{/if}
		<input
			bind:this={photoInput}
			type="file"
			accept="image/*"
			class="sr-only"
			tabindex="-1"
			aria-hidden="true"
			onchange={(event) => pick('avatar', event)}
		/>
		<input
			bind:this={coverInput}
			type="file"
			accept="image/*"
			class="sr-only"
			tabindex="-1"
			aria-hidden="true"
			onchange={(event) => pick('cover', event)}
		/>
	</div>

	<div class="grid gap-4">
		<EditorField
			id="page-name"
			label="Name"
			bind:value={editor.header.name}
			max={LIMITS.name}
			placeholder="Your name"
			error={editor.fieldErrors.name ?? null}
			onblur={() => editor.saveField('name')}
		/>
		<EditorField
			id="page-headline"
			label="Headline"
			bind:value={editor.header.headline}
			max={LIMITS.headline}
			placeholder="Founder, BuildOS"
			error={editor.fieldErrors.headline ?? null}
			onblur={() => editor.saveField('headline')}
		/>
		<EditorField
			id="page-location"
			label="Location"
			bind:value={editor.header.location}
			max={LIMITS.location}
			placeholder="Baltimore, MD"
			error={editor.fieldErrors.location ?? null}
			onblur={() => editor.saveField('location')}
		/>
		<EditorField
			id="page-bio"
			label="Bio"
			bind:value={editor.header.bio}
			max={LIMITS.bio}
			multiline
			rows={3}
			placeholder="A sentence or two about what you make."
			error={editor.fieldErrors.bio ?? null}
			onblur={() => editor.saveField('bio')}
		/>
		<EditorField
			id="page-now"
			label="Now"
			bind:value={editor.header.now_text}
			max={LIMITS.now_text}
			multiline
			rows={2}
			placeholder="Getting the first five beta users through onboarding."
			hint="What you're on this week. A new line also reaches your followers' daily brief."
			error={editor.fieldErrors.now_text ?? null}
			onblur={() => editor.saveField('now_text')}
		/>
	</div>

	<div class="rounded-xl border border-border bg-card p-3.5">
		{#if !suggestion}
			<div class="flex flex-wrap items-center justify-between gap-3">
				<p class="min-w-0 flex-1 text-sm text-muted-foreground">
					Need words? BuildOS can draft these from your projects.
				</p>
				<Button
					variant="outline"
					size="sm"
					icon={Sparkles}
					loading={editor.suggestionBusy}
					disabled={editor.suggestionBusy}
					onclick={() => editor.draftPage()}
				>
					{editor.suggestionBusy ? 'Drafting…' : 'Draft for me'}
				</Button>
			</div>
		{:else}
			<div class="space-y-3" role="region" aria-label="Draft from your projects">
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<p class="micro-label text-accent">Drafted from your projects</p>
						<p class="mt-1 text-xs text-muted-foreground">
							Use what fits. Nothing changes until you do.
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
						There wasn't enough in your projects to draft from. Add a description to
						one, then try again.
					</p>
				{:else}
					{#snippet item(key: string, title: string, body: string, onuse: () => void)}
						<li class="flex items-start justify-between gap-3 py-2.5">
							<div class="min-w-0">
								<p class="micro-label">{title}</p>
								<p class="mt-1 text-sm text-foreground">{body}</p>
							</div>
							{#if editor.usedSuggestions.includes(key)}
								<span
									class="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-success"
									><Check class="h-4 w-4" aria-hidden="true" />Used</span
								>
							{:else}
								<button
									type="button"
									class={textButtonClass}
									onclick={onuse}
									aria-label="Use this {title}">Use</button
								>
							{/if}
						</li>
					{/snippet}
					<ul class="divide-y divide-border">
						{#if suggestion.headline}
							{@render item('headline', 'Headline', suggestion.headline, () =>
								editor.useSuggestedText('headline')
							)}
						{/if}
						{#if suggestion.bio}
							{@render item('bio', 'Bio', suggestion.bio, () =>
								editor.useSuggestedText('bio')
							)}
						{/if}
						{#each suggestion.pitches as pitch (pitch.project_id)}
							{@render item(
								`pitch:${pitch.project_id}`,
								`Pitch · ${rowName(pitch.project_id)}`,
								pitch.pitch,
								() => editor.useSuggestedPitch(pitch.project_id)
							)}
						{/each}
					</ul>
					<div class="flex justify-end">
						<Button
							variant="secondary"
							size="sm"
							onclick={() => editor.useAllSuggestions()}>Use all</Button
						>
					</div>
				{/if}
			</div>
		{/if}
		{#if editor.suggestionError}
			<p class="mt-2 text-sm text-destructive" role="alert">{editor.suggestionError}</p>
		{/if}
	</div>
</div>

<ImageCropDialog
	file={pickedFile}
	shape={pickedShape}
	busy={editor.imageBusy !== null}
	onconfirm={useCrop}
	oncancel={() => {
		pickedFile = null;
		editor.imageError = null;
	}}
/>
