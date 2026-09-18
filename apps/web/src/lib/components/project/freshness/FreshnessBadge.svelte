<!-- apps/web/src/lib/components/project/freshness/FreshnessBadge.svelte -->
<!--
	Quiet freshness badge for a task or document (Tasker 88 freshness radar).
	"May be out of date" offers "Not out of date"; "Updated automatically" offers Undo while the
	72-hour window is open. The panel is fixed-positioned so scroll containers (kanban columns)
	cannot clip it. Reads the page's freshness context; renders nothing without a flag.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import type { FreshnessEntityKind } from '@buildos/shared-types';
	import { Loader2, RotateCcw, X } from '$lib/icons/lucide';
	import {
		getProjectFreshnessContext,
		type FreshnessBadgeFlag
	} from './freshness-context.svelte';

	let {
		kind,
		id,
		flag: flagProp = undefined,
		class: className = ''
	}: {
		kind: FreshnessEntityKind;
		id: string;
		/** Explicit flag (tests, previews); defaults to the page context's flag for the entity. */
		flag?: FreshnessBadgeFlag | null;
		class?: string;
	} = $props();

	const freshness = getProjectFreshnessContext();
	const uid = $props.id();

	const flag = $derived(
		flagProp !== undefined ? flagProp : (freshness?.flagFor(kind, id) ?? null)
	);
	const automatic = $derived(flag?.label === 'updated_automatically');
	const label = $derived(automatic ? 'Updated automatically' : 'May be out of date');
	const percent = $derived(
		flag ? `${Math.round(Math.min(1, Math.max(0, flag.probability)) * 100)}%` : ''
	);
	const undoOpen = $derived.by(() => {
		if (!flag?.undoableUntil) return false;
		const until = Date.parse(flag.undoableUntil);
		return Number.isFinite(until) && Date.now() < until;
	});

	let open = $state(false);
	let busy = $state(false);
	let note = $state<string | null>(null);
	let position = $state<{ top: number; left: number } | null>(null);
	let trigger = $state<HTMLButtonElement | null>(null);
	let panel = $state<HTMLDivElement | null>(null);

	const PANEL_WIDTH = 256;
	const GUTTER = 8;

	function place() {
		if (!trigger) return;
		const rect = trigger.getBoundingClientRect();
		const panelHeight = panel?.offsetHeight ?? 160;
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const below = rect.bottom + 4;
		const top =
			below + panelHeight + GUTTER > viewportHeight && rect.top - panelHeight - 4 > GUTTER
				? rect.top - panelHeight - 4
				: below;
		const left = Math.min(
			Math.max(GUTTER, rect.right - PANEL_WIDTH),
			Math.max(GUTTER, viewportWidth - PANEL_WIDTH - GUTTER)
		);
		position = { top, left };
	}

	async function openPanel() {
		note = null;
		open = true;
		place();
		await tick();
		place();
		panel?.querySelector<HTMLElement>('button')?.focus();
	}

	function closePanel(restoreFocus = false) {
		open = false;
		if (restoreFocus) trigger?.focus();
	}

	// Light dismiss: outside pointer, Escape, scroll or resize (a fixed panel would drift).
	$effect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (target && (panel?.contains(target) || trigger?.contains(target))) return;
			closePanel();
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.stopPropagation();
				closePanel(true);
			}
		};
		const onViewportChange = (event: Event) => {
			if (event.target instanceof Node && panel?.contains(event.target)) return;
			closePanel();
		};
		document.addEventListener('pointerdown', onPointerDown, true);
		document.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('scroll', onViewportChange, true);
		window.addEventListener('resize', onViewportChange);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true);
			document.removeEventListener('keydown', onKeyDown, true);
			window.removeEventListener('scroll', onViewportChange, true);
			window.removeEventListener('resize', onViewportChange);
		};
	});

	async function handleUndo() {
		if (!flag || !freshness || busy) return;
		busy = true;
		note = null;
		try {
			const result = await freshness.undo(flag);
			if (result.undone.includes(flag.flagId)) {
				closePanel(true);
				return;
			}
			const reason = result.skipped.find((row) => row.flagId === flag.flagId)?.reason;
			note =
				reason === 'changed_since'
					? 'It changed since, so it was left as is.'
					: reason === 'window_expired'
						? 'The undo window has closed.'
						: reason === 'already_undone'
							? 'Already undone.'
							: 'Could not undo this.';
		} catch {
			note = 'Could not undo this. Try again.';
		} finally {
			busy = false;
		}
	}

	async function handleNotStale() {
		if (!flag || !freshness || busy) return;
		busy = true;
		note = null;
		try {
			await freshness.markNotStale(flag);
			closePanel(true);
		} catch {
			note = 'Could not save that. Try again.';
		} finally {
			busy = false;
		}
	}

	function stop(event: Event) {
		// Badges sit on clickable cards; keep the card's own handler out of it.
		event.stopPropagation();
	}
</script>

{#if flag}
	<span class="inline-flex {className}">
		<button
			bind:this={trigger}
			type="button"
			class="inline-flex min-h-6 items-center gap-1.5 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			aria-expanded={open}
			aria-controls="{uid}-panel"
			aria-haspopup="dialog"
			data-freshness-label={flag.label}
			onclick={(event) => {
				stop(event);
				if (open) closePanel();
				else void openPanel();
			}}
			onpointerdown={stop}
			ondragstart={(event) => event.preventDefault()}
		>
			<span
				class="h-1.5 w-1.5 shrink-0 rounded-full {automatic ? 'bg-info' : 'bg-warning'}"
				aria-hidden="true"
			></span>
			{label}
		</button>
	</span>

	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div
			bind:this={panel}
			id="{uid}-panel"
			role="dialog"
			aria-label={label}
			tabindex="-1"
			class="fixed z-50 w-64 max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-card p-3 text-left text-foreground shadow-ink-strong"
			style:top="{position?.top ?? 0}px"
			style:left="{position?.left ?? 0}px"
			onclick={stop}
		>
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<p class="text-sm font-semibold">{label}</p>
					<p class="mt-0.5 text-2xs text-muted-foreground">
						{#if automatic}
							Changed from what you said in chat
						{:else}
							<span class="tabular-nums">{percent}</span> · model estimate
						{/if}
					</p>
				</div>
				<button
					type="button"
					class="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Close"
					onclick={() => closePanel(true)}
				>
					<X class="h-3.5 w-3.5" aria-hidden="true" />
				</button>
			</div>
			{#if flag.evidenceExcerpt}
				<p class="mt-2 line-clamp-3 text-xs italic text-muted-foreground">
					“{flag.evidenceExcerpt}”
				</p>
			{/if}
			{#if note}
				<p class="mt-2 text-xs text-foreground" role="status">{note}</p>
			{/if}
			{#if freshness}
				<div class="mt-3 flex flex-wrap gap-1.5">
					{#if automatic}
						{#if undoOpen}
							<button
								type="button"
								class="inline-flex min-h-9 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground shadow-ink pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
								disabled={busy}
								onclick={handleUndo}
							>
								{#if busy}
									<Loader2
										class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
										aria-hidden="true"
									/>
								{:else}
									<RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />
								{/if}
								Undo
							</button>
						{:else}
							<p class="text-2xs text-muted-foreground">
								The undo window has closed.
							</p>
						{/if}
					{:else}
						<button
							type="button"
							class="inline-flex min-h-9 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground shadow-ink pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
							disabled={busy}
							onclick={handleNotStale}
						>
							{#if busy}
								<Loader2
									class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
									aria-hidden="true"
								/>
							{/if}
							Not out of date
						</button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
{/if}
