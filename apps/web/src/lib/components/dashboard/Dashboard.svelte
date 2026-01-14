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
	import {
		Plus,
		FolderOpen,
		LoaderCircle,
		AlertTriangle,
		ChevronRight,
		Sparkles,
		ListChecks,
		Target,
		Calendar,
		FileText,
		RefreshCw
	} from 'lucide-svelte';
	import { formatFullDate } from '$lib/utils/date-utils';
	import { getProjectStateBadgeClass } from '$lib/utils/ontology-badge-styles';
	import Button from '$lib/components/ui/Button.svelte';
	import DashboardBriefWidget from './DashboardBriefWidget.svelte';
	import ProjectCardSkeleton from './ProjectCardSkeleton.svelte';
	import ProjectCardNextStep from '$lib/components/project/ProjectCardNextStep.svelte';
	import { setNavigationData } from '$lib/stores/project-navigation.store';
	import type { DailyBrief } from '$lib/types/daily-brief';

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
		onrefresh
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

	// SKELETON LOADING: Calculate how many skeletons to show while loading
	// Use projectCount for initial render, then actual projects once loaded
	const skeletonCount = $derived(isLoading ? projectCount : 0);
	const showSkeletons = $derived(isLoading && projectCount > 0);

	/**
	 * Set navigation data before navigating to project detail.
	 * This enables instant skeleton rendering with accurate counts.
	 */
	function handleProjectClick(project: OntologyProjectSummary) {
		setNavigationData({
			id: project.id,
			name: project.name,
			description: project.description,
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
</script>

<main class="min-h-screen bg-background transition-colors">
	<div class="container mx-auto px-2 sm:px-4 lg:px-6 py-2 sm:py-4 lg:py-6 max-w-7xl">
		<!-- Header Section - Compact on mobile -->
		<header class="mb-2 sm:mb-4">
			<!-- Mobile: Compact single line with name and date -->
			<div class="flex items-baseline justify-between gap-2 sm:block">
				<h1
					class="text-lg sm:text-3xl lg:text-4xl font-bold text-foreground tracking-tight"
				>
					Hi, {displayName}
				</h1>
				<p class="text-[10px] sm:text-base text-muted-foreground font-medium sm:mt-1">
					<time datetime={new Date().toISOString()}>
						{formatFullDate(new Date())}
					</time>
				</p>
			</div>
		</header>

		<!-- Daily Brief Widget -->
		<section class="mb-2 sm:mb-4">
			<DashboardBriefWidget {user} onviewbrief={handleViewBrief} />
		</section>

		<!-- Error State - card weight for important errors -->
		{#if error}
			<div
				class="mb-6 wt-card p-6 tx tx-static tx-weak"
			>
				<div class="text-center">
					<AlertTriangle class="h-8 w-8 text-red-500 mx-auto mb-3" />
					<p class="text-red-600 dark:text-red-400 mb-4">{error}</p>
					<Button
						onclick={refreshProjects}
						variant="primary"
						size="sm"
						disabled={isRefreshing}
					>
						{#if isRefreshing}
							<LoaderCircle class="h-4 w-4 mr-2 animate-spin" />
						{/if}
						Try Again
					</Button>
				</div>
			</div>
		{/if}

		<!-- Projects Grid - Always render structure, use skeletons or real cards -->
		<section class="space-y-2 sm:space-y-4">
			<!-- Mobile Create Button (compact) -->
			{#if hasProjects}
				<button
					onclick={handleCreateProject}
					class="sm:hidden w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-accent/50 bg-accent/5 py-2 text-xs font-bold text-accent transition-all duration-200 hover:border-accent hover:bg-accent/10 pressable"
				>
					<Plus class="h-3.5 w-3.5" />
					New Project
				</button>
			{/if}

			<!-- Section Header - More compact on mobile -->
			<div class="flex items-center gap-1.5 sm:gap-3">
				<div
					class="p-1 sm:p-2 bg-accent/10 rounded-md sm:rounded-lg border border-accent/20"
				>
					<FolderOpen class="h-3.5 w-3.5 sm:h-5 sm:w-5 text-accent" />
				</div>
				<h2 class="text-sm sm:text-xl font-bold text-foreground">Projects</h2>
				{#if isLoading}
					<LoaderCircle
						class="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground animate-spin"
					/>
				{/if}
			</div>

			<!-- Loading State with Skeletons -->
			{#if showSkeletons}
				<div class="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-4">
					<!-- Create New Project Card (skeleton placeholder on desktop) - ghost weight -->
					<div
						class="hidden sm:flex group flex-col items-center justify-center wt-ghost border-dashed p-4 sm:p-6 sm:min-h-[200px] opacity-50"
					>
						<div
							class="mb-3 sm:mb-4 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent"
						>
							<Plus class="h-5 w-5 sm:h-6 sm:w-6" />
						</div>
						<span class="text-xs sm:text-sm font-bold text-muted-foreground">
							Create New Project
						</span>
					</div>

					<!-- Skeleton Cards based on projectCount -->
					{#each Array(skeletonCount) as _, i (i)}
						<ProjectCardSkeleton />
					{/each}
				</div>
			{:else if !hasProjects && !isLoading}
				<!-- Empty State - Compact on mobile, paper weight with bloom texture -->
				<div
					class="wt-paper border-dashed p-6 sm:p-12 text-center tx tx-bloom tx-weak"
				>
					<div
						class="mx-auto mb-4 sm:mb-6 flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent"
					>
						<Sparkles class="h-6 w-6 sm:h-8 sm:w-8" />
					</div>
					<h3 class="text-base sm:text-xl font-bold text-foreground mb-1.5 sm:mb-2">
						Create Your First Project
					</h3>
					<p
						class="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6 max-w-md mx-auto"
					>
						Tell our AI about your project - we'll help organize everything.
					</p>
					<Button
						variant="primary"
						size="sm"
						onclick={handleCreateProject}
						class="pressable sm:!py-2.5 sm:!px-5"
					>
						<Plus class="h-4 w-4 mr-1.5" />
						Create Project
					</Button>
				</div>
			{:else}
				<div class="space-y-3 sm:space-y-4">
					<div class="space-y-2 sm:space-y-3">
						<h3 class="text-sm sm:text-base font-semibold text-foreground">
							My Projects
						</h3>
						<div class="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-4">
							<!-- Create New Project Card (hidden on mobile, shown on desktop) - ghost weight for CTA -->
							<button
								onclick={handleCreateProject}
								class="hidden sm:flex group flex-col items-center justify-center wt-ghost border-dashed p-4 sm:p-6 hover:border-accent hover:bg-accent/5 pressable sm:min-h-[200px]"
							>
								<div
									class="mb-3 sm:mb-4 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent transition-all group-hover:bg-accent group-hover:text-accent-foreground"
								>
									<Plus class="h-5 w-5 sm:h-6 sm:w-6" />
								</div>
								<span
									class="text-xs sm:text-sm font-bold text-muted-foreground group-hover:text-foreground"
								>
									Create New Project
								</span>
							</button>

							<!-- Owned Project Cards - paper weight with frame texture -->
							{#each ownedProjects as project (project.id)}
								<a
									href="/projects/{project.id}"
									onclick={() => handleProjectClick(project)}
									class="group relative flex flex-col wt-paper p-2 sm:p-4 hover:border-accent pressable tx tx-frame tx-weak"
								>
									<!-- Header - Mobile: Title + inline status, Desktop: Title + Badge -->
									<div
										class="mb-1 sm:mb-3 flex items-start justify-between gap-1 sm:gap-3"
									>
										<div class="flex-1 min-w-0">
											<h3
												class="text-xs sm:text-lg font-bold text-foreground line-clamp-2 transition-colors group-hover:text-accent leading-tight"
												style="view-transition-name: project-title-{project.id}"
											>
												{project.name}
											</h3>
											<!-- Mobile: Inline status under title -->
											<span
												class="sm:hidden inline-flex mt-1 items-center rounded-md px-1 py-0.5 text-[9px] font-bold capitalize {getProjectStateBadgeClass(
													project.state_key
												)}"
											>
												{project.state_key}
											</span>
										</div>
										<!-- Desktop: Status badge -->
										<span
											class="hidden sm:inline-flex flex-shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold capitalize {getProjectStateBadgeClass(
												project.state_key
											)}"
										>
											{project.state_key}
										</span>
									</div>

									<!-- Description - Hidden on mobile -->
									{#if project.description}
										<p
											class="hidden sm:block mb-3 line-clamp-2 text-sm text-muted-foreground flex-1"
										>
											{project.description.length > 120
												? project.description.slice(0, 120) + '...'
												: project.description}
										</p>
									{:else}
										<p
											class="hidden sm:block mb-3 text-sm text-muted-foreground/50 italic flex-1"
										>
											No description
										</p>
									{/if}

									<!-- Next Step - Hidden on mobile for density, shown on desktop -->
									{#if project.next_step_short}
										<div class="hidden sm:block">
											<ProjectCardNextStep
												nextStepShort={project.next_step_short}
												nextStepLong={project.next_step_long}
												class="mb-3"
											/>
										</div>
									{/if}

									<!-- Footer Stats - Show non-zero counts, limit on mobile -->
									{#if true}
										{@const stats = [
											{
												key: 'tasks',
												count: project.task_count,
												Icon: ListChecks
											},
											{
												key: 'goals',
												count: project.goal_count,
												Icon: Target
											},
											{
												key: 'plans',
												count: project.plan_count,
												Icon: Calendar
											},
											{
												key: 'docs',
												count: project.document_count,
												Icon: FileText
											}
										].filter((s) => s.count > 0)}
										{@const mobileStats = stats.slice(0, 3)}
										<div
											class="mt-auto flex items-center justify-between border-t border-border pt-1.5 sm:pt-3 text-muted-foreground"
										>
											<!-- Mobile: Show up to 3 non-zero stats -->
											<div
												class="flex sm:hidden items-center gap-2 overflow-hidden"
											>
												{#each mobileStats as stat (stat.key)}
													{@const StatIcon = stat.Icon}
													<span
														class="flex items-center gap-0.5 shrink-0"
														title={stat.key}
													>
														<StatIcon class="h-2.5 w-2.5" />
														<span class="font-semibold text-[9px]"
															>{stat.count}</span
														>
													</span>
												{/each}
												{#if stats.length > 3}
													<span
														class="text-[8px] text-muted-foreground/50"
														>+{stats.length - 3}</span
													>
												{/if}
											</div>
											<ChevronRight
												class="sm:hidden h-3 w-3 text-muted-foreground/40 shrink-0"
											/>

											<!-- Desktop: Full stats (non-zero only) -->
											<div class="hidden sm:flex flex-col gap-2 w-full">
												<div
													class="flex flex-wrap items-center gap-x-3 gap-y-1.5"
												>
													{#each stats as stat (stat.key)}
														{@const StatIcon = stat.Icon}
														<span
															class="flex items-center gap-1"
															aria-label="{stat.key} count"
															title={stat.key}
														>
															<StatIcon class="h-3.5 w-3.5" />
															<span class="font-bold text-xs"
																>{stat.count}</span
															>
														</span>
													{/each}
												</div>
												<div
													class="flex items-center justify-between text-xs text-muted-foreground/70"
												>
													<span
														>Updated {new Date(
															project.updated_at
														).toLocaleDateString()}</span
													>
													<ChevronRight
														class="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100"
													/>
												</div>
											</div>
										</div>
									{/if}
								</a>
							{/each}
						</div>
					</div>

					{#if sharedProjects.length > 0}
						<div class="space-y-2 sm:space-y-3">
							<div class="flex items-center gap-2">
								<h3 class="text-sm sm:text-base font-semibold text-foreground">
									Shared with me
								</h3>
								<span class="text-xs text-muted-foreground">
									{sharedProjects.length}
								</span>
							</div>
							<div
								class="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-4"
							>
								{#each sharedProjects as project (project.id)}
									<a
										href="/projects/{project.id}"
										onclick={() => handleProjectClick(project)}
										class="group relative flex flex-col wt-paper p-2 sm:p-4 hover:border-accent pressable tx tx-thread tx-weak"
									>
										<!-- Header - Mobile: Title + inline status, Desktop: Title + Badge -->
										<div
											class="mb-1 sm:mb-3 flex items-start justify-between gap-1 sm:gap-3"
										>
											<div class="flex-1 min-w-0">
												<h3
													class="text-xs sm:text-lg font-bold text-foreground line-clamp-2 transition-colors group-hover:text-accent leading-tight"
													style="view-transition-name: project-title-{project.id}"
												>
													{project.name}
												</h3>
												<div class="flex flex-wrap items-center gap-1 mt-1">
													<span
														class="sm:hidden inline-flex items-center rounded-md px-1 py-0.5 text-[9px] font-bold capitalize {getProjectStateBadgeClass(
															project.state_key
														)}"
													>
														{project.state_key}
													</span>
													<span
														class="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold text-accent-foreground bg-accent/80"
													>
														Shared{project.access_role
															? ` - ${project.access_role}`
															: ''}
													</span>
												</div>
											</div>
											<!-- Desktop: Status badge -->
											<span
												class="hidden sm:inline-flex flex-shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold capitalize {getProjectStateBadgeClass(
													project.state_key
												)}"
											>
												{project.state_key}
											</span>
										</div>

										<!-- Description - Hidden on mobile -->
										{#if project.description}
											<p
												class="hidden sm:block mb-3 line-clamp-2 text-sm text-muted-foreground flex-1"
											>
												{project.description.length > 120
													? project.description.slice(0, 120) + '...'
													: project.description}
											</p>
										{:else}
											<p
												class="hidden sm:block mb-3 text-sm text-muted-foreground/50 italic flex-1"
											>
												No description
											</p>
										{/if}

										<!-- Next Step - Hidden on mobile for density, shown on desktop -->
										{#if project.next_step_short}
											<div class="hidden sm:block">
												<ProjectCardNextStep
													nextStepShort={project.next_step_short}
													nextStepLong={project.next_step_long}
													class="mb-3"
												/>
											</div>
										{/if}

										<!-- Footer Stats - Show non-zero counts, limit on mobile -->
										{#if true}
											{@const stats = [
												{
													key: 'tasks',
													count: project.task_count,
													Icon: ListChecks
												},
												{
													key: 'goals',
													count: project.goal_count,
													Icon: Target
												},
												{
													key: 'plans',
													count: project.plan_count,
													Icon: Calendar
												},
												{
													key: 'docs',
													count: project.document_count,
													Icon: FileText
												}
											].filter((s) => s.count > 0)}
											{@const mobileStats = stats.slice(0, 3)}
											<div
												class="mt-auto flex items-center justify-between border-t border-border pt-1.5 sm:pt-3 text-muted-foreground"
											>
												<!-- Mobile: Show up to 3 non-zero stats -->
												<div
													class="flex sm:hidden items-center gap-2 overflow-hidden"
												>
													{#each mobileStats as stat (stat.key)}
														{@const StatIcon = stat.Icon}
														<span
															class="flex items-center gap-0.5 shrink-0"
															title={stat.key}
														>
															<StatIcon class="h-2.5 w-2.5" />
															<span class="font-semibold text-[9px]"
																>{stat.count}</span
															>
														</span>
													{/each}
													{#if stats.length > 3}
														<span
															class="text-[8px] text-muted-foreground/50"
															>+{stats.length - 3}</span
														>
													{/if}
												</div>
												<ChevronRight
													class="sm:hidden h-3 w-3 text-muted-foreground/40 shrink-0"
												/>

												<!-- Desktop: Full stats (non-zero only) -->
												<div class="hidden sm:flex flex-col gap-2 w-full">
													<div
														class="flex flex-wrap items-center gap-x-3 gap-y-1.5"
													>
														{#each stats as stat (stat.key)}
															{@const StatIcon = stat.Icon}
															<span
																class="flex items-center gap-1"
																aria-label="{stat.key} count"
																title={stat.key}
															>
																<StatIcon class="h-3.5 w-3.5" />
																<span class="font-bold text-xs"
																	>{stat.count}</span
																>
															</span>
														{/each}
													</div>
													<div
														class="flex items-center justify-between text-xs text-muted-foreground/70"
													>
														<span
															>Updated {new Date(
																project.updated_at
															).toLocaleDateString()}</span
														>
														<ChevronRight
															class="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100"
														/>
													</div>
												</div>
											</div>
										{/if}
									</a>
								{/each}
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
	/>
{/if}
