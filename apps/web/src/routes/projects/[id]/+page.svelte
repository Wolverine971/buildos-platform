<!-- apps/web/src/routes/projects/[id]/+page.svelte -->
<!--
	Ontology Project Detail - Project Overview

	PERFORMANCE: Uses skeleton-first loading for instant perceived performance.
	- Skeleton renders immediately with project name and entity counts
	- Full data hydrates in background via /api/onto/projects/[id]/full
	- No layout shifts during hydration (skeleton matches final dimensions)
	- View Transitions API animates title from source page

	Overview layout focusing on documents and project insights:
	- Documents as the primary cards
	- Right rail shows collapsible stacks for goals, plans, tasks, risks, milestones, events
	- Sticky header keeps project identity and actions visible

	Documentation:
	- 🚀 Performance Spec: /apps/web/docs/technical/performance/PROJECT_PAGE_INSTANT_LOAD.md
	- 📚 Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- 📊 Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- 🔧 Implementation Guide: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
	- 🎨 Inkprint Design System: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
	- 🔍 Navigation Index: /apps/web/docs/NAVIGATION_INDEX.md

	Related Components:
	- Task Management: /apps/web/src/lib/components/ontology/TaskCreateModal.svelte
	- Task Editing: /apps/web/src/lib/components/ontology/TaskEditModal.svelte
	- Plan Management: /apps/web/src/lib/components/ontology/PlanCreateModal.svelte
	- Plan Editing: /apps/web/src/lib/components/ontology/PlanEditModal.svelte
	- Goal Management: /apps/web/src/lib/components/ontology/GoalCreateModal.svelte
	- Goal Editing: /apps/web/src/lib/components/ontology/GoalEditModal.svelte
	- Document Management: /apps/web/src/lib/components/ontology/DocumentModal.svelte
	- Project Editing: /apps/web/src/lib/components/ontology/OntologyProjectEditModal.svelte
	- State Display: /apps/web/src/lib/components/ontology/StateDisplay.svelte

	API Integration:
	- Server Data Loading: /apps/web/src/routes/projects/[id]/+page.server.ts
	- Project API: /apps/web/src/routes/api/onto/projects/
	- Task API: /apps/web/src/routes/api/onto/tasks/
	- Plan API: /apps/web/src/routes/api/onto/plans/
	- Goal API: /apps/web/src/routes/api/onto/goals/
	- Document API: /apps/web/src/routes/api/onto/documents/

	Type Definitions:
	- Ontology Types: /apps/web/src/lib/types/onto.ts (type_key labels, helpers)
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { getNavigationData } from '$lib/stores/project-navigation.store';
	import { resolveMilestoneState } from '$lib/utils/milestone-state';
	import ProjectContentSkeleton from '$lib/components/ontology/ProjectContentSkeleton.svelte';
	import {
		AlertCircle,
		Calendar,
		Bell,
		BellOff,
		Clock,
		Image as ImageIcon,
		ListChecks,
		Pencil,
		Target,
		Trash2,
		GitBranch,
		Users
	} from 'lucide-svelte';
	import type {
		Project,
		Task,
		Document,
		Plan,
		OntoEvent,
		Goal,
		Milestone,
		Risk,
		MilestoneState
	} from '$lib/types/onto';
	import type { PageData } from './$types';
	import ProjectHeaderCard from '$lib/components/project/ProjectHeaderCard.svelte';
	import ProjectDocumentsSection from '$lib/components/project/ProjectDocumentsSection.svelte';
	import ProjectHistorySection from '$lib/components/project/ProjectHistorySection.svelte';
	import ProjectInsightRail from '$lib/components/project/ProjectInsightRail.svelte';
	import ProjectModalsHost from '$lib/components/project/ProjectModalsHost.svelte';
	import {
		flushPendingImageUploadOpen,
		requestImageUploadOpen,
		resolveEntityOpenAction
	} from '$lib/components/project/project-page-interactions';
	import type { ImageUploadPanelRef } from '$lib/components/project/project-page-interactions';
	import type { DocStructure, OntoDocument } from '$lib/types/onto-api';
	import type { OntologyImageAsset } from '$lib/components/ontology/image-assets/types';
	import type { Database, EntityReference, ProjectLogEntityType } from '@buildos/shared-types';
	import type { GraphNode } from '$lib/components/ontology/graph/lib/graph.types';
	import {
		PANEL_CONFIGS,
		createDefaultPanelStates,
		getSortValueDisplay,
		buildTaskFilterGroups,
		filterAndSortInsightEntities,
		updateInsightPanelFilters,
		updateInsightPanelSort,
		updateInsightPanelToggle,
		calculateInsightPanelCounts,
		getTaskRelevanceScoreForSort,
		type FilterGroup,
		type InsightPanelKey as ConfigPanelKey,
		type TaskAssigneeFilterMember
	} from '$lib/components/ontology/insight-panels';
	import {
		getTaskPersonRelevanceLabel,
		resolveTaskPersonFocusActorId
	} from '$lib/components/ontology/insight-panels/task-person-relevance';

	// ============================================================
	// TYPES
	// ============================================================

	type OntoEventWithSync = OntoEvent & {
		onto_event_sync?: Database['public']['Tables']['onto_event_sync']['Row'][];
	};

	// Note: 'milestones' removed - now nested under goals
	type InsightPanelKey = 'tasks' | 'plans' | 'goals' | 'risks' | 'events' | 'images';

	type InsightPanel = {
		key: InsightPanelKey;
		label: string;
		icon: typeof Target;
		items: Array<unknown>;
		description?: string;
	};

	type ProjectNotificationSettings = {
		project_id: string;
		member_count: number;
		is_shared_project: boolean;
		project_default_enabled: boolean;
		member_enabled: boolean;
		effective_enabled: boolean;
		member_overridden: boolean;
		can_manage_default: boolean;
	};

	type ProjectMemberRow = {
		actor_id: string;
		actor: {
			id: string;
			user_id: string | null;
			name: string | null;
			email: string | null;
		} | null;
	};

	// ============================================================
	// PROPS & DATA
	// ============================================================
	let { data }: { data: PageData } = $props();
	const access = $derived(
		data?.access ?? {
			canEdit: false,
			canAdmin: false,
			canInvite: false,
			canViewLogs: false,
			isOwner: false,
			isAuthenticated: false
		}
	);
	const canEdit = $derived(access.canEdit);
	const canAdmin = $derived(access.canAdmin);
	const canViewLogs = $derived(access.canViewLogs);
	const canOpenCollabModal = $derived(canViewLogs);
	const canDeleteProject = $derived(access.isOwner);

	// Skeleton loading state
	// When data.skeleton is true, we're in skeleton mode and need to hydrate
	let isHydrating = $state(data.skeleton === true);
	let hydrationError = $state<string | null>(null);

	// Entity counts from skeleton data (for skeleton rendering)
	// These are available immediately from the server for skeleton display
	const skeletonCounts = $derived(
		data.skeleton
			? (data.counts as {
					task_count: number;
					document_count: number;
					goal_count: number;
					plan_count: number;
					milestone_count: number;
					risk_count: number;
					image_count: number;
				})
			: null
	);
	// Core data - initialized from skeleton or full data
	let project = $state(
		data.skeleton
			? ({
					id: data.project.id,
					name: data.project.name,
					description: data.project.description,
					icon_svg: data.project.icon_svg,
					icon_concept: data.project.icon_concept,
					icon_generated_at: data.project.icon_generated_at,
					icon_generation_source: data.project.icon_generation_source,
					icon_generation_prompt: data.project.icon_generation_prompt,
					state_key: data.project.state_key,
					type_key: data.project.type_key || 'project',
					next_step_short: data.project.next_step_short,
					next_step_long: data.project.next_step_long,
					next_step_source: data.project.next_step_source,
					next_step_updated_at: data.project.next_step_updated_at
				} as Project)
			: (data.project as Project)
	);
	let tasks = $state(data.skeleton ? ([] as Task[]) : ((data.tasks || []) as Task[]));
	let documents = $state(
		data.skeleton ? ([] as Document[]) : ((data.documents || []) as Document[])
	);
	let images = $state(
		data.skeleton ? ([] as OntologyImageAsset[]) : ((data.images || []) as OntologyImageAsset[])
	);
	let plans = $state(data.skeleton ? ([] as Plan[]) : ((data.plans || []) as Plan[]));
	let goals = $state(data.skeleton ? ([] as Goal[]) : ((data.goals || []) as Goal[]));
	let milestones = $state(
		data.skeleton ? ([] as Milestone[]) : ((data.milestones || []) as Milestone[])
	);
	let risks = $state(data.skeleton ? ([] as Risk[]) : ((data.risks || []) as Risk[]));
	let events = $state(
		data.skeleton ? ([] as OntoEventWithSync[]) : ((data.events || []) as OntoEventWithSync[])
	);
	let contextDocument = $state(
		data.skeleton ? null : ((data.context_document || null) as Document | null)
	);

	// Context for creating milestone from within a goal
	let milestoneCreateGoalContext = $state<{ goalId: string; goalName: string } | null>(null);

	// Modal states
	let showDocumentModal = $state(false);
	let activeDocumentId = $state<string | null>(null);
	let showTaskCreateModal = $state(false);
	let showPlanCreateModal = $state(false);
	let showGoalCreateModal = $state(false);
	let showProjectEditModal = $state(false);
	let showCollabModal = $state(false);
	let showDeleteProjectModal = $state(false);
	let showProjectCalendarModal = $state(false);
	let isDeletingProject = $state(false);
	let deleteProjectError = $state<string | null>(null);
	let editingTaskId = $state<string | null>(null);
	let editingPlanId = $state<string | null>(null);
	let editingGoalId = $state<string | null>(null);
	let showRiskCreateModal = $state(false);
	let editingRiskId = $state<string | null>(null);
	let showMilestoneCreateModal = $state(false);
	let editingMilestoneId = $state<string | null>(null);
	let showEventCreateModal = $state(false);
	let editingEventId = $state<string | null>(null);
	let imageAssetsPanelRef = $state<ImageUploadPanelRef | null>(null);
	let pendingImageUploadOpen = $state(false);
	let projectNotificationSettings = $state<ProjectNotificationSettings | null>(null);
	let isNotificationSettingsLoading = $state(false);
	let isNotificationSettingsSaving = $state(false);
	let currentProjectActorId = $state<string | null>(null);
	let taskAssigneeFilterMembers = $state<TaskAssigneeFilterMember[]>([]);
	let membersLoadPromise = $state<Promise<void> | null>(null);
	let membersLoaded = $state(false);

	// Document Tree State
	let parentDocumentId = $state<string | null>(null);
	let docTreeStructure = $state<DocStructure | null>(null);
	let docTreeDocuments = $state<Record<string, OntoDocument>>({});
	let showMoveDocModal = $state(false);
	let moveDocumentId = $state<string | null>(null);
	let moveDocumentTitle = $state('');
	let showDeleteDocConfirmModal = $state(false);
	let deleteDocumentId = $state<string | null>(null);
	let deleteDocumentTitle = $state('');
	let deleteDocumentHasChildren = $state(false);
	let deleteDocumentChildCount = $state(0);
	let docTreeViewRef = $state<{ refresh: () => void } | null>(null);

	// UI State
	let documentsExpanded = $state(true);
	let expandedPanels = $state<Record<InsightPanelKey, boolean>>({
		tasks: false,
		plans: false,
		goals: true,
		events: false,
		risks: false,
		images: false
	});
	let showMobileMenu = $state(false);
	let mobileMenuPos = $state({ top: 0, right: 0 });

	function handleHeaderMenuOpen(position: { top: number; right: number }) {
		mobileMenuPos = position;
		showMobileMenu = true;
	}

	// Insight panel filter/sort state
	let panelStates = $state(createDefaultPanelStates());

	// Graph visibility state - will be loaded from localStorage in onMount
	let graphHidden = $state(false);

	// Graph modal state
	let showGraphModal = $state(false);

	$effect(() => {
		const nextPending = flushPendingImageUploadOpen(pendingImageUploadOpen, imageAssetsPanelRef);
		if (nextPending !== pendingImageUploadOpen) {
			pendingImageUploadOpen = nextPending;
		}
	});

	// ============================================================
	// HYDRATION - Load full data after skeleton render
	// ============================================================

	/**
	 * Hydrate full project data from the API.
	 * Called on mount when in skeleton mode.
	 */
	async function hydrateFullData() {
		if (!data.skeleton) return;

		try {
			const response = await fetch(`/api/onto/projects/${data.projectId}/full`);
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to load project data');
			}

			const fullData = payload?.data;
			if (!fullData) {
				throw new Error('No data returned from server');
			}

			// Hydrate all state at once
			project = fullData.project || project;
			tasks = fullData.tasks || [];
			documents = fullData.documents || [];
			images = fullData.images || [];
			plans = fullData.plans || [];
			goals = fullData.goals || [];
			milestones = fullData.milestones || [];
			risks = fullData.risks || [];
			contextDocument = fullData.context_document || null;

			isHydrating = false;
			void loadProjectEvents();
			void ensureProjectMembersLoaded();
		} catch (err) {
			console.error('[Project Page] Hydration failed:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${data.projectId}/full`,
				method: 'GET',
				projectId: data.projectId,
				entityType: 'project',
				operation: 'project_hydrate'
			});
			hydrationError = err instanceof Error ? err.message : 'Failed to load project data';
			isHydrating = false;
		}
	}

	// Hydrate on mount if in skeleton mode
	onMount(() => {
		// Load graph visibility preference from localStorage (browser-only)
		if (typeof window !== 'undefined' && window.localStorage) {
			const stored = window.localStorage.getItem('buildos:project-graph-hidden');
			graphHidden = stored === 'true';
		}

		if (canOpenCollabModal) {
			void loadProjectNotificationSettings();
		}

		if (data.skeleton) {
			// Check for warm navigation data first
			const navData = getNavigationData(data.projectId);
			if (navData) {
				// Update project with warm navigation data (may have fresher counts)
				project = {
					...project,
					name: navData.name,
					description: navData.description,
					icon_svg: navData.icon_svg,
					icon_concept: navData.icon_concept,
					icon_generated_at: navData.icon_generated_at,
					icon_generation_source: navData.icon_generation_source,
					icon_generation_prompt: navData.icon_generation_prompt,
					state_key: navData.state_key,
					next_step_short: navData.next_step_short,
					next_step_long: navData.next_step_long,
					next_step_source: navData.next_step_source,
					next_step_updated_at: navData.next_step_updated_at
				} as Project;
			}

			// Hydrate full data
			hydrateFullData();
		} else {
			void loadProjectEvents();
			void ensureProjectMembersLoaded();
		}
	});

	function getAssigneeDisplayLabel(assignee: {
		name?: string | null;
		email?: string | null;
		actor_id?: string | null;
		actorId?: string | null;
	}): string {
		const name = assignee.name?.trim();
		if (name) return name;

		const email = assignee.email?.trim().toLowerCase();
		if (email) {
			return email.split('@')[0] ?? 'Teammate';
		}

		const actorId = assignee.actor_id ?? assignee.actorId;
		if (actorId) {
			return actorId.slice(0, 8);
		}

		return 'Teammate';
	}

	async function loadProjectMembers() {
		if (!project?.id || !access.isAuthenticated) return;

		try {
			const response = await fetch(`/api/onto/projects/${project.id}/members`, {
				method: 'GET',
				credentials: 'same-origin'
			});
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to load project members');
			}

			const rows = (payload?.data?.members ?? []) as ProjectMemberRow[];
			const seen = new Set<string>();
			const members: TaskAssigneeFilterMember[] = [];

			for (const row of rows) {
				if (!row.actor_id || seen.has(row.actor_id)) continue;
				seen.add(row.actor_id);
				members.push({
					actorId: row.actor_id,
					label: getAssigneeDisplayLabel({
						name: row.actor?.name ?? null,
						email: row.actor?.email ?? null,
						actor_id: row.actor_id
					})
				});
			}

			taskAssigneeFilterMembers = members.sort((a, b) =>
				a.label.toLowerCase().localeCompare(b.label.toLowerCase())
			);
			currentProjectActorId =
				typeof payload?.data?.actorId === 'string' ? payload.data.actorId : null;
		} catch (error) {
			console.error('[Project] Failed to load members for task assignee filters:', error);
			void logOntologyClientError(error, {
				endpoint: `/api/onto/projects/${project.id}/members`,
				method: 'GET',
				projectId: project.id,
				entityType: 'project_member',
				operation: 'task_assignee_filter_members_load'
			});
			throw error;
		}
	}

	async function ensureProjectMembersLoaded(options: { force?: boolean } = {}): Promise<void> {
		const { force = false } = options;
		if (!project?.id || !access.isAuthenticated) return;
		if (!force && membersLoaded) return;
		if (membersLoadPromise) {
			await membersLoadPromise;
			return;
		}

		membersLoadPromise = (async () => {
			try {
				await loadProjectMembers();
				membersLoaded = true;
			} catch {
				membersLoaded = false;
			} finally {
				membersLoadPromise = null;
			}
		})();

		await membersLoadPromise;
	}

	// ============================================================
	// DERIVED STATE
	// ============================================================

	const documentTypeOptions = $derived.by(() => {
		const set = new Set<string>();
		for (const doc of documents) {
			if (doc.type_key) set.add(doc.type_key);
		}
		return Array.from(set);
	});

	const taskAssigneeFilterMembersFromTasks = $derived.by((): TaskAssigneeFilterMember[] => {
		const byActorId = new Map<string, TaskAssigneeFilterMember>();
		for (const task of tasks) {
			const assignees = Array.isArray(task.assignees) ? task.assignees : [];
			for (const assignee of assignees) {
				if (!assignee.actor_id || byActorId.has(assignee.actor_id)) continue;
				byActorId.set(assignee.actor_id, {
					actorId: assignee.actor_id,
					label: getAssigneeDisplayLabel(assignee)
				});
			}
		}
		return Array.from(byActorId.values()).sort((a, b) =>
			a.label.toLowerCase().localeCompare(b.label.toLowerCase())
		);
	});

	const mergedTaskFilterMembers = $derived.by((): TaskAssigneeFilterMember[] => {
		const byActorId = new Map<string, TaskAssigneeFilterMember>();
		for (const member of [
			...taskAssigneeFilterMembers,
			...taskAssigneeFilterMembersFromTasks
		]) {
			if (!member.actorId || byActorId.has(member.actorId)) continue;
			byActorId.set(member.actorId, member);
		}
		return Array.from(byActorId.values()).sort((a, b) =>
			a.label.toLowerCase().localeCompare(b.label.toLowerCase())
		);
	});

	const taskFilterGroups = $derived.by((): FilterGroup[] => {
		return buildTaskFilterGroups({
			members: mergedTaskFilterMembers,
			currentActorId: currentProjectActorId
		});
	});

	const taskPersonFocusActorId = $derived.by(() =>
		resolveTaskPersonFocusActorId({
			selectedValues: panelStates.tasks.filters.person_focus_actor_id,
			currentActorId: currentProjectActorId
		})
	);

	function getPanelFilterGroups(panelKey: InsightPanelKey): FilterGroup[] {
		if (panelKey === 'tasks') {
			return taskFilterGroups;
		}
		return PANEL_CONFIGS[panelKey].filters;
	}

	// ============================================================
	// INSIGHT PANEL FILTERING & SORTING
	// ============================================================

	// Filtered and sorted tasks
	const filteredTasks = $derived.by(() => {
		return filterAndSortInsightEntities(tasks, panelStates.tasks, 'tasks', {
			currentActorId: currentProjectActorId,
			taskFocusActorId: taskPersonFocusActorId
		});
	});

	// Filtered and sorted plans
	const filteredPlans = $derived.by(() => {
		return filterAndSortInsightEntities(plans, panelStates.plans, 'plans', {
			currentActorId: currentProjectActorId,
			taskFocusActorId: taskPersonFocusActorId
		});
	});

	// Filtered and sorted goals
	const filteredGoals = $derived.by(() => {
		return filterAndSortInsightEntities(goals, panelStates.goals, 'goals', {
			currentActorId: currentProjectActorId,
			taskFocusActorId: taskPersonFocusActorId
		});
	});

	// Filtered and sorted milestones
	const filteredMilestones = $derived.by(() => {
		return filterAndSortInsightEntities(milestones, panelStates.milestones, 'milestones', {
			currentActorId: currentProjectActorId,
			taskFocusActorId: taskPersonFocusActorId
		});
	});

	// Filtered and sorted risks
	const filteredRisks = $derived.by(() => {
		return filterAndSortInsightEntities(risks, panelStates.risks, 'risks', {
			currentActorId: currentProjectActorId,
			taskFocusActorId: taskPersonFocusActorId
		});
	});

	// Filtered and sorted events
	const filteredEvents = $derived.by(() => {
		return filterAndSortInsightEntities(events, panelStates.events, 'events', {
			currentActorId: currentProjectActorId,
			taskFocusActorId: taskPersonFocusActorId
		});
	});

	// Filtered and sorted images
	const filteredImages = $derived.by(() => {
		return filterAndSortInsightEntities(images, panelStates.images, 'images', {
			currentActorId: currentProjectActorId,
			taskFocusActorId: taskPersonFocusActorId
		});
	});

	// Group milestones by their parent goal ID
	const milestonesByGoalId = $derived.by(() => {
		const map = new Map<string, Milestone[]>();

		for (const milestone of milestones) {
			const goalId = milestone.goal_id;
			if (!goalId) continue;
			if (!map.has(goalId)) {
				map.set(goalId, []);
			}
			// Normalize due_at to ensure it's never undefined
			const normalizedMilestone: Milestone = {
				...milestone,
				due_at: milestone.due_at ?? null
			};
			map.get(goalId)!.push(normalizedMilestone);
		}

		return map;
	});

	// Counts for special toggles
	const panelCounts = $derived.by(() =>
		calculateInsightPanelCounts({
			tasks,
			plans,
			goals,
			milestones,
			risks,
			events,
			images
		})
	);

	// Panel state update handlers
	function updatePanelFilters(panelKey: ConfigPanelKey, filters: Record<string, string[]>) {
		panelStates = updateInsightPanelFilters(panelStates, panelKey, filters);
	}

	function updatePanelSort(
		panelKey: ConfigPanelKey,
		sort: { field: string; direction: 'asc' | 'desc' }
	) {
		panelStates = updateInsightPanelSort(panelStates, panelKey, sort);
	}

	function updatePanelToggle(panelKey: ConfigPanelKey, toggleId: string, value: boolean) {
		panelStates = updateInsightPanelToggle(panelStates, panelKey, toggleId, value);
	}

	// Note: Milestones are now nested under goals, not shown as a separate panel
	// See: /thoughts/shared/research/2026-01-16_milestones-under-goals-ux-proposal.md
	const insightPanels: InsightPanel[] = $derived([
		{
			key: 'goals',
			label: 'Goals',
			icon: Target,
			items: filteredGoals,
			description: 'What success looks like'
		},
		{
			key: 'plans',
			label: 'Plans',
			icon: Calendar,
			items: filteredPlans,
			description: 'Execution scaffolding'
		},
		{
			key: 'tasks',
			label: 'Tasks',
			icon: ListChecks,
			items: filteredTasks,
			description: 'What needs to move'
		},
		{
			key: 'events',
			label: 'Events',
			icon: Clock,
			items: filteredEvents,
			description: 'Meetings and time blocks'
		},
		{
			key: 'images',
			label: 'Images',
			icon: ImageIcon,
			items: filteredImages,
			description: 'Visual context and OCR'
		},
		{
			key: 'risks',
			label: 'Risks',
			icon: AlertCircle,
			items: filteredRisks,
			description: 'What could go wrong'
		}
	]);

	// ============================================================
	// UTILITY FUNCTIONS
	// ============================================================

	function togglePanel(key: InsightPanelKey) {
		expandedPanels = { ...expandedPanels, [key]: !expandedPanels[key] };
	}

	function openCreateModalForPanel(key: InsightPanelKey) {
		if (!canEdit) return;
		switch (key) {
			case 'tasks':
				showTaskCreateModal = true;
				break;
			case 'plans':
				showPlanCreateModal = true;
				break;
			case 'goals':
				showGoalCreateModal = true;
				break;
			case 'risks':
				showRiskCreateModal = true;
				break;
			// Note: 'milestones' case removed - milestones are now created from within goals
			case 'events':
				showEventCreateModal = true;
				break;
			case 'images':
				expandedPanels = { ...expandedPanels, images: true };
				pendingImageUploadOpen = requestImageUploadOpen(imageAssetsPanelRef);
				break;
		}
	}

	/**
	 * Format entity state for display
	 */
	function formatState(state: string | null | undefined): string {
		if (!state) return 'Draft';
		return state
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	function formatTaskAssigneeSummary(task: Task): string {
		const assignees = Array.isArray(task.assignees) ? task.assignees : [];
		if (assignees.length === 0) return 'Unassigned';
		const firstAssignee = assignees[0];
		if (!firstAssignee) return 'Unassigned';

		const primaryLabel = getAssigneeDisplayLabel(firstAssignee);
		if (assignees.length === 1) {
			return `@${primaryLabel}`;
		}

		return `@${primaryLabel} +${assignees.length - 1}`;
	}

	function getTaskSortSummary(task: Task): string {
		if (panelStates.tasks.sort.field === 'relevance') {
			const relevanceLabel = getTaskPersonRelevanceLabel(
				getTaskRelevanceScoreForSort(task, taskPersonFocusActorId)
			);
			return `Relevance ${relevanceLabel}`;
		}

		return getSortValueDisplay(task, panelStates.tasks.sort.field, 'tasks').value;
	}

	/**
	 * Get panel icon background and text color styles
	 */
	function getPanelIconStyles(key: InsightPanelKey): string {
		switch (key) {
			case 'goals':
				return 'bg-amber-500/10 text-amber-500';
			case 'plans':
				return 'bg-indigo-500/10 text-indigo-500';
			case 'tasks':
				return 'bg-slate-500/10 text-muted-foreground';
			case 'risks':
				return 'bg-red-500/10 text-red-500';
			case 'events':
				return 'bg-blue-500/10 text-blue-500';
			case 'images':
				return 'bg-emerald-500/10 text-emerald-500';
			default:
				return 'bg-accent/10 text-accent';
		}
	}

	/**
	 * Format event dates compactly for insight panel display.
	 * Shows: "Jan 15, 9am–10am" or "Jan 15, 9am" or "Jan 15–16"
	 */
	function formatEventDateCompact(event: OntoEventWithSync): string {
		const start = new Date(event.start_at);
		if (Number.isNaN(start.getTime())) return 'No date';

		const now = new Date();
		const isToday =
			start.getDate() === now.getDate() &&
			start.getMonth() === now.getMonth() &&
			start.getFullYear() === now.getFullYear();

		const tomorrow = new Date(now);
		tomorrow.setDate(tomorrow.getDate() + 1);
		const isTomorrow =
			start.getDate() === tomorrow.getDate() &&
			start.getMonth() === tomorrow.getMonth() &&
			start.getFullYear() === tomorrow.getFullYear();

		// Format time compactly (9am, 10:30am)
		const formatTime = (d: Date) => {
			const hours = d.getHours();
			const mins = d.getMinutes();
			const ampm = hours >= 12 ? 'pm' : 'am';
			const h = hours % 12 || 12;
			return mins === 0 ? `${h}${ampm}` : `${h}:${mins.toString().padStart(2, '0')}${ampm}`;
		};

		// Format date part
		const dateLabel = isToday
			? 'Today'
			: isTomorrow
				? 'Tomorrow'
				: start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

		const startTime = formatTime(start);

		if (!event.end_at) {
			return `${dateLabel}, ${startTime}`;
		}

		const end = new Date(event.end_at);
		if (Number.isNaN(end.getTime())) {
			return `${dateLabel}, ${startTime}`;
		}

		// Check if same day
		const sameDay =
			start.getDate() === end.getDate() &&
			start.getMonth() === end.getMonth() &&
			start.getFullYear() === end.getFullYear();

		if (sameDay) {
			return `${dateLabel}, ${startTime}–${formatTime(end)}`;
		} else {
			// Multi-day event: show date range
			const endDateLabel = end.toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric'
			});
			return `${dateLabel}–${endDateLabel}`;
		}
	}

	function isEventSynced(event: OntoEventWithSync): boolean {
		return Boolean(event.onto_event_sync && event.onto_event_sync.length > 0);
	}

	// ============================================================
	// DATA MANAGEMENT
	// ============================================================

	async function loadProjectEvents(showToast = false) {
		if (!project?.id) return;

		try {
			const response = await fetch(`/api/onto/projects/${project.id}/events`);
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to load events');
			}

			events = (payload?.data?.events || []) as OntoEventWithSync[];
		} catch (error) {
			console.error('[Project] Failed to load events', error);
			void logOntologyClientError(error, {
				endpoint: `/api/onto/projects/${project.id}/events`,
				method: 'GET',
				projectId: project.id,
				entityType: 'event',
				operation: 'project_events_load'
			});
			if (showToast) {
				toastService.error(
					error instanceof Error ? error.message : 'Failed to load events'
				);
			}
		}
	}

	async function loadProjectNotificationSettings(showToast = false) {
		if (!project?.id || !canOpenCollabModal) return;

		isNotificationSettingsLoading = true;
		try {
			const response = await fetch(`/api/onto/projects/${project.id}/notification-settings`, {
				method: 'GET',
				credentials: 'same-origin'
			});
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to load notification settings');
			}

			projectNotificationSettings = payload?.data?.settings ?? null;
		} catch (error) {
			console.error('[Project] Failed to load notification settings', error);
			void logOntologyClientError(error, {
				endpoint: `/api/onto/projects/${project.id}/notification-settings`,
				method: 'GET',
				projectId: project.id,
				entityType: 'project',
				operation: 'project_notification_settings_load'
			});
			if (showToast) {
				toastService.error(
					error instanceof Error
						? error.message
						: 'Failed to load project notification settings'
				);
			}
		} finally {
			isNotificationSettingsLoading = false;
		}
	}

	async function handleProjectNotificationQuickToggle() {
		if (!project?.id || !projectNotificationSettings || isNotificationSettingsSaving) {
			return;
		}

		const previousSettings = projectNotificationSettings;
		const nextEnabled = !previousSettings.member_enabled;

		projectNotificationSettings = {
			...previousSettings,
			member_enabled: nextEnabled,
			effective_enabled: nextEnabled,
			member_overridden: nextEnabled !== previousSettings.project_default_enabled
		};
		isNotificationSettingsSaving = true;

		try {
			const response = await fetch(`/api/onto/projects/${project.id}/notification-settings`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ member_enabled: nextEnabled })
			});
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to update notification settings');
			}

			projectNotificationSettings = payload?.data?.settings ?? projectNotificationSettings;

			toastService.success(
				nextEnabled
					? 'Project activity notifications enabled'
					: 'Project activity notifications muted'
			);
		} catch (error) {
			projectNotificationSettings = previousSettings;
			console.error('[Project] Failed to update notification settings', error);
			void logOntologyClientError(error, {
				endpoint: `/api/onto/projects/${project.id}/notification-settings`,
				method: 'PATCH',
				projectId: project.id,
				entityType: 'project',
				operation: 'project_notification_settings_toggle'
			});
			toastService.error(
				error instanceof Error
					? error.message
					: 'Failed to update project notification settings'
			);
		} finally {
			isNotificationSettingsSaving = false;
		}
	}

	async function refreshData(options: { showSuccessToast?: boolean } = {}) {
		const { showSuccessToast = false } = options;
		if (!project?.id) return;

		try {
			const response = await fetch(`/api/onto/projects/${project.id}`);
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to refresh data');
			}

			const newData = payload?.data || {};
			project = newData.project || project;
			tasks = newData.tasks || [];
			documents = newData.documents || [];
			images = (newData.images || []) as OntologyImageAsset[];
			plans = newData.plans || [];
			goals = newData.goals || [];
			milestones = newData.milestones || [];
			risks = newData.risks || [];
			contextDocument = newData.context_document || null;
			await loadProjectEvents();
			await loadProjectNotificationSettings();
			await ensureProjectMembersLoaded({ force: true });

			if (showSuccessToast) {
				toastService.success('Data refreshed');
			}
		} catch (error) {
			console.error('[Project] Failed to refresh', error);
			void logOntologyClientError(error, {
				endpoint: `/api/onto/projects/${project.id}`,
				method: 'GET',
				projectId: project.id,
				entityType: 'project',
				operation: 'project_refresh'
			});
			toastService.error(error instanceof Error ? error.message : 'Failed to refresh data');
		}
	}

	// ============================================================
	// EVENT HANDLERS
	// ============================================================

	async function handleDocumentSaved() {
		// Refresh data but keep modal open - user can close manually when done editing
		await refreshData({ showSuccessToast: false });
		docTreeViewRef?.refresh();
	}

	async function handleDocumentDeleted() {
		// Optimistic delete - remove from local state immediately
		const deletedDocId = activeDocumentId;
		if (deletedDocId) {
			documents = documents.filter((d) => d.id !== deletedDocId);
			// Remove from docTreeDocuments cache
			if (docTreeDocuments[deletedDocId]) {
				const { [deletedDocId]: _, ...rest } = docTreeDocuments;
				docTreeDocuments = rest;
			}
		}
		// Close modal immediately for snappy UX
		closeDocumentModal();
		// Refresh doc tree in background (async, non-blocking)
		docTreeViewRef?.refresh();
	}

	// Document Tree Handlers
	function handleOpenDocument(docId: string) {
		activeDocumentId = docId;
		showDocumentModal = true;
	}

	function handleCreateDocument(parentId?: string | null) {
		parentDocumentId = parentId ?? null;
		activeDocumentId = null;
		showDocumentModal = true;
	}

	function handleMoveDocument(docId: string) {
		const doc = docTreeDocuments[docId];
		moveDocumentId = docId;
		moveDocumentTitle = doc?.title || 'Document';
		showMoveDocModal = true;
	}

	function handleDeleteDocument(docId: string, hasChildren: boolean) {
		const doc = docTreeDocuments[docId];
		deleteDocumentId = docId;
		deleteDocumentTitle = doc?.title || 'Document';
		deleteDocumentHasChildren = hasChildren;
		// Count children if it's a folder - rough estimate
		if (hasChildren && docTreeStructure) {
			type DocTreeNode = { id: string; children?: DocTreeNode[] };
			const countChildren = (nodes: DocTreeNode[]): number => {
				let count = 0;
				for (const node of nodes) {
					if (node.id === docId && node.children) {
						count = node.children.length;
						break;
					}
					if (node.children) {
						const childCount = countChildren(node.children);
						if (childCount > 0) count = childCount;
					}
				}
				return count;
			};
			deleteDocumentChildCount = countChildren(docTreeStructure.root);
		} else {
			deleteDocumentChildCount = 0;
		}
		showDeleteDocConfirmModal = true;
	}

	async function handleMoveDocumentConfirm(newParentId: string | null) {
		if (!moveDocumentId || !project?.id) return;

		try {
			const res = await fetch(`/api/onto/projects/${project.id}/doc-tree/move`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					document_id: moveDocumentId,
					new_parent_id: newParentId,
					new_position: 0
				})
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || 'Failed to move document');
			}

			toastService.success('Document moved');
			docTreeViewRef?.refresh();
		} catch (error) {
			console.error('[Project] Failed to move document:', error);
			toastService.error(error instanceof Error ? error.message : 'Failed to move document');
		} finally {
			showMoveDocModal = false;
			moveDocumentId = null;
		}
	}

	async function handleDeleteDocumentConfirm(mode: 'cascade' | 'promote') {
		if (!deleteDocumentId || !project?.id) return;

		const docIdToDelete = deleteDocumentId;

		// Optimistic delete - close modal and update UI immediately
		showDeleteDocConfirmModal = false;
		deleteDocumentId = null;

		// Remove from local state immediately
		documents = documents.filter((d) => d.id !== docIdToDelete);
		if (docTreeDocuments[docIdToDelete]) {
			const { [docIdToDelete]: _, ...rest } = docTreeDocuments;
			docTreeDocuments = rest;
		}

		// Refresh doc tree to update visual structure
		docTreeViewRef?.refresh();

		// Make API call in background
		try {
			const res = await fetch(`/api/onto/documents/${docIdToDelete}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode })
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || 'Failed to delete document');
			}

			toastService.success('Document deleted');
		} catch (error) {
			console.error('[Project] Failed to delete document:', error);
			toastService.error(
				error instanceof Error ? error.message : 'Failed to delete document'
			);
			// On error, refresh to restore correct state
			void refreshData({ showSuccessToast: false });
			docTreeViewRef?.refresh();
		}
	}

	function handleDocTreeDataLoaded(data: {
		structure: DocStructure;
		documents: Record<string, OntoDocument>;
	}) {
		docTreeStructure = data.structure;
		docTreeDocuments = data.documents;
	}

	function handleTaskCreated(taskId: string) {
		toastService.success('Task created');
		showTaskCreateModal = false;
		// Auto-open edit modal for the newly created task
		editingTaskId = taskId;
		void refreshData({ showSuccessToast: false });
	}

	function handleTaskUpdated() {
		void refreshData({ showSuccessToast: false });
		editingTaskId = null;
	}

	function handleTaskDeleted() {
		// Optimistic delete - remove from local state immediately
		// The API delete already succeeded in the modal component
		const deletedTaskId = editingTaskId;
		if (deletedTaskId) {
			tasks = tasks.filter((t) => t.id !== deletedTaskId);
		}
		editingTaskId = null;
	}

	function handlePlanCreated(planId: string) {
		toastService.success('Plan created');
		showPlanCreateModal = false;
		// Auto-open edit modal for the newly created plan
		editingPlanId = planId;
		void refreshData({ showSuccessToast: false });
	}

	function handlePlanUpdated() {
		void refreshData({ showSuccessToast: false });
		editingPlanId = null;
	}

	function handlePlanDeleted() {
		// Optimistic delete - remove from local state immediately
		const deletedPlanId = editingPlanId;
		if (deletedPlanId) {
			plans = plans.filter((p) => p.id !== deletedPlanId);
		}
		editingPlanId = null;
	}

	function handleGoalCreated(goalId: string) {
		toastService.success('Goal created');
		showGoalCreateModal = false;
		// Auto-open edit modal for the newly created goal
		editingGoalId = goalId;
		void refreshData({ showSuccessToast: false });
	}

	function handleGoalUpdated() {
		void refreshData({ showSuccessToast: false });
		editingGoalId = null;
	}

	function handleGoalDeleted() {
		// Optimistic delete - remove from local state immediately
		const deletedGoalId = editingGoalId;
		if (deletedGoalId) {
			goals = goals.filter((g) => g.id !== deletedGoalId);
			// Also remove any milestones linked to this goal
			milestones = milestones.filter((m) => m.goal_id !== deletedGoalId);
		}
		editingGoalId = null;
	}

	function handleRiskCreated(riskId: string) {
		toastService.success('Risk created');
		showRiskCreateModal = false;
		// Auto-open edit modal for the newly created risk
		editingRiskId = riskId;
		void refreshData({ showSuccessToast: false });
	}

	function handleRiskUpdated() {
		void refreshData({ showSuccessToast: false });
		editingRiskId = null;
	}

	function handleRiskDeleted() {
		// Optimistic delete - remove from local state immediately
		const deletedRiskId = editingRiskId;
		if (deletedRiskId) {
			risks = risks.filter((r) => r.id !== deletedRiskId);
		}
		editingRiskId = null;
	}

	function handleMilestoneCreated(milestoneId: string) {
		toastService.success('Milestone created');
		showMilestoneCreateModal = false;
		milestoneCreateGoalContext = null;
		// Auto-open edit modal for the newly created milestone
		editingMilestoneId = milestoneId;
		void refreshData({ showSuccessToast: false });
	}

	function handleMilestoneUpdated() {
		void refreshData({ showSuccessToast: false });
		editingMilestoneId = null;
	}

	function handleMilestoneDeleted() {
		// Optimistic delete - remove from local state immediately
		const deletedMilestoneId = editingMilestoneId;
		if (deletedMilestoneId) {
			milestones = milestones.filter((m) => m.id !== deletedMilestoneId);
		}
		editingMilestoneId = null;
	}

	/**
	 * Open milestone create modal from within a goal context.
	 * This pre-links the milestone to the specified goal.
	 */
	function handleAddMilestoneFromGoal(goalId: string, goalName: string) {
		milestoneCreateGoalContext = { goalId, goalName };
		showMilestoneCreateModal = true;
	}

	/**
	 * Toggle milestone completion state.
	 * Toggles between 'pending'/'in_progress' and 'completed'.
	 */
	async function handleToggleMilestoneComplete(milestoneId: string, currentState: string) {
		const newState: MilestoneState = currentState === 'completed' ? 'pending' : 'completed';

		try {
			const response = await fetch(`/api/onto/milestones/${milestoneId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ state_key: newState })
			});

			if (!response.ok) {
				const payload = await response.json().catch(() => null);
				throw new Error(payload?.error || 'Failed to update milestone');
			}

			// Optimistic update
			milestones = milestones.map((m) => {
				if (m.id !== milestoneId) return m;
				const updated: Milestone = {
					...m,
					state_key: newState,
					due_at: m.due_at ?? null
				};
				const { state, isMissed } = resolveMilestoneState(updated);
				return {
					...updated,
					effective_state_key: state,
					is_missed: isMissed,
					due_at: updated.due_at
				};
			});

			toastService.success(
				newState === 'completed' ? 'Milestone completed!' : 'Milestone reopened'
			);
		} catch (error) {
			console.error('[Project] Failed to toggle milestone:', error);
			void logOntologyClientError(error, {
				endpoint: `/api/onto/milestones/${milestoneId}`,
				method: 'PATCH',
				projectId: project?.id,
				entityType: 'milestone',
				entityId: milestoneId,
				operation: 'milestone_toggle_complete'
			});
			toastService.error(
				error instanceof Error ? error.message : 'Failed to update milestone'
			);
		}
	}

	function handleEventCreated(eventId: string) {
		toastService.success('Event created');
		showEventCreateModal = false;
		// Auto-open edit modal for the newly created event
		editingEventId = eventId;
		void loadProjectEvents(true);
	}

	function handleEventUpdated() {
		void loadProjectEvents(true);
		editingEventId = null;
	}

	function handleEventDeleted() {
		// Optimistic delete - remove from local state immediately
		const deletedEventId = editingEventId;
		if (deletedEventId) {
			events = events.filter((e) => e.id !== deletedEventId);
		}
		editingEventId = null;
	}

	async function handleProjectDeleteConfirm() {
		if (!project?.id) return;
		isDeletingProject = true;
		deleteProjectError = null;

		try {
			const response = await fetch(`/api/onto/projects/${project.id}`, { method: 'DELETE' });
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to delete project');
			}
			toastService.success('Project deleted');
			showDeleteProjectModal = false;
			goto('/projects');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to delete project';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/projects/${project.id}`,
				method: 'DELETE',
				projectId: project.id,
				entityType: 'project',
				entityId: project.id,
				operation: 'project_delete'
			});
			deleteProjectError = message;
			toastService.error(message);
		} finally {
			isDeletingProject = false;
		}
	}

	function closeDocumentModal() {
		showDocumentModal = false;
		activeDocumentId = null;
		parentDocumentId = null;
	}

	function closeMoveDocumentModal() {
		showMoveDocModal = false;
		moveDocumentId = null;
	}

	function closeDeleteDocumentConfirmModal() {
		showDeleteDocConfirmModal = false;
		deleteDocumentId = null;
	}

	function closeMilestoneCreateModal() {
		showMilestoneCreateModal = false;
		milestoneCreateGoalContext = null;
	}

	function closeProjectCalendarModal() {
		showProjectCalendarModal = false;
	}

	function closeProjectEditModal() {
		showProjectEditModal = false;
	}

	async function handleProjectSaved() {
		await refreshData({ showSuccessToast: false });
		showProjectEditModal = false;
	}

	function closeCollabModal() {
		showCollabModal = false;
	}

	function cancelDeleteProjectModal() {
		showDeleteProjectModal = false;
	}

	function closeGraphModal() {
		showGraphModal = false;
	}

	function handleCollaborationLeftProject() {
		goto('/projects');
	}

	function openEntityEditor(
		entityType: string,
		entityId: string
	): 'opened' | 'unsupported' | 'unknown' {
		const resolution = resolveEntityOpenAction(entityType, entityId);
		if (resolution.result !== 'opened') {
			return resolution.result;
		}
		const actionEntityId = resolution.action.entityId;

		switch (resolution.action.kind) {
			case 'task':
				editingTaskId = actionEntityId;
				return 'opened';
			case 'plan':
				editingPlanId = actionEntityId;
				return 'opened';
			case 'goal':
				editingGoalId = actionEntityId;
				return 'opened';
			case 'document':
				activeDocumentId = actionEntityId;
				showDocumentModal = true;
				return 'opened';
			case 'milestone':
				editingMilestoneId = actionEntityId;
				return 'opened';
			case 'risk':
				editingRiskId = actionEntityId;
				return 'opened';
			case 'event':
				editingEventId = actionEntityId;
				return 'opened';
			case 'project':
				showProjectEditModal = true;
				return 'opened';
		}
	}

	function handleEntityClick(
		entityType: string,
		entityId: string,
		options: { unknownContext: string; unsupportedContext?: string }
	) {
		const result = openEntityEditor(entityType, entityId);
		if (result === 'unsupported' && options.unsupportedContext) {
			console.info(`${options.unsupportedContext}: ${entityType}`);
			return;
		}
		if (result === 'unknown') {
			console.warn(`${options.unknownContext}: ${entityType}`);
		}
	}

	function handleNextStepEntityClick(ref: EntityReference) {
		handleEntityClick(ref.type, ref.id, {
			unknownContext: 'Unknown entity type clicked'
		});
	}

	function handleGraphNodeClick(node: GraphNode) {
		handleEntityClick(node.type, node.id, {
			unknownContext: 'Unknown graph node type clicked'
		});
	}

	function handleGraphShow() {
		graphHidden = false;
		if (typeof window !== 'undefined' && window.localStorage) {
			window.localStorage.removeItem('buildos:project-graph-hidden');
		}
	}

	function handleActivityLogEntityClick(entityType: ProjectLogEntityType, entityId: string) {
		handleEntityClick(entityType, entityId, {
			unsupportedContext: 'No edit modal available for entity type',
			unknownContext: 'Unknown activity log entity type clicked'
		});
	}

	function refreshProjectSilently() {
		void refreshData({ showSuccessToast: false });
	}
</script>

<svelte:head>
	<title>{project?.name || 'Project'} | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background overflow-x-hidden">
	<ProjectHeaderCard
		{project}
		{showMobileMenu}
		onBack={() => goto('/projects')}
		onOpenMenu={handleHeaderMenuOpen}
		onEntityClick={handleNextStepEntityClick}
		onNextStepGenerated={refreshProjectSilently}
	/>

	<!-- Main Content -->
	<main class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 py-2 sm:py-4 overflow-x-hidden">
		<!-- Hydration Error Banner -->
		{#if hydrationError}
			<div
				class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 tx tx-static tx-weak"
			>
				<p class="text-sm text-destructive">
					Failed to load project data: {hydrationError}
				</p>
				<button
					onclick={() => {
						hydrationError = null;
						isHydrating = true;
						hydrateFullData();
					}}
					class="mt-2 text-sm font-medium text-destructive hover:text-destructive/80 pressable"
				>
					Try again
				</button>
			</div>
		{/if}

		<!-- Mobile Command Center (shown only on mobile < 640px) -->
		<div class="sm:hidden mb-2">
			{#if isHydrating}
				<div class="space-y-1.5">
					<!-- Row 1: Goals (full width) -->
					<div class="w-full h-[52px] bg-muted animate-pulse rounded-lg"></div>
					<!-- Row 2: Tasks + Plans -->
					<div class="flex flex-wrap gap-1.5">
						<div
							class="w-[calc(50%-3px)] h-[52px] bg-muted animate-pulse rounded-lg"
						></div>
						<div
							class="w-[calc(50%-3px)] h-[52px] bg-muted animate-pulse rounded-lg"
						></div>
					</div>
					<!-- Row 3: Risks + Documents -->
					<div class="flex flex-wrap gap-1.5">
						<div
							class="w-[calc(50%-3px)] h-[52px] bg-muted animate-pulse rounded-lg"
						></div>
						<div
							class="w-[calc(50%-3px)] h-[52px] bg-muted animate-pulse rounded-lg"
						></div>
					</div>
					<!-- Row 4: Events (full width) -->
					<div class="w-full h-[52px] bg-muted animate-pulse rounded-lg"></div>
				</div>
			{:else}
				{#await import('$lib/components/project/MobileCommandCenter.svelte') then { default: MobileCommandCenter }}
					<MobileCommandCenter
						goals={filteredGoals}
						milestones={filteredMilestones}
						tasks={filteredTasks}
						plans={filteredPlans}
						risks={filteredRisks}
						{documents}
						events={filteredEvents}
						{milestonesByGoalId}
						docStructure={docTreeStructure}
						{docTreeDocuments}
						projectId={project.id}
						{canEdit}
						onAddGoal={() => canEdit && (showGoalCreateModal = true)}
						onAddMilestoneFromGoal={handleAddMilestoneFromGoal}
						onAddTask={() => canEdit && (showTaskCreateModal = true)}
						onAddPlan={() => canEdit && (showPlanCreateModal = true)}
						onAddRisk={() => canEdit && (showRiskCreateModal = true)}
						onAddDocument={(parentId) => canEdit && handleCreateDocument(parentId)}
						onAddEvent={() => canEdit && (showEventCreateModal = true)}
						onEditGoal={(id) => (editingGoalId = id)}
						onEditMilestone={(id) => (editingMilestoneId = id)}
						onEditTask={(id) => (editingTaskId = id)}
						onEditPlan={(id) => (editingPlanId = id)}
						onEditRisk={(id) => (editingRiskId = id)}
						onEditDocument={(id) => {
							activeDocumentId = id;
							showDocumentModal = true;
						}}
						onEditEvent={(id) => (editingEventId = id)}
						onToggleMilestoneComplete={handleToggleMilestoneComplete}
						{panelStates}
						{panelCounts}
						onFilterChange={updatePanelFilters}
						onSortChange={updatePanelSort}
						onToggleChange={updatePanelToggle}
						{taskFilterGroups}
					/>
				{:catch}
					<div
						class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground"
					>
						Unable to load mobile command center.
					</div>
				{/await}

				<ProjectHistorySection
					{canViewLogs}
					projectId={project.id}
					projectName={project.name || 'Project'}
					compact={true}
					onEntityClick={handleActivityLogEntityClick}
				/>
			{/if}
		</div>

		<!-- Desktop Layout (hidden on mobile) -->
		<div class="hidden sm:grid lg:grid-cols-[minmax(0,1fr)_360px] gap-3 sm:gap-4">
			<!-- Left Column: Documents -->
			{#if isHydrating && skeletonCounts}
				<!-- Skeleton state - show loading placeholders with counts -->
				<ProjectContentSkeleton documentCount={skeletonCounts.document_count} />
			{:else}
				<!-- Hydrated state - show real content -->
				<div class="min-w-0 space-y-2 sm:space-y-4">
					<ProjectDocumentsSection
						projectId={project.id}
						{documents}
						{canEdit}
						{documentsExpanded}
						{activeDocumentId}
						onToggleExpanded={() => (documentsExpanded = !documentsExpanded)}
						onCreateDocument={handleCreateDocument}
						onOpenDocument={handleOpenDocument}
						onMoveDocument={canEdit ? handleMoveDocument : undefined}
						onDeleteDocument={canEdit ? handleDeleteDocument : undefined}
						onDataLoaded={handleDocTreeDataLoaded}
						onTreeRefChange={(ref) => {
							docTreeViewRef = ref;
						}}
					/>
				</div>
			{/if}

			<!-- Right Column: Insight Panels -->
			<ProjectInsightRail
				{isHydrating}
				{skeletonCounts}
				{graphHidden}
				{canViewLogs}
				{canEdit}
				projectId={project.id}
				projectName={project.name || 'Project'}
				{insightPanels}
				{expandedPanels}
				{panelStates}
				{panelCounts}
				{filteredTasks}
				{filteredPlans}
				{filteredGoals}
				{filteredRisks}
				{filteredEvents}
				{milestonesByGoalId}
				{getPanelFilterGroups}
				{getPanelIconStyles}
				{formatState}
				{formatTaskAssigneeSummary}
				{getTaskSortSummary}
				{formatEventDateCompact}
				{isEventSynced}
				onShowGraphModal={() => (showGraphModal = true)}
				onTogglePanel={togglePanel}
				onOpenCreateModalForPanel={openCreateModalForPanel}
				onUpdatePanelFilters={updatePanelFilters}
				onUpdatePanelSort={updatePanelSort}
				onUpdatePanelToggle={updatePanelToggle}
				onAddMilestoneFromGoal={handleAddMilestoneFromGoal}
				onEditTask={(id) => (editingTaskId = id)}
				onEditPlan={(id) => (editingPlanId = id)}
				onEditGoal={(id) => (editingGoalId = id)}
				onEditRisk={(id) => (editingRiskId = id)}
				onEditMilestone={(id) => (editingMilestoneId = id)}
				onEditEvent={(id) => (editingEventId = id)}
				onToggleMilestoneComplete={handleToggleMilestoneComplete}
				onHistoryEntityClick={handleActivityLogEntityClick}
				onRefreshData={refreshProjectSilently}
				onImageAssetsPanelRefChange={(ref) => {
					imageAssetsPanelRef = ref;
				}}
			/>
		</div>
	</main>
</div>

<ProjectModalsHost
	{project}
	{contextDocument}
	{goals}
	{tasks}
	{documentTypeOptions}
	{docTreeStructure}
	{docTreeDocuments}
	{canDeleteProject}
	{canOpenCollabModal}
	{canAdmin}
	{showDocumentModal}
	{activeDocumentId}
	{parentDocumentId}
	{showMoveDocModal}
	{moveDocumentId}
	{moveDocumentTitle}
	{showDeleteDocConfirmModal}
	{deleteDocumentId}
	{deleteDocumentTitle}
	{deleteDocumentHasChildren}
	{deleteDocumentChildCount}
	{showTaskCreateModal}
	{editingTaskId}
	{showPlanCreateModal}
	{editingPlanId}
	{showGoalCreateModal}
	{editingGoalId}
	{showRiskCreateModal}
	{editingRiskId}
	{showMilestoneCreateModal}
	{milestoneCreateGoalContext}
	{editingMilestoneId}
	{showEventCreateModal}
	{editingEventId}
	{showProjectCalendarModal}
	{showProjectEditModal}
	{showCollabModal}
	{showDeleteProjectModal}
	{isDeletingProject}
	{deleteProjectError}
	{showGraphModal}
	onCloseDocumentModal={closeDocumentModal}
	onDocumentSaved={handleDocumentSaved}
	onDocumentDeleted={handleDocumentDeleted}
	onCloseMoveDocModal={closeMoveDocumentModal}
	onMoveDocumentConfirm={handleMoveDocumentConfirm}
	onCloseDeleteDocConfirmModal={closeDeleteDocumentConfirmModal}
	onDeleteDocumentConfirm={handleDeleteDocumentConfirm}
	onCloseTaskCreateModal={() => (showTaskCreateModal = false)}
	onTaskCreated={handleTaskCreated}
	onCloseTaskEditModal={() => (editingTaskId = null)}
	onTaskUpdated={handleTaskUpdated}
	onTaskDeleted={handleTaskDeleted}
	onClosePlanCreateModal={() => (showPlanCreateModal = false)}
	onPlanCreated={handlePlanCreated}
	onClosePlanEditModal={() => (editingPlanId = null)}
	onPlanUpdated={handlePlanUpdated}
	onPlanDeleted={handlePlanDeleted}
	onCloseGoalCreateModal={() => (showGoalCreateModal = false)}
	onGoalCreated={handleGoalCreated}
	onCloseGoalEditModal={() => (editingGoalId = null)}
	onGoalUpdated={handleGoalUpdated}
	onGoalDeleted={handleGoalDeleted}
	onCloseRiskCreateModal={() => (showRiskCreateModal = false)}
	onRiskCreated={handleRiskCreated}
	onCloseRiskEditModal={() => (editingRiskId = null)}
	onRiskUpdated={handleRiskUpdated}
	onRiskDeleted={handleRiskDeleted}
	onCloseMilestoneCreateModal={closeMilestoneCreateModal}
	onMilestoneCreated={handleMilestoneCreated}
	onCloseMilestoneEditModal={() => (editingMilestoneId = null)}
	onMilestoneUpdated={handleMilestoneUpdated}
	onMilestoneDeleted={handleMilestoneDeleted}
	onCloseEventCreateModal={() => (showEventCreateModal = false)}
	onEventCreated={handleEventCreated}
	onCloseEventEditModal={() => (editingEventId = null)}
	onEventUpdated={handleEventUpdated}
	onEventDeleted={handleEventDeleted}
	onCloseProjectCalendarModal={closeProjectCalendarModal}
	onCloseProjectEditModal={closeProjectEditModal}
	onProjectSaved={handleProjectSaved}
	onCloseCollabModal={closeCollabModal}
	onLeftProject={handleCollaborationLeftProject}
	onProjectDeleteConfirm={handleProjectDeleteConfirm}
	onCancelProjectDelete={cancelDeleteProjectModal}
	onCloseGraphModal={closeGraphModal}
	onGraphNodeClick={handleGraphNodeClick}
/>

<!-- Settings Menu Portal - Rendered outside all containers to avoid z-index issues -->
{#if showMobileMenu}
	<button
		type="button"
		class="fixed inset-0 z-[9998] bg-transparent"
		onclick={() => (showMobileMenu = false)}
		aria-label="Close menu"
	></button>
	<div
		class="fixed z-[9999] w-56 rounded-lg border border-border bg-card shadow-ink-strong py-1"
		style="top: {mobileMenuPos.top}px; right: {mobileMenuPos.right}px;"
	>
		{#if graphHidden}
			<button
				onclick={() => {
					showMobileMenu = false;
					handleGraphShow();
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors pressable"
			>
				<GitBranch class="w-4 h-4 text-muted-foreground" />
				Show graph
			</button>
		{/if}
		{#if canOpenCollabModal}
			<button
				onclick={() => {
					showMobileMenu = false;
					void handleProjectNotificationQuickToggle();
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors pressable disabled:opacity-60 disabled:cursor-not-allowed"
				disabled={isNotificationSettingsSaving ||
					isNotificationSettingsLoading ||
					!projectNotificationSettings}
			>
				{#if projectNotificationSettings?.member_enabled}
					<Bell class="w-4 h-4 text-muted-foreground" />
				{:else}
					<BellOff class="w-4 h-4 text-muted-foreground" />
				{/if}
				{isNotificationSettingsSaving
					? 'Saving notifications...'
					: projectNotificationSettings?.member_enabled
						? 'Turn notifications off'
						: 'Turn notifications on'}
			</button>
		{/if}
		{#if canOpenCollabModal}
			<button
				onclick={() => {
					showMobileMenu = false;
					showCollabModal = true;
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors pressable"
			>
				<Users class="w-4 h-4 text-muted-foreground" />
				Collaboration settings
			</button>
		{/if}
		{#if canEdit}
			<button
				onclick={() => {
					showMobileMenu = false;
					showProjectEditModal = true;
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors pressable"
			>
				<Pencil class="w-4 h-4 text-muted-foreground" />
				Edit project
			</button>
			<button
				onclick={() => {
					showMobileMenu = false;
					showProjectCalendarModal = true;
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors pressable"
			>
				<Calendar class="w-4 h-4 text-muted-foreground" />
				Calendar
			</button>
		{/if}
		{#if canDeleteProject}
			<hr class="my-1 border-border" />
			<button
				onclick={() => {
					showMobileMenu = false;
					showDeleteProjectModal = true;
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors pressable"
			>
				<Trash2 class="w-4 h-4" />
				Delete project
			</button>
		{/if}
	</div>
{/if}
