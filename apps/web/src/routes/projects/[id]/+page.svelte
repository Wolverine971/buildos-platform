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
	import { slide } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { getNavigationData } from '$lib/stores/project-navigation.store';
	import { resolveMilestoneState } from '$lib/utils/milestone-state';
	import InsightPanelSkeleton from '$lib/components/ontology/InsightPanelSkeleton.svelte';
	import ProjectContentSkeleton from '$lib/components/ontology/ProjectContentSkeleton.svelte';
	import EntityListItem from '$lib/components/ontology/EntityListItem.svelte';
	import {
		Plus,
		FileText,
		Calendar,
		ExternalLink,
		Pencil,
		Trash2,
		ArrowLeft,
		CheckCircle2,
		Circle,
		Clock,
		Target,
		ChevronDown,
		AlertTriangle,
		Flag,
		ListChecks,
		MoreVertical,
		GitBranch,
		UserPlus
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
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import NextStepDisplay from '$lib/components/project/NextStepDisplay.svelte';
	import StateDisplay from '$lib/components/ontology/StateDisplay.svelte';
	import TaskEditModal from '$lib/components/ontology/TaskEditModal.svelte';
	import ProjectGraphSection from '$lib/components/ontology/ProjectGraphSection.svelte';
	import ProjectActivityLogPanel from '$lib/components/ontology/ProjectActivityLogPanel.svelte';
	import ProjectBriefsPanel from '$lib/components/ontology/ProjectBriefsPanel.svelte';
	import ProjectShareModal from '$lib/components/project/ProjectShareModal.svelte';
	import GoalMilestonesSection from '$lib/components/ontology/GoalMilestonesSection.svelte';
	import {
		DocTreeView,
		DocMoveModal,
		DocDeleteConfirmModal
	} from '$lib/components/ontology/doc-tree';
	import type { DocStructure, OntoDocument, GetDocTreeResponse } from '$lib/types/onto-api';
	import type { Database, EntityReference, ProjectLogEntityType } from '@buildos/shared-types';
	import type { GraphNode } from '$lib/components/ontology/graph/lib/graph.types';
	import {
		InsightFilterDropdown,
		InsightSortDropdown,
		InsightSpecialToggles,
		PANEL_CONFIGS,
		createDefaultPanelStates,
		getPriorityGroup,
		calculateRiskScore,
		isWithinTimeframe,
		getSortValueDisplay,
		STAGE_ORDER,
		IMPACT_ORDER,
		type InsightPanelState,
		type InsightPanelKey as ConfigPanelKey
	} from '$lib/components/ontology/insight-panels';

	// ============================================================
	// TYPES
	// ============================================================

	type OntoEventWithSync = OntoEvent & {
		onto_event_sync?: Database['public']['Tables']['onto_event_sync']['Row'][];
	};

	// Import MobileCommandCenter for mobile-first layout
	import MobileCommandCenter from '$lib/components/project/MobileCommandCenter.svelte';

	// Note: 'milestones' removed - now nested under goals
	type InsightPanelKey = 'tasks' | 'plans' | 'goals' | 'risks' | 'events';

	type InsightPanel = {
		key: InsightPanelKey;
		label: string;
		icon: typeof CheckCircle2;
		items: Array<unknown>;
		description?: string;
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
			isAuthenticated: false
		}
	);
	const canEdit = $derived(access.canEdit);
	const canAdmin = $derived(access.canAdmin);
	const canInvite = $derived(access.canInvite);
	const canViewLogs = $derived(access.canViewLogs);

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
				})
			: null
	);
	const skeletonRows = [0, 1, 2, 3];

	// Core data - initialized from skeleton or full data
	let project = $state(
		data.skeleton
			? ({
					id: data.project.id,
					name: data.project.name,
					description: data.project.description,
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
	let showShareModal = $state(false);
	let showDeleteProjectModal = $state(false);
	let showProjectCalendarSettingsModal = $state(false);
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
	let dataRefreshing = $state(false);
	let documentsExpanded = $state(true);
	let expandedPanels = $state<Record<InsightPanelKey, boolean>>({
		tasks: false,
		plans: false,
		goals: true,
		events: false,
		risks: false
	});
	let showMobileMenu = $state(false);
	let mobileMenuButtonEl: HTMLButtonElement | null = $state(null);
	let mobileMenuPos = $state({ top: 0, right: 0 });

	function openMobileMenu() {
		if (mobileMenuButtonEl) {
			const rect = mobileMenuButtonEl.getBoundingClientRect();
			mobileMenuPos = {
				top: rect.bottom + 4,
				right: window.innerWidth - rect.right
			};
		}
		showMobileMenu = true;
	}

	// Insight panel filter/sort state
	let panelStates = $state(createDefaultPanelStates());

	// Graph visibility state - will be loaded from localStorage in onMount
	let graphHidden = $state(false);

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
			plans = fullData.plans || [];
			goals = fullData.goals || [];
			milestones = fullData.milestones || [];
			risks = fullData.risks || [];
			contextDocument = fullData.context_document || null;

			isHydrating = false;
			void loadProjectEvents();
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

		if (data.skeleton) {
			// Check for warm navigation data first
			const navData = getNavigationData(data.projectId);
			if (navData) {
				// Update project with warm navigation data (may have fresher counts)
				project = {
					...project,
					name: navData.name,
					description: navData.description,
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
		}
	});

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

	// ============================================================
	// INSIGHT PANEL FILTERING & SORTING
	// ============================================================

	/**
	 * Generic filter function for entities
	 */
	function filterEntity<T extends Record<string, unknown>>(
		item: T,
		filters: Record<string, string[]>,
		toggles: Record<string, boolean>,
		entityType: ConfigPanelKey
	): boolean {
		// Check deleted_at filter (all entity types)
		if (!toggles.showDeleted && item.deleted_at) {
			return false;
		}

		// Entity-specific terminal state filtering
		if (entityType === 'tasks') {
			if (!toggles.showCompleted && item.state_key === 'done') return false;
		} else if (entityType === 'plans') {
			if (!toggles.showCompleted && item.state_key === 'completed') return false;
		} else if (entityType === 'goals') {
			if (!toggles.showAchieved && item.state_key === 'achieved') return false;
			if (!toggles.showAbandoned && item.state_key === 'abandoned') return false;
		} else if (entityType === 'milestones') {
			const { state } = resolveMilestoneState(item as unknown as Milestone);
			if (!toggles.showCompleted && state === 'completed') return false;
			if (!toggles.showMissed && state === 'missed') return false;
		} else if (entityType === 'risks') {
			if (!toggles.showClosed && item.state_key === 'closed') return false;
		} else if (entityType === 'events') {
			if (!toggles.showCancelled && item.state_key === 'cancelled') return false;
			// Filter out past events (end_at or start_at before now)
			if (!toggles.showPast) {
				const endAt = item.end_at as string | null;
				const startAt = item.start_at as string | null;
				const eventEnd = endAt ? new Date(endAt) : startAt ? new Date(startAt) : null;
				if (eventEnd && eventEnd < new Date()) return false;
			}
		}

		// Check multi-select filters
		for (const [field, selectedValues] of Object.entries(filters)) {
			if (!selectedValues || selectedValues.length === 0) continue;

			// Special handling for priority (grouped)
			if (field === 'priority' && entityType === 'tasks') {
				const priorityGroup = getPriorityGroup(item.priority as number | null);
				if (!selectedValues.includes(priorityGroup)) return false;
				continue;
			}
			if (field === 'state_key' && entityType === 'milestones') {
				const { state } = resolveMilestoneState(item as unknown as Milestone);
				if (!selectedValues.includes(state)) return false;
				continue;
			}

			// Special handling for timeframe (milestones)
			if (field === 'timeframe' && entityType === 'milestones') {
				const timeframe = selectedValues[0] || 'all';
				if (timeframe !== 'all') {
					if (!isWithinTimeframe(item.due_at as string | null, timeframe)) return false;
				}
				continue;
			}

			// Standard field filter
			const itemValue = item[field];
			if (itemValue != null && !selectedValues.includes(String(itemValue))) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Generic sort function for entities
	 */
	function sortEntities<T extends Record<string, unknown>>(
		items: T[],
		sort: { field: string; direction: 'asc' | 'desc' },
		entityType: ConfigPanelKey
	): T[] {
		return [...items].sort((a, b) => {
			let aVal = a[sort.field];
			let bVal = b[sort.field];

			// Special handling for computed fields
			if (sort.field === 'risk_score' && entityType === 'risks') {
				aVal = calculateRiskScore(a.impact as string, a.probability as number);
				bVal = calculateRiskScore(b.impact as string, b.probability as number);
			}

			// Special handling for stage ordering (plans)
			if (sort.field === 'facet_stage' && entityType === 'plans') {
				aVal = STAGE_ORDER[String(a.facet_stage)] ?? 99;
				bVal = STAGE_ORDER[String(b.facet_stage)] ?? 99;
			}

			// Special handling for impact ordering (risks)
			if (sort.field === 'impact' && entityType === 'risks') {
				aVal = IMPACT_ORDER[String(a.impact)] ?? 99;
				bVal = IMPACT_ORDER[String(b.impact)] ?? 99;
			}

			// Handle nulls (always sort to end)
			if (aVal == null && bVal == null) return 0;
			if (aVal == null) return 1;
			if (bVal == null) return -1;

			// Compare values
			let comparison = 0;
			if (typeof aVal === 'string' && typeof bVal === 'string') {
				comparison = aVal.localeCompare(bVal);
			} else if (typeof aVal === 'number' && typeof bVal === 'number') {
				comparison = aVal - bVal;
			} else {
				comparison = String(aVal).localeCompare(String(bVal));
			}

			return sort.direction === 'asc' ? comparison : -comparison;
		});
	}

	// Filtered and sorted tasks
	const filteredTasks = $derived.by(() => {
		const state = panelStates.tasks;
		const filtered = tasks.filter((t) =>
			filterEntity(
				t as unknown as Record<string, unknown>,
				state.filters,
				state.toggles,
				'tasks'
			)
		);
		return sortEntities(
			filtered as unknown as Record<string, unknown>[],
			state.sort,
			'tasks'
		) as unknown as Task[];
	});

	// Filtered and sorted plans
	const filteredPlans = $derived.by(() => {
		const state = panelStates.plans;
		const filtered = plans.filter((p) =>
			filterEntity(
				p as unknown as Record<string, unknown>,
				state.filters,
				state.toggles,
				'plans'
			)
		);
		return sortEntities(
			filtered as unknown as Record<string, unknown>[],
			state.sort,
			'plans'
		) as unknown as Plan[];
	});

	// Filtered and sorted goals
	const filteredGoals = $derived.by(() => {
		const state = panelStates.goals;
		const filtered = goals.filter((g) =>
			filterEntity(
				g as unknown as Record<string, unknown>,
				state.filters,
				state.toggles,
				'goals'
			)
		);
		return sortEntities(
			filtered as unknown as Record<string, unknown>[],
			state.sort,
			'goals'
		) as unknown as Goal[];
	});

	// Filtered and sorted milestones
	const filteredMilestones = $derived.by(() => {
		const state = panelStates.milestones;
		const filtered = milestones.filter((m) =>
			filterEntity(
				m as unknown as Record<string, unknown>,
				state.filters,
				state.toggles,
				'milestones'
			)
		);
		return sortEntities(
			filtered as unknown as Record<string, unknown>[],
			state.sort,
			'milestones'
		) as unknown as Milestone[];
	});

	// Filtered and sorted risks
	const filteredRisks = $derived.by(() => {
		const state = panelStates.risks;
		const filtered = risks.filter((r) =>
			filterEntity(
				r as unknown as Record<string, unknown>,
				state.filters,
				state.toggles,
				'risks'
			)
		);
		return sortEntities(
			filtered as unknown as Record<string, unknown>[],
			state.sort,
			'risks'
		) as unknown as Risk[];
	});

	// Filtered and sorted events
	const filteredEvents = $derived.by(() => {
		const state = panelStates.events;
		const filtered = events.filter((e) =>
			filterEntity(
				e as unknown as Record<string, unknown>,
				state.filters,
				state.toggles,
				'events'
			)
		);
		return sortEntities(
			filtered as unknown as Record<string, unknown>[],
			state.sort,
			'events'
		) as unknown as OntoEventWithSync[];
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
	const panelCounts = $derived.by(() => ({
		tasks: {
			showCompleted: tasks.filter((t) => t.state_key === 'done').length,
			showDeleted: tasks.filter((t) => t.deleted_at).length
		},
		plans: {
			showCompleted: plans.filter((p) => p.state_key === 'completed').length,
			showDeleted: plans.filter((p) => p.deleted_at).length
		},
		goals: {
			showAchieved: goals.filter((g) => g.state_key === 'achieved').length,
			showAbandoned: goals.filter((g) => g.state_key === 'abandoned').length,
			showDeleted: goals.filter((g) => (g as unknown as Record<string, unknown>).deleted_at)
				.length
		},
		milestones: {
			showCompleted: milestones.filter((m) => resolveMilestoneState(m).state === 'completed')
				.length,
			showMissed: milestones.filter((m) => resolveMilestoneState(m).state === 'missed')
				.length,
			showDeleted: milestones.filter(
				(m) => (m as unknown as Record<string, unknown>).deleted_at
			).length
		},
		risks: {
			showClosed: risks.filter((r) => r.state_key === 'closed').length,
			showDeleted: risks.filter((r) => (r as unknown as Record<string, unknown>).deleted_at)
				.length
		},
		events: {
			showPast: events.filter((e) => {
				const eventEnd = e.end_at
					? new Date(e.end_at)
					: e.start_at
						? new Date(e.start_at)
						: null;
				return eventEnd && eventEnd < new Date();
			}).length,
			showCancelled: events.filter((e) => e.state_key === 'cancelled').length,
			showDeleted: events.filter((e) => e.deleted_at).length
		}
	}));

	// Panel state update handlers
	function updatePanelFilters(panelKey: ConfigPanelKey, filters: Record<string, string[]>) {
		panelStates = {
			...panelStates,
			[panelKey]: {
				...panelStates[panelKey],
				filters
			}
		};
	}

	function updatePanelSort(
		panelKey: ConfigPanelKey,
		sort: { field: string; direction: 'asc' | 'desc' }
	) {
		panelStates = {
			...panelStates,
			[panelKey]: {
				...panelStates[panelKey],
				sort
			}
		};
	}

	function updatePanelToggle(panelKey: ConfigPanelKey, toggleId: string, value: boolean) {
		panelStates = {
			...panelStates,
			[panelKey]: {
				...panelStates[panelKey],
				toggles: {
					...panelStates[panelKey].toggles,
					[toggleId]: value
				}
			}
		};
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
			key: 'risks',
			label: 'Risks',
			icon: AlertTriangle,
			items: filteredRisks,
			description: 'What could go wrong'
		}
	]);

	// ============================================================
	// UTILITY FUNCTIONS
	// ============================================================

	function getTypeLabel(typeKey: string): string {
		// Extract the last part of the type_key
		const parts = typeKey.split('.');
		const variant = parts[parts.length - 1] ?? typeKey;
		// Convert snake_case to Title Case
		return variant
			.split('_')
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ');
	}

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
		}
	}

	function getTaskVisuals(state: string) {
		const normalized = state?.toLowerCase() || '';
		if (normalized === 'done' || normalized === 'completed' || normalized === 'complete') {
			return { icon: CheckCircle2, color: 'text-emerald-500' };
		}
		if (normalized === 'in_progress' || normalized === 'active') {
			return { icon: Clock, color: 'text-accent' };
		}
		return { icon: Circle, color: 'text-muted-foreground' };
	}

	function formatDueDate(dateString?: string | null) {
		if (!dateString) return 'No due date';
		const parsed = new Date(dateString);
		if (Number.isNaN(parsed.getTime())) return 'No due date';
		return parsed.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
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

	/**
	 * Format last modified date for display
	 */
	function formatLastModified(dateString: string | null | undefined): string {
		if (!dateString) return 'Never';
		const date = new Date(dateString);
		if (Number.isNaN(date.getTime())) return 'Never';

		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		// Less than 1 hour: "X min ago"
		if (diffMins < 60) {
			return diffMins <= 1 ? '1 min ago' : `${diffMins} min ago`;
		}

		// Less than 24 hours: "X hr ago"
		if (diffHours < 24) {
			return diffHours === 1 ? '1 hr ago' : `${diffHours} hr ago`;
		}

		// Less than 7 days: "X days ago"
		if (diffDays < 7) {
			return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
		}

		// Otherwise: "Mon DD, YYYY" format
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
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
				return 'bg-slate-500/10 text-slate-500';
			case 'risks':
				return 'bg-red-500/10 text-red-500';
			case 'events':
				return 'bg-blue-500/10 text-blue-500';
			default:
				return 'bg-accent/10 text-accent';
		}
	}

	function formatEventWindow(event: OntoEventWithSync): string {
		const start = new Date(event.start_at);
		if (Number.isNaN(start.getTime())) return 'No time';

		const startLabel = start.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});

		if (!event.end_at) {
			return startLabel;
		}

		const end = new Date(event.end_at);
		if (Number.isNaN(end.getTime())) {
			return startLabel;
		}

		const endLabel = end.toLocaleTimeString(undefined, {
			hour: 'numeric',
			minute: '2-digit'
		});

		return `${startLabel} – ${endLabel}`;
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

	async function refreshData() {
		if (!project?.id) return;
		dataRefreshing = true;

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
			plans = newData.plans || [];
			goals = newData.goals || [];
			milestones = newData.milestones || [];
			risks = newData.risks || [];
			contextDocument = newData.context_document || null;
			await loadProjectEvents();

			toastService.success('Data refreshed');
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
		} finally {
			dataRefreshing = false;
		}
	}

	// ============================================================
	// EVENT HANDLERS
	// ============================================================

	async function handleDocumentSaved() {
		// Refresh data but keep modal open - user can close manually when done editing
		await refreshData();
		docTreeViewRef?.refresh();
	}

	async function handleDocumentDeleted() {
		await refreshData();
		docTreeViewRef?.refresh();
		showDocumentModal = false;
		activeDocumentId = null;
		parentDocumentId = null;
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
			const countChildren = (nodes: { id: string; children?: any[] }[]): number => {
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

		try {
			const res = await fetch(`/api/onto/documents/${deleteDocumentId}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode })
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || 'Failed to delete document');
			}

			toastService.success('Document deleted');
			await refreshData();
			docTreeViewRef?.refresh();
		} catch (error) {
			console.error('[Project] Failed to delete document:', error);
			toastService.error(
				error instanceof Error ? error.message : 'Failed to delete document'
			);
		} finally {
			showDeleteDocConfirmModal = false;
			deleteDocumentId = null;
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
		void refreshData();
	}

	function handleTaskUpdated() {
		void refreshData();
		editingTaskId = null;
	}

	function handleTaskDeleted() {
		void refreshData();
		editingTaskId = null;
	}

	function handlePlanCreated(planId: string) {
		toastService.success('Plan created');
		showPlanCreateModal = false;
		// Auto-open edit modal for the newly created plan
		editingPlanId = planId;
		void refreshData();
	}

	function handlePlanUpdated() {
		void refreshData();
		editingPlanId = null;
	}

	function handlePlanDeleted() {
		void refreshData();
		editingPlanId = null;
	}

	function handleGoalCreated(goalId: string) {
		toastService.success('Goal created');
		showGoalCreateModal = false;
		// Auto-open edit modal for the newly created goal
		editingGoalId = goalId;
		void refreshData();
	}

	function handleGoalUpdated() {
		void refreshData();
		editingGoalId = null;
	}

	function handleGoalDeleted() {
		void refreshData();
		editingGoalId = null;
	}

	function handleRiskCreated(riskId: string) {
		toastService.success('Risk created');
		showRiskCreateModal = false;
		// Auto-open edit modal for the newly created risk
		editingRiskId = riskId;
		void refreshData();
	}

	function handleRiskUpdated() {
		void refreshData();
		editingRiskId = null;
	}

	function handleRiskDeleted() {
		void refreshData();
		editingRiskId = null;
	}

	function handleMilestoneCreated(milestoneId: string) {
		toastService.success('Milestone created');
		showMilestoneCreateModal = false;
		milestoneCreateGoalContext = null;
		// Auto-open edit modal for the newly created milestone
		editingMilestoneId = milestoneId;
		void refreshData();
	}

	function handleMilestoneUpdated() {
		void refreshData();
		editingMilestoneId = null;
	}

	function handleMilestoneDeleted() {
		void refreshData();
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
		void loadProjectEvents(true);
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

	function handleNextStepEntityClick(ref: EntityReference) {
		// Open the appropriate modal based on entity type
		switch (ref.type) {
			case 'task':
				editingTaskId = ref.id;
				break;
			case 'plan':
				editingPlanId = ref.id;
				break;
			case 'goal':
				editingGoalId = ref.id;
				break;
			case 'note':
			case 'document':
				activeDocumentId = ref.id;
				showDocumentModal = true;
				break;
			case 'milestone':
				editingMilestoneId = ref.id;
				break;
			case 'risk':
				editingRiskId = ref.id;
				break;
			case 'event':
				editingEventId = ref.id;
				break;
			case 'project':
				showProjectEditModal = true;
				break;
			default:
				console.warn(`Unknown entity type clicked: ${ref.type}`);
		}
	}

	function handleGraphNodeClick(node: GraphNode) {
		// Open the appropriate modal based on node type
		switch (node.type) {
			case 'task':
				editingTaskId = node.id;
				break;
			case 'plan':
				editingPlanId = node.id;
				break;
			case 'goal':
				editingGoalId = node.id;
				break;
			case 'note':
			case 'document':
				activeDocumentId = node.id;
				showDocumentModal = true;
				break;
			case 'milestone':
				editingMilestoneId = node.id;
				break;
			case 'risk':
				editingRiskId = node.id;
				break;
			case 'event':
				editingEventId = node.id;
				break;
			case 'project':
				// Already on this project page, open edit modal
				showProjectEditModal = true;
				break;
			default:
				console.warn(`Unknown graph node type clicked: ${node.type}`);
		}
	}

	function handleGraphHide() {
		graphHidden = true;
		if (typeof window !== 'undefined' && window.localStorage) {
			window.localStorage.setItem('buildos:project-graph-hidden', 'true');
		}
	}

	function handleGraphShow() {
		graphHidden = false;
		if (typeof window !== 'undefined' && window.localStorage) {
			window.localStorage.removeItem('buildos:project-graph-hidden');
		}
	}

	function handleActivityLogEntityClick(entityType: ProjectLogEntityType, entityId: string) {
		// Open the appropriate modal based on entity type
		switch (entityType) {
			case 'task':
				editingTaskId = entityId;
				break;
			case 'plan':
				editingPlanId = entityId;
				break;
			case 'goal':
				editingGoalId = entityId;
				break;
			case 'note':
			case 'document':
				// Both notes and documents use the DocumentModal
				activeDocumentId = entityId;
				showDocumentModal = true;
				break;
			case 'milestone':
				editingMilestoneId = entityId;
				break;
			case 'risk':
				editingRiskId = entityId;
				break;
			case 'event':
				editingEventId = entityId;
				break;
			case 'project':
				// Already on this project page, open edit modal
				showProjectEditModal = true;
				break;
			case 'requirement':
			case 'source':
				// These entity types don't have edit modals yet
				console.info(`No edit modal available for entity type: ${entityType}`);
				break;
			default:
				console.warn(`Unknown activity log entity type clicked: ${entityType}`);
		}
	}
</script>

<svelte:head>
	<title>{project?.name || 'Project'} | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background overflow-x-hidden">
	<!-- Header - Project identity card -->
	<header class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 pt-2 sm:pt-4">
		<div
			class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak p-3 sm:p-4 space-y-1 sm:space-y-3"
		>
			<!-- Title Row -->
			<div class="flex items-center justify-between gap-1.5 sm:gap-2">
				<div class="flex items-center gap-1.5 sm:gap-3 min-w-0">
					<button
						onclick={() => goto('/projects')}
						class="flex items-center justify-center p-1 sm:p-2 rounded-lg hover:bg-muted transition-colors shrink-0 pressable"
						aria-label="Back to projects"
					>
						<ArrowLeft class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
					</button>
					<div class="min-w-0">
						<h1
							class="text-sm sm:text-xl font-semibold text-foreground leading-tight line-clamp-1 sm:line-clamp-2"
							style="view-transition-name: project-title-{project.id}"
						>
							{project?.name || 'Untitled Project'}
						</h1>
						{#if project?.description}
							<p
								class="text-xs text-muted-foreground mt-0.5 line-clamp-2 hidden sm:block"
								title={project.description}
							>
								{project.description}
							</p>
						{/if}
					</div>
				</div>

				<!-- Desktop: Show all buttons -->
				<div class="hidden sm:flex items-center gap-1.5 shrink-0">
					<StateDisplay state={project.state_key} entityKind="project" />
					{#if graphHidden}
						<button
							onclick={handleGraphShow}
							class="p-2 rounded-lg hover:bg-muted transition-colors pressable"
							aria-label="Show project relationship graph"
							title="Show project relationship graph"
						>
							<GitBranch class="w-5 h-5 text-muted-foreground" />
						</button>
					{/if}
					{#if canInvite}
						<button
							onclick={() => (showShareModal = true)}
							class="p-2 rounded-lg hover:bg-muted transition-colors pressable"
							aria-label="Share project"
							title="Share project"
						>
							<UserPlus class="w-5 h-5 text-muted-foreground" />
						</button>
					{/if}
					{#if canEdit}
						<button
							onclick={() => (showProjectCalendarSettingsModal = true)}
							class="p-2 rounded-lg hover:bg-muted transition-colors pressable"
							aria-label="Project calendar settings"
							title="Project calendar settings"
						>
							<Calendar class="w-5 h-5 text-muted-foreground" />
						</button>
						<button
							onclick={() => (showProjectEditModal = true)}
							class="p-2 rounded-lg hover:bg-muted transition-colors pressable"
							aria-label="Edit project"
						>
							<Pencil class="w-5 h-5 text-muted-foreground" />
						</button>
					{/if}
					{#if canAdmin}
						<button
							onclick={() => (showDeleteProjectModal = true)}
							class="p-2 rounded-lg hover:bg-destructive/10 transition-colors pressable"
							aria-label="Delete project"
						>
							<Trash2 class="w-5 h-5 text-destructive" />
						</button>
					{/if}
				</div>

				<!-- Mobile: 3-dot menu -->
				<div class="flex items-center gap-1.5 sm:hidden">
					<button
						bind:this={mobileMenuButtonEl}
						onclick={openMobileMenu}
						class="p-1.5 rounded-lg hover:bg-muted transition-colors pressable"
						aria-label="Project options"
						aria-expanded={showMobileMenu}
					>
						<MoreVertical class="w-5 h-5 text-muted-foreground" />
					</button>
				</div>
			</div>

			<!-- Next Step Display -->
			<NextStepDisplay
				projectId={project.id}
				nextStepShort={project.next_step_short}
				nextStepLong={project.next_step_long}
				nextStepSource={project.next_step_source}
				nextStepUpdatedAt={project.next_step_updated_at}
				onEntityClick={handleNextStepEntityClick}
				onNextStepGenerated={async () => {
					await refreshData();
				}}
			/>
		</div>
	</header>

	<!-- Relationship Graph Section -->
	{#if !graphHidden}
		<div class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 pt-2 sm:pt-4">
			<ProjectGraphSection
				projectId={project.id}
				onNodeClick={handleGraphNodeClick}
				onHide={handleGraphHide}
			/>
		</div>
	{/if}

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
		<div class="sm:hidden mb-4">
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
				<MobileCommandCenter
					goals={filteredGoals}
					milestones={filteredMilestones}
					tasks={filteredTasks}
					plans={filteredPlans}
					risks={filteredRisks}
					{documents}
					events={filteredEvents}
					{milestonesByGoalId}
					{canEdit}
					onAddGoal={() => canEdit && (showGoalCreateModal = true)}
					onAddMilestoneFromGoal={handleAddMilestoneFromGoal}
					onAddTask={() => canEdit && (showTaskCreateModal = true)}
					onAddPlan={() => canEdit && (showPlanCreateModal = true)}
					onAddRisk={() => canEdit && (showRiskCreateModal = true)}
					onAddDocument={() => {
						if (!canEdit) return;
						activeDocumentId = null;
						showDocumentModal = true;
					}}
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
				/>

				<!-- Mobile History Section (Daily Briefs & Activity Log) -->
				{#if canViewLogs}
					<!-- History Section Divider -->
					<div class="relative py-3 mt-3">
						<div class="absolute inset-0 flex items-center px-2">
							<div class="w-full border-t border-border/40"></div>
						</div>
						<div class="relative flex justify-center">
							<span
								class="bg-background px-2 text-[9px] font-medium text-muted-foreground/70 uppercase tracking-widest"
							>
								History
							</span>
						</div>
					</div>

					<!-- Daily Briefs Panel -->
					<div class="space-y-2">
						<ProjectBriefsPanel projectId={project.id} projectName={project.name} />

						<!-- Activity Log Panel -->
						<ProjectActivityLogPanel
							projectId={project.id}
							onEntityClick={handleActivityLogEntityClick}
						/>
					</div>
				{/if}
			{/if}
		</div>

		<!-- Desktop Layout (hidden on mobile) -->
		<div
			class="hidden sm:grid sm:grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] gap-2 sm:gap-4 lg:gap-6"
		>
			<!-- Left Column: Documents -->
			{#if isHydrating && skeletonCounts}
				<!-- Skeleton state - show loading placeholders with counts -->
				<ProjectContentSkeleton documentCount={skeletonCounts.document_count} />
			{:else}
				<!-- Hydrated state - show real content -->
				<div class="min-w-0 space-y-2 sm:space-y-4">
					<!-- Documents Section - Collapsible -->
					<section
						class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<div
							class="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3"
						>
							<button
								onclick={() => (documentsExpanded = !documentsExpanded)}
								class="flex items-center gap-2 sm:gap-3 flex-1 text-left hover:bg-muted/60 -m-2 sm:-m-3 p-2 sm:p-3 rounded-lg transition-colors pressable"
							>
								<div
									class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center"
								>
									<FileText class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
								</div>
								<div>
									<p class="text-xs sm:text-sm font-semibold text-foreground">
										Documents
									</p>
									<p class="text-[10px] sm:text-xs text-muted-foreground">
										{documents.length}
										{documents.length === 1 ? 'document' : 'documents'}
									</p>
								</div>
							</button>
							<div class="flex items-center gap-1 sm:gap-2">
								{#if canEdit}
									<button
										onclick={() => handleCreateDocument(null)}
										class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors pressable"
										aria-label="Add document"
									>
										<Plus
											class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground"
										/>
									</button>
								{/if}
								<button
									onclick={() => (documentsExpanded = !documentsExpanded)}
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors pressable"
									aria-label={documentsExpanded
										? 'Collapse documents'
										: 'Expand documents'}
								>
									<ChevronDown
										class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform duration-[120ms] {documentsExpanded
											? 'rotate-180'
											: ''}"
									/>
								</button>
							</div>
						</div>

						{#if documentsExpanded}
							<div
								class="border-t border-border"
								transition:slide={{ duration: 120 }}
							>
								<DocTreeView
									bind:this={docTreeViewRef}
									projectId={project.id}
									onOpenDocument={handleOpenDocument}
									onCreateDocument={handleCreateDocument}
									onMoveDocument={canEdit ? handleMoveDocument : undefined}
									onDeleteDocument={canEdit ? handleDeleteDocument : undefined}
									selectedDocumentId={activeDocumentId}
								/>
							</div>
						{/if}
					</section>
				</div>
			{/if}

			<!-- Right Column: Insight Panels -->
			{#if isHydrating && skeletonCounts}
				<!-- Skeleton insight panels -->
				<aside class="min-w-0 space-y-3 lg:sticky lg:top-24">
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
						icon={AlertTriangle}
						label="Risks"
						count={skeletonCounts.risk_count}
						description="What could go wrong"
					/>

					<!-- History Section Divider -->
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

					<!-- Daily Briefs Panel - loads lazily, show placeholder -->
					<div
						class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<div class="flex items-center gap-3 px-4 py-3">
							<div
								class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center"
							>
								<FileText class="w-4 h-4 text-accent" />
							</div>
							<div>
								<p class="text-sm font-semibold text-foreground">Daily Briefs</p>
								<p class="text-xs text-muted-foreground">AI-generated summaries</p>
							</div>
						</div>
					</div>

					{#if canViewLogs}
						<!-- Activity Log Panel - loads lazily, show placeholder -->
						<div
							class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
						>
							<div class="flex items-center gap-3 px-4 py-3">
								<div
									class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center"
								>
									<Clock class="w-4 h-4 text-accent" />
								</div>
								<div>
									<p class="text-sm font-semibold text-foreground">
										Activity Log
									</p>
									<p class="text-xs text-muted-foreground">Recent changes</p>
								</div>
							</div>
						</div>
					{/if}
				</aside>
			{:else}
				<!-- Hydrated insight panels -->
				<aside class="min-w-0 space-y-3 lg:sticky lg:top-24">
					{#each insightPanels as section}
						{@const isOpen = expandedPanels[section.key]}
						{@const SectionIcon = section.icon}
						{@const iconStyles = getPanelIconStyles(section.key)}
						<div
							class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
						>
							<div class="flex items-center justify-between gap-3 px-4 py-3">
								<button
									onclick={() => togglePanel(section.key)}
									class="flex items-center gap-3 flex-1 text-left hover:bg-muted/60 -m-3 p-3 rounded-lg transition-colors pressable"
								>
									<div
										class="w-9 h-9 rounded-lg flex items-center justify-center {iconStyles}"
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
										<p class="text-xs text-muted-foreground">
											{#if section.description}
												{section.description}
											{/if}
										</p>
									</div>
								</button>
								<div class="flex items-center gap-2">
									{#if canEdit}
										<button
											onclick={() => openCreateModalForPanel(section.key)}
											class="p-1.5 rounded-md hover:bg-muted transition-colors pressable"
											aria-label="Add {section.label.toLowerCase()}"
										>
											<Plus class="w-4 h-4 text-muted-foreground" />
										</button>
									{/if}
									<button
										onclick={() => togglePanel(section.key)}
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
								<div
									class="border-t border-border"
									transition:slide={{ duration: 120 }}
								>
									<!-- Filter/Sort Controls -->
									<div
										class="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30"
									>
										<InsightFilterDropdown
											filterGroups={PANEL_CONFIGS[section.key].filters}
											activeFilters={panelStates[section.key].filters}
											onchange={(filters) =>
												updatePanelFilters(section.key, filters)}
										/>
										<InsightSortDropdown
											sortOptions={PANEL_CONFIGS[section.key].sorts}
											currentSort={panelStates[section.key].sort}
											onchange={(sort) => updatePanelSort(section.key, sort)}
										/>
									</div>

									{#if section.key === 'tasks'}
										{#if filteredTasks.length > 0}
											<ul class="divide-y divide-border/80">
												{#each filteredTasks as task}
													{@const sortDisplay = getSortValueDisplay(
														task as unknown as Record<string, unknown>,
														panelStates.tasks.sort.field,
														'tasks'
													)}
													<li>
														<div class="flex items-center min-w-0">
															<EntityListItem
																type="task"
																title={task.title}
																metadata="{formatState(
																	task.state_key
																)} · {sortDisplay.value}"
																state={task.state_key}
																onclick={() =>
																	(editingTaskId = task.id)}
																class="flex-1"
															/>
															<a
																href="/projects/{project.id}/tasks/{task.id}"
																class="flex-shrink-0 p-2 mr-2 rounded-lg hover:bg-accent/10 transition-colors pressable"
																title="Open task focus page"
															>
																<ExternalLink
																	class="w-4 h-4 text-muted-foreground hover:text-accent"
																/>
															</a>
														</div>
													</li>
												{/each}
											</ul>
										{:else}
											<div class="px-4 py-4 text-center">
												<p class="text-sm text-muted-foreground">
													No tasks yet
												</p>
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
														plan as unknown as Record<string, unknown>,
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
															onclick={() =>
																(editingPlanId = plan.id)}
														/>
													</li>
												{/each}
											</ul>
										{:else}
											<div class="px-4 py-4 text-center">
												<p class="text-sm text-muted-foreground">
													No plans yet
												</p>
												<p class="text-xs text-muted-foreground/70 mt-1">
													Create a plan to organize work
												</p>
											</div>
										{/if}
									{:else if section.key === 'goals'}
										{#if filteredGoals.length > 0}
											<div class="divide-y divide-border/80">
												{#each filteredGoals as goal (goal.id)}
													{@const sortDisplay = getSortValueDisplay(
														goal as unknown as Record<string, unknown>,
														panelStates.goals.sort.field,
														'goals'
													)}
													{@const goalMilestones =
														milestonesByGoalId.get(goal.id) || []}
													{@const completedCount = goalMilestones.filter(
														(m) =>
															resolveMilestoneState(m).state ===
															'completed'
													).length}
													<!-- Goal Card with nested milestones -->
													<div
														class="bg-card rounded-lg overflow-hidden shadow-ink border-t border-r border-b border-border"
													>
														<!-- Goal Header -->
														<div class="flex items-start">
															<EntityListItem
																type="goal"
																title={goal.name}
																metadata="{formatState(
																	goal.state_key
																)} · {sortDisplay.value}"
																state={goal.state_key}
																onclick={() =>
																	(editingGoalId = goal.id)}
																class="flex-1 !rounded-none !shadow-none"
															/>
															{#if goalMilestones.length > 0}
																<span
																	class="px-2.5 py-2.5 text-[10px] text-muted-foreground shrink-0"
																>
																	{completedCount}/{goalMilestones.length}
																</span>
															{/if}
														</div>

														<!-- Nested Milestones Section -->
														<GoalMilestonesSection
															milestones={goalMilestones}
															goalId={goal.id}
															goalName={goal.name}
															goalState={goal.state_key}
															{canEdit}
															onAddMilestone={handleAddMilestoneFromGoal}
															onEditMilestone={(id) =>
																(editingMilestoneId = id)}
															onToggleMilestoneComplete={handleToggleMilestoneComplete}
														/>
													</div>
												{/each}
											</div>
										{:else}
											<div class="px-4 py-4 text-center">
												<p class="text-sm text-muted-foreground">
													No goals yet
												</p>
												<p class="text-xs text-muted-foreground/70 mt-1">
													Set goals to define success
												</p>
											</div>
										{/if}
									{:else if section.key === 'risks'}
										{#if filteredRisks.length > 0}
											<ul class="divide-y divide-border/80">
												{#each filteredRisks as risk}
													{@const sortDisplay = getSortValueDisplay(
														risk as unknown as Record<string, unknown>,
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
															metadata="{formatState(
																risk.state_key
															)}{severity
																? ` · ${severity} severity`
																: ''} · {sortDisplay.value}"
															state={risk.state_key}
															{severity}
															onclick={() =>
																(editingRiskId = risk.id)}
														/>
													</li>
												{/each}
											</ul>
										{:else}
											<div class="px-4 py-4 text-center">
												<p class="text-sm text-muted-foreground">
													No risks identified
												</p>
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
														event as unknown as Record<string, unknown>,
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
															onclick={() =>
																(editingEventId = event.id)}
														/>
													</li>
												{/each}
											</ul>
										{:else}
											<div class="px-4 py-4 text-center">
												<p class="text-sm text-muted-foreground">
													No events scheduled
												</p>
												<p class="text-xs text-muted-foreground/70 mt-1">
													Add events to track meetings
												</p>
											</div>
										{/if}
									{/if}

									<!-- Special Toggles (Show Completed/Deleted) -->
									<InsightSpecialToggles
										toggles={PANEL_CONFIGS[section.key].specialToggles}
										values={panelStates[section.key].toggles}
										counts={panelCounts[section.key]}
										onchange={(toggleId, value) =>
											updatePanelToggle(section.key, toggleId, value)}
									/>
								</div>
							{/if}
						</div>
					{/each}

					{#if canViewLogs}
						<!-- History Section Divider -->
						<div class="relative py-2 sm:py-4">
							<div class="absolute inset-0 flex items-center px-3 sm:px-4">
								<div class="w-full border-t border-border/40"></div>
							</div>
							<div class="relative flex justify-center">
								<span
									class="bg-background px-2 sm:px-3 text-[9px] sm:text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest"
								>
									History
								</span>
							</div>
						</div>

						<!-- Daily Briefs Panel -->
						<ProjectBriefsPanel projectId={project.id} projectName={project.name} />

						<!-- Activity Log Panel -->
						<ProjectActivityLogPanel
							projectId={project.id}
							onEntityClick={handleActivityLogEntityClick}
						/>
					{/if}
				</aside>
			{/if}
		</div>
	</main>
</div>

<!-- Document Create/Edit Modal -->
{#if showDocumentModal}
	{#await import('$lib/components/ontology/DocumentModal.svelte') then { default: DocumentModal }}
		<DocumentModal
			bind:isOpen={showDocumentModal}
			projectId={project.id}
			documentId={activeDocumentId}
			typeOptions={documentTypeOptions}
			onClose={() => {
				showDocumentModal = false;
				activeDocumentId = null;
			}}
			onSaved={handleDocumentSaved}
			onDeleted={handleDocumentDeleted}
		/>
	{/await}
{/if}

<!-- Document Move Modal -->
{#if showMoveDocModal && moveDocumentId}
	<DocMoveModal
		bind:isOpen={showMoveDocModal}
		projectId={project.id}
		documentId={moveDocumentId}
		documentTitle={moveDocumentTitle}
		structure={docTreeStructure}
		documents={docTreeDocuments}
		onClose={() => {
			showMoveDocModal = false;
			moveDocumentId = null;
		}}
		onMove={handleMoveDocumentConfirm}
	/>
{/if}

<!-- Document Delete Confirm Modal -->
{#if showDeleteDocConfirmModal && deleteDocumentId}
	<DocDeleteConfirmModal
		bind:isOpen={showDeleteDocConfirmModal}
		documentTitle={deleteDocumentTitle}
		hasChildren={deleteDocumentHasChildren}
		childCount={deleteDocumentChildCount}
		onClose={() => {
			showDeleteDocConfirmModal = false;
			deleteDocumentId = null;
		}}
		onDelete={handleDeleteDocumentConfirm}
	/>
{/if}

<!-- Task Create Modal -->
{#if showTaskCreateModal}
	{#await import('$lib/components/ontology/TaskCreateModal.svelte') then { default: TaskCreateModal }}
		<TaskCreateModal
			projectId={project.id}
			onClose={() => (showTaskCreateModal = false)}
			onCreated={handleTaskCreated}
		/>
	{/await}
{/if}

<!-- Task Edit Modal -->
{#if editingTaskId}
	<TaskEditModal
		taskId={editingTaskId}
		projectId={project.id}
		onClose={() => (editingTaskId = null)}
		onUpdated={handleTaskUpdated}
		onDeleted={handleTaskDeleted}
	/>
{/if}

<!-- Plan Create Modal -->
{#if showPlanCreateModal}
	{#await import('$lib/components/ontology/PlanCreateModal.svelte') then { default: PlanCreateModal }}
		<PlanCreateModal
			projectId={project.id}
			onClose={() => (showPlanCreateModal = false)}
			onCreated={handlePlanCreated}
		/>
	{/await}
{/if}

<!-- Plan Edit Modal -->
{#if editingPlanId}
	{#await import('$lib/components/ontology/PlanEditModal.svelte') then { default: PlanEditModal }}
		<PlanEditModal
			planId={editingPlanId}
			projectId={project.id}
			onClose={() => (editingPlanId = null)}
			onUpdated={handlePlanUpdated}
			onDeleted={handlePlanDeleted}
		/>
	{/await}
{/if}

<!-- Goal Create Modal -->
{#if showGoalCreateModal}
	{#await import('$lib/components/ontology/GoalCreateModal.svelte') then { default: GoalCreateModal }}
		<GoalCreateModal
			projectId={project.id}
			onClose={() => (showGoalCreateModal = false)}
			onCreated={handleGoalCreated}
		/>
	{/await}
{/if}

<!-- Goal Edit Modal -->
{#if editingGoalId}
	{#await import('$lib/components/ontology/GoalEditModal.svelte') then { default: GoalEditModal }}
		<GoalEditModal
			goalId={editingGoalId}
			projectId={project.id}
			onClose={() => (editingGoalId = null)}
			onUpdated={handleGoalUpdated}
			onDeleted={handleGoalDeleted}
		/>
	{/await}
{/if}

<!-- Risk Create Modal -->
{#if showRiskCreateModal}
	{#await import('$lib/components/ontology/RiskCreateModal.svelte') then { default: RiskCreateModal }}
		<RiskCreateModal
			projectId={project.id}
			onClose={() => (showRiskCreateModal = false)}
			onCreated={handleRiskCreated}
		/>
	{/await}
{/if}

<!-- Risk Edit Modal -->
{#if editingRiskId}
	{#await import('$lib/components/ontology/RiskEditModal.svelte') then { default: RiskEditModal }}
		<RiskEditModal
			riskId={editingRiskId}
			projectId={project.id}
			onClose={() => (editingRiskId = null)}
			onUpdated={handleRiskUpdated}
			onDeleted={handleRiskDeleted}
		/>
	{/await}
{/if}

<!-- Milestone Create Modal -->
{#if showMilestoneCreateModal}
	{#await import('$lib/components/ontology/MilestoneCreateModal.svelte') then { default: MilestoneCreateModal }}
		<MilestoneCreateModal
			projectId={project.id}
			{goals}
			goalId={milestoneCreateGoalContext?.goalId}
			goalName={milestoneCreateGoalContext?.goalName}
			onClose={() => {
				showMilestoneCreateModal = false;
				milestoneCreateGoalContext = null;
			}}
			onCreated={handleMilestoneCreated}
		/>
	{/await}
{/if}

<!-- Milestone Edit Modal -->
{#if editingMilestoneId}
	{#await import('$lib/components/ontology/MilestoneEditModal.svelte') then { default: MilestoneEditModal }}
		<MilestoneEditModal
			milestoneId={editingMilestoneId}
			projectId={project.id}
			onClose={() => (editingMilestoneId = null)}
			onUpdated={handleMilestoneUpdated}
			onDeleted={handleMilestoneDeleted}
		/>
	{/await}
{/if}

<!-- Event Create Modal -->
{#if showEventCreateModal}
	{#await import('$lib/components/ontology/EventCreateModal.svelte') then { default: EventCreateModal }}
		<EventCreateModal
			projectId={project.id}
			{tasks}
			onClose={() => (showEventCreateModal = false)}
			onCreated={handleEventCreated}
		/>
	{/await}
{/if}

<!-- Event Edit Modal -->
{#if editingEventId}
	{#await import('$lib/components/ontology/EventEditModal.svelte') then { default: EventEditModal }}
		<EventEditModal
			eventId={editingEventId}
			projectId={project.id}
			onClose={() => (editingEventId = null)}
			onUpdated={handleEventUpdated}
			onDeleted={handleEventDeleted}
		/>
	{/await}
{/if}

<!-- Project Calendar Settings Modal -->
{#if showProjectCalendarSettingsModal}
	{#await import('$lib/components/project/ProjectCalendarSettingsModal.svelte') then { default: ProjectCalendarSettingsModal }}
		<ProjectCalendarSettingsModal bind:isOpen={showProjectCalendarSettingsModal} {project} />
	{/await}
{/if}

<!-- Project Edit Modal -->
{#if showProjectEditModal}
	{#await import('$lib/components/ontology/OntologyProjectEditModal.svelte') then { default: OntologyProjectEditModal }}
		<OntologyProjectEditModal
			bind:isOpen={showProjectEditModal}
			{project}
			{contextDocument}
			onClose={() => (showProjectEditModal = false)}
			onSaved={async () => {
				await refreshData();
				showProjectEditModal = false;
			}}
		/>
	{/await}
{/if}

<!-- Project Share Modal -->
{#if showShareModal && canInvite}
	<ProjectShareModal
		bind:isOpen={showShareModal}
		projectId={project.id}
		projectName={project.name || 'Project'}
		onClose={() => (showShareModal = false)}
	/>
{/if}

<!-- Project Delete Confirmation -->
{#if showDeleteProjectModal}
	<ConfirmationModal
		title="Delete project"
		confirmText="Delete"
		confirmVariant="danger"
		isOpen={showDeleteProjectModal}
		loading={isDeletingProject}
		onconfirm={handleProjectDeleteConfirm}
		oncancel={() => (showDeleteProjectModal = false)}
	>
		{#snippet content()}
			<p class="text-sm text-muted-foreground">
				This will permanently delete <span class="font-semibold text-foreground"
					>{project.name}</span
				>
				and all related data. This action cannot be undone.
			</p>
		{/snippet}
		{#snippet details()}
			{#if deleteProjectError}
				<p class="mt-2 text-sm text-destructive">
					{deleteProjectError}
				</p>
			{/if}
		{/snippet}
	</ConfirmationModal>
{/if}

<!-- Mobile Menu Portal - Rendered outside all containers to avoid z-index issues -->
{#if showMobileMenu}
	<button
		type="button"
		class="fixed inset-0 z-[9998] bg-transparent"
		onclick={() => (showMobileMenu = false)}
		aria-label="Close menu"
	></button>
	<div
		class="fixed z-[9999] w-44 rounded-lg border border-border bg-card shadow-ink-strong py-1"
		style="top: {mobileMenuPos.top}px; right: {mobileMenuPos.right}px;"
	>
		{#if graphHidden}
			<button
				onclick={() => {
					showMobileMenu = false;
					handleGraphShow();
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors pressable"
			>
				<GitBranch class="w-4 h-4 text-muted-foreground" />
				Show graph
			</button>
		{/if}
		{#if canInvite}
			<button
				onclick={() => {
					showMobileMenu = false;
					showShareModal = true;
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors pressable"
			>
				<UserPlus class="w-4 h-4 text-muted-foreground" />
				Share project
			</button>
		{/if}
		{#if canEdit}
			<button
				onclick={() => {
					showMobileMenu = false;
					showProjectEditModal = true;
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors pressable"
			>
				<Pencil class="w-4 h-4 text-muted-foreground" />
				Edit project
			</button>
			<button
				onclick={() => {
					showMobileMenu = false;
					showProjectCalendarSettingsModal = true;
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors pressable"
			>
				<Calendar class="w-4 h-4 text-muted-foreground" />
				Calendar settings
			</button>
		{/if}
		{#if canAdmin}
			<hr class="my-1 border-border" />
			<button
				onclick={() => {
					showMobileMenu = false;
					showDeleteProjectModal = true;
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors pressable"
			>
				<Trash2 class="w-4 h-4" />
				Delete project
			</button>
		{/if}
	</div>
{/if}
