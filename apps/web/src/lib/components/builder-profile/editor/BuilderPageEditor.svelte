<!-- apps/web/src/lib/components/builder-profile/editor/BuilderPageEditor.svelte -->
<!--
	Profile > People & agents > Your page: the owner's editor for build-os.com/@handle.
	Status and Publish on top; then Header, Links, Projects, Weekly update and Sections.
	At wide widths a phone-size live preview rides along on the right; narrower, a
	Preview button opens it full screen. Spec: docs/specs/BUILDER_PROFILE_SPEC_2026-10-23.md
-->
<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { AlertCircle, Eye, Globe } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import SettingsCard from '$lib/components/profile/_shared/SettingsCard.svelte';
	import { BuilderPageEditorState } from './builder-editor-state.svelte';
	import PageStatusBar from './PageStatusBar.svelte';
	import HeaderEditor from './HeaderEditor.svelte';
	import LinksEditor from './LinksEditor.svelte';
	import ProjectsEditor from './ProjectsEditor.svelte';
	import WeeklyUpdateEditor from './WeeklyUpdateEditor.svelte';
	import SectionToggles from './SectionToggles.svelte';
	import PreviewPane from './PreviewPane.svelte';

	let {
		revision = 0,
		onstatuschange
	}: {
		/** Bumped by the host when the handle changes above, so the address and preview catch up. */
		revision?: number;
		/** After Publish or Take down; the host refreshes the handle settings above. */
		onstatuschange?: (status: 'draft' | 'published') => void;
	} = $props();

	const editor = new BuilderPageEditorState();
	editor.onstatuschange = (status) => onstatuschange?.(status);

	let previewOpen = $state(false);
	let previewColumn = $state<HTMLElement | null>(null);
	let previewFollower = $state<HTMLElement | null>(null);
	let seenRevision = untrack(() => revision);

	const unsaved = $derived(editor.linksDirty || editor.projectsDirty);

	onMount(() => {
		void editor.load();
	});

	onDestroy(() => editor.dispose());

	$effect(() => {
		const next = revision;
		if (next === seenRevision) return;
		seenRevision = next;
		void editor.refreshIdentity();
	});

	// Warn before leaving with links or projects not yet saved.
	$effect(() => {
		if (!unsaved) return;
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
		};
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	});

	// Keep the preview in view while the editor scrolls. position: sticky is inert in this
	// app (body and .layout-root set overflow-x: hidden, which makes them scroll containers
	// that never scroll), so the preview follows with a transform inside its column.
	$effect(() => {
		const column = previewColumn;
		const follower = previewFollower;
		if (!column || !follower) return;
		const GAP = 16;
		let frame = 0;
		const place = () => {
			frame = 0;
			if (column.offsetParent === null) {
				follower.style.transform = '';
				return;
			}
			const room = column.offsetHeight - follower.offsetHeight;
			const shift = Math.max(0, Math.min(room, GAP - column.getBoundingClientRect().top));
			follower.style.transform = shift > 0 ? `translate3d(0, ${Math.round(shift)}px, 0)` : '';
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(place);
		};
		document.addEventListener('scroll', schedule, { capture: true, passive: true });
		window.addEventListener('resize', schedule);
		const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
		observer?.observe(column);
		schedule();
		return () => {
			if (frame) cancelAnimationFrame(frame);
			document.removeEventListener('scroll', schedule, { capture: true });
			window.removeEventListener('resize', schedule);
			observer?.disconnect();
		};
	});
</script>

<SettingsCard
	title="Your page"
	description="A public page for you and what you're building, at build-os.com/@handle. Private until you publish."
	icon={Globe}
	labelledById="hub-your-page-heading"
>
	{#if editor.loading}
		<div class="space-y-4" aria-busy="true">
			<div class="h-20 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"></div>
			<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_392px]">
				<div class="space-y-3">
					<div class="h-5 w-24 rounded bg-muted"></div>
					<div class="h-11 rounded-md bg-muted"></div>
					<div class="h-11 rounded-md bg-muted"></div>
					<div class="h-24 rounded-md bg-muted"></div>
				</div>
				<div class="hidden h-96 rounded-xl bg-muted xl:block"></div>
			</div>
			<p class="text-sm text-muted-foreground">Loading your page…</p>
		</div>
	{:else if editor.loadError}
		<div
			class="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground"
			role="alert"
		>
			<AlertCircle class="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
			<span class="min-w-0 flex-1">{editor.loadError}</span>
			<Button variant="outline" size="sm" onclick={() => editor.load()}>Try again</Button>
		</div>
	{:else}
		<div class="space-y-5">
			<PageStatusBar {editor} onpreview={() => (previewOpen = true)} />

			<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_392px]">
				<div class="min-w-0 space-y-6">
					<HeaderEditor {editor} />
					<LinksEditor {editor} />
					<ProjectsEditor {editor} />
					<WeeklyUpdateEditor {editor} />
					<SectionToggles {editor} />
					<div class="border-t border-border pt-4 xl:hidden">
						<Button variant="outline" size="sm" icon={Eye} onclick={() => (previewOpen = true)}
							>Preview your page</Button
						>
					</div>
				</div>

				<aside bind:this={previewColumn} class="hidden min-w-0 xl:block" aria-label="Live preview">
					<div bind:this={previewFollower} class="will-change-transform">
						<PreviewPane {editor} />
					</div>
				</aside>
			</div>
		</div>
	{/if}
</SettingsCard>

<Modal
	bind:isOpen={previewOpen}
	onClose={() => (previewOpen = false)}
	title="Preview"
	size="full"
	variant="bottom-sheet"
	presentation="immersive"
>
	<div class="p-3 sm:p-4">
		<PreviewPane {editor} framed={false} />
	</div>
</Modal>
