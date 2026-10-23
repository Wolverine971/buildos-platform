<!-- apps/web/src/lib/components/builder-profile/editor/PreviewPane.svelte -->
<!-- The live preview: your page as saved, rendered by the real page component, seen as
     "Anyone" (collaborator-only links and projects removed) or "People I work with".
     Framed like a phone in the side column; full width in the phone-size sheet. -->
<script lang="ts">
	import BuilderProfilePage from '../BuilderProfilePage.svelte';
	import Segmented from './Segmented.svelte';
	import type { PreviewAudience } from './builder-editor';
	import type { BuilderPageEditorState } from './builder-editor-state.svelte';

	let { editor, framed = true }: { editor: BuilderPageEditorState; framed?: boolean } = $props();

	const audienceOptions: { value: PreviewAudience; label: string }[] = [
		{ value: 'anyone', label: 'Anyone' },
		{ value: 'collaborators', label: 'People I work with' }
	];
</script>

<div class="space-y-2.5">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<span class="micro-label" aria-hidden="true">Preview as</span>
		<Segmented
			options={audienceOptions}
			value={editor.previewAudience}
			label="Preview as"
			onchange={(value) => (editor.previewAudience = value)}
		/>
	</div>

	<div
		class={framed
			? 'h-[min(760px,calc(100dvh-7rem))] overflow-y-auto overscroll-contain rounded-xl border border-border-strong bg-background shadow-ink'
			: 'min-h-[60dvh] bg-background'}
		aria-label="Preview of your page"
		role="region"
		aria-busy={editor.previewLoading}
	>
		{#if editor.previewLoading && !editor.preview}
			<div class="space-y-4 p-4" aria-hidden="true">
				<div class="h-20 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"></div>
				<div class="-mt-12 ml-2 h-16 w-16 rounded-full border-4 border-background bg-muted"></div>
				<div class="h-6 w-2/3 rounded bg-muted"></div>
				<div class="h-4 w-1/3 rounded bg-muted"></div>
				<div class="h-14 rounded-lg bg-muted"></div>
				<div class="h-24 rounded-lg bg-muted"></div>
			</div>
			<p class="sr-only">Loading the preview…</p>
		{:else if editor.previewView}
			<BuilderProfilePage view={editor.previewView} origin={editor.origin} preview />
		{:else if !editor.handle}
			<div class="grid h-full place-items-center p-6 text-center">
				<div class="space-y-1.5">
					<p class="text-sm font-semibold text-foreground">No address yet</p>
					<p class="text-sm text-muted-foreground">
						Pick a handle above to see your page here.
					</p>
				</div>
			</div>
		{:else}
			<div class="grid h-full place-items-center p-6 text-center">
				<p class="text-sm text-muted-foreground">
					{editor.previewError ?? 'The preview will show here once your page loads.'}
				</p>
			</div>
		{/if}
	</div>

	<p class="text-xs text-muted-foreground">
		Shows what's saved{editor.status === 'published'
			? ', exactly as visitors see it.'
			: '. Only you can see it until you publish.'}
		{#if editor.previewAudience === 'anyone'}
			Items for people you work with are left out.
		{/if}
	</p>
</div>
