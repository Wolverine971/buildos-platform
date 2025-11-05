<!-- apps/web/src/routes/ontology/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';

	let { data } = $props();

	const projects = $derived(data.projects || []);
	const availableStates = $derived(
		Array.from(
			new Set(
				(projects ?? [])
					.map((project) => project.state_key)
					.filter((state): state is string => Boolean(state))
			)
		).sort()
	);
	const availableContexts = $derived(
		Array.from(
			new Set(
				(projects ?? [])
					.map((project) => project.facet_context)
					.filter((context): context is string => Boolean(context))
			)
		).sort()
	);
	const availableScales = $derived(
		Array.from(
			new Set(
				(projects ?? [])
					.map((project) => project.facet_scale)
					.filter((scale): scale is string => Boolean(scale))
			)
		).sort()
	);
	const availableStages = $derived(
		Array.from(
			new Set(
				(projects ?? [])
					.map((project) => project.facet_stage)
					.filter((stage): stage is string => Boolean(stage))
			)
		).sort()
	);

	let searchQuery = $state('');
	let selectedStates = $state<string[]>([]);
	let selectedContexts = $state<string[]>([]);
	let selectedScales = $state<string[]>([]);
	let selectedStages = $state<string[]>([]);

	const hasFilters = $derived(
		Boolean(
			searchQuery.trim() ||
				selectedStates.length ||
				selectedContexts.length ||
				selectedScales.length ||
				selectedStages.length
		)
	);

	const filteredProjects = $derived.by(() => {
		const query = searchQuery.trim().toLowerCase();
		return (projects ?? []).filter((project) => {
			if (query) {
				const matchesQuery =
					project.name.toLowerCase().includes(query) ||
					project.type_key.toLowerCase().includes(query) ||
					(project.description ?? '').toLowerCase().includes(query);
				if (!matchesQuery) return false;
			}

			if (selectedStates.length && !selectedStates.includes(project.state_key)) {
				return false;
			}

			if (selectedContexts.length) {
				if (!project.facet_context || !selectedContexts.includes(project.facet_context)) {
					return false;
				}
			}

			if (selectedScales.length) {
				if (!project.facet_scale || !selectedScales.includes(project.facet_scale)) {
					return false;
				}
			}

			if (selectedStages.length) {
				if (!project.facet_stage || !selectedStages.includes(project.facet_stage)) {
					return false;
				}
			}

			return true;
		});
	});

	const stats = $derived.by(() => {
		const list = filteredProjects;
		const taskTotal = list.reduce((acc, project) => acc + (project.task_count ?? 0), 0);
		const outputTotal = list.reduce((acc, project) => acc + (project.output_count ?? 0), 0);
		const inProgress = list.filter((project) =>
			['active', 'execution', 'in_progress'].includes(project.state_key)
		).length;

		return {
			totalProjects: list.length,
			totalTasks: taskTotal,
			totalOutputs: outputTotal,
			activeProjects: inProgress
		};
	});

	function toggleValue(list: string[], value: string): string[] {
		return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
	}

	function clearFilters() {
		searchQuery = '';
		selectedStates = [];
		selectedContexts = [];
		selectedScales = [];
		selectedStages = [];
	}
</script>

<svelte:head>
	<title>Ontology Projects | BuildOS</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
	<!-- Header -->
	<header class="mb-8 sm:mb-10">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
			<div>
				<h1 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
					Ontology Projects
				</h1>
				<p class="text-base sm:text-lg text-gray-600 dark:text-gray-400">
					Manage all ontology-based projects with typed templates and FSM workflows
				</p>
			</div>

			<Button variant="primary" size="md" onclick={() => goto('/ontology/create')}>
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
				<span class="hidden sm:inline">Create Project</span>
				<span class="sm:hidden">Create</span>
			</Button>
		</div>
	</header>

	<!-- Filters & Insights -->
	<section class="mb-8 space-y-6">
		<Card variant="elevated" padding="none">
			<CardBody padding="md" class="space-y-4">
			<div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
				<div class="flex-1 flex items-center gap-3">
					<div class="relative flex-1">
						<input
							type="search"
							class="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors"
							placeholder="Search projects by name, type, or description…"
							bind:value={searchQuery}
						/>
						<svg
							class="w-5 h-5 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>
					</div>
					{#if hasFilters}
						<button
							type="button"
							class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
							onclick={clearFilters}
						>
							Clear filters
						</button>
					{/if}
				</div>
			</div>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<div
					class="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-4 py-3"
				>
					<p
						class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold"
					>
						Projects
					</p>
					<p class="text-2xl font-semibold text-gray-900 dark:text-white">
						{stats.totalProjects}
					</p>
				</div>
				<div
					class="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-4 py-3"
				>
					<p
						class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold"
					>
						Tasks
					</p>
					<p class="text-2xl font-semibold text-gray-900 dark:text-white">
						{stats.totalTasks}
					</p>
				</div>
				<div
					class="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-4 py-3"
				>
					<p
						class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold"
					>
						Outputs
					</p>
					<p class="text-2xl font-semibold text-gray-900 dark:text-white">
						{stats.totalOutputs}
					</p>
				</div>
				<div
					class="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-4 py-3"
				>
					<p
						class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold"
					>
						Active
					</p>
					<p class="text-2xl font-semibold text-gray-900 dark:text-white">
						{stats.activeProjects}
					</p>
				</div>
			</div>

			<div class="space-y-3">
				{#if availableStates.length}
					<div class="flex flex-col gap-2">
						<p
							class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
						>
							State
						</p>
						<div class="flex flex-wrap gap-2">
							{#each availableStates as state (state)}
								<button
									type="button"
									class="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors {selectedStates.includes(
										state
									)
										? 'bg-blue-600 text-white border-blue-600'
										: 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400'}"
									onclick={() =>
										(selectedStates = toggleValue(selectedStates, state))}
								>
									{state}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
					{#if availableContexts.length}
						<div class="flex flex-col gap-2">
							<p
								class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
							>
								Context
							</p>
							<div class="flex flex-wrap gap-2">
								{#each availableContexts as context (context)}
									<button
										type="button"
										class="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors {selectedContexts.includes(
											context
										)
											? 'bg-amber-500 text-white border-amber-500'
											: 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-amber-400'}"
										onclick={() =>
											(selectedContexts = toggleValue(
												selectedContexts,
												context
											))}
									>
										{context}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					{#if availableScales.length}
						<div class="flex flex-col gap-2">
							<p
								class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
							>
								Scale
							</p>
							<div class="flex flex-wrap gap-2">
								{#each availableScales as scale (scale)}
									<button
										type="button"
										class="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors {selectedScales.includes(
											scale
										)
											? 'bg-purple-500 text-white border-purple-500'
											: 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-purple-400'}"
										onclick={() =>
											(selectedScales = toggleValue(selectedScales, scale))}
									>
										{scale}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					{#if availableStages.length}
						<div class="flex flex-col gap-2">
							<p
								class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
							>
								Stage
							</p>
							<div class="flex flex-wrap gap-2">
								{#each availableStages as stage (stage)}
									<button
										type="button"
										class="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors {selectedStages.includes(
											stage
										)
											? 'bg-emerald-500 text-white border-emerald-500'
											: 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-emerald-400'}"
										onclick={() =>
											(selectedStages = toggleValue(selectedStages, stage))}
									>
										{stage}
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>
			</CardBody>
		</Card>
	</section>

	<!-- Empty State -->
	{#if filteredProjects.length === 0}
		<div
			class="text-center py-16 sm:py-20 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600"
		>
			<div class="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 text-gray-400 dark:text-gray-500">
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
						d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
					/>
				</svg>
			</div>
			<h2 class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white mb-2">
				No projects yet
			</h2>
			<p class="text-gray-600 dark:text-gray-400 mb-6 px-4">
				{projects.length === 0
					? 'Create your first ontology project using typed templates and FSM workflows'
					: 'No projects match the current filters — adjust your search or clear filters to see more.'}
			</p>
			{#if projects.length === 0}
				<Button variant="primary" size="md" onclick={() => goto('/ontology/create')}>
					Create First Project
				</Button>
			{:else if hasFilters}
				<Button variant="outline" size="md" onclick={clearFilters}>Clear Filters</Button>
			{/if}
		</div>
	{:else}
		<!-- Projects Grid -->
		<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
			{#each filteredProjects as project (project.id)}
				<a
					href="/ontology/projects/{project.id}"
					class="group bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5 transition-all duration-300 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-lg dark:hover:shadow-blue-900/20 hover:-translate-y-1"
				>
					<!-- Card Header -->
					<div class="flex items-start justify-between gap-4 mb-4">
						<div class="flex-1 min-w-0">
							<h3
								class="text-lg font-semibold text-gray-900 dark:text-white mb-1 truncate group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors"
							>
								{project.name}
							</h3>
							<p class="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
								{project.type_key}
							</p>
						</div>
						<span
							class="px-3 py-1 rounded-full text-xs font-semibold capitalize whitespace-nowrap flex-shrink-0 {project.state_key ===
							'draft'
								? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
								: project.state_key === 'planning' || project.state_key === 'intake'
									? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
									: project.state_key === 'active' ||
										  project.state_key === 'execution'
										? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
										: project.state_key === 'completed' ||
											  project.state_key === 'published'
											? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
											: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}"
						>
							{project.state_key}
						</span>
					</div>

					<!-- Description -->
					{#if project.description}
						<p
							class="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2 leading-relaxed"
						>
							{project.description}
						</p>
					{/if}

					<!-- Facets -->
					{#if project.facet_context || project.facet_scale || project.facet_stage}
						<div class="flex flex-wrap gap-2 mb-4">
							{#if project.facet_context}
								<span
									class="px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 capitalize"
								>
									{project.facet_context}
								</span>
							{/if}
							{#if project.facet_scale}
								<span
									class="px-2.5 py-1 rounded-md text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 capitalize"
								>
									{project.facet_scale}
								</span>
							{/if}
							{#if project.facet_stage}
								<span
									class="px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 capitalize"
								>
									{project.facet_stage}
								</span>
							{/if}
						</div>
					{/if}

					<!-- Card Footer -->
					<div
						class="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700"
					>
						<div
							class="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400"
						>
							<span class="flex items-center gap-1.5" aria-label="Task count">
								<svg
									class="w-4 h-4"
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
									/>
								</svg>
								<span class="font-medium">{project.task_count}</span>
							</span>
							<span class="flex items-center gap-1.5" aria-label="Output count">
								<svg
									class="w-4 h-4"
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
								<span class="font-medium">{project.output_count}</span>
							</span>
						</div>
						<span class="text-xs text-gray-500 dark:text-gray-500">
							{new Date(project.updated_at).toLocaleDateString()}
						</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
