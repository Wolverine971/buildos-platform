<!--
	Project workspace brief hub.

	The daily operating brief is the default view. The canonical Start Here document
	remains one tab away, so "Brief" has one predictable home instead of opening an
	editor without context.
-->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { handleRovingTabKeydown } from '$lib/components/project/v2/board-a11y';
	import { renderMarkdown } from '$lib/utils/markdown';
	import type { Document } from '$lib/types/onto';
	import { BookOpen, CalendarDays, FileText, LoaderCircle } from '$lib/icons/lucide';

	type BriefTab = 'daily' | 'start-here';
	type LatestProjectBrief = {
		id: string;
		project_id: string;
		brief_content: string;
		brief_date: string | null;
		generation_status: string | null;
		generation_error: string | null;
		metadata: Record<string, unknown> | null;
		created_at: string;
		updated_at: string;
	};

	let {
		isOpen,
		projectId,
		contextDocument,
		canEdit = false,
		onClose,
		onOpenStartHere
	}: {
		isOpen: boolean;
		projectId: string;
		contextDocument: Document | null;
		canEdit?: boolean;
		onClose: () => void;
		onOpenStartHere: (documentId: string) => void;
	} = $props();

	const TAB_ORDER: BriefTab[] = ['daily', 'start-here'];
	let activeTab = $state<BriefTab>('daily');
	let tabButtons = $state<Array<HTMLButtonElement | null>>([]);
	let latestBrief = $state<LatestProjectBrief | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let loadedProjectId = $state<string | null>(null);

	function selectTab(tab: BriefTab) {
		activeTab = tab;
	}

	function handleTabKeydown(event: KeyboardEvent, index: number) {
		handleRovingTabKeydown(
			event,
			index,
			TAB_ORDER.length,
			(nextIndex) => selectTab(TAB_ORDER[nextIndex]!),
			(nextIndex) => tabButtons[nextIndex]?.focus()
		);
	}

	function formatBriefDate(value: string | null | undefined): string {
		if (!value) return 'Latest available brief';
		const date = new Date(`${value}T12:00:00`);
		if (Number.isNaN(date.getTime())) return 'Latest available brief';
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	async function loadLatestBrief() {
		if (!projectId || loadedProjectId === projectId || loading) return;
		loading = true;
		error = null;
		try {
			const response = await fetch(`/api/projects/${projectId}/briefs/latest`, {
				credentials: 'same-origin'
			});
			const result = await response.json().catch(() => null);
			if (!response.ok || !result?.success) {
				throw new Error(result?.message || 'Failed to load the daily brief');
			}
			latestBrief = (result.data?.brief as LatestProjectBrief | null | undefined) ?? null;
			loadedProjectId = projectId;
		} catch (loadError) {
			error =
				loadError instanceof Error ? loadError.message : 'Failed to load the daily brief';
		} finally {
			loading = false;
		}
	}

	function openStartHereDocument() {
		if (!contextDocument?.id) return;
		onClose();
		onOpenStartHere(contextDocument.id);
	}

	$effect(() => {
		if (!isOpen) return;
		void loadLatestBrief();
	});
</script>

<Modal {isOpen} {onClose} title="Brief / Start Here" size="lg" ariaLabel="Brief / Start Here">
	<div class="min-h-[24rem]">
		<div
			class="sticky top-0 z-10 border-b border-border bg-card px-3 sm:px-5"
			role="tablist"
			aria-label="Project brief views"
		>
			<div class="flex gap-1">
				<button
					bind:this={tabButtons[0]}
					type="button"
					role="tab"
					id="project-brief-tab-daily"
					aria-selected={activeTab === 'daily'}
					aria-controls="project-brief-panel-daily"
					tabindex={activeTab === 'daily' ? 0 : -1}
					onclick={() => selectTab('daily')}
					onkeydown={(event) => handleTabKeydown(event, 0)}
					class:brief-tab-active={activeTab === 'daily'}
					class="brief-tab"
				>
					<CalendarDays class="h-4 w-4" />
					Daily Brief
				</button>
				<button
					bind:this={tabButtons[1]}
					type="button"
					role="tab"
					id="project-brief-tab-start-here"
					aria-selected={activeTab === 'start-here'}
					aria-controls="project-brief-panel-start-here"
					tabindex={activeTab === 'start-here' ? 0 : -1}
					onclick={() => selectTab('start-here')}
					onkeydown={(event) => handleTabKeydown(event, 1)}
					class:brief-tab-active={activeTab === 'start-here'}
					class="brief-tab"
				>
					<BookOpen class="h-4 w-4" />
					Start Here Document
				</button>
			</div>
		</div>

		{#if activeTab === 'daily'}
			<div
				id="project-brief-panel-daily"
				role="tabpanel"
				aria-labelledby="project-brief-tab-daily"
				class="px-4 py-5 sm:px-6 sm:py-6"
			>
				{#if loading}
					<div
						class="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"
					>
						<LoaderCircle class="h-4 w-4 animate-spin motion-reduce:animate-none" />
						Loading the latest daily brief…
					</div>
				{:else if error}
					<div
						class="mx-auto flex min-h-64 max-w-md flex-col items-center justify-center text-center"
					>
						<p class="font-medium text-foreground">
							The daily brief could not be loaded.
						</p>
						<p class="mt-1 text-sm text-muted-foreground">{error}</p>
						<Button
							variant="outline"
							size="sm"
							class="mt-4"
							onclick={() => {
								loadedProjectId = null;
								void loadLatestBrief();
							}}>Try again</Button
						>
					</div>
				{:else if latestBrief}
					<div class="brief-document relative mx-auto max-w-3xl">
						<div
							class="brief-utility mb-3 flex justify-end sm:absolute sm:right-0 sm:top-0 sm:z-[1] sm:mb-0"
						>
							<time
								datetime={latestBrief.brief_date ?? latestBrief.created_at}
								class="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border/70 bg-card/90 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm"
								aria-label={`Brief date: ${formatBriefDate(latestBrief.brief_date)}`}
							>
								<CalendarDays class="h-3.5 w-3.5" />
								{formatBriefDate(latestBrief.brief_date)}
							</time>
						</div>
						<div
							class="brief-prose prose prose-sm max-w-none overflow-x-auto break-words"
						>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html renderMarkdown(latestBrief.brief_content)}
						</div>
					</div>
				{:else}
					<div
						class="mx-auto flex min-h-64 max-w-md flex-col items-center justify-center text-center"
					>
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground"
						>
							<FileText class="h-5 w-5" />
						</div>
						<p class="mt-3 font-medium text-foreground">No daily brief yet</p>
						<p class="mt-1 text-sm text-muted-foreground">
							The latest generated brief for this project will appear here.
						</p>
					</div>
				{/if}
			</div>
		{:else}
			<div
				id="project-brief-panel-start-here"
				role="tabpanel"
				aria-labelledby="project-brief-tab-start-here"
				class="px-4 py-5 sm:px-6 sm:py-6"
			>
				{#if contextDocument}
					<div class="brief-document relative mx-auto max-w-3xl">
						<div
							class="brief-utility mb-3 flex justify-end sm:absolute sm:right-0 sm:top-0 sm:z-[1] sm:mb-0"
						>
							<Button
								variant="outline"
								size="sm"
								icon={FileText}
								onclick={openStartHereDocument}
							>
								{canEdit ? 'Open document' : 'View document'}
							</Button>
						</div>
						{#if contextDocument.content?.trim()}
							<div
								class="brief-prose prose prose-sm max-w-none overflow-x-auto break-words"
							>
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html renderMarkdown(contextDocument.content)}
							</div>
						{:else}
							<p class="py-12 text-center text-sm text-muted-foreground">
								This Start Here document does not have any content yet.
							</p>
						{/if}
					</div>
				{:else}
					<div
						class="mx-auto flex min-h-64 max-w-md flex-col items-center justify-center text-center"
					>
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground"
						>
							<BookOpen class="h-5 w-5" />
						</div>
						<p class="mt-3 font-medium text-foreground">No Start Here document yet</p>
						<p class="mt-1 text-sm text-muted-foreground">
							Create one to give this project a durable source of truth.
						</p>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</Modal>

<style>
	.brief-tab {
		display: inline-flex;
		min-height: 48px;
		align-items: center;
		gap: 0.5rem;
		border-bottom: 2px solid transparent;
		padding: 0.75rem 0.875rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
		font-weight: 600;
		transition:
			border-color 120ms ease,
			color 120ms ease,
			background-color 120ms ease;
	}

	.brief-tab:hover {
		background: hsl(var(--muted) / 0.5);
		color: hsl(var(--foreground));
	}

	.brief-tab:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}

	.brief-tab-active {
		border-bottom-color: hsl(var(--accent));
		color: hsl(var(--foreground));
	}

	.brief-prose :global(h1),
	.brief-prose :global(h2),
	.brief-prose :global(h3),
	.brief-prose :global(p),
	.brief-prose :global(li),
	.brief-prose :global(strong) {
		color: hsl(var(--foreground));
	}

	.brief-prose :global(a) {
		color: hsl(var(--accent));
	}

	.brief-prose :global(blockquote) {
		color: hsl(var(--muted-foreground));
	}

	.brief-prose :global(hr) {
		border-color: hsl(var(--border));
	}

	@media (min-width: 640px) {
		.brief-document .brief-prose :global(h1:first-child) {
			padding-right: 11rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.brief-tab {
			transition: none;
		}
	}
</style>
