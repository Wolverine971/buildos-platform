<!-- apps/web/src/routes/ontology/projects/[id]/+page.svelte -->
<!--
	Ontology Project Detail Page

	Main interface for managing all entities within an ontology project:
	- Tasks (full CRUD operations)
	- Plans (create operation)
	- Goals (create operation)
	- Documents (view and create)
	- Requirements, Milestones, Risks, etc.

	Documentation:
	- 📚 Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- 📊 Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- 🔧 Implementation Guide: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
	- 🎨 BuildOS Style Guide: /apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md
	- 🔍 Navigation Index: /apps/web/docs/NAVIGATION_INDEX.md

	Related Components:
	- Task Management: /apps/web/src/lib/components/ontology/TaskCreateModal.svelte
	- Plan Management: /apps/web/src/lib/components/ontology/PlanCreateModal.svelte
	- Goal Management: /apps/web/src/lib/components/ontology/GoalCreateModal.svelte

	API Integration:
	- Server Data Loading: /apps/web/src/routes/ontology/projects/[id]/+page.server.ts
	- Task API: /apps/web/src/routes/api/onto/tasks/
	- Plan API: /apps/web/src/routes/api/onto/plans/
	- Goal API: /apps/web/src/routes/api/onto/goals/
-->
<script lang="ts">
	// ============================================================
	// IMPORTS
	// ============================================================
	import { goto, invalidateAll } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import TabNav, { type Tab } from '$lib/components/ui/TabNav.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import OutputCreateModal from '$lib/components/ontology/OutputCreateModal.svelte';
	import TaskCreateModal from '$lib/components/ontology/TaskCreateModal.svelte';
	import TaskEditModal from '$lib/components/ontology/TaskEditModal.svelte';
	import PlanCreateModal from '$lib/components/ontology/PlanCreateModal.svelte';
	import GoalCreateModal from '$lib/components/ontology/GoalCreateModal.svelte';
	import FSMStateVisualizer from '$lib/components/ontology/FSMStateVisualizer.svelte';
	import GoalReverseEngineerModal from '$lib/components/ontology/GoalReverseEngineerModal.svelte';
	import OntologyProjectHeader from '$lib/components/ontology/OntologyProjectHeader.svelte';
	import OntologyProjectEditModal from '$lib/components/ontology/OntologyProjectEditModal.svelte';
	import OntologyContextDocModal from '$lib/components/ontology/OntologyContextDocModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import {
		Plus,
		FileEdit,
		Edit2,
		ChevronRight,
		ChevronDown,
		Calendar,
		Target,
		FileText,
		Sparkles
	} from 'lucide-svelte';
	import type { GoalReverseEngineeringResult } from '$lib/services/ontology/goal-reverse-engineering.service';
	import {
		getTaskStateBadgeClass,
		getOutputStateBadgeClass,
		getPlanStateBadgeClass,
		getGoalStateBadgeClass,
		getPriorityBadgeClass
	} from '$lib/utils/ontology-badge-styles';

	// ============================================================
	// TYPES
	// ============================================================

	interface Project {
		id: string;
		name: string;
		description?: string;
		type_key: string;
		state_key: string;
		facet_context?: string;
		facet_scale?: string;
		facet_stage?: string;
		props?: Record<string, unknown>;
	}

	interface Task {
		id: string;
		title: string;
		state_key: string;
		plan_id?: string;
		priority?: number | null;
		props?: {
			description?: string;
			supporting_milestone_id?: string;
			[key: string]: unknown;
		};
	}

	interface Output {
		id: string;
		name: string;
		type_key: string;
		state_key: string;
		props?: {
			word_count?: number;
			[key: string]: unknown;
		};
	}

	interface Document {
		id: string;
		project_id: string;
		title: string;
		name?: string;
		type_key: string;
		state_key: string;
		props?: Record<string, unknown> | null;
		created_by: string;
		created_at: string;
		updated_at: string;
	}

	interface TemplateMeta {
		id?: string;
		name: string;
		type_key: string;
		scope?: string;
	}

	interface Plan {
		id: string;
		name: string;
		type_key: string;
		state_key: string;
		props?: {
			start_date?: string;
			end_date?: string;
			[key: string]: unknown;
		};
	}

	interface Goal {
		id: string;
		name: string;
		type_key?: string | null;
		state_key: string;
		props?: {
			measurement_criteria?: string;
			priority?: 'low' | 'medium' | 'high' | 'urgent';
			[key: string]: unknown;
		};
	}

	type Guard = Record<string, unknown>;
	type TransitionAction = Record<string, unknown>;

	interface TransitionDetail {
		event: string;
		to: string;
		guards?: Guard[];
		actions?: TransitionAction[];
	}

	interface Requirement {
		text: string;
		[key: string]: unknown;
	}

	interface Milestone {
		id: string;
		title: string;
		due_at: string;
		props?: {
			goal_id?: string;
			summary?: string;
			[key: string]: unknown;
		} | null;
	}

	interface Risk {
		title: string;
		impact: string;
		[key: string]: unknown;
	}

	type ReverseEngineerMilestonePayload = {
		title: string;
		due_at: string | null;
		summary: string | null;
		type_key?: string | null;
		confidence?: number | null;
		tasks: Array<{
			title: string;
			description: string | null;
			state_key: string;
			priority: number | null;
		}>;
	};

	// ============================================================
	// PROPS & DATA
	// ============================================================
	let { data } = $props();

	// ============================================================
	// DERIVED STATE
	// ============================================================
	let project = $state(data.project as Project);
	const tasks = $derived((data.tasks || []) as Task[]);
	const outputs = $derived((data.outputs || []) as Output[]);
	const documents = $derived((data.documents || []) as Document[]);
	const plans = $derived((data.plans || []) as Plan[]);
	const goals = $derived((data.goals || []) as Goal[]);
	const requirements = $derived((data.requirements || []) as Requirement[]);
	const milestones = $derived((data.milestones || []) as Milestone[]);
	const risks = $derived((data.risks || []) as Risk[]);
	const template = $derived((data.template || null) as TemplateMeta | null);
	const contextDocument = $derived((data.context_document || null) as Document | null);
	const allowedTransitions = $derived((data.allowed_transitions || []) as TransitionDetail[]);
	const initialTransitionDetails = $derived(
		allowedTransitions.map((transition) => ({
			event: transition.event,
			to: transition.to,
			guards: (transition.guards ?? []) as Guard[],
			actions: (transition.actions ?? []) as TransitionAction[]
		}))
	);

	const projectStats = $derived({
		tasks: tasks.length,
		goals: goals.length,
		plans: plans.length,
		outputs: outputs.length,
		documents: documents.length
	});

	$effect(() => {
		project = data.project as Project;
	});

	// ============================================================
	// COMPONENT STATE
	// ============================================================
	let activeTab = $state('tasks');
	let showOutputCreateModal = $state(false);
	let showTaskCreateModal = $state(false);
	let showPlanCreateModal = $state(false);
	let showGoalCreateModal = $state(false);
	let showProjectEditModal = $state(false);
	let showContextDocModal = $state(false);
	let showDeleteProjectModal = $state(false);
	let isDeletingProject = $state(false);
	let deleteProjectError = $state<string | null>(null);
	let editingTaskId = $state<string | null>(null);
	let expandedGoalId = $state<string | null>(null);
	let reverseEngineeringGoalId = $state<string | null>(null);
	let reverseEngineerModalOpen = $state(false);
	let reverseEngineerPreview = $state<GoalReverseEngineeringResult | null>(null);
	let reverseEngineerGoalMeta = $state<{ id: string; name: string } | null>(null);
	let approvingReverseEngineer = $state(false);

	// ✅ Debug effect to track modal state changes
	$effect(() => {
		if (showGoalCreateModal) {
			console.log('[GoalCreateModal] Modal opened');
		}
	});

	const tabs = $derived<Tab[]>([
		{ id: 'tasks', label: 'Tasks', count: tasks.length },
		{ id: 'outputs', label: 'Outputs', count: outputs.length },
		{ id: 'documents', label: 'Documents', count: documents.length },
		{ id: 'plans', label: 'Plans', count: plans.length },
		{ id: 'goals', label: 'Goals', count: goals.length },
		{
			id: 'other',
			label: 'Other',
			count: requirements.length + milestones.length + risks.length
		}
	]);

	// ✅ Fixed $derived syntax - remove arrow functions, use IIFE pattern for complex logic
	const milestonesByGoal = $derived(
		(() => {
			const map = new Map<string, Milestone[]>();
			for (const milestone of milestones) {
				const goalId = getGoalIdFromMilestone(milestone);
				if (!goalId) continue;
				const existing = map.get(goalId);
				if (existing) {
					existing.push(milestone);
				} else {
					map.set(goalId, [milestone]);
				}
			}
			return map;
		})()
	);

	const tasksByMilestone = $derived(
		(() => {
			const map = new Map<string, Task[]>();
			for (const task of tasks) {
				const milestoneId = getMilestoneIdFromTask(task);
				if (!milestoneId) continue;
				const existing = map.get(milestoneId);
				if (existing) {
					existing.push(task);
				} else {
					map.set(milestoneId, [task]);
				}
			}
			return map;
		})()
	);

	const goalStats = $derived(
		(() => {
			const stats = new Map<
				string,
				{ milestoneCount: number; taskCount: number; completedTaskCount: number }
			>();

			for (const goal of goals) {
				const goalMilestones = milestonesByGoal.get(goal.id) ?? [];
				let totalTasks = 0;
				let completedTasks = 0;

				for (const milestone of goalMilestones) {
					const milestoneTasks = tasksByMilestone.get(milestone.id) ?? [];
					totalTasks += milestoneTasks.length;
					completedTasks += milestoneTasks.filter((task) => isTaskComplete(task)).length;
				}

				stats.set(goal.id, {
					milestoneCount: goalMilestones.length,
					taskCount: totalTasks,
					completedTaskCount: completedTasks
				});
			}

			return stats;
		})()
	);

	// ============================================================
	// EVENT HANDLERS
	// ============================================================
	function handleTabChange(tabId: string) {
		activeTab = tabId;
	}

	async function handleStateChange(): Promise<void> {
		await invalidateAll();
	}

	function handleProjectSaved(updatedProject: Project): void {
		project = updatedProject;
	}

	function openDeleteModal(): void {
		deleteProjectError = null;
		showDeleteProjectModal = true;
	}

	function closeDeleteModal(): void {
		if (isDeletingProject) return;
		showDeleteProjectModal = false;
	}

	async function handleProjectDeleteConfirm(): Promise<void> {
		if (!project?.id) return;

		isDeletingProject = true;
		deleteProjectError = null;

		try {
			const response = await fetch(`/api/onto/projects/${project.id}`, {
				method: 'DELETE'
			});

			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to delete project');
			}

			toastService.success('Project deleted');
			showDeleteProjectModal = false;
			await invalidateAll();
			goto('/ontology');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to delete project';
			deleteProjectError = message;
			toastService.error(message);
		} finally {
			isDeletingProject = false;
		}
	}

	// ============================================================
	// HELPER FUNCTIONS
	// ============================================================
	function getGoalIdFromMilestone(milestone: Milestone): string | null {
		const goalId = milestone.props?.goal_id;
		return typeof goalId === 'string' ? goalId : null;
	}

	function getMilestoneIdFromTask(task: Task): string | null {
		const milestoneId = task.props?.supporting_milestone_id;
		return typeof milestoneId === 'string' ? milestoneId : null;
	}

	function isTaskComplete(task: Task): boolean {
		const normalized = task.state_key?.toLowerCase?.() ?? '';
		return normalized === 'done' || normalized === 'completed' || normalized === 'complete';
	}

	function getGoalMilestones(goalId: string): Milestone[] {
		return milestonesByGoal.get(goalId) ?? [];
	}

	function getMilestoneTasks(milestoneId: string): Task[] {
		return tasksByMilestone.get(milestoneId) ?? [];
	}

	function handleReverseEngineerModalClose() {
		reverseEngineerModalOpen = false;
		reverseEngineerPreview = null;
		reverseEngineerGoalMeta = null;
		approvingReverseEngineer = false;
	}

	function convertDateToISO(dateString: string | null): string | null {
		if (!dateString) return null;
		const parsed = new Date(`${dateString}T00:00:00Z`);
		if (Number.isNaN(parsed.getTime())) {
			return null;
		}
		return parsed.toISOString();
	}

	// Event handler removed - now using direct prop callback

	function getGoalStatsForDisplay(goalId: string) {
		return (
			goalStats.get(goalId) ?? {
				milestoneCount: 0,
				taskCount: 0,
				completedTaskCount: 0
			}
		);
	}

	function getMilestoneTaskStats(milestoneId: string) {
		const milestoneTasks = getMilestoneTasks(milestoneId);
		return {
			total: milestoneTasks.length,
			completed: milestoneTasks.filter((task) => isTaskComplete(task)).length
		};
	}

	function formatDueDate(dateString: string) {
		const date = new Date(dateString);
		if (Number.isNaN(date.getTime())) {
			return 'No due date';
		}
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function toggleGoalExpansion(goalId: string) {
		expandedGoalId = expandedGoalId === goalId ? null : goalId;
	}

	async function handleReverseEngineerGoal(goalId: string) {
		if (reverseEngineeringGoalId) return;

		try {
			reverseEngineeringGoalId = goalId;
			const response = await fetch(`/api/onto/goals/${goalId}/reverse`, {
				method: 'POST'
			});

			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to generate plan preview');
			}

			const preview = payload?.data?.preview as GoalReverseEngineeringResult | undefined;
			if (!preview || !preview.milestones?.length) {
				throw new Error('Model did not return any milestones. Try again.');
			}

			const goalMeta = (payload?.data?.goal as { id: string; name: string } | undefined) ??
				goals.find((goal) => goal.id === goalId) ?? {
					id: goalId,
					name: 'Goal'
				};

			reverseEngineerPreview = preview;
			reverseEngineerGoalMeta = {
				id: goalMeta.id,
				name: goalMeta.name
			};
			reverseEngineerModalOpen = true;
		} catch (error) {
			console.error('[Goal Reverse] Failed', error);
			const message =
				error instanceof Error && error.message
					? error.message
					: 'Failed to generate plan preview';
			toastService.error(message);
		} finally {
			reverseEngineeringGoalId = null;
		}
	}

	async function handleReverseEngineerApproval(milestones: ReverseEngineerMilestonePayload[]) {
		if (!reverseEngineerGoalMeta) return;

		try {
			approvingReverseEngineer = true;
			const response = await fetch(
				`/api/onto/goals/${reverseEngineerGoalMeta.id}/reverse/apply`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						milestones: milestones.map((milestone) => ({
							...milestone,
							due_at: convertDateToISO(milestone.due_at)
						}))
					})
				}
			);

			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to create milestones');
			}

			const createdMilestones = Number(
				payload?.data?.milestones_created ?? milestones.length
			);
			const createdTasks = Number(payload?.data?.tasks_created ?? 0);

			toastService.success(
				`Created ${createdMilestones} milestone${createdMilestones === 1 ? '' : 's'} and ${createdTasks} task${createdTasks === 1 ? '' : 's'}.`
			);

			await invalidateAll();
			expandedGoalId = reverseEngineerGoalMeta.id;
			handleReverseEngineerModalClose();
		} catch (error) {
			console.error('[Goal Reverse] Apply failed', error);
			const message =
				error instanceof Error && error.message
					? error.message
					: 'Failed to create milestones';
			toastService.error(message);
		} finally {
			approvingReverseEngineer = false;
		}
	}

	function editOutput(outputId: string) {
		goto(`/ontology/projects/${project.id}/outputs/${outputId}/edit`);
	}

	async function handleOutputCreated(outputId: string) {
		// Reload data to show new output
		await invalidateAll();
		// Navigate to edit the new output
		goto(`/ontology/projects/${project.id}/outputs/${outputId}/edit`);
	}

	async function handleTaskCreated(taskId: string) {
		// Reload data to show new task
		await invalidateAll();
		// Optionally open the edit modal for the new task
		editingTaskId = taskId;
	}

	async function handleTaskUpdated() {
		// Reload data to show updated task
		await invalidateAll();
	}

	async function handleTaskDeleted() {
		// Reload data to remove deleted task
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>{project.name} | Ontology</title>
</svelte:head>

<div class="max-w-6xl mx-auto">
	<!-- Header -->
	<Card variant="elevated" padding="none" class="mb-3">
		<CardBody padding="lg" class="space-y-6">
			<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
				<Button variant="ghost" size="sm" onclick={() => goto('/ontology')}>
					<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 19l-7-7m0 0l7-7m-7 7h18"
						/>
					</svg>
					<span class="font-medium">Back to Projects</span>
				</Button>
			</div>

			<OntologyProjectHeader
				{project}
				{template}
				stats={projectStats}
				{contextDocument}
				onEdit={() => (showProjectEditModal = true)}
				onOpenContextDoc={() => (showContextDocModal = true)}
				onDelete={openDeleteModal}
			/>

			<FSMStateVisualizer
				entityId={project.id}
				entityKind="project"
				entityName={project.name}
				currentState={project.state_key}
				initialTransitions={initialTransitionDetails}
				onstatechange={handleStateChange}
			/>
		</CardBody>
	</Card>

	<!-- Tabs -->
	<Card variant="elevated" padding="none">
		<TabNav
			{tabs}
			{activeTab}
			on:change={(e) => handleTabChange(e.detail)}
			ariaLabel="Project sections"
		/>
	</Card>

	<!-- Content -->
	<Card variant="elevated" padding="none" class="rounded-t-none border-t-0">
		<CardBody padding="lg">
			{#if activeTab === 'tasks'}
				<div class="space-y-4">
					<!-- Create button -->
					<div class="flex justify-between items-center">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Tasks</h3>
						<Button
							variant="primary"
							size="sm"
							onclick={() => (showTaskCreateModal = true)}
						>
							<Plus class="w-4 h-4" />
							Create Task
						</Button>
					</div>

					<!-- Tasks list -->
					{#if tasks.length === 0}
						<div
							class="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
						>
							<Edit2 class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-600 dark:text-gray-400 mb-4">
								No tasks yet. Create your first task to get started.
							</p>
							<Button
								variant="primary"
								size="md"
								onclick={() => (showTaskCreateModal = true)}
							>
								<Plus class="w-4 h-4" />
								Create Task
							</Button>
						</div>
					{:else}
						<div class="space-y-3">
							{#each tasks as task}
								<button
									onclick={() => (editingTaskId = task.id)}
									class="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left group"
								>
									<div class="flex-1 min-w-0 flex items-start gap-3">
										<Edit2
											class="w-5 h-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0 mt-0.5"
										/>
										<div class="flex-1 min-w-0">
											<h3
												class="font-semibold text-gray-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300 mb-1"
											>
												{task.title}
											</h3>
											<div
												class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
											>
												{#if task.props?.description}
													<span class="line-clamp-1"
														>{task.props.description}</span
													>
												{/if}
												{#if task.plan_id}
													<span class="text-gray-400">•</span>
													<span
														>Plan: {plans.find(
															(p) => p.id === task.plan_id
														)?.name || 'Unknown'}</span
													>
												{/if}
											</div>
										</div>
									</div>
									<div class="flex items-center gap-2 flex-shrink-0">
										<!-- ✅ Replaced ternary logic with utility function -->
										<span
											class="px-3 py-1 rounded-full text-xs font-semibold capitalize {getTaskStateBadgeClass(
												task.state_key
											)}"
										>
											{task.state_key}
										</span>
										{#if task.priority}
											<span
												class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-semibold text-gray-700 dark:text-gray-300"
											>
												P{task.priority}
											</span>
										{/if}
										<ChevronRight
											class="w-5 h-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400"
										/>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'outputs'}
				<div class="space-y-4">
					<!-- Create button -->
					<div class="flex justify-between items-center">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Text Documents
						</h3>
						<Button
							variant="primary"
							size="sm"
							onclick={() => (showOutputCreateModal = true)}
						>
							<Plus class="w-4 h-4" />
							Create Document
						</Button>
					</div>

					<!-- Outputs list -->
					{#if outputs.length === 0}
						<div
							class="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
						>
							<FileEdit class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-600 dark:text-gray-400 mb-4">
								No documents yet. Create your first document to get started.
							</p>
							<Button
								variant="primary"
								size="md"
								onclick={() => (showOutputCreateModal = true)}
							>
								<Plus class="w-4 h-4" />
								Create Document
							</Button>
						</div>
					{:else}
						<div class="space-y-3">
							{#each outputs as output}
								<button
									onclick={() => editOutput(output.id)}
									class="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left group"
								>
									<div class="flex-1 min-w-0 flex items-start gap-3">
										<FileEdit
											class="w-5 h-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0 mt-0.5"
										/>
										<div class="flex-1 min-w-0">
											<h3
												class="font-semibold text-gray-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300 mb-1"
											>
												{output.name}
											</h3>
											<div
												class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
											>
												<span>{output.type_key}</span>
												{#if output.props?.word_count}
													<span class="text-gray-400">•</span>
													<span>{output.props.word_count} words</span>
												{/if}
											</div>
										</div>
									</div>
									<!-- ✅ Replaced ternary logic with utility function -->
									<span
										class="px-3 py-1 rounded-full text-xs font-semibold capitalize self-start sm:self-center {getOutputStateBadgeClass(
											output.state_key
										)}"
									>
										{output.state_key}
									</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'documents'}
				<div class="space-y-4">
					<!-- Header -->
					<div class="flex justify-between items-center">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Documents
						</h3>
					</div>

					{#if documents.length === 0}
						<div
							class="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
						>
							<FileText class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-600 dark:text-gray-400">
								No documents yet. Documents track project documentation and
								artifacts.
							</p>
						</div>
					{:else}
						<div class="space-y-3">
							{#each documents as doc}
								<div
									id={'document-' + doc.id}
									class="flex items-start gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
								>
									<FileText class="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
									<div class="flex-1 min-w-0">
										<h3
											class="font-semibold text-gray-900 dark:text-white mb-1"
										>
											{doc.title ?? doc.name ?? 'Untitled document'}
										</h3>
										<p class="text-sm text-gray-600 dark:text-gray-400">
											Type: {doc.type_key}
											{#if doc.state_key}
												<span class="text-gray-400">•</span>
												<span class="capitalize">{doc.state_key}</span>
											{/if}
										</p>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'plans'}
				<div class="space-y-4">
					<!-- Create button -->
					<div class="flex justify-between items-center">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Plans</h3>
						<Button
							variant="primary"
							size="sm"
							onclick={() => (showPlanCreateModal = true)}
						>
							<Plus class="w-4 h-4" />
							Create Plan
						</Button>
					</div>

					<!-- Plans list -->
					{#if plans.length === 0}
						<div
							class="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
						>
							<Calendar class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-600 dark:text-gray-400 mb-4">
								No plans yet. Create your first plan to organize tasks.
							</p>
							<Button
								variant="primary"
								size="md"
								onclick={() => (showPlanCreateModal = true)}
							>
								<Plus class="w-4 h-4" />
								Create Plan
							</Button>
						</div>
					{:else}
						<div class="space-y-3">
							{#each plans as plan}
								<div
									class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
								>
									<div class="flex-1 min-w-0 flex items-start gap-3">
										<Calendar
											class="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5"
										/>
										<div class="flex-1">
											<h3
												class="font-semibold text-gray-900 dark:text-white mb-1"
											>
												{plan.name}
											</h3>
											<div
												class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
											>
												<span>{plan.type_key}</span>
												{#if plan.props?.start_date || plan.props?.end_date}
													<span class="text-gray-400">•</span>
													<span>
														{plan.props.start_date
															? new Date(
																	plan.props.start_date
																).toLocaleDateString()
															: ''}
														{plan.props.start_date &&
														plan.props.end_date
															? ' - '
															: ''}
														{plan.props.end_date
															? new Date(
																	plan.props.end_date
																).toLocaleDateString()
															: ''}
													</span>
												{/if}
											</div>
										</div>
									</div>
									<span
										class="px-3 py-1 rounded-full text-xs font-semibold capitalize self-start sm:self-center {getPlanStateBadgeClass(
											plan.state_key
										)}"
									>
										{plan.state_key}
									</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'goals'}
				<div class="space-y-4">
					<!-- Create button -->
					<div class="flex justify-between items-center">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Goals</h3>
						<Button
							variant="primary"
							size="sm"
							onclick={() => (showGoalCreateModal = true)}
						>
							<Plus class="w-4 h-4" />
							Create Goal
						</Button>
					</div>

					<!-- Goals list -->
					{#if goals.length === 0}
						<div
							class="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
						>
							<Target class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-600 dark:text-gray-400 mb-4">
								No goals yet. Define what you want to achieve.
							</p>
							<Button
								variant="primary"
								size="md"
								onclick={() => (showGoalCreateModal = true)}
							>
								<Plus class="w-4 h-4" />
								Create Goal
							</Button>
						</div>
					{:else}
						<div class="space-y-3">
							{#each goals as goal}
								{@const stats = getGoalStatsForDisplay(goal.id)}
								{@const goalMilestones = getGoalMilestones(goal.id)}
								<div
									class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
								>
									<div class="flex flex-col gap-3">
										<div
											class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
										>
											<div class="flex flex-1 gap-3">
												<Target
													class="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5"
												/>
												<div class="flex-1 min-w-0 space-y-1">
													<div class="flex flex-wrap items-center gap-2">
														<h3
															class="font-semibold text-gray-900 dark:text-white"
														>
															{goal.name}
														</h3>
														{#if goal.type_key}
															<span
																class="text-xs text-gray-500 dark:text-gray-400 font-mono"
															>
																{goal.type_key}
															</span>
														{/if}
														{#if goal.state_key}
															<span
																class="px-3 py-1 rounded-full text-xs font-semibold capitalize {getGoalStateBadgeClass(
																	goal.state_key
																)}"
															>
																{goal.state_key}
															</span>
														{/if}
														{#if goal.props?.priority}
															<span
																class="text-xs px-2 py-0.5 rounded {getPriorityBadgeClass(
																	goal.props.priority
																)}"
															>
																{goal.props.priority} priority
															</span>
														{/if}
													</div>
													{#if goal.props?.measurement_criteria}
														<p
															class="text-sm text-gray-600 dark:text-gray-400"
														>
															{goal.props.measurement_criteria}
														</p>
													{/if}
													<div
														class="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400"
													>
														<span>
															{stats.milestoneCount} milestone{stats.milestoneCount ===
															1
																? ''
																: 's'}
														</span>
														<span>
															{stats.completedTaskCount}/{stats.taskCount ||
																0} tasks complete
														</span>
													</div>
												</div>
											</div>
											<div
												class="flex items-center gap-2 self-stretch sm:self-auto"
											>
												<Button
													variant="secondary"
													size="sm"
													icon={Sparkles}
													loading={reverseEngineeringGoalId === goal.id}
													onclick={() =>
														handleReverseEngineerGoal(goal.id)}
												>
													Reverse Engineer
												</Button>
												<button
													type="button"
													class="p-2 rounded-md border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-900 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
													onclick={() => toggleGoalExpansion(goal.id)}
													aria-label="Toggle goal details"
													aria-expanded={expandedGoalId === goal.id}
												>
													<ChevronDown
														class="w-5 h-5 transition-transform {expandedGoalId ===
														goal.id
															? 'rotate-180'
															: ''}"
													/>
												</button>
											</div>
										</div>
										{#if expandedGoalId === goal.id}
											<div
												class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4"
											>
												{#if goalMilestones.length === 0}
													<p
														class="text-sm text-gray-500 dark:text-gray-400"
													>
														No milestones yet. Use reverse engineering
														to generate a plan.
													</p>
												{:else}
													{#each goalMilestones as milestone}
														{@const milestoneStats =
															getMilestoneTaskStats(milestone.id)}
														{@const milestoneTasks = getMilestoneTasks(
															milestone.id
														)}
														<div
															class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3"
														>
															<div
																class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
															>
																<div class="min-w-0">
																	<p
																		class="font-semibold text-gray-900 dark:text-white"
																	>
																		{milestone.title}
																	</p>
																	<p
																		class="text-sm text-gray-600 dark:text-gray-400 mt-0.5"
																	>
																		Due {formatDueDate(
																			milestone.due_at
																		)}
																	</p>
																	{#if milestone.props?.summary}
																		<p
																			class="text-sm text-gray-600 dark:text-gray-400 mt-1"
																		>
																			{milestone.props
																				.summary}
																		</p>
																	{/if}
																</div>
																<span
																	class="text-sm font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap"
																>
																	{milestoneStats.completed}/{milestoneStats.total}
																	tasks complete
																</span>
															</div>
															<div class="space-y-2">
																{#if milestoneTasks.length === 0}
																	<p
																		class="text-sm text-gray-500 dark:text-gray-400"
																	>
																		No tasks yet for this
																		milestone.
																	</p>
																{:else}
																	{#each milestoneTasks as task}
																		<div
																			class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/40"
																		>
																			<div class="min-w-0">
																				<p
																					class="font-medium text-gray-900 dark:text-gray-100"
																				>
																					{task.title}
																				</p>
																				{#if task.props?.description}
																					<p
																						class="text-sm text-gray-600 dark:text-gray-400"
																					>
																						{task.props
																							.description}
																					</p>
																				{/if}
																			</div>
																			<span
																				class="px-3 py-1 rounded-full text-xs font-semibold capitalize {getTaskStateBadgeClass(
																					task.state_key
																				)}"
																			>
																				{task.state_key}
																			</span>
																		</div>
																	{/each}
																{/if}
															</div>
														</div>
													{/each}
												{/if}
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'other'}
				<div class="space-y-8">
					{#if requirements.length > 0}
						<div class="space-y-3">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Requirements ({requirements.length})
							</h3>
							{#each requirements as req}
								<div
									class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-gray-700 dark:text-gray-300"
								>
									{req.text}
								</div>
							{/each}
						</div>
					{/if}

					{#if milestones.length > 0}
						<div class="space-y-3">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Milestones ({milestones.length})
							</h3>
							{#each milestones as milestone}
								<div
									class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-gray-700 dark:text-gray-300"
								>
									{milestone.title} - {new Date(
										milestone.due_at
									).toLocaleDateString()}
								</div>
							{/each}
						</div>
					{/if}

					{#if risks.length > 0}
						<div class="space-y-3">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Risks ({risks.length})
							</h3>
							{#each risks as risk}
								<div
									class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-gray-700 dark:text-gray-300"
								>
									{risk.title} ({risk.impact})
								</div>
							{/each}
						</div>
					{/if}

					{#if requirements.length === 0 && milestones.length === 0 && risks.length === 0}
						<p class="text-center py-12 text-gray-500 dark:text-gray-400">
							No other entities yet
						</p>
					{/if}
				</div>
			{/if}
		</CardBody>
	</Card>
</div>

<ConfirmationModal
	isOpen={showDeleteProjectModal}
	title="Delete ontology project"
	confirmText="Delete project"
	confirmVariant="danger"
	loading={isDeletingProject}
	loadingText="Deleting..."
	icon="danger"
	on:confirm={handleProjectDeleteConfirm}
	on:cancel={closeDeleteModal}
>
	<div slot="content">
		<p class="text-sm text-gray-600 dark:text-gray-300">
			This will permanently delete <span class="font-semibold">{project.name}</span> and all related
			ontology data (tasks, plans, goals, documents, etc.). This action cannot be undone.
		</p>
	</div>

	<div slot="details">
		{#if deleteProjectError}
			<p class="mt-2 text-sm text-red-600 dark:text-red-400">
				{deleteProjectError}
			</p>
		{/if}
	</div>
</ConfirmationModal>

<!-- Project Edit Modal -->
<OntologyProjectEditModal
	bind:isOpen={showProjectEditModal}
	{project}
	onClose={() => (showProjectEditModal = false)}
	onSaved={handleProjectSaved}
/>

<!-- Context Document Modal -->
<OntologyContextDocModal
	bind:isOpen={showContextDocModal}
	document={contextDocument}
	projectName={project.name}
	onClose={() => (showContextDocModal = false)}
/>

<!-- Output Create Modal -->
{#if showOutputCreateModal}
	<OutputCreateModal
		projectId={project.id}
		onClose={() => (showOutputCreateModal = false)}
		onCreated={handleOutputCreated}
	/>
{/if}

<!-- Task Create Modal -->
{#if showTaskCreateModal}
	<TaskCreateModal
		projectId={project.id}
		{plans}
		onClose={() => (showTaskCreateModal = false)}
		onCreated={handleTaskCreated}
	/>
{/if}

<!-- Task Edit Modal -->
{#if editingTaskId}
	<TaskEditModal
		taskId={editingTaskId}
		projectId={project.id}
		{plans}
		onClose={() => (editingTaskId = null)}
		onUpdated={handleTaskUpdated}
		onDeleted={handleTaskDeleted}
	/>
{/if}

<!-- Plan Create Modal -->
{#if showPlanCreateModal}
	<PlanCreateModal
		projectId={project.id}
		onClose={() => (showPlanCreateModal = false)}
		onCreated={async () => {
			await invalidateAll();
			showPlanCreateModal = false;
		}}
	/>
{/if}

<!-- Goal Create Modal -->
{#if showGoalCreateModal}
	<GoalCreateModal
		projectId={project.id}
		onClose={() => (showGoalCreateModal = false)}
		onCreated={async () => {
			await invalidateAll();
			showGoalCreateModal = false;
		}}
	/>
{/if}

{#if reverseEngineerPreview}
	<GoalReverseEngineerModal
		bind:open={reverseEngineerModalOpen}
		goalName={reverseEngineerGoalMeta?.name ?? 'Goal'}
		preview={reverseEngineerPreview}
		loading={approvingReverseEngineer}
		onApprove={(payload) => handleReverseEngineerApproval(payload.milestones)}
		onCancel={handleReverseEngineerModalClose}
	/>
{/if}
