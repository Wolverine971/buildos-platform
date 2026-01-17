<!-- apps/web/src/lib/components/ontology/GoalMilestonesSidebarSection.svelte -->
<!--
	Goal Milestones Sidebar Section Component

	Displays milestones within the GoalEditModal sidebar with:
	- Progress indicator (completed/total)
	- Sorted milestone list (active first, then by due date)
	- Quick toggle complete action
	- Add milestone button
	- Collapsible completed section

	This is the sidebar-optimized version for modals, distinct from
	GoalMilestonesSection which is used on goal cards in the project page.

	Documentation:
	- Spec: /thoughts/shared/research/2026-01-16_goal-milestone-section-in-modal-spec.md
	- Inkprint Design System: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md

	Related Files:
	- Parent: GoalEditModal.svelte
	- Project page version: GoalMilestonesSection.svelte
	- List item: MilestoneListItem.svelte
-->
<script lang="ts">
	import { slide } from 'svelte/transition';
	import {
		Flag,
		Plus,
		ChevronDown,
		Circle,
		CircleDot,
		CheckCircle2,
		XCircle,
		Check
	} from 'lucide-svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';

	interface Milestone {
		id: string;
		title?: string;
		name?: string;
		due_at?: string | null;
		state_key?: string | null;
	}

	interface Props {
		milestones: Milestone[];
		goalId: string;
		goalName: string;
		goalState: string;
		projectId: string;
		canEdit?: boolean;
		onAddMilestone: () => void;
		onEditMilestone: (milestoneId: string) => void;
		onToggleMilestoneComplete?: (milestoneId: string, currentState: string) => void;
	}

	let {
		milestones,
		goalId,
		goalName,
		goalState,
		projectId,
		canEdit = true,
		onAddMilestone,
		onEditMilestone,
		onToggleMilestoneComplete
	}: Props = $props();

	// Expansion state
	let isExpanded = $state(true);
	let showCompleted = $state(false);

	// Check if goal is in terminal state
	const isGoalTerminal = $derived(goalState === 'achieved' || goalState === 'abandoned');

	// Get display title (milestones use 'title', linked entities may have 'name')
	function getTitle(m: Milestone): string {
		return m.title || m.name || 'Untitled';
	}

	// Sort and categorize milestones
	const sortedMilestones = $derived.by(() => {
		return [...milestones].sort((a, b) => {
			const aState = a.state_key || 'pending';
			const bState = b.state_key || 'pending';

			// Completed/missed go to bottom
			const aIsTerminal = aState === 'completed' || aState === 'missed';
			const bIsTerminal = bState === 'completed' || bState === 'missed';
			if (aIsTerminal && !bIsTerminal) return 1;
			if (!aIsTerminal && bIsTerminal) return -1;

			// Then sort by due_at ascending
			const aDate = a.due_at ? new Date(a.due_at).getTime() : Infinity;
			const bDate = b.due_at ? new Date(b.due_at).getTime() : Infinity;
			if (aDate !== bDate) return aDate - bDate;

			// Fallback to title
			return getTitle(a).localeCompare(getTitle(b));
		});
	});

	const activeMilestones = $derived(
		sortedMilestones.filter((m) => {
			const state = m.state_key || 'pending';
			return state !== 'completed' && state !== 'missed';
		})
	);

	const completedMilestones = $derived(
		sortedMilestones.filter((m) => {
			const state = m.state_key || 'pending';
			return state === 'completed' || state === 'missed';
		})
	);

	// Progress stats
	const completedCount = $derived(milestones.filter((m) => m.state_key === 'completed').length);
	const totalCount = $derived(milestones.length);
	const progressPercent = $derived(
		totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
	);

	// State icon component mapping
	function getStateIcon(state: string | null | undefined) {
		const s = state || 'pending';
		if (s === 'completed') return CheckCircle2;
		if (s === 'missed') return XCircle;
		if (s === 'in_progress') return CircleDot;
		return Circle;
	}

	function getStateIconColor(state: string | null | undefined): string {
		const s = state || 'pending';
		if (s === 'completed') return 'text-emerald-500';
		if (s === 'missed') return 'text-destructive';
		if (s === 'in_progress') return 'text-accent';
		return 'text-muted-foreground';
	}

	// Check if milestone is past due
	function isPastDue(m: Milestone): boolean {
		if (!m.due_at) return false;
		const state = m.state_key || 'pending';
		if (state === 'completed') return false;
		const dueDate = new Date(m.due_at);
		return dueDate < new Date();
	}

	// Format due date
	function formatDueDate(dateString: string | null | undefined): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return '';

		const now = new Date();
		const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Tomorrow';
		if (diffDays === -1) return 'Yesterday';
		if (diffDays > 0 && diffDays <= 7) return `In ${diffDays}d`;
		if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)}d ago`;

		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	// Handle toggle complete
	function handleToggleComplete(e: MouseEvent, m: Milestone) {
		e.stopPropagation();
		if (onToggleMilestoneComplete) {
			onToggleMilestoneComplete(m.id, m.state_key || 'pending');
		}
	}

	// Handle milestone click
	function handleMilestoneClick(m: Milestone) {
		onEditMilestone(m.id);
	}

	// Handle keyboard on milestone row
	function handleKeyDown(e: KeyboardEvent, m: Milestone) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onEditMilestone(m.id);
		}
	}
</script>

<Card variant="elevated">
	<!-- Header with toggle -->
	<button
		type="button"
		onclick={() => (isExpanded = !isExpanded)}
		class="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/50 transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset rounded-t-lg"
		aria-expanded={isExpanded}
	>
		<div class="flex items-center gap-2">
			<Flag class="w-3.5 h-3.5 text-amber-500" />
			<span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
				Milestones
			</span>
			{#if totalCount > 0}
				<span class="text-[10px] text-muted-foreground/70 tabular-nums">
					{completedCount}/{totalCount}
				</span>
			{/if}
		</div>
		<ChevronDown
			class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 {isExpanded
				? 'rotate-180'
				: ''}"
		/>
	</button>

	<!-- Content -->
	{#if isExpanded}
		<div transition:slide={{ duration: 150 }} class="border-t border-border">
			<!-- Progress Bar (only show if milestones exist) -->
			{#if totalCount > 0}
				<div class="px-3 py-2 border-b border-border/50">
					<div class="flex items-center gap-2">
						<div class="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
							<div
								class="h-full bg-emerald-500/70 rounded-full transition-all duration-300"
								style="width: {progressPercent}%"
							></div>
						</div>
						<span class="text-[10px] text-muted-foreground tabular-nums"
							>{progressPercent}%</span
						>
					</div>
				</div>
			{/if}

			{#if milestones.length === 0}
				<!-- Empty State -->
				<div class="px-3 py-6 text-center tx tx-bloom tx-weak">
					<Flag class="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
					<p class="text-xs text-muted-foreground">No milestones yet</p>
					<p class="text-[10px] text-muted-foreground/70 mt-0.5">
						Break this goal into measurable checkpoints
					</p>
					{#if canEdit && !isGoalTerminal}
						<button
							type="button"
							onclick={onAddMilestone}
							class="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent/10 hover:bg-accent/20 text-xs font-medium text-accent transition-colors pressable"
						>
							<Plus class="w-3.5 h-3.5" />
							Add First Milestone
						</button>
					{/if}
				</div>
			{:else}
				<!-- Active Milestones -->
				<div class="divide-y divide-border/30">
					{#each activeMilestones as m (m.id)}
						{@const StateIcon = getStateIcon(m.state_key)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							onclick={() => handleMilestoneClick(m)}
							onkeydown={(e) => handleKeyDown(e, m)}
							role="button"
							tabindex="0"
							class="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-accent/5 transition-colors pressable group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
						>
							<!-- State Icon -->
							<StateIcon class="w-4 h-4 shrink-0 {getStateIconColor(m.state_key)}" />

							<!-- Content -->
							<div class="min-w-0 flex-1">
								<p class="text-xs sm:text-sm truncate text-foreground">
									{getTitle(m)}
								</p>
								{#if m.due_at}
									<p
										class="text-[10px] {isPastDue(m)
											? 'text-destructive'
											: 'text-muted-foreground'}"
									>
										{formatDueDate(m.due_at)}
									</p>
								{/if}
							</div>

							<!-- Quick complete button (hover only) -->
							{#if onToggleMilestoneComplete && m.state_key !== 'completed' && m.state_key !== 'missed'}
								<button
									type="button"
									onclick={(e) => handleToggleComplete(e, m)}
									class="hidden group-hover:flex items-center justify-center w-6 h-6 rounded shrink-0 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 transition-colors pressable"
									aria-label="Mark as complete"
									title="Mark as complete"
								>
									<Check class="w-3.5 h-3.5" />
								</button>
							{/if}
						</div>
					{/each}
				</div>

				<!-- Completed Section (Collapsible) -->
				{#if completedMilestones.length > 0}
					<div class="bg-muted/20 border-t border-border/50">
						<button
							type="button"
							onclick={() => (showCompleted = !showCompleted)}
							class="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-muted/30 transition-colors pressable"
						>
							<span class="text-[10px] text-muted-foreground">
								Completed ({completedMilestones.length})
							</span>
							<ChevronDown
								class="w-3 h-3 text-muted-foreground transition-transform duration-150 {showCompleted
									? 'rotate-180'
									: ''}"
							/>
						</button>

						{#if showCompleted}
							<div
								transition:slide={{ duration: 100 }}
								class="divide-y divide-border/20"
							>
								{#each completedMilestones as m (m.id)}
									{@const StateIcon = getStateIcon(m.state_key)}
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										onclick={() => handleMilestoneClick(m)}
										onkeydown={(e) => handleKeyDown(e, m)}
										role="button"
										tabindex="0"
										class="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-accent/5 transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
									>
										<StateIcon
											class="w-4 h-4 shrink-0 {getStateIconColor(
												m.state_key
											)}"
										/>
										<p
											class="text-xs truncate text-muted-foreground line-through flex-1"
										>
											{getTitle(m)}
										</p>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Add Milestone Button -->
				{#if canEdit && !isGoalTerminal}
					<div class="px-3 py-2 border-t border-border/50">
						<button
							type="button"
							onclick={onAddMilestone}
							class="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium text-accent hover:bg-accent/10 transition-colors pressable"
						>
							<Plus class="w-3.5 h-3.5" />
							Add Milestone
						</button>
					</div>
				{:else if isGoalTerminal}
					<div class="px-3 py-2 border-t border-border/50">
						<p class="text-[10px] text-muted-foreground/70 text-center">
							Goal is {goalState} - milestones locked
						</p>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</Card>
