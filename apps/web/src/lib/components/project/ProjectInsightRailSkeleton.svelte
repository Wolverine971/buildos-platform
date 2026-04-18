<!-- apps/web/src/lib/components/project/ProjectInsightRailSkeleton.svelte -->
<!--
	Loading state for the right-hand insight rail on the project page. Renders
	the same elements in the same order as the loaded state:
	PublishedPanel → Project Graph → 6 insight panels (Goals → Risks) →
	(history divider + Daily Briefs + Activity Log when canViewLogs).

	Icon colors mirror `getPanelIconStyles` in +page.svelte so panels don't
	change color when hydration completes.
-->
<script lang="ts">
	import {
		AlertCircle,
		Calendar,
		ChevronDown,
		Clock,
		FileText,
		GitBranch,
		Globe,
		Image as ImageIcon,
		ListChecks,
		Maximize2,
		Target
	} from 'lucide-svelte';
	import InsightPanelSkeleton from '$lib/components/ontology/InsightPanelSkeleton.svelte';

	type SkeletonCounts = {
		task_count: number;
		document_count: number;
		goal_count: number;
		plan_count: number;
		milestone_count: number;
		risk_count: number;
		image_count: number;
	};

	let {
		skeletonCounts,
		graphHidden,
		canViewLogs,
		canEdit = false,
		includePublishedPlaceholder = true
	}: {
		skeletonCounts: SkeletonCounts;
		graphHidden: boolean;
		canViewLogs: boolean;
		canEdit?: boolean;
		// Omit the Published placeholder when the real PublishedPanel is already
		// rendered above this skeleton (e.g. the dynamic-import fallback).
		includePublishedPlaceholder?: boolean;
	} = $props();
</script>

<aside class="min-w-0 space-y-3 lg:sticky lg:top-24">
	{#if includePublishedPlaceholder}
		<!-- Published panel placeholder — mirrors PublishedPanel collapsed state -->
		<section
			class="rounded-lg border border-border bg-card shadow-ink overflow-hidden"
			aria-busy="true"
			aria-label="Loading published pages"
		>
			<button
				type="button"
				disabled
				class="w-full flex items-center justify-between gap-2 px-3 py-2 text-left pressable cursor-default"
				aria-expanded="false"
			>
				<div class="flex items-center gap-2 min-w-0">
					<Globe class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
					<span class="text-sm font-semibold text-foreground">Published</span>
				</div>
				<ChevronDown
					class="w-4 h-4 text-muted-foreground transition-transform duration-150 -rotate-90"
				/>
			</button>
		</section>
	{/if}

	{#if !graphHidden}
		<!-- Disabled during loading — graph modal needs hydrated data. -->
		<button
			type="button"
			disabled
			class="w-full bg-card border border-border rounded-lg shadow-ink tx tx-thread tx-weak overflow-hidden text-left pressable cursor-default"
			aria-label="Project graph (loading)"
		>
			<div class="flex items-center justify-between gap-2 px-4 py-3">
				<div class="flex items-center gap-3">
					<div class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
						<GitBranch class="w-4 h-4 text-accent" />
					</div>
					<div>
						<p class="text-sm font-semibold text-foreground">Project Graph</p>
						<p class="text-xs text-muted-foreground">Click to explore</p>
					</div>
				</div>
				<Maximize2 class="w-4 h-4 text-muted-foreground" />
			</div>
		</button>
	{/if}

	<InsightPanelSkeleton
		icon={Target}
		label="Goals"
		count={skeletonCounts.goal_count}
		description="What success looks like"
		expanded={true}
		iconStyles="bg-amber-500/10 text-amber-500"
		{canEdit}
	/>
	<InsightPanelSkeleton
		icon={Calendar}
		label="Plans"
		count={skeletonCounts.plan_count}
		description="Execution scaffolding"
		iconStyles="bg-indigo-500/10 text-indigo-500"
		{canEdit}
	/>
	<InsightPanelSkeleton
		icon={ListChecks}
		label="Tasks"
		count={skeletonCounts.task_count}
		description="What needs to move"
		iconStyles="bg-slate-500/10 text-muted-foreground"
		{canEdit}
	/>
	<InsightPanelSkeleton
		icon={Clock}
		label="Events"
		count={0}
		description="Meetings and time blocks"
		iconStyles="bg-blue-500/10 text-blue-500"
		{canEdit}
	/>
	<InsightPanelSkeleton
		icon={ImageIcon}
		label="Images"
		count={skeletonCounts.image_count}
		description="Visual context and OCR"
		iconStyles="bg-emerald-500/10 text-emerald-500"
		{canEdit}
	/>
	<InsightPanelSkeleton
		icon={AlertCircle}
		label="Risks"
		count={skeletonCounts.risk_count}
		description="What could go wrong"
		iconStyles="bg-red-500/10 text-red-500"
		{canEdit}
	/>

	{#if canViewLogs}
		<div class="relative py-2 sm:py-4">
			<div class="absolute inset-0 flex items-center px-3 sm:px-4">
				<div class="w-full border-t border-border/40"></div>
			</div>
			<div class="relative flex justify-center">
				<span
					class="bg-background px-2 sm:px-3 text-[9px] sm:text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest"
				>
					History
				</span>
			</div>
		</div>

		<div class="space-y-3">
			<div
				class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
			>
				<div class="flex items-center gap-3 px-4 py-3">
					<div class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
						<FileText class="w-4 h-4 text-accent" />
					</div>
					<div>
						<p class="text-sm font-semibold text-foreground">Daily Briefs</p>
						<p class="text-xs text-muted-foreground">AI-generated summaries</p>
					</div>
				</div>
			</div>

			<div
				class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
			>
				<div class="flex items-center gap-3 px-4 py-3">
					<div class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
						<Clock class="w-4 h-4 text-accent" />
					</div>
					<div>
						<p class="text-sm font-semibold text-foreground">Activity Log</p>
						<p class="text-xs text-muted-foreground">Recent changes</p>
					</div>
				</div>
			</div>
		</div>
	{/if}
</aside>
