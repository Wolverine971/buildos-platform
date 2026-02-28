<!-- apps/web/src/lib/components/project/ProjectInsightRailSkeleton.svelte -->
<script lang="ts">
	import {
		AlertCircle,
		Calendar,
		Clock,
		FileText,
		GitBranch,
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
		onShowGraphModal
	}: {
		skeletonCounts: SkeletonCounts;
		graphHidden: boolean;
		canViewLogs: boolean;
		onShowGraphModal: () => void;
	} = $props();
</script>

<aside class="min-w-0 space-y-3 lg:sticky lg:top-24">
	{#if !graphHidden}
		<button
			type="button"
			onclick={onShowGraphModal}
			class="w-full bg-card border border-border rounded-lg shadow-ink tx tx-thread tx-weak overflow-hidden text-left hover:bg-muted/50 transition-colors pressable group"
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
				<Maximize2
					class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
				/>
			</div>
		</button>
	{/if}

	<InsightPanelSkeleton
		icon={Target}
		label="Goals"
		count={skeletonCounts.goal_count}
		description="What success looks like"
		expanded={true}
	/>
	<InsightPanelSkeleton
		icon={Calendar}
		label="Plans"
		count={skeletonCounts.plan_count}
		description="Execution scaffolding"
	/>
	<InsightPanelSkeleton
		icon={ListChecks}
		label="Tasks"
		count={skeletonCounts.task_count}
		description="What needs to move"
	/>
	<InsightPanelSkeleton
		icon={Clock}
		label="Events"
		count={0}
		description="Meetings and time blocks"
	/>
	<InsightPanelSkeleton
		icon={ImageIcon}
		label="Images"
		count={skeletonCounts.image_count}
		description="Visual context and OCR"
	/>
	<InsightPanelSkeleton
		icon={AlertCircle}
		label="Risks"
		count={skeletonCounts.risk_count}
		description="What could go wrong"
	/>

	<div class="relative py-4">
		<div class="absolute inset-0 flex items-center px-4">
			<div class="w-full border-t border-border/40"></div>
		</div>
		<div class="relative flex justify-center">
			<span
				class="bg-background px-3 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest"
			>
				History
			</span>
		</div>
	</div>

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

	{#if canViewLogs}
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
	{/if}
</aside>
