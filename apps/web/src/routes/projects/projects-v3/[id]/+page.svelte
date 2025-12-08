<!-- apps/web/src/routes/projects/projects-v3/[id]/+page.svelte -->
<!--
	Ontology Project Detail V3 - Deliverables-Centric View

	This prototype implements the "outputs as central organizing principle" model:
	- Deliverables (outputs) are the main characters
	- Tasks, plans, events orbit around deliverables
	- Board view grouped by deliverable state
	- Primitive-based filtering (document, event, collection, external)

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
		ChevronRight,
		ArrowLeft,
		RefreshCw,
		Settings,
		Filter,
		LayoutGrid,
		List,
		CheckCircle2,
		Circle,
		Clock,
		Sparkles,
		Target,
		Link2
	} from 'lucide-svelte';
	import type { Project, Task, Output, Document, Plan } from '$lib/types/onto';
	import {
		getDeliverablePrimitive,
		isCollectionDeliverable,
		isExternalDeliverable,
		isEventDeliverable,
		isDocumentDeliverable,
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

	type ViewMode = 'board' | 'list';
	type PrimitiveFilter = DeliverablePrimitive | 'all';

	// State columns for the board view
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

	// UI State
	let viewMode = $state<ViewMode>('board');
	let primitiveFilter = $state<PrimitiveFilter>('all');
	let selectedDeliverableId = $state<string | null>(null);
	let dataRefreshing = $state(false);
	let showCreateModal = $state(false);

	// ============================================================
	// DERIVED STATE
	// ============================================================

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

	// Group outputs by state for board view
	const outputsByState = $derived(() => {
		const grouped: Record<string, typeof enrichedOutputs> = {};
		for (const col of STATE_COLUMNS) {
			grouped[col.key] = filteredOutputs.filter(
				(o) => normalizeState(o.state_key) === col.key
			);
		}
		return grouped;
	});

	// Count by primitive for filter badges
	const primitiveCounts = $derived(() => {
		const counts: Record<string, number> = { all: outputs.length };
		for (const output of outputs) {
			const primitive = getDeliverablePrimitive(output.type_key) || 'document';
			counts[primitive] = (counts[primitive] || 0) + 1;
		}
		return counts;
	});

	// Selected deliverable details
	const selectedDeliverable = $derived(
		selectedDeliverableId ? enrichedOutputs.find((o) => o.id === selectedDeliverableId) : null
	);

	// Tasks related to selected deliverable
	const relatedTasks = $derived(
		selectedDeliverableId
			? tasks.filter((t) => {
					// Check if task is linked to this output via props or edges
					const props = t.props as Record<string, unknown>;
					return props?.output_id === selectedDeliverableId;
				})
			: []
	);

	// Documents that could be promoted to deliverables
	const promotableDocuments = $derived(
		documents.filter((doc) => {
			// Document not already linked to an output
			return !outputs.some(
				(o) => (o as Output & { source_document_id?: string }).source_document_id === doc.id
			);
		})
	);

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

	function selectDeliverable(id: string) {
		selectedDeliverableId = selectedDeliverableId === id ? null : id;
	}

	function handlePrimitiveFilter(primitive: PrimitiveFilter) {
		primitiveFilter = primitive;
	}

	async function handlePromoteDocument(documentId: string) {
		// TODO: Implement document promotion flow
		// This would open a modal to select deliverable type
		toastService.info('Document promotion coming soon');
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
		<div class="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
			<div class="flex h-16 items-center justify-between gap-4">
				<!-- Left: Back + Project Name -->
				<div class="flex items-center gap-3">
					<button
						onclick={() => goto('/projects')}
						class="p-2 rounded-lg hover:bg-muted transition-colors"
						aria-label="Back to projects"
					>
						<ArrowLeft class="w-5 h-5 text-muted-foreground" />
					</button>

					<div>
						<h1 class="text-lg font-semibold text-foreground line-clamp-1">
							{project?.name || 'Untitled Project'}
						</h1>
						<p class="text-sm text-muted-foreground">
							{outputs.length} deliverables
						</p>
					</div>
				</div>

				<!-- Right: Actions -->
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

					<button
						onclick={() => (showCreateModal = true)}
						class="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg font-medium shadow-ink pressable hover:bg-accent/90 transition-colors"
					>
						<Plus class="w-4 h-4" />
						<span class="hidden sm:inline">New Deliverable</span>
					</button>
				</div>
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-6">
		<div class="flex flex-col lg:flex-row gap-6">
			<!-- Left Panel: Deliverables Board/List -->
			<div class="flex-1 min-w-0">
				<!-- Toolbar: View Toggle + Filters -->
				<div
					class="flex flex-wrap items-center justify-between gap-4 mb-6 p-4 bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak"
				>
					<!-- Primitive Filters -->
					<div class="flex flex-wrap items-center gap-2">
						<span class="text-sm text-muted-foreground mr-2">
							<Filter class="w-4 h-4 inline-block" />
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
							{#if count > 0}
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
							{/if}
						{/each}
					</div>

					<!-- View Toggle -->
					<div class="flex items-center gap-1 bg-muted rounded-lg p-1">
						<button
							onclick={() => (viewMode = 'board')}
							class="p-2 rounded-md transition-colors {viewMode === 'board'
								? 'bg-card shadow-sm'
								: 'hover:bg-card/50'}"
							aria-label="Board view"
						>
							<LayoutGrid class="w-4 h-4" />
						</button>
						<button
							onclick={() => (viewMode = 'list')}
							class="p-2 rounded-md transition-colors {viewMode === 'list'
								? 'bg-card shadow-sm'
								: 'hover:bg-card/50'}"
							aria-label="List view"
						>
							<List class="w-4 h-4" />
						</button>
					</div>
				</div>

				<!-- Board View -->
				{#if viewMode === 'board'}
					<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
						{#each STATE_COLUMNS as column}
							{@const columnOutputs = outputsByState()[column.key] || []}
							<div class="flex flex-col">
								<!-- Column Header -->
								<div
									class="flex items-center justify-between px-3 py-2 mb-3 rounded-lg {column.color}"
								>
									<h3 class="font-medium text-foreground">{column.label}</h3>
									<span
										class="text-sm text-muted-foreground bg-background/50 px-2 py-0.5 rounded"
									>
										{columnOutputs.length}
									</span>
								</div>

								<!-- Column Cards -->
								<div class="flex flex-col gap-3 min-h-[200px]">
									{#each columnOutputs as output}
										{@const PrimitiveIcon = getPrimitiveIcon(output.primitive)}
										<button
											onclick={() => selectDeliverable(output.id)}
											class="text-left p-4 bg-card border rounded-lg shadow-ink tx tx-grain tx-weak hover:shadow-ink-strong transition-all {selectedDeliverableId ===
											output.id
												? 'border-accent ring-2 ring-accent/20'
												: 'border-border'}"
										>
											<!-- Type Badge -->
											<div class="flex items-center gap-2 mb-2">
												<span class={getPrimitiveColor(output.primitive)}>
													<PrimitiveIcon class="w-4 h-4" />
												</span>
												<span class="text-xs text-muted-foreground">
													{output.typeLabel}
												</span>
											</div>

											<!-- Name -->
											<h4
												class="font-medium text-foreground line-clamp-2 mb-2"
											>
												{output.name}
											</h4>

											<!-- Meta -->
											<div
												class="flex items-center gap-3 text-xs text-muted-foreground"
											>
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
											</div>
										</button>
									{:else}
										<div
											class="flex-1 flex items-center justify-center p-6 border-2 border-dashed border-border/50 rounded-lg"
										>
											<p class="text-sm text-muted-foreground">
												No deliverables
											</p>
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>

					<!-- List View -->
				{:else}
					<div class="space-y-3">
						{#each filteredOutputs as output}
							{@const PrimitiveIcon = getPrimitiveIcon(output.primitive)}
							<button
								onclick={() => selectDeliverable(output.id)}
								class="w-full text-left flex items-center gap-4 p-4 bg-card border rounded-lg shadow-ink tx tx-grain tx-weak hover:shadow-ink-strong transition-all {selectedDeliverableId ===
								output.id
									? 'border-accent ring-2 ring-accent/20'
									: 'border-border'}"
							>
								<!-- Primitive Icon -->
								<div
									class="flex-shrink-0 w-10 h-10 rounded-lg {getStateColor(
										output.state_key
									)} flex items-center justify-center"
								>
									<PrimitiveIcon
										class="w-5 h-5 {getPrimitiveColor(output.primitive)}"
									/>
								</div>

								<!-- Content -->
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2 mb-1">
										<h4 class="font-medium text-foreground truncate">
											{output.name}
										</h4>
										<span
											class="flex-shrink-0 px-2 py-0.5 text-xs rounded-full {getStateColor(
												output.state_key
											)}"
										>
											{output.state_key}
										</span>
									</div>
									<p class="text-sm text-muted-foreground">
										{output.typeLabel}
										{#if output.taskCount > 0}
											<span class="mx-1">·</span>
											{output.taskCount} tasks
										{/if}
									</p>
								</div>

								<!-- Arrow -->
								<ChevronRight class="w-5 h-5 text-muted-foreground flex-shrink-0" />
							</button>
						{:else}
							<div
								class="flex flex-col items-center justify-center p-12 bg-card border border-border rounded-lg tx tx-bloom tx-weak"
							>
								<Sparkles class="w-12 h-12 text-muted-foreground mb-4" />
								<h3 class="text-lg font-medium text-foreground mb-2">
									No deliverables yet
								</h3>
								<p class="text-sm text-muted-foreground mb-4">
									Create your first deliverable to get started
								</p>
								<button
									onclick={() => (showCreateModal = true)}
									class="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg font-medium shadow-ink pressable"
								>
									<Plus class="w-4 h-4" />
									New Deliverable
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Right Panel: Details -->
			<aside class="w-full lg:w-96 flex-shrink-0">
				{#if selectedDeliverable}
					{@const PrimitiveIcon = getPrimitiveIcon(selectedDeliverable.primitive)}
					<div
						class="sticky top-24 bg-card border border-border rounded-lg shadow-ink-strong tx tx-frame tx-weak overflow-hidden"
					>
						<!-- Header -->
						<div
							class="p-4 border-b border-border {getStateColor(
								selectedDeliverable.state_key
							)}"
						>
							<div class="flex items-center gap-3 mb-2">
								<div
									class="w-10 h-10 rounded-lg bg-background/50 flex items-center justify-center"
								>
									<PrimitiveIcon
										class="w-5 h-5 {getPrimitiveColor(
											selectedDeliverable.primitive
										)}"
									/>
								</div>
								<div>
									<span class="text-xs text-muted-foreground block">
										{PRIMITIVE_CONFIG[selectedDeliverable.primitive]?.label ||
											'Deliverable'}
									</span>
									<span
										class="text-xs px-2 py-0.5 rounded-full bg-background/50 text-foreground"
									>
										{selectedDeliverable.state_key}
									</span>
								</div>
							</div>
							<h2 class="text-lg font-semibold text-foreground">
								{selectedDeliverable.name}
							</h2>
							<p class="text-sm text-muted-foreground mt-1">
								{selectedDeliverable.typeLabel}
							</p>
						</div>

						<!-- Content Sections -->
						<div class="p-4 space-y-6">
							<!-- Related Tasks -->
							<section>
								<h3
									class="text-sm font-medium text-foreground mb-3 flex items-center gap-2"
								>
									<CheckCircle2 class="w-4 h-4 text-muted-foreground" />
									Related Tasks ({relatedTasks.length})
								</h3>
								{#if relatedTasks.length > 0}
									<div class="space-y-2">
										{#each relatedTasks as task}
											<div
												class="flex items-center gap-3 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
											>
												{#if task.state_key === 'done'}
													<CheckCircle2
														class="w-4 h-4 text-emerald-500"
													/>
												{:else if task.state_key === 'in_progress'}
													<Clock class="w-4 h-4 text-accent" />
												{:else}
													<Circle class="w-4 h-4 text-muted-foreground" />
												{/if}
												<span
													class="text-sm text-foreground truncate flex-1"
												>
													{task.title}
												</span>
											</div>
										{/each}
									</div>
								{:else}
									<p class="text-sm text-muted-foreground">
										No tasks linked to this deliverable
									</p>
								{/if}
								<button
									class="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm border border-dashed border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
								>
									<Plus class="w-4 h-4" />
									Add Task
								</button>
							</section>

							<!-- Goals -->
							{#if goals.length > 0}
								<section>
									<h3
										class="text-sm font-medium text-foreground mb-3 flex items-center gap-2"
									>
										<Target class="w-4 h-4 text-muted-foreground" />
										Related Goals
									</h3>
									<div class="space-y-2">
										{#each goals.slice(0, 3) as goal}
											<div
												class="flex items-center gap-3 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
											>
												<Target class="w-4 h-4 text-amber-500" />
												<span
													class="text-sm text-foreground truncate flex-1"
												>
													{goal.name}
												</span>
											</div>
										{/each}
									</div>
								</section>
							{/if}

							<!-- Collection Children (for collection type) -->
							{#if isCollectionDeliverable(selectedDeliverable.type_key)}
								<section>
									<h3
										class="text-sm font-medium text-foreground mb-3 flex items-center gap-2"
									>
										<Layers class="w-4 h-4 text-muted-foreground" />
										Collection Items ({selectedDeliverable.childCount || 0})
									</h3>
									<p class="text-sm text-muted-foreground">
										Manage the items in this collection
									</p>
									<button
										class="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm border border-dashed border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
									>
										<Plus class="w-4 h-4" />
										Add Item
									</button>
								</section>
							{/if}

							<!-- External Link (for external type) -->
							{#if isExternalDeliverable(selectedDeliverable.type_key)}
								{@const props = selectedDeliverable.props as Record<
									string,
									unknown
								>}
								{@const externalUri = props?.external_uri as string | undefined}
								<section>
									<h3
										class="text-sm font-medium text-foreground mb-3 flex items-center gap-2"
									>
										<Link2 class="w-4 h-4 text-muted-foreground" />
										External Link
									</h3>
									{#if externalUri}
										<a
											href={externalUri}
											target="_blank"
											rel="noopener noreferrer"
											class="flex items-center gap-2 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-sm text-accent underline"
										>
											<ExternalLink class="w-4 h-4" />
											{externalUri}
										</a>
									{:else}
										<button
											class="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm border border-dashed border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
										>
											<Link2 class="w-4 h-4" />
											Add External Link
										</button>
									{/if}
								</section>
							{/if}

							<!-- Actions -->
							<section class="pt-4 border-t border-border">
								<div class="flex flex-wrap gap-2">
									<button
										class="flex-1 px-3 py-2 text-sm bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors"
									>
										Edit
									</button>
									<button
										class="px-3 py-2 text-sm bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors"
									>
										<Settings class="w-4 h-4" />
									</button>
								</div>
							</section>
						</div>
					</div>
				{:else}
					<!-- Empty State - Promotable Documents -->
					<div
						class="sticky top-24 bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak p-6"
					>
						<h3 class="text-sm font-medium text-foreground mb-4">
							Select a deliverable to see details
						</h3>

						{#if promotableDocuments.length > 0}
							<div class="mt-6">
								<h4
									class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3"
								>
									Documents to Promote
								</h4>
								<div class="space-y-2">
									{#each promotableDocuments.slice(0, 5) as doc}
										<button
											onclick={() => handlePromoteDocument(doc.id)}
											class="w-full flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
										>
											<FileText
												class="w-4 h-4 text-muted-foreground flex-shrink-0"
											/>
											<div class="flex-1 min-w-0">
												<p class="text-sm text-foreground truncate">
													{doc.title}
												</p>
												<p class="text-xs text-muted-foreground">
													Click to promote to deliverable
												</p>
											</div>
											<Sparkles
												class="w-4 h-4 text-amber-500 flex-shrink-0"
											/>
										</button>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}
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
