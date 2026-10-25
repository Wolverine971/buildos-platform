<!-- apps/web/src/lib/components/builder-profile/editor/BuilderPageEditor.svelte -->
<!--
	The "Your page" editor (/profile/page). Top bar: status, address, save state,
	Publish. Left: one panel at a time (Profile, Links, Projects, Updates, Settings).
	Right: your page as visitors see it, updating as you type; click any part of it to
	open its panel. On a phone, Edit and Preview swap places.
	Spec: docs/specs/BUILDER_PROFILE_SPEC_2026-10-23.md
-->
<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { AlertCircle, ArrowLeft, Check, Copy, ExternalLink } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import type {
		BuilderEditorData,
		BuilderPageSection,
		BuilderProfileView
	} from '$lib/builder-profile/types';
	import BuilderProfilePage from '../BuilderProfilePage.svelte';
	import { BuilderPageEditorState } from './builder-editor-state.svelte';
	import Segmented from './Segmented.svelte';
	import ProfilePanel from './ProfilePanel.svelte';
	import LinksPanel from './LinksPanel.svelte';
	import ProjectsPanel from './ProjectsPanel.svelte';
	import UpdatesPanel from './UpdatesPanel.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import { iconButtonClass } from './editor-styles';
	import type { PreviewAudience } from './builder-editor';

	let {
		data,
		preview,
		origin,
		initialSection = 'profile',
		initialProjectId = null
	}: {
		data: BuilderEditorData;
		preview: BuilderProfileView | null;
		origin: string;
		initialSection?: BuilderPageSection;
		/** With the Projects section: open this project (from a project page's Edit). */
		initialProjectId?: string | null;
	} = $props();

	const editor = new BuilderPageEditorState();
	// The page arrives with its data; start from it (no spinner, no extra requests).
	// svelte-ignore state_referenced_locally
	editor.hydrate(data, preview, origin);
	// svelte-ignore state_referenced_locally
	const startProject = editor.placedRows.find((r) => r.project.project_id === initialProjectId);
	// svelte-ignore state_referenced_locally
	editor.open(initialSection, startProject?.project.project_id);

	const TABS: { id: BuilderPageSection; label: string }[] = [
		{ id: 'profile', label: 'Profile' },
		{ id: 'links', label: 'Links' },
		{ id: 'projects', label: 'Projects' },
		{ id: 'updates', label: 'Updates' },
		{ id: 'settings', label: 'Settings' }
	];
	const audienceOptions: { value: PreviewAudience; label: string }[] = [
		{ value: 'anyone', label: 'Anyone' },
		{ value: 'collaborators', label: 'People I work with' }
	];

	let mobileView = $state<'edit' | 'preview'>('edit');
	let panel = $state<HTMLElement | null>(null);
	let canvas = $state<HTMLElement | null>(null);
	let copied = $state(false);

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

	// Links and projects save a moment after they stop changing.
	$effect(() => {
		if (editor.linksKeyNow !== editor.savedLinksKey) editor.scheduleLinksSave();
	});
	$effect(() => {
		if (editor.projectsKeyNow !== editor.savedProjectsKey) editor.scheduleProjectsSave();
	});

	// Warn before closing the tab with a save still waiting; in-app navigation saves first.
	$effect(() => {
		if (!editor.unsaved) return;
		const warn = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	});
	beforeNavigate(() => {
		void editor.flush();
	});

	// Opening a part from the panel brings it into view on the page, if it's off screen.
	$effect(() => {
		void editor.section;
		void editor.openProjectId;
		const root = canvas;
		if (!root) return;
		void tick().then(() => {
			if (root.offsetParent === null) return;
			const target = root.querySelector<HTMLElement>('[role="button"][aria-pressed="true"]');
			if (!target) return;
			const box = target.getBoundingClientRect();
			const view = root.getBoundingClientRect();
			if (box.top >= view.top && box.bottom <= view.bottom) return;
			if (box.height > view.height && box.top < view.bottom && box.bottom > view.top) return;
			// Scroll the page pane only (scrollIntoView would move the whole window too).
			const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
			const offset =
				box.height > view.height ? 24 : Math.max(24, (view.height - box.height) / 2);
			root.scrollTo?.({
				top: root.scrollTop + box.top - view.top - offset,
				behavior: reduce ? 'auto' : 'smooth'
			});
		});
	});

	onDestroy(() => editor.dispose());

	async function openSection(section: BuilderPageSection, projectId?: string) {
		editor.open(section, projectId);
		mobileView = 'edit';
		await tick();
		panel?.scrollTo?.({ top: 0 });
	}

	function onTabKey(event: KeyboardEvent, index: number) {
		const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!delta) return;
		event.preventDefault();
		const next = TABS[(index + delta + TABS.length) % TABS.length]!;
		void openSection(next.id);
		document.getElementById(`page-tab-${next.id}`)?.focus();
	}

	async function copyLink() {
		if (!editor.pageUrl) return;
		try {
			await navigator.clipboard.writeText(editor.pageUrl);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			editor.saveMessage = `Copy this link: ${editor.pageUrl}`;
		}
	}
</script>

<div class="bpe flex flex-col">
	<!-- Top bar -->
	<header
		class="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-border px-2 py-2 sm:px-3"
	>
		<a href="/profile?tab=people" class={iconButtonClass} aria-label="Back to Profile">
			<ArrowLeft class="h-5 w-5" aria-hidden="true" />
		</a>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<h1 class="whitespace-nowrap text-base font-semibold text-foreground">Your page</h1>
				<span
					class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-px text-xs font-semibold {live
						? 'border-success/50 text-success'
						: 'border-border-strong text-muted-foreground'}"
				>
					<span
						class="h-1.5 w-1.5 rounded-full {live
							? 'bg-success'
							: 'bg-muted-foreground'}"
						aria-hidden="true"
					></span>
					{live ? 'Live' : 'Draft'}
				</span>
			</div>
			{#if shownAddress}
				<p class="truncate font-mono text-xs text-muted-foreground">{shownAddress}</p>
			{/if}
		</div>

		<span class="hidden min-w-[4.5rem] text-right text-xs sm:inline" aria-live="polite">
			{#if editor.saveState === 'saving'}
				<span class="text-muted-foreground">Saving…</span>
			{:else if editor.saveState === 'saved'}
				<span class="inline-flex items-center gap-1 text-success"
					><Check class="h-3.5 w-3.5" aria-hidden="true" />Saved</span
				>
			{:else if editor.saveState === 'error'}
				<span class="inline-flex items-center gap-1 text-destructive"
					><AlertCircle class="h-3.5 w-3.5" aria-hidden="true" />Not saved</span
				>
			{/if}
		</span>

		{#if editor.handle}
			<button
				type="button"
				class={iconButtonClass}
				onclick={copyLink}
				aria-label={copied ? 'Link copied' : 'Copy link to your page'}
				title="Copy link"
			>
				{#if copied}<Check class="h-4 w-4 text-success" aria-hidden="true" />{:else}<Copy
						class="h-4 w-4"
						aria-hidden="true"
					/>{/if}
			</button>
			<a
				href="/@{editor.handle}"
				target="_blank"
				rel="noopener"
				class={iconButtonClass}
				aria-label="Open your page in a new tab"
				title="Open your page"
			>
				<ExternalLink class="h-4 w-4" aria-hidden="true" />
			</a>
		{/if}
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
	</header>

	{#if editor.publishError || (editor.saveState === 'error' && editor.saveMessage) || !editor.handle}
		<div class="border-b border-border bg-muted/40 px-4 py-2 text-sm" role="status">
			{#if editor.publishError}
				<p class="text-destructive">{editor.publishError}</p>
			{:else if editor.saveState === 'error' && editor.saveMessage}
				<p class="text-destructive">{editor.saveMessage}</p>
			{:else}
				<p class="text-foreground">
					Pick your address first.
					<button
						type="button"
						class="font-semibold text-accent underline-offset-2 hover:underline"
						onclick={() => openSection('settings')}>Choose a handle</button
					>
				</p>
			{/if}
		</div>
	{:else if !live}
		<p class="border-b border-border bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
			Only you can see this page until you publish. Publishing also lets people find you by @{editor.handle}.
		</p>
	{/if}

	<!-- Phone: Edit and Preview swap places -->
	<div class="border-b border-border px-3 py-2 lg:hidden">
		<Segmented
			options={[
				{ value: 'edit', label: 'Edit' },
				{ value: 'preview', label: 'Preview' }
			]}
			value={mobileView}
			label="Edit or preview"
			class="w-full [&>button]:flex-1"
			onchange={(value) => (mobileView = value)}
		/>
	</div>

	<div class="bpe-body flex min-h-0 flex-1">
		<aside
			class="{mobileView === 'preview'
				? 'hidden'
				: 'flex'} min-h-0 w-full shrink-0 flex-col border-border lg:flex lg:w-[27rem] lg:border-r xl:w-[29rem]"
			aria-label="Edit your page"
		>
			<div class="border-b border-border px-2">
				<div
					class="flex gap-0.5 overflow-x-auto py-1.5"
					role="tablist"
					aria-label="Parts of your page"
				>
					{#each TABS as tab, index (tab.id)}
						{@const selected = editor.section === tab.id}
						<button
							id="page-tab-{tab.id}"
							type="button"
							role="tab"
							aria-selected={selected}
							aria-controls="page-panel"
							tabindex={selected ? 0 : -1}
							class="relative inline-flex min-h-10 flex-1 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none {selected
								? 'bg-muted text-foreground'
								: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}"
							onclick={() => openSection(tab.id)}
							onkeydown={(event) => onTabKey(event, index)}
						>
							{tab.label}
							{#if tab.id === 'updates' && editor.drafts.length}
								<span
									class="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-2xs font-semibold text-accent-foreground"
									aria-label="{editor.drafts.length} waiting"
									>{editor.drafts.length}</span
								>
							{/if}
						</button>
					{/each}
				</div>
			</div>
			<div
				bind:this={panel}
				id="page-panel"
				role="tabpanel"
				aria-labelledby="page-tab-{editor.section}"
				class="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-5 sm:px-6"
			>
				{#if editor.section === 'profile'}
					<ProfilePanel {editor} />
				{:else if editor.section === 'links'}
					<LinksPanel {editor} />
				{:else if editor.section === 'projects'}
					<ProjectsPanel {editor} />
				{:else if editor.section === 'updates'}
					<UpdatesPanel {editor} />
				{:else}
					<SettingsPanel {editor} />
				{/if}
			</div>
		</aside>

		<main
			bind:this={canvas}
			class="{mobileView === 'edit'
				? 'hidden'
				: 'block'} min-w-0 flex-1 overflow-y-auto bg-bench bench-grain lg:block"
			aria-label="Your page"
		>
			<div class="mx-auto w-full max-w-[44rem] px-3 pb-12 pt-4 sm:px-6 sm:pt-6">
				<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
					<p class="text-xs text-muted-foreground">
						Click any part of your page to edit it.
					</p>
					<div class="flex items-center gap-2">
						<span class="micro-label" aria-hidden="true">Seen by</span>
						<Segmented
							options={audienceOptions}
							value={editor.previewAudience}
							label="Show the page as seen by"
							class="[&>button]:min-h-9 [&>button]:px-2.5 [&>button]:text-xs"
							onchange={(value) => (editor.previewAudience = value)}
						/>
					</div>
				</div>

				{#if editor.liveView}
					<BuilderProfilePage
						view={editor.liveView}
						origin={editor.origin}
						editing={{
							active: editor.section,
							activeProjectId: editor.openProjectId,
							onedit: (section, projectId) => openSection(section, projectId)
						}}
					/>
				{:else}
					<div
						class="grid min-h-80 place-items-center rounded-2xl border border-dashed border-border-strong bg-background/60 p-6 text-center"
					>
						<div class="space-y-2">
							<p class="text-sm font-semibold text-foreground">
								{editor.handle ? 'Your page will show here' : 'No address yet'}
							</p>
							<p class="text-sm text-muted-foreground">
								{editor.previewError ??
									(editor.handle
										? 'It shows once it loads.'
										: 'Pick a handle and your page appears here.')}
							</p>
							{#if !editor.handle}
								<Button
									variant="outline"
									size="sm"
									onclick={() => openSection('settings')}>Choose a handle</Button
								>
							{:else if editor.previewError}
								<Button
									variant="outline"
									size="sm"
									onclick={() => editor.refreshPreview()}>Try again</Button
								>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</main>
	</div>
</div>

<style>
	/* On a wide screen the editor fills the window below the app's nav, and the panel and
	   the page scroll on their own (position: sticky doesn't work in this app). */
	@media (min-width: 1024px) {
		.bpe {
			height: calc(100dvh - var(--bpe-offset, 6.5rem));
			min-height: 34rem;
		}
	}
</style>
