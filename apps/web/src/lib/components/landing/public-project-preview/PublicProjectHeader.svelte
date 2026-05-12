<!-- apps/web/src/lib/components/landing/public-project-preview/PublicProjectHeader.svelte -->
<!--
	Public, read-only mirror of ProjectHeaderCard for the landing example.
	Renders the project icon (or a fallback), title, description, and the
	"Next step" callout — no settings menu, no back button, no edit.
-->
<script lang="ts">
	import { GitBranch, Sparkles } from 'lucide-svelte';
	import type { PublicProjectInfo, ViewportMode } from './lib/public-project-types';
	import { formatTimelineYearRange, getCommander } from './lib/public-project-types';

	let {
		project,
		viewport = 'desktop'
	}: {
		project: PublicProjectInfo;
		viewport?: ViewportMode;
	} = $props();

	const commander = $derived(getCommander(project.id, project.props));
	const timeline = $derived(formatTimelineYearRange(project.start_at, project.end_at));

	const safeSvg = $derived.by(() => {
		const raw = project.icon_svg?.trim();
		if (!raw || !raw.startsWith('<svg') || !raw.endsWith('</svg>')) return null;
		const blocked = /<script|<foreignObject|on[a-z]+\s*=|javascript:/i;
		return blocked.test(raw) ? null : raw;
	});

	const stateLabel = $derived.by(() => {
		const key = project.state_key;
		if (!key) return null;
		return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	});

	const isCompact = $derived(viewport === 'mobile');
</script>

<header
	class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak space-y-2"
	class:p-3={isCompact}
	class:sm:p-3={!isCompact}
	class:p-4={!isCompact}
	class:sm:p-4={!isCompact}
>
	<div class="flex items-start gap-2.5 sm:gap-3 min-w-0">
		{#if safeSvg}
			<div
				class="inline-flex items-center justify-center shrink-0 overflow-hidden border border-border/70 bg-muted/30 text-foreground/90 rounded-lg h-9 w-9 sm:h-10 sm:w-10"
				aria-hidden="true"
			>
				<span class="block w-full h-full p-1">{@html safeSvg}</span>
			</div>
		{:else}
			<div
				class="inline-flex items-center justify-center shrink-0 rounded-lg border border-accent/20 bg-accent/10 h-9 w-9 sm:h-10 sm:w-10"
				aria-hidden="true"
				title={project.icon_concept ?? project.name}
			>
				<GitBranch class="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
			</div>
		{/if}

		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<h3
					class="text-base sm:text-lg font-semibold text-foreground leading-tight line-clamp-2"
				>
					{project.name}
				</h3>
				{#if stateLabel}
					<span
						class="text-[0.6rem] uppercase tracking-[0.15em] text-muted-foreground border border-border rounded-full px-1.5 py-0.5"
					>
						{stateLabel}
					</span>
				{/if}
			</div>

			<div
				class="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] sm:text-xs text-muted-foreground"
			>
				{#if commander}
					<span>Led by {commander}</span>
				{/if}
				{#if commander && timeline}
					<span aria-hidden="true">·</span>
				{/if}
				{#if timeline}
					<span>{timeline}</span>
				{/if}
			</div>

			{#if project.description}
				<p
					class="mt-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-3"
				>
					{project.description}
				</p>
			{/if}
		</div>
	</div>

	{#if project.next_step_short}
		<div
			class="rounded-lg border border-accent/30 bg-accent/5 shadow-ink-inner tx tx-pulse tx-weak px-3 py-2 sm:px-3.5 sm:py-2.5 flex items-start gap-2"
		>
			<Sparkles class="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
			<div class="min-w-0">
				<div class="text-[0.6rem] uppercase tracking-[0.18em] text-accent/80 mb-0.5">
					Next step
				</div>
				<p class="text-xs sm:text-sm text-foreground leading-snug">
					{project.next_step_short}
				</p>
			</div>
		</div>
	{/if}
</header>
