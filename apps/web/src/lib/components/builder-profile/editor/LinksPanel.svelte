<!-- apps/web/src/lib/components/builder-profile/editor/LinksPanel.svelte -->
<!-- Your page > Links. Socials: paste a profile link, the icon fills itself in. Links:
     each row reads like the button on your page; open one to edit its title, address
     and note. Drag the grip (or use the arrow keys on it) to reorder. The globe / people
     toggle picks who sees it. Everything saves a moment after you stop typing. -->
<script lang="ts">
	import { tick } from 'svelte';
	import { ChevronDown, Globe, GripVertical, Plus, Trash2, Users } from '$lib/icons/lucide';
	import {
		detectPlatform,
		displayUrl,
		normalizeLinkUrl,
		PLATFORM_LABELS
	} from '$lib/builder-profile/links';
	import SocialIcon from '../SocialIcon.svelte';
	import EditorField from './EditorField.svelte';
	import PanelHead from './PanelHead.svelte';
	import { dragHandle } from './drag-reorder';
	import { iconButtonClass, textButtonClass } from './editor-styles';
	import { LIMITS, type EditorLinkRow } from './builder-editor';
	import type { BuilderPageEditorState } from './builder-editor-state.svelte';

	let { editor }: { editor: BuilderPageEditorState } = $props();

	let touched = $state<Record<string, boolean>>({});
	let openKey = $state<string | null>(null);

	const full = $derived(editor.socials.length + editor.links.length >= LIMITS.links);

	function shownError(row: EditorLinkRow): string | null {
		return touched[row.key] ? (editor.linkErrors[row.key] ?? null) : null;
	}

	function socialName(row: EditorLinkRow): string {
		const url = normalizeLinkUrl(row.url);
		return url ? PLATFORM_LABELS[detectPlatform(url)] : 'this social link';
	}

	function linkName(row: EditorLinkRow): string {
		return row.label.trim() || 'this link';
	}

	async function add(kind: 'social' | 'link') {
		const key = editor.addLink(kind);
		if (!key) return;
		if (kind === 'link') openKey = key;
		await tick();
		document.getElementById(kind === 'social' ? `social-${key}` : `link-title-${key}`)?.focus();
	}

	function toggleAudience(row: EditorLinkRow) {
		row.audience = row.audience === 'anyone' ? 'collaborators' : 'anyone';
	}

	const rowClass =
		'rounded-xl border border-border bg-card transition-shadow data-[dragging=true]:relative data-[dragging=true]:z-10 data-[dragging=true]:border-accent data-[dragging=true]:shadow-ink-strong motion-reduce:transition-none';
	const gripClass =
		'inline-flex h-11 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing';
</script>

{#snippet audienceToggle(row: EditorLinkRow, name: string)}
	{@const inner = row.audience === 'collaborators'}
	<button
		type="button"
		class="{iconButtonClass} {inner ? 'text-info' : ''}"
		aria-pressed={inner}
		aria-label={inner
			? `Only people you work with see ${name}. Show it to anyone.`
			: `Anyone sees ${name}. Show it only to people you work with.`}
		title={inner ? 'Only people you work with' : 'Anyone'}
		onclick={() => toggleAudience(row)}
	>
		{#if inner}<Users class="h-4 w-4" aria-hidden="true" />{:else}<Globe
				class="h-4 w-4"
				aria-hidden="true"
			/>{/if}
	</button>
{/snippet}

<PanelHead
	title="Links"
	hint="Socials show as icons under your name. Links show as buttons people tap."
/>

<div class="space-y-7">
	<section aria-labelledby="links-socials">
		<h3 id="links-socials" class="micro-label mb-2.5">Socials</h3>
		{#if editor.socials.length}
			<ul class="grid gap-2">
				{#each editor.socials as row, index (row.key)}
					{@const url = normalizeLinkUrl(row.url)}
					{@const platform = url ? detectPlatform(url) : 'website'}
					{@const error = shownError(row)}
					{@const name = socialName(row)}
					<li data-reorder-item class={rowClass}>
						<div class="flex items-center gap-1 py-1 pl-1 pr-1">
							<button
								type="button"
								class={gripClass}
								aria-label="Move {name}. Drag, or use the arrow keys."
								use:dragHandle={{
									index,
									onmove: (from, to) => editor.moveLink('social', from, to)
								}}
							>
								<GripVertical class="h-4 w-4" aria-hidden="true" />
							</button>
							<span
								class="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border-strong text-foreground {url
									? ''
									: 'opacity-40'}"
								aria-hidden="true"
							>
								<SocialIcon {platform} />
							</span>
							<label for="social-{row.key}" class="sr-only"
								>Social link {index + 1}</label
							>
							<input
								id="social-{row.key}"
								type="url"
								inputmode="url"
								bind:value={row.url}
								placeholder="x.com/you, linkedin.com/in/you…"
								autocomplete="off"
								autocapitalize="off"
								spellcheck="false"
								aria-invalid={error ? true : undefined}
								aria-describedby={error ? `social-${row.key}-error` : undefined}
								onblur={() => (touched = { ...touched, [row.key]: true })}
								class="min-h-11 min-w-0 flex-1 rounded-md border-0 bg-transparent px-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
							/>
							{@render audienceToggle(row, name)}
							<button
								type="button"
								class="{iconButtonClass} hover:text-destructive"
								aria-label="Delete {name}"
								onclick={() => editor.removeLink('social', row.key)}
							>
								<Trash2 class="h-4 w-4" aria-hidden="true" />
							</button>
						</div>
						{#if error}
							<p
								id="social-{row.key}-error"
								class="px-3 pb-2 text-xs text-destructive"
							>
								{error}
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">
				Paste a profile link and the icon fills itself in.
			</p>
		{/if}
		<button
			type="button"
			class="{textButtonClass} mt-1.5"
			disabled={full}
			onclick={() => add('social')}
		>
			<Plus class="h-4 w-4" aria-hidden="true" />Add social
		</button>
	</section>

	<section aria-labelledby="links-links">
		<h3 id="links-links" class="micro-label mb-2.5">Links</h3>
		{#if editor.links.length}
			<ul class="grid gap-2">
				{#each editor.links as row, index (row.key)}
					{@const url = normalizeLinkUrl(row.url)}
					{@const error = shownError(row)}
					{@const name = linkName(row)}
					{@const open = openKey === row.key}
					{@const title = row.label.trim() || (url ? displayUrl(url) : 'New link')}
					<li data-reorder-item class={rowClass}>
						<div class="flex items-center gap-1 py-1 pl-1 pr-1">
							<button
								type="button"
								class={gripClass}
								aria-label="Move {name}. Drag, or use the arrow keys."
								use:dragHandle={{
									index,
									onmove: (from, to) => editor.moveLink('link', from, to)
								}}
							>
								<GripVertical class="h-4 w-4" aria-hidden="true" />
							</button>
							<button
								type="button"
								class="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								aria-expanded={open}
								aria-controls="link-body-{row.key}"
								onclick={() => (openKey = open ? null : row.key)}
							>
								<span
									class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-sm font-semibold uppercase text-foreground"
									aria-hidden="true">{title.slice(0, 1)}</span
								>
								<span class="grid min-w-0 flex-1">
									<span class="truncate text-sm font-semibold text-foreground"
										>{title}</span
									>
									<span
										class="truncate text-xs {error
											? 'text-destructive'
											: 'text-muted-foreground'}"
										>{error ??
											(url
												? row.note.trim() || displayUrl(url)
												: 'Add a web address')}</span
									>
								</span>
								<ChevronDown
									class="h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none {open
										? 'rotate-180'
										: ''}"
									aria-hidden="true"
								/>
							</button>
							{@render audienceToggle(row, name)}
						</div>
						{#if open}
							<div
								id="link-body-{row.key}"
								class="grid gap-3 border-t border-border p-3"
							>
								<EditorField
									id="link-title-{row.key}"
									label="Title"
									bind:value={row.label}
									max={LIMITS.link_label}
									placeholder="My newsletter"
								/>
								<EditorField
									id="link-url-{row.key}"
									label="Web address"
									type="url"
									inputmode="url"
									bind:value={row.url}
									placeholder="example.com/page"
									{error}
									onblur={() => (touched = { ...touched, [row.key]: true })}
								/>
								<EditorField
									id="link-note-{row.key}"
									label="Note (optional)"
									bind:value={row.note}
									max={LIMITS.link_note}
									placeholder="Every Friday, what I shipped"
								/>
								<div class="flex justify-end">
									<button
										type="button"
										class="{textButtonClass} text-destructive hover:bg-destructive/10"
										onclick={() => {
											editor.removeLink('link', row.key);
											openKey = null;
										}}
										><Trash2 class="h-4 w-4" aria-hidden="true" />Delete link</button
									>
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">
				Your newsletter, a launch, a booking page: anything you want people to tap.
			</p>
		{/if}
		<button
			type="button"
			class="{textButtonClass} mt-1.5"
			disabled={full}
			onclick={() => add('link')}
		>
			<Plus class="h-4 w-4" aria-hidden="true" />Add link
		</button>
		{#if full}
			<p class="text-xs text-muted-foreground">
				That's the most a page holds ({LIMITS.links}).
			</p>
		{/if}
	</section>

	{#if editor.linksError}
		<p class="text-sm text-destructive" role="alert">{editor.linksError}</p>
	{/if}
</div>
