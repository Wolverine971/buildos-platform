<!-- apps/web/src/lib/components/project/MobileCommandCenter.svelte -->
<!--
	Mobile Command Center Component

	Ultra-compact mobile layout for "context" entities. Tasks and Documents
	have their own dedicated mobile surfaces (MobileTaskBoard and
	ProjectDocumentsSection), so this component only handles:

	Row 1: Goals (with nested milestone progress)
	Row 2: Plans + Risks
	Row 3: Events

	Milestones are nested under goals; a flat Milestones list is also
	reachable via EntityTabStrip on mobile.

	Documentation:
	- Mobile parity audit: /apps/web/docs/features/mobile-command-center/MOBILE_PARITY_AUDIT_2026-05-12.md
	- Inkprint Design System: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
-->
<script lang="ts">
	import { Target, Flag, Calendar, Clock, AlertTriangle } from 'lucide-svelte';
	import CommandCenterRow from './CommandCenterRow.svelte';
	import CommandCenterPanel from './CommandCenterPanel.svelte';
	import GoalMilestonesSection from '$lib/components/ontology/GoalMilestonesSection.svelte';
	import type { Goal, Milestone, Plan, Risk, OntoEvent } from '$lib/types/onto';
	import {
		PANEL_CONFIGS,
		type FilterGroup,
		type InsightPanelKey,
		type InsightPanelState
	} from '$lib/components/ontology/insight-panels';
	import { resolveMilestoneState } from '$lib/utils/milestone-state';

	// Milestones are nested under goals; Tasks and Documents have their
	// own mobile surfaces and are no longer rendered here.
	//
	// PanelKey keeps the full key set to match `CommandCenterPanel`'s
	// internal type — we only ever toggle a subset, but narrowing breaks
	// the callback signature.
	type PanelKey = 'goals' | 'tasks' | 'plans' | 'risks' | 'documents' | 'events';

	interface Props {
		// Entity data arrays
		goals: Goal[];
		milestones: Milestone[];
		plans: Plan[];
		risks: Risk[];
		events: OntoEvent[];
		milestonesByGoalId?: Map<string, Milestone[]>;

		// Entity action callbacks - Add
		onAddGoal: () => void;
		onAddMilestoneFromGoal?: (goalId: string, goalName: string) => void;
		onAddPlan: () => void;
		onAddRisk: () => void;
		onAddEvent: () => void;

		// Entity action callbacks - Edit
		onEditGoal: (id: string) => void;
		onEditMilestone: (id: string) => void;
		onEditPlan: (id: string) => void;
		onEditRisk: (id: string) => void;
		onEditEvent: (id: string) => void;

		// Entity action callbacks - State change
		onToggleMilestoneComplete?: (milestoneId: string, currentState: string) => void;

		// Panel filter/sort controls (optional - enables insight panel features)
		panelStates?: Record<InsightPanelKey, InsightPanelState>;
		panelCounts?: Record<InsightPanelKey, Record<string, number>>;
		onFilterChange?: (panelKey: InsightPanelKey, filters: Record<string, string[]>) => void;
		onSortChange?: (
			panelKey: InsightPanelKey,
			sort: { field: string; direction: 'asc' | 'desc' }
		) => void;
		onToggleChange?: (panelKey: InsightPanelKey, toggleId: string, value: boolean) => void;
		onFilterOpen?: (panelKey: InsightPanelKey) => void | Promise<void>;
		taskFilterGroups?: FilterGroup[];

		// Permissions
		canEdit?: boolean;
	}

	let {
		goals,
		milestones,
		plans,
		risks,
		events,
		milestonesByGoalId,
		onAddGoal,
		onAddMilestoneFromGoal,
		onAddPlan,
		onAddRisk,
		onAddEvent,
		onEditGoal,
		onEditMilestone,
		onEditPlan,
		onEditRisk,
		onEditEvent,
		onToggleMilestoneComplete,
		panelStates,
		panelCounts,
		onFilterChange,
		onSortChange,
		onToggleChange,
		onFilterOpen,
		taskFilterGroups,
		canEdit = true
	}: Props = $props();

	// Check if filter/sort controls are enabled
	const hasControls = $derived(
		panelStates && panelCounts && onFilterChange && onSortChange && onToggleChange
	);

	// Single expansion state - only one panel can be expanded at a time
	let expandedPanel = $state<PanelKey | null>(null);

	function togglePanel(key: PanelKey) {
		expandedPanel = expandedPanel === key ? null : key;
	}

	// Helper to check if a panel's partner is expanded
	// Goals and Events are standalone full-width; Plans + Risks are paired.
	function isPartnerExpanded(key: PanelKey): boolean {
		if (key === 'plans') return expandedPanel === 'risks';
		if (key === 'risks') return expandedPanel === 'plans';
		return false;
	}

	function getGoalStateColor(state: string): string {
		switch (state) {
			case 'achieved':
				return 'text-success';
			case 'active':
				return 'text-warning';
			case 'abandoned':
				return 'text-destructive';
			default:
				return 'text-muted-foreground';
		}
	}

	function getRiskStateColor(state: string): string {
		switch (state) {
			case 'mitigated':
			case 'closed':
				return 'text-success';
			case 'occurred':
				return 'text-destructive';
			default:
				return 'text-muted-foreground';
		}
	}

	function getPlanStateColor(state: string): string {
		switch (state) {
			case 'completed':
				return 'text-success';
			case 'active':
				return 'text-warning';
			default:
				return 'text-muted-foreground';
		}
	}

	function getEventStateColor(state: string): string {
		switch (state) {
			case 'completed':
				return 'text-success';
			case 'confirmed':
				return 'text-info';
			case 'in_progress':
				return 'text-warning';
			case 'cancelled':
				return 'text-destructive';
			default:
				// Default 'scheduled' state
				return 'text-muted-foreground';
		}
	}
</script>

<div class="space-y-1.5">
	<!-- Row 1: Goals (Strategic) - Full Width with Nested Milestones -->
	<CommandCenterRow>
		<!-- Goals Panel (Standalone Full Width) -->
		<CommandCenterPanel
			panelKey="goals"
			label="Goals"
			icon={Target}
			iconColor="text-warning"
			count={goals.length}
			expanded={expandedPanel === 'goals'}
			partnerExpanded={false}
			onToggle={togglePanel}
			onAdd={onAddGoal}
			emptyMessage="Define what success looks like"
			fullWidth={true}
			panelConfig={hasControls ? PANEL_CONFIGS.goals : undefined}
			panelState={hasControls && panelStates ? panelStates.goals : undefined}
			toggleCounts={hasControls && panelCounts ? panelCounts.goals : undefined}
			onFilterChange={hasControls && onFilterChange
				? (filters) => onFilterChange('goals', filters)
				: undefined}
			onFilterOpen={hasControls && onFilterOpen ? () => onFilterOpen('goals') : undefined}
			onSortChange={hasControls && onSortChange
				? (sort) => onSortChange('goals', sort)
				: undefined}
			onToggleChange={hasControls && onToggleChange
				? (toggleId, value) => onToggleChange('goals', toggleId, value)
				: undefined}
		>
			{#each goals as goal (goal.id)}
				{@const goalMilestones = milestonesByGoalId?.get(goal.id) || []}
				{@const completedCount = goalMilestones.filter(
					(m) => resolveMilestoneState(m).state === 'completed'
				).length}
				<div class="border-b border-border/50 last:border-b-0">
					<!-- Goal Header -->
					<button
						type="button"
						onclick={() => onEditGoal(goal.id)}
						class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable"
					>
						<div class="flex items-center justify-between gap-2">
							<span class="text-xs text-foreground truncate">{goal.name}</span>
							<div class="flex items-center gap-2 shrink-0">
								{#if goalMilestones.length > 0}
									<span class="text-[10px] text-muted-foreground">
										<Flag class="w-2.5 h-2.5 inline-block mr-0.5" />
										{completedCount}/{goalMilestones.length}
									</span>
								{/if}
								<span
									class="text-[10px] capitalize {getGoalStateColor(
										goal.state_key
									)}"
								>
									{goal.state_key}
								</span>
							</div>
						</div>
					</button>

					<!-- Nested Milestones Section -->
					{#if milestonesByGoalId && onAddMilestoneFromGoal}
						<GoalMilestonesSection
							milestones={goalMilestones}
							goalId={goal.id}
							goalName={goal.name}
							goalState={goal.state_key}
							{canEdit}
							onAddMilestone={onAddMilestoneFromGoal}
							{onEditMilestone}
							{onToggleMilestoneComplete}
							expanded={false}
							maxVisible={3}
						/>
					{/if}
				</div>
			{/each}
		</CommandCenterPanel>
	</CommandCenterRow>

	<!-- Row 2: Plans + Risks (Execution + Context) -->
	<CommandCenterRow>
		<!-- Plans Panel -->
		<CommandCenterPanel
			panelKey="plans"
			label="Plans"
			icon={Calendar}
			iconColor="text-accent"
			count={plans.length}
			expanded={expandedPanel === 'plans'}
			partnerExpanded={isPartnerExpanded('plans')}
			onToggle={togglePanel}
			onAdd={onAddPlan}
			emptyMessage="Create a plan to organize work"
			panelConfig={hasControls ? PANEL_CONFIGS.plans : undefined}
			panelState={hasControls && panelStates ? panelStates.plans : undefined}
			toggleCounts={hasControls && panelCounts ? panelCounts.plans : undefined}
			onFilterChange={hasControls && onFilterChange
				? (filters) => onFilterChange('plans', filters)
				: undefined}
			onFilterOpen={hasControls && onFilterOpen ? () => onFilterOpen('plans') : undefined}
			onSortChange={hasControls && onSortChange
				? (sort) => onSortChange('plans', sort)
				: undefined}
			onToggleChange={hasControls && onToggleChange
				? (toggleId, value) => onToggleChange('plans', toggleId, value)
				: undefined}
		>
			{#each plans as plan (plan.id)}
				<button
					type="button"
					onclick={() => onEditPlan(plan.id)}
					class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable border-b border-border/50 last:border-b-0"
				>
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs text-foreground truncate">{plan.name}</span>
						<span
							class="text-[10px] capitalize shrink-0 {getPlanStateColor(
								plan.state_key
							)}">{plan.state_key}</span
						>
					</div>
				</button>
			{/each}
		</CommandCenterPanel>

		<!-- Risks Panel -->
		<CommandCenterPanel
			panelKey="risks"
			label="Risks"
			icon={AlertTriangle}
			iconColor="text-destructive"
			count={risks.length}
			expanded={expandedPanel === 'risks'}
			partnerExpanded={isPartnerExpanded('risks')}
			onToggle={togglePanel}
			onAdd={onAddRisk}
			emptyMessage="Track potential blockers"
			panelConfig={hasControls ? PANEL_CONFIGS.risks : undefined}
			panelState={hasControls && panelStates ? panelStates.risks : undefined}
			toggleCounts={hasControls && panelCounts ? panelCounts.risks : undefined}
			onFilterChange={hasControls && onFilterChange
				? (filters) => onFilterChange('risks', filters)
				: undefined}
			onFilterOpen={hasControls && onFilterOpen ? () => onFilterOpen('risks') : undefined}
			onSortChange={hasControls && onSortChange
				? (sort) => onSortChange('risks', sort)
				: undefined}
			onToggleChange={hasControls && onToggleChange
				? (toggleId, value) => onToggleChange('risks', toggleId, value)
				: undefined}
		>
			{#each risks as risk (risk.id)}
				<button
					type="button"
					onclick={() => onEditRisk(risk.id)}
					class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable border-b border-border/50 last:border-b-0"
				>
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs text-foreground truncate">{risk.title}</span>
						<span
							class="text-[10px] capitalize shrink-0 {getRiskStateColor(
								risk.state_key
							)}">{risk.state_key}</span
						>
					</div>
				</button>
			{/each}
		</CommandCenterPanel>
	</CommandCenterRow>

	<!-- Row 3: Events (Scheduling) - Standalone -->
	<CommandCenterRow>
		<!-- Events Panel (Standalone Full Width) -->
		<CommandCenterPanel
			panelKey="events"
			label="Events"
			icon={Clock}
			iconColor="text-info"
			count={events.length}
			expanded={expandedPanel === 'events'}
			partnerExpanded={false}
			onToggle={togglePanel}
			onAdd={onAddEvent}
			emptyMessage="Schedule meetings and events"
			fullWidth={true}
			panelConfig={hasControls ? PANEL_CONFIGS.events : undefined}
			panelState={hasControls && panelStates ? panelStates.events : undefined}
			toggleCounts={hasControls && panelCounts ? panelCounts.events : undefined}
			onFilterChange={hasControls && onFilterChange
				? (filters) => onFilterChange('events', filters)
				: undefined}
			onFilterOpen={hasControls && onFilterOpen ? () => onFilterOpen('events') : undefined}
			onSortChange={hasControls && onSortChange
				? (sort) => onSortChange('events', sort)
				: undefined}
			onToggleChange={hasControls && onToggleChange
				? (toggleId, value) => onToggleChange('events', toggleId, value)
				: undefined}
		>
			{#each events as event (event.id)}
				<button
					type="button"
					onclick={() => onEditEvent(event.id)}
					class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable border-b border-border/50 last:border-b-0"
				>
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs text-foreground truncate">{event.title}</span>
						<span
							class="text-[10px] capitalize shrink-0 {getEventStateColor(
								event.state_key
							)}">{(event.state_key || 'scheduled').replace(/_/g, ' ')}</span
						>
					</div>
				</button>
			{/each}
		</CommandCenterPanel>
	</CommandCenterRow>
</div>
