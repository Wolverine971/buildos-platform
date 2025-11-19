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
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import TabNav, { type Tab } from '$lib/components/ui/TabNav.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import GraphControls from '$lib/components/ontology/graph/GraphControls.svelte';
	import OntologyGraph from '$lib/components/ontology/graph/OntologyGraph.svelte';
	import NodeDetailsPanel from '$lib/components/ontology/graph/NodeDetailsPanel.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import OutputCreateModal from '$lib/components/ontology/OutputCreateModal.svelte';
	import OutputEditModal from '$lib/components/ontology/OutputEditModal.svelte';
	import DocumentModal from '$lib/components/ontology/DocumentModal.svelte';
	import TaskCreateModal from '$lib/components/ontology/TaskCreateModal.svelte';
	import TaskEditModal from '$lib/components/ontology/TaskEditModal.svelte';
	import PlanCreateModal from '$lib/components/ontology/PlanCreateModal.svelte';
	import PlanEditModal from '$lib/components/ontology/PlanEditModal.svelte';
	import GoalCreateModal from '$lib/components/ontology/GoalCreateModal.svelte';
	import GoalEditModal from '$lib/components/ontology/GoalEditModal.svelte';
	import FSMStateVisualizer from '$lib/components/ontology/FSMStateVisualizer.svelte';
	import GoalReverseEngineerModal from '$lib/components/ontology/GoalReverseEngineerModal.svelte';
	import OntologyProjectHeader from '$lib/components/ontology/OntologyProjectHeader.svelte';
	import OntologyProjectEditModal from '$lib/components/ontology/OntologyProjectEditModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { renderMarkdown, getMarkdownPreview, getProseClasses } from '$lib/utils/markdown';
	import {
		Plus,
		Pencil,
		ChevronRight,
		ChevronDown,
		Calendar,
		Target,
		FileText,
		Sparkles,
		GitBranch,
		RefreshCw
	} from 'lucide-svelte';
	import type { GoalReverseEngineeringResult } from '$lib/services/ontology/goal-reverse-engineering.service';
	import type {
		Project,
		Task,
		Output,
		Document,
		Plan,
		Template as OntoTemplate
	} from '$lib/types/onto';
	import {
		getTaskStateBadgeClass,
		getOutputStateBadgeClass,
		getPlanStateBadgeClass,
		getGoalStateBadgeClass,
		getPriorityBadgeClass
	} from '$lib/utils/ontology-badge-styles';
	import type { PageData } from './$types';
	import type {
		GraphNode,
		GraphSourceData,
		GraphStats,
		OntologyGraphInstance,
		ViewMode
	} from '$lib/components/ontology/graph/lib/graph.types';

	// ============================================================
	// TYPES
	// ============================================================

	/**
	 * Page-specific types for entities not yet formalized in onto.ts
	 * These represent raw database rows from Supabase tables
	 */

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

	interface Requirement {
		id?: string;
		text: string;
		project_id?: string;
		created_at?: string;
		props?: Record<string, unknown>;
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
		id?: string;
		title: string;
		impact: string;
		project_id?: string;
		created_at?: string;
		props?: Record<string, unknown>;
	}

	type Guard = Record<string, unknown>;
	type TransitionAction = Record<string, unknown>;

	interface TransitionDetail {
		event: string;
		to: string;
		guards?: Guard[];
		actions?: TransitionAction[];
		can_run?: boolean;
		failed_guards?: Guard[];
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
	// COMPONENT STATE & INITIALIZATION
	// ============================================================

	// ============================================================
	// PROPS & DATA
	// ============================================================
	let { data }: { data: PageData } = $props();

	// ============================================================
	// DERIVED STATE
	// ============================================================
	let project = $state(data.project as Project);
	let tasks = $state((data.tasks || []) as Task[]);
	let outputs = $state((data.outputs || []) as Output[]);
	let documents = $state((data.documents || []) as Document[]);
	let plans = $state((data.plans || []) as Plan[]);
	let goals = $state((data.goals || []) as Goal[]);
	let requirements = $state((data.requirements || []) as Requirement[]);
	let milestones = $state((data.milestones || []) as Milestone[]);
	let risks = $state((data.risks || []) as Risk[]);
	let template = $state((data.template || null) as OntoTemplate | null);
	let contextDocument = $state((data.context_document || null) as Document | null);
	let allowedTransitions = $state((data.allowed_transitions || []) as TransitionDetail[]);
	const initialTransitionDetails = $derived(
		allowedTransitions.map((transition) => ({
			event: transition.event,
			to: transition.to,
			guards: (transition.guards ?? []) as Guard[],
			actions: (transition.actions ?? []) as TransitionAction[],
			can_run: transition.can_run ?? true,
			failedGuards: (transition.failed_guards ?? []) as Guard[]
		}))
	);

	const emptyGraphStats: GraphStats = {
		totalTemplates: 0,
		totalProjects: 0,
		activeProjects: 0,
		totalEdges: 0,
		totalTasks: 0,
		totalOutputs: 0,
		totalDocuments: 0
	};

	let projectGraphSource = $state((data.graphSource ?? null) as GraphSourceData | null);
	let projectGraphStats = $state((data.graphStats ?? null) as GraphStats | null);
	let graphMetadata = $state(
		(data.graphMetadata ?? null) as { generatedAt?: string | null } | null
	);
	let graphError = $state<string | null>((data.graphError ?? null) as string | null);
	const TASK_DOCUMENT_REL = 'task_has_document';

	const projectStats = $derived({
		tasks: tasks.length,
		goals: goals.length,
		plans: plans.length,
		outputs: outputs.length,
		documents: documents.length
	});

	const graphLastUpdated = $derived.by(() => {
		const timestamp = graphMetadata?.generatedAt;
		if (!timestamp) return null;
		const parsed = new Date(timestamp);
		return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleString();
	});

	$effect(() => {
		project = data.project as Project;
		tasks = (data.tasks || []) as Task[];
		outputs = (data.outputs || []) as Output[];
		documents = (data.documents || []) as Document[];
		plans = (data.plans || []) as Plan[];
		goals = (data.goals || []) as Goal[];
		requirements = (data.requirements || []) as Requirement[];
		milestones = (data.milestones || []) as Milestone[];
		risks = (data.risks || []) as Risk[];
		template = (data.template || null) as OntoTemplate | null;
		contextDocument = (data.context_document || null) as Document | null;
		allowedTransitions = (data.allowed_transitions || []) as TransitionDetail[];
		projectGraphSource = (data.graphSource ?? null) as GraphSourceData | null;
		projectGraphStats = (data.graphStats ?? null) as GraphStats | null;
		graphMetadata = (data.graphMetadata ?? null) as { generatedAt?: string | null } | null;
		graphError = (data.graphError ?? null) as string | null;
		lastDataRefreshAt = Date.now();
		dataRefreshError = null;
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
	let showDeleteProjectModal = $state(false);
	let isDeletingProject = $state(false);
	let deleteProjectError = $state<string | null>(null);
	let editingTaskId = $state<string | null>(null);
	let editingOutputId = $state<string | null>(null);
	let showDocumentModal = $state(false);
	let activeDocumentId = $state<string | null>(null);
	let expandedDocumentId = $state<string | null>(null);
	let editingPlanId = $state<string | null>(null);
	let editingGoalId = $state<string | null>(null);
	let expandedGoalId = $state<string | null>(null);
	let reverseEngineeringGoalId = $state<string | null>(null);
	let reverseEngineerModalOpen = $state(false);
	let reverseEngineerPreview = $state<GoalReverseEngineeringResult | null>(null);
	let reverseEngineerGoalMeta = $state<{ id: string; name: string } | null>(null);
	let approvingReverseEngineer = $state(false);
	let graphViewMode = $state<ViewMode>('projects');
	let graphInstance = $state<OntologyGraphInstance | null>(null);
	let selectedGraphNode = $state<GraphNode | null>(null);
	let graphLoading = $state(false);
	let graphReloadError = $state<string | null>(null);
	let dataRefreshing = $state(false);
	let dataRefreshError = $state<string | null>(null);
	let lastDataRefreshAt = $state<number>(Date.now());
	let activeRefreshController: AbortController | null = null;

	const tabs = $derived<Tab[]>([
		{ id: 'tasks', label: 'Tasks', count: tasks.length },
		{
			id: 'graph',
			label: 'Graph',
			icon: GitBranch,
			count: projectGraphStats?.totalEdges
		},
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

	const lastDataRefreshLabel = $derived.by(() =>
		lastDataRefreshAt ? new Date(lastDataRefreshAt).toLocaleTimeString() : ''
	);

	const taskDocuments = $derived(
		(() => {
			const map = new Map<string, Document[]>();
			const docsById = new Map<string, Document>();
			for (const doc of documents) {
				if (doc?.id) docsById.set(doc.id, doc);
			}

			const edges = projectGraphSource?.edges ?? [];
			for (const edge of edges) {
				if (
					edge?.rel !== TASK_DOCUMENT_REL ||
					edge.src_kind !== 'task' ||
					edge.dst_kind !== 'document'
				) {
					continue;
				}
				const doc = docsById.get(edge.dst_id);
				if (!doc) continue;
				const existing = map.get(edge.src_id);
				if (existing) {
					existing.push(doc);
				} else {
					map.set(edge.src_id, [doc]);
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

	const tasksByGoal = $derived(
		(() => {
			const map = new Map<string, Task[]>();
			for (const task of tasks) {
				const goalIds = getGoalIdsFromTask(task);
				for (const goalId of goalIds) {
					const existing = map.get(goalId);
					if (existing) {
						existing.push(task);
					} else {
						map.set(goalId, [task]);
					}
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
				const milestoneTasks: Task[] = [];
				for (const milestone of goalMilestones) {
					milestoneTasks.push(...(tasksByMilestone.get(milestone.id) ?? []));
				}

				// Prefer dedicated goal links and avoid double-counting milestone-linked tasks
				const directGoalTasks = getDirectGoalTasks(goal.id);
				const allTasks = [...milestoneTasks, ...directGoalTasks];
				const seenTaskIds = new Set<string>();
				let totalTasks = 0;
				let completedTasks = 0;

				for (const task of allTasks) {
					if (seenTaskIds.has(task.id)) continue;
					seenTaskIds.add(task.id);
					totalTasks += 1;
					if (isTaskComplete(task)) {
						completedTasks += 1;
					}
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

	const documentTypeOptions = $derived.by(() => {
		const types = new Set<string>();
		for (const doc of documents) {
			if (doc.type_key) {
				types.add(doc.type_key);
			}
		}
		return Array.from(types);
	});

	type ProjectSnapshot = Partial<
		Pick<
			PageData,
			| 'project'
			| 'tasks'
			| 'outputs'
			| 'documents'
			| 'plans'
			| 'goals'
			| 'requirements'
			| 'milestones'
			| 'risks'
			| 'template'
			| 'context_document'
			| 'allowed_transitions'
		>
	>;

	function applyProjectSnapshot(snapshot: ProjectSnapshot | null | undefined, markFresh = false) {
		if (!snapshot) return;

		if (snapshot.project) {
			project = snapshot.project as Project;
		}
		if (snapshot.tasks !== undefined) {
			tasks = (snapshot.tasks || []) as Task[];
		}
		if (snapshot.outputs !== undefined) {
			outputs = (snapshot.outputs || []) as Output[];
		}
		if (snapshot.documents !== undefined) {
			documents = (snapshot.documents || []) as Document[];
		}
		if (snapshot.plans !== undefined) {
			plans = (snapshot.plans || []) as Plan[];
		}
		if (snapshot.goals !== undefined) {
			goals = (snapshot.goals || []) as Goal[];
		}
		if (snapshot.requirements !== undefined) {
			requirements = (snapshot.requirements || []) as Requirement[];
		}
		if (snapshot.milestones !== undefined) {
			milestones = (snapshot.milestones || []) as Milestone[];
		}
		if (snapshot.risks !== undefined) {
			risks = (snapshot.risks || []) as Risk[];
		}
		if (snapshot.template !== undefined) {
			template = (snapshot.template || null) as OntoTemplate | null;
		}
		if (snapshot.context_document !== undefined) {
			contextDocument = (snapshot.context_document || null) as Document | null;
		}
		if (snapshot.allowed_transitions !== undefined) {
			allowedTransitions = (snapshot.allowed_transitions || []) as TransitionDetail[];
		}

		if (markFresh) {
			lastDataRefreshAt = Date.now();
			dataRefreshError = null;
		}
	}

	type RefreshOptions = {
		refreshGraph?: boolean;
		silent?: boolean;
	};

	async function refreshProjectData(options: RefreshOptions = {}) {
		if (!project?.id) return;
		const { refreshGraph = false, silent = true } = options;

		// Abort any in-flight refresh since this data is newer
		if (activeRefreshController) {
			activeRefreshController.abort();
		}
		const controller = new AbortController();
		activeRefreshController = controller;

		dataRefreshing = true;
		dataRefreshError = null;

		try {
			const response = await fetch(`/api/onto/projects/${project.id}`, {
				signal: controller.signal
			});
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to refresh project data');
			}

			applyProjectSnapshot(payload?.data ?? null, true);

			if (refreshGraph) {
				queueMicrotask(() => {
					if (!controller.signal.aborted) {
						refreshProjectGraph();
					}
				});
			}
		} catch (error) {
			if (controller.signal.aborted) return;
			console.error('[Project] Failed to refresh', error);
			const message =
				error instanceof Error && error.message
					? error.message
					: 'Failed to refresh project data';
			dataRefreshError = message;
			if (!silent) {
				toastService.error(message);
			}
		} finally {
			if (activeRefreshController === controller) {
				activeRefreshController = null;
			}
			dataRefreshing = false;
		}
	}

	// ============================================================
	// EVENT HANDLERS
	// ============================================================
	function handleTabChange(tabId: string) {
		activeTab = tabId;
		if (tabId === 'graph' && !projectGraphSource && !graphLoading) {
			refreshProjectGraph();
		}
	}

	async function handleStateChange(): Promise<void> {
		await refreshProjectData({ refreshGraph: true, silent: false });
	}

	function handleProjectSaved(updatedProject: Project): void {
		applyProjectSnapshot({ project: updatedProject }, true);
	}

	async function refreshProjectGraph() {
		if (!project?.id) return;

		try {
			graphLoading = true;
			graphReloadError = null;
			const response = await fetch(`/api/onto/projects/${project.id}/graph?viewMode=full`);
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to load project graph');
			}

			projectGraphSource = (payload?.data?.source ?? null) as GraphSourceData | null;
			projectGraphStats = (payload?.data?.stats ?? null) as GraphStats | null;
			graphMetadata = (payload?.data?.metadata ?? null) as {
				generatedAt?: string | null;
			} | null;
			graphError = null;
			selectedGraphNode = null;
		} catch (error) {
			console.error('[Project Graph] Failed to refresh', error);
			const message =
				error instanceof Error && error.message
					? error.message
					: 'Failed to load project graph';
			graphReloadError = message;
			graphError = message;
		} finally {
			graphLoading = false;
		}
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

	function getGoalIdsFromTask(task: Task): string[] {
		const ids = new Set<string>();
		const props = (task.props as Record<string, unknown> | null) ?? null;

		if (props && typeof props === 'object') {
			const goalId = (props as Record<string, unknown>).goal_id;
			if (typeof goalId === 'string' && goalId.trim().length > 0) {
				ids.add(goalId);
			}

			const sourceGoalId = (props as Record<string, unknown>).source_goal_id;
			if (typeof sourceGoalId === 'string' && sourceGoalId.trim().length > 0) {
				ids.add(sourceGoalId);
			}

			const goalIds = (props as Record<string, unknown>).goal_ids;
			if (Array.isArray(goalIds)) {
				for (const value of goalIds) {
					if (typeof value === 'string' && value.trim().length > 0) {
						ids.add(value);
					}
				}
			}
		}

		const topLevelGoalId = (task as Record<string, unknown>).goal_id;
		if (typeof topLevelGoalId === 'string' && topLevelGoalId.trim().length > 0) {
			ids.add(topLevelGoalId);
		}

		return Array.from(ids);
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

	function getDirectGoalTasks(goalId: string): Task[] {
		const linkedTasks = tasksByGoal.get(goalId) ?? [];
		const milestonesForGoal = new Set(
			(milestonesByGoal.get(goalId) ?? []).map((milestone) => milestone.id)
		);
		return linkedTasks.filter((task) => {
			const milestoneId = getMilestoneIdFromTask(task);
			// If the task is tied to a milestone that already rolls up to this goal, skip to avoid duplication
			if (milestoneId && milestonesForGoal.has(milestoneId)) {
				return false;
			}
			return true;
		});
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

	function formatUpdatedTimestamp(dateString?: string | null) {
		if (!dateString) return null;
		const date = new Date(dateString);
		if (Number.isNaN(date.getTime())) {
			return null;
		}
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatPlanDate(value: unknown): string {
		if (typeof value !== 'string' || !value) {
			return '';
		}
		try {
			const date = new Date(value);
			return isNaN(date.getTime()) ? '' : date.toLocaleDateString();
		} catch {
			return '';
		}
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

			await refreshProjectData({ refreshGraph: true });
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
		editingOutputId = outputId;
	}

	async function handleOutputCreated(outputId: string) {
		// Reload data to show new output
		await refreshProjectData({ refreshGraph: true });
		// Open the edit modal for the new output
		editingOutputId = outputId;
	}

	async function handleOutputUpdated() {
		await refreshProjectData({ refreshGraph: true });
	}

	async function handleOutputDeleted() {
		await refreshProjectData({ refreshGraph: true });
		editingOutputId = null;
	}

	async function handleTaskCreated(taskId: string) {
		// Reload data to show new task
		await refreshProjectData({ refreshGraph: true });
		// Optionally open the edit modal for the new task
		editingTaskId = taskId;
	}

	async function handleTaskUpdated() {
		// Reload data to show updated task
		await refreshProjectData({ refreshGraph: true });
	}

	async function handleTaskDeleted() {
		// Reload data to remove deleted task
		await refreshProjectData({ refreshGraph: true });
	}

	function openDocumentModal(documentId: string | null = null) {
		activeDocumentId = documentId;
		showDocumentModal = true;
	}

	async function handleDocumentSaved() {
		await refreshProjectData({ refreshGraph: true });
		showDocumentModal = false;
	}

	async function handleDocumentDeleted() {
		await refreshProjectData({ refreshGraph: true });
		showDocumentModal = false;
	}

	function toggleDocumentExpansion(documentId: string) {
		expandedDocumentId = expandedDocumentId === documentId ? null : documentId;
	}

	function getDocumentBody(doc: Document): string {
		const props = (doc.props ?? {}) as Record<string, unknown>;
		const candidateKeys = [
			'body_markdown',
			'body',
			'content',
			'summary_markdown',
			'description'
		];

		for (const key of candidateKeys) {
			const value = props[key];
			if (typeof value === 'string' && value.trim().length > 0) {
				return value;
			}
		}

		return '';
	}

	function getDocumentPreview(doc: Document): string {
		const body = getDocumentBody(doc);
		return body ? getMarkdownPreview(body, 160) : '';
	}

	async function handlePlanUpdated() {
		await refreshProjectData({ refreshGraph: true });
	}

	async function handlePlanDeleted() {
		await refreshProjectData({ refreshGraph: true });
		editingPlanId = null;
	}

	async function handleGoalUpdated() {
		await refreshProjectData({ refreshGraph: true });
	}

	async function handleGoalDeleted() {
		await refreshProjectData({ refreshGraph: true });
		editingGoalId = null;
	}
</script>

<svelte:head>
	<title>{project.name} | Ontology</title>
</svelte:head>

<div class="max-w-6xl mx-auto">
	<!-- Header -->
	<Button
		variant="ghost"
		size="sm"
		onclick={() => goto('/ontology')}
		class="self-start hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors mb-2 mt-0"
	>
		<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M10 19l-7-7m0 0l7-7m-7 7h18"
			/>
		</svg>
		<span class="font-medium">Back to Projects</span>
	</Button>
	<Card variant="elevated" padding="none" class="mb-dense-4">
		<CardBody padding="lg" class="space-y-dense-5">
			<!-- <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-dense-3"></div> -->

			<OntologyProjectHeader
				{project}
				{template}
				stats={projectStats}
				{contextDocument}
				onEdit={() => (showProjectEditModal = true)}
				onDelete={openDeleteModal}
			/>

			<FSMStateVisualizer
				entityId={project.id}
				entityKind="project"
				entityName={project.name}
				currentState={project.state_key}
				initialTransitions={initialTransitionDetails}
				onstatechange={handleStateChange}
				showGuardEditCTA={true}
				on:requestedit={() => (showProjectEditModal = true)}
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

	<div
		class="mt-3 mb-dense-4 flex flex-col gap-2 text-xs text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between"
	>
		<div class="flex flex-wrap items-center gap-2">
			{#if dataRefreshing}
				<RefreshCw class="h-3 w-3 animate-spin text-blue-500 dark:text-blue-300" />
				<span>Syncing latest project data…</span>
			{:else}
				<span>Last synced {lastDataRefreshLabel || 'just now'}</span>
				{#if dataRefreshError}
					<span class="text-red-600 dark:text-red-400"
						>Sync issue: {dataRefreshError}</span
					>
				{/if}
			{/if}
		</div>
		<Button
			variant="ghost"
			size="sm"
			disabled={dataRefreshing}
			onclick={() =>
				refreshProjectData({ refreshGraph: activeTab === 'graph', silent: false })}
		>
			<RefreshCw class={`mr-1 h-3 w-3 ${dataRefreshing ? 'animate-spin' : ''}`} />
			<span>{dataRefreshing ? 'Refreshing…' : 'Refresh data'}</span>
		</Button>
	</div>

	<!-- Content -->
	<Card variant="elevated" padding="none" class="rounded-t-none border-t-0">
		<CardBody padding="md" class="sm:p-dense-6">
			{#if activeTab === 'tasks'}
				<div class="space-y-dense-4">
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
							<Pencil class="w-12 h-12 text-gray-400 mx-auto mb-dense-4" />
							<p class="text-gray-600 dark:text-gray-400 mb-dense-4">
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
								{@const linkedDocs = taskDocuments.get(task.id) ?? []}
								<button
									onclick={() => (editingTaskId = task.id)}
									class="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-dense-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50/70 dark:hover:bg-blue-900/10 transition-all duration-200 text-left group"
								>
									<div class="flex-1 min-w-0 flex items-start gap-dense-3">
										<Pencil
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
												{#if linkedDocs.length}
													<span class="text-gray-400">•</span>
													<span
														class="inline-flex items-center gap-1 text-xs"
													>
														<FileText class="w-4 h-4 text-gray-400" />
														{linkedDocs.length} document{linkedDocs.length ===
														1
															? ''
															: 's'}
													</span>
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
			{:else if activeTab === 'graph'}
				<div class="space-y-dense-5">
					<div
						class="flex flex-col gap-dense-3 lg:flex-row lg:items-center lg:justify-between lg:gap-dense-4"
					>
						<div class="space-y-1">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Project graph
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
								Explore how this project's tasks, outputs, documents, and templates
								connect at a glance.
							</p>
							{#if graphLastUpdated}
								<p class="text-xs text-gray-500 dark:text-gray-400">
									Updated {graphLastUpdated}
								</p>
							{/if}
						</div>
						<div class="flex items-center gap-2">
							<Button
								variant="ghost"
								size="sm"
								onclick={() => graphInstance?.fitToView()}
								disabled={!graphInstance}
							>
								Fit to view
							</Button>
							<Button
								variant="primary"
								size="sm"
								onclick={refreshProjectGraph}
								loading={graphLoading}
							>
								<RefreshCw class="w-4 h-4 mr-1" />
								Refresh graph
							</Button>
						</div>
					</div>

					{#if graphError || graphReloadError}
						<div
							class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/30 dark:text-red-200"
						>
							<div class="flex items-start gap-dense-3">
								<div class="flex-1 space-y-1">
									<p class="font-semibold">Unable to load project graph</p>
									<p>{graphReloadError || graphError}</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									onclick={refreshProjectGraph}
									loading={graphLoading}
								>
									Try again
								</Button>
							</div>
						</div>
					{/if}

					{#if projectGraphSource}
						<div class="grid gap-dense-4 lg:grid-cols-3">
							<div class="lg:col-span-2">
								<div
									class="relative h-[520px] sm:h-[620px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
								>
									<OntologyGraph
										data={projectGraphSource}
										viewMode={graphViewMode}
										bind:selectedNode={selectedGraphNode}
										bind:graphInstance
									/>
									{#if graphLoading}
										<div
											class="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-900/70"
										>
											<div
												class="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-500 dark:border-blue-900/60 dark:border-t-indigo-400"
											></div>
										</div>
									{/if}
								</div>
							</div>
							<div class="lg:col-span-1">
								<GraphControls
									bind:viewMode={graphViewMode}
									{graphInstance}
									stats={projectGraphStats ?? emptyGraphStats}
								/>
							</div>
						</div>

						<section
							class="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
						>
							{#if selectedGraphNode}
								<NodeDetailsPanel
									node={selectedGraphNode}
									onClose={() => (selectedGraphNode = null)}
								/>
							{:else}
								<div
									class="flex min-h-[180px] items-center justify-center px-6 py-10 text-sm text-gray-500 dark:text-gray-400"
								>
									Select a node to view its details.
								</div>
							{/if}
						</section>
					{:else if graphLoading}
						<div
							class="flex flex-col items-center justify-center gap-dense-3 py-dense-16 text-center"
						>
							<div
								class="h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-500 dark:border-blue-900/40 dark:border-t-indigo-400"
							></div>
							<p class="text-sm text-gray-600 dark:text-gray-400">Loading graph...</p>
						</div>
					{:else}
						<div
							class="flex flex-col items-center justify-center gap-dense-3 py-dense-14 text-center"
						>
							<GitBranch class="h-10 w-10 text-gray-400" />
							<p class="text-sm text-gray-600 dark:text-gray-400">
								No relationships yet. Create tasks, outputs, and documents to
								visualize this project.
							</p>
							<Button variant="primary" size="sm" onclick={refreshProjectGraph}>
								<RefreshCw class="w-4 h-4 mr-1" />
								Build graph
							</Button>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'outputs'}
				<div class="space-y-dense-4">
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
							<Pencil class="w-12 h-12 text-gray-400 mx-auto mb-dense-4" />
							<p class="text-gray-600 dark:text-gray-400 mb-dense-4">
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
									class="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-dense-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50/70 dark:hover:bg-blue-900/10 transition-all duration-200 text-left group"
								>
									<div class="flex-1 min-w-0 flex items-start gap-dense-3">
										<Pencil
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
				<div class="space-y-dense-4">
					<!-- Header with gradient accent -->
					<div
						class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-dense-3 pb-3 border-b border-gray-200 dark:border-gray-700"
					>
						<div>
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Documents
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
								Project documentation and artifacts
							</p>
						</div>
						<Button variant="primary" size="sm" onclick={() => openDocumentModal(null)}>
							<Plus class="w-4 h-4" />
							New Document
						</Button>
					</div>

					{#if documents.length === 0}
						<div
							class="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
						>
							<FileText class="w-12 h-12 text-gray-400 mx-auto mb-dense-4" />
							<p class="text-gray-600 dark:text-gray-400 mb-dense-4">
								No documents yet. Documents track project documentation and
								artifacts.
							</p>
							<Button
								variant="primary"
								size="sm"
								onclick={() => openDocumentModal(null)}
							>
								<Plus class="w-4 h-4" />
								Create Document
							</Button>
						</div>
					{:else}
						<div class="space-y-3">
							{#each documents as doc (doc.id)}
								{@const panelId = `document-panel-${doc.id}`}
								{@const isExpanded = expandedDocumentId === doc.id}
								{@const body = getDocumentBody(doc)}
								{@const preview = getDocumentPreview(doc)}
								{@const createdAtLabel = formatUpdatedTimestamp(doc.created_at)}
								{@const updatedAtLabel = formatUpdatedTimestamp(doc.updated_at)}
								{@const hasTemporalMeta = Boolean(createdAtLabel || updatedAtLabel)}
								{@const state = doc.state_key || 'draft'}
								{@const stateClasses =
									state === 'published'
										? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
										: state === 'approved'
											? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
											: state === 'review'
												? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
												: state === 'archived'
													? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
													: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'}
								<div
									class="group/card rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all duration-200"
									data-testid="ontology-document-card"
								>
									<div class="p-4 sm:p-5 space-y-3">
										<div
											class="flex flex-col gap-dense-3 sm:flex-row sm:items-start sm:justify-between"
										>
											<button
												type="button"
												class="flex items-start gap-dense-3 text-left flex-1 group/expand"
												onclick={() => toggleDocumentExpansion(doc.id)}
												aria-expanded={isExpanded}
												aria-controls={panelId}
											>
												<div
													class="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 flex-shrink-0 group-hover/expand:from-blue-100 group-hover/expand:to-purple-100 dark:group-hover/expand:from-blue-800/30 dark:group-hover/expand:to-purple-800/30 transition-all"
												>
													<FileText
														class="w-5 h-5 text-blue-600 dark:text-blue-400"
													/>
												</div>
												<div class="flex-1 min-w-0 space-y-1.5">
													<div class="flex items-start gap-2">
														<h3
															class="font-semibold text-base text-gray-900 dark:text-white group-hover/expand:text-blue-700 dark:group-hover/expand:text-blue-300 transition-colors"
														>
															{doc.title ?? 'Untitled document'}
														</h3>
													</div>
													<p
														class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2"
													>
														{preview ||
															'No body content yet. Expand to add context.'}
													</p>
													<div
														class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
													>
														<span
															class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium"
														>
															{doc.type_key}
														</span>
														{#if updatedAtLabel}
															<span
																class="text-gray-300 dark:text-gray-600"
																>•</span
															>
															<span>Updated {updatedAtLabel}</span>
														{/if}
													</div>
												</div>
												<ChevronDown
													class="w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 group-hover/expand:text-blue-600 dark:group-hover/expand:text-blue-400 {isExpanded
														? 'rotate-180'
														: ''}"
												/>
											</button>
											<div
												class="flex items-center gap-2 self-start sm:self-center"
											>
												<span
													class="px-3 py-1 rounded-full text-xs font-semibold capitalize {stateClasses}"
												>
													{state}
												</span>
												<Button
													type="button"
													variant="secondary"
													size="sm"
													onclick={(e) => {
														e.stopPropagation();
														openDocumentModal(doc.id);
													}}
												>
													<Pencil class="w-4 h-4 mr-1" />
													Edit
												</Button>
											</div>
										</div>
									</div>
									{#if isExpanded}
										<div
											id={panelId}
											class="border-t border-gray-200 dark:border-gray-700 px-4 sm:px-5 py-4 bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-900/30 dark:to-blue-900/10 rounded-b-lg"
										>
											{#if body}
												<div class={`pt-3 ${getProseClasses('sm')}`}>
													{@html renderMarkdown(body)}
												</div>
											{:else}
												<p
													class="pt-3 text-sm italic text-gray-500 dark:text-gray-400"
												>
													This document does not have any content yet. Use
													the editor to start writing.
												</p>
											{/if}
											<div
												class="flex flex-wrap items-center justify-between gap-dense-3 mt-4 text-xs text-gray-500 dark:text-gray-400"
											>
												<div class="flex flex-wrap items-center gap-2">
													{#if createdAtLabel}
														<span>Created {createdAtLabel}</span>
													{/if}
													{#if updatedAtLabel}
														<span
															class="text-gray-300 dark:text-gray-600"
															>•</span
														>
														<span>Updated {updatedAtLabel}</span>
													{/if}
													{#if hasTemporalMeta}
														<span
															class="text-gray-300 dark:text-gray-600"
															>•</span
														>
													{/if}
													<span
														class="font-mono text-[11px] text-gray-500 dark:text-gray-400"
														>#{doc.id}</span
													>
												</div>
												<Button
													type="button"
													variant="primary"
													size="sm"
													onclick={(e) => {
														e.stopPropagation();
														openDocumentModal(doc.id);
													}}
												>
													<Pencil class="w-4 h-4 mr-1" />
													Open Editor
												</Button>
											</div>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'plans'}
				<div class="space-y-dense-4">
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
							<Calendar class="w-12 h-12 text-gray-400 mx-auto mb-dense-4" />
							<p class="text-gray-600 dark:text-gray-400 mb-dense-4">
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
								<button
									type="button"
									onclick={() => (editingPlanId = plan.id)}
									class="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-dense-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50/70 dark:hover:bg-blue-900/10 transition-all duration-200 text-left"
								>
									<div class="flex-1 min-w-0 flex items-start gap-dense-3">
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
													{@const startFormatted = formatPlanDate(
														plan.props?.start_date
													)}
													{@const endFormatted = formatPlanDate(
														plan.props?.end_date
													)}
													<span class="text-gray-400">•</span>
													<span>
														{startFormatted}
														{startFormatted && endFormatted
															? ' - '
															: ''}
														{endFormatted}
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
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'goals'}
				<div class="space-y-dense-4">
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
							<Target class="w-12 h-12 text-gray-400 mx-auto mb-dense-4" />
							<p class="text-gray-600 dark:text-gray-400 mb-dense-4">
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
								{@const directGoalTasks = getDirectGoalTasks(goal.id)}
								<div
									class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200"
								>
									<div class="flex flex-col gap-dense-3">
										<div
											class="flex flex-col gap-dense-3 sm:flex-row sm:items-start sm:justify-between"
										>
											<div class="flex flex-1 gap-dense-3">
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
														class="flex flex-wrap items-center gap-dense-3 text-sm text-gray-500 dark:text-gray-400"
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
													variant="ghost"
													size="sm"
													onclick={() => (editingGoalId = goal.id)}
												>
													<Pencil class="w-4 h-4 mr-1" />
													Edit
												</Button>
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
												class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-dense-4"
											>
												{#if directGoalTasks.length > 0}
													<div class="space-y-2">
														<div
															class="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400"
														>
															<span
																class="font-semibold text-gray-800 dark:text-gray-200"
																>Direct tasks</span
															>
															<span
																>{directGoalTasks.length} linked</span
															>
														</div>
														{#each directGoalTasks as task}
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
																			{task.props.description}
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
													</div>
												{/if}

												<div class="space-y-3">
													<div
														class="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400"
													>
														<span
															class="font-semibold text-gray-800 dark:text-gray-200"
															>Milestones</span
														>
														<span>{goalMilestones.length} linked</span>
													</div>

													{#if goalMilestones.length === 0}
														<p
															class="text-sm text-gray-500 dark:text-gray-400"
														>
															No milestones linked yet. Use reverse
															engineering or edit tasks to connect
															one.
														</p>
													{:else}
														{#each goalMilestones as milestone}
															{@const milestoneStats =
																getMilestoneTaskStats(milestone.id)}
															{@const milestoneTasks =
																getMilestoneTasks(milestone.id)}
															<div
																class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3"
															>
																<div
																	class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-dense-3"
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
																				<div
																					class="min-w-0"
																				>
																					<p
																						class="font-medium text-gray-900 dark:text-gray-100"
																					>
																						{task.title}
																					</p>
																					{#if task.props?.description}
																						<p
																							class="text-sm text-gray-600 dark:text-gray-400"
																						>
																							{task
																								.props
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
	{contextDocument}
	{template}
	onClose={() => (showProjectEditModal = false)}
	onSaved={handleProjectSaved}
/>

<!-- Output Create Modal -->
{#if showOutputCreateModal}
	<OutputCreateModal
		projectId={project.id}
		onClose={() => (showOutputCreateModal = false)}
		onCreated={handleOutputCreated}
	/>
{/if}

{#if editingOutputId}
	<OutputEditModal
		outputId={editingOutputId}
		projectId={project.id}
		onClose={() => (editingOutputId = null)}
		onUpdated={handleOutputUpdated}
		onDeleted={handleOutputDeleted}
	/>
{/if}

<DocumentModal
	bind:isOpen={showDocumentModal}
	projectId={project.id}
	documentId={activeDocumentId}
	typeOptions={documentTypeOptions}
	onClose={() => (showDocumentModal = false)}
	onSaved={handleDocumentSaved}
	onDeleted={handleDocumentDeleted}
/>

<!-- Task Create Modal -->
{#if showTaskCreateModal}
	<TaskCreateModal
		projectId={project.id}
		{plans}
		{goals}
		{milestones}
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
		{goals}
		{milestones}
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
			await refreshProjectData({ refreshGraph: true });
			showPlanCreateModal = false;
		}}
	/>
{/if}

{#if editingPlanId}
	<PlanEditModal
		planId={editingPlanId}
		projectId={project.id}
		{tasks}
		onClose={() => (editingPlanId = null)}
		onUpdated={handlePlanUpdated}
		onDeleted={handlePlanDeleted}
	/>
{/if}

<!-- Goal Create Modal -->
{#if showGoalCreateModal}
	<GoalCreateModal
		projectId={project.id}
		onClose={() => (showGoalCreateModal = false)}
		onCreated={async () => {
			await refreshProjectData({ refreshGraph: true });
			showGoalCreateModal = false;
		}}
	/>
{/if}

{#if editingGoalId}
	<GoalEditModal
		goalId={editingGoalId}
		projectId={project.id}
		onClose={() => (editingGoalId = null)}
		onUpdated={handleGoalUpdated}
		onDeleted={handleGoalDeleted}
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
