<!-- apps/web/src/lib/components/projects/desktop/DesktopMovePopover.svelte -->
<!--
	The quick confirm after a drop, and the "Move to…" list that replaces dragging
	(keyboard, touch, or by choice). Anchored beside the drop target on wide
	screens, a bottom sheet on phones. Enter confirms, Esc cancels.
-->
<script lang="ts" module>
	import type { ProjectListSummary } from '../project-list';

	export type PickerOption = {
		key: string;
		label: string;
		/** Absent for the desktop itself. */
		project?: ProjectListSummary;
		inside?: readonly ProjectListSummary[];
		indent?: boolean;
		/** Why this target refuses; the option shows disabled with it. */
		reason?: string;
	};
	export type PopoverView =
		| {
				mode: 'confirm';
				title: string;
				body: string;
				cta: string;
				effects: string[];
				blockers: string[];
				/** The server preview is still loading. */
				checking: boolean;
				busy: boolean;
				error: string;
		  }
		| { mode: 'picker'; title: string; options: PickerOption[] };
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { LayoutGrid, LoaderCircle } from '$lib/icons/lucide';
	import DesktopTile from './DesktopTile.svelte';

	let {
		view,
		anchor,
		side = 'below',
		onConfirm,
		onCancel,
		onPick
	}: {
		view: PopoverView;
		anchor: DOMRect | null;
		/** `left` opens beside the anchor (a dock item) instead of under it. */
		side?: 'below' | 'left';
		onConfirm: () => void;
		onCancel: () => void;
		onPick: (key: string) => void;
	} = $props();

	let panel = $state<HTMLDivElement | null>(null);
	let width = $state(0);
	let height = $state(0);
	let viewportWidth = $state(1024);
	let viewportHeight = $state(768);
	const sheet = $derived(viewportWidth < 640);

	const position = $derived.by(() => {
		if (sheet || !anchor || !width) {
			return {
				left: Math.max(16, (viewportWidth - width) / 2),
				top: Math.round(viewportHeight / 3)
			};
		}
		// Beside a dock item; otherwise centred under the target.
		if (side === 'left' || anchor.left > viewportWidth - 160) {
			return {
				left: Math.max(16, anchor.left - width - 12),
				top: clamp(anchor.top - 10, 16, viewportHeight - height - 16)
			};
		}
		const left = clamp(
			anchor.left + anchor.width / 2 - width / 2,
			16,
			viewportWidth - width - 16
		);
		const below = anchor.bottom + 10;
		const top =
			below + height <= viewportHeight - 16
				? below
				: clamp(anchor.top - height - 10, 16, viewportHeight - height - 16);
		return { left, top };
	});

	function clamp(value: number, min: number, max: number) {
		return Math.min(Math.max(value, min), Math.max(min, max));
	}

	const canConfirm = $derived(
		view.mode === 'confirm' && !view.checking && !view.busy && view.blockers.length === 0
	);

	onMount(async () => {
		await tick();
		const first = panel?.querySelector<HTMLElement>(
			view.mode === 'confirm'
				? '[data-primary]:not([disabled])'
				: '[data-option]:not([disabled])'
		);
		(first ?? panel)?.focus();
	});

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onCancel();
			return;
		}
		// Enter confirms even while focus sits on the panel (the button was
		// disabled until the preview came back). Buttons handle their own Enter.
		if (
			event.key === 'Enter' &&
			canConfirm &&
			!(event.target instanceof HTMLButtonElement) &&
			panel?.contains(event.target as Node)
		) {
			event.preventDefault();
			onConfirm();
		}
	}
</script>

<svelte:window
	bind:innerWidth={viewportWidth}
	bind:innerHeight={viewportHeight}
	onkeydowncapture={keydown}
/>

<div
	class="fixed inset-0 z-[70] {sheet ? 'bg-foreground/20' : ''}"
	role="presentation"
	onpointerdown={onCancel}
></div>
<div
	bind:this={panel}
	bind:offsetWidth={width}
	bind:offsetHeight={height}
	class="fixed z-[71] grid gap-2.5 border border-border bg-card p-4 shadow-ink-strong tx tx-frame tx-weak
		{sheet
		? 'inset-x-0 bottom-0 rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom,0px))]'
		: 'w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl'}"
	style:left={sheet ? undefined : `${position.left}px`}
	style:top={sheet ? undefined : `${position.top}px`}
	role="dialog"
	aria-modal="true"
	aria-labelledby="desktop-move-title"
	tabindex="-1"
>
	<h2 id="desktop-move-title" class="text-[15px] font-semibold leading-snug text-foreground">
		{view.title}
	</h2>
	{#if view.mode === 'confirm'}
		<p class="text-sm text-muted-foreground">{view.body}</p>
		{#if view.checking}
			<p class="flex items-center gap-2 text-xs text-muted-foreground">
				<LoaderCircle class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
				Checking what moves with it…
			</p>
		{/if}
		{#if view.effects.length}
			<ul class="grid gap-0.5 text-xs text-muted-foreground">
				{#each view.effects as line (line)}<li>· {line}</li>{/each}
			</ul>
		{/if}
		{#each view.blockers as blocker (blocker)}
			<p
				class="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-foreground"
			>
				{blocker}
			</p>
		{/each}
		{#if view.error}
			<p
				class="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-foreground"
				role="alert"
			>
				{view.error}
			</p>
		{/if}
		<div class="mt-1 flex items-center justify-end gap-2">
			<span class="mr-auto hidden font-mono text-[10.5px] text-muted-foreground sm:inline">
				Enter · Esc
			</span>
			<button
				type="button"
				class="min-h-9 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground pressable hover:bg-muted"
				onclick={onCancel}
			>
				Cancel
			</button>
			<button
				type="button"
				data-primary
				class="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 text-sm font-semibold text-accent-foreground pressable disabled:cursor-not-allowed disabled:opacity-50"
				disabled={!canConfirm}
				onclick={onConfirm}
			>
				{#if view.busy}<LoaderCircle
						class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
					/>{/if}
				{view.cta}
			</button>
		</div>
	{:else}
		<div class="-mx-2 grid max-h-[min(26rem,65dvh)] gap-0.5 overflow-y-auto px-1 py-0.5">
			{#each view.options as option (option.key)}
				<button
					type="button"
					data-option
					class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-55 {option.indent
						? 'pl-8'
						: ''}"
					disabled={Boolean(option.reason)}
					onclick={() => onPick(option.key)}
				>
					{#if option.project}
						<DesktopTile
							project={option.project}
							inside={option.inside}
							size="xs"
							dot={false}
						/>
					{:else}
						<span
							class="grid h-7 w-7 place-items-center rounded-md border border-dashed border-border-strong text-muted-foreground"
						>
							<LayoutGrid class="h-4 w-4" />
						</span>
					{/if}
					<span class="grid min-w-0">
						<span class="truncate text-sm text-foreground">{option.label}</span>
						{#if option.reason}
							<span class="text-xs text-muted-foreground">{option.reason}</span>
						{/if}
					</span>
				</button>
			{/each}
		</div>
	{/if}
</div>
