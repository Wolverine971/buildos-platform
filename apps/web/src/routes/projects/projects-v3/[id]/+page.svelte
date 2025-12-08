<!-- apps/web/src/routes/projects/projects-v3/[id]/+page.svelte -->
<!--
	Ontology Project Detail V3 - Deliverables-Centric View

	Deliverable-first layout:
	- Outputs as the primary cards with primitive filter
	- Documents live directly below as lighter cards ready for promotion
	- Right rail shows collapsible stacks for goals, plans, tasks, risks, milestones
	- Sticky header keeps project identity and actions visible

	Design: Inkprint Design System
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
		ArrowLeft,
		RefreshCw,
		Filter,
		CheckCircle2,
		Circle,
		Clock,
		Sparkles,
		Target,
		ChevronDown,
		AlertTriangle,
		Flag,
		ListChecks
	} from 'lucide-svelte';
	import type { Project, Task, Output, Document, Plan } from '$lib/types/onto';
	import {
		getDeliverablePrimitive,
		isCollectionDeliverable,
		isExternalDeliverable,
		isEventDeliverable,
		type DeliverablePrimitive
	} from '$lib/types/onto';
	import type { PageData } from './$types';

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

	type PrimitiveFilter = DeliverablePrimitive | 'all';

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
	let showTaskCreateModal = $state(false);
	let showPlanCreateModal = $state(false);
	let showGoalCreateModal = $state(false);
	let editingTaskId = $state<string | null>(null);
	let editingPlanId = $state<string | null>(null);
	let editingGoalId = $state<string | null>(null);

	// UI State
	let primitiveFilter = $state<PrimitiveFilter>('all');
	let dataRefreshing = $state(false);
	let showCreateModal = $state(false);
	let expandedPanels = $state<Record<InsightPanelKey, boolean>>({
		tasks: false,
		plans: false,
		goals: false,
		risks: false,
		milestones: false
	});

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

	// Filter outputs by primitive
	const filteredOutputs = $derived(
		primitiveFilter === 'all'
			? enrichedOutputs
			: enrichedOutputs.filter((o) => o.primitive === primitiveFilter)
	);

	// Count by primitive for filter badges
	const primitiveCounts = $derived(() => {
		const counts: Record<string, number> = { all: outputs.length };
		for (const output of outputs) {
			const primitive = getDeliverablePrimitive(output.type_key) || 'document';
			counts[primitive] = (counts[primitive] || 0) + 1;
		}
		return counts;
	});

	// Documents that could be promoted to deliverables
	const promotableDocuments = $derived(
		documents.filter((doc) => {
			// Document not already linked to an output
			return !outputs.some(
				(o) => (o as Output & { source_document_id?: string }).source_document_id === doc.id
			);
		})
	);

	const insightPanels = $derived<InsightPanel[]>(() => [
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
		const variant = parts[parts.length - 1];
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

	function handlePrimitiveFilter(primitive: PrimitiveFilter) {
		primitiveFilter = primitive;
	}

	async function handlePromoteDocument(documentId: string) {
		// TODO: Implement document promotion flow
		// This would open a modal to select deliverable type
		toastService.info('Document promotion coming soon');
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

	async function handleCreateDeliverable(primitive: DeliverablePrimitive) {
		// TODO: Implement deliverable creation
		toastService.info(`Create ${primitive} deliverable coming soon`);
		showCreateModal = false;
	}
</script>

<svelte:head>
	<title>{project?.name || 'Project'} | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background">
	<!-- Header -->
	<header
		class="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
	>
		<div class="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-3">
			<div class="flex flex-wrap items-center justify-between gap-4">
				<div class="flex items-center gap-3 min-w-0">
					<button
						onclick={() => goto('/projects')}
						class="p-2 rounded-lg hover:bg-muted transition-colors"
						aria-label="Back to projects"
					>
						<ArrowLeft class="w-5 h-5 text-muted-foreground" />
					</button>

					<div class="min-w-0">
						<p class="text-[11px] uppercase tracking-wide text-muted-foreground">
							Project
						</p>
						<h1
							class="text-xl font-semibold text-foreground leading-tight line-clamp-2"
						>
							{project?.name || 'Untitled Project'}
						</h1>
						<div
							class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
						>
							<span
								class="px-2 py-0.5 rounded-full bg-muted text-foreground/80 border border-border"
							>
								{project?.state_key || 'draft'}
							</span>
							<span
								class="px-2 py-0.5 rounded-full bg-muted text-foreground/80 border border-border"
							>
								{project?.type_key || 'project'}
							</span>
						</div>
					</div>
				</div>

				<div class="flex items-center gap-2">
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
				</div>
			</div>

			<div class="mt-3 flex flex-wrap gap-3">
				{#each [{ label: 'Outputs', value: projectStats().outputs }, { label: 'Documents', value: projectStats().documents }, { label: 'Tasks', value: projectStats().tasks }, { label: 'Plans', value: projectStats().plans }, { label: 'Goals', value: projectStats().goals }] as stat}
					<div class="px-3 py-2 rounded-lg bg-muted/60 border border-border shadow-ink">
						<p class="text-[11px] uppercase tracking-wide text-muted-foreground">
							{stat.label}
						</p>
						<p class="text-base font-semibold text-foreground">{stat.value}</p>
					</div>
				{/each}
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-6">
		<div
			class="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-6 items-start"
		>
			<div class="space-y-8">
				<section
					class="bg-card border border-border rounded-xl shadow-ink tx tx-frame tx-weak p-4"
				>
					<div class="flex flex-wrap items-start justify-between gap-4">
						<div>
							<p class="text-xs uppercase tracking-wide text-muted-foreground">
								Outputs
							</p>
							<h2 class="text-lg font-semibold text-foreground">Deliverables</h2>
							<p class="text-sm text-muted-foreground">
								Outputs are the primary focus. Documents live just below as smaller
								cards.
							</p>
						</div>
					</div>

					<div class="mt-3 flex flex-wrap items-center gap-2">
						<span class="text-sm text-muted-foreground flex items-center gap-1">
							<Filter class="w-4 h-4" />
							Primitive
						</span>
						<button
							onclick={() => handlePrimitiveFilter('all')}
							class="px-3 py-1.5 text-sm rounded-lg transition-colors {primitiveFilter ===
							'all'
								? 'bg-accent text-accent-foreground'
								: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
						>
							All ({primitiveCounts().all || 0})
						</button>
						{#each Object.entries(PRIMITIVE_CONFIG) as [primitive, config]}
							{@const count = primitiveCounts()[primitive] || 0}
							<button
								onclick={() =>
									handlePrimitiveFilter(primitive as DeliverablePrimitive)}
								class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors {primitiveFilter ===
								primitive
									? 'bg-accent text-accent-foreground'
									: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
							>
								<svelte:component this={config.icon} class="w-3.5 h-3.5" />
								<span>{config.label}</span>
								<span class="text-xs opacity-70">({count})</span>
							</button>
						{/each}

						<button
							onclick={() => (showCreateModal = true)}
							class="ml-auto inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border bg-muted/60 font-medium hover:bg-muted transition-colors"
						>
							<Plus class="w-4 h-4" />
							New Deliverable
						</button>
					</div>

					{#if filteredOutputs.length === 0}
						<div
							class="mt-4 flex items-center gap-3 text-sm text-muted-foreground bg-muted/40 border border-border rounded-lg px-3 py-2"
						>
							<Sparkles class="w-4 h-4" />
							<span>No deliverables yet. Create one to get started.</span>
						</div>
					{/if}
				</section>

				<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
					{#each filteredOutputs as output}
						{@const PrimitiveIcon = getPrimitiveIcon(output.primitive)}
						<article
							class="h-full p-4 bg-card border border-border rounded-xl shadow-ink tx tx-grain tx-weak hover:shadow-ink-strong transition-all"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="flex items-start gap-3 min-w-0">
									<div
										class="w-10 h-10 rounded-lg bg-muted flex items-center justify-center"
									>
										<PrimitiveIcon
											class="w-5 h-5 {getPrimitiveColor(output.primitive)}"
										/>
									</div>
									<div class="min-w-0 space-y-1">
										<p
											class="text-xs uppercase text-muted-foreground tracking-wide"
										>
											{output.typeLabel}
										</p>
										<h3
											class="text-base font-semibold text-foreground leading-tight line-clamp-2 break-words"
										>
											{output.name}
										</h3>
									</div>
								</div>
								<span
									class="flex-shrink-0 text-[11px] px-2 py-1 rounded-full border border-border {getStateColor(
										output.state_key
									)}"
								>
									{normalizeState(output.state_key)}
								</span>
							</div>

							<div
								class="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
							>
								<span class="flex items-center gap-1">
									<FileText class="w-3.5 h-3.5" />
									{PRIMITIVE_CONFIG[output.primitive]?.label}
								</span>
								{#if output.taskCount > 0}
									<span class="flex items-center gap-1">
										<CheckCircle2 class="w-3 h-3" />
										{output.taskCount} tasks
									</span>
								{/if}
								{#if output.childCount !== undefined && output.childCount > 0}
									<span class="flex items-center gap-1">
										<Layers class="w-3 h-3" />
										{output.childCount} items
									</span>
								{/if}
								{#if isExternalDeliverable(output.type_key)}
									{@const props = output.props as Record<string, unknown>}
									{@const externalUri = props?.external_uri as string | undefined}
									{#if externalUri}
										<a
											href={externalUri}
											target="_blank"
											rel="noopener noreferrer"
											class="text-xs text-accent underline hover:text-accent/80"
										>
											External link
										</a>
									{/if}
								{/if}
								{#if isCollectionDeliverable(output.type_key)}
									<span class="flex items-center gap-1">
										<Layers class="w-3 h-3" />
										Collection
									</span>
								{/if}
								{#if isEventDeliverable(output.type_key)}
									<span class="flex items-center gap-1">
										<Calendar class="w-3 h-3" />
										Event
									</span>
								{/if}
							</div>
						</article>
					{:else}{/each}
				</div>

				<section
					class="bg-card border border-border rounded-xl shadow-ink tx tx-frame tx-weak p-4"
				>
					<div class="flex flex-wrap items-center justify-between gap-4 mb-3">
						<div>
							<p class="text-xs uppercase tracking-wide text-muted-foreground">
								Documents
							</p>
							<h3 class="text-lg font-semibold text-foreground">Supporting docs</h3>
							<p class="text-sm text-muted-foreground">
								Lighter-weight cards so outputs stay primary.
							</p>
						</div>
						{#if promotableDocuments.length > 0}
							<div
								class="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/30 px-3 py-2 rounded-lg"
							>
								<Sparkles class="w-4 h-4" />
								<span>{promotableDocuments.length} ready to promote</span>
							</div>
						{/if}
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
						{#each documents as doc}
							<article
								class="p-3 rounded-lg border border-border bg-muted/50 shadow-ink tx tx-grain tx-weak"
							>
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0 space-y-1">
										<p
											class="text-[11px] uppercase text-muted-foreground tracking-wide"
										>
											{getTypeLabel(doc.type_key)}
										</p>
										<h4
											class="text-sm font-semibold text-foreground leading-snug line-clamp-2"
										>
											{doc.title}
										</h4>
									</div>
									<span
										class="flex-shrink-0 text-[11px] px-2 py-1 rounded-full bg-card border border-border"
									>
										{doc.state_key || 'draft'}
									</span>
								</div>
							</article>
						{:else}
							<div
								class="col-span-full flex flex-col gap-2 sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border bg-muted/40"
							>
								<div>
									<p class="text-sm font-medium text-foreground">
										No documents attached
									</p>
									<p class="text-sm text-muted-foreground">
										Add research or drafts, then promote them into deliverables.
									</p>
								</div>
							</div>
						{/each}
					</div>
				</section>
			</div>

			<aside class="w-full lg:w-[340px] xl:w-[380px]">
				<div class="sticky top-24 space-y-3">
					{#each insightPanels() as section}
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
										<div
											class="flex items-center justify-between px-4 pt-3 pb-2"
										>
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
													{@const visuals = getTaskVisuals(
														task.state_key
													)}
													<li>
														<button
															type="button"
															onclick={() =>
																(editingTaskId = task.id)}
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
										<div
											class="flex items-center justify-between px-4 pt-3 pb-2"
										>
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
															onclick={() =>
																(editingPlanId = plan.id)}
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
										<div
											class="flex items-center justify-between px-4 pt-3 pb-2"
										>
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
															onclick={() =>
																(editingGoalId = goal.id)}
															class="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
														>
															<Target
																class="w-4 h-4 text-amber-500"
															/>
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
										<div
											class="flex items-center justify-between px-4 pt-3 pb-2"
										>
											<p
												class="text-xs text-muted-foreground uppercase tracking-wide"
											>
												Risks
											</p>
											<button
												type="button"
												onclick={() =>
													toastService.info('Risk creation coming soon')}
												class="inline-flex items-center gap-2 px-2.5 py-1 text-xs rounded-md border border-border bg-muted/60 hover:bg-muted transition-colors"
											>
												<Plus class="w-3.5 h-3.5" />
												New Risk
											</button>
										</div>
										{#if risks.length > 0}
											<ul class="divide-y divide-border/80">
												{#each risks as risk}
													<li class="flex items-start gap-3 px-4 py-3">
														<AlertTriangle
															class="w-4 h-4 text-amber-500"
														/>
														<div class="min-w-0">
															<p
																class="text-sm text-foreground truncate"
															>
																{risk.title}
															</p>
															<p
																class="text-xs text-muted-foreground"
															>
																{risk.impact || 'Unrated'}
															</p>
														</div>
													</li>
												{/each}
											</ul>
										{:else}
											<p class="px-4 py-3 text-sm text-muted-foreground">
												No risks logged
											</p>
										{/if}
									{:else if section.key === 'milestones'}
										<div
											class="flex items-center justify-between px-4 pt-3 pb-2"
										>
											<p
												class="text-xs text-muted-foreground uppercase tracking-wide"
											>
												Milestones
											</p>
											<button
												type="button"
												onclick={() =>
													toastService.info(
														'Milestone creation coming soon'
													)}
												class="inline-flex items-center gap-2 px-2.5 py-1 text-xs rounded-md border border-border bg-muted/60 hover:bg-muted transition-colors"
											>
												<Plus class="w-3.5 h-3.5" />
												New Milestone
											</button>
										</div>
										{#if milestones.length > 0}
											<ul class="divide-y divide-border/80">
												{#each milestones as milestone}
													<li class="flex items-start gap-3 px-4 py-3">
														<Flag class="w-4 h-4 text-emerald-500" />
														<div class="min-w-0">
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
				</div>
			</aside>
		</div>
	</main>
</div>

<!-- Create Deliverable Modal -->
{#if showCreateModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		onclick={() => (showCreateModal = false)}
	>
		<div
			class="bg-card border border-border rounded-xl shadow-ink-strong w-full max-w-md mx-4 p-6"
			onclick={(e) => e.stopPropagation()}
		>
			<h2 class="text-lg font-semibold text-foreground mb-4">Create Deliverable</h2>
			<p class="text-sm text-muted-foreground mb-6">Choose a deliverable type to create</p>

			<div class="grid grid-cols-2 gap-3">
				{#each Object.entries(PRIMITIVE_CONFIG) as [primitive, config]}
					<button
						onclick={() => handleCreateDeliverable(primitive as DeliverablePrimitive)}
						class="flex flex-col items-center gap-2 p-4 rounded-lg border border-border bg-muted/50 hover:bg-muted hover:border-border/80 transition-colors"
					>
						<svelte:component this={config.icon} class="w-8 h-8 {config.color}" />
						<span class="text-sm font-medium text-foreground">{config.label}</span>
					</button>
				{/each}
			</div>

			<div class="mt-6 pt-4 border-t border-border">
				<button
					onclick={() => (showCreateModal = false)}
					class="w-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
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
			{tasks}
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
