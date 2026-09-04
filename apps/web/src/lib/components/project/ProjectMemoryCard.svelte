<!-- apps/web/src/lib/components/project/ProjectMemoryCard.svelte -->
<!--
	A compact live projection of the canonical START HERE document. This surface
	never owns a second copy of project memory: it parses the managed status region
	and deep-links back to the document or a project-scoped agent conversation.
-->
<script lang="ts">
	import { BookOpen, Compass, LoaderCircle, MessageSquare, Sparkles } from '$lib/icons/lucide';
	import {
		extractStartHereOrientation,
		parseStartHereStatusRegion
	} from '@buildos/shared-agent-ops/ontology/start-here';
	import { formatRelativeTime } from '$lib/utils/date-utils';
	import type { Document } from '$lib/types/onto';

	let {
		document,
		contentLoading = false,
		creating = false,
		sourceUpdatedAt = null,
		nextStepShort = null,
		canEdit = false,
		onOpenStartHere,
		onUpdateProject,
		onCreateStartHere,
		onShown
	}: {
		document: Document | null;
		contentLoading?: boolean;
		creating?: boolean;
		sourceUpdatedAt?: string | null;
		nextStepShort?: string | null;
		canEdit?: boolean;
		onOpenStartHere: (documentId: string) => void;
		onUpdateProject?: () => void;
		onCreateStartHere?: () => void;
		onShown?: (info: {
			documentId: string;
			rendered: boolean;
			freshness: 'authored' | 'refreshed' | 'never';
		}) => void;
	} = $props();

	// `content` is authoritative. The props copy predates managed regions on many
	// documents, so falling back to it would make a refreshed document look stale.
	const content = $derived(typeof document?.content === 'string' ? document.content : null);
	const status = $derived(content ? parseStartHereStatusRegion(content) : null);
	const orientation = $derived(content ? extractStartHereOrientation(content, 220) : null);
	const nextStep = $derived(status?.nextStep ?? nextStepShort ?? null);
	const rendered = $derived(status?.rendered === true);
	const stale = $derived(
		Boolean(
			sourceUpdatedAt &&
				status?.refreshedAt &&
				Date.parse(sourceUpdatedAt) > Date.parse(status.refreshedAt)
		)
	);

	// A meaningful edit after the snapshot is fresher than machine refresh noise.
	// The one-minute buffer avoids classifying the same refresh transaction as an
	// authored update when database and worker timestamps differ slightly.
	const freshness = $derived.by(
		(): { kind: 'authored' | 'refreshed' | 'never'; at: string | null } => {
			const refreshedAt = status?.refreshedAt ?? null;
			const updatedAt = document?.updated_at ?? null;
			const refreshedMs = refreshedAt ? Date.parse(refreshedAt) : Number.NaN;
			const updatedMs = updatedAt ? Date.parse(updatedAt) : Number.NaN;
			if (
				Number.isFinite(updatedMs) &&
				Number.isFinite(refreshedMs) &&
				updatedMs > refreshedMs + 60_000
			) {
				return { kind: 'authored', at: updatedAt };
			}
			if (Number.isFinite(refreshedMs)) return { kind: 'refreshed', at: refreshedAt };
			return { kind: 'never', at: null };
		}
	);

	const freshnessLabel = $derived.by(() => {
		if (!document) return 'Missing';
		if (stale)
			return `Snapshot out of date · refreshed ${formatRelativeTime(status?.refreshedAt)}`;
		if (freshness.kind === 'authored') {
			return `Memory updated ${formatRelativeTime(freshness.at)}`;
		}
		if (freshness.kind === 'refreshed') {
			return `Auto-refreshed ${formatRelativeTime(freshness.at)}`;
		}
		return 'Not refreshed yet';
	});

	let shownForDocumentId: string | null = null;
	$effect(() => {
		if (!document?.id || content === null || shownForDocumentId === document.id) return;
		shownForDocumentId = document.id;
		onShown?.({
			documentId: document.id,
			rendered,
			freshness: freshness.kind
		});
	});
</script>

<section
	class="overflow-hidden rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak"
	aria-label="Project memory"
>
	<div class="flex items-start justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
		<div class="flex min-w-0 items-start gap-2">
			<div
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 sm:h-9 sm:w-9"
			>
				<Compass class="h-4 w-4 text-accent" />
			</div>
			<div class="min-w-0">
				<div class="flex flex-wrap items-baseline gap-2">
					<h2 class="text-xs font-semibold text-foreground sm:text-sm">Start here</h2>
					<p class="text-2xs text-muted-foreground sm:text-xs">{freshnessLabel}</p>
				</div>
				<p class="text-2xs text-muted-foreground sm:text-xs">
					What BuildOS remembers about this project
				</p>
			</div>
		</div>

		<div class="flex shrink-0 items-center gap-1 sm:gap-2">
			{#if !document && canEdit && onCreateStartHere}
				<button
					type="button"
					aria-label="Create Start Here"
					disabled={creating}
					onclick={onCreateStartHere}
					class="pressable flex min-h-11 items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-2 text-2xs font-medium text-accent transition-colors hover:bg-accent/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none sm:px-2.5 sm:text-xs"
				>
					{#if creating}
						<LoaderCircle class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
						<span>Creating…</span>
					{:else}
						<Sparkles class="h-3.5 w-3.5" />
						<span>Create Start Here</span>
					{/if}
				</button>
			{/if}
			{#if document && canEdit && onUpdateProject}
				<button
					type="button"
					aria-label="Update project memory"
					onclick={onUpdateProject}
					class="pressable flex min-h-11 items-center gap-1.5 rounded-md px-2 text-2xs font-medium text-accent transition-colors hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:px-2.5 sm:text-xs"
				>
					<MessageSquare class="h-3.5 w-3.5" />
					<span class="hidden sm:inline">Update project</span>
					<span class="sm:hidden">Update</span>
				</button>
			{/if}
			{#if document}
				<button
					type="button"
					aria-label="Open Start Here"
					onclick={() => onOpenStartHere(document.id)}
					class="pressable flex min-h-11 items-center gap-1.5 rounded-md border border-border px-2 text-2xs font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:px-2.5 sm:text-xs"
				>
					<BookOpen class="h-3.5 w-3.5" />
					<span class="hidden sm:inline">Open Start Here</span>
					<span class="sm:hidden">Open</span>
				</button>
			{/if}
		</div>
	</div>

	{#if !document}
		<div class="px-3 pb-3 sm:px-4">
			<p class="text-xs text-foreground sm:text-sm">Project memory is missing.</p>
			<p class="mt-0.5 text-2xs text-muted-foreground sm:text-xs">
				{canEdit && onCreateStartHere
					? 'Create the project index so people and agents have one reliable place to begin.'
					: 'This project does not have a Start Here index yet.'}
			</p>
		</div>
	{:else if content === null && contentLoading}
		<div class="space-y-1.5 px-3 pb-3 sm:px-4">
			<div
				class="h-3 w-3/4 animate-status-pulse rounded bg-muted/40 motion-reduce:animate-none"
			></div>
			<div
				class="h-3 w-1/2 animate-status-pulse rounded bg-muted/40 motion-reduce:animate-none"
			></div>
		</div>
	{:else if content !== null}
		<div class="space-y-1 px-3 pb-3 sm:px-4">
			{#if rendered && status?.now}
				<p class="text-xs text-foreground sm:text-sm">
					<span class="font-medium text-muted-foreground"
						>{stale ? 'At last refresh:' : 'Now:'}</span
					>
					{status.now}
				</p>
			{/if}
			{#if nextStep}
				<p class="text-xs text-foreground sm:text-sm">
					<span class="font-medium text-muted-foreground">Next step:</span>
					{nextStep}
				</p>
			{/if}
			{#if orientation}
				<p class="line-clamp-2 text-2xs text-muted-foreground sm:text-xs">
					{orientation}
				</p>
			{/if}
			{#if !rendered && !nextStep && !orientation}
				<p class="text-2xs text-muted-foreground sm:text-xs">
					This project's memory has not been refreshed yet. It fills in as the project
					changes.
				</p>
			{/if}
		</div>
	{/if}
</section>
