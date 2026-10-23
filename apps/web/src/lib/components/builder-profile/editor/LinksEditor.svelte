<!-- apps/web/src/lib/components/builder-profile/editor/LinksEditor.svelte -->
<!-- Your page > Links: socials (paste a URL; the platform shows as you type) and links
     (title, URL, optional note). Each one can be for anyone or only people you work
     with; reorder, delete, then "Save links" puts the whole list. -->
<script lang="ts">
	import { tick } from 'svelte';
	import { ArrowDown, ArrowUp, Plus, Trash2 } from '$lib/icons/lucide';
	import { detectPlatform, displayUrl, normalizeLinkUrl, PLATFORM_LABELS } from '$lib/builder-profile/links';
	import SocialIcon from '../SocialIcon.svelte';
	import AudienceSelect from './AudienceSelect.svelte';
	import EditorGroup from './EditorGroup.svelte';
	import SaveBar from './SaveBar.svelte';
	import { iconButtonClass, inputClass, inputErrorClass, textButtonClass } from './editor-styles';
	import { LIMITS, linkRowError, type EditorLinkRow } from './builder-editor';
	import type { BuilderPageEditorState } from './builder-editor-state.svelte';

	let { editor }: { editor: BuilderPageEditorState } = $props();

	let touched = $state<Record<string, boolean>>({});
	let addSocialButton = $state<HTMLButtonElement | null>(null);
	let addLinkButton = $state<HTMLButtonElement | null>(null);

	const full = $derived(editor.socials.length + editor.links.length >= LIMITS.links);

	function shownError(row: EditorLinkRow): string | null {
		if (!editor.linksAttempted && !touched[row.key]) return null;
		return linkRowError(row);
	}

	function socialName(row: EditorLinkRow, index: number): string {
		const url = normalizeLinkUrl(row.url);
		return url ? PLATFORM_LABELS[detectPlatform(url)] : `social link ${index + 1}`;
	}

	function linkName(row: EditorLinkRow, index: number): string {
		return row.label.trim() || `link ${index + 1}`;
	}

	async function add(kind: 'social' | 'link') {
		const key = editor.addLink(kind);
		if (!key) return;
		await tick();
		document.getElementById(`${kind === 'social' ? 'social' : 'link-title'}-${key}`)?.focus();
	}

	async function remove(kind: 'social' | 'link', key: string) {
		editor.removeLink(kind, key);
		await tick();
		(kind === 'social' ? addSocialButton : addLinkButton)?.focus();
	}
</script>

{#snippet rowControls(kind: 'social' | 'link', row: EditorLinkRow, index: number, count: number, name: string)}
	<div class="flex flex-wrap items-center justify-between gap-2">
		<AudienceSelect
			id="{kind}-audience-{row.key}"
			value={row.audience}
			label="Who sees {name}"
			onchange={(audience) => (row.audience = audience)}
		/>
		<div class="flex items-center">
			<button
				type="button"
				class={iconButtonClass}
				aria-label="Move {name} up"
				disabled={index === 0}
				onclick={() => editor.moveLink(kind, index, -1)}
			>
				<ArrowUp class="h-4 w-4" aria-hidden="true" />
			</button>
			<button
				type="button"
				class={iconButtonClass}
				aria-label="Move {name} down"
				disabled={index === count - 1}
				onclick={() => editor.moveLink(kind, index, 1)}
			>
				<ArrowDown class="h-4 w-4" aria-hidden="true" />
			</button>
			<button
				type="button"
				class="{iconButtonClass} hover:text-destructive"
				aria-label="Delete {name}"
				onclick={() => remove(kind, row.key)}
			>
				<Trash2 class="h-4 w-4" aria-hidden="true" />
			</button>
		</div>
	</div>
{/snippet}

<EditorGroup
	id="your-page-links"
	title="Links"
	hint="Socials show as icons under your name. Links show as buttons people tap."
>
	<div class="space-y-2">
		<p class="micro-label">Socials</p>
		{#if editor.socials.length === 0}
			<p class="text-sm text-muted-foreground">
				No socials yet. Paste a profile link and the icon fills itself in.
			</p>
		{/if}
		<ul class="space-y-2">
			{#each editor.socials as row, index (row.key)}
				{@const url = normalizeLinkUrl(row.url)}
				{@const platform = url ? detectPlatform(url) : 'website'}
				{@const error = shownError(row)}
				{@const name = socialName(row, index)}
				<li class="space-y-2 rounded-lg border border-border bg-background p-2.5">
					<div class="flex items-start gap-2">
						<span
							class="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border-strong text-foreground {url
								? ''
								: 'opacity-40'}"
							aria-hidden="true"
						>
							<SocialIcon {platform} />
						</span>
						<div class="min-w-0 flex-1 space-y-1">
							<label for="social-{row.key}" class="sr-only">Social link {index + 1}</label>
							<input
								id="social-{row.key}"
								type="url"
								inputmode="url"
								bind:value={row.url}
								placeholder="Paste a link: x.com/you, linkedin.com/in/you"
								autocomplete="off"
								autocapitalize="off"
								spellcheck="false"
								aria-invalid={error ? true : undefined}
								aria-describedby="social-{row.key}-status"
								onblur={() => (touched = { ...touched, [row.key]: true })}
								class="{inputClass} {error ? inputErrorClass : ''}"
							/>
							<p
								id="social-{row.key}-status"
								class="text-xs {error ? 'text-destructive' : 'text-muted-foreground'}"
							>
								{#if error}
									{error}
								{:else if url}
									{PLATFORM_LABELS[platform]} · {displayUrl(url)}
								{:else}
									The icon shows once it's a link.
								{/if}
							</p>
						</div>
					</div>
					{@render rowControls('social', row, index, editor.socials.length, name)}
				</li>
			{/each}
		</ul>
		<button
			bind:this={addSocialButton}
			type="button"
			class={textButtonClass}
			disabled={full}
			onclick={() => add('social')}
		>
			<Plus class="h-4 w-4" aria-hidden="true" />Add a social
		</button>
	</div>

	<div class="space-y-2">
		<p class="micro-label">Links</p>
		{#if editor.links.length === 0}
			<p class="text-sm text-muted-foreground">
				No links yet. Add your newsletter, a launch, a booking page, anything you want people
				to tap.
			</p>
		{/if}
		<ul class="space-y-2">
			{#each editor.links as row, index (row.key)}
				{@const error = shownError(row)}
				{@const name = linkName(row, index)}
				<li class="space-y-2 rounded-lg border border-border bg-background p-2.5">
					<div class="grid gap-2 sm:grid-cols-2">
						<div class="space-y-1">
							<label for="link-title-{row.key}" class="text-xs font-medium text-muted-foreground"
								>Title</label
							>
							<input
								id="link-title-{row.key}"
								type="text"
								bind:value={row.label}
								maxlength={LIMITS.link_label}
								placeholder="My newsletter"
								autocomplete="off"
								class={inputClass}
							/>
						</div>
						<div class="space-y-1">
							<label for="link-url-{row.key}" class="text-xs font-medium text-muted-foreground"
								>Web address</label
							>
							<input
								id="link-url-{row.key}"
								type="url"
								inputmode="url"
								bind:value={row.url}
								placeholder="example.com/page"
								autocomplete="off"
								autocapitalize="off"
								spellcheck="false"
								aria-invalid={error ? true : undefined}
								aria-describedby={error ? `link-url-${row.key}-error` : undefined}
								onblur={() => (touched = { ...touched, [row.key]: true })}
								class="{inputClass} {error ? inputErrorClass : ''}"
							/>
						</div>
					</div>
					{#if error}
						<p id="link-url-{row.key}-error" class="text-xs text-destructive">{error}</p>
					{/if}
					<div class="space-y-1">
						<label for="link-note-{row.key}" class="text-xs font-medium text-muted-foreground"
							>Note <span class="font-normal">(optional)</span></label
						>
						<input
							id="link-note-{row.key}"
							type="text"
							bind:value={row.note}
							maxlength={LIMITS.link_note}
							placeholder="Every Friday, what I shipped"
							autocomplete="off"
							class={inputClass}
						/>
					</div>
					{@render rowControls('link', row, index, editor.links.length, name)}
				</li>
			{/each}
		</ul>
		<button
			bind:this={addLinkButton}
			type="button"
			class={textButtonClass}
			disabled={full}
			onclick={() => add('link')}
		>
			<Plus class="h-4 w-4" aria-hidden="true" />Add a link
		</button>
		{#if full}
			<p class="text-xs text-muted-foreground">That's the most a page holds ({LIMITS.links}).</p>
		{/if}
	</div>

	<SaveBar
		label="Save links"
		dirty={editor.linksDirty}
		busy={editor.linksBusy}
		saved={editor.linksJustSaved}
		error={editor.linksError}
		note="“People I work with” items show only to people you share a project with."
		onsave={() => editor.saveLinks()}
	/>
</EditorGroup>
