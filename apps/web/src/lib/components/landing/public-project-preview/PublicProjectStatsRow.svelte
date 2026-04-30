<!-- apps/web/src/lib/components/landing/public-project-preview/PublicProjectStatsRow.svelte -->
<script lang="ts">
	import {
		Target,
		Flag,
		Calendar,
		ListChecks,
		FileText,
		AlertTriangle,
		Scale
	} from 'lucide-svelte';
	import type { PublicProjectFullData } from './lib/public-project-types';

	let {
		stats
	}: {
		stats: PublicProjectFullData['stats'];
	} = $props();
</script>

<div
	class="rounded-lg border border-border bg-card shadow-ink tx tx-grain tx-weak px-4 sm:px-5 py-3 overflow-x-auto"
>
	<div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 sm:gap-x-6 text-xs">
		<div class="flex items-center gap-1.5">
			<Target class="w-3.5 h-3.5 text-amber-500" />
			<span class="text-muted-foreground">{stats.totalGoals} Goals</span>
		</div>
		<div class="flex items-center gap-1.5">
			<Flag class="w-3.5 h-3.5 text-emerald-500" />
			<span class="text-muted-foreground">{stats.totalMilestones} Milestones</span>
		</div>
		<div class="flex items-center gap-1.5">
			<Calendar class="w-3.5 h-3.5 text-indigo-500" />
			<span class="text-muted-foreground">{stats.totalPlans} Plans</span>
		</div>
		<div class="flex items-center gap-1.5">
			<ListChecks class="w-3.5 h-3.5 text-muted-foreground" />
			<span class="text-muted-foreground">{stats.totalTasks} Tasks</span>
		</div>
		<div class="hidden sm:flex items-center gap-1.5">
			<FileText class="w-3.5 h-3.5 text-sky-500" />
			<span class="text-muted-foreground">{stats.totalDocuments} Docs</span>
		</div>
		{#if stats.totalRisks > 0}
			<div class="hidden md:flex items-center gap-1.5">
				<AlertTriangle class="w-3.5 h-3.5 text-red-500" />
				<span class="text-muted-foreground">{stats.totalRisks} Risks</span>
			</div>
		{/if}
		{#if stats.totalDecisions && stats.totalDecisions > 0}
			<div class="hidden md:flex items-center gap-1.5">
				<Scale class="w-3.5 h-3.5 text-violet-500" />
				<span class="text-muted-foreground">{stats.totalDecisions} Decisions</span>
			</div>
		{/if}
		<div class="hidden lg:flex items-center gap-1.5">
			<span class="text-muted-foreground">{stats.totalEdges} Connections</span>
		</div>
	</div>
</div>
