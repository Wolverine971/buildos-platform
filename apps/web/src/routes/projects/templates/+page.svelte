<!-- apps/web/src/routes/projects/templates/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { Template } from '$lib/types/onto';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TemplateCard from '$lib/components/ontology/templates/TemplateCard.svelte';
	// Lazy loaded modal
	import type { ResolvedTemplate } from '$lib/services/ontology/template-resolver.service';

	interface TemplateChild {
		id: string;
		type_key: string;
		name: string;
		scope: string;
	}

	interface FilterOptions {
		realms: string[];
		scopes: string[];
		facets: Record<string, string[]>;
	}

	interface CurrentFilters {
		scope?: string;
		realm?: string;
		search?: string;
		contexts?: string[];
		scales?: string[];
		stages?: string[];
		sort?: string;
		direction?: string;
		detail?: string;
	}

	let { data } = $props();

	const templates = $derived((data.templates as Template[]) || []);
	const grouped = $derived((data.grouped as Record<string, Template[]>) || {});
	const byScope = $derived((data.byScope as Record<string, Template[]>) || {});
	const filterOptions = $derived(
		(data.filterOptions || { realms: [], scopes: [], facets: {} }) as FilterOptions
	);
	const currentFilters = $derived((data.currentFilters || {}) as CurrentFilters);
	const isAdmin = $derived((data.isAdmin as boolean) || false);

	type ScopeCategory = 'autonomous' | 'project_derived' | 'reference';
	type ScopeTaxonomyEntry = {
		label: string;
		category: ScopeCategory;
		summary: string;
		typeKeyPattern?: string;
		facetUsage?: string;
		notes?: string;
	};

	const scopeTaxonomy: Record<string, ScopeTaxonomyEntry> = {
		project: {
			label: 'Projects',
			category: 'autonomous',
			summary:
				'Top-level work definitions that declare the domain, deliverable, and optional variant.',
			typeKeyPattern: '{domain}.{deliverable}[.{variant}]',
			facetUsage: 'context / scale / stage',
			notes: 'Always independently discoverable; facets describe how a specific project instance shows up.'
		},
		plan: {
			label: 'Plans',
			category: 'autonomous',
			summary: 'Reusable orchestration playbooks with their own FSM.',
			typeKeyPattern: 'plan.{type}[.{variant}]',
			facetUsage: 'context / scale / stage',
			notes: 'Can be used across projects, so they keep independent type keys.'
		},
		output: {
			label: 'Outputs',
			category: 'autonomous',
			summary: 'Deliverables that exit the system (chapters, briefs, docs).',
			typeKeyPattern: 'deliverable.{type}[.{variant}]',
			facetUsage: 'context / stage',
			notes: 'Often filtered by deliverable type across projects.'
		},
		document: {
			label: 'Documents',
			category: 'autonomous',
			summary: 'Internal knowledge artifacts shared across work.',
			typeKeyPattern: 'document.{type}',
			facetUsage: 'context / stage',
			notes: 'Use when the document structure matters outside a single project.'
		},
		goal: {
			label: 'Goals',
			category: 'autonomous',
			summary: 'Objectives and outcomes that can be tracked independently.',
			typeKeyPattern: 'goal.{type}',
			facetUsage: 'context / scale',
			notes: 'Keeps goal templates reusable across domains.'
		},
		task: {
			label: 'Tasks',
			category: 'autonomous',
			summary: 'Hybrid entities – may inherit from project but can opt into task.{type}.',
			typeKeyPattern: 'task.{type} (optional)',
			facetUsage: 'context / scale',
			notes: 'Only add a task type key if it should be templatized outside a project.'
		},
		requirement: {
			label: 'Requirements',
			category: 'project_derived',
			summary: 'Needs that typically inherit meaning from the parent project.',
			facetUsage: 'context',
			notes: 'Skip type keys unless you truly need global requirement templates.'
		},
		metric: {
			label: 'Metrics',
			category: 'project_derived',
			summary: 'Measurements scoped to a project, usually inheriting domain context.',
			facetUsage: 'scale',
			notes: 'Use project metadata to explain what is being measured.'
		},
		risk: {
			label: 'Risks',
			category: 'project_derived',
			summary: 'Risk entries that might optionally use risk.{type} if schema diverges.',
			typeKeyPattern: 'risk.{type} (optional)',
			facetUsage: 'context',
			notes: 'Keep simple unless you need risk-specific templates.'
		},
		milestone: {
			label: 'Milestones',
			category: 'project_derived',
			summary: 'Temporal markers that rely on the project lifecycle.',
			facetUsage: 'stage',
			notes: 'No independent type key – inherits project semantics.'
		}
	};

	const scopeGroups: Array<{
		key: ScopeCategory;
		title: string;
		description: string;
		scopes: string[];
		notes?: string;
	}> = [
		{
			key: 'autonomous',
			title: 'Autonomous Entities',
			description:
				'Need their own taxonomy because they can be templated, filtered, and orchestrated outside a single project.',
			scopes: ['project', 'plan', 'output', 'document', 'goal', 'task']
		},
		{
			key: 'project_derived',
			title: 'Project-Derived Entities',
			description:
				'Inherit most meaning from the parent project. Create templates sparingly.',
			scopes: ['requirement', 'metric', 'milestone', 'risk']
		},
		{
			key: 'reference',
			title: 'Reference + System',
			description:
				'Structural records (facet definitions, permissions, etc.). They rarely appear in this list but help explain the taxonomy.',
			scopes: [],
			notes: 'Facet definitions, edges, assignments, and permissions live here.'
		}
	];

	const facetDescriptions = {
		context: 'Who the work is for or the perspective driving the effort.',
		scale: 'How big or complex the work is.',
		stage: 'Where the work sits in its lifecycle.'
	};

	// State declarations - must come before $derived that uses them
	let viewMode = $state<'realm' | 'scope'>('realm');
	let selectedScope = $state('');
	let selectedRealm = $state('');
	let searchQuery = $state('');
	let selectedContexts = $state<string[]>([]);
	let selectedScales = $state<string[]>([]);
	let selectedStages = $state<string[]>([]);
	let sortBy = $state('name');
	let sortDirection = $state<'asc' | 'desc'>('asc');

	// Derived state - depends on selectedScope above
	const selectedScopeDetails = $derived(
		selectedScope ? (scopeTaxonomy[selectedScope] ?? null) : null
	);

	// Sync filter state with URL/server data
	$effect(() => {
		selectedScope = currentFilters.scope || '';
		selectedRealm = currentFilters.realm || '';
		searchQuery = currentFilters.search || '';
		selectedContexts = [...(currentFilters.contexts || [])];
		selectedScales = [...(currentFilters.scales || [])];
		selectedStages = [...(currentFilters.stages || [])];
		sortBy = currentFilters.sort || 'name';
		sortDirection = currentFilters.direction === 'desc' ? 'desc' : 'asc';
	});

	let detailOpen = $state(false);
	let detailLoading = $state(false);
	let detailError = $state<string | null>(null);
	let detailTemplate = $state<ResolvedTemplate | null>(null);
	let detailChildren = $state<TemplateChild[]>([]);
	let searchDebounce: ReturnType<typeof setTimeout> | null = null;
	let showDeleteConfirmModal = $state(false);
	let templateToDelete = $state<Template | null>(null);
	let deleteLoading = $state(false);
	let deleteError = $state<string | null>(null);
	let deleteProjectCount = $state(0);

	const facetOptions = $derived(filterOptions.facets || {});
	const facetLabelMap = $derived.by(() => {
		const map: Record<string, Record<string, string>> = {};
		for (const [key, values] of Object.entries(facetOptions)) {
			map[key] = (values ?? []).reduce(
				(acc, option) => {
					if (option?.value) {
						acc[option.value] = option.label || capitalize(option.value);
					}
					return acc;
				},
				{} as Record<string, string>
			);
		}
		return map;
	});
	const hasActiveFilters = $derived(
		Boolean(
			selectedScope ||
				selectedRealm ||
				searchQuery.trim() ||
				selectedContexts.length ||
				selectedScales.length ||
				selectedStages.length ||
				sortBy !== 'name' ||
				sortDirection !== 'asc'
		)
	);
	const activeFacetCount = $derived(
		selectedContexts.length + selectedScales.length + selectedStages.length
	);
	const totalFilterCount = $derived(
		(selectedScope ? 1 : 0) +
			(selectedRealm ? 1 : 0) +
			(searchQuery.trim() ? 1 : 0) +
			(selectedContexts.length ? 1 : 0) +
			(selectedScales.length ? 1 : 0) +
			(selectedStages.length ? 1 : 0) +
			(sortBy !== 'name' ? 1 : 0) +
			(sortDirection !== 'asc' ? 1 : 0)
	);

	function handleSearchInput(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		searchQuery = target.value;
		if (searchDebounce) clearTimeout(searchDebounce);
		searchDebounce = setTimeout(() => {
			updateFilters();
		}, 350);
	}

	function updateFilters() {
		closeDetail(false);
		const params = new URLSearchParams();

		if (selectedScope) params.set('scope', selectedScope);
		if (selectedRealm) params.set('realm', selectedRealm);
		if (searchQuery.trim()) params.set('search', searchQuery.trim());
		selectedContexts.forEach((value) => params.append('context', value));
		selectedScales.forEach((value) => params.append('scale', value));
		selectedStages.forEach((value) => params.append('stage', value));
		if (sortBy) params.set('sort', sortBy);
		if (sortDirection) params.set('direction', sortDirection);

		goto(`/projects/templates${params.toString() ? '?' + params.toString() : ''}`, {
			replaceState: true,
			noScroll: true
		});
	}

	function clearFilters() {
		selectedScope = '';
		selectedRealm = '';
		searchQuery = '';
		selectedContexts = [];
		selectedScales = [];
		selectedStages = [];
		sortBy = 'name';
		sortDirection = 'asc';
		updateFilters();
	}

	function createProjectFromTemplate(template: { id?: string | null; type_key: string }) {
		const identifier = template.id ?? template.type_key;
		goto(`/projects/create?template=${encodeURIComponent(identifier)}`);
	}

	async function openTemplateDetail(template: Template) {
		await openTemplateDetailByKey(template.type_key, template.scope);
	}

	async function openTemplateDetailByKey(typeKey: string, scope?: string) {
		detailOpen = true;
		detailLoading = true;
		detailError = null;
		detailTemplate = null;
		updateDetailQuery(typeKey);

		try {
			const params = new URLSearchParams();
			if (scope) params.set('scope', scope);
			const response = await fetch(
				`/api/onto/templates/by-type/${encodeURIComponent(typeKey)}${params.toString() ? '?' + params.toString() : ''}`
			);
			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				throw new Error(body.message || 'Failed to load template details');
			}
			const detail = await response.json();
			// Unwrap ApiResponse format: { success: true, data: {...} }
			const data = detail.success && detail.data ? detail.data : detail;
			detailTemplate = data.template as ResolvedTemplate;
			detailChildren = data.children ?? [];
			detailLoading = false;
		} catch (err) {
			console.error('[Template Detail] Failed:', err);
			detailError = err instanceof Error ? err.message : 'Failed to load template';
			detailLoading = false;
		}
	}

	function closeDetail(updateUrl = true) {
		if (!detailOpen) return;
		detailOpen = false;
		detailTemplate = null;
		detailChildren = [];
		detailError = null;
		if (updateUrl) {
			updateDetailQuery();
		}
	}

	function updateDetailQuery(typeKey?: string) {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		if (typeKey) {
			url.searchParams.set('detail', typeKey);
		} else {
			url.searchParams.delete('detail');
		}
		window.history.replaceState({}, '', url.toString());
	}

	onMount(() => {
		if (currentFilters.detail) {
			openTemplateDetailByKey(currentFilters.detail, currentFilters.scope || undefined);
		}
	});

	function handleSelectChild(event: CustomEvent<{ typeKey: string; scope: string }>) {
		const { typeKey, scope } = event.detail;
		openTemplateDetailByKey(typeKey, scope);
	}

	function handleCreateFromDetail(event: CustomEvent<{ template: ResolvedTemplate }>) {
		createProjectFromTemplate(event.detail.template);
	}

	function capitalize(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}

	function formatRealm(value?: string | null): string {
		if (!value) return '';
		return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
	}

	async function handleDeleteTemplate(template: Template) {
		if (!isAdmin) return;

		templateToDelete = template;
		deleteError = null;
		deleteProjectCount = 0;

		// Fetch project count for confirmation
		try {
			const response = await fetch(`/api/onto/templates/${template.id}/project-count`);
			if (response.ok) {
				const data = await response.json();
				deleteProjectCount = data.data?.count || 0;
			}
		} catch (err) {
			console.error('Failed to fetch project count:', err);
		}

		showDeleteConfirmModal = true;
	}

	function closeDeleteConfirmModal() {
		if (deleteLoading) return;
		showDeleteConfirmModal = false;
		templateToDelete = null;
		deleteError = null;
		deleteProjectCount = 0;
	}

	async function confirmDeleteTemplate() {
		if (!templateToDelete?.id) return;

		deleteLoading = true;
		deleteError = null;

		try {
			const response = await fetch(`/api/onto/templates/${templateToDelete.id}`, {
				method: 'DELETE'
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to delete template');
			}

			// Close modal and reload page to refresh template list
			showDeleteConfirmModal = false;
			window.location.reload();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to delete template';
			deleteError = message;
			console.error('Failed to delete template:', err);
		} finally {
			deleteLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Templates | Ontology | BuildOS</title>
</svelte:head>

<div class="space-y-4 sm:space-y-6">
	<!-- Mobile Back Button - Only visible on mobile -->
	<div class="lg:hidden">
		<button
			type="button"
			onclick={() => goto('/projects')}
			class="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow-ink pressable"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 19l-7-7m0 0l7-7m-7 7h18"
				/>
			</svg>
			<span>Back to Projects</span>
		</button>
	</div>

	<!-- Header -->
	<header>
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
			<div>
				<h1 class="text-2xl sm:text-3xl font-bold text-foreground mb-2">
					Ontology Templates
				</h1>
				<p class="text-sm sm:text-base text-muted-foreground">
					Browse and discover {templates.length} template{templates.length !== 1
						? 's'
						: ''} across all domains
				</p>
			</div>

			{#if isAdmin}
				<Button variant="primary" size="md" onclick={() => goto('/projects/templates/new')}>
					<svg
						class="w-5 h-5"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 4v16m8-8H4"
						/>
					</svg>
					<span class="hidden sm:inline">New Template</span>
					<span class="sm:hidden">New</span>
				</Button>
			{/if}
		</div>
	</header>

	<div
		class="rounded-lg border border-border bg-card p-4 sm:p-6 flex flex-wrap gap-4 text-sm text-muted-foreground shadow-ink tx tx-thread tx-weak"
	>
		<div class="min-w-[200px] flex-1">
			<p class="micro-label text-accent mb-1">Type Keys</p>
			<p>
				Autonomous scopes use <code class="font-mono text-foreground"
					>domain.deliverable[.variant]</code
				> so schema + FSM stay reusable.
			</p>
		</div>
		<div class="min-w-[200px] flex-1">
			<p class="micro-label text-accent mb-1">Facets</p>
			<p>
				Context · scale · stage layer perspective onto the instance without renaming the
				entity.
			</p>
		</div>
		<div class="min-w-[200px] flex-1">
			<p class="micro-label text-accent mb-1">Entity Categories</p>
			<div class="flex flex-wrap gap-2 text-xs mt-1">
				{#each scopeGroups as group}
					<span
						class="inline-flex items-center rounded-full border border-border px-3 py-1 text-foreground"
					>
						{group.title}: {group.scopes.length}
					</span>
				{/each}
			</div>
		</div>
	</div>
	<!-- Filters -->
	<Card variant="elevated" padding="none">
		<CardBody padding="md" class="space-y-3">
			<!-- Row 1: Search (full width) -->
			<div class="relative">
				<svg
					class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					/>
				</svg>
				<TextInput
					id="search"
					type="text"
					placeholder="Search templates by name, type key, or description..."
					bind:value={searchQuery}
					oninput={handleSearchInput}
					class="pl-10"
				/>
			</div>

			<!-- Row 2: Entity Filters + Sort + View + Filter Status -->
			<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<!-- Left: Entity filters (Scope + Realm) grouped -->
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>Filter:</span
					>
					<Select
						id="scope"
						bind:value={selectedScope}
						onchange={updateFilters}
						class="w-auto min-w-[120px]"
					>
						<option value="">All Scopes</option>
						{#each filterOptions.scopes as scopeOption}
							<option value={scopeOption}>{capitalize(scopeOption)}</option>
						{/each}
					</Select>
					<Select
						id="realm"
						bind:value={selectedRealm}
						onchange={updateFilters}
						class="w-auto min-w-[120px]"
					>
						<option value="">All Realms</option>
						{#each filterOptions.realms as realmOption}
							<option value={realmOption}>{capitalize(realmOption)}</option>
						{/each}
					</Select>

					<span class="hidden lg:inline text-border">|</span>

					<span class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>Sort:</span
					>
					<Select
						id="sortBy"
						bind:value={sortBy}
						onchange={updateFilters}
						class="w-auto min-w-[100px]"
					>
						<option value="name">Name</option>
						<option value="type_key">Type Key</option>
						<option value="realm">Realm</option>
						<option value="scope">Scope</option>
						<option value="status">Status</option>
					</Select>
					<Select
						bind:value={sortDirection}
						onchange={updateFilters}
						class="w-auto min-w-[100px]"
					>
						<option value="asc">A → Z</option>
						<option value="desc">Z → A</option>
					</Select>
				</div>

				<!-- Right: View toggle + Filter status -->
				<div class="flex items-center gap-3">
					<div
						class="flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 p-0.5"
					>
						<button
							onclick={() => (viewMode = 'realm')}
							class="px-2.5 py-1 rounded-md text-xs font-medium transition-colors pressable {viewMode ===
							'realm'
								? 'bg-card text-foreground shadow-ink'
								: 'text-muted-foreground hover:text-foreground'}"
						>
							By Realm
						</button>
						<button
							onclick={() => (viewMode = 'scope')}
							class="px-2.5 py-1 rounded-md text-xs font-medium transition-colors pressable {viewMode ===
							'scope'
								? 'bg-card text-foreground shadow-ink'
								: 'text-muted-foreground hover:text-foreground'}"
						>
							By Scope
						</button>
					</div>

					{#if hasActiveFilters}
						<div class="flex items-center gap-2 text-xs text-muted-foreground">
							<span
								class="inline-flex items-center gap-1.5 rounded-full bg-accent/10 text-accent border border-accent/30 px-2 py-0.5 font-medium"
							>
								<svg
									class="w-3 h-3"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M4 5h16l-5.5 7v5l-5 2v-7L4 5z"
									/>
								</svg>
								{totalFilterCount}
							</span>
							<button
								onclick={clearFilters}
								class="text-muted-foreground hover:text-foreground transition-colors"
								title="Clear all filters"
							>
								<svg
									class="w-4 h-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</div>
					{/if}
				</div>
			</div>

			<!-- Row 3: Facet Filters (collapsible) -->
			<details class="group" open={activeFacetCount > 0}>
				<summary
					class="flex items-center gap-2 cursor-pointer text-xs font-medium text-muted-foreground uppercase tracking-wide py-1 select-none"
				>
					<svg
						class="w-3 h-3 transition-transform group-open:rotate-90"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 5l7 7-7 7"
						/>
					</svg>
					<span>Facet Filters</span>
					{#if activeFacetCount > 0}
						<span class="text-[10px] text-accent font-semibold"
							>({activeFacetCount} active)</span
						>
					{/if}
				</summary>

				<div class="grid gap-2 pt-2 sm:grid-cols-3">
					<!-- Context Facet -->
					<div
						class={`rounded-lg border bg-muted/30 p-2.5 ${selectedContexts.length ? 'border-accent/50' : 'border-border'}`}
					>
						<div class="flex items-center justify-between mb-2">
							<span
								class="text-[10px] font-semibold text-foreground uppercase tracking-wide"
								>Context</span
							>
							<span class="text-[10px] text-muted-foreground"
								>{selectedContexts.length}/{facetOptions.context?.length ?? 0}</span
							>
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#if facetOptions.context && facetOptions.context.length}
								{#each facetOptions.context as option}
									{@const isSelected = selectedContexts.includes(option.value)}
									<label
										class={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition cursor-pointer ${
											isSelected
												? 'bg-accent/10 border-accent text-accent'
												: 'bg-transparent border-border text-muted-foreground hover:border-accent/50'
										}`}
									>
										<input
											type="checkbox"
											value={option.value}
											bind:group={selectedContexts}
											onchange={updateFilters}
											class="sr-only"
										/>
										<span>{option.label || capitalize(option.value)}</span>
									</label>
								{/each}
							{:else}
								<p class="text-[10px] text-muted-foreground italic">No options</p>
							{/if}
						</div>
					</div>

					<!-- Scale Facet -->
					<div
						class={`rounded-lg border bg-muted/30 p-2.5 ${selectedScales.length ? 'border-emerald-500/50' : 'border-border'}`}
					>
						<div class="flex items-center justify-between mb-2">
							<span
								class="text-[10px] font-semibold text-foreground uppercase tracking-wide"
								>Scale</span
							>
							<span class="text-[10px] text-muted-foreground"
								>{selectedScales.length}/{facetOptions.scale?.length ?? 0}</span
							>
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#if facetOptions.scale && facetOptions.scale.length}
								{#each facetOptions.scale as option}
									{@const isScaleSelected = selectedScales.includes(option.value)}
									<label
										class={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition cursor-pointer ${
											isScaleSelected
												? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400'
												: 'bg-transparent border-border text-muted-foreground hover:border-emerald-500/50'
										}`}
									>
										<input
											type="checkbox"
											value={option.value}
											bind:group={selectedScales}
											onchange={updateFilters}
											class="sr-only"
										/>
										<span>{option.label || capitalize(option.value)}</span>
									</label>
								{/each}
							{:else}
								<p class="text-[10px] text-muted-foreground italic">No options</p>
							{/if}
						</div>
					</div>

					<!-- Stage Facet -->
					<div
						class={`rounded-lg border bg-muted/30 p-2.5 ${selectedStages.length ? 'border-blue-500/50' : 'border-border'}`}
					>
						<div class="flex items-center justify-between mb-2">
							<span
								class="text-[10px] font-semibold text-foreground uppercase tracking-wide"
								>Stage</span
							>
							<span class="text-[10px] text-muted-foreground"
								>{selectedStages.length}/{facetOptions.stage?.length ?? 0}</span
							>
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#if facetOptions.stage && facetOptions.stage.length}
								{#each facetOptions.stage as option}
									{@const isStageSelected = selectedStages.includes(option.value)}
									<label
										class={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition cursor-pointer ${
											isStageSelected
												? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400'
												: 'bg-transparent border-border text-muted-foreground hover:border-blue-500/50'
										}`}
									>
										<input
											type="checkbox"
											value={option.value}
											bind:group={selectedStages}
											onchange={updateFilters}
											class="sr-only"
										/>
										<span>{option.label || capitalize(option.value)}</span>
									</label>
								{/each}
							{:else}
								<p class="text-[10px] text-muted-foreground italic">No options</p>
							{/if}
						</div>
					</div>
				</div>
			</details>

			<!-- Active Filter Insights (only when relevant) -->
			{#if selectedScopeDetails || selectedRealm}
				<div class="flex flex-wrap gap-3 pt-2 border-t border-border">
					{#if selectedScopeDetails}
						<div
							class="flex-1 min-w-[200px] rounded-lg border border-border bg-muted/30 p-2.5 space-y-1"
						>
							<p
								class="text-[10px] uppercase tracking-wide font-semibold text-accent"
							>
								Scope: {selectedScopeDetails.label}
							</p>
							<p class="text-xs text-muted-foreground leading-snug">
								{selectedScopeDetails.summary}
							</p>
							{#if selectedScopeDetails.typeKeyPattern}
								<p class="text-[10px] font-mono text-muted-foreground">
									Pattern: {selectedScopeDetails.typeKeyPattern}
								</p>
							{/if}
						</div>
					{/if}

					{#if selectedRealm}
						<div
							class="flex-1 min-w-[200px] rounded-lg border border-border bg-muted/30 p-2.5 space-y-1"
						>
							<p
								class="text-[10px] uppercase tracking-wide font-semibold text-accent"
							>
								Realm: {formatRealm(selectedRealm)}
							</p>
							<p class="text-xs text-muted-foreground leading-snug">
								Templates filtered by practitioner perspective.
							</p>
						</div>
					{/if}
				</div>
			{/if}
		</CardBody>
	</Card>

	<!-- Templates Display -->
	<div>
		{#if templates.length === 0}
			<!-- Empty State -->
			<div
				class="text-center py-16 sm:py-20 bg-card rounded-xl border-2 border-dashed border-border"
			>
				<div class="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 text-muted-foreground">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
				</div>
				<h2 class="text-xl sm:text-2xl font-semibold text-foreground mb-2">
					No templates found
				</h2>
				<p class="text-muted-foreground mb-6 px-4">
					Try adjusting your filters or search query
				</p>
				<Button variant="outline" size="md" onclick={clearFilters}>
					Clear All Filters
				</Button>
			</div>
		{:else if viewMode === 'realm'}
			<div class="space-y-8">
				{#each Object.entries(grouped) as [realm, realmTemplates]}
					<div class="space-y-6">
						<div class="flex items-center justify-between">
							<h2 class="text-2xl font-bold text-foreground capitalize">
								{realm}
							</h2>
							<span class="text-sm text-muted-foreground">
								{realmTemplates.length} template{realmTemplates.length !== 1
									? 's'
									: ''}
							</span>
						</div>

						<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
							{#each realmTemplates as template}
								<TemplateCard
									{template}
									showRealmBadge={false}
									{isAdmin}
									onViewDetails={() => openTemplateDetail(template)}
									onCreateProject={() => createProjectFromTemplate(template)}
									onDelete={() => handleDeleteTemplate(template)}
								/>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="space-y-8">
				{#each Object.entries(byScope) as [scopeKey, scopeTemplates]}
					<div class="space-y-6">
						<div class="flex items-center justify-between">
							<h2 class="text-2xl font-bold text-foreground capitalize">
								{scopeKey}
							</h2>
							<span class="text-sm text-muted-foreground">
								{scopeTemplates.length} template{scopeTemplates.length !== 1
									? 's'
									: ''}
							</span>
						</div>

						<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
							{#each scopeTemplates as template}
								<TemplateCard
									{template}
									showRealmBadge={true}
									{isAdmin}
									onViewDetails={() => openTemplateDetail(template)}
									onCreateProject={() => createProjectFromTemplate(template)}
									onDelete={() => handleDeleteTemplate(template)}
								/>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

{#if detailOpen}
	{#await import('$lib/components/ontology/templates/TemplateDetailModal.svelte') then { default: TemplateDetailModal }}
		<TemplateDetailModal
			open={detailOpen}
			loading={detailLoading}
			error={detailError}
			template={detailTemplate}
			children={detailChildren}
			{isAdmin}
			onclose={() => closeDetail()}
			oncreateproject={handleCreateFromDetail}
			onselecttemplate={handleSelectChild}
			ondelete={() => {
				if (detailTemplate) {
					// Convert ResolvedTemplate back to Template for deletion
					const templateForDelete: Template = {
						id: detailTemplate.id,
						type_key: detailTemplate.type_key,
						name: detailTemplate.name,
						scope: detailTemplate.scope,
						status: detailTemplate.status,
						parent_template_id: detailTemplate.parent_template_id,
						is_abstract: detailTemplate.is_abstract,
						fsm: detailTemplate.fsm,
						schema: detailTemplate.schema,
						metadata: detailTemplate.metadata,
						default_props: detailTemplate.default_props,
						default_views: detailTemplate.default_views,
						facet_defaults: detailTemplate.facet_defaults,
						created_at: '',
						updated_at: '',
						created_by: ''
					};
					closeDetail();
					handleDeleteTemplate(templateForDelete);
				}
			}}
		/>
	{/await}
{/if}

{#if showDeleteConfirmModal && templateToDelete}
	{#await import('$lib/components/ui/ConfirmationModal.svelte') then { default: ConfirmationModal }}
		<ConfirmationModal
			isOpen={showDeleteConfirmModal}
			title="Delete Template"
			confirmText="Delete Template"
			confirmVariant="danger"
			loading={deleteLoading}
			loadingText="Deleting..."
			icon="danger"
			on:confirm={confirmDeleteTemplate}
			on:cancel={closeDeleteConfirmModal}
		>
			<div slot="content">
				<p class="text-sm text-muted-foreground mb-4">
					Are you sure you want to delete the template
					<span class="font-semibold text-foreground">{templateToDelete.name}</span>?
				</p>
				<p class="text-sm font-semibold text-red-600">This will permanently delete:</p>
				<ul class="list-disc list-inside mt-2 text-sm text-muted-foreground space-y-1">
					<li>The template and all its configuration</li>
					{#if deleteProjectCount > 0}
						<li class="font-semibold text-red-600">
							{deleteProjectCount} project{deleteProjectCount !== 1 ? 's' : ''} using this
							template
						</li>
						<li class="ml-4">
							All tasks, goals, plans, documents, and other entities within those
							projects
						</li>
					{:else}
						<li class="text-muted-foreground italic">
							No projects are using this template
						</li>
					{/if}
				</ul>
			</div>

			<div slot="details">
				{#if deleteError}
					<p class="mt-3 text-sm text-red-600">
						{deleteError}
					</p>
				{/if}
			</div>
		</ConfirmationModal>
	{/await}
{/if}
