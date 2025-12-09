<!-- apps/web/src/lib/components/chat/ContextSelectionScreen.svelte -->
<!--
  Context Selection Screen - Pre-chat context selector

  Allows users to choose their chat context before starting a conversation.
  Supports 3-tier selection for project-based contexts.
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { createEventDispatcher } from 'svelte';
	import {
		Globe,
		Plus,
		FolderOpen,
		ChevronRight,
		Sparkles,
		Loader2,
		Lightbulb
	} from 'lucide-svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import type { ChatContextType } from '@buildos/shared-types';

	interface OntologyProjectSummary {
		id: string;
		name: string;
		description: string | null;
		typeKey: string;
		stateKey: string;
		facetContext: string | null;
		facetScale: string | null;
		facetStage: string | null;
		createdAt: string;
		updatedAt: string;
		taskCount: number;
		outputCount: number;
	}

	interface ContextSelection {
		contextType: ChatContextType | 'agent_to_agent';
		entityId?: string;
		label?: string;
	}

	interface Props {
		inModal?: boolean;
		onNavigationChange?: (view: 'primary' | 'projectHub' | 'project-selection') => void;
	}

	// Props
	let { inModal = true, onNavigationChange }: Props = $props();

	// State
	let selectedView: 'primary' | 'projectHub' | 'project-selection' = $state('primary');
	let projects = $state<OntologyProjectSummary[]>([]);
	let isLoadingProjects = $state(false);
	let projectsError = $state<string | null>(null);
	let hasLoadedProjects = $state(false);

	const INACTIVE_PROJECT_STATE_KEYS = new Set(['archived', 'completed', 'retired', 'closed']);

	const dispatch = createEventDispatcher<{
		select: ContextSelection;
	}>();

	// Load projects on mount
	onMount(async () => {
		await loadProjects(true);
	});

	async function loadProjects(force = false) {
		if (isLoadingProjects || (!force && hasLoadedProjects && projects.length > 0)) {
			return;
		}

		isLoadingProjects = true;
		projectsError = null;

		try {
			const response = await fetch('/api/onto/projects', {
				method: 'GET',
				credentials: 'same-origin',
				cache: 'no-store',
				headers: {
					Accept: 'application/json'
				}
			});
			const payload = await response.json();

			if (!response.ok || payload?.success === false) {
				projectsError = payload?.error || 'Failed to load ontology projects';
				projects = [];
				hasLoadedProjects = true;
				return;
			}

			const fetchedProjects = payload?.data?.projects ?? payload?.projects ?? [];
			const processedProjects: OntologyProjectSummary[] = fetchedProjects.map(
				(project: any) => ({
					id: project.id,
					name: project.name ?? 'Untitled project',
					description: project.description ?? null,
					typeKey: project.type_key ?? project.typeKey ?? 'project.generic',
					stateKey: project.state_key ?? project.stateKey ?? 'draft',
					facetContext: project.facet_context ?? project.facetContext ?? null,
					facetScale: project.facet_scale ?? project.facetScale ?? null,
					facetStage: project.facet_stage ?? project.facetStage ?? null,
					createdAt: project.created_at ?? project.createdAt ?? '',
					updatedAt: project.updated_at ?? project.updatedAt ?? '',
					taskCount: project.task_count ?? project.taskCount ?? 0,
					outputCount: project.output_count ?? project.outputCount ?? 0
				})
			);
			projects = processedProjects;
			hasLoadedProjects = true;
		} catch (err) {
			console.error('Failed to load ontology projects:', err);
			projectsError = 'Failed to load ontology projects';
			hasLoadedProjects = true;
		} finally {
			isLoadingProjects = false;
		}
	}

	$effect(() => {
		if (!browser) return;
		if (selectedView === 'projectHub' && !isLoadingProjects && projects.length === 0) {
			loadProjects(true);
		}
	});

	// Notify parent of navigation changes for header back button
	$effect(() => {
		onNavigationChange?.(selectedView);
	});

	// Primary actions
	function selectGlobal() {
		dispatch('select', { contextType: 'global', label: 'Global conversation' });
	}

	function selectAgentToAgent() {
		dispatch('select', { contextType: 'agent_to_agent', label: 'Agent to BuildOS chat' });
	}

	function goToProjectHub() {
		selectedView = 'projectHub';
	}

	function selectProjectCreate() {
		dispatch('select', { contextType: 'project_create', label: 'New project flow' });
	}

	function selectBraindump() {
		dispatch('select', { contextType: 'brain_dump', label: 'Braindump' });
	}

	function showProjectSelection() {
		selectedView = 'project-selection';
	}

	// Project selection
	function selectProject(project: OntologyProjectSummary) {
		dispatch('select', {
			contextType: 'project',
			entityId: project.id,
			label: project.name
		});
	}

	function backToPrimary() {
		selectedView = 'primary';
	}

	function backToProjectHub() {
		selectedView = 'projectHub';
	}

	// Public function for parent to trigger back navigation
	export function handleBackNavigation() {
		if (selectedView === 'project-selection') {
			backToProjectHub();
		} else if (selectedView === 'projectHub') {
			backToPrimary();
		}
	}

	function formatKeyLabel(value?: string | null) {
		if (!value) return '';
		return value
			.split(/[._]/)
			.filter(Boolean)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	function getFacetSummary(project: OntologyProjectSummary) {
		return [project.facetContext, project.facetScale, project.facetStage]
			.filter(Boolean)
			.map((value) => formatKeyLabel(value))
			.join(' • ');
	}

	const activeProjects = $derived(
		projects.filter((project) => {
			const state = project.stateKey?.toLowerCase();
			return !state || !INACTIVE_PROJECT_STATE_KEYS.has(state);
		})
	);
	const hasProjects = $derived(projects.length > 0);
</script>

<div
	class="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50/70 dark:bg-slate-900/40 {inModal
		? 'max-h-[70vh] min-h-[500px]'
		: ''}"
>
	<!-- PRIMARY SELECTION VIEW -->
	{#if selectedView === 'primary'}
		<div class="mx-auto w-full max-w-5xl flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
			<!-- Header -->
			<div class="mb-6 text-center">
				<h2
					class="mb-1.5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white"
				>
					How would you like to work today?
				</h2>
				<p class="text-sm text-slate-600 dark:text-slate-400">
					Pick a focus and we'll tailor the assistant around it.
				</p>
			</div>

			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<!-- Global conversation -->
				<button
					onclick={selectGlobal}
					class="group flex h-full flex-col gap-3 rounded-xl border border-slate-200/60 bg-gradient-to-br from-blue-50/70 via-slate-50/40 to-white/80 dither-soft dither-fade-hover p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300/60 hover:shadow-md active:translate-y-0 dark:border-slate-700/60 dark:from-slate-900/80 dark:via-slate-900/50 dark:to-slate-900/70 dark:hover:border-blue-500/60"
				>
					<div
						class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/10 via-sky-400/10 to-indigo-500/10 dither-subtle text-blue-600 transition-transform duration-200 group-hover:scale-105 dark:text-blue-300"
					>
						<Globe class="h-5 w-5" />
					</div>
					<div class="flex-1 space-y-1">
						<h3 class="text-sm font-semibold text-slate-900 dark:text-white">
							Global conversation
						</h3>
						<p class="text-xs text-slate-600 dark:text-slate-400 leading-snug">
							Talk across projects, calendar, and knowledge with no preset scope.
						</p>
					</div>
					<div
						class="flex items-center justify-between text-xs font-medium text-blue-600 dark:text-blue-400"
					>
						<span>Open conversation</span>
						<ChevronRight
							class="h-4 w-4 transition-transform group-hover:translate-x-1"
						/>
					</div>
				</button>

				<!-- Agent to BuildOS chat -->
				<button
					onclick={selectAgentToAgent}
					class="group flex h-full flex-col gap-3 rounded-xl border border-slate-200/60 bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-white/80 dither-soft dither-fade-hover p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300/60 hover:shadow-md active:translate-y-0 dark:border-slate-700/60 dark:from-slate-900/80 dark:via-slate-900/50 dark:to-slate-900/70 dark:hover:border-indigo-500/60"
				>
					<div
						class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/10 via-violet-400/10 to-fuchsia-500/10 dither-subtle text-indigo-600 transition-transform duration-200 group-hover:scale-105 dark:text-indigo-300"
					>
						<Sparkles class="h-5 w-5" />
					</div>
					<div class="flex-1 space-y-1">
						<h3 class="text-sm font-semibold text-slate-900 dark:text-white">
							Agent to BuildOS chat
						</h3>
						<p class="text-xs text-slate-600 dark:text-slate-400 leading-snug">
							Hand the BuildOS chat to another AI agent with a clear goal.
						</p>
					</div>
					<div
						class="flex items-center justify-between text-xs font-medium text-indigo-600 dark:text-indigo-400"
					>
						<span>Agent-to-BuildOS</span>
						<ChevronRight
							class="h-4 w-4 transition-transform group-hover:translate-x-1"
						/>
					</div>
				</button>

				<!-- Projects workspace -->
				<button
					onclick={goToProjectHub}
					class="group flex h-full flex-col gap-3 rounded-xl border border-slate-200/60 bg-gradient-to-br from-emerald-50/70 via-teal-50/40 to-white/80 dither-soft dither-fade-hover p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300/60 hover:shadow-md active:translate-y-0 dark:border-slate-700/60 dark:from-slate-900/80 dark:via-slate-900/50 dark:to-slate-900/70 dark:hover:border-emerald-500/60"
				>
					<div
						class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/10 via-teal-400/10 to-lime-500/10 dither-subtle text-emerald-600 transition-transform duration-200 group-hover:scale-105 dark:text-emerald-300"
					>
						<FolderOpen class="h-5 w-5" />
					</div>
					<div class="flex-1 space-y-1">
						<h3 class="text-sm font-semibold text-slate-900 dark:text-white">
							Projects workspace
						</h3>
						<p class="text-xs text-slate-600 dark:text-slate-400 leading-snug">
							Start something new or dive into an existing project with focused tools.
						</p>
					</div>
					<div
						class="flex items-center justify-between text-xs font-medium text-emerald-600 dark:text-emerald-400"
					>
						<span>Project flows</span>
						<ChevronRight
							class="h-4 w-4 transition-transform group-hover:translate-x-1"
						/>
					</div>
				</button>

				<!-- Braindump -->
				<button
					onclick={selectBraindump}
					class="group flex h-full flex-col gap-3 rounded-xl border border-slate-200/60 bg-gradient-to-br from-violet-50/70 via-purple-50/40 to-white/80 dither-soft dither-fade-hover p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-300/60 hover:shadow-md active:translate-y-0 dark:border-slate-700/60 dark:from-slate-900/80 dark:via-slate-900/50 dark:to-slate-900/70 dark:hover:border-violet-500/60"
				>
					<div
						class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/10 via-purple-400/10 to-fuchsia-500/10 dither-subtle text-violet-600 transition-transform duration-200 group-hover:scale-105 dark:text-violet-300"
					>
						<Lightbulb class="h-5 w-5" />
					</div>
					<div class="flex-1 space-y-1">
						<h3 class="text-sm font-semibold text-slate-900 dark:text-white">
							Braindump
						</h3>
						<p class="text-xs text-slate-600 dark:text-slate-400 leading-snug">
							Capture raw thoughts, then save them or explore with AI as a thought
							partner.
						</p>
					</div>
					<div
						class="flex items-center justify-between text-xs font-medium text-violet-600 dark:text-violet-400"
					>
						<span>Capture thoughts</span>
						<ChevronRight
							class="h-4 w-4 transition-transform group-hover:translate-x-1"
						/>
					</div>
				</button>
			</div>

			{#if hasProjects}
				<div
					class="mt-6 flex items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-400"
				>
					<div class="flex items-center gap-2">
						<div class="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
						<span>{activeProjects.length} projects ready for deep work</span>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- PROJECT HUB VIEW -->
	{#if selectedView === 'projectHub'}
		<div class="flex h-full min-h-0 flex-col">
			<div
				class="border-b border-slate-200/60 bg-white/80 p-4 sm:p-5 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/80"
			>
				<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Project flow</h2>
				<p class="text-xs text-slate-600 dark:text-slate-400">
					Choose whether you're starting fresh or advancing an existing project.
				</p>
			</div>
			<div class="mx-auto w-full max-w-4xl flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
				<div class="grid gap-4 sm:grid-cols-2">
					<button
						onclick={selectProjectCreate}
						class="group flex h-full flex-col gap-3 rounded-xl border border-slate-200/60 bg-gradient-to-br from-purple-50/70 via-fuchsia-50/40 to-white/85 dither-soft dither-fade-hover p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-300/60 hover:shadow-md active:translate-y-0 dark:border-slate-700/60 dark:from-slate-900/85 dark:via-slate-900/55 dark:to-slate-900/75 dark:hover:border-purple-500/60"
					>
						<div
							class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/15 via-pink-400/10 to-violet-500/15 dither-subtle text-purple-600 transition-transform duration-200 group-hover:scale-105 dark:text-purple-300"
						>
							<Plus class="h-5 w-5" />
						</div>
						<div class="flex-1 space-y-1">
							<h3 class="text-sm font-semibold text-slate-900 dark:text-white">
								Create a new project
							</h3>
							<p class="text-xs text-slate-600 dark:text-slate-400 leading-snug">
								Guided discovery to capture goals, milestones, and structure.
							</p>
						</div>
						<div
							class="flex items-center justify-between text-xs font-medium text-purple-600 dark:text-purple-400"
						>
							<span>10-minute setup</span>
							<ChevronRight
								class="h-4 w-4 transition-transform group-hover:translate-x-1"
							/>
						</div>
					</button>

					<button
						onclick={showProjectSelection}
						disabled={isLoadingProjects || !hasProjects}
						class="group flex h-full flex-col gap-3 rounded-xl border border-slate-200/60 bg-gradient-to-br from-slate-50/80 via-slate-50/40 to-white/85 dither-soft dither-fade-hover p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300/60 hover:shadow-md active:translate-y-0 disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none dark:border-slate-700/60 dark:from-slate-900/85 dark:via-slate-900/55 dark:to-slate-900/75 dark:hover:border-emerald-500/60"
					>
						<div
							class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/15 via-teal-400/10 to-lime-500/15 dither-subtle text-emerald-600 transition-transform duration-200 group-hover:scale-105 dark:text-emerald-300"
						>
							{#if isLoadingProjects}
								<Loader2 class="h-5 w-5 animate-spin" />
							{:else}
								<FolderOpen class="h-5 w-5" />
							{/if}
						</div>
						<div class="flex-1 space-y-1">
							<h3 class="text-sm font-semibold text-slate-900 dark:text-white">
								Work with an existing project
							</h3>
							<p class="text-xs text-slate-600 dark:text-slate-400 leading-snug">
								Select a project, then choose whether to update, audit, or forecast
								it.
							</p>
						</div>
						<div
							class="flex items-center justify-between text-xs font-medium text-emerald-600 dark:text-emerald-400"
						>
							<span
								>{#if hasProjects}{activeProjects.length} ready projects{:else}No
									ontology projects yet{/if}</span
							>
							<ChevronRight
								class="h-4 w-4 transition-transform group-hover:translate-x-1"
							/>
						</div>
					</button>
				</div>

				{#if projectsError}
					<Card
						variant="elevated"
						class="mt-6 border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20"
					>
						<CardBody padding="md">
							<p class="text-sm text-rose-700 dark:text-rose-300" role="alert">
								{projectsError}
							</p>
						</CardBody>
					</Card>
				{/if}
			</div>
		</div>
	{/if}

	<!-- PROJECT SELECTION VIEW -->
	{#if selectedView === 'project-selection'}
		<div class="flex h-full min-h-0 flex-col">
			<!-- Header -->
			<div
				class="border-b border-slate-200/60 bg-white/80 p-4 sm:p-5 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/80"
			>
				<h2 class="text-lg font-semibold text-slate-900 dark:text-white">
					Select a Project
				</h2>
				<p class="text-xs text-slate-600 dark:text-slate-400">
					Choose which project to work with
				</p>
			</div>

			<!-- Projects List -->
			<div class="mx-auto w-full max-w-4xl flex-1 min-h-0 overflow-y-auto p-4">
				{#if isLoadingProjects}
					<div class="flex items-center justify-center py-16">
						<Loader2 class="h-8 w-8 animate-spin text-slate-400" />
					</div>
				{:else if projectsError}
					<div class="flex flex-col items-center justify-center py-16 text-center">
						<p class="mb-4 text-sm text-red-600 dark:text-red-400">{projectsError}</p>
						<button
							onclick={() => loadProjects()}
							class="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
						>
							Try again
						</button>
					</div>
				{:else if activeProjects.length > 0}
					<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{#each activeProjects as project (project.id)}
							{@const facetSummary = getFacetSummary(project)}
							<button
								onclick={() => selectProject(project)}
								class="group flex flex-col rounded-xl border border-slate-200/60 bg-gradient-to-br from-white/80 via-slate-50/40 to-white/70 dither-soft dither-fade-hover p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300/70 hover:shadow-lg active:translate-y-0 dark:border-slate-700/60 dark:from-slate-900/80 dark:via-slate-900/50 dark:to-slate-900/70 dark:hover:border-slate-600/70"
							>
								<div class="mb-3 flex items-start justify-between">
									<h3
										class="flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white"
										title={project.name}
									>
										{project.name}
									</h3>
									<ChevronRight
										class="h-4 w-4 flex-shrink-0 text-slate-400 dark:text-slate-500"
									/>
								</div>
								{#if project.stateKey || project.typeKey}
									<div
										class="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400"
									>
										{#if project.stateKey}
											<span
												class="rounded-full border border-slate-200 px-2 py-0.5 dark:border-slate-600"
											>
												{formatKeyLabel(project.stateKey)}
											</span>
										{/if}
										{#if project.typeKey}
											<span>{formatKeyLabel(project.typeKey)}</span>
										{/if}
									</div>
								{/if}
								{#if facetSummary}
									<p class="mb-2 text-xs text-slate-500 dark:text-slate-400">
										{facetSummary}
									</p>
								{/if}
								{#if project.description}
									<p
										class="mb-3 line-clamp-2 text-xs text-slate-600 dark:text-slate-400"
									>
										{project.description}
									</p>
								{/if}
								{#if project.taskCount > 0 || project.outputCount > 0}
									<div
										class="mt-auto border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
									>
										{#if project.taskCount > 0}
											<span>
												{project.taskCount} task{project.taskCount !== 1
													? 's'
													: ''}
											</span>
										{/if}
										{#if project.taskCount > 0 && project.outputCount > 0}
											<span class="mx-2 text-slate-400">•</span>
										{/if}
										{#if project.outputCount > 0}
											<span>
												{project.outputCount} output
												{project.outputCount !== 1 ? 's' : ''}
											</span>
										{/if}
									</div>
								{/if}
							</button>
						{/each}
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center py-16 text-center">
						<div
							class="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
						>
							<FolderOpen class="h-10 w-10 text-slate-400 dark:text-slate-500" />
						</div>
						<h3 class="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
							No Ontology Projects
						</h3>
						<p class="max-w-xs text-sm text-slate-600 dark:text-slate-400">
							Instantiate your first ontology project to get started
						</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	/* Scrollbar styling */
	.overflow-y-auto {
		scrollbar-width: thin;
		scrollbar-color: theme('colors.slate.300') transparent;
	}

	.overflow-y-auto::-webkit-scrollbar {
		width: 8px;
	}

	.overflow-y-auto::-webkit-scrollbar-track {
		background: transparent;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb {
		background: theme('colors.slate.300');
		border-radius: 4px;
	}

	:global(.dark) .overflow-y-auto {
		scrollbar-color: theme('colors.slate.600') transparent;
	}

	:global(.dark) .overflow-y-auto::-webkit-scrollbar-thumb {
		background: theme('colors.slate.600');
	}

	/* Line clamp utility */
	.line-clamp-2 {
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
</style>
