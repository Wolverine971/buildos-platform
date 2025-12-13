<!-- apps/web/src/routes/projects/[id]/+page.svelte -->
<!--
	Ontology Project Detail - Deliverables-Centric View

	Deliverable-first layout focusing on outputs as the primary cards:
	- Outputs as the primary cards with primitive filter (document, event, collection, external)
	- Documents live directly below as lighter cards ready for promotion
	- Right rail shows collapsible stacks for goals, plans, tasks, risks, milestones
	- Sticky header keeps project identity and actions visible
	- FSM state bar for workflow transitions

	Documentation:
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
	import { goto } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import {
		Plus,
		FileText,
		Calendar,
		Layers,
		ExternalLink,
		Pencil,
		Trash2,
		ArrowLeft,
		RefreshCw,
		CheckCircle2,
		Circle,
		Clock,
		Sparkles,
		Target,
		ChevronDown,
		AlertTriangle,
		Flag,
		ListChecks,
		MoreVertical
	} from 'lucide-svelte';
	import type { Project, Task, Output, Document, Plan } from '$lib/types/onto';
	import {
		getDeliverablePrimitive,
		isCollectionDeliverable,
		type DeliverablePrimitive
	} from '$lib/types/onto';
	import type { PageData } from './$types';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import NextStepDisplay from '$lib/components/project/NextStepDisplay.svelte';
	import StateDisplay from '$lib/components/ontology/StateDisplay.svelte';
	import type { EntityReference } from '$lib/utils/entity-reference-parser';

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
		{ key: 'review', label: 'In Review', color: 'bg-amber-500/10' },
		{ key: 'approved', label: 'Approved', color: 'bg-blue-500/10' },
		{ key: 'published', label: 'Published', color: 'bg-emerald-500/10' }
	];

	// Primitive icons and labels
	const PRIMITIVE_CONFIG: Record<
		DeliverablePrimitive,
		{ icon: typeof FileText; label: string; color: string }
	> = {
		document: { icon: FileText, label: 'Document', color: 'text-blue-500' },
		event: { icon: Calendar, label: 'Event', color: 'text-purple-500' },
		collection: { icon: Layers, label: 'Collection', color: 'text-amber-500' },
		external: { icon: ExternalLink, label: 'External', color: 'text-emerald-500' }
	};

	// ============================================================
	// PROPS & DATA
	// ============================================================
	let { data }: { data: PageData } = $props();

	// Core data
	let project = $state(data.project as Project);
	let tasks = $state((data.tasks || []) as Task[]);
	let outputs = $state((data.outputs || []) as Output[]);
	let documents = $state((data.documents || []) as Document[]);
	let plans = $state((data.plans || []) as Plan[]);
	let goals = $state((data.goals || []) as Goal[]);
	let milestones = $state((data.milestones || []) as Milestone[]);
	let risks = $state((data.risks || []) as Risk[]);
	let contextDocument = $state((data.context_document || null) as Document | null);
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

	// UI State
	let dataRefreshing = $state(false);
	let outputsExpanded = $state(true);
	let documentsExpanded = $state(true);
	let expandedPanels = $state<Record<InsightPanelKey, boolean>>({
		tasks: false,
		plans: false,
		goals: false,
		risks: false,
		milestones: false
	});
	let showMobileMenu = $state(false);

	// ============================================================
	// DERIVED STATE
	// ============================================================

	const projectStats = $derived(() => ({
		outputs: outputs.length,
		documents: documents.length,
		tasks: tasks.length,
		plans: plans.length,
		goals: goals.length
	}));

	const documentTypeOptions = $derived(() => {
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
			key: 'tasks',
			label: 'Tasks',
			icon: ListChecks,
			items: tasks,
			description: 'What needs to move'
		},
		{
			key: 'plans',
			label: 'Plans',
			icon: Calendar,
			items: plans,
			description: 'Execution scaffolding'
		},
		{
			key: 'goals',
			label: 'Goals',
			icon: Target,
			items: goals,
			description: 'What success looks like'
		},
		{
			key: 'risks',
			label: 'Risks',
			icon: AlertTriangle,
			items: risks,
			description: 'What could go wrong'
		},
		{
			key: 'milestones',
			label: 'Milestones',
			icon: Flag,
			items: milestones,
			description: 'Checkpoints and dates'
		}
	]);

	// ============================================================
	// UTILITY FUNCTIONS
	// ============================================================

	function normalizeState(state: string): string {
		const s = state?.toLowerCase() || 'draft';
		if (s === 'complete' || s === 'completed' || s === 'shipped') return 'published';
		if (s === 'in_review' || s === 'reviewing') return 'review';
		if (s === 'in_progress' || s === 'drafting') return 'draft';
		if (STATE_COLUMNS.some((c) => c.key === s)) return s;
		return 'draft';
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
		const normalized = normalizeState(state);
		const col = STATE_COLUMNS.find((c) => c.key === normalized);
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
			class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 py-2 sm:py-3 space-y-2 sm:space-y-3"
		>
			<!-- Title Row -->
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2 sm:gap-3 min-w-0">
					<button
						onclick={() => goto('/projects')}
						class="p-1.5 sm:p-2 rounded-lg hover:bg-muted transition-colors shrink-0"
						aria-label="Back to projects"
					>
						<ArrowLeft class="w-5 h-5 text-muted-foreground" />
					</button>
					<h1
						class="text-lg sm:text-xl font-semibold text-foreground leading-tight line-clamp-2 min-w-0"
					>
						{project?.name || 'Untitled Project'}
					</h1>
				</div>

				<!-- Desktop: Show all buttons -->
				<div class="hidden sm:flex items-center gap-1.5 shrink-0">
					<button
						onclick={refreshData}
						disabled={dataRefreshing}
						class="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
						aria-label="Refresh data"
					>
						<RefreshCw
							class="w-5 h-5 text-muted-foreground {dataRefreshing
								? 'animate-spin'
								: ''}"
						/>
					</button>
					<button
						onclick={() => (showProjectEditModal = true)}
						class="p-2 rounded-lg hover:bg-muted transition-colors"
						aria-label="Edit project"
					>
						<Pencil class="w-5 h-5 text-muted-foreground" />
					</button>
					<button
						onclick={() => (showDeleteProjectModal = true)}
						class="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
						aria-label="Delete project"
					>
						<Trash2 class="w-5 h-5 text-red-500" />
					</button>
				</div>

				<!-- Mobile: 3-dot menu -->
				<div class="relative sm:hidden">
					<button
						onclick={() => (showMobileMenu = !showMobileMenu)}
						class="p-1.5 rounded-lg hover:bg-muted transition-colors"
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
							class="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-border bg-card shadow-ink-strong py-1"
						>
							<button
								onclick={() => {
									showMobileMenu = false;
									refreshData();
								}}
								disabled={dataRefreshing}
								class="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
							>
								<RefreshCw
									class="w-4 h-4 text-muted-foreground {dataRefreshing
										? 'animate-spin'
										: ''}"
								/>
								Refresh
							</button>
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
								class="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
							>
								<Trash2 class="w-4 h-4" />
								Delete project
							</button>
						</div>
					{/if}
				</div>
			</div>

			<!-- Project State -->
			<StateDisplay state={project.state_key} entityKind="project" />

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

	<!-- Main Content -->
	<main class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 py-4 sm:py-6 overflow-x-hidden">
		<div
			class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] gap-3 sm:gap-4 lg:gap-6"
		>
			<!-- Left Column: Outputs & Documents -->
			<div class="min-w-0 space-y-4">
				<!-- Outputs Section - Collapsible -->
				<section
					class="bg-card border border-border rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
				>
					<div class="flex items-center justify-between gap-3 px-4 py-3">
						<button
							onclick={() => (outputsExpanded = !outputsExpanded)}
							class="flex items-center gap-3 flex-1 text-left hover:bg-muted/60 -m-3 p-3 rounded-lg transition-colors"
						>
							<div
								class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center"
							>
								<Layers class="w-4 h-4 text-foreground" />
							</div>
							<div>
								<p class="text-sm font-semibold text-foreground">Outputs</p>
								<p class="text-xs text-muted-foreground">
									{outputs.length}
									{outputs.length === 1 ? 'deliverable' : 'deliverables'}
								</p>
							</div>
						</button>
						<div class="flex items-center gap-2">
							<button
								onclick={() => (showOutputCreateModal = true)}
								class="p-1.5 rounded-md hover:bg-muted transition-colors"
								aria-label="Add output"
							>
								<Plus class="w-4 h-4 text-muted-foreground" />
							</button>
							<button
								onclick={() => (outputsExpanded = !outputsExpanded)}
								class="p-1.5 rounded-md hover:bg-muted transition-colors"
								aria-label={outputsExpanded ? 'Collapse outputs' : 'Expand outputs'}
							>
								<ChevronDown
									class="w-4 h-4 text-muted-foreground transition-transform {outputsExpanded
										? 'rotate-180'
										: ''}"
								/>
							</button>
						</div>
					</div>

					{#if outputsExpanded}
						<div class="border-t border-border">
							{#if outputs.length === 0}
								<div
									class="flex items-center gap-3 text-sm text-muted-foreground px-4 py-3"
								>
									<Sparkles class="w-4 h-4" />
									<span>No outputs yet. Create one to get started.</span>
								</div>
							{:else}
								<ul class="divide-y divide-border/80">
									{#each enrichedOutputs as output}
										{@const PrimitiveIcon = getPrimitiveIcon(output.primitive)}
										<li>
											<button
												type="button"
												onclick={() => (editingOutputId = output.id)}
												class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
											>
												<div
													class="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0"
												>
													<PrimitiveIcon
														class="w-4 h-4 {getPrimitiveColor(
															output.primitive
														)}"
													/>
												</div>
												<div class="min-w-0 flex-1">
													<p class="text-sm text-foreground truncate">
														{output.name}
													</p>
													<p class="text-xs text-muted-foreground">
														{output.typeLabel}
													</p>
												</div>
												<span
													class="flex-shrink-0 text-[11px] px-2 py-1 rounded-full border border-border {getStateColor(
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
					class="bg-card border border-border rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
				>
					<div class="flex items-center justify-between gap-3 px-4 py-3">
						<button
							onclick={() => (documentsExpanded = !documentsExpanded)}
							class="flex items-center gap-3 flex-1 text-left hover:bg-muted/60 -m-3 p-3 rounded-lg transition-colors"
						>
							<div
								class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center"
							>
								<FileText class="w-4 h-4 text-foreground" />
							</div>
							<div>
								<p class="text-sm font-semibold text-foreground">Documents</p>
								<p class="text-xs text-muted-foreground">
									{documents.length}
									{documents.length === 1 ? 'document' : 'documents'}
								</p>
							</div>
						</button>
						<div class="flex items-center gap-2">
							<button
								onclick={() => {
									activeDocumentId = null;
									showDocumentModal = true;
								}}
								class="p-1.5 rounded-md hover:bg-muted transition-colors"
								aria-label="Add document"
							>
								<Plus class="w-4 h-4 text-muted-foreground" />
							</button>
							<button
								onclick={() => (documentsExpanded = !documentsExpanded)}
								class="p-1.5 rounded-md hover:bg-muted transition-colors"
								aria-label={documentsExpanded
									? 'Collapse documents'
									: 'Expand documents'}
							>
								<ChevronDown
									class="w-4 h-4 text-muted-foreground transition-transform {documentsExpanded
										? 'rotate-180'
										: ''}"
								/>
							</button>
						</div>
					</div>

					{#if documentsExpanded}
						<div class="border-t border-border">
							{#if documents.length === 0}
								<div
									class="flex items-center gap-3 text-sm text-muted-foreground px-4 py-3"
								>
									<Sparkles class="w-4 h-4" />
									<span>No documents yet. Add research or drafts.</span>
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
												class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
											>
												<div
													class="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0"
												>
													<FileText class="w-4 h-4 text-blue-500" />
												</div>
												<div class="min-w-0 flex-1">
													<p class="text-sm text-foreground truncate">
														{doc.title}
													</p>
													<p class="text-xs text-muted-foreground">
														{getTypeLabel(doc.type_key)}
													</p>
												</div>
												<span
													class="flex-shrink-0 text-[11px] px-2 py-1 rounded-full bg-card border border-border"
												>
													{doc.state_key || 'draft'}
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

			<!-- Right Column: Insight Panels -->
			<aside class="min-w-0 space-y-3 lg:sticky lg:top-24">
				{#each insightPanels as section}
					{@const isOpen = expandedPanels[section.key]}
					<div
						class="bg-card border border-border rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<button
							onclick={() => togglePanel(section.key)}
							class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
						>
							<div class="flex items-start gap-3">
								<div
									class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center"
								>
									<svelte:component
										this={section.icon}
										class="w-4 h-4 text-foreground"
									/>
								</div>
								<div class="min-w-0">
									<p class="text-sm font-semibold text-foreground">
										{section.label}
									</p>
									<p class="text-xs text-muted-foreground">
										{section.items.length}
										{section.items.length === 1 ? 'item' : 'items'}
										{#if section.description}
											· {section.description}
										{/if}
									</p>
								</div>
							</div>
							<ChevronDown
								class="w-4 h-4 text-muted-foreground transition-transform {isOpen
									? 'rotate-180'
									: ''}"
							/>
						</button>

						{#if isOpen}
							<div class="border-t border-border">
								{#if section.key === 'tasks'}
									<div class="flex items-center justify-between px-4 pt-3 pb-2">
										<p
											class="text-xs text-muted-foreground uppercase tracking-wide"
										>
											Tasks
										</p>
										<button
											type="button"
											onclick={() => (showTaskCreateModal = true)}
											class="inline-flex items-center gap-2 px-2.5 py-1 text-xs rounded-md border border-border bg-muted/60 hover:bg-muted transition-colors"
										>
											<Plus class="w-3.5 h-3.5" />
											New Task
										</button>
									</div>
									{#if tasks.length > 0}
										<ul class="divide-y divide-border/80">
											{#each tasks as task}
												{@const visuals = getTaskVisuals(task.state_key)}
												<li>
													<button
														type="button"
														onclick={() => (editingTaskId = task.id)}
														class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
													>
														<svelte:component
															this={visuals.icon}
															class="w-4 h-4 {visuals.color}"
														/>
														<div class="min-w-0">
															<p
																class="text-sm text-foreground truncate"
															>
																{task.title}
															</p>
															<p
																class="text-xs text-muted-foreground"
															>
																{task.state_key || 'draft'}
															</p>
														</div>
													</button>
												</li>
											{/each}
										</ul>
									{:else}
										<p class="px-4 py-3 text-sm text-muted-foreground">
											No tasks yet
										</p>
									{/if}
								{:else if section.key === 'plans'}
									<div class="flex items-center justify-between px-4 pt-3 pb-2">
										<p
											class="text-xs text-muted-foreground uppercase tracking-wide"
										>
											Plans
										</p>
										<button
											type="button"
											onclick={() => (showPlanCreateModal = true)}
											class="inline-flex items-center gap-2 px-2.5 py-1 text-xs rounded-md border border-border bg-muted/60 hover:bg-muted transition-colors"
										>
											<Plus class="w-3.5 h-3.5" />
											New Plan
										</button>
									</div>
									{#if plans.length > 0}
										<ul class="divide-y divide-border/80">
											{#each plans as plan}
												<li>
													<button
														type="button"
														onclick={() => (editingPlanId = plan.id)}
														class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
													>
														<Calendar
															class="w-4 h-4 text-muted-foreground"
														/>
														<div class="min-w-0">
															<p
																class="text-sm text-foreground truncate"
															>
																{plan.name}
															</p>
															<p
																class="text-xs text-muted-foreground"
															>
																{plan.state_key || 'draft'}
															</p>
														</div>
													</button>
												</li>
											{/each}
										</ul>
									{:else}
										<p class="px-4 py-3 text-sm text-muted-foreground">
											No plans yet
										</p>
									{/if}
								{:else if section.key === 'goals'}
									<div class="flex items-center justify-between px-4 pt-3 pb-2">
										<p
											class="text-xs text-muted-foreground uppercase tracking-wide"
										>
											Goals
										</p>
										<button
											type="button"
											onclick={() => (showGoalCreateModal = true)}
											class="inline-flex items-center gap-2 px-2.5 py-1 text-xs rounded-md border border-border bg-muted/60 hover:bg-muted transition-colors"
										>
											<Plus class="w-3.5 h-3.5" />
											New Goal
										</button>
									</div>
									{#if goals.length > 0}
										<ul class="divide-y divide-border/80">
											{#each goals as goal}
												<li>
													<button
														type="button"
														onclick={() => (editingGoalId = goal.id)}
														class="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
													>
														<Target class="w-4 h-4 text-amber-500" />
														<div class="min-w-0">
															<p
																class="text-sm text-foreground truncate"
															>
																{goal.name}
															</p>
															<p
																class="text-xs text-muted-foreground"
															>
																{goal.state_key || 'draft'}
															</p>
														</div>
													</button>
												</li>
											{/each}
										</ul>
									{:else}
										<p class="px-4 py-3 text-sm text-muted-foreground">
											No goals yet
										</p>
									{/if}
								{:else if section.key === 'risks'}
									<div class="flex items-center justify-between px-4 pt-3 pb-2">
										<p
											class="text-xs text-muted-foreground uppercase tracking-wide"
										>
											Risks
										</p>
										<button
											type="button"
											onclick={() => (showRiskCreateModal = true)}
											class="inline-flex items-center gap-2 px-2.5 py-1 text-xs rounded-md border border-border bg-muted/60 hover:bg-muted transition-colors"
										>
											<Plus class="w-3.5 h-3.5" />
											New Risk
										</button>
									</div>
									{#if risks.length > 0}
										<ul class="divide-y divide-border/80">
											{#each risks as risk}
												{@const impactColor =
													risk.impact === 'critical'
														? 'text-red-500'
														: risk.impact === 'high'
															? 'text-orange-500'
															: risk.impact === 'medium'
																? 'text-amber-500'
																: 'text-emerald-500'}
												<li>
													<button
														type="button"
														onclick={() => (editingRiskId = risk.id)}
														class="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
													>
														<AlertTriangle
															class="w-4 h-4 {impactColor}"
														/>
														<div class="min-w-0 flex-1">
															<p
																class="text-sm text-foreground truncate"
															>
																{risk.title}
															</p>
															<p
																class="text-xs text-muted-foreground capitalize"
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
										<p class="px-4 py-3 text-sm text-muted-foreground">
											No risks logged
										</p>
									{/if}
								{:else if section.key === 'milestones'}
									<div class="flex items-center justify-between px-4 pt-3 pb-2">
										<p
											class="text-xs text-muted-foreground uppercase tracking-wide"
										>
											Milestones
										</p>
										<button
											type="button"
											onclick={() => (showMilestoneCreateModal = true)}
											class="inline-flex items-center gap-2 px-2.5 py-1 text-xs rounded-md border border-border bg-muted/60 hover:bg-muted transition-colors"
										>
											<Plus class="w-3.5 h-3.5" />
											New Milestone
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
															? 'text-red-500'
															: stateKey === 'in_progress'
																? 'text-blue-500'
																: stateKey === 'deferred'
																	? 'text-amber-500'
																	: 'text-muted-foreground'}
												<li>
													<button
														type="button"
														onclick={() =>
															(editingMilestoneId = milestone.id)}
														class="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
													>
														<Flag class="w-4 h-4 {stateColor}" />
														<div class="min-w-0 flex-1">
															<p
																class="text-sm text-foreground truncate"
															>
																{milestone.title}
															</p>
															<p
																class="text-xs text-muted-foreground"
															>
																{formatDueDate(milestone.due_at)}
															</p>
														</div>
													</button>
												</li>
											{/each}
										</ul>
									{:else}
										<p class="px-4 py-3 text-sm text-muted-foreground">
											No milestones yet
										</p>
									{/if}
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</aside>
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
			typeOptions={documentTypeOptions()}
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
			{plans}
			{goals}
			{milestones}
			onClose={() => (showTaskCreateModal = false)}
			onCreated={handleTaskCreated}
		/>
	{/await}
{/if}

<!-- Task Edit Modal -->
{#if editingTaskId}
	{#await import('$lib/components/ontology/TaskEditModal.svelte') then { default: TaskEditModal }}
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
	{/await}
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
		confirmVariant="destructive"
		isOpen={showDeleteProjectModal}
		isProcessing={isDeletingProject}
		on:confirm={handleProjectDeleteConfirm}
		on:cancel={() => (showDeleteProjectModal = false)}
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
				<p class="mt-2 text-sm text-red-600 dark:text-red-400">
					{deleteProjectError}
				</p>
			{/if}
		{/snippet}
	</ConfirmationModal>
{/if}
