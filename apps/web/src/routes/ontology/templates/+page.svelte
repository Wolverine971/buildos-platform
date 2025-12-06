<!-- apps/web/src/routes/ontology/templates/+page.svelte -->
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

		goto(`/ontology/templates${params.toString() ? '?' + params.toString() : ''}`, {
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
		goto(`/ontology/create?template=${encodeURIComponent(identifier)}`);
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
			onclick={() => goto('/ontology')}
			class="inline-flex items-center gap-2 rounded border-2 border-slate-700/30 bg-surface-elevated px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-accent-orange hover:text-accent-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-orange dark:border-slate-500/30 dark:bg-surface-panel dark:text-slate-300 dark:hover:border-accent-orange dark:hover:text-accent-orange shadow-subtle"
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
				<h1 class="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
					Ontology Templates
				</h1>
				<p class="text-sm sm:text-base text-slate-600 dark:text-slate-400">
					Browse and discover {templates.length} template{templates.length !== 1
						? 's'
						: ''} across all domains
				</p>
			</div>

			{#if isAdmin}
				<Button variant="primary" size="md" onclick={() => goto('/ontology/templates/new')}>
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
		class="rounded border-2 border-slate-700/30 dark:border-slate-500/30 bg-surface-panel dark:bg-slate-800 p-4 sm:p-6 flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-300 shadow-subtle"
	>
		<div class="min-w-[200px] flex-1">
			<p
				class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold"
			>
				Type Keys
			</p>
			<p>
				Autonomous scopes use <code class="font-mono">domain.deliverable[.variant]</code> so
				schema + FSM stay reusable.
			</p>
		</div>
		<div class="min-w-[200px] flex-1">
			<p
				class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold"
			>
				Facets
			</p>
			<p>
				Context · scale · stage layer perspective onto the instance without renaming the
				entity.
			</p>
		</div>
		<div class="min-w-[200px] flex-1">
			<p
				class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold"
			>
				Entity Categories
			</p>
			<div class="flex flex-wrap gap-2 text-xs mt-1">
				{#each scopeGroups as group}
					<span
						class="inline-flex items-center rounded-full border border-slate-700/30 dark:border-slate-500/30 px-3 py-1 text-gray-700 dark:text-gray-200"
					>
						{group.title}: {group.scopes.length}
					</span>
				{/each}
			</div>
		</div>
	</div>
	<!-- Filters -->
	<Card variant="elevated" padding="none">
		<CardBody padding="lg" class="space-y-5">
			<div class="flex flex-col lg:flex-row gap-4">
				<!-- Search -->
				<div class="flex-1">
					<FormField label="Search templates" labelFor="search">
						<TextInput
							id="search"
							type="text"
							placeholder="Search by name or type..."
							bind:value={searchQuery}
							oninput={handleSearchInput}
						/>
					</FormField>
				</div>

				<!-- Scope Filter -->
				<div class="w-full lg:w-52">
					<FormField label="Scope" labelFor="scope">
						<Select id="scope" bind:value={selectedScope} onchange={updateFilters}>
							<option value="">All Scopes</option>
							{#each filterOptions.scopes as scopeOption}
								<option value={scopeOption}>{capitalize(scopeOption)}</option>
							{/each}
						</Select>
					</FormField>
				</div>

				<!-- Realm Filter -->
				<div class="w-full lg:w-52">
					<FormField label="Realm" labelFor="realm">
						<Select id="realm" bind:value={selectedRealm} onchange={updateFilters}>
							<option value="">All Realms</option>
							{#each filterOptions.realms as realmOption}
								<option value={realmOption}>{capitalize(realmOption)}</option>
							{/each}
						</Select>
					</FormField>
				</div>

				<div
					class="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/40 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 text-sm"
				>
					<div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
						<svg
							class="w-4 h-4 text-gray-400 dark:text-gray-500"
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
						<span>
							{hasActiveFilters
								? `${totalFilterCount} filter${totalFilterCount === 1 ? '' : 's'} applied`
								: 'No filters applied'}
						</span>
						{#if activeFacetCount}
							<span
								class="inline-flex items-center rounded-full bg-white/80 dark:bg-gray-800/70 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:text-gray-200"
							>
								{activeFacetCount} facet{activeFacetCount === 1 ? '' : 's'}
							</span>
						{/if}
					</div>
					{#if hasActiveFilters}
						<Button variant="ghost" size="sm" onclick={clearFilters} class="shrink-0">
							Reset filters
						</Button>
					{/if}
				</div>
			</div>

			<!-- Facet Filters -->
			<div class="grid gap-3 md:grid-cols-3">
				<details
					class={`rounded-2xl border bg-surface-panel dark:bg-slate-800 px-4 py-3 ${selectedContexts.length ? 'border-blue-200 dark:border-blue-500/40' : 'border-2 border-slate-700/30 dark:border-slate-500/30'}`}
					open={selectedContexts.length > 0}
				>
					<summary
						class="flex items-center justify-between gap-2 cursor-pointer text-xs font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wide"
					>
						<span>Context</span>
						<span class="text-[11px] text-gray-500 dark:text-gray-400">
							{selectedContexts.length}/{facetOptions.context?.length ?? 0}
						</span>
					</summary>
					<div class="mt-2 space-y-2">
						<p class="text-xs text-gray-500 dark:text-gray-400">
							{facetDescriptions.context}
						</p>
						<div class="flex flex-wrap gap-2">
							{#if facetOptions.context && facetOptions.context.length}
								{#each facetOptions.context as option}
									{@const isSelected = selectedContexts.includes(option.value)}
									<label
										class={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
											isSelected
												? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-500/40 dark:text-blue-100'
												: 'bg-transparent border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-400 hover:border-blue-200'
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
								<p class="text-xs text-gray-500 dark:text-gray-500">
									No context facets.
								</p>
							{/if}
						</div>
					</div>
				</details>

				<details
					class={`rounded-2xl border bg-surface-panel dark:bg-slate-800 px-4 py-3 ${selectedScales.length ? 'border-emerald-200 dark:border-emerald-500/40' : 'border-2 border-slate-700/30 dark:border-slate-500/30'}`}
					open={selectedScales.length > 0}
				>
					<summary
						class="flex items-center justify-between gap-2 cursor-pointer text-xs font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wide"
					>
						<span>Scale</span>
						<span class="text-[11px] text-gray-500 dark:text-gray-400">
							{selectedScales.length}/{facetOptions.scale?.length ?? 0}
						</span>
					</summary>
					<div class="mt-2 space-y-2">
						<p class="text-xs text-gray-500 dark:text-gray-400">
							{facetDescriptions.scale}
						</p>
						<div class="flex flex-wrap gap-2">
							{#if facetOptions.scale && facetOptions.scale.length}
								{#each facetOptions.scale as option}
									{@const isScaleSelected = selectedScales.includes(option.value)}
									<label
										class={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
											isScaleSelected
												? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-500/40 dark:text-emerald-100'
												: 'bg-transparent border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-400 hover:border-emerald-200'
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
								<p class="text-xs text-gray-500 dark:text-gray-500">
									No scale facets.
								</p>
							{/if}
						</div>
					</div>
				</details>

				<details
					class={`rounded-2xl border bg-surface-panel dark:bg-slate-800 px-4 py-3 ${selectedStages.length ? 'border-accent-blue-200 dark:border-accent-blue-500/40' : 'border-2 border-slate-700/30 dark:border-slate-500/30'}`}
					open={selectedStages.length > 0}
				>
					<summary
						class="flex items-center justify-between gap-2 cursor-pointer text-xs font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wide"
					>
						<span>Stage</span>
						<span class="text-[11px] text-gray-500 dark:text-gray-400">
							{selectedStages.length}/{facetOptions.stage?.length ?? 0}
						</span>
					</summary>
					<div class="mt-2 space-y-2">
						<p class="text-xs text-gray-500 dark:text-gray-400">
							{facetDescriptions.stage}
						</p>
						<div class="flex flex-wrap gap-2">
							{#if facetOptions.stage && facetOptions.stage.length}
								{#each facetOptions.stage as option}
									{@const isStageSelected = selectedStages.includes(option.value)}
									<label
										class={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
											isStageSelected
												? 'bg-accent-blue-50 border-accent-blue-200 text-accent-blue-700 dark:bg-accent-blue-900/30 dark:border-accent-blue-500/40 dark:text-accent-blue-100'
												: 'bg-transparent border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-400 hover:border-accent-blue-200'
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
								<p class="text-xs text-gray-500 dark:text-gray-500">
									No stage facets.
								</p>
							{/if}
						</div>
					</div>
				</details>
			</div>

			<div
				class="flex flex-col gap-4 pt-4 border-t border-slate-700/30 dark:border-slate-500/30 md:flex-row md:items-center md:justify-between"
			>
				<div class="flex items-center gap-3">
					<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Sort by</span
					>
					<Select id="sortBy" bind:value={sortBy} onchange={updateFilters} class="w-auto">
						<option value="name">Name</option>
						<option value="type_key">Type Key</option>
						<option value="realm">Realm</option>
						<option value="scope">Scope</option>
						<option value="status">Status</option>
					</Select>
					<Select bind:value={sortDirection} onchange={updateFilters} class="w-auto">
						<option value="asc">Ascending</option>
						<option value="desc">Descending</option>
					</Select>
				</div>

				<div class="flex items-center gap-2">
					<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
						>Group by:</span
					>
					<div class="flex gap-2">
						<button
							onclick={() => (viewMode = 'realm')}
							class="px-3 py-1.5 rounded text-sm font-medium transition-colors {viewMode ===
							'realm'
								? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
								: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}"
						>
							Realm
						</button>
						<button
							onclick={() => (viewMode = 'scope')}
							class="px-3 py-1.5 rounded text-sm font-medium transition-colors {viewMode ===
							'scope'
								? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
								: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}"
						>
							Scope
						</button>
					</div>
				</div>
			</div>

			{#if selectedScopeDetails || selectedRealm || activeFacetCount}
				<div
					class="grid gap-4 pt-5 border-t border-gray-100 dark:border-gray-800 md:grid-cols-2"
				>
					{#if selectedScopeDetails}
						<div
							class="rounded-2xl border border-2 border-slate-700/30 dark:border-slate-500/30 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-900/40 p-4 space-y-2"
						>
							<p
								class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400"
							>
								Scope Insight
							</p>
							<h4 class="text-lg font-semibold text-gray-900 dark:text-gray-50">
								{selectedScopeDetails.label}
							</h4>
							<p class="text-sm text-gray-600 dark:text-gray-300">
								{selectedScopeDetails.summary}
							</p>
							{#if selectedScopeDetails.typeKeyPattern}
								<p class="text-xs font-mono text-gray-500 dark:text-gray-400">
									Type Key pattern: {selectedScopeDetails.typeKeyPattern}
								</p>
							{/if}
							{#if selectedScopeDetails.facetUsage}
								<p class="text-xs text-gray-500 dark:text-gray-400">
									Facet focus: {selectedScopeDetails.facetUsage}
								</p>
							{/if}
							{#if selectedScopeDetails.notes}
								<p class="text-xs text-gray-500 dark:text-gray-400">
									{selectedScopeDetails.notes}
								</p>
							{/if}
						</div>
					{/if}

					{#if selectedRealm || activeFacetCount}
						<div
							class="rounded-2xl border border-2 border-slate-700/30 dark:border-slate-500/30 bg-surface-panel dark:bg-slate-800 p-4 space-y-3"
						>
							{#if selectedRealm}
								<div>
									<p
										class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400"
									>
										Realm
									</p>
									<p
										class="text-base font-semibold text-gray-900 dark:text-gray-50"
									>
										{formatRealm(selectedRealm)}
									</p>
									<p class="text-xs text-gray-500 dark:text-gray-400">
										Use realms to cluster templates by practitioner perspective.
									</p>
								</div>
							{/if}

							{#if activeFacetCount}
								<div class="space-y-2">
									<p
										class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400"
									>
										Facet Lenses
									</p>
									<div class="space-y-3">
										{#if selectedContexts.length}
											<div class="space-y-1">
												<p
													class="text-xs font-semibold text-gray-600 dark:text-gray-300"
												>
													Context
												</p>
												<div class="flex flex-wrap gap-2">
													{#each selectedContexts as value}
														<span
															class="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-100 border border-blue-100 dark:border-blue-500/40 px-3 py-1 text-xs"
														>
															{facetLabelMap.context?.[value] ??
																capitalize(value)}
														</span>
													{/each}
												</div>
											</div>
										{/if}
										{#if selectedScales.length}
											<div class="space-y-1">
												<p
													class="text-xs font-semibold text-gray-600 dark:text-gray-300"
												>
													Scale
												</p>
												<div class="flex flex-wrap gap-2">
													{#each selectedScales as value}
														<span
															class="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-100 border border-emerald-100 dark:border-emerald-500/40 px-3 py-1 text-xs"
														>
															{facetLabelMap.scale?.[value] ??
																capitalize(value)}
														</span>
													{/each}
												</div>
											</div>
										{/if}
										{#if selectedStages.length}
											<div class="space-y-1">
												<p
													class="text-xs font-semibold text-gray-600 dark:text-gray-300"
												>
													Stage
												</p>
												<div class="flex flex-wrap gap-2">
													{#each selectedStages as value}
														<span
															class="inline-flex items-center rounded-full bg-accent-blue-50 dark:bg-accent-blue-500/10 text-accent-blue-700 dark:text-accent-blue-100 border border-accent-blue-100 dark:border-accent-blue-500/40 px-3 py-1 text-xs"
														>
															{facetLabelMap.stage?.[value] ??
																capitalize(value)}
														</span>
													{/each}
												</div>
											</div>
										{/if}
									</div>
								</div>
							{/if}
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
				class="text-center py-16 sm:py-20 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600"
			>
				<div
					class="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 text-gray-400 dark:text-gray-500"
				>
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
				<h2 class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white mb-2">
					No templates found
				</h2>
				<p class="text-gray-600 dark:text-gray-400 mb-6 px-4">
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
							<h2 class="text-2xl font-bold text-gray-900 dark:text-white capitalize">
								{realm}
							</h2>
							<span class="text-sm text-gray-500 dark:text-gray-400">
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
							<h2 class="text-2xl font-bold text-gray-900 dark:text-white capitalize">
								{scopeKey}
							</h2>
							<span class="text-sm text-gray-500 dark:text-gray-400">
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
				<p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
					Are you sure you want to delete the template
					<span class="font-semibold">{templateToDelete.name}</span>?
				</p>
				<p class="text-sm font-semibold text-red-600 dark:text-red-400">
					This will permanently delete:
				</p>
				<ul
					class="list-disc list-inside mt-2 text-sm text-gray-600 dark:text-gray-300 space-y-1"
				>
					<li>The template and all its configuration</li>
					{#if deleteProjectCount > 0}
						<li class="font-semibold text-red-600 dark:text-red-400">
							{deleteProjectCount} project{deleteProjectCount !== 1 ? 's' : ''} using this
							template
						</li>
						<li class="ml-4">
							All tasks, goals, plans, documents, and other entities within those
							projects
						</li>
					{:else}
						<li class="text-gray-500 dark:text-gray-400 italic">
							No projects are using this template
						</li>
					{/if}
				</ul>
			</div>

			<div slot="details">
				{#if deleteError}
					<p class="mt-3 text-sm text-red-600 dark:text-red-400">
						{deleteError}
					</p>
				{/if}
			</div>
		</ConfirmationModal>
	{/await}
{/if}
