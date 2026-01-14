<!-- apps/web/src/lib/components/project/MobileCommandCenter.svelte -->
<!--
	Mobile Command Center Component

	Ultra-compact mobile layout for project data models.
	Organizes 7 entity types into 4 rows with single-expansion behavior.
	Supports filter/sort controls when panelStates are provided.

	Row Layout:
	1. Goals + Milestones (Strategic)
	2. Tasks + Plans (Execution)
	3. Risks + Documents (Context)
	4. Events (Scheduling) - Standalone

	Documentation:
	- Mobile Command Center: /apps/web/docs/features/mobile-command-center/MOBILE_COMMAND_CENTER_SPEC.md
	- Inkprint Design System: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
-->
<script lang="ts">
	import {
		Target,
		Flag,
		ListChecks,
		Calendar,
		Clock,
		AlertTriangle,
		FileText
	} from 'lucide-svelte';
	import CommandCenterRow from './CommandCenterRow.svelte';
	import CommandCenterPanel from './CommandCenterPanel.svelte';
	import type { Goal, Milestone, Task, Plan, Risk, Document, OntoEvent } from '$lib/types/onto';
	import {
		PANEL_CONFIGS,
		type InsightPanelKey,
		type InsightPanelState
	} from '$lib/components/ontology/insight-panels';

	type PanelKey = 'goals' | 'milestones' | 'tasks' | 'plans' | 'risks' | 'documents' | 'events';

	interface Props {
		// Data
		goals: Goal[];
		milestones: Milestone[];
		tasks: Task[];
		plans: Plan[];
		risks: Risk[];
		documents: Document[];
		events: OntoEvent[];

		// Add callbacks
		onAddGoal: () => void;
		onAddMilestone: () => void;
		onAddTask: () => void;
		onAddPlan: () => void;
		onAddRisk: () => void;
		onAddDocument: () => void;
		onAddEvent: () => void;

		// Edit callbacks
		onEditGoal: (id: string) => void;
		onEditMilestone: (id: string) => void;
		onEditTask: (id: string) => void;
		onEditPlan: (id: string) => void;
		onEditRisk: (id: string) => void;
		onEditDocument: (id: string) => void;
		onEditEvent: (id: string) => void;

		// Optional filter/sort state and callbacks
		panelStates?: Record<InsightPanelKey, InsightPanelState>;
		panelCounts?: Record<InsightPanelKey, Record<string, number>>;
		onFilterChange?: (panelKey: InsightPanelKey, filters: Record<string, string[]>) => void;
		onSortChange?: (
			panelKey: InsightPanelKey,
			sort: { field: string; direction: 'asc' | 'desc' }
		) => void;
		onToggleChange?: (panelKey: InsightPanelKey, toggleId: string, value: boolean) => void;
	}

	let {
		goals,
		milestones,
		tasks,
		plans,
		risks,
		documents,
		events,
		onAddGoal,
		onAddMilestone,
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
		panelStates,
		panelCounts,
		onFilterChange,
		onSortChange,
		onToggleChange
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
	function isPartnerExpanded(key: PanelKey): boolean {
		// Events is standalone - no partner
		if (key === 'events') return false;

		const pairs: Record<Exclude<PanelKey, 'events'>, PanelKey> = {
			goals: 'milestones',
			milestones: 'goals',
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

	function getMilestoneStateColor(state: string): string {
		switch (state) {
			case 'completed':
				return 'text-emerald-500';
			case 'in_progress':
				return 'text-amber-500';
			case 'missed':
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

	function getDocumentStateColor(state: string): string {
		switch (state) {
			case 'published':
				return 'text-emerald-500';
			case 'ready':
				return 'text-sky-500';
			case 'review':
			case 'in_review':
				return 'text-amber-500';
			case 'archived':
				return 'text-muted-foreground';
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
	<!-- Row 1: Goals + Milestones (Strategic) -->
	<CommandCenterRow>
		<!-- Goals Panel -->
		<CommandCenterPanel
			panelKey="goals"
			label="Goals"
			icon={Target}
			iconColor="text-amber-500"
			count={goals.length}
			expanded={expandedPanel === 'goals'}
			partnerExpanded={isPartnerExpanded('goals')}
			onToggle={togglePanel}
			onAdd={onAddGoal}
			emptyMessage="Define what success looks like"
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
				<button
					type="button"
					onclick={() => onEditGoal(goal.id)}
					class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable border-b border-border/50 last:border-b-0"
				>
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs text-foreground truncate">{goal.name}</span>
						<span
							class="text-[10px] capitalize shrink-0 {getGoalStateColor(
								goal.state_key
							)}">{goal.state_key}</span
						>
					</div>
				</button>
			{/each}
		</CommandCenterPanel>

		<!-- Milestones Panel -->
		<CommandCenterPanel
			panelKey="milestones"
			label="Milestones"
			icon={Flag}
			iconColor="text-emerald-500"
			count={milestones.length}
			expanded={expandedPanel === 'milestones'}
			partnerExpanded={isPartnerExpanded('milestones')}
			onToggle={togglePanel}
			onAdd={onAddMilestone}
			emptyMessage="Set checkpoints and dates"
			panelConfig={hasControls ? PANEL_CONFIGS.milestones : undefined}
			panelState={hasControls && panelStates ? panelStates.milestones : undefined}
			toggleCounts={hasControls && panelCounts ? panelCounts.milestones : undefined}
			onFilterChange={hasControls && onFilterChange
				? (filters) => onFilterChange('milestones', filters)
				: undefined}
			onSortChange={hasControls && onSortChange
				? (sort) => onSortChange('milestones', sort)
				: undefined}
			onToggleChange={hasControls && onToggleChange
				? (toggleId, value) => onToggleChange('milestones', toggleId, value)
				: undefined}
		>
			{#each milestones as milestone (milestone.id)}
				<button
					type="button"
					onclick={() => onEditMilestone(milestone.id)}
					class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable border-b border-border/50 last:border-b-0"
				>
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs text-foreground truncate">{milestone.title}</span>
						<span
							class="text-[10px] capitalize shrink-0 {getMilestoneStateColor(
								milestone.state_key
							)}">{milestone.state_key}</span
						>
					</div>
				</button>
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

		<!-- Documents Panel (no filter/sort - handled separately in desktop view) -->
		<CommandCenterPanel
			panelKey="documents"
			label="Documents"
			icon={FileText}
			iconColor="text-sky-500"
			count={documents.length}
			expanded={expandedPanel === 'documents'}
			partnerExpanded={isPartnerExpanded('documents')}
			onToggle={togglePanel}
			onAdd={onAddDocument}
			emptyMessage="Add notes and research"
		>
			{#each documents as doc (doc.id)}
				<button
					type="button"
					onclick={() => onEditDocument(doc.id)}
					class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable border-b border-border/50 last:border-b-0"
				>
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs text-foreground truncate">{doc.title}</span>
						<span
							class="text-[10px] capitalize shrink-0 {getDocumentStateColor(
								doc.state_key
							)}">{doc.state_key}</span
						>
					</div>
				</button>
			{/each}
		</CommandCenterPanel>
	</CommandCenterRow>

	<!-- Row 4: Events (Scheduling) - Standalone -->
	<CommandCenterRow>
		<!-- Events Panel -->
		<CommandCenterPanel
			panelKey="events"
			label="Events"
			icon={Clock}
			iconColor="text-teal-500"
			count={events.length}
			expanded={expandedPanel === 'events'}
			partnerExpanded={isPartnerExpanded('events')}
			onToggle={togglePanel}
			onAdd={onAddEvent}
			emptyMessage="Schedule meetings and events"
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
