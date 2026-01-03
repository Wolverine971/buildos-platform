<!-- apps/web/src/lib/components/project/MobileCommandCenter.svelte -->
<!--
	Mobile Command Center Component

	Ultra-compact mobile layout for project data models.
	Organizes 8 entity types into 4 paired rows with single-expansion behavior.

	Row Layout:
	1. Goals + Milestones (Strategic)
	2. Tasks + Plans (Execution)
	3. Risks + Decisions (Governance)
	4. Documents + Outputs (Artifacts)

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
		AlertTriangle,
		Scale,
		FileText,
		Layers
	} from 'lucide-svelte';
	import CommandCenterRow from './CommandCenterRow.svelte';
	import CommandCenterPanel from './CommandCenterPanel.svelte';
	import type {
		Goal,
		Milestone,
		Task,
		Plan,
		Risk,
		Decision,
		Document,
		Output
	} from '$lib/types/onto';

	type PanelKey =
		| 'goals'
		| 'milestones'
		| 'tasks'
		| 'plans'
		| 'risks'
		| 'decisions'
		| 'documents'
		| 'outputs';

	interface Props {
		// Data
		goals: Goal[];
		milestones: Milestone[];
		tasks: Task[];
		plans: Plan[];
		risks: Risk[];
		decisions: Decision[];
		documents: Document[];
		outputs: Output[];

		// Add callbacks
		onAddGoal: () => void;
		onAddMilestone: () => void;
		onAddTask: () => void;
		onAddPlan: () => void;
		onAddRisk: () => void;
		onAddDecision: () => void;
		onAddDocument: () => void;
		onAddOutput: () => void;

		// Edit callbacks
		onEditGoal: (id: string) => void;
		onEditMilestone: (id: string) => void;
		onEditTask: (id: string) => void;
		onEditPlan: (id: string) => void;
		onEditRisk: (id: string) => void;
		onEditDecision: (id: string) => void;
		onEditDocument: (id: string) => void;
		onEditOutput: (id: string) => void;
	}

	let {
		goals,
		milestones,
		tasks,
		plans,
		risks,
		decisions,
		documents,
		outputs,
		onAddGoal,
		onAddMilestone,
		onAddTask,
		onAddPlan,
		onAddRisk,
		onAddDecision,
		onAddDocument,
		onAddOutput,
		onEditGoal,
		onEditMilestone,
		onEditTask,
		onEditPlan,
		onEditRisk,
		onEditDecision,
		onEditDocument,
		onEditOutput
	}: Props = $props();

	// Single expansion state - only one panel can be expanded at a time
	let expandedPanel = $state<PanelKey | null>(null);

	function togglePanel(key: PanelKey) {
		expandedPanel = expandedPanel === key ? null : key;
	}

	// Helper to check if a panel's partner is expanded
	function isPartnerExpanded(key: PanelKey): boolean {
		const pairs: Record<PanelKey, PanelKey> = {
			goals: 'milestones',
			milestones: 'goals',
			tasks: 'plans',
			plans: 'tasks',
			risks: 'decisions',
			decisions: 'risks',
			documents: 'outputs',
			outputs: 'documents'
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

	function getDecisionStateColor(state: string): string {
		switch (state) {
			case 'made':
				return 'text-emerald-500';
			case 'deferred':
				return 'text-amber-500';
			case 'reversed':
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

	function getOutputStateColor(state: string): string {
		switch (state) {
			case 'published':
				return 'text-emerald-500';
			case 'review':
				return 'text-amber-500';
			case 'in_progress':
				return 'text-sky-500';
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
		>
			{#each goals as goal (goal.id)}
				<button
					type="button"
					onclick={() => onEditGoal(goal.id)}
					class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable border-b border-border/30 last:border-b-0"
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
		>
			{#each milestones as milestone (milestone.id)}
				<button
					type="button"
					onclick={() => onEditMilestone(milestone.id)}
					class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable border-b border-border/30 last:border-b-0"
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
		>
			{#each tasks as task (task.id)}
				<button
					type="button"
					onclick={() => onEditTask(task.id)}
					class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable border-b border-border/30 last:border-b-0"
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
		>
			{#each plans as plan (plan.id)}
				<button
					type="button"
					onclick={() => onEditPlan(plan.id)}
					class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable border-b border-border/30 last:border-b-0"
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

	<!-- Row 3: Risks + Decisions (Governance) -->
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
		>
			{#each risks as risk (risk.id)}
				<button
					type="button"
					onclick={() => onEditRisk(risk.id)}
					class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable border-b border-border/30 last:border-b-0"
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

		<!-- Decisions Panel -->
		<CommandCenterPanel
			panelKey="decisions"
			label="Decisions"
			icon={Scale}
			iconColor="text-violet-500"
			count={decisions.length}
			expanded={expandedPanel === 'decisions'}
			partnerExpanded={isPartnerExpanded('decisions')}
			onToggle={togglePanel}
			onAdd={onAddDecision}
			emptyMessage="Record key choices"
		>
			{#each decisions as decision (decision.id)}
				<button
					type="button"
					onclick={() => onEditDecision(decision.id)}
					class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable border-b border-border/30 last:border-b-0"
				>
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs text-foreground truncate">{decision.title}</span>
						<span
							class="text-[10px] capitalize shrink-0 {getDecisionStateColor(
								decision.state_key
							)}">{decision.state_key}</span
						>
					</div>
				</button>
			{/each}
		</CommandCenterPanel>
	</CommandCenterRow>

	<!-- Row 4: Documents + Outputs (Artifacts) -->
	<CommandCenterRow>
		<!-- Documents Panel -->
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
					class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable border-b border-border/30 last:border-b-0"
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

		<!-- Outputs Panel -->
		<CommandCenterPanel
			panelKey="outputs"
			label="Outputs"
			icon={Layers}
			iconColor="text-purple-500"
			count={outputs.length}
			expanded={expandedPanel === 'outputs'}
			partnerExpanded={isPartnerExpanded('outputs')}
			onToggle={togglePanel}
			onAdd={onAddOutput}
			emptyMessage="Create deliverables"
		>
			{#each outputs as output (output.id)}
				<button
					type="button"
					onclick={() => onEditOutput(output.id)}
					class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable border-b border-border/30 last:border-b-0"
				>
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs text-foreground truncate">{output.name}</span>
						<span
							class="text-[10px] capitalize shrink-0 {getOutputStateColor(
								output.state_key
							)}">{output.state_key.replace('_', ' ')}</span
						>
					</div>
				</button>
			{/each}
		</CommandCenterPanel>
	</CommandCenterRow>
</div>
