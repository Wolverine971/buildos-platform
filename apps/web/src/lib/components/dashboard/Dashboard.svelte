<!-- apps/web/src/lib/components/dashboard/Dashboard.svelte -->
<!-- Projects-focused dashboard with AgentChatModal integration -->
<!--
  PERFORMANCE OPTIMIZATIONS (Dec 2024):
  - Projects loaded server-side and passed via initialProjects prop
  - No client-side fetch on mount (eliminates ~200-500ms latency)
  - Manual refresh only triggered by user action or modal close

  SKELETON LOADING (Dec 2024):
  - projectCount passed immediately for instant skeleton rendering
  - Skeletons hydrate gracefully when full project data arrives
  - Zero layout shift - exact number of cards rendered from start
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		Plus,
		FolderOpen,
		LoaderCircle,
		AlertTriangle,
		Sparkles,
		Calendar,
		ArrowRight
	} from 'lucide-svelte';
	import { formatFullDate } from '$lib/utils/date-utils';
	import Button from '$lib/components/ui/Button.svelte';
	import DashboardBriefWidget from './DashboardBriefWidget.svelte';
	import { setNavigationData } from '$lib/stores/project-navigation.store';
	import ProjectIcon from '$lib/components/project/ProjectIcon.svelte';
	import type { DailyBrief } from '$lib/types/daily-brief';
	import type { DataMutationSummary } from '$lib/components/agent/agent-chat.types';
	import { briefChatSessionStore } from '$lib/stores/briefChatSession.store';

	// Types
	interface OntologyProjectSummary {
		id: string;
		name: string;
		description: string | null;
		icon_svg: string | null;
		icon_concept: string | null;
		icon_generated_at: string | null;
		icon_generation_source: 'auto' | 'manual' | null;
		icon_generation_prompt: string | null;
		type_key: string;
		state_key: string;
		facet_context: string | null;
		facet_scale: string | null;
		facet_stage: string | null;
		created_at: string;
		updated_at: string;
		task_count: number;
		goal_count: number;
		plan_count: number;
		document_count: number;
		owner_actor_id: string;
		access_role: 'owner' | 'editor' | 'viewer' | null;
		access_level: 'read' | 'write' | 'admin' | null;
		is_shared: boolean;
		// Next step fields
		next_step_short: string | null;
		next_step_long: string | null;
		next_step_source: 'ai' | 'user' | null;
		next_step_updated_at: string | null;
	}

	interface User {
		id: string;
		email?: string;
		name?: string | null;
		is_admin?: boolean;
		timezone?: string | null;
	}

	// Props - OPTIMIZATION: Projects now passed from server with count for skeleton rendering
	type Props = {
		user: User;
		initialProjects?: OntologyProjectSummary[];
		isLoadingProjects?: boolean;
		projectCount?: number; // For instant skeleton rendering
		onrefresh?: () => void;
	};

	let {
		user,
		initialProjects = [],
		isLoadingProjects = false,
		projectCount = 0,
		onrefresh: _onrefresh
	}: Props = $props();

	// State - simplified to avoid prop-to-state syncing anti-pattern
	let error = $state<string | null>(null);
	let showChatModal = $state(false);
	let AgentChatModal = $state<any>(null);
	let isRefreshing = $state(false);

	// Brief modal state
	let showBriefModal = $state(false);
	let selectedBrief = $state<DailyBrief | null>(null);
	let DailyBriefModal = $state<any>(null);

	// Brief chat modal state
	let showBriefChatModal = $state(false);
	let briefChatBrief = $state<DailyBrief | null>(null);
	let briefChatSessionId = $state<string | null>(null);
	let BriefChatModal = $state<any>(null);

	// Local projects state for refresh functionality
	let localProjects = $state<OntologyProjectSummary[] | null>(null);

	// Use derived to merge initial props with local refresh data
	// This avoids the anti-pattern of syncing props to state in $effect
	const projects = $derived(localProjects ?? initialProjects);
	const isLoading = $derived(localProjects === null && isLoadingProjects);

	// Computed
	const displayName = $derived(user?.name ?? user?.email?.split('@')[0] ?? 'there');
	const hasProjects = $derived(projects.length > 0 || projectCount > 0);
	const ownedProjects = $derived(projects.filter((project) => !project.is_shared));
	const sharedProjects = $derived(projects.filter((project) => project.is_shared));
	const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

	type ProjectRecencyGroups = {
		recent: OntologyProjectSummary[];
		olderThan7Days: OntologyProjectSummary[];
		olderThan30Days: OntologyProjectSummary[];
	};

	function parseProjectUpdatedAt(project: OntologyProjectSummary): number {
		const timestamp = Date.parse(project.updated_at);
		return Number.isNaN(timestamp) ? 0 : timestamp;
	}

	function sortProjectsByUpdatedAt(
		projectList: OntologyProjectSummary[]
	): OntologyProjectSummary[] {
		return [...projectList].sort((a, b) => parseProjectUpdatedAt(b) - parseProjectUpdatedAt(a));
	}

	function groupProjectsByRecency(projectList: OntologyProjectSummary[]): ProjectRecencyGroups {
		const now = Date.now();
		const recent: OntologyProjectSummary[] = [];
		const olderThan7Days: OntologyProjectSummary[] = [];
		const olderThan30Days: OntologyProjectSummary[] = [];

		for (const project of projectList) {
			const updatedAtMs = parseProjectUpdatedAt(project);
			const ageDays =
				updatedAtMs > 0 ? (now - updatedAtMs) / MILLIS_PER_DAY : Number.POSITIVE_INFINITY;

			if (ageDays >= 30) {
				olderThan30Days.push(project);
				continue;
			}

			if (ageDays >= 7) {
				olderThan7Days.push(project);
				continue;
			}

			recent.push(project);
		}

		return {
			recent,
			olderThan7Days,
			olderThan30Days
		};
	}

	const ownedProjectsSorted = $derived(sortProjectsByUpdatedAt(ownedProjects));
	const sharedProjectsSorted = $derived(sortProjectsByUpdatedAt(sharedProjects));
	const ownedProjectsByRecency = $derived(groupProjectsByRecency(ownedProjectsSorted));
	const sharedProjectsByRecency = $derived(groupProjectsByRecency(sharedProjectsSorted));

	// SKELETON LOADING: Calculate how many skeletons to show while loading
	// Use projectCount for initial render, then actual projects once loaded
	const skeletonCount = $derived(isLoading ? projectCount : 0);
	const showSkeletons = $derived(isLoading && projectCount > 0);

	function formatUpdatedAt(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Updated recently';

		return date.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatEntityCounts(project: OntologyProjectSummary): string {
		return `Tasks ${project.task_count} · Goals ${project.goal_count} · Plans ${project.plan_count} · Docs ${project.document_count}`;
	}

	/**
	 * Set navigation data before navigating to project detail.
	 * This enables instant skeleton rendering with accurate counts.
	 */
	function handleProjectClick(project: OntologyProjectSummary) {
		setNavigationData({
			id: project.id,
			name: project.name,
			description: project.description,
			icon_svg: project.icon_svg,
			icon_concept: project.icon_concept,
			icon_generated_at: project.icon_generated_at,
			icon_generation_source: project.icon_generation_source,
			icon_generation_prompt: project.icon_generation_prompt,
			state_key: project.state_key,
			next_step_short: project.next_step_short,
			next_step_long: project.next_step_long,
			next_step_source: project.next_step_source,
			next_step_updated_at: project.next_step_updated_at,
			task_count: project.task_count,
			document_count: project.document_count,
			goal_count: project.goal_count,
			plan_count: project.plan_count,
			milestone_count: 0, // Not available in summary, default to 0
			risk_count: 0 // Not available in summary, default to 0
		});
	}

	// OPTIMIZATION: Manual refresh only (not on mount)
	async function refreshProjects() {
		isRefreshing = true;
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
				return;
			}

			const fetchedProjects = payload?.data?.projects ?? payload?.projects ?? [];
			localProjects = fetchedProjects;
		} catch (err) {
			console.error('Failed to refresh projects:', err);
			error = 'Failed to refresh projects. Please try again.';
		} finally {
			isRefreshing = false;
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

	function handleOpenCalendar() {
		goto('/dashboard/calendar');
	}

	function handleChatClose() {
		showChatModal = false;
		// Refresh projects after modal closes in case a new project was created
		refreshProjects();
	}

	async function handleViewBrief(brief: DailyBrief) {
		// Lazy load the DailyBriefModal
		if (!DailyBriefModal) {
			try {
				const module = await import('$lib/components/briefs/DailyBriefModal.svelte');
				DailyBriefModal = module.default;
			} catch (err) {
				console.error('Failed to load DailyBriefModal:', err);
				return;
			}
		}
		selectedBrief = brief;
		showBriefModal = true;
	}

	function handleBriefModalClose() {
		showBriefModal = false;
		selectedBrief = null;
	}

	async function handleBriefChat(brief: DailyBrief) {
		// Close the brief modal first to avoid stacking
		showBriefModal = false;

		// Lazy load BriefChatModal (two-pane brief + chat modal)
		if (!BriefChatModal) {
			try {
				const module = await import('$lib/components/briefs/BriefChatModal.svelte');
				BriefChatModal = module.default;
			} catch (err) {
				console.error('Failed to load BriefChatModal:', err);
				return;
			}
		}

		// Look up any existing session for this brief
		briefChatSessionId = briefChatSessionStore.get(brief.id);
		briefChatBrief = brief;
		showBriefChatModal = true;
	}

	function handleBriefChatClose(summary?: DataMutationSummary) {
		// Record session for future resumption
		if (briefChatBrief && summary?.sessionId) {
			briefChatSessionStore.set(briefChatBrief.id, summary.sessionId);
		}

		showBriefChatModal = false;

		// If mutations happened during chat, refresh dashboard data
		if (summary?.hasChanges) {
			refreshProjects();
		}

		briefChatBrief = null;
		briefChatSessionId = null;
	}
</script>

<main class="min-h-screen bg-background transition-colors rounded-md">
	<div class="container mx-auto px-2 sm:px-4 lg:px-6 py-2 sm:py-4 lg:py-6 max-w-7xl">
		<!-- Header Section - Compact with date & calendar top-right -->
		<header class="mb-2 sm:mb-3">
			<div class="flex items-start justify-between gap-2">
				<!-- Left: Greeting -->
				<h1
					class="text-lg sm:text-2xl lg:text-3xl font-bold text-foreground tracking-tight"
				>
					Hi, {displayName}
				</h1>

				<!-- Right: Date + Calendar -->
				<div class="flex items-center gap-1.5 sm:gap-2">
					<time
						datetime={new Date().toISOString()}
						class="text-[10px] sm:text-sm text-muted-foreground font-medium"
					>
						{formatFullDate(new Date())}
					</time>
					<button
						onclick={handleOpenCalendar}
						class="flex items-center gap-1 px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors pressable"
						aria-label="Open calendar"
					>
						<Calendar class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
						<span class="hidden sm:inline text-xs font-medium">Calendar</span>
					</button>
				</div>
			</div>
		</header>

		<!-- Daily Brief Widget -->
		<section class="mb-2 sm:mb-3">
			<DashboardBriefWidget {user} onviewbrief={handleViewBrief} />
		</section>

		<!-- Error State - card weight for important errors -->
		{#if error}
			<div class="mb-3 wt-card p-3 sm:p-4 tx tx-static tx-weak">
				<div class="flex items-center gap-3 sm:flex-col sm:text-center">
					<AlertTriangle class="h-5 w-5 sm:h-6 sm:w-6 text-red-500 shrink-0" />
					<p class="text-sm text-red-600 dark:text-red-400 flex-1">{error}</p>
					<Button
						onclick={refreshProjects}
						variant="primary"
						size="sm"
						disabled={isRefreshing}
						class="shrink-0"
					>
						{#if isRefreshing}
							<LoaderCircle class="h-3.5 w-3.5 mr-1.5 animate-spin" />
						{/if}
						Retry
					</Button>
				</div>
			</div>
		{/if}

		<!-- Projects Dossier -->
		<section class="space-y-2 sm:space-y-3">
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<div class="p-1 sm:p-1.5 bg-accent/10 rounded-md border border-accent/20">
						<FolderOpen class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent" />
					</div>
					<h2 class="text-sm sm:text-lg font-bold text-foreground">Projects</h2>
					{#if isLoading}
						<LoaderCircle
							class="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground animate-spin"
						/>
					{/if}
				</div>

				<button
					onclick={handleCreateProject}
					class="flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/5 px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold text-accent transition-colors hover:border-accent hover:bg-accent/10 pressable"
				>
					<Plus class="h-3 w-3 sm:h-3.5 sm:w-3.5" />
					New Project
				</button>
			</div>

			<!-- Loading State -->
			{#if showSkeletons}
				<div class="space-y-2 sm:space-y-3">
					{#each Array(Math.max(skeletonCount, 3)) as _, i (i)}
						<div class="wt-paper p-3 sm:p-4 animate-pulse">
							<div class="flex items-center justify-between gap-3">
								<div class="h-5 w-1/3 rounded-md bg-muted" />
								<div class="h-4 w-28 rounded-md bg-muted" />
							</div>
							<div class="mt-2 h-4 w-4/5 rounded-md bg-muted" />
							<div class="mt-2 h-3 w-full rounded-md bg-muted" />
						</div>
					{/each}
				</div>
			{:else if !hasProjects && !isLoading}
				<!-- Empty State -->
				<div class="wt-paper border-dashed p-4 sm:p-6 text-center tx tx-bloom tx-weak">
					<div
						class="mx-auto mb-3 sm:mb-4 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent"
					>
						<Sparkles class="h-5 w-5 sm:h-6 sm:w-6" />
					</div>
					<h3 class="text-sm sm:text-base font-bold text-foreground mb-1 sm:mb-1.5">
						Create Your First Project
					</h3>
					<p
						class="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4 max-w-sm mx-auto"
					>
						Tell our AI about your project - we'll help organize everything.
					</p>
					<Button
						variant="primary"
						size="sm"
						onclick={handleCreateProject}
						class="pressable"
					>
						<Plus class="h-3.5 w-3.5 mr-1" />
						Create Project
					</Button>
				</div>
			{:else}
				<div class="space-y-4 sm:space-y-5">
					<div class="space-y-2">
						<div class="flex items-center gap-1.5">
							<h3
								class="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide"
							>
								My Projects
							</h3>
							<span class="text-[10px] sm:text-xs text-muted-foreground/70">
								({ownedProjects.length})
							</span>
						</div>

						{#if ownedProjectsSorted.length > 0}
							<div class="space-y-2">
								{#each ownedProjectsByRecency.recent as project (project.id)}
									<a
										href="/projects/{project.id}"
										onclick={() => handleProjectClick(project)}
										class="project-dossier-row group block wt-paper p-3 sm:p-4 pressable tx tx-frame tx-weak"
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0 flex items-center gap-2.5">
												<ProjectIcon
													svg={project.icon_svg}
													concept={project.icon_concept}
													size="sm"
												/>
												<h4
													class="min-w-0 truncate text-base sm:text-xl font-semibold text-foreground tracking-tight"
													style="view-transition-name: project-title-{project.id}"
												>
													{project.name}
												</h4>
											</div>
											<div class="shrink-0 flex items-center gap-1.5">
												<time
													datetime={project.updated_at}
													class="text-[10px] sm:text-xs font-medium text-muted-foreground whitespace-nowrap text-right"
												>
													{formatUpdatedAt(project.updated_at)}
												</time>
												<ArrowRight
													class="project-dossier-arrow h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent"
													aria-hidden="true"
												/>
											</div>
										</div>

										<p
											class="mt-1 text-xs sm:text-sm text-muted-foreground truncate"
										>
											{project.description?.trim() ||
												'No description provided.'}
										</p>

										<p
											class="mt-1 text-[11px] sm:text-xs font-medium text-muted-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis"
										>
											{formatEntityCounts(project)}
										</p>
									</a>
								{/each}

								{#if ownedProjectsByRecency.olderThan7Days.length > 0}
									<div class="project-recency-separator">
										Not touched in last 7 days
									</div>
									{#each ownedProjectsByRecency.olderThan7Days as project (project.id)}
										<a
											href="/projects/{project.id}"
											onclick={() => handleProjectClick(project)}
											class="project-dossier-row group block wt-paper p-3 sm:p-4 pressable tx tx-frame tx-weak"
										>
											<div class="flex items-start justify-between gap-3">
												<div class="min-w-0 flex items-center gap-2.5">
													<ProjectIcon
														svg={project.icon_svg}
														concept={project.icon_concept}
														size="sm"
													/>
													<h4
														class="min-w-0 truncate text-base sm:text-xl font-semibold text-foreground tracking-tight"
														style="view-transition-name: project-title-{project.id}"
													>
														{project.name}
													</h4>
												</div>
												<div class="shrink-0 flex items-center gap-1.5">
													<time
														datetime={project.updated_at}
														class="text-[10px] sm:text-xs font-medium text-muted-foreground whitespace-nowrap text-right"
													>
														{formatUpdatedAt(project.updated_at)}
													</time>
													<ArrowRight
														class="project-dossier-arrow h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent"
														aria-hidden="true"
													/>
												</div>
											</div>

											<p
												class="mt-1 text-xs sm:text-sm text-muted-foreground truncate"
											>
												{project.description?.trim() ||
													'No description provided.'}
											</p>

											<p
												class="mt-1 text-[11px] sm:text-xs font-medium text-muted-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis"
											>
												{formatEntityCounts(project)}
											</p>
										</a>
									{/each}
								{/if}

								{#if ownedProjectsByRecency.olderThan30Days.length > 0}
									<div class="project-recency-separator">
										Not touched in last 30 days
									</div>
									{#each ownedProjectsByRecency.olderThan30Days as project (project.id)}
										<a
											href="/projects/{project.id}"
											onclick={() => handleProjectClick(project)}
											class="project-dossier-row group block wt-paper p-3 sm:p-4 pressable tx tx-frame tx-weak"
										>
											<div class="flex items-start justify-between gap-3">
												<div class="min-w-0 flex items-center gap-2.5">
													<ProjectIcon
														svg={project.icon_svg}
														concept={project.icon_concept}
														size="sm"
													/>
													<h4
														class="min-w-0 truncate text-base sm:text-xl font-semibold text-foreground tracking-tight"
														style="view-transition-name: project-title-{project.id}"
													>
														{project.name}
													</h4>
												</div>
												<div class="shrink-0 flex items-center gap-1.5">
													<time
														datetime={project.updated_at}
														class="text-[10px] sm:text-xs font-medium text-muted-foreground whitespace-nowrap text-right"
													>
														{formatUpdatedAt(project.updated_at)}
													</time>
													<ArrowRight
														class="project-dossier-arrow h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent"
														aria-hidden="true"
													/>
												</div>
											</div>

											<p
												class="mt-1 text-xs sm:text-sm text-muted-foreground truncate"
											>
												{project.description?.trim() ||
													'No description provided.'}
											</p>

											<p
												class="mt-1 text-[11px] sm:text-xs font-medium text-muted-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis"
											>
												{formatEntityCounts(project)}
											</p>
										</a>
									{/each}
								{/if}
							</div>
						{:else}
							<p class="text-xs sm:text-sm text-muted-foreground/70 italic">
								No owned projects yet.
							</p>
						{/if}
					</div>

					{#if sharedProjects.length > 0}
						<div class="space-y-2">
							<div class="flex items-center gap-1.5">
								<h3
									class="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide"
								>
									Shared with me
								</h3>
								<span class="text-[10px] sm:text-xs text-muted-foreground/70">
									({sharedProjects.length})
								</span>
							</div>

							<div class="space-y-2">
								{#each sharedProjectsByRecency.recent as project (project.id)}
									<a
										href="/projects/{project.id}"
										onclick={() => handleProjectClick(project)}
										class="project-dossier-row group block wt-paper p-3 sm:p-4 pressable tx tx-thread tx-weak"
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0 flex items-center gap-2.5">
												<ProjectIcon
													svg={project.icon_svg}
													concept={project.icon_concept}
													size="sm"
												/>
												<div class="min-w-0 flex items-center gap-2">
													<h4
														class="truncate text-base sm:text-xl font-semibold text-foreground tracking-tight"
														style="view-transition-name: project-title-{project.id}"
													>
														{project.name}
													</h4>
													<span
														class="hidden sm:inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold bg-accent/15 text-accent"
													>
														Shared{project.access_role
															? `: ${project.access_role}`
															: ''}
													</span>
												</div>
											</div>
											<div class="shrink-0 flex items-center gap-1.5">
												<time
													datetime={project.updated_at}
													class="text-[10px] sm:text-xs font-medium text-muted-foreground whitespace-nowrap text-right"
												>
													{formatUpdatedAt(project.updated_at)}
												</time>
												<ArrowRight
													class="project-dossier-arrow h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent"
													aria-hidden="true"
												/>
											</div>
										</div>

										<p
											class="mt-1 text-xs sm:text-sm text-muted-foreground truncate"
										>
											{project.description?.trim() ||
												'No description provided.'}
										</p>

										<p
											class="mt-1 text-[11px] sm:text-xs font-medium text-muted-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis"
										>
											{formatEntityCounts(project)}
										</p>
									</a>
								{/each}

								{#if sharedProjectsByRecency.olderThan7Days.length > 0}
									<div class="project-recency-separator">
										Not touched in last 7 days
									</div>
									{#each sharedProjectsByRecency.olderThan7Days as project (project.id)}
										<a
											href="/projects/{project.id}"
											onclick={() => handleProjectClick(project)}
											class="project-dossier-row group block wt-paper p-3 sm:p-4 pressable tx tx-thread tx-weak"
										>
											<div class="flex items-start justify-between gap-3">
												<div class="min-w-0 flex items-center gap-2.5">
													<ProjectIcon
														svg={project.icon_svg}
														concept={project.icon_concept}
														size="sm"
													/>
													<div class="min-w-0 flex items-center gap-2">
														<h4
															class="truncate text-base sm:text-xl font-semibold text-foreground tracking-tight"
															style="view-transition-name: project-title-{project.id}"
														>
															{project.name}
														</h4>
														<span
															class="hidden sm:inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold bg-accent/15 text-accent"
														>
															Shared{project.access_role
																? `: ${project.access_role}`
																: ''}
														</span>
													</div>
												</div>
												<div class="shrink-0 flex items-center gap-1.5">
													<time
														datetime={project.updated_at}
														class="text-[10px] sm:text-xs font-medium text-muted-foreground whitespace-nowrap text-right"
													>
														{formatUpdatedAt(project.updated_at)}
													</time>
													<ArrowRight
														class="project-dossier-arrow h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent"
														aria-hidden="true"
													/>
												</div>
											</div>

											<p
												class="mt-1 text-xs sm:text-sm text-muted-foreground truncate"
											>
												{project.description?.trim() ||
													'No description provided.'}
											</p>

											<p
												class="mt-1 text-[11px] sm:text-xs font-medium text-muted-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis"
											>
												{formatEntityCounts(project)}
											</p>
										</a>
									{/each}
								{/if}

								{#if sharedProjectsByRecency.olderThan30Days.length > 0}
									<div class="project-recency-separator">
										Not touched in last 30 days
									</div>
									{#each sharedProjectsByRecency.olderThan30Days as project (project.id)}
										<a
											href="/projects/{project.id}"
											onclick={() => handleProjectClick(project)}
											class="project-dossier-row group block wt-paper p-3 sm:p-4 pressable tx tx-thread tx-weak"
										>
											<div class="flex items-start justify-between gap-3">
												<div class="min-w-0 flex items-center gap-2.5">
													<ProjectIcon
														svg={project.icon_svg}
														concept={project.icon_concept}
														size="sm"
													/>
													<div class="min-w-0 flex items-center gap-2">
														<h4
															class="truncate text-base sm:text-xl font-semibold text-foreground tracking-tight"
															style="view-transition-name: project-title-{project.id}"
														>
															{project.name}
														</h4>
														<span
															class="hidden sm:inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold bg-accent/15 text-accent"
														>
															Shared{project.access_role
																? `: ${project.access_role}`
																: ''}
														</span>
													</div>
												</div>
												<div class="shrink-0 flex items-center gap-1.5">
													<time
														datetime={project.updated_at}
														class="text-[10px] sm:text-xs font-medium text-muted-foreground whitespace-nowrap text-right"
													>
														{formatUpdatedAt(project.updated_at)}
													</time>
													<ArrowRight
														class="project-dossier-arrow h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent"
														aria-hidden="true"
													/>
												</div>
											</div>

											<p
												class="mt-1 text-xs sm:text-sm text-muted-foreground truncate"
											>
												{project.description?.trim() ||
													'No description provided.'}
											</p>

											<p
												class="mt-1 text-[11px] sm:text-xs font-medium text-muted-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis"
											>
												{formatEntityCounts(project)}
											</p>
										</a>
									{/each}
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</section>
	</div>
</main>

<!-- Agent Chat Modal for Project Creation -->
{#if AgentChatModal && showChatModal}
	<AgentChatModal isOpen={showChatModal} contextType="project_create" onClose={handleChatClose} />
{/if}

<!-- Daily Brief Modal -->
{#if DailyBriefModal && showBriefModal}
	<DailyBriefModal
		isOpen={showBriefModal}
		brief={selectedBrief}
		briefDate={selectedBrief?.brief_date}
		onClose={handleBriefModalClose}
		onchat={handleBriefChat}
	/>
{/if}

<!-- Brief Chat Modal (two-pane: brief + chat) -->
{#if BriefChatModal && showBriefChatModal && briefChatBrief}
	<BriefChatModal
		isOpen={showBriefChatModal}
		brief={briefChatBrief}
		initialChatSessionId={briefChatSessionId}
		onClose={handleBriefChatClose}
	/>
{/if}

<style>
	.project-dossier-row {
		transition: box-shadow 180ms ease;
	}

	.project-dossier-row:hover,
	.project-dossier-row:focus-visible {
		box-shadow: inset 0 -1px 0 hsl(var(--accent) / 0.6);
	}

	.project-dossier-arrow {
		opacity: 0;
		transform: translateX(-2px);
		transition:
			opacity 180ms ease,
			transform 180ms ease;
	}

	.project-dossier-row:hover .project-dossier-arrow,
	.project-dossier-row:focus-visible .project-dossier-arrow {
		opacity: 1;
		transform: translateX(0);
	}

	.project-recency-separator {
		margin-top: 0.5rem;
		padding-top: 0.75rem;
		border-top: 1px solid hsl(var(--border));
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground) / 0.85);
	}
</style>
