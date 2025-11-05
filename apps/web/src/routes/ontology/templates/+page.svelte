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
	import TemplateDetailModal from '$lib/components/ontology/templates/TemplateDetailModal.svelte';
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

	const templates = $derived(data.templates as Template[] || []);
	const grouped = $derived(data.grouped as Record<string, Template[]> || {});
	const byScope = $derived(data.byScope as Record<string, Template[]> || {});
	const filterOptions = $derived((data.filterOptions || { realms: [], scopes: [], facets: {} }) as FilterOptions);
	const currentFilters = $derived((data.currentFilters || {}) as CurrentFilters);
	const isAdmin = $derived(data.isAdmin as boolean || false);

	let viewMode = $state<'realm' | 'scope'>('realm');
	let selectedScope = $state(currentFilters.scope || '');
	let selectedRealm = $state(currentFilters.realm || '');
	let searchQuery = $state(currentFilters.search || '');
	let selectedContexts = $state<string[]>([...(currentFilters.contexts || [])]);
	let selectedScales = $state<string[]>([...(currentFilters.scales || [])]);
	let selectedStages = $state<string[]>([...(currentFilters.stages || [])]);
	let sortBy = $state(currentFilters.sort || 'name');
	let sortDirection = $state<'asc' | 'desc'>(
		currentFilters.direction === 'desc' ? 'desc' : 'asc'
	);

	let detailOpen = $state(false);
	let detailLoading = $state(false);
	let detailError = $state<string | null>(null);
	let detailTemplate = $state<ResolvedTemplate | null>(null);
	let detailChildren = $state<TemplateChild[]>([]);
	let searchDebounce: ReturnType<typeof setTimeout> | null = null;

	const facetOptions = $derived(filterOptions.facets || {});
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
				`/api/onto/templates/${encodeURIComponent(typeKey)}${params.toString() ? '?' + params.toString() : ''}`
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
</script>

<svelte:head>
	<title>Templates | Ontology | BuildOS</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
	<!-- Header -->
	<header class="mb-6 sm:mb-8">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
			<div>
				<h1 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
					Ontology Templates
				</h1>
				<p class="text-base sm:text-lg text-gray-600 dark:text-gray-400">
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

				{#if hasActiveFilters}
					<div class="flex items-end">
						<Button
							variant="outline"
							size="md"
							onclick={clearFilters}
							class="w-full lg:w-auto"
						>
							Clear Filters
						</Button>
					</div>
				{/if}
			</div>

			<!-- Facet Filters -->
			<div class="grid gap-4 md:grid-cols-3">
				<div class="space-y-2">
					<h3
						class="text-sm font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wide"
					>
						Context
					</h3>
					<div class="flex flex-wrap gap-2">
						{#if facetOptions.context && facetOptions.context.length}
							{#each facetOptions.context as option}
								<label
									class="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/70 px-3 py-1.5 rounded-lg"
								>
									<input
										type="checkbox"
										value={option.value}
										bind:group={selectedContexts}
										onchange={updateFilters}
										class="rounded border-gray-300 dark:border-gray-500 text-blue-600 focus:ring-blue-500"
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

				<div class="space-y-2">
					<h3
						class="text-sm font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wide"
					>
						Scale
					</h3>
					<div class="flex flex-wrap gap-2">
						{#if facetOptions.scale && facetOptions.scale.length}
							{#each facetOptions.scale as option}
								<label
									class="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/70 px-3 py-1.5 rounded-lg"
								>
									<input
										type="checkbox"
										value={option.value}
										bind:group={selectedScales}
										onchange={updateFilters}
										class="rounded border-gray-300 dark:border-gray-500 text-blue-600 focus:ring-blue-500"
									/>
									<span>{option.label || capitalize(option.value)}</span>
								</label>
							{/each}
						{:else}
							<p class="text-xs text-gray-500 dark:text-gray-500">No scale facets.</p>
						{/if}
					</div>
				</div>

				<div class="space-y-2">
					<h3
						class="text-sm font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wide"
					>
						Stage
					</h3>
					<div class="flex flex-wrap gap-2">
						{#if facetOptions.stage && facetOptions.stage.length}
							{#each facetOptions.stage as option}
								<label
									class="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/70 px-3 py-1.5 rounded-lg"
								>
									<input
										type="checkbox"
										value={option.value}
										bind:group={selectedStages}
										onchange={updateFilters}
										class="rounded border-gray-300 dark:border-gray-500 text-blue-600 focus:ring-blue-500"
									/>
									<span>{option.label || capitalize(option.value)}</span>
								</label>
							{/each}
						{:else}
							<p class="text-xs text-gray-500 dark:text-gray-500">No stage facets.</p>
						{/if}
					</div>
				</div>
			</div>

			<div
				class="flex flex-col gap-4 pt-4 border-t border-gray-200 dark:border-gray-700 md:flex-row md:items-center md:justify-between"
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
							class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors {viewMode ===
							'realm'
								? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
								: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}"
						>
							Realm
						</button>
						<button
							onclick={() => (viewMode = 'scope')}
							class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors {viewMode ===
							'scope'
								? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
								: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}"
						>
							Scope
						</button>
					</div>
				</div>
			</div>
		</CardBody>
	</Card>

	<!-- Templates Display -->
	<div class="mt-8">
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
			<div class="space-y-12">
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
									onViewDetails={() => openTemplateDetail(template)}
									onCreateProject={() => createProjectFromTemplate(template)}
								/>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="space-y-12">
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
									onViewDetails={() => openTemplateDetail(template)}
									onCreateProject={() => createProjectFromTemplate(template)}
								/>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<TemplateDetailModal
	open={detailOpen}
	loading={detailLoading}
	error={detailError}
	template={detailTemplate}
	children={detailChildren}
	on:close={() => closeDetail()}
	on:createProject={handleCreateFromDetail}
	on:selectTemplate={handleSelectChild}
/>
