<!-- apps/web/src/lib/components/project/ProjectInsightRail.svelte -->
<script lang="ts">
	import { slide } from 'svelte/transition';
	import {
		AlertCircle,
		Calendar,
		Clock,
		ChevronDown,
		ExternalLink,
		FileText,
		GitBranch,
		Image as ImageIcon,
		ListChecks,
		Maximize2,
		Plus,
		Target,
		CheckCircle
	} from 'lucide-svelte';
	import type { Database, ProjectLogEntityType } from '@buildos/shared-types';
	import type { Goal, Milestone, OntoEvent, Plan, Risk, Task } from '$lib/types/onto';
	import GoalMilestonesSection from '$lib/components/ontology/GoalMilestonesSection.svelte';
	import EntityListItem from '$lib/components/ontology/EntityListItem.svelte';
	import InsightPanelSkeleton from '$lib/components/ontology/InsightPanelSkeleton.svelte';
	import {
		InsightFilterDropdown,
		InsightSortDropdown,
		InsightSpecialToggles,
		PANEL_CONFIGS,
		getSortValueDisplay,
		type FilterGroup,
		type InsightPanelKey as ConfigPanelKey,
		type InsightPanelState,
		type InsightPanelCounts
	} from '$lib/components/ontology/insight-panels';
	import { resolveMilestoneState } from '$lib/utils/milestone-state';
	import ProjectHistorySection from '$lib/components/project/ProjectHistorySection.svelte';

	type OntoEventWithSync = OntoEvent & {
		onto_event_sync?: Database['public']['Tables']['onto_event_sync']['Row'][];
	};

	type InsightPanelKey = 'tasks' | 'plans' | 'goals' | 'risks' | 'events' | 'images';

	type InsightPanel = {
		key: InsightPanelKey;
		label: string;
		icon: typeof CheckCircle;
		items: Array<unknown>;
		description?: string;
	};

	type SkeletonCounts = {
		task_count: number;
		document_count: number;
		goal_count: number;
		plan_count: number;
		milestone_count: number;
		risk_count: number;
		image_count: number;
	} | null;

	let {
		isHydrating,
		skeletonCounts,
		graphHidden,
		canViewLogs,
		canEdit,
		projectId,
		projectName,
		insightPanels,
		expandedPanels,
		panelStates,
		panelCounts,
		filteredTasks,
		filteredPlans,
		filteredGoals,
		filteredRisks,
		filteredEvents,
		milestonesByGoalId,
		getPanelFilterGroups,
		getPanelIconStyles,
		formatState,
		formatTaskAssigneeSummary,
		getTaskSortSummary,
		formatEventDateCompact,
		isEventSynced,
		onShowGraphModal,
		onTogglePanel,
		onOpenCreateModalForPanel,
		onUpdatePanelFilters,
		onUpdatePanelSort,
		onUpdatePanelToggle,
		onAddMilestoneFromGoal,
		onEditTask,
		onEditPlan,
		onEditGoal,
		onEditRisk,
		onEditMilestone,
		onEditEvent,
		onToggleMilestoneComplete,
		onHistoryEntityClick,
		onRefreshData,
		onImageAssetsPanelRefChange
	}: {
		isHydrating: boolean;
		skeletonCounts: SkeletonCounts;
		graphHidden: boolean;
		canViewLogs: boolean;
		canEdit: boolean;
		projectId: string;
		projectName: string | null;
		insightPanels: InsightPanel[];
		expandedPanels: Record<InsightPanelKey, boolean>;
		panelStates: Record<ConfigPanelKey, InsightPanelState>;
		panelCounts: InsightPanelCounts;
		filteredTasks: Task[];
		filteredPlans: Plan[];
		filteredGoals: Goal[];
		filteredRisks: Risk[];
		filteredEvents: OntoEventWithSync[];
		milestonesByGoalId: Map<string, Milestone[]>;
		getPanelFilterGroups: (panelKey: InsightPanelKey) => FilterGroup[];
		getPanelIconStyles: (panelKey: InsightPanelKey) => string;
		formatState: (state: string | null | undefined) => string;
		formatTaskAssigneeSummary: (task: Task) => string;
		getTaskSortSummary: (task: Task) => string;
		formatEventDateCompact: (event: OntoEventWithSync) => string;
		isEventSynced: (event: OntoEventWithSync) => boolean;
		onShowGraphModal: () => void;
		onTogglePanel: (panelKey: InsightPanelKey) => void;
		onOpenCreateModalForPanel: (panelKey: InsightPanelKey) => void;
		onUpdatePanelFilters: (panelKey: ConfigPanelKey, filters: Record<string, string[]>) => void;
		onUpdatePanelSort: (
			panelKey: ConfigPanelKey,
			sort: { field: string; direction: 'asc' | 'desc' }
		) => void;
		onUpdatePanelToggle: (panelKey: ConfigPanelKey, toggleId: string, value: boolean) => void;
		onAddMilestoneFromGoal: (goalId: string, goalName: string) => void;
		onEditTask: (taskId: string) => void;
		onEditPlan: (planId: string) => void;
		onEditGoal: (goalId: string) => void;
		onEditRisk: (riskId: string) => void;
		onEditMilestone: (milestoneId: string) => void;
		onEditEvent: (eventId: string) => void;
		onToggleMilestoneComplete: (milestoneId: string, currentState: string) => void;
		onHistoryEntityClick: (entityType: ProjectLogEntityType, entityId: string) => void;
		onRefreshData: () => void | Promise<void>;
		onImageAssetsPanelRefChange?: (ref: { openUploadModal: () => void } | null) => void;
	} = $props();

	let imageAssetsPanelRef: { openUploadModal: () => void } | null = null;

	$effect(() => {
		onImageAssetsPanelRefChange?.(imageAssetsPanelRef);
	});
</script>

{#if isHydrating && skeletonCounts}
	<aside class="min-w-0 space-y-3 lg:sticky lg:top-24">
		{#if !graphHidden}
			<button
				type="button"
				onclick={onShowGraphModal}
				class="w-full bg-card border border-border rounded-lg shadow-ink tx tx-thread tx-weak overflow-hidden text-left hover:bg-muted/50 transition-colors pressable group"
			>
				<div class="flex items-center justify-between gap-2 px-4 py-3">
					<div class="flex items-center gap-3">
						<div
							class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center"
						>
							<GitBranch class="w-4 h-4 text-accent" />
						</div>
						<div>
							<p class="text-sm font-semibold text-foreground">Project Graph</p>
							<p class="text-xs text-muted-foreground">Click to explore</p>
						</div>
					</div>
					<Maximize2
						class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
					/>
				</div>
			</button>
		{/if}

		<InsightPanelSkeleton
			icon={Target}
			label="Goals"
			count={skeletonCounts.goal_count}
			description="What success looks like"
			expanded={true}
		/>
		<InsightPanelSkeleton
			icon={Clock}
			label="Events"
			count={0}
			description="Meetings and time blocks"
		/>
		<InsightPanelSkeleton
			icon={ImageIcon}
			label="Images"
			count={skeletonCounts.image_count}
			description="Visual context and OCR"
		/>
		<InsightPanelSkeleton
			icon={Calendar}
			label="Plans"
			count={skeletonCounts.plan_count}
			description="Execution scaffolding"
		/>
		<InsightPanelSkeleton
			icon={ListChecks}
			label="Tasks"
			count={skeletonCounts.task_count}
			description="What needs to move"
		/>
		<InsightPanelSkeleton
			icon={AlertCircle}
			label="Risks"
			count={skeletonCounts.risk_count}
			description="What could go wrong"
		/>

		<div class="relative py-4">
			<div class="absolute inset-0 flex items-center px-4">
				<div class="w-full border-t border-border/40"></div>
			</div>
			<div class="relative flex justify-center">
				<span
					class="bg-background px-3 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest"
				>
					History
				</span>
			</div>
		</div>

		<div
			class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
		>
			<div class="flex items-center gap-3 px-4 py-3">
				<div class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
					<FileText class="w-4 h-4 text-accent" />
				</div>
				<div>
					<p class="text-sm font-semibold text-foreground">Daily Briefs</p>
					<p class="text-xs text-muted-foreground">AI-generated summaries</p>
				</div>
			</div>
		</div>

		{#if canViewLogs}
			<div
				class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
			>
				<div class="flex items-center gap-3 px-4 py-3">
					<div class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
						<Clock class="w-4 h-4 text-accent" />
					</div>
					<div>
						<p class="text-sm font-semibold text-foreground">Activity Log</p>
						<p class="text-xs text-muted-foreground">Recent changes</p>
					</div>
				</div>
			</div>
		{/if}
	</aside>
{:else}
	<aside class="min-w-0 space-y-3 lg:sticky lg:top-24">
		{#if !graphHidden}
			<button
				type="button"
				onclick={onShowGraphModal}
				class="w-full bg-card border border-border rounded-lg shadow-ink tx tx-thread tx-weak overflow-hidden text-left hover:bg-muted/50 transition-colors pressable group"
			>
				<div class="flex items-center justify-between gap-2 px-4 py-3">
					<div class="flex items-center gap-3">
						<div
							class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center"
						>
							<GitBranch class="w-4 h-4 text-accent" />
						</div>
						<div>
							<p class="text-sm font-semibold text-foreground">Project Graph</p>
							<p class="text-xs text-muted-foreground">Click to explore</p>
						</div>
					</div>
					<Maximize2
						class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
					/>
				</div>
			</button>
		{/if}

		{#each insightPanels as section}
			{@const isOpen = expandedPanels[section.key]}
			{@const SectionIcon = section.icon}
			{@const iconStyles = getPanelIconStyles(section.key)}
			<div class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak">
				<div
					class="flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors"
				>
					<button
						onclick={() => onTogglePanel(section.key)}
						class="flex items-center gap-3 flex-1 text-left min-w-0 pressable"
					>
						<div
							class="w-8 h-8 rounded-md flex items-center justify-center shrink-0 {iconStyles}"
						>
							<SectionIcon class="w-4 h-4" />
						</div>
						<div class="min-w-0">
							<p class="text-sm font-semibold text-foreground">
								{section.label}
								<span class="text-muted-foreground font-normal"
									>({section.items.length})</span
								>
							</p>
							{#if section.description}
								<p class="text-xs text-muted-foreground">
									{section.description}
								</p>
							{/if}
						</div>
					</button>
					<div class="flex items-center gap-1.5 shrink-0">
						{#if canEdit}
							<button
								onclick={() => onOpenCreateModalForPanel(section.key)}
								class="p-1.5 rounded-md hover:bg-muted transition-colors pressable"
								aria-label="Add {section.label.toLowerCase()}"
							>
								<Plus class="w-4 h-4 text-muted-foreground" />
							</button>
						{/if}
						<button
							onclick={() => onTogglePanel(section.key)}
							class="p-1.5 rounded-md hover:bg-muted transition-colors pressable"
							aria-label={isOpen
								? `Collapse ${section.label.toLowerCase()}`
								: `Expand ${section.label.toLowerCase()}`}
						>
							<ChevronDown
								class="w-4 h-4 text-muted-foreground transition-transform duration-[120ms] {isOpen
									? 'rotate-180'
									: ''}"
							/>
						</button>
					</div>
				</div>

				{#if isOpen}
					<div class="border-t border-border" transition:slide={{ duration: 120 }}>
						{#if section.key !== 'images'}
							<div
								class="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30"
							>
								<InsightFilterDropdown
									filterGroups={getPanelFilterGroups(section.key)}
									activeFilters={panelStates[section.key].filters}
									onchange={(filters) =>
										onUpdatePanelFilters(section.key, filters)}
								/>
								<InsightSortDropdown
									sortOptions={PANEL_CONFIGS[section.key].sorts}
									currentSort={panelStates[section.key].sort}
									onchange={(sort) => onUpdatePanelSort(section.key, sort)}
								/>
							</div>
						{/if}

						{#if section.key === 'tasks'}
							{#if filteredTasks.length > 0}
								<ul class="divide-y divide-border/80">
									{#each filteredTasks as task}
										{@const taskSortSummary = getTaskSortSummary(task)}
										<li class="flex items-center gap-1 min-w-0">
											<EntityListItem
												type="task"
												title={task.title}
												metadata="{formatState(
													task.state_key
												)} · {formatTaskAssigneeSummary(
													task
												)} · {taskSortSummary}"
												state={task.state_key}
												onclick={() => onEditTask(task.id)}
												class="flex-1 min-w-0 !w-auto"
											/>
											<a
												href="/projects/{projectId}/tasks/{task.id}"
												class="shrink-0 p-2 mr-1 rounded-lg hover:bg-accent/10 transition-colors pressable"
												title="Open task focus page"
											>
												<ExternalLink
													class="w-4 h-4 text-muted-foreground hover:text-accent"
												/>
											</a>
										</li>
									{/each}
								</ul>
							{:else}
								<div class="px-3 py-3 text-center">
									<p class="text-sm text-muted-foreground">No tasks yet</p>
									<p class="text-xs text-muted-foreground/70 mt-1">
										Add tasks to track work
									</p>
								</div>
							{/if}
						{:else if section.key === 'plans'}
							{#if filteredPlans.length > 0}
								<ul class="divide-y divide-border/80">
									{#each filteredPlans as plan}
										{@const sortDisplay = getSortValueDisplay(
											plan,
											panelStates.plans.sort.field,
											'plans'
										)}
										<li>
											<EntityListItem
												type="plan"
												title={plan.name}
												metadata="{formatState(
													plan.state_key
												)} · {sortDisplay.value}"
												state={plan.state_key}
												onclick={() => onEditPlan(plan.id)}
											/>
										</li>
									{/each}
								</ul>
							{:else}
								<div class="px-3 py-3 text-center">
									<p class="text-sm text-muted-foreground">No plans yet</p>
									<p class="text-xs text-muted-foreground/70 mt-1">
										Create a plan to organize work
									</p>
								</div>
							{/if}
						{:else if section.key === 'goals'}
							{#if filteredGoals.length > 0}
								<ul class="divide-y divide-border/80">
									{#each filteredGoals as goal (goal.id)}
										{@const sortDisplay = getSortValueDisplay(
											goal,
											panelStates.goals.sort.field,
											'goals'
										)}
										{@const goalMilestones =
											milestonesByGoalId.get(goal.id) || []}
										{@const completedCount = goalMilestones.filter(
											(m) => resolveMilestoneState(m).state === 'completed'
										).length}
										<li>
											<div class="flex items-center min-w-0">
												<EntityListItem
													type="goal"
													title={goal.name}
													metadata="{formatState(
														goal.state_key
													)} · {sortDisplay.value}"
													state={goal.state_key}
													onclick={() => onEditGoal(goal.id)}
													class="flex-1 min-w-0"
												/>
												{#if goalMilestones.length > 0}
													<span
														class="px-2 py-2 text-[10px] text-muted-foreground shrink-0"
													>
														{completedCount}/{goalMilestones.length}
													</span>
												{/if}
											</div>

											<GoalMilestonesSection
												milestones={goalMilestones}
												goalId={goal.id}
												goalName={goal.name}
												goalState={goal.state_key}
												{canEdit}
												onAddMilestone={onAddMilestoneFromGoal}
												onEditMilestone={(id) => onEditMilestone(id)}
												{onToggleMilestoneComplete}
											/>
										</li>
									{/each}
								</ul>
							{:else}
								<div class="px-3 py-3 text-center">
									<p class="text-sm text-muted-foreground">No goals yet</p>
									<p class="text-xs text-muted-foreground/70 mt-1">
										Set goals to define success
									</p>
								</div>
							{/if}
						{:else if section.key === 'images'}
							<div class="px-3 py-2">
								{#await import('$lib/components/ontology/ImageAssetsPanel.svelte') then { default: ImageAssetsPanel }}
									<ImageAssetsPanel
										bind:this={imageAssetsPanelRef}
										{projectId}
										showTitle={false}
										showUploadButton={false}
										{canEdit}
										onChanged={() => void onRefreshData()}
									/>
								{:catch}
									<div class="py-2 text-sm text-muted-foreground">
										Unable to load image assets.
									</div>
								{/await}
							</div>
						{:else if section.key === 'risks'}
							{#if filteredRisks.length > 0}
								<ul class="divide-y divide-border/80">
									{#each filteredRisks as risk}
										{@const sortDisplay = getSortValueDisplay(
											risk,
											panelStates.risks.sort.field,
											'risks'
										)}
										{@const severity = risk.props?.severity as
											| 'low'
											| 'medium'
											| 'high'
											| 'critical'
											| undefined}
										<li>
											<EntityListItem
												type="risk"
												title={risk.title}
												metadata="{formatState(risk.state_key)}{severity
													? ` · ${severity} severity`
													: ''} · {sortDisplay.value}"
												state={risk.state_key}
												{severity}
												onclick={() => onEditRisk(risk.id)}
											/>
										</li>
									{/each}
								</ul>
							{:else}
								<div class="px-3 py-3 text-center">
									<p class="text-sm text-muted-foreground">No risks identified</p>
									<p class="text-xs text-muted-foreground/70 mt-1">
										Document risks to track blockers
									</p>
								</div>
							{/if}
						{:else if section.key === 'events'}
							{#if filteredEvents.length > 0}
								<ul class="divide-y divide-border/80">
									{#each filteredEvents as event}
										{@const sortDisplay = getSortValueDisplay(
											event,
											panelStates.events.sort.field,
											'events'
										)}
										{@const syncStatus = isEventSynced(event)
											? ''
											: ' · Local only'}
										<li>
											<EntityListItem
												type="event"
												title={event.title}
												metadata="{formatEventDateCompact(
													event
												)} · {sortDisplay.value}{syncStatus}"
												state={event.state_key}
												onclick={() => onEditEvent(event.id)}
											/>
										</li>
									{/each}
								</ul>
							{:else}
								<div class="px-3 py-3 text-center">
									<p class="text-sm text-muted-foreground">No events scheduled</p>
									<p class="text-xs text-muted-foreground/70 mt-1">
										Add events to track meetings
									</p>
								</div>
							{/if}
						{/if}

						{#if section.key !== 'images'}
							<InsightSpecialToggles
								toggles={PANEL_CONFIGS[section.key].specialToggles}
								values={panelStates[section.key].toggles}
								counts={panelCounts[section.key]}
								onchange={(toggleId, value) =>
									onUpdatePanelToggle(section.key, toggleId, value)}
							/>
						{/if}
					</div>
				{/if}
			</div>
		{/each}

		<ProjectHistorySection
			{canViewLogs}
			{projectId}
			projectName={projectName || 'Project'}
			onEntityClick={onHistoryEntityClick}
		/>
	</aside>
{/if}
