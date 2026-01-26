<!-- apps/web/src/lib/components/ontology/GoalMilestonesSection.svelte -->
<!--
	Goal Milestones Section - Standards-Compliant Inkprint Design

	Visual Treatment:
	- tx-frame tx-weak (canonical achievement zone)
	- Subtle emerald-tinted background (visual grouping within goal)
	- Clean borders (full opacity, crisp)
	- Compact/Nested spacing (follows SPACING_BORDER_STANDARDS.md)
	- Proper visual hierarchy (subordinate but distinct)

	Semantic Justification:
	- Goals (tx-bloom) = aspirational, ideation
	- Milestones (tx-frame) = canonical checkpoints, achievements
	- Emerald = success, completion (milestone identity)
	- Nested but visually grouped within parent goal

	Design Standards (per SPACING_BORDER_STANDARDS.md):
	- Container: tx-frame tx-weak + subtle bg-emerald tint
	- Spacing: px-3 py-1.5 (Compact/Nested pattern for "milestones under goals")
	- Gap: gap-2 (8px - proper icon+text pairing)
	- Icons: w-3.5 h-3.5 (14px - Compact tier)
	- Text: text-xs (12px - comfortable reading)
	- Borders: border-border (full opacity, crisp)
	- Dividers: divide-border/80 (matches page-wide pattern)
	- Radius: CTAs only (structure is edge-to-edge)
	- Hover: subtle emerald hints (semantic coherence)
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

	let localExpanded = $state(expanded);
	const isExpanded = $derived(onToggleExpanded ? expanded : localExpanded);
	const isGoalTerminal = $derived(goalState === 'achieved' || goalState === 'abandoned');

	const sortedMilestones = $derived.by(() => {
		const sorted = [...milestones].sort((a, b) => {
			const aState = resolveMilestoneState(a).state;
			const bState = resolveMilestoneState(b).state;
			const aIsTerminal = aState === 'completed' || aState === 'missed';
			const bIsTerminal = bState === 'completed' || bState === 'missed';
			if (aIsTerminal && !bIsTerminal) return 1;
			if (!aIsTerminal && bIsTerminal) return -1;
			const aDate = a.due_at ? new Date(a.due_at).getTime() : Infinity;
			const bDate = b.due_at ? new Date(b.due_at).getTime() : Infinity;
			const safeADate = Number.isNaN(aDate) ? Infinity : aDate;
			const safeBDate = Number.isNaN(bDate) ? Infinity : bDate;
			if (safeADate !== safeBDate) return safeADate - safeBDate;
			return a.title.localeCompare(b.title);
		});
		return sorted;
	});

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

	const completedCount = $derived(
		milestones.filter((m) => {
			const state = resolveMilestoneState(m).state;
			return state === 'completed';
		}).length
	);
	const totalCount = $derived(milestones.length);

	let showAll = $state(false);
	const visibleActiveMilestones = $derived(
		showAll ? activeMilestones : activeMilestones.slice(0, maxVisible)
	);
	const hasMore = $derived(activeMilestones.length > maxVisible);
	let completedExpanded = $state(false);

	function handleToggle() {
		if (onToggleExpanded) {
			onToggleExpanded(!expanded);
		} else {
			localExpanded = !localExpanded;
		}
	}
</script>

<!-- Achievement zone: tx-frame + subtle emerald background for visual grouping -->
<div
	class="border-t border-l border-border tx tx-frame tx-weak bg-emerald-50/5 dark:bg-emerald-900/5"
>
	{#if milestones.length === 0}
		<!-- Empty state: single compact row -->
		<div class="w-full flex items-center justify-between gap-2 px-3 py-1.5">
			<div class="flex items-center gap-2 min-w-0">
				<Flag class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
				<span class="text-xs text-muted-foreground truncate">No Milestones</span>
			</div>
			{#if canEdit && !isGoalTerminal}
				<button
					type="button"
					onclick={() => onAddMilestone(goalId, goalName)}
					class="px-2 py-0.5 rounded text-xs text-accent hover:bg-accent/10 transition-colors pressable"
					aria-label="Add milestone to {goalName}"
				>
					Add
				</button>
			{/if}
		</div>
	{:else}
		<!-- Section header -->
		<button
			type="button"
			onclick={handleToggle}
			class="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-emerald-50/20 dark:hover:bg-emerald-900/10 transition-colors"
			aria-expanded={isExpanded}
			aria-label={isExpanded ? 'Collapse milestones' : 'Expand milestones'}
		>
			<div class="flex items-center gap-2 min-w-0">
				<Flag class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
				<span class="text-xs text-muted-foreground truncate">
					{completedCount}/{totalCount} milestones
				</span>
			</div>
			<ChevronDown
				class="w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-150 {isExpanded
					? 'rotate-180'
					: ''}"
			/>
		</button>

		{#if isExpanded}
			<div transition:slide={{ duration: 120 }}>
				<div class="divide-y divide-border/80">
					{#each visibleActiveMilestones as milestone (milestone.id)}
						<MilestoneListItem
							{milestone}
							onEdit={onEditMilestone}
							onToggleComplete={canEdit ? onToggleMilestoneComplete : undefined}
							compact={true}
						/>
					{/each}

					{#if hasMore && !showAll}
						<button
							type="button"
							onclick={() => (showAll = true)}
							class="w-full px-3 py-1.5 text-center text-xs text-accent hover:bg-accent/10 transition-colors"
							aria-label="Show {activeMilestones.length - maxVisible} more milestones"
						>
							+{activeMilestones.length - maxVisible} more
						</button>
					{/if}

					{#if showCompletedSection && completedMilestones.length > 0}
						<div>
							<button
								type="button"
								onclick={() => (completedExpanded = !completedExpanded)}
								class="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-emerald-50/20 dark:hover:bg-emerald-900/10 transition-colors"
								aria-expanded={completedExpanded}
								aria-label={completedExpanded
									? 'Collapse completed milestones'
									: `Show ${completedMilestones.length} completed milestones`}
							>
								<span class="text-xs text-muted-foreground">
									{completedMilestones.length} completed
								</span>
								<ChevronDown
									class="w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-150 {completedExpanded
										? 'rotate-180'
										: ''}"
								/>
							</button>

							{#if completedExpanded}
								<div transition:slide={{ duration: 120 }}>
									<div class="divide-y divide-border/80">
										{#each completedMilestones as milestone (milestone.id)}
											<MilestoneListItem
												{milestone}
												onEdit={onEditMilestone}
												compact={true}
											/>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}

					{#if canEdit && !isGoalTerminal}
						<button
							type="button"
							onclick={() => onAddMilestone(goalId, goalName)}
							class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-accent hover:bg-accent/10 transition-all pressable"
							aria-label="Add milestone to {goalName}"
						>
							<Plus class="w-3 h-3 shrink-0" />
							Add milestone
						</button>
					{/if}
				</div>
			</div>
		{/if}
	{/if}
</div>
