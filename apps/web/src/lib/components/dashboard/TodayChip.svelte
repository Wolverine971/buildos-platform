<!-- apps/web/src/lib/components/dashboard/TodayChip.svelte -->
<!--
  One chip in the dashboard's Today row (brief, overdue, AI inbox, invites,
  connect other AI surfaces). Replaces the stacked attention banners: each thing
  that needs you today is one line-height pill instead of a full-width card.

  Renders an `<a>` with `href`, a `<button>` with `onclick`, or a non-interactive
  status `<span>` with neither (e.g. brief generation in progress). Tone drives
  border / fill / icon color from one map so the row can't drift apart.
-->
<script lang="ts">
	import { LoaderCircle } from '$lib/icons/lucide';

	type Tone = 'default' | 'warning' | 'danger' | 'dashed' | 'quiet';

	type Props = {
		icon: any;
		label: string;
		/** Muted text after the label, e.g. "3 priorities". */
		detail?: string;
		tone?: Tone;
		/** Overrides the tone's icon color (e.g. the brief's sun). */
		iconClass?: string;
		/** Small trailing glyph, e.g. the brief's audio-ready icon. */
		trailingIcon?: any;
		trailingLabel?: string;
		href?: string;
		onclick?: (event: MouseEvent) => void;
		/** Warm-up hook for lazy-loaded destinations. */
		onpreload?: () => void;
		loading?: boolean;
		/** Spin the icon without disabling (in-progress status chips). */
		spin?: boolean;
		disabled?: boolean;
		busy?: boolean;
		title?: string;
		ariaLabel?: string;
		/** Disclosure chips (invites tray) report their open state. */
		expanded?: boolean;
		controls?: string;
		class?: string;
	};

	let {
		icon: Icon,
		label,
		detail,
		tone = 'default',
		iconClass,
		trailingIcon: TrailingIcon,
		trailingLabel,
		href,
		onclick,
		onpreload,
		loading = false,
		spin = false,
		disabled = false,
		busy = false,
		title,
		ariaLabel,
		expanded,
		controls,
		class: className = ''
	}: Props = $props();

	const toneClass: Record<Tone, string> = {
		default: 'border-border bg-card text-foreground shadow-ink',
		warning: 'border-warning/35 bg-warning/10 text-foreground shadow-ink',
		danger: 'border-destructive/35 bg-destructive/5 text-foreground shadow-ink',
		dashed: 'border-dashed border-accent/50 bg-transparent text-accent',
		quiet: 'border-dashed border-border bg-transparent text-muted-foreground'
	};
	const interactiveToneClass: Record<Tone, string> = {
		default: 'hover:border-accent/40 hover:bg-muted/60',
		warning: 'hover:border-warning/60 hover:bg-warning/15',
		danger: 'hover:border-destructive/60 hover:bg-destructive/10',
		dashed: 'hover:border-accent hover:bg-accent/10',
		quiet: 'hover:border-accent/40 hover:text-accent'
	};
	const iconToneClass: Record<Tone, string> = {
		default: 'text-muted-foreground',
		warning: 'text-warning',
		danger: 'text-destructive',
		dashed: 'text-accent',
		quiet: ''
	};

	const baseClass =
		'group inline-flex h-8 max-w-full shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition-colors';
	const interactiveClass =
		'pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 disabled:pointer-events-none';

	const chipClass = $derived(
		`${baseClass} ${toneClass[tone]} ${href || onclick ? `${interactiveClass} ${interactiveToneClass[tone]}` : ''} ${className}`
	);
	const resolvedIconClass = $derived(
		`h-3.5 w-3.5 shrink-0 ${iconClass ?? iconToneClass[tone]} ${spin ? 'animate-spin motion-reduce:animate-none' : ''}`
	);
</script>

{#snippet content()}
	{#if loading}
		<LoaderCircle class="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
	{:else}
		<Icon class={resolvedIconClass} />
	{/if}
	<span class="truncate">{label}</span>
	{#if detail}
		<span class="truncate font-normal text-muted-foreground">{detail}</span>
	{/if}
	{#if TrailingIcon}
		<TrailingIcon class="h-3 w-3 shrink-0 text-muted-foreground" aria-label={trailingLabel} />
	{/if}
{/snippet}

{#if href}
	<a
		{href}
		{onclick}
		onpointerdown={onpreload}
		onpointerenter={onpreload}
		onfocus={onpreload}
		{title}
		aria-label={ariaLabel}
		aria-busy={busy || undefined}
		class={chipClass}
	>
		{@render content()}
	</a>
{:else if onclick}
	<button
		type="button"
		{onclick}
		onpointerdown={onpreload}
		onpointerenter={onpreload}
		onfocus={onpreload}
		disabled={disabled || loading}
		{title}
		aria-label={ariaLabel}
		aria-busy={busy || loading || undefined}
		aria-expanded={expanded}
		aria-controls={controls}
		class={chipClass}
	>
		{@render content()}
	</button>
{:else}
	<span role="status" {title} aria-label={ariaLabel} class={chipClass}>
		{@render content()}
	</span>
{/if}
