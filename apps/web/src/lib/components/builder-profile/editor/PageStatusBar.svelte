<!-- apps/web/src/lib/components/builder-profile/editor/PageStatusBar.svelte -->
<!-- Top of "Your page": Draft or Live, the page's address with Copy and View page, and
     Publish / Take down. Without a handle, it points up to the handle field. -->
<script lang="ts">
	import { Check, Copy, ExternalLink, Eye } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import type { BuilderPageEditorState } from './builder-editor-state.svelte';

	let {
		editor,
		onpreview
	}: {
		editor: BuilderPageEditorState;
		/** Opens the full-screen preview (below the two-column width). */
		onpreview: () => void;
	} = $props();

	let copied = $state(false);
	let copyError = $state<string | null>(null);

	const live = $derived(editor.status === 'published');
	const shownAddress = $derived.by(() => {
		if (!editor.pageUrl) return null;
		try {
			const url = new URL(editor.pageUrl);
			return `${url.host}${url.pathname}`;
		} catch {
			return `build-os.com/@${editor.handle}`;
		}
	});

	async function copyLink() {
		if (!editor.pageUrl) return;
		copyError = null;
		try {
			await navigator.clipboard.writeText(editor.pageUrl);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			copyError = `Copy this link: ${editor.pageUrl}`;
		}
	}

	const linkButtonClass =
		'inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border-strong bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none';
</script>

<div
	class="space-y-3 rounded-lg border p-3 sm:p-4 {live
		? 'border-success/40 bg-success/5'
		: 'border-dashed border-border-strong bg-background'}"
>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex min-w-0 items-center gap-2.5">
			<span
				class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold {live
					? 'border-success/50 text-success'
					: 'border-border-strong text-muted-foreground'}"
			>
				<span
					class="h-1.5 w-1.5 rounded-full {live ? 'bg-success' : 'bg-muted-foreground'}"
					aria-hidden="true"
				></span>
				{live ? 'Live' : 'Draft'}
			</span>
			{#if shownAddress}
				<span class="truncate font-mono text-sm text-foreground">{shownAddress}</span>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-2">
			{#if editor.handle}
				<button type="button" class={linkButtonClass} onclick={copyLink}>
					{#if copied}
						<Check class="h-4 w-4" aria-hidden="true" />Copied
					{:else}
						<Copy class="h-4 w-4" aria-hidden="true" />Copy
					{/if}
				</button>
				<a
					href="/@{editor.handle}"
					target="_blank"
					rel="noopener"
					class={linkButtonClass}
				>
					<ExternalLink class="h-4 w-4" aria-hidden="true" />View page<span class="sr-only">
						(opens in a new tab)</span
					>
				</a>
			{/if}
			<button type="button" class="{linkButtonClass} xl:hidden" onclick={onpreview}>
				<Eye class="h-4 w-4" aria-hidden="true" />Preview
			</button>
			{#if live}
				<Button
					variant="outline"
					size="sm"
					loading={editor.publishBusy}
					disabled={editor.publishBusy}
					onclick={() => editor.setPublished(false)}>Take down</Button
				>
			{:else}
				<Button
					variant="primary"
					size="sm"
					loading={editor.publishBusy}
					disabled={editor.publishBusy || !editor.handle}
					onclick={() => editor.setPublished(true)}>Publish</Button
				>
			{/if}
		</div>
	</div>

	{#if !editor.handle}
		<p class="text-sm text-foreground">
			<a href="#you" class="font-semibold text-accent underline-offset-2 hover:underline"
				>Pick a handle above.</a
			>
			Your page lives at build-os.com/@handle.
		</p>
	{:else if live}
		<p class="text-sm text-muted-foreground">
			Your page is live. Changes show up there as soon as they save.
		</p>
	{:else}
		<p class="text-sm text-muted-foreground">
			Nothing is public until you publish. Publishing also lets people find you by @handle.
		</p>
	{/if}

	{#if editor.publishError}
		<p class="text-sm text-destructive" role="alert">{editor.publishError}</p>
	{/if}
	{#if copyError}
		<p class="break-all text-sm text-foreground" role="status">{copyError}</p>
	{/if}
</div>
