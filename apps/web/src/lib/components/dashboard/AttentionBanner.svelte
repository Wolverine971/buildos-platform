<!-- apps/web/src/lib/components/dashboard/AttentionBanner.svelte -->
<!--
  Shared dashboard "attention banner" — icon chip + title + subtext on the left,
  one standardized action on the right, optional body below.

  Exists so the dashboard's attention cluster (AI Inbox, agent CTA, project
  invites, overdue tasks) is ONE source of truth instead of four hand-rolled
  copies that drift apart (the Hyperplexed-audit D1 finding). Tone drives the
  container / chip / action color from a single map; the action renders the
  button-or-anchor consistently (one padding, one focus ring) so it can't drift.

  Geometry (D2): leans on the Inkprint `wt-card` weight for border + shadow +
  radius — no redundant Tailwind `border`/`shadow-ink` stacked on top.
  A11y (D3): the action always carries a `focus-visible` ring.
  Motion (D4): the loading spinner is `motion-reduce:animate-none`.
-->
<script lang="ts">
	import { ArrowRight, LoaderCircle } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	type Tone = 'accent' | 'warning';
	type ActionTone = Tone | 'neutral';

	export type BannerAction = {
		label: string;
		/** Renders an `<a href>`. Mutually exclusive with `onClick`. */
		href?: string;
		/** Renders a `<button>`. */
		onClick?: () => void;
		loading?: boolean;
		loadingLabel?: string;
		disabled?: boolean;
		/** Defaults to the banner `tone`. Use `neutral` for non-themed actions (e.g. Retry). */
		tone?: ActionTone;
		/** Trailing arrow glyph. Defaults to true. */
		showArrow?: boolean;
	};

	type Props = {
		tone?: Tone;
		icon: any;
		title: string;
		subtext?: string;
		action?: BannerAction;
		/** Optional body rendered below the header row, inside the rounded clip. */
		children?: Snippet;
	};

	let { tone = 'accent', icon: Icon, title, subtext, action, children }: Props = $props();

	const containerClass: Record<Tone, string> = {
		accent: 'wt-card border-accent/25 bg-accent/5',
		warning: 'wt-card'
	};
	const chipClass: Record<Tone, string> = {
		accent: 'bg-accent/10',
		warning: 'bg-warning/10'
	};
	const iconColorClass: Record<Tone, string> = {
		accent: 'text-accent',
		warning: 'text-warning'
	};
	const actionToneClass: Record<ActionTone, string> = {
		accent: 'border-accent/25 bg-card text-accent hover:border-accent/50 hover:bg-accent/10',
		warning:
			'border-warning/30 bg-warning/10 text-warning hover:border-warning/50 hover:bg-warning/15',
		neutral: 'border-border bg-card text-foreground hover:bg-muted'
	};

	const baseActionClass =
		'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold shadow-ink pressable transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-60 disabled:pointer-events-none';

	const resolvedActionTone = $derived<ActionTone>(action?.tone ?? tone);
	const showArrow = $derived(action ? action.showArrow !== false : false);
</script>

<section class="overflow-hidden {containerClass[tone]}">
	<div class="flex flex-wrap items-start justify-between gap-3 px-3 py-3">
		<div class="min-w-0 flex items-start gap-2.5">
			<div
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md {chipClass[
					tone
				]}"
			>
				<Icon class="h-4 w-4 {iconColorClass[tone]}" />
			</div>
			<div class="min-w-0">
				<p class="text-sm font-semibold text-foreground">{title}</p>
				{#if subtext}
					<p class="mt-0.5 text-xs text-muted-foreground">{subtext}</p>
				{/if}
			</div>
		</div>

		{#if action}
			<div class="flex items-center gap-1.5 shrink-0">
				{#if action.href}
					<a
						href={action.href}
						class="{baseActionClass} {actionToneClass[resolvedActionTone]}"
					>
						{action.label}
						{#if showArrow}
							<ArrowRight class="h-3 w-3" />
						{/if}
					</a>
				{:else}
					<button
						type="button"
						onclick={action.onClick}
						disabled={action.disabled || action.loading}
						class="{baseActionClass} {actionToneClass[resolvedActionTone]}"
					>
						{#if action.loading}
							<LoaderCircle class="h-3 w-3 animate-spin motion-reduce:animate-none" />
							<span class="hidden sm:inline"
								>{action.loadingLabel ?? 'Opening...'}</span
							>
						{:else}
							{action.label}
							{#if showArrow}
								<ArrowRight class="h-3 w-3" />
							{/if}
						{/if}
					</button>
				{/if}
			</div>
		{/if}
	</div>

	{#if children}
		{@render children()}
	{/if}
</section>
