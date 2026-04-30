<!-- apps/web/src/lib/components/landing/public-project-preview/PublicProjectHeader.svelte -->
<script lang="ts">
	import { GitBranch } from 'lucide-svelte';
	import type { PublicProjectInfo } from './lib/public-project-types';
	import { formatTimelineYearRange, getCommander } from './lib/public-project-types';

	let {
		project
	}: {
		project: PublicProjectInfo;
	} = $props();

	let commander = $derived(getCommander(project.id, project.props));
	let timeline = $derived(formatTimelineYearRange(project.start_at, project.end_at));

	let nextStep = $derived.by(() => {
		const props = (project.props ?? {}) as Record<string, unknown>;
		const candidate =
			(props.next_step_short as string | undefined) ??
			(props.next_step as string | undefined) ??
			null;
		return candidate && candidate.trim().length > 0 ? candidate.trim() : null;
	});
</script>

<header
	class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak p-4 sm:p-5 space-y-3"
>
	<div class="flex items-start gap-3 sm:gap-4">
		<div
			class="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0"
		>
			<GitBranch class="w-5 h-5 sm:w-6 sm:h-6 text-accent" />
		</div>
		<div class="min-w-0 flex-1">
			<h3 class="text-lg sm:text-xl font-semibold text-foreground leading-tight">
				{project.name}
			</h3>
			<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-muted-foreground">
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
		</div>
	</div>

	{#if project.description}
		<p class="text-sm text-muted-foreground leading-relaxed line-clamp-3">
			{project.description}
		</p>
	{/if}

	{#if nextStep}
		<div
			class="rounded-lg border border-accent/30 bg-accent/5 shadow-ink-inner tx tx-pulse tx-weak p-3 sm:p-4"
		>
			<div class="text-[0.65rem] uppercase tracking-[0.18em] text-accent/80 mb-1">
				Next step
			</div>
			<p class="text-sm text-foreground leading-relaxed">{nextStep}</p>
		</div>
	{/if}
</header>
