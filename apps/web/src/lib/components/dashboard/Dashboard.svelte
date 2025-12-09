<!-- apps/web/src/lib/components/dashboard/Dashboard.svelte -->
<!-- Projects-focused dashboard with AgentChatModal integration -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Plus,
		FolderOpen,
		Loader2,
		AlertTriangle,
		ChevronRight,
		Sparkles
	} from 'lucide-svelte';
	import { formatFullDate } from '$lib/utils/date-utils';
	import { getProjectStateBadgeClass } from '$lib/utils/ontology-badge-styles';
	import Button from '$lib/components/ui/Button.svelte';

	// Types
	interface OntologyProjectSummary {
		id: string;
		name: string;
		description: string | null;
		type_key: string;
		state_key: string;
		facet_context: string | null;
		facet_scale: string | null;
		facet_stage: string | null;
		created_at: string;
		updated_at: string;
		task_count: number;
		output_count: number;
	}

	interface User {
		id: string;
		email?: string;
		name?: string;
		is_admin?: boolean;
	}

	// Props
	type Props = {
		user: User;
	};

	let { user }: Props = $props();

	// State
	let projects = $state<OntologyProjectSummary[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let showChatModal = $state(false);
	let AgentChatModal = $state<any>(null);

	// Computed
	const displayName = $derived(user?.name || user?.email?.split('@')[0] || 'there');
	const hasProjects = $derived(projects.length > 0);

	// Load projects on mount
	onMount(async () => {
		await loadProjects();
	});

	async function loadProjects() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch('/api/onto/projects', {
				method: 'GET',
				credentials: 'same-origin',
				headers: {
					Accept: 'application/json'
				}
			});

			const payload = await response.json();

			if (!response.ok || payload?.success === false) {
				error = payload?.error || 'Failed to load projects';
				projects = [];
				return;
			}

			const fetchedProjects = payload?.data?.projects ?? payload?.projects ?? [];
			projects = fetchedProjects;
		} catch (err) {
			console.error('Failed to load projects:', err);
			error = 'Failed to load projects. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	async function handleCreateProject() {
		// Lazy load the AgentChatModal
		if (!AgentChatModal) {
			try {
				const module = await import('$lib/components/agent/AgentChatModal.svelte');
				AgentChatModal = module.default;
			} catch (err) {
				console.error('Failed to load AgentChatModal:', err);
				return;
			}
		}
		showChatModal = true;
	}

	function handleChatClose() {
		showChatModal = false;
		// Refresh projects after modal closes in case a new project was created
		loadProjects();
	}
</script>

<main class="min-h-screen bg-background transition-colors">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 max-w-7xl">
		<!-- Header Section -->
		<header class="mb-6 sm:mb-8">
			<h1
				class="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-2 tracking-tight"
			>
				Welcome back, {displayName}
			</h1>
			<p class="text-sm sm:text-base text-muted-foreground font-medium">
				<time datetime={new Date().toISOString()}>
					{formatFullDate(new Date())}
				</time>
			</p>
		</header>

		<!-- Error State -->
		{#if error}
			<div
				class="mb-6 bg-card rounded-lg p-6 border border-border shadow-ink tx tx-static tx-weak"
			>
				<div class="text-center">
					<AlertTriangle class="h-8 w-8 text-red-500 mx-auto mb-3" />
					<p class="text-red-600 dark:text-red-400 mb-4">{error}</p>
					<Button onclick={loadProjects} variant="primary" size="sm">Try Again</Button>
				</div>
			</div>
		{/if}

		<!-- Loading State -->
		{#if isLoading}
			<div class="bg-card rounded-lg shadow-ink p-8 sm:p-12 tx tx-frame tx-weak">
				<div class="flex flex-col items-center justify-center">
					<Loader2 class="h-10 w-10 text-accent animate-spin mb-4" />
					<p class="text-muted-foreground">Loading your projects...</p>
				</div>
			</div>
		{:else}
			<!-- Projects Grid -->
			<section class="space-y-6">
				<!-- Section Header -->
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<div class="p-2 bg-accent/10 rounded-lg border border-accent/30">
							<FolderOpen class="h-5 w-5 text-accent" />
						</div>
						<h2 class="text-xl font-bold text-foreground">Your Projects</h2>
					</div>
					{#if hasProjects}
						<Button
							variant="primary"
							size="sm"
							onclick={handleCreateProject}
							class="pressable"
						>
							<Plus class="h-4 w-4 mr-2" />
							New Project
						</Button>
					{/if}
				</div>

				<!-- Projects Grid -->
				<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
					<!-- Create New Project Card (shown first or as only card when empty) -->
					{#if !hasProjects}
						<!-- Empty State - Large Create Card -->
						<div
							class="col-span-full rounded-lg border-2 border-dashed border-border bg-card p-8 sm:p-12 text-center shadow-ink tx tx-bloom tx-weak"
						>
							<div
								class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent"
							>
								<Sparkles class="h-8 w-8" />
							</div>
							<h3 class="text-xl font-bold text-foreground mb-2">
								Create Your First Project
							</h3>
							<p class="text-muted-foreground mb-6 max-w-md mx-auto">
								Start by telling our AI assistant about your project. Describe your
								goals, tasks, and timeline - we'll help you organize everything.
							</p>
							<Button
								variant="primary"
								size="lg"
								onclick={handleCreateProject}
								class="pressable"
							>
								<Plus class="h-5 w-5 mr-2" />
								Create Project
							</Button>
						</div>
					{:else}
						<!-- Create New Project Card (compact version in grid) -->
						<button
							onclick={handleCreateProject}
							class="group flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-card/50 p-6 shadow-ink transition-all duration-200 hover:border-accent hover:bg-accent/5 pressable min-h-[200px]"
						>
							<div
								class="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent transition-all group-hover:bg-accent group-hover:text-accent-foreground"
							>
								<Plus class="h-6 w-6" />
							</div>
							<span
								class="text-sm font-bold text-muted-foreground group-hover:text-foreground"
							>
								Create New Project
							</span>
						</button>

						<!-- Project Cards -->
						{#each projects as project (project.id)}
							<a
								href="/projects/{project.id}"
								class="group relative flex flex-col rounded-lg border border-border bg-card p-4 shadow-ink transition-all duration-200 hover:border-accent hover:shadow-ink-strong pressable tx tx-frame tx-weak"
							>
								<!-- Header -->
								<div class="mb-3 flex items-start justify-between gap-3">
									<h3
										class="text-lg font-bold text-foreground truncate transition-colors group-hover:text-accent"
									>
										{project.name}
									</h3>
									<span
										class="flex-shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold capitalize {getProjectStateBadgeClass(
											project.state_key
										)}"
									>
										{project.state_key}
									</span>
								</div>

								<!-- Description -->
								{#if project.description}
									<p
										class="mb-3 line-clamp-2 text-sm text-muted-foreground flex-1"
									>
										{project.description}
									</p>
								{:else}
									<p class="mb-3 text-sm text-muted-foreground/50 italic flex-1">
										No description
									</p>
								{/if}

								<!-- Facets (metadata tags) -->
								{#if project.facet_context || project.facet_scale || project.facet_stage}
									<div class="mb-3 flex flex-wrap gap-2">
										{#if project.facet_context}
											<span
												class="rounded-lg border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent"
											>
												{project.facet_context}
											</span>
										{/if}
										{#if project.facet_scale}
											<span
												class="rounded-lg border border-muted-foreground/30 bg-muted/30 px-2 py-0.5 text-xs font-bold text-muted-foreground"
											>
												{project.facet_scale}
											</span>
										{/if}
										{#if project.facet_stage}
											<span
												class="rounded-lg border border-foreground/20 bg-muted/50 px-2 py-0.5 text-xs font-bold text-foreground/80"
											>
												{project.facet_stage}
											</span>
										{/if}
									</div>
								{/if}

								<!-- Footer Stats -->
								<div
									class="mt-auto flex items-center justify-between border-t border-border pt-3 text-sm text-muted-foreground"
								>
									<div class="flex items-center gap-3">
										<span class="flex items-center gap-1.5" title="Tasks">
											<svg
												class="h-4 w-4"
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
											<span class="font-bold">{project.task_count}</span>
										</span>
										<span class="flex items-center gap-1.5" title="Outputs">
											<svg
												class="h-4 w-4"
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
											<span class="font-bold">{project.output_count}</span>
										</span>
									</div>
									<div
										class="flex items-center gap-1 text-xs text-muted-foreground/70"
									>
										<span
											>{new Date(
												project.updated_at
											).toLocaleDateString()}</span
										>
										<ChevronRight
											class="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100"
										/>
									</div>
								</div>
							</a>
						{/each}
					{/if}
				</div>
			</section>
		{/if}
	</div>
</main>

<!-- Agent Chat Modal for Project Creation -->
{#if AgentChatModal && showChatModal}
	<AgentChatModal isOpen={showChatModal} contextType="project_create" onClose={handleChatClose} />
{/if}
