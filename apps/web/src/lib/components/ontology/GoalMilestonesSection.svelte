<!-- apps/web/src/lib/components/ontology/GoalMilestonesSection.svelte -->
<!--
	Goal Milestones Section Component

	Displays milestones nested within a goal card. Shows:
	- Milestone list (sorted by due_at, completed at bottom)
	- Empty state with helpful prompt
	- Add milestone button
	- Optional progress indicator

	Documentation:
	- Milestones Under Goals Spec: /thoughts/shared/research/2026-01-16_milestones-under-goals-ux-proposal.md
	- Inkprint Design System: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
-->
<script lang="ts">
	import { slide } from 'svelte/transition';
	import { Plus, Flag, ChevronDown } from 'lucide-svelte';
	import MilestoneListItem from './MilestoneListItem.svelte';
	import { resolveMilestoneState } from '$lib/utils/milestone-state';

	interface Milestone {
		id: string;
		title: string;
		due_at: string | null;
		state_key?: string | null;
		props?: Record<string, unknown> | null;
	}

	interface Props {
		milestones: Milestone[];
		goalId: string;
		goalName: string;
		goalState: string;
		expanded?: boolean;
		canEdit?: boolean;
		onAddMilestone: (goalId: string, goalName: string) => void;
		onEditMilestone: (milestoneId: string) => void;
		onToggleMilestoneComplete?: (milestoneId: string, currentState: string) => void;
		onToggleExpanded?: (expanded: boolean) => void;
		showCompletedSection?: boolean;
		maxVisible?: number;
	}

	let {
		milestones,
		goalId,
		goalName,
		goalState,
		expanded = true,
		canEdit = true,
		onAddMilestone,
		onEditMilestone,
		onToggleMilestoneComplete,
		onToggleExpanded,
		showCompletedSection = true,
		maxVisible = 10
	}: Props = $props();

	// Local expanded state if not controlled
	let localExpanded = $state(expanded);
	const isExpanded = $derived(onToggleExpanded ? expanded : localExpanded);

	// Check if goal is in terminal state (can't add milestones)
	const isGoalTerminal = $derived(goalState === 'achieved' || goalState === 'abandoned');

	// Sort and group milestones
	const sortedMilestones = $derived.by(() => {
		const sorted = [...milestones].sort((a, b) => {
			const aState = resolveMilestoneState(a).state;
			const bState = resolveMilestoneState(b).state;

			// Completed/missed go to bottom
			const aIsTerminal = aState === 'completed' || aState === 'missed';
			const bIsTerminal = bState === 'completed' || bState === 'missed';
			if (aIsTerminal && !bIsTerminal) return 1;
			if (!aIsTerminal && bIsTerminal) return -1;

			// Then sort by due_at ascending
			const aDate = a.due_at ? new Date(a.due_at).getTime() : Infinity;
			const bDate = b.due_at ? new Date(b.due_at).getTime() : Infinity;
			const safeADate = Number.isNaN(aDate) ? Infinity : aDate;
			const safeBDate = Number.isNaN(bDate) ? Infinity : bDate;
			if (safeADate !== safeBDate) return safeADate - safeBDate;

			// Fallback to title
			return a.title.localeCompare(b.title);
		});
		return sorted;
	});

	// Split into active and completed
	const activeMilestones = $derived(
		sortedMilestones.filter((m) => {
			const state = resolveMilestoneState(m).state;
			return state !== 'completed' && state !== 'missed';
		})
	);

	const completedMilestones = $derived(
		sortedMilestones.filter((m) => {
			const state = resolveMilestoneState(m).state;
			return state === 'completed' || state === 'missed';
		})
	);

	// Progress calculation
	const completedCount = $derived(
		milestones.filter((m) => {
			const state = resolveMilestoneState(m).state;
			return state === 'completed';
		}).length
	);
	const totalCount = $derived(milestones.length);

	// Show "Show all" if more than maxVisible active milestones
	let showAll = $state(false);
	const visibleActiveMilestones = $derived(
		showAll ? activeMilestones : activeMilestones.slice(0, maxVisible)
	);
	const hasMore = $derived(activeMilestones.length > maxVisible);

	// Completed section collapsed state
	let completedExpanded = $state(false);

	function handleToggle() {
		if (onToggleExpanded) {
			onToggleExpanded(!expanded);
		} else {
			localExpanded = !localExpanded;
		}
	}
</script>

<div class="border-t border-border/30">
	<!-- Section Header (ultra-compact) -->
	<button
		type="button"
		onclick={handleToggle}
		class="
			w-full flex items-center justify-between gap-1.5
			px-2.5 py-1 text-left
			hover:bg-muted/30 transition-colors
			focus:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset
		"
		aria-expanded={isExpanded}
	>
		<div class="flex items-center gap-1.5">
			<Flag class="w-2.5 h-2.5 text-muted-foreground/70" />
			<span class="text-[10px] text-muted-foreground/70">
				{#if totalCount > 0}
					{completedCount}/{totalCount} milestones
				{:else}
					Milestones
				{/if}
			</span>
		</div>
		<ChevronDown
			class="w-2.5 h-2.5 text-muted-foreground/50 transition-transform duration-100
				{isExpanded ? 'rotate-180' : ''}"
		/>
	</button>

	<!-- Content -->
	{#if isExpanded}
		<div transition:slide={{ duration: 100 }}>
			{#if milestones.length === 0}
				<!-- Empty State (minimal) -->
				<div class="px-2.5 py-1.5 flex items-center justify-between bg-muted/10">
					<span class="text-[10px] text-muted-foreground/60 italic">None defined</span>
					{#if canEdit && !isGoalTerminal}
						<button
							type="button"
							onclick={() => onAddMilestone(goalId, goalName)}
							class="
								inline-flex items-center gap-0.5
								px-1.5 py-0.5 rounded
								hover:bg-accent/10
								text-[10px] text-accent/80 hover:text-accent
								transition-colors
							"
						>
							<Plus class="w-2.5 h-2.5" />
							Add
						</button>
					{/if}
				</div>
			{:else}
				<!-- Milestone List (ultra-compact) -->
				<div class="divide-y divide-border/20">
					{#each visibleActiveMilestones as milestone (milestone.id)}
						<MilestoneListItem
							{milestone}
							onEdit={onEditMilestone}
							onToggleComplete={canEdit ? onToggleMilestoneComplete : undefined}
							compact={true}
						/>
					{/each}

					<!-- Show All Button -->
					{#if hasMore && !showAll}
						<button
							type="button"
							onclick={() => (showAll = true)}
							class="
								w-full px-2 py-1 text-center
								text-[10px] text-accent/70 hover:text-accent hover:bg-accent/5
								transition-colors
							"
						>
							+{activeMilestones.length - maxVisible} more
						</button>
					{/if}

					<!-- Completed Section (inline, minimal) -->
					{#if showCompletedSection && completedMilestones.length > 0}
						<div class="bg-muted/10">
							<button
								type="button"
								onclick={() => (completedExpanded = !completedExpanded)}
								class="
									w-full flex items-center justify-between
									px-2 py-0.5 text-left
									hover:bg-muted/20 transition-colors
								"
							>
								<span class="text-[9px] text-muted-foreground/60">
									{completedMilestones.length} done
								</span>
								<ChevronDown
									class="w-2 h-2 text-muted-foreground/40 transition-transform duration-100
										{completedExpanded ? 'rotate-180' : ''}"
								/>
							</button>

							{#if completedExpanded}
								<div transition:slide={{ duration: 80 }}>
									{#each completedMilestones as milestone (milestone.id)}
										<MilestoneListItem
											{milestone}
											onEdit={onEditMilestone}
											compact={true}
										/>
									{/each}
								</div>
							{/if}
						</div>
					{/if}

					<!-- Add Milestone (inline link) -->
					{#if canEdit && !isGoalTerminal}
						<button
							type="button"
							onclick={() => onAddMilestone(goalId, goalName)}
							class="
								w-full flex items-center justify-center gap-0.5
								px-2 py-1
								text-[10px] text-accent/60 hover:text-accent
								hover:bg-accent/5 transition-colors
							"
						>
							<Plus class="w-2.5 h-2.5" />
							Add
						</button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
