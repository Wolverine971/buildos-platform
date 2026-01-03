<!-- apps/web/src/routes/projects/[id]/+page.svelte -->
<!--
	Ontology Project Detail - Deliverables-Centric View

	PERFORMANCE: Uses skeleton-first loading for instant perceived performance.
	- Skeleton renders immediately with project name and entity counts
	- Full data hydrates in background via /api/onto/projects/[id]/full
	- No layout shifts during hydration (skeleton matches final dimensions)
	- View Transitions API animates title from source page

	Deliverable-first layout focusing on outputs as the primary cards:
	- Outputs as the primary cards with primitive filter (document, event, collection, external)
	- Documents live directly below as lighter cards ready for promotion
	- Right rail shows collapsible stacks for goals, plans, tasks, risks, milestones
	- Sticky header keeps project identity and actions visible

	Documentation:
	- 🚀 Performance Spec: /apps/web/docs/technical/performance/PROJECT_PAGE_INSTANT_LOAD.md
	- 📚 Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- 📊 Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- 🔧 Implementation Guide: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
	- 🎨 Inkprint Design System: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
	- 🔍 Navigation Index: /apps/web/docs/NAVIGATION_INDEX.md

	Related Components:
	- Task Management: /apps/web/src/lib/components/ontology/TaskCreateModal.svelte
	- Task Editing: /apps/web/src/lib/components/ontology/TaskEditModal.svelte
	- Plan Management: /apps/web/src/lib/components/ontology/PlanCreateModal.svelte
	- Plan Editing: /apps/web/src/lib/components/ontology/PlanEditModal.svelte
	- Goal Management: /apps/web/src/lib/components/ontology/GoalCreateModal.svelte
	- Goal Editing: /apps/web/src/lib/components/ontology/GoalEditModal.svelte
	- Output Create: /apps/web/src/lib/components/ontology/OutputCreateModal.svelte
	- Output Editing: /apps/web/src/lib/components/ontology/OutputEditModal.svelte
	- Document Management: /apps/web/src/lib/components/ontology/DocumentModal.svelte
	- Project Editing: /apps/web/src/lib/components/ontology/OntologyProjectEditModal.svelte
	- State Display: /apps/web/src/lib/components/ontology/StateDisplay.svelte

	API Integration:
	- Server Data Loading: /apps/web/src/routes/projects/[id]/+page.server.ts
	- Project API: /apps/web/src/routes/api/onto/projects/
	- Task API: /apps/web/src/routes/api/onto/tasks/
	- Plan API: /apps/web/src/routes/api/onto/plans/
	- Goal API: /apps/web/src/routes/api/onto/goals/
	- Output API: /apps/web/src/routes/api/onto/outputs/
	- Document API: /apps/web/src/routes/api/onto/documents/

	Type Definitions:
	- Deliverable Primitives: /apps/web/src/lib/types/onto.ts (getDeliverablePrimitive, isCollectionDeliverable, etc.)
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import { getNavigationData } from '$lib/stores/project-navigation.store';
	import InsightPanelSkeleton from '$lib/components/ontology/InsightPanelSkeleton.svelte';
	import ProjectContentSkeleton from '$lib/components/ontology/ProjectContentSkeleton.svelte';
	import {
		Plus,
		FileText,
		Calendar,
		Layers,
		ExternalLink,
		Pencil,
		Trash2,
		ArrowLeft,
		CheckCircle2,
		Circle,
		Clock,
		Sparkles,
		Target,
		ChevronDown,
		AlertTriangle,
		Flag,
		ListChecks,
		MoreVertical,
		GitBranch
	} from 'lucide-svelte';
	import type { Project, Task, Output, Document, Plan, Decision } from '$lib/types/onto';
	import {
		getDeliverablePrimitive,
		isCollectionDeliverable,
		type DeliverablePrimitive
	} from '$lib/types/onto';
	import type { PageData } from './$types';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import NextStepDisplay from '$lib/components/project/NextStepDisplay.svelte';
	import StateDisplay from '$lib/components/ontology/StateDisplay.svelte';
	import TaskEditModal from '$lib/components/ontology/TaskEditModal.svelte';
	import ProjectGraphSection from '$lib/components/ontology/ProjectGraphSection.svelte';
	import ProjectActivityLogPanel from '$lib/components/ontology/ProjectActivityLogPanel.svelte';
	import ProjectBriefsPanel from '$lib/components/ontology/ProjectBriefsPanel.svelte';
	import type { EntityReference, ProjectLogEntityType } from '@buildos/shared-types';
	import type { GraphNode } from '$lib/components/ontology/graph/lib/graph.types';

	// ============================================================
	// TYPES
	// ============================================================
	interface Goal {
		id: string;
		name: string;
		type_key?: string | null;
		state_key: string;
		props?: Record<string, unknown>;
	}

	interface Milestone {
		id: string;
		title: string;
		due_at: string | null;
		state_key?: string | null;
		props?: Record<string, unknown> | null;
	}

	interface Risk {
		id: string;
		title: string;
		impact?: string | null;
		state_key?: string | null;
		props?: Record<string, unknown> | null;
	}

	// Import MobileCommandCenter for mobile-first layout
	import MobileCommandCenter from '$lib/components/project/MobileCommandCenter.svelte';

	type InsightPanelKey = 'tasks' | 'plans' | 'goals' | 'risks' | 'milestones';

	type InsightPanel = {
		key: InsightPanelKey;
		label: string;
		icon: typeof CheckCircle2;
		items: Array<unknown>;
		description?: string;
	};

	// State colors for output badges
	const STATE_COLUMNS = [
		{ key: 'draft', label: 'Draft', color: 'bg-muted' },
		{ key: 'in_progress', label: 'In Progress', color: 'bg-accent/10' },
		{ key: 'review', label: 'In Review', color: 'bg-amber-500/10' },
		{ key: 'published', label: 'Published', color: 'bg-emerald-500/10' }
	];

	// Primitive icons and labels - semantic colors for each type
	const PRIMITIVE_CONFIG: Record<
		DeliverablePrimitive,
		{ icon: typeof FileText; label: string; color: string }
	> = {
		document: { icon: FileText, label: 'Document', color: 'text-accent' },
		event: { icon: Calendar, label: 'Event', color: 'text-purple-500' },
		collection: { icon: Layers, label: 'Collection', color: 'text-amber-500' },
		external: { icon: ExternalLink, label: 'External', color: 'text-emerald-500' }
	};

	// ============================================================
	// PROPS & DATA
	// ============================================================
	let { data }: { data: PageData } = $props();

	// Skeleton loading state
	// When data.skeleton is true, we're in skeleton mode and need to hydrate
	let isHydrating = $state(data.skeleton === true);
	let hydrationError = $state<string | null>(null);

	// Entity counts from skeleton data (for skeleton rendering)
	// These are available immediately from the server for skeleton display
	const skeletonCounts = $derived(
		data.skeleton
			? (data.counts as {
					task_count: number;
					output_count: number;
					document_count: number;
					goal_count: number;
					plan_count: number;
					milestone_count: number;
					risk_count: number;
					decision_count: number;
				})
			: null
	);
	const skeletonRows = [0, 1, 2, 3];

	// Core data - initialized from skeleton or full data
	let project = $state(
		data.skeleton
			? ({
					id: data.project.id,
					name: data.project.name,
					description: data.project.description,
					state_key: data.project.state_key,
					type_key: data.project.type_key || 'project',
					next_step_short: data.project.next_step_short,
					next_step_long: data.project.next_step_long,
					next_step_source: data.project.next_step_source,
					next_step_updated_at: data.project.next_step_updated_at
				} as Project)
			: (data.project as Project)
	);
	let tasks = $state(data.skeleton ? ([] as Task[]) : ((data.tasks || []) as Task[]));
	let outputs = $state(data.skeleton ? ([] as Output[]) : ((data.outputs || []) as Output[]));
	let documents = $state(
		data.skeleton ? ([] as Document[]) : ((data.documents || []) as Document[])
	);
	let plans = $state(data.skeleton ? ([] as Plan[]) : ((data.plans || []) as Plan[]));
	let goals = $state(data.skeleton ? ([] as Goal[]) : ((data.goals || []) as Goal[]));
	let milestones = $state(
		data.skeleton ? ([] as Milestone[]) : ((data.milestones || []) as Milestone[])
	);
	let risks = $state(data.skeleton ? ([] as Risk[]) : ((data.risks || []) as Risk[]));
	let decisions = $state(
		data.skeleton ? ([] as Decision[]) : ((data.decisions || []) as Decision[])
	);
	let contextDocument = $state(
		data.skeleton ? null : ((data.context_document || null) as Document | null)
	);

	// Modal states
	let showOutputCreateModal = $state(false);
	let showDocumentModal = $state(false);
	let activeDocumentId = $state<string | null>(null);
	let showTaskCreateModal = $state(false);
	let showPlanCreateModal = $state(false);
	let showGoalCreateModal = $state(false);
	let showProjectEditModal = $state(false);
	let showDeleteProjectModal = $state(false);
	let isDeletingProject = $state(false);
	let deleteProjectError = $state<string | null>(null);
	let editingTaskId = $state<string | null>(null);
	let editingPlanId = $state<string | null>(null);
	let editingGoalId = $state<string | null>(null);
	let editingOutputId = $state<string | null>(null);
	let showRiskCreateModal = $state(false);
	let editingRiskId = $state<string | null>(null);
	let showMilestoneCreateModal = $state(false);
	let editingMilestoneId = $state<string | null>(null);
	let showDecisionCreateModal = $state(false);
	let editingDecisionId = $state<string | null>(null);

	// UI State
	let dataRefreshing = $state(false);
	let outputsExpanded = $state(true);
	let documentsExpanded = $state(true);
	let expandedPanels = $state<Record<InsightPanelKey, boolean>>({
		tasks: false,
		plans: false,
		goals: true,
		risks: false,
		milestones: false
	});
	let showMobileMenu = $state(false);

	// Graph visibility state - load from localStorage on mount
	let graphHidden = $state(
		typeof localStorage !== 'undefined'
			? localStorage.getItem('buildos:project-graph-hidden') === 'true'
			: false
	);

	// ============================================================
	// HYDRATION - Load full data after skeleton render
	// ============================================================

	/**
	 * Hydrate full project data from the API.
	 * Called on mount when in skeleton mode.
	 */
	async function hydrateFullData() {
		if (!data.skeleton) return;

		try {
			const response = await fetch(`/api/onto/projects/${data.projectId}/full`);
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to load project data');
			}

			const fullData = payload?.data;
			if (!fullData) {
				throw new Error('No data returned from server');
			}

			// Hydrate all state at once
			project = fullData.project || project;
			tasks = fullData.tasks || [];
			outputs = fullData.outputs || [];
			documents = fullData.documents || [];
			plans = fullData.plans || [];
			goals = fullData.goals || [];
			milestones = fullData.milestones || [];
			risks = fullData.risks || [];
			decisions = fullData.decisions || [];
			contextDocument = fullData.context_document || null;

			isHydrating = false;
		} catch (err) {
			console.error('[Project Page] Hydration failed:', err);
			hydrationError = err instanceof Error ? err.message : 'Failed to load project data';
			isHydrating = false;
		}
	}

	// Hydrate on mount if in skeleton mode
	onMount(() => {
		if (data.skeleton) {
			// Check for warm navigation data first
			const navData = getNavigationData(data.projectId);
			if (navData) {
				// Update project with warm navigation data (may have fresher counts)
				project = {
					...project,
					name: navData.name,
					description: navData.description,
					state_key: navData.state_key,
					next_step_short: navData.next_step_short,
					next_step_long: navData.next_step_long,
					next_step_source: navData.next_step_source,
					next_step_updated_at: navData.next_step_updated_at
				} as Project;
			}

			// Hydrate full data
			hydrateFullData();
		}
	});

	// ============================================================
	// DERIVED STATE
	// ============================================================

	const projectStats = $derived.by(() => ({
		outputs: outputs.length,
		documents: documents.length,
		tasks: tasks.length,
		plans: plans.length,
		goals: goals.length
	}));

	const documentTypeOptions = $derived.by(() => {
		const set = new Set<string>();
		for (const doc of documents) {
			if (doc.type_key) set.add(doc.type_key);
		}
		return Array.from(set);
	});

	// Enrich outputs with primitive info
	const enrichedOutputs = $derived(
		outputs.map((output) => ({
			...output,
			primitive: getDeliverablePrimitive(output.type_key) || 'document',
			typeLabel: getTypeLabel(output.type_key),
			taskCount: getRelatedTaskCount(output.id),
			childCount: isCollectionDeliverable(output.type_key) ? getChildCount(output) : undefined
		}))
	);

	const insightPanels: InsightPanel[] = $derived([
		{
			key: 'goals',
			label: 'Goals',
			icon: Target,
			items: goals,
			description: 'What success looks like'
		},
		{
			key: 'milestones',
			label: 'Milestones',
			icon: Flag,
			items: milestones,
			description: 'Checkpoints and dates'
		},
		{
			key: 'plans',
			label: 'Plans',
			icon: Calendar,
			items: plans,
			description: 'Execution scaffolding'
		},
		{
			key: 'tasks',
			label: 'Tasks',
			icon: ListChecks,
			items: tasks,
			description: 'What needs to move'
		},
		{
			key: 'risks',
			label: 'Risks',
			icon: AlertTriangle,
			items: risks,
			description: 'What could go wrong'
		}
	]);

	// ============================================================
	// UTILITY FUNCTIONS
	// ============================================================

	/**
	 * Extracts the canonical state key for matching against STATE_COLUMNS.
	 * Maps various state string variants to their canonical lowercase keys.
	 */
	function getStateKey(state: string): string {
		const s = state?.toLowerCase() || 'draft';
		if (s === 'complete' || s === 'completed' || s === 'shipped' || s === 'published')
			return 'published';
		if (s === 'in_review' || s === 'reviewing' || s === 'review') return 'review';
		if (s === 'approved') return 'published';
		if (s === 'in_progress' || s === 'active') return 'in_progress';
		if (s === 'drafting' || s === 'draft') return 'draft';
		// Check if it's already a valid key
		if (STATE_COLUMNS.some((c) => c.key === s)) return s;
		return 'draft';
	}

	/**
	 * Returns a human-readable label for the state (Title Case).
	 * Uses STATE_COLUMNS.label for consistent display.
	 */
	function normalizeState(state: string): string {
		const key = getStateKey(state);
		const col = STATE_COLUMNS.find((c) => c.key === key);
		return col?.label || 'Draft';
	}

	function getTypeLabel(typeKey: string): string {
		// Extract the last part of the type_key
		const parts = typeKey.split('.');
		const variant = parts[parts.length - 1] ?? typeKey;
		// Convert snake_case to Title Case
		return variant
			.split('_')
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ');
	}

	function getRelatedTaskCount(outputId: string): number {
		return tasks.filter((t) => {
			const props = t.props as Record<string, unknown>;
			return props?.output_id === outputId;
		}).length;
	}

	function getChildCount(output: Output): number {
		const props = output.props as Record<string, unknown>;
		if (Array.isArray(props?.children)) {
			return props.children.length;
		}
		if (Array.isArray(props?.chapters)) {
			return props.chapters.length;
		}
		return 0;
	}

	function getPrimitiveIcon(primitive: DeliverablePrimitive) {
		return PRIMITIVE_CONFIG[primitive]?.icon || FileText;
	}

	function getPrimitiveColor(primitive: DeliverablePrimitive) {
		return PRIMITIVE_CONFIG[primitive]?.color || 'text-muted-foreground';
	}

	function getStateColor(state: string): string {
		const key = getStateKey(state);
		const col = STATE_COLUMNS.find((c) => c.key === key);
		return col?.color || 'bg-muted';
	}

	function togglePanel(key: InsightPanelKey) {
		expandedPanels = { ...expandedPanels, [key]: !expandedPanels[key] };
	}

	function getTaskVisuals(state: string) {
		const normalized = state?.toLowerCase() || '';
		if (normalized === 'done' || normalized === 'completed' || normalized === 'complete') {
			return { icon: CheckCircle2, color: 'text-emerald-500' };
		}
		if (normalized === 'in_progress' || normalized === 'active') {
			return { icon: Clock, color: 'text-accent' };
		}
		return { icon: Circle, color: 'text-muted-foreground' };
	}

	function formatDueDate(dateString?: string | null) {
		if (!dateString) return 'No due date';
		const parsed = new Date(dateString);
		if (Number.isNaN(parsed.getTime())) return 'No due date';
		return parsed.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// ============================================================
	// DATA MANAGEMENT
	// ============================================================

	async function refreshData() {
		if (!project?.id) return;
		dataRefreshing = true;

		try {
			const response = await fetch(`/api/onto/projects/${project.id}`);
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to refresh data');
			}

			const newData = payload?.data || {};
			project = newData.project || project;
			tasks = newData.tasks || [];
			outputs = newData.outputs || [];
			documents = newData.documents || [];
			plans = newData.plans || [];
			goals = newData.goals || [];
			milestones = newData.milestones || [];
			risks = newData.risks || [];
			contextDocument = newData.context_document || null;

			toastService.success('Data refreshed');
		} catch (error) {
			console.error('[Project] Failed to refresh', error);
			toastService.error(error instanceof Error ? error.message : 'Failed to refresh data');
		} finally {
			dataRefreshing = false;
		}
	}

	// ============================================================
	// EVENT HANDLERS
	// ============================================================

	async function handleOutputCreated() {
		await refreshData();
		showOutputCreateModal = false;
	}

	async function handleOutputUpdated() {
		await refreshData();
		editingOutputId = null;
	}

	async function handleOutputDeleted() {
		await refreshData();
		editingOutputId = null;
	}

	async function handleDocumentSaved() {
		await refreshData();
		showDocumentModal = false;
		activeDocumentId = null;
	}

	async function handleDocumentDeleted() {
		await refreshData();
		showDocumentModal = false;
		activeDocumentId = null;
	}

	async function handleTaskCreated() {
		await refreshData();
		showTaskCreateModal = false;
	}

	async function handleTaskUpdated() {
		await refreshData();
		editingTaskId = null;
	}

	async function handleTaskDeleted() {
		await refreshData();
		editingTaskId = null;
	}

	async function handlePlanCreated() {
		await refreshData();
		showPlanCreateModal = false;
	}

	async function handlePlanUpdated() {
		await refreshData();
		editingPlanId = null;
	}

	async function handlePlanDeleted() {
		await refreshData();
		editingPlanId = null;
	}

	async function handleGoalCreated() {
		await refreshData();
		showGoalCreateModal = false;
	}

	async function handleGoalUpdated() {
		await refreshData();
		editingGoalId = null;
	}

	async function handleGoalDeleted() {
		await refreshData();
		editingGoalId = null;
	}

	async function handleRiskCreated() {
		await refreshData();
		showRiskCreateModal = false;
	}

	async function handleRiskUpdated() {
		await refreshData();
		editingRiskId = null;
	}

	async function handleRiskDeleted() {
		await refreshData();
		editingRiskId = null;
	}

	async function handleMilestoneCreated() {
		await refreshData();
		showMilestoneCreateModal = false;
	}

	async function handleMilestoneUpdated() {
		await refreshData();
		editingMilestoneId = null;
	}

	async function handleMilestoneDeleted() {
		await refreshData();
		editingMilestoneId = null;
	}

	async function handleDecisionCreated() {
		await refreshData();
		showDecisionCreateModal = false;
	}

	async function handleDecisionUpdated() {
		await refreshData();
		editingDecisionId = null;
	}

	async function handleDecisionDeleted() {
		await refreshData();
		editingDecisionId = null;
	}

	async function handleProjectDeleteConfirm() {
		if (!project?.id) return;
		isDeletingProject = true;
		deleteProjectError = null;

		try {
			const response = await fetch(`/api/onto/projects/${project.id}`, { method: 'DELETE' });
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to delete project');
			}
			toastService.success('Project deleted');
			showDeleteProjectModal = false;
			goto('/projects');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to delete project';
			deleteProjectError = message;
			toastService.error(message);
		} finally {
			isDeletingProject = false;
		}
	}

	function handleNextStepEntityClick(ref: EntityReference) {
		// Open the appropriate modal based on entity type
		switch (ref.type) {
			case 'task':
				editingTaskId = ref.id;
				break;
			case 'plan':
				editingPlanId = ref.id;
				break;
			case 'goal':
				editingGoalId = ref.id;
				break;
			case 'output':
				editingOutputId = ref.id;
				break;
			case 'document':
				activeDocumentId = ref.id;
				showDocumentModal = true;
				break;
			default:
				console.warn(`Unknown entity type clicked: ${ref.type}`);
		}
	}

	function handleGraphNodeClick(node: GraphNode) {
		// Open the appropriate modal based on node type
		switch (node.type) {
			case 'task':
				editingTaskId = node.id;
				break;
			case 'plan':
				editingPlanId = node.id;
				break;
			case 'goal':
				editingGoalId = node.id;
				break;
			case 'output':
				editingOutputId = node.id;
				break;
			case 'document':
				activeDocumentId = node.id;
				showDocumentModal = true;
				break;
			case 'milestone':
				editingMilestoneId = node.id;
				break;
			case 'project':
				// Already on this project page, do nothing
				break;
			default:
				console.warn(`Unknown graph node type clicked: ${node.type}`);
		}
	}

	function handleGraphHide() {
		graphHidden = true;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('buildos:project-graph-hidden', 'true');
		}
	}

	function handleGraphShow() {
		graphHidden = false;
		if (typeof localStorage !== 'undefined') {
			localStorage.removeItem('buildos:project-graph-hidden');
		}
	}

	function handleActivityLogEntityClick(entityType: ProjectLogEntityType, entityId: string) {
		// Open the appropriate modal based on entity type
		switch (entityType) {
			case 'task':
				editingTaskId = entityId;
				break;
			case 'plan':
				editingPlanId = entityId;
				break;
			case 'goal':
				editingGoalId = entityId;
				break;
			case 'output':
				editingOutputId = entityId;
				break;
			case 'note':
				// Notes are documents
				activeDocumentId = entityId;
				showDocumentModal = true;
				break;
			case 'milestone':
				editingMilestoneId = entityId;
				break;
			case 'risk':
				editingRiskId = entityId;
				break;
			case 'project':
				// Already on this project page, open edit modal
				showProjectEditModal = true;
				break;
			default:
				console.warn(`Unknown activity log entity type clicked: ${entityType}`);
		}
	}
</script>

<svelte:head>
	<title>{project?.name || 'Project'} | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background overflow-x-hidden">
	<!-- Header -->
	<header
		class="sticky top-0 z-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
	>
		<div
			class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 py-1.5 sm:py-3 space-y-1 sm:space-y-3"
		>
			<!-- Title Row -->
			<div class="flex items-center justify-between gap-1.5 sm:gap-2">
				<div class="flex items-center gap-1.5 sm:gap-3 min-w-0">
					<button
						onclick={() => goto('/projects')}
						class="p-1 sm:p-2 rounded-lg hover:bg-muted transition-colors shrink-0"
						aria-label="Back to projects"
					>
						<ArrowLeft class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
					</button>
					<div class="min-w-0">
						<h1
							class="text-sm sm:text-xl font-semibold text-foreground leading-tight line-clamp-1 sm:line-clamp-2"
							style="view-transition-name: project-title-{project.id}"
						>
							{project?.name || 'Untitled Project'}
						</h1>
						{#if project?.description}
							<p
								class="text-xs text-muted-foreground mt-0.5 line-clamp-2 hidden sm:block"
								title={project.description}
							>
								{project.description}
							</p>
						{/if}
					</div>
				</div>

				<!-- Desktop: Show all buttons -->
				<div class="hidden sm:flex items-center gap-1.5 shrink-0">
					<StateDisplay state={project.state_key} entityKind="project" />
					{#if graphHidden}
						<button
							onclick={handleGraphShow}
							class="p-2 rounded-lg hover:bg-muted transition-colors pressable"
							aria-label="Show relationship graph"
							title="Show relationship graph"
						>
							<GitBranch class="w-5 h-5 text-muted-foreground" />
						</button>
					{/if}
					<button
						onclick={() => (showProjectEditModal = true)}
						class="p-2 rounded-lg hover:bg-muted transition-colors pressable"
						aria-label="Edit project"
					>
						<Pencil class="w-5 h-5 text-muted-foreground" />
					</button>
					<button
						onclick={() => (showDeleteProjectModal = true)}
						class="p-2 rounded-lg hover:bg-destructive/10 transition-colors pressable"
						aria-label="Delete project"
					>
						<Trash2 class="w-5 h-5 text-destructive" />
					</button>
				</div>

				<!-- Mobile: State + 3-dot menu -->
				<div class="flex items-center gap-1.5 sm:hidden">
					<StateDisplay state={project.state_key} entityKind="project" />
					<div class="relative">
						<button
							onclick={() => (showMobileMenu = !showMobileMenu)}
							class="p-1.5 rounded-lg hover:bg-muted transition-colors pressable"
							aria-label="Project options"
							aria-expanded={showMobileMenu}
						>
							<MoreVertical class="w-5 h-5 text-muted-foreground" />
						</button>

						{#if showMobileMenu}
							<!-- Backdrop -->
							<button
								type="button"
								class="fixed inset-0 z-0"
								onclick={() => (showMobileMenu = false)}
								aria-label="Close menu"
							></button>

							<!-- Dropdown -->
							<div
								class="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-border bg-card shadow-ink-strong py-1 tx tx-frame tx-weak"
							>
								{#if graphHidden}
									<button
										onclick={() => {
											showMobileMenu = false;
											handleGraphShow();
										}}
										class="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
									>
										<GitBranch class="w-4 h-4 text-muted-foreground" />
										Show graph
									</button>
								{/if}
								<button
									onclick={() => {
										showMobileMenu = false;
										showProjectEditModal = true;
									}}
									class="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
								>
									<Pencil class="w-4 h-4 text-muted-foreground" />
									Edit project
								</button>
								<hr class="my-1 border-border" />
								<button
									onclick={() => {
										showMobileMenu = false;
										showDeleteProjectModal = true;
									}}
									class="w-full flex items-center gap-3 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
								>
									<Trash2 class="w-4 h-4" />
									Delete project
								</button>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Mobile: Compact entity count summary bar -->
			{#if true}
				{@const mobileStats = [
					{ key: 'tasks', count: tasks.length, Icon: ListChecks },
					{ key: 'outputs', count: outputs.length, Icon: Layers },
					{ key: 'docs', count: documents.length, Icon: FileText },
					{ key: 'goals', count: goals.length, Icon: Target },
					{ key: 'plans', count: plans.length, Icon: Calendar }
				].filter((s) => s.count > 0)}
				{#if mobileStats.length > 0}
					<div
						class="flex sm:hidden items-center gap-2.5 text-muted-foreground overflow-x-auto pb-0.5"
					>
						{#each mobileStats as stat (stat.key)}
							{@const StatIcon = stat.Icon}
							<span class="flex items-center gap-0.5 shrink-0" title={stat.key}>
								<StatIcon class="h-3 w-3" />
								<span class="font-semibold text-[10px]">{stat.count}</span>
							</span>
						{/each}
					</div>
				{/if}
			{/if}

			<!-- Next Step Display -->
			<NextStepDisplay
				projectId={project.id}
				nextStepShort={project.next_step_short}
				nextStepLong={project.next_step_long}
				nextStepSource={project.next_step_source}
				nextStepUpdatedAt={project.next_step_updated_at}
				onEntityClick={handleNextStepEntityClick}
				onNextStepGenerated={async () => {
					await refreshData();
				}}
			/>
		</div>
	</header>

	<!-- Relationship Graph Section -->
	{#if !graphHidden}
		<div class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 pt-4">
			<ProjectGraphSection
				projectId={project.id}
				onNodeClick={handleGraphNodeClick}
				onHide={handleGraphHide}
			/>
		</div>
	{/if}

	<!-- Main Content -->
	<main class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 py-2 sm:py-6 overflow-x-hidden">
		<!-- Hydration Error Banner -->
		{#if hydrationError}
			<div
				class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 tx tx-static tx-weak"
			>
				<p class="text-sm text-destructive">
					Failed to load project data: {hydrationError}
				</p>
				<button
					onclick={() => {
						hydrationError = null;
						isHydrating = true;
						hydrateFullData();
					}}
					class="mt-2 text-sm font-medium text-destructive hover:text-destructive/80 pressable"
				>
					Try again
				</button>
			</div>
		{/if}

		<!-- Mobile Command Center (shown only on mobile < 640px) -->
		<div class="sm:hidden mb-4">
			{#if isHydrating}
				<div class="space-y-1.5">
					{#each skeletonRows as _}
						<div class="flex flex-wrap gap-1.5">
							<div
								class="w-[calc(50%-3px)] h-[52px] bg-muted animate-pulse rounded-lg"
							></div>
							<div
								class="w-[calc(50%-3px)] h-[52px] bg-muted animate-pulse rounded-lg"
							></div>
						</div>
					{/each}
				</div>
			{:else}
				<MobileCommandCenter
					{goals}
					{milestones}
					{tasks}
					{plans}
					{risks}
					{decisions}
					{documents}
					{outputs}
					onAddGoal={() => (showGoalCreateModal = true)}
					onAddMilestone={() => (showMilestoneCreateModal = true)}
					onAddTask={() => (showTaskCreateModal = true)}
					onAddPlan={() => (showPlanCreateModal = true)}
					onAddRisk={() => (showRiskCreateModal = true)}
					onAddDecision={() => (showDecisionCreateModal = true)}
					onAddDocument={() => {
						activeDocumentId = null;
						showDocumentModal = true;
					}}
					onAddOutput={() => (showOutputCreateModal = true)}
					onEditGoal={(id) => (editingGoalId = id)}
					onEditMilestone={(id) => (editingMilestoneId = id)}
					onEditTask={(id) => (editingTaskId = id)}
					onEditPlan={(id) => (editingPlanId = id)}
					onEditRisk={(id) => (editingRiskId = id)}
					onEditDecision={(id) => (editingDecisionId = id)}
					onEditDocument={(id) => {
						activeDocumentId = id;
						showDocumentModal = true;
					}}
					onEditOutput={(id) => (editingOutputId = id)}
				/>
			{/if}
		</div>

		<!-- Desktop Layout (hidden on mobile) -->
		<div
			class="hidden sm:grid sm:grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] gap-2 sm:gap-4 lg:gap-6"
		>
			<!-- Left Column: Outputs & Documents -->
			{#if isHydrating && skeletonCounts}
				<!-- Skeleton state - show loading placeholders with counts -->
				<ProjectContentSkeleton
					outputCount={skeletonCounts.output_count}
					documentCount={skeletonCounts.document_count}
				/>
			{:else}
				<!-- Hydrated state - show real content -->
				<div class="min-w-0 space-y-2 sm:space-y-4">
					<!-- Outputs Section - Collapsible -->
					<section
						class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<div
							class="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3"
						>
							<button
								onclick={() => (outputsExpanded = !outputsExpanded)}
								class="flex items-center gap-2 sm:gap-3 flex-1 text-left hover:bg-muted/60 -m-2 sm:-m-3 p-2 sm:p-3 rounded-lg transition-colors"
							>
								<div
									class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-muted flex items-center justify-center"
								>
									<Layers class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-foreground" />
								</div>
								<div>
									<p class="text-xs sm:text-sm font-semibold text-foreground">
										Outputs
									</p>
									<p class="text-[10px] sm:text-xs text-muted-foreground">
										{outputs.length}
										{outputs.length === 1 ? 'deliverable' : 'deliverables'}
									</p>
								</div>
							</button>
							<div class="flex items-center gap-1 sm:gap-2">
								<button
									onclick={() => (showOutputCreateModal = true)}
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors"
									aria-label="Add output"
								>
									<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
								</button>
								<button
									onclick={() => (outputsExpanded = !outputsExpanded)}
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors"
									aria-label={outputsExpanded
										? 'Collapse outputs'
										: 'Expand outputs'}
								>
									<ChevronDown
										class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform duration-[120ms] {outputsExpanded
											? 'rotate-180'
											: ''}"
									/>
								</button>
							</div>
						</div>

						{#if outputsExpanded}
							<div
								class="border-t border-border"
								transition:slide={{ duration: 120 }}
							>
								{#if outputs.length === 0}
									<div
										class="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-4 bg-muted/30 tx tx-bloom tx-weak"
									>
										<div
											class="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center"
										>
											<Sparkles class="w-3 h-3 sm:w-4 sm:h-4 text-accent" />
										</div>
										<div>
											<p class="text-xs sm:text-sm text-foreground">
												No outputs yet
											</p>
											<p class="text-[10px] sm:text-xs text-muted-foreground">
												Create one to start delivering
											</p>
										</div>
									</div>
								{:else}
									<ul class="divide-y divide-border/80">
										{#each enrichedOutputs as output}
											{@const PrimitiveIcon = getPrimitiveIcon(
												output.primitive
											)}
											<li>
												<button
													type="button"
													onclick={() => (editingOutputId = output.id)}
													class="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
												>
													<div
														class="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-muted flex items-center justify-center flex-shrink-0"
													>
														<PrimitiveIcon
															class="w-3 h-3 sm:w-4 sm:h-4 {getPrimitiveColor(
																output.primitive
															)}"
														/>
													</div>
													<div class="min-w-0 flex-1">
														<p
															class="text-xs sm:text-sm text-foreground truncate"
														>
															{output.name}
														</p>
														<p
															class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
														>
															{output.typeLabel}
														</p>
													</div>
													<span
														class="flex-shrink-0 text-[9px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-border {getStateColor(
															output.state_key
														)}"
													>
														{normalizeState(output.state_key)}
													</span>
												</button>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/if}
					</section>

					<!-- Documents Section - Collapsible -->
					<section
						class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<div
							class="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3"
						>
							<button
								onclick={() => (documentsExpanded = !documentsExpanded)}
								class="flex items-center gap-2 sm:gap-3 flex-1 text-left hover:bg-muted/60 -m-2 sm:-m-3 p-2 sm:p-3 rounded-lg transition-colors"
							>
								<div
									class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-muted flex items-center justify-center"
								>
									<FileText class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-foreground" />
								</div>
								<div>
									<p class="text-xs sm:text-sm font-semibold text-foreground">
										Documents
									</p>
									<p class="text-[10px] sm:text-xs text-muted-foreground">
										{documents.length}
										{documents.length === 1 ? 'document' : 'documents'}
									</p>
								</div>
							</button>
							<div class="flex items-center gap-1 sm:gap-2">
								<button
									onclick={() => {
										activeDocumentId = null;
										showDocumentModal = true;
									}}
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors"
									aria-label="Add document"
								>
									<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
								</button>
								<button
									onclick={() => (documentsExpanded = !documentsExpanded)}
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors"
									aria-label={documentsExpanded
										? 'Collapse documents'
										: 'Expand documents'}
								>
									<ChevronDown
										class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform duration-[120ms] {documentsExpanded
											? 'rotate-180'
											: ''}"
									/>
								</button>
							</div>
						</div>

						{#if documentsExpanded}
							<div
								class="border-t border-border"
								transition:slide={{ duration: 120 }}
							>
								{#if documents.length === 0}
									<div
										class="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-4 bg-muted/30 tx tx-bloom tx-weak"
									>
										<div
											class="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center"
										>
											<FileText class="w-3 h-3 sm:w-4 sm:h-4 text-accent" />
										</div>
										<div>
											<p class="text-xs sm:text-sm text-foreground">
												No documents yet
											</p>
											<p class="text-[10px] sm:text-xs text-muted-foreground">
												Add notes, research, or drafts
											</p>
										</div>
									</div>
								{:else}
									<ul class="divide-y divide-border/80">
										{#each documents as doc}
											<li>
												<button
													type="button"
													onclick={() => {
														activeDocumentId = doc.id;
														showDocumentModal = true;
													}}
													class="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
												>
													<div
														class="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0"
													>
														<FileText
															class="w-3 h-3 sm:w-4 sm:h-4 text-accent"
														/>
													</div>
													<div class="min-w-0 flex-1">
														<p
															class="text-xs sm:text-sm text-foreground truncate"
														>
															{doc.title}
														</p>
														<p
															class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
														>
															{getTypeLabel(doc.type_key)}
														</p>
													</div>
													<span
														class="flex-shrink-0 text-[9px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-card border border-border capitalize"
													>
														{(doc.state_key || 'draft').replace(
															/_/g,
															' '
														)}
													</span>
												</button>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/if}
					</section>
				</div>
			{/if}

			<!-- Right Column: Insight Panels -->
			{#if isHydrating && skeletonCounts}
				<!-- Skeleton insight panels -->
				<aside class="min-w-0 space-y-3 lg:sticky lg:top-24">
					<InsightPanelSkeleton
						icon={Target}
						label="Goals"
						count={skeletonCounts.goal_count}
						description="What success looks like"
						expanded={true}
					/>
					<InsightPanelSkeleton
						icon={Flag}
						label="Milestones"
						count={skeletonCounts.milestone_count}
						description="Checkpoints and dates"
					/>
					<InsightPanelSkeleton
						icon={Calendar}
						label="Plans"
						count={skeletonCounts.plan_count}
						description="Execution scaffolding"
					/>
					<InsightPanelSkeleton
						icon={ListChecks}
						label="Tasks"
						count={skeletonCounts.task_count}
						description="What needs to move"
					/>
					<InsightPanelSkeleton
						icon={AlertTriangle}
						label="Risks"
						count={skeletonCounts.risk_count}
						description="What could go wrong"
					/>

					<!-- History Section Divider -->
					<div class="relative py-4">
						<div class="absolute inset-0 flex items-center px-4">
							<div class="w-full border-t border-border/40"></div>
						</div>
						<div class="relative flex justify-center">
							<span
								class="bg-background px-3 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest"
							>
								History
							</span>
						</div>
					</div>

					<!-- Daily Briefs Panel - loads lazily, show placeholder -->
					<div
						class="bg-card border border-border rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<div class="flex items-center gap-3 px-4 py-3">
							<div
								class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center"
							>
								<FileText class="w-4 h-4 text-foreground" />
							</div>
							<div>
								<p class="text-sm font-semibold text-foreground">Daily Briefs</p>
								<p class="text-xs text-muted-foreground">AI-generated summaries</p>
							</div>
						</div>
					</div>

					<!-- Activity Log Panel - loads lazily, show placeholder -->
					<div
						class="bg-card border border-border rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<div class="flex items-center gap-3 px-4 py-3">
							<div
								class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center"
							>
								<Clock class="w-4 h-4 text-foreground" />
							</div>
							<div>
								<p class="text-sm font-semibold text-foreground">Activity Log</p>
								<p class="text-xs text-muted-foreground">Recent changes</p>
							</div>
						</div>
					</div>
				</aside>
			{:else}
				<!-- Hydrated insight panels -->
				<aside class="min-w-0 space-y-2 sm:space-y-3 lg:sticky lg:top-24">
					{#each insightPanels as section}
						{@const isOpen = expandedPanels[section.key]}
						{@const SectionIcon = section.icon}
						<div
							class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
						>
							<button
								onclick={() => togglePanel(section.key)}
								class="w-full flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
							>
								<div class="flex items-start gap-2 sm:gap-3">
									<div
										class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-muted flex items-center justify-center"
									>
										<SectionIcon
											class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-foreground"
										/>
									</div>
									<div class="min-w-0">
										<p class="text-xs sm:text-sm font-semibold text-foreground">
											{section.label}
											<span class="text-muted-foreground font-normal"
												>({section.items.length})</span
											>
										</p>
										<p
											class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
										>
											{#if section.description}
												{section.description}
											{/if}
										</p>
									</div>
								</div>
								<ChevronDown
									class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform duration-[120ms] {isOpen
										? 'rotate-180'
										: ''}"
								/>
							</button>

							{#if isOpen}
								<div
									class="border-t border-border"
									transition:slide={{ duration: 120 }}
								>
									{#if section.key === 'tasks'}
										<div
											class="flex items-center justify-between px-3 sm:px-4 pt-2 sm:pt-3 pb-1.5 sm:pb-2"
										>
											<p
												class="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide"
											>
												Tasks
											</p>
											<button
												type="button"
												onclick={() => (showTaskCreateModal = true)}
												class="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs rounded-md border border-border bg-muted/60 hover:bg-accent/10 hover:border-accent/50 transition-colors pressable"
											>
												<Plus class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
												<span class="hidden sm:inline">New Task</span>
												<span class="sm:hidden">Add</span>
											</button>
										</div>
										{#if tasks.length > 0}
											<ul class="divide-y divide-border/80">
												{#each tasks as task}
													{@const visuals = getTaskVisuals(
														task.state_key
													)}
													{@const TaskIcon = visuals.icon}
													<li>
														<div class="flex items-center min-w-0">
															<button
																type="button"
																onclick={() =>
																	(editingTaskId = task.id)}
																class="flex-1 min-w-0 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
															>
																<TaskIcon
																	class="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 {visuals.color}"
																/>
																<div class="min-w-0 flex-1">
																	<p
																		class="text-xs sm:text-sm text-foreground truncate"
																	>
																		{task.title}
																	</p>
																	<p
																		class="text-[10px] sm:text-xs text-muted-foreground capitalize hidden sm:block"
																	>
																		{(
																			task.state_key ||
																			'draft'
																		).replace(/_/g, ' ')}
																	</p>
																</div>
															</button>
															<a
																href="/projects/{project.id}/tasks/{task.id}"
																class="flex-shrink-0 p-1.5 sm:p-2 mr-1.5 sm:mr-2 rounded-lg hover:bg-accent/10 transition-colors pressable"
																title="Open task focus page"
															>
																<ExternalLink
																	class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground hover:text-accent"
																/>
															</a>
														</div>
													</li>
												{/each}
											</ul>
										{:else}
											<div class="px-3 sm:px-4 py-3 sm:py-4 text-center">
												<p class="text-xs sm:text-sm text-muted-foreground">
													No tasks yet
												</p>
												<p
													class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block"
												>
													Add tasks to track work
												</p>
											</div>
										{/if}
									{:else if section.key === 'plans'}
										<div
											class="flex items-center justify-between px-3 sm:px-4 pt-2 sm:pt-3 pb-1.5 sm:pb-2"
										>
											<p
												class="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide"
											>
												Plans
											</p>
											<button
												type="button"
												onclick={() => (showPlanCreateModal = true)}
												class="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs rounded-md border border-border bg-muted/60 hover:bg-accent/10 hover:border-accent/50 transition-colors pressable"
											>
												<Plus class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
												<span class="hidden sm:inline">New Plan</span>
												<span class="sm:hidden">Add</span>
											</button>
										</div>
										{#if plans.length > 0}
											<ul class="divide-y divide-border/80">
												{#each plans as plan}
													<li>
														<button
															type="button"
															onclick={() =>
																(editingPlanId = plan.id)}
															class="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
														>
															<Calendar
																class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground"
															/>
															<div class="min-w-0">
																<p
																	class="text-xs sm:text-sm text-foreground truncate"
																>
																	{plan.name}
																</p>
																<p
																	class="text-[10px] sm:text-xs text-muted-foreground capitalize hidden sm:block"
																>
																	{(
																		plan.state_key || 'draft'
																	).replace(/_/g, ' ')}
																</p>
															</div>
														</button>
													</li>
												{/each}
											</ul>
										{:else}
											<div class="px-3 sm:px-4 py-3 sm:py-4 text-center">
												<p class="text-xs sm:text-sm text-muted-foreground">
													No plans yet
												</p>
												<p
													class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block"
												>
													Create a plan to organize work
												</p>
											</div>
										{/if}
									{:else if section.key === 'goals'}
										<div
											class="flex items-center justify-between px-3 sm:px-4 pt-2 sm:pt-3 pb-1.5 sm:pb-2"
										>
											<p
												class="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide"
											>
												Goals
											</p>
											<button
												type="button"
												onclick={() => (showGoalCreateModal = true)}
												class="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs rounded-md border border-border bg-muted/60 hover:bg-accent/10 hover:border-accent/50 transition-colors pressable"
											>
												<Plus class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
												<span class="hidden sm:inline">New Goal</span>
												<span class="sm:hidden">Add</span>
											</button>
										</div>
										{#if goals.length > 0}
											<ul class="divide-y divide-border/80">
												{#each goals as goal}
													<li>
														<button
															type="button"
															onclick={() =>
																(editingGoalId = goal.id)}
															class="w-full flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
														>
															<Target
																class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 mt-0.5"
															/>
															<div class="min-w-0">
																<p
																	class="text-xs sm:text-sm text-foreground truncate"
																>
																	{goal.name}
																</p>
																<p
																	class="text-[10px] sm:text-xs text-muted-foreground capitalize hidden sm:block"
																>
																	{(
																		goal.state_key || 'draft'
																	).replace(/_/g, ' ')}
																</p>
															</div>
														</button>
													</li>
												{/each}
											</ul>
										{:else}
											<div class="px-3 sm:px-4 py-3 sm:py-4 text-center">
												<p class="text-xs sm:text-sm text-muted-foreground">
													No goals yet
												</p>
												<p
													class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block"
												>
													Define what success looks like
												</p>
											</div>
										{/if}
									{:else if section.key === 'risks'}
										<div
											class="flex items-center justify-between px-3 sm:px-4 pt-2 sm:pt-3 pb-1.5 sm:pb-2"
										>
											<p
												class="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide"
											>
												Risks
											</p>
											<button
												type="button"
												onclick={() => (showRiskCreateModal = true)}
												class="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs rounded-md border border-border bg-muted/60 hover:bg-accent/10 hover:border-accent/50 transition-colors pressable"
											>
												<Plus class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
												<span class="hidden sm:inline">New Risk</span>
												<span class="sm:hidden">Add</span>
											</button>
										</div>
										{#if risks.length > 0}
											<ul class="divide-y divide-border/80">
												{#each risks as risk}
													{@const impactColor =
														risk.impact === 'critical'
															? 'text-destructive'
															: risk.impact === 'high'
																? 'text-orange-500'
																: risk.impact === 'medium'
																	? 'text-amber-500'
																	: 'text-emerald-500'}
													<li>
														<button
															type="button"
															onclick={() =>
																(editingRiskId = risk.id)}
															class="w-full flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
														>
															<AlertTriangle
																class="w-3.5 h-3.5 sm:w-4 sm:h-4 {impactColor} mt-0.5"
															/>
															<div class="min-w-0 flex-1">
																<p
																	class="text-xs sm:text-sm text-foreground truncate"
																>
																	{risk.title}
																</p>
																<p
																	class="text-[10px] sm:text-xs text-muted-foreground capitalize hidden sm:block"
																>
																	{risk.impact || 'Unrated'} · {risk.state_key?.replace(
																		/_/g,
																		' '
																	) || 'identified'}
																</p>
															</div>
														</button>
													</li>
												{/each}
											</ul>
										{:else}
											<div class="px-3 sm:px-4 py-3 sm:py-4 text-center">
												<p class="text-xs sm:text-sm text-muted-foreground">
													No risks logged
												</p>
												<p
													class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block"
												>
													Track potential blockers
												</p>
											</div>
										{/if}
									{:else if section.key === 'milestones'}
										<div
											class="flex items-center justify-between px-3 sm:px-4 pt-2 sm:pt-3 pb-1.5 sm:pb-2"
										>
											<p
												class="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide"
											>
												Milestones
											</p>
											<button
												type="button"
												onclick={() => (showMilestoneCreateModal = true)}
												class="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs rounded-md border border-border bg-muted/60 hover:bg-accent/10 hover:border-accent/50 transition-colors pressable"
											>
												<Plus class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
												<span class="hidden sm:inline">New Milestone</span>
												<span class="sm:hidden">Add</span>
											</button>
										</div>
										{#if milestones.length > 0}
											<ul class="divide-y divide-border/80">
												{#each milestones as milestone}
													{@const stateKey =
														milestone.props?.state_key || 'pending'}
													{@const stateColor =
														stateKey === 'achieved'
															? 'text-emerald-500'
															: stateKey === 'missed'
																? 'text-destructive'
																: stateKey === 'in_progress'
																	? 'text-accent'
																	: stateKey === 'deferred'
																		? 'text-amber-500'
																		: 'text-muted-foreground'}
													<li>
														<button
															type="button"
															onclick={() =>
																(editingMilestoneId = milestone.id)}
															class="w-full flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
														>
															<Flag
																class="w-3.5 h-3.5 sm:w-4 sm:h-4 {stateColor} mt-0.5"
															/>
															<div class="min-w-0 flex-1">
																<p
																	class="text-xs sm:text-sm text-foreground truncate"
																>
																	{milestone.title}
																</p>
																<p
																	class="text-[10px] sm:text-xs text-muted-foreground"
																>
																	{formatDueDate(
																		milestone.due_at
																	)}
																</p>
															</div>
														</button>
													</li>
												{/each}
											</ul>
										{:else}
											<div class="px-3 sm:px-4 py-3 sm:py-4 text-center">
												<p class="text-xs sm:text-sm text-muted-foreground">
													No milestones yet
												</p>
												<p
													class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block"
												>
													Set checkpoints and deadlines
												</p>
											</div>
										{/if}
									{/if}
								</div>
							{/if}
						</div>
					{/each}

					<!-- History Section Divider -->
					<div class="relative py-2 sm:py-4">
						<div class="absolute inset-0 flex items-center px-3 sm:px-4">
							<div class="w-full border-t border-border/40"></div>
						</div>
						<div class="relative flex justify-center">
							<span
								class="bg-background px-2 sm:px-3 text-[9px] sm:text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest"
							>
								History
							</span>
						</div>
					</div>

					<!-- Daily Briefs Panel -->
					<ProjectBriefsPanel projectId={project.id} projectName={project.name} />

					<!-- Activity Log Panel -->
					<ProjectActivityLogPanel
						projectId={project.id}
						onEntityClick={handleActivityLogEntityClick}
					/>
				</aside>
			{/if}
		</div>
	</main>
</div>

<!-- Output Create Modal -->
{#if showOutputCreateModal}
	{#await import('$lib/components/ontology/OutputCreateModal.svelte') then { default: OutputCreateModal }}
		<OutputCreateModal
			projectId={project.id}
			onClose={() => (showOutputCreateModal = false)}
			onCreated={handleOutputCreated}
		/>
	{/await}
{/if}

<!-- Output Edit Modal -->
{#if editingOutputId}
	{#await import('$lib/components/ontology/OutputEditModal.svelte') then { default: OutputEditModal }}
		<OutputEditModal
			outputId={editingOutputId}
			projectId={project.id}
			isOpen={true}
			onClose={() => (editingOutputId = null)}
			onUpdated={handleOutputUpdated}
			onDeleted={handleOutputDeleted}
		/>
	{/await}
{/if}

<!-- Document Create/Edit Modal -->
{#if showDocumentModal}
	{#await import('$lib/components/ontology/DocumentModal.svelte') then { default: DocumentModal }}
		<DocumentModal
			bind:isOpen={showDocumentModal}
			projectId={project.id}
			documentId={activeDocumentId}
			typeOptions={documentTypeOptions}
			onClose={() => {
				showDocumentModal = false;
				activeDocumentId = null;
			}}
			onSaved={handleDocumentSaved}
			onDeleted={handleDocumentDeleted}
		/>
	{/await}
{/if}

<!-- Task Create Modal -->
{#if showTaskCreateModal}
	{#await import('$lib/components/ontology/TaskCreateModal.svelte') then { default: TaskCreateModal }}
		<TaskCreateModal
			projectId={project.id}
			onClose={() => (showTaskCreateModal = false)}
			onCreated={handleTaskCreated}
		/>
	{/await}
{/if}

<!-- Task Edit Modal -->
{#if editingTaskId}
	<TaskEditModal
		taskId={editingTaskId}
		projectId={project.id}
		onClose={() => (editingTaskId = null)}
		onUpdated={handleTaskUpdated}
		onDeleted={handleTaskDeleted}
	/>
{/if}

<!-- Plan Create Modal -->
{#if showPlanCreateModal}
	{#await import('$lib/components/ontology/PlanCreateModal.svelte') then { default: PlanCreateModal }}
		<PlanCreateModal
			projectId={project.id}
			onClose={() => (showPlanCreateModal = false)}
			onCreated={handlePlanCreated}
		/>
	{/await}
{/if}

<!-- Plan Edit Modal -->
{#if editingPlanId}
	{#await import('$lib/components/ontology/PlanEditModal.svelte') then { default: PlanEditModal }}
		<PlanEditModal
			planId={editingPlanId}
			projectId={project.id}
			onClose={() => (editingPlanId = null)}
			onUpdated={handlePlanUpdated}
			onDeleted={handlePlanDeleted}
		/>
	{/await}
{/if}

<!-- Goal Create Modal -->
{#if showGoalCreateModal}
	{#await import('$lib/components/ontology/GoalCreateModal.svelte') then { default: GoalCreateModal }}
		<GoalCreateModal
			projectId={project.id}
			onClose={() => (showGoalCreateModal = false)}
			onCreated={handleGoalCreated}
		/>
	{/await}
{/if}

<!-- Goal Edit Modal -->
{#if editingGoalId}
	{#await import('$lib/components/ontology/GoalEditModal.svelte') then { default: GoalEditModal }}
		<GoalEditModal
			goalId={editingGoalId}
			projectId={project.id}
			onClose={() => (editingGoalId = null)}
			onUpdated={handleGoalUpdated}
			onDeleted={handleGoalDeleted}
		/>
	{/await}
{/if}

<!-- Risk Create Modal -->
{#if showRiskCreateModal}
	{#await import('$lib/components/ontology/RiskCreateModal.svelte') then { default: RiskCreateModal }}
		<RiskCreateModal
			projectId={project.id}
			onClose={() => (showRiskCreateModal = false)}
			onCreated={handleRiskCreated}
		/>
	{/await}
{/if}

<!-- Risk Edit Modal -->
{#if editingRiskId}
	{#await import('$lib/components/ontology/RiskEditModal.svelte') then { default: RiskEditModal }}
		<RiskEditModal
			riskId={editingRiskId}
			projectId={project.id}
			onClose={() => (editingRiskId = null)}
			onUpdated={handleRiskUpdated}
			onDeleted={handleRiskDeleted}
		/>
	{/await}
{/if}

<!-- Milestone Create Modal -->
{#if showMilestoneCreateModal}
	{#await import('$lib/components/ontology/MilestoneCreateModal.svelte') then { default: MilestoneCreateModal }}
		<MilestoneCreateModal
			projectId={project.id}
			onClose={() => (showMilestoneCreateModal = false)}
			onCreated={handleMilestoneCreated}
		/>
	{/await}
{/if}

<!-- Milestone Edit Modal -->
{#if editingMilestoneId}
	{#await import('$lib/components/ontology/MilestoneEditModal.svelte') then { default: MilestoneEditModal }}
		<MilestoneEditModal
			milestoneId={editingMilestoneId}
			projectId={project.id}
			onClose={() => (editingMilestoneId = null)}
			onUpdated={handleMilestoneUpdated}
			onDeleted={handleMilestoneDeleted}
		/>
	{/await}
{/if}

<!-- Decision Create Modal -->
{#if showDecisionCreateModal}
	{#await import('$lib/components/ontology/DecisionCreateModal.svelte') then { default: DecisionCreateModal }}
		<DecisionCreateModal
			projectId={project.id}
			onClose={() => (showDecisionCreateModal = false)}
			onCreated={handleDecisionCreated}
		/>
	{/await}
{/if}

<!-- Decision Edit Modal -->
{#if editingDecisionId}
	{#await import('$lib/components/ontology/DecisionEditModal.svelte') then { default: DecisionEditModal }}
		<DecisionEditModal
			decisionId={editingDecisionId}
			projectId={project.id}
			onClose={() => (editingDecisionId = null)}
			onUpdated={handleDecisionUpdated}
			onDeleted={handleDecisionDeleted}
		/>
	{/await}
{/if}

<!-- Project Edit Modal -->
{#if showProjectEditModal}
	{#await import('$lib/components/ontology/OntologyProjectEditModal.svelte') then { default: OntologyProjectEditModal }}
		<OntologyProjectEditModal
			bind:isOpen={showProjectEditModal}
			{project}
			{contextDocument}
			onClose={() => (showProjectEditModal = false)}
			onSaved={async () => {
				await refreshData();
				showProjectEditModal = false;
			}}
		/>
	{/await}
{/if}

<!-- Project Delete Confirmation -->
{#if showDeleteProjectModal}
	<ConfirmationModal
		title="Delete project"
		confirmText="Delete"
		confirmVariant="danger"
		isOpen={showDeleteProjectModal}
		loading={isDeletingProject}
		onconfirm={handleProjectDeleteConfirm}
		oncancel={() => (showDeleteProjectModal = false)}
	>
		{#snippet content()}
			<p class="text-sm text-muted-foreground">
				This will permanently delete <span class="font-semibold text-foreground"
					>{project.name}</span
				>
				and all related data. This action cannot be undone.
			</p>
		{/snippet}
		{#snippet details()}
			{#if deleteProjectError}
				<p class="mt-2 text-sm text-destructive">
					{deleteProjectError}
				</p>
			{/if}
		{/snippet}
	</ConfirmationModal>
{/if}
