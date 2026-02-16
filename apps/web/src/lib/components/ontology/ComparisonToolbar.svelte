<!-- apps/web/src/lib/components/ontology/ComparisonToolbar.svelte -->
<!--
	Version comparison navigation toolbar.
	Sits at the top of the content area when comparison mode is active.
	Provides prev/next navigation, compare target toggle, view mode toggle, and exit.

	Inkprint design tokens. Svelte 5 runes.
-->
<script lang="ts">
	import {
		ChevronLeft,
		ChevronRight,
		X,
		ArrowRight,
		Columns2,
		AlignJustify
	} from 'lucide-svelte';

	interface Props {
		fromVersion: number | null;
		toVersion: number | 'current';
		latestVersionNumber: number;
		viewMode: 'unified' | 'split';
		isLoading?: boolean;
		onPrev: () => void;
		onNext: () => void;
		onToggleTarget: (target: 'previous' | 'current') => void;
		onToggleViewMode: () => void;
		onExit: () => void;
	}

	let {
		fromVersion,
		toVersion,
		latestVersionNumber,
		viewMode,
		isLoading = false,
		onPrev,
		onNext,
		onToggleTarget,
		onToggleViewMode,
		onExit
	}: Props = $props();

	// Derive the selected version number (the "to" side in previous mode, or "from" in current mode)
	const selectedVersion = $derived(toVersion === 'current' ? fromVersion : toVersion);
	const compareTarget = $derived<'previous' | 'current'>(
		toVersion === 'current' ? 'current' : 'previous'
	);

	// Navigation boundaries
	const canGoPrev = $derived(selectedVersion !== null && selectedVersion > 1);
	const canGoNext = $derived(selectedVersion !== null && selectedVersion < latestVersionNumber);

	// Labels
	const fromLabel = $derived(fromVersion === null ? 'Empty' : `v${fromVersion}`);
	const toLabel = $derived(toVersion === 'current' ? 'Current' : `v${toVersion}`);
</script>

<div
	class="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted border-b border-border tx tx-strip tx-weak wt-paper"
>
	<!-- Navigation: Prev / Version Labels / Next -->
	<div class="flex items-center gap-1">
		<button
			type="button"
			onclick={onPrev}
			disabled={!canGoPrev || isLoading}
			class="flex h-7 w-7 items-center justify-center rounded border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:text-foreground hover:border-accent/50 disabled:opacity-30 disabled:cursor-not-allowed"
			aria-label="Previous version"
			title="Previous version"
		>
			<ChevronLeft class="w-4 h-4" />
		</button>

		<div class="flex items-center gap-1.5 px-2 min-w-0">
			<span
				class="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap"
			>
				{fromLabel}
			</span>
			<ArrowRight class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
			<span
				class="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap"
			>
				{toLabel}
			</span>
		</div>

		<button
			type="button"
			onclick={onNext}
			disabled={!canGoNext || isLoading}
			class="flex h-7 w-7 items-center justify-center rounded border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:text-foreground hover:border-accent/50 disabled:opacity-30 disabled:cursor-not-allowed"
			aria-label="Next version"
			title="Next version"
		>
			<ChevronRight class="w-4 h-4" />
		</button>
	</div>

	<!-- Separator -->
	<div class="w-px h-5 bg-border hidden sm:block"></div>

	<!-- Compare target toggle -->
	<div class="flex items-center gap-0.5 rounded-md border border-border bg-card shadow-ink">
		<button
			type="button"
			onclick={() => onToggleTarget('previous')}
			disabled={isLoading}
			class="px-2 py-1 text-[10px] font-medium rounded-l-md transition-colors {compareTarget ===
			'previous'
				? 'bg-accent text-accent-foreground'
				: 'text-muted-foreground hover:text-foreground hover:bg-muted'}"
		>
			Previous
		</button>
		<button
			type="button"
			onclick={() => onToggleTarget('current')}
			disabled={isLoading}
			class="px-2 py-1 text-[10px] font-medium rounded-r-md transition-colors {compareTarget ===
			'current'
				? 'bg-accent text-accent-foreground'
				: 'text-muted-foreground hover:text-foreground hover:bg-muted'}"
		>
			Current
		</button>
	</div>

	<!-- Spacer -->
	<div class="flex-1"></div>

	<!-- View mode toggle (desktop only) -->
	<div
		class="hidden lg:flex items-center gap-0.5 rounded-md border border-border bg-card shadow-ink"
	>
		<button
			type="button"
			onclick={onToggleViewMode}
			disabled={isLoading}
			class="px-2 py-1 text-[10px] font-medium rounded-l-md transition-colors flex items-center gap-1 {viewMode ===
			'unified'
				? 'bg-accent text-accent-foreground'
				: 'text-muted-foreground hover:text-foreground hover:bg-muted'}"
			title="Unified view"
		>
			<AlignJustify class="w-3 h-3" />
			Unified
		</button>
		<button
			type="button"
			onclick={onToggleViewMode}
			disabled={isLoading}
			class="px-2 py-1 text-[10px] font-medium rounded-r-md transition-colors flex items-center gap-1 {viewMode ===
			'split'
				? 'bg-accent text-accent-foreground'
				: 'text-muted-foreground hover:text-foreground hover:bg-muted'}"
			title="Split view"
		>
			<Columns2 class="w-3 h-3" />
			Split
		</button>
	</div>

	<!-- Exit button -->
	<button
		type="button"
		onclick={onExit}
		class="flex h-7 items-center gap-1 px-2 rounded border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:text-foreground hover:border-red-500/50 hover:text-red-500"
		aria-label="Exit comparison mode"
		title="Exit comparison"
	>
		<X class="w-3.5 h-3.5" />
		<span class="text-[10px] font-medium hidden sm:inline">Exit</span>
	</button>
</div>
