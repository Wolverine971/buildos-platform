<!-- apps/web/src/lib/components/project/ProjectMemoryCard.svelte -->
<!-- apps/web/src/lib/components/project/ProjectMemoryCard.svelte
	Compact "Start here / project memory" snapshot (activation plan Phase 2,
	docs/product/activation-start-here-daily-brief-plan-2026-07-10.md). Previews
	the managed status region + orientation from the canonical Start Here
	document and deep-links into it — it never clones the document content into
	a second persistent surface. /today keeps ownership of event-level "what
	changed" receipts. -->
<script lang="ts">
	import { BookOpen, Compass, MessageSquare } from '$lib/icons/lucide';
	import {
		extractStartHereOrientation,
		parseStartHereStatusRegion
	} from '@buildos/shared-agent-ops/ontology/start-here';
	import { formatRelativeTime } from '$lib/utils/date-utils';
	import type { Document } from '$lib/types/onto';

	let {
		document,
		contentLoading = false,
		nextStepShort = null,
		showNextStep = true,
		variant = 'card',
		canEdit = false,
		onOpenStartHere,
		onUpdateProject,
		onShown
	}: {
		document: Document | null;
		contentLoading?: boolean;
		nextStepShort?: string | null;
		showNextStep?: boolean;
		variant?: 'card' | 'flat';
		canEdit?: boolean;
		onOpenStartHere: (docId: string) => void;
		onUpdateProject?: (() => void) | undefined;
		onShown?:
			| ((info: { documentId: string; rendered: boolean; freshness: string }) => void)
			| undefined;
	} = $props();

	// Prefer content column, fall back to props.body_markdown for backwards
	// compatibility (same resolution as DocumentModal).
	const content = $derived.by(() => {
		if (typeof document?.content === 'string') return document.content;
		const legacyBody = (document?.props as Record<string, unknown> | undefined)?.body_markdown;
		return typeof legacyBody === 'string' ? legacyBody : null;
	});
	const status = $derived(content ? parseStartHereStatusRegion(content) : null);
	const orientation = $derived(content ? extractStartHereOrientation(content, 220) : null);
	const nextStep = $derived(showNextStep ? (status?.nextStep ?? nextStepShort ?? null) : null);
	const rendered = $derived(status?.rendered === true);

	// Freshness favors authored activity over managed-refresh noise: a doc
	// update meaningfully after the last snapshot means a human/agent wrote
	// memory; otherwise report the snapshot refresh itself.
	const freshness = $derived.by(
		(): { kind: 'authored' | 'refreshed' | 'never'; at: string | null } => {
			const refreshedAt = status?.refreshedAt ?? null;
			const updatedAt = document?.updated_at ?? null;
			const refreshedMs = refreshedAt ? Date.parse(refreshedAt) : NaN;
			const updatedMs = updatedAt ? Date.parse(updatedAt) : NaN;
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
		if (freshness.kind === 'authored')
			return `Memory updated ${formatRelativeTime(freshness.at)}`;
		if (freshness.kind === 'refreshed')
			return `Auto-refreshed ${formatRelativeTime(freshness.at)}`;
		return 'Not refreshed yet';
	});

	let shownForDocumentId: string | null = null;
	$effect(() => {
		if (!document?.id || content === null) return;
		if (shownForDocumentId === document.id) return;
		shownForDocumentId = document.id;
		onShown?.({ documentId: document.id, rendered, freshness: freshness.kind });
	});
</script>

{#if document}
	<section
		class={variant === 'flat'
			? 'border-t border-border pt-4'
			: 'overflow-hidden rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak'}
		aria-label="Project memory"
	>
		<div
			class="flex items-start justify-between gap-2 sm:gap-3 {variant === 'flat'
				? 'px-0 py-0'
				: 'px-3 py-2 sm:px-4 sm:py-3'}"
		>
			<div class="flex items-start gap-2 min-w-0">
				<div
					class="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"
				>
					<Compass class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
				</div>
				<div class="min-w-0">
					<div class="flex flex-wrap items-baseline gap-2">
						<p class="text-xs sm:text-sm font-semibold text-foreground">Start here</p>
						<p class="text-2xs text-muted-foreground sm:text-xs">{freshnessLabel}</p>
					</div>
					<p class="text-2xs text-muted-foreground sm:text-xs">
						What BuildOS remembers about this project
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1 sm:gap-2 shrink-0">
				{#if canEdit && onUpdateProject}
					<button
						type="button"
						onclick={onUpdateProject}
						class="flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-2xs font-medium text-accent transition-colors hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:px-2.5 sm:text-xs pressable"
					>
						<MessageSquare class="w-3.5 h-3.5" />
						<span class="hidden sm:inline">Update project</span>
						<span class="sm:hidden">Update</span>
					</button>
				{/if}
				<button
					type="button"
					onclick={() => onOpenStartHere(document.id)}
					class="flex min-h-[44px] items-center gap-1.5 rounded-md border border-border px-2 text-2xs font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:px-2.5 sm:text-xs pressable"
				>
					<BookOpen class="w-3.5 h-3.5" />
					<span class="hidden sm:inline">Open Start Here</span>
					<span class="sm:hidden">Open</span>
				</button>
			</div>
		</div>

		{#if content === null && contentLoading}
			<div
				class="space-y-1.5 {variant === 'flat'
					? 'px-0 pt-3'
					: 'px-3 pb-2.5 sm:px-4 sm:pb-3'}"
			>
				<div
					class="h-3 w-3/4 animate-pulse rounded bg-muted/40 motion-reduce:animate-none"
				></div>
				<div
					class="h-3 w-1/2 animate-pulse rounded bg-muted/40 motion-reduce:animate-none"
				></div>
			</div>
		{:else if content !== null}
			<div
				class="space-y-1 {variant === 'flat' ? 'px-0 pt-3' : 'px-3 pb-2.5 sm:px-4 sm:pb-3'}"
			>
				{#if rendered && status?.now}
					<p class="text-xs sm:text-sm text-foreground">
						<span class="font-medium text-muted-foreground">Now:</span>
						{status.now}
					</p>
				{/if}
				{#if nextStep}
					<p class="text-xs sm:text-sm text-foreground">
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
						This project's memory hasn't been refreshed yet — it fills in as you work.
					</p>
				{/if}
			</div>
		{/if}
	</section>
{/if}
