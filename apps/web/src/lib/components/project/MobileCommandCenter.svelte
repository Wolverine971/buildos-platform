<!-- apps/web/src/lib/components/project/MobileCommandCenter.svelte -->
<!--
	Mobile Command Center Component

	Ultra-compact mobile layout for project data models.
	Organizes entity types into rows with single-expansion behavior.
	Supports filter/sort controls when panelStates are provided.

	Row Layout:
	1. Goals (with nested milestone progress)
	2. Tasks + Plans (Execution)
	3. Risks + Documents (Context)
	4. Events (Scheduling) - Standalone

	Note: Milestones are now nested under goals, not shown as a separate panel.
	See: /thoughts/shared/research/2026-01-16_milestones-under-goals-ux-proposal.md

	Documentation:
	- Mobile Command Center: /apps/web/docs/features/mobile-command-center/MOBILE_COMMAND_CENTER_SPEC.md
	- Inkprint Design System: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
-->
<script lang="ts">
	import { Target, Flag, ListChecks, Calendar, Clock, AlertTriangle } from 'lucide-svelte';
	import CommandCenterRow from './CommandCenterRow.svelte';
	import CommandCenterPanel from './CommandCenterPanel.svelte';
	import CommandCenterDocumentsPanel from './CommandCenterDocumentsPanel.svelte';
	import GoalMilestonesSection from '$lib/components/ontology/GoalMilestonesSection.svelte';
	import type { Goal, Milestone, Task, Plan, Risk, Document, OntoEvent } from '$lib/types/onto';
	import type { DocStructure, OntoDocument } from '$lib/types/onto-api';
	import {
		PANEL_CONFIGS,
		type InsightPanelKey,
		type InsightPanelState
	} from '$lib/components/ontology/insight-panels';
	import { resolveMilestoneState } from '$lib/utils/milestone-state';

	// Note: 'milestones' removed from PanelKey - now nested under goals
	type PanelKey = 'goals' | 'tasks' | 'plans' | 'risks' | 'documents' | 'events';

	interface Props {
		// Entity data arrays
		goals: Goal[];
		milestones: Milestone[];
		tasks: Task[];
		plans: Plan[];
		risks: Risk[];
		documents: Document[];
		events: OntoEvent[];
		milestonesByGoalId?: Map<string, Milestone[]>;

		// Hierarchical document tree data (optional - falls back to flat list)
		docStructure?: DocStructure | null;
		docTreeDocuments?: Record<string, OntoDocument>;
		projectId?: string;

		// Entity action callbacks - Add
		onAddGoal: () => void;
		onAddMilestoneFromGoal?: (goalId: string, goalName: string) => void;
		onAddTask: () => void;
		onAddPlan: () => void;
		onAddRisk: () => void;
		onAddDocument: () => void;
		onAddEvent: () => void;

		// Entity action callbacks - Edit
		onEditGoal: (id: string) => void;
		onEditMilestone: (id: string) => void;
		onEditTask: (id: string) => void;
		onEditPlan: (id: string) => void;
		onEditRisk: (id: string) => void;
		onEditDocument: (id: string) => void;
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

		// Permissions
		canEdit?: boolean;
	}

	let {
		goals,
		milestones,
		tasks,
		plans,
		risks,
		documents,
		events,
		milestonesByGoalId,
		docStructure,
		docTreeDocuments,
		projectId,
		onAddGoal,
		onAddMilestoneFromGoal,
		onAddTask,
		onAddPlan,
		onAddRisk,
		onAddDocument,
		onAddEvent,
		onEditGoal,
		onEditMilestone,
		onEditTask,
		onEditPlan,
		onEditRisk,
		onEditDocument,
		onEditEvent,
		onToggleMilestoneComplete,
		panelStates,
		panelCounts,
		onFilterChange,
		onSortChange,
		onToggleChange,
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
	// Note: Goals and Events are standalone, others are paired
	function isPartnerExpanded(key: PanelKey): boolean {
		// Standalone panels have no partner
		if (key === 'goals' || key === 'events') return false;

		const pairs: Record<'tasks' | 'plans' | 'risks' | 'documents', PanelKey> = {
			tasks: 'plans',
			plans: 'tasks',
			risks: 'documents',
			documents: 'risks'
		};
		return expandedPanel === pairs[key];
	}

	// State badge colors
	function getTaskStateColor(state: string): string {
		switch (state) {
			case 'done':
				return 'text-emerald-500';
			case 'in_progress':
				return 'text-amber-500';
			case 'blocked':
				return 'text-red-500';
			default:
				return 'text-muted-foreground';
		}
	}

	function getGoalStateColor(state: string): string {
		switch (state) {
			case 'achieved':
				return 'text-emerald-500';
			case 'active':
				return 'text-amber-500';
			case 'abandoned':
				return 'text-red-500';
			default:
				return 'text-muted-foreground';
		}
	}

	function getRiskStateColor(state: string): string {
		switch (state) {
			case 'mitigated':
			case 'closed':
				return 'text-emerald-500';
			case 'occurred':
				return 'text-red-500';
			default:
				return 'text-muted-foreground';
		}
	}

	function getPlanStateColor(state: string): string {
		switch (state) {
			case 'completed':
				return 'text-emerald-500';
			case 'active':
				return 'text-amber-500';
			default:
				return 'text-muted-foreground';
		}
	}

	function getEventStateColor(state: string): string {
		switch (state) {
			case 'completed':
				return 'text-emerald-500';
			case 'confirmed':
				return 'text-sky-500';
			case 'in_progress':
				return 'text-amber-500';
			case 'cancelled':
				return 'text-red-500';
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
			iconColor="text-amber-500"
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

	<!-- Row 2: Tasks + Plans (Execution) -->
	<CommandCenterRow>
		<!-- Tasks Panel -->
		<CommandCenterPanel
			panelKey="tasks"
			label="Tasks"
			icon={ListChecks}
			iconColor="text-slate-500"
			count={tasks.length}
			expanded={expandedPanel === 'tasks'}
			partnerExpanded={isPartnerExpanded('tasks')}
			onToggle={togglePanel}
			onAdd={onAddTask}
			emptyMessage="Add tasks to track work"
			panelConfig={hasControls ? PANEL_CONFIGS.tasks : undefined}
			panelState={hasControls && panelStates ? panelStates.tasks : undefined}
			toggleCounts={hasControls && panelCounts ? panelCounts.tasks : undefined}
			onFilterChange={hasControls && onFilterChange
				? (filters) => onFilterChange('tasks', filters)
				: undefined}
			onSortChange={hasControls && onSortChange
				? (sort) => onSortChange('tasks', sort)
				: undefined}
			onToggleChange={hasControls && onToggleChange
				? (toggleId, value) => onToggleChange('tasks', toggleId, value)
				: undefined}
		>
			{#each tasks as task (task.id)}
				<button
					type="button"
					onclick={() => onEditTask(task.id)}
					class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable border-b border-border/50 last:border-b-0"
				>
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs text-foreground truncate">{task.title}</span>
						<span
							class="text-[10px] capitalize shrink-0 {getTaskStateColor(
								task.state_key
							)}">{task.state_key.replace('_', ' ')}</span
						>
					</div>
				</button>
			{/each}
		</CommandCenterPanel>

		<!-- Plans Panel -->
		<CommandCenterPanel
			panelKey="plans"
			label="Plans"
			icon={Calendar}
			iconColor="text-indigo-500"
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
	</CommandCenterRow>

	<!-- Row 3: Risks + Documents (Context) -->
	<CommandCenterRow>
		<!-- Risks Panel -->
		<CommandCenterPanel
			panelKey="risks"
			label="Risks"
			icon={AlertTriangle}
			iconColor="text-red-500"
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

		<!-- Documents Panel - Uses hierarchical tree when available -->
		<CommandCenterDocumentsPanel
			projectId={projectId ?? ''}
			{documents}
			{docStructure}
			{docTreeDocuments}
			expanded={expandedPanel === 'documents'}
			partnerExpanded={isPartnerExpanded('documents')}
			onToggle={() => togglePanel('documents')}
			onAddDocument={(_parentId) => onAddDocument()}
			{onEditDocument}
			{canEdit}
		/>
	</CommandCenterRow>

	<!-- Row 4: Events (Scheduling) - Standalone -->
	<CommandCenterRow>
		<!-- Events Panel (Standalone Full Width) -->
		<CommandCenterPanel
			panelKey="events"
			label="Events"
			icon={Clock}
			iconColor="text-teal-500"
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
