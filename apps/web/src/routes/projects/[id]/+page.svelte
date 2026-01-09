<!-- apps/web/src/routes/projects/[id]/+page.svelte -->
<!--
	Ontology Project Detail - Deliverables-Centric View

	PERFORMANCE: Uses skeleton-first loading for instant perceived performance.
	- Skeleton renders immediately with project name and entity counts
	- Full data hydrates in background via /api/onto/projects/[id]/full
	- No layout shifts during hydration (skeleton matches final dimensions)
	- View Transitions API animates title from source page

	Deliverable-first layout focusing on outputs as the primary cards:
	- Outputs as the primary cards with primitive filter (document, event, collection, external)
	- Documents live directly below as lighter cards ready for promotion
	- Right rail shows collapsible stacks for goals, plans, tasks, risks, milestones
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
	- Output Create: /apps/web/src/lib/components/ontology/OutputCreateModal.svelte
	- Output Editing: /apps/web/src/lib/components/ontology/OutputEditModal.svelte
	- Document Management: /apps/web/src/lib/components/ontology/DocumentModal.svelte
	- Project Editing: /apps/web/src/lib/components/ontology/OntologyProjectEditModal.svelte
	- State Display: /apps/web/src/lib/components/ontology/StateDisplay.svelte

	API Integration:
	- Server Data Loading: /apps/web/src/routes/projects/[id]/+page.server.ts
	- Project API: /apps/web/src/routes/api/onto/projects/
	- Task API: /apps/web/src/routes/api/onto/tasks/
	- Plan API: /apps/web/src/routes/api/onto/plans/
	- Goal API: /apps/web/src/routes/api/onto/goals/
	- Output API: /apps/web/src/routes/api/onto/outputs/
	- Document API: /apps/web/src/routes/api/onto/documents/

	Type Definitions:
	- Deliverable Primitives: /apps/web/src/lib/types/onto.ts (getDeliverablePrimitive, isCollectionDeliverable, etc.)
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { getNavigationData } from '$lib/stores/project-navigation.store';
	import InsightPanelSkeleton from '$lib/components/ontology/InsightPanelSkeleton.svelte';
	import ProjectContentSkeleton from '$lib/components/ontology/ProjectContentSkeleton.svelte';
	import {
		Plus,
		FileText,
		Calendar,
		Layers,
		ExternalLink,
		Pencil,
		Trash2,
		ArrowLeft,
		CheckCircle2,
		Circle,
		Clock,
		Sparkles,
		Target,
		ChevronDown,
		AlertTriangle,
		Flag,
		ListChecks,
		MoreVertical,
		GitBranch
	} from 'lucide-svelte';
	import type {
		Project,
		Task,
		Output,
		Document,
		Plan,
		Decision,
		OntoEvent
	} from '$lib/types/onto';
	import {
		getDeliverablePrimitive,
		isCollectionDeliverable,
		type DeliverablePrimitive
	} from '$lib/types/onto';
	import type { PageData } from './$types';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import NextStepDisplay from '$lib/components/project/NextStepDisplay.svelte';
	import StateDisplay from '$lib/components/ontology/StateDisplay.svelte';
	import TaskEditModal from '$lib/components/ontology/TaskEditModal.svelte';
	import ProjectGraphSection from '$lib/components/ontology/ProjectGraphSection.svelte';
	import ProjectActivityLogPanel from '$lib/components/ontology/ProjectActivityLogPanel.svelte';
	import ProjectBriefsPanel from '$lib/components/ontology/ProjectBriefsPanel.svelte';
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
	interface Goal {
		id: string;
		name: string;
		type_key?: string | null;
		state_key: string;
		props?: Record<string, unknown>;
	}

	interface Milestone {
		id: string;
		title: string;
		due_at: string | null;
		state_key?: string | null;
		props?: Record<string, unknown> | null;
	}

	interface Risk {
		id: string;
		title: string;
		impact?: string | null;
		state_key?: string | null;
		props?: Record<string, unknown> | null;
	}

	type OntoEventWithSync = OntoEvent & {
		onto_event_sync?: Database['public']['Tables']['onto_event_sync']['Row'][];
	};

	// Import MobileCommandCenter for mobile-first layout
	import MobileCommandCenter from '$lib/components/project/MobileCommandCenter.svelte';

	type InsightPanelKey = 'tasks' | 'plans' | 'goals' | 'risks' | 'milestones' | 'events';

	type InsightPanel = {
		key: InsightPanelKey;
		label: string;
		icon: typeof CheckCircle2;
		items: Array<unknown>;
		description?: string;
	};

	// State colors for output badges
	const STATE_COLUMNS = [
		{ key: 'draft', label: 'Draft', color: 'bg-muted' },
		{ key: 'in_progress', label: 'In Progress', color: 'bg-accent/10' },
		{ key: 'review', label: 'In Review', color: 'bg-amber-500/10' },
		{ key: 'published', label: 'Published', color: 'bg-emerald-500/10' }
	];

	// Primitive icons and labels - semantic colors for each type
	const PRIMITIVE_CONFIG: Record<
		DeliverablePrimitive,
		{ icon: typeof FileText; label: string; color: string }
	> = {
		document: { icon: FileText, label: 'Document', color: 'text-accent' },
		event: { icon: Calendar, label: 'Event', color: 'text-purple-500' },
		collection: { icon: Layers, label: 'Collection', color: 'text-amber-500' },
		external: { icon: ExternalLink, label: 'External', color: 'text-emerald-500' }
	};

	// ============================================================
	// PROPS & DATA
	// ============================================================
	let { data }: { data: PageData } = $props();

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
					output_count: number;
					document_count: number;
					goal_count: number;
					plan_count: number;
					milestone_count: number;
					risk_count: number;
					decision_count: number;
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
	let outputs = $state(data.skeleton ? ([] as Output[]) : ((data.outputs || []) as Output[]));
	let documents = $state(
		data.skeleton ? ([] as Document[]) : ((data.documents || []) as Document[])
	);
	let plans = $state(data.skeleton ? ([] as Plan[]) : ((data.plans || []) as Plan[]));
	let goals = $state(data.skeleton ? ([] as Goal[]) : ((data.goals || []) as Goal[]));
	let milestones = $state(
		data.skeleton ? ([] as Milestone[]) : ((data.milestones || []) as Milestone[])
	);
	let risks = $state(data.skeleton ? ([] as Risk[]) : ((data.risks || []) as Risk[]));
	let decisions = $state(
		data.skeleton ? ([] as Decision[]) : ((data.decisions || []) as Decision[])
	);
	let events = $state(
		data.skeleton ? ([] as OntoEventWithSync[]) : ((data.events || []) as OntoEventWithSync[])
	);
	let contextDocument = $state(
		data.skeleton ? null : ((data.context_document || null) as Document | null)
	);

	// Modal states
	let showOutputCreateModal = $state(false);
	let showDocumentModal = $state(false);
	let activeDocumentId = $state<string | null>(null);
	let showTaskCreateModal = $state(false);
	let showPlanCreateModal = $state(false);
	let showGoalCreateModal = $state(false);
	let showProjectEditModal = $state(false);
	let showDeleteProjectModal = $state(false);
	let showProjectCalendarSettingsModal = $state(false);
	let isDeletingProject = $state(false);
	let deleteProjectError = $state<string | null>(null);
	let editingTaskId = $state<string | null>(null);
	let editingPlanId = $state<string | null>(null);
	let editingGoalId = $state<string | null>(null);
	let editingOutputId = $state<string | null>(null);
	let showRiskCreateModal = $state(false);
	let editingRiskId = $state<string | null>(null);
	let showMilestoneCreateModal = $state(false);
	let editingMilestoneId = $state<string | null>(null);
	let showDecisionCreateModal = $state(false);
	let editingDecisionId = $state<string | null>(null);
	let showEventCreateModal = $state(false);
	let editingEventId = $state<string | null>(null);

	// UI State
	let dataRefreshing = $state(false);
	let outputsExpanded = $state(true);
	let documentsExpanded = $state(true);
	let expandedPanels = $state<Record<InsightPanelKey, boolean>>({
		tasks: false,
		plans: false,
		goals: true,
		events: false,
		risks: false,
		milestones: false
	});
	let showMobileMenu = $state(false);

	// Insight panel filter/sort state
	let panelStates = $state(createDefaultPanelStates());

	// Graph visibility state - load from localStorage on mount
	let graphHidden = $state(
		typeof localStorage !== 'undefined'
			? localStorage.getItem('buildos:project-graph-hidden') === 'true'
			: false
	);

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
			outputs = fullData.outputs || [];
			documents = fullData.documents || [];
			plans = fullData.plans || [];
			goals = fullData.goals || [];
			milestones = fullData.milestones || [];
			risks = fullData.risks || [];
			decisions = fullData.decisions || [];
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

	const projectStats = $derived.by(() => ({
		outputs: outputs.length,
		documents: documents.length,
		tasks: tasks.length,
		plans: plans.length,
		goals: goals.length
	}));

	const documentTypeOptions = $derived.by(() => {
		const set = new Set<string>();
		for (const doc of documents) {
			if (doc.type_key) set.add(doc.type_key);
		}
		return Array.from(set);
	});

	// Enrich outputs with primitive info
	const enrichedOutputs = $derived(
		outputs.map((output) => ({
			...output,
			primitive: getDeliverablePrimitive(output.type_key) || 'document',
			typeLabel: getTypeLabel(output.type_key),
			taskCount: getRelatedTaskCount(output.id),
			childCount: isCollectionDeliverable(output.type_key) ? getChildCount(output) : undefined
		}))
	);

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
			if (!toggles.showCompleted && item.state_key === 'completed') return false;
			if (!toggles.showMissed && item.state_key === 'missed') return false;
		} else if (entityType === 'risks') {
			if (!toggles.showClosed && item.state_key === 'closed') return false;
		} else if (entityType === 'events') {
			if (!toggles.showCancelled && item.state_key === 'cancelled') return false;
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
			showCompleted: milestones.filter((m) => m.state_key === 'completed').length,
			showMissed: milestones.filter((m) => m.state_key === 'missed').length,
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

	const insightPanels: InsightPanel[] = $derived([
		{
			key: 'goals',
			label: 'Goals',
			icon: Target,
			items: filteredGoals,
			description: 'What success looks like'
		},
		{
			key: 'milestones',
			label: 'Milestones',
			icon: Flag,
			items: filteredMilestones,
			description: 'Checkpoints and dates'
		},
		{
			key: 'events',
			label: 'Events',
			icon: Clock,
			items: filteredEvents,
			description: 'Meetings and time blocks'
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

	/**
	 * Extracts the canonical state key for matching against STATE_COLUMNS.
	 * Maps various state string variants to their canonical lowercase keys.
	 */
	function getStateKey(state: string): string {
		const s = state?.toLowerCase() || 'draft';
		if (s === 'complete' || s === 'completed' || s === 'shipped' || s === 'published')
			return 'published';
		if (s === 'in_review' || s === 'reviewing' || s === 'review') return 'review';
		if (s === 'approved') return 'published';
		if (s === 'in_progress' || s === 'active') return 'in_progress';
		if (s === 'drafting' || s === 'draft') return 'draft';
		// Check if it's already a valid key
		if (STATE_COLUMNS.some((c) => c.key === s)) return s;
		return 'draft';
	}

	/**
	 * Returns a human-readable label for the state (Title Case).
	 * Uses STATE_COLUMNS.label for consistent display.
	 */
	function normalizeState(state: string): string {
		const key = getStateKey(state);
		const col = STATE_COLUMNS.find((c) => c.key === key);
		return col?.label || 'Draft';
	}

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

	function getRelatedTaskCount(outputId: string): number {
		return tasks.filter((t) => {
			const props = t.props as Record<string, unknown>;
			return props?.output_id === outputId;
		}).length;
	}

	function getChildCount(output: Output): number {
		const props = output.props as Record<string, unknown>;
		if (Array.isArray(props?.children)) {
			return props.children.length;
		}
		if (Array.isArray(props?.chapters)) {
			return props.chapters.length;
		}
		return 0;
	}

	function getPrimitiveIcon(primitive: DeliverablePrimitive) {
		return PRIMITIVE_CONFIG[primitive]?.icon || FileText;
	}

	function getPrimitiveColor(primitive: DeliverablePrimitive) {
		return PRIMITIVE_CONFIG[primitive]?.color || 'text-muted-foreground';
	}

	function getStateColor(state: string): string {
		const key = getStateKey(state);
		const col = STATE_COLUMNS.find((c) => c.key === key);
		return col?.color || 'bg-muted';
	}

	function togglePanel(key: InsightPanelKey) {
		expandedPanels = { ...expandedPanels, [key]: !expandedPanels[key] };
	}

	function openCreateModalForPanel(key: InsightPanelKey) {
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
			case 'milestones':
				showMilestoneCreateModal = true;
				break;
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
			outputs = newData.outputs || [];
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

	async function handleOutputCreated() {
		await refreshData();
		showOutputCreateModal = false;
	}

	async function handleOutputUpdated() {
		await refreshData();
		editingOutputId = null;
	}

	async function handleOutputDeleted() {
		await refreshData();
		editingOutputId = null;
	}

	async function handleDocumentSaved() {
		await refreshData();
		showDocumentModal = false;
		activeDocumentId = null;
	}

	async function handleDocumentDeleted() {
		await refreshData();
		showDocumentModal = false;
		activeDocumentId = null;
	}

	async function handleTaskCreated() {
		await refreshData();
		showTaskCreateModal = false;
	}

	async function handleTaskUpdated() {
		await refreshData();
		editingTaskId = null;
	}

	async function handleTaskDeleted() {
		await refreshData();
		editingTaskId = null;
	}

	async function handlePlanCreated() {
		await refreshData();
		showPlanCreateModal = false;
	}

	async function handlePlanUpdated() {
		await refreshData();
		editingPlanId = null;
	}

	async function handlePlanDeleted() {
		await refreshData();
		editingPlanId = null;
	}

	async function handleGoalCreated() {
		await refreshData();
		showGoalCreateModal = false;
	}

	async function handleGoalUpdated() {
		await refreshData();
		editingGoalId = null;
	}

	async function handleGoalDeleted() {
		await refreshData();
		editingGoalId = null;
	}

	async function handleRiskCreated() {
		await refreshData();
		showRiskCreateModal = false;
	}

	async function handleRiskUpdated() {
		await refreshData();
		editingRiskId = null;
	}

	async function handleRiskDeleted() {
		await refreshData();
		editingRiskId = null;
	}

	async function handleMilestoneCreated() {
		await refreshData();
		showMilestoneCreateModal = false;
	}

	async function handleMilestoneUpdated() {
		await refreshData();
		editingMilestoneId = null;
	}

	async function handleMilestoneDeleted() {
		await refreshData();
		editingMilestoneId = null;
	}

	async function handleDecisionCreated() {
		await refreshData();
		showDecisionCreateModal = false;
	}

	async function handleDecisionUpdated() {
		await refreshData();
		editingDecisionId = null;
	}

	async function handleDecisionDeleted() {
		await refreshData();
		editingDecisionId = null;
	}

	async function handleEventCreated() {
		await loadProjectEvents(true);
		showEventCreateModal = false;
	}

	async function handleEventUpdated() {
		await loadProjectEvents(true);
		editingEventId = null;
	}

	async function handleEventDeleted() {
		await loadProjectEvents(true);
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
			case 'output':
				editingOutputId = ref.id;
				break;
			case 'document':
				activeDocumentId = ref.id;
				showDocumentModal = true;
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
			case 'output':
				editingOutputId = node.id;
				break;
			case 'document':
				activeDocumentId = node.id;
				showDocumentModal = true;
				break;
			case 'milestone':
				editingMilestoneId = node.id;
				break;
			case 'project':
				// Already on this project page, do nothing
				break;
			default:
				console.warn(`Unknown graph node type clicked: ${node.type}`);
		}
	}

	function handleGraphHide() {
		graphHidden = true;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('buildos:project-graph-hidden', 'true');
		}
	}

	function handleGraphShow() {
		graphHidden = false;
		if (typeof localStorage !== 'undefined') {
			localStorage.removeItem('buildos:project-graph-hidden');
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
			case 'output':
				editingOutputId = entityId;
				break;
			case 'note':
				// Notes are documents
				activeDocumentId = entityId;
				showDocumentModal = true;
				break;
			case 'milestone':
				editingMilestoneId = entityId;
				break;
			case 'risk':
				editingRiskId = entityId;
				break;
			case 'project':
				// Already on this project page, open edit modal
				showProjectEditModal = true;
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
	<!-- Header -->
	<header
		class="sticky top-0 z-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
	>
		<div
			class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 py-1.5 sm:py-3 space-y-1 sm:space-y-3"
		>
			<!-- Title Row -->
			<div class="flex items-center justify-between gap-1.5 sm:gap-2">
				<div class="flex items-center gap-1.5 sm:gap-3 min-w-0">
					<button
						onclick={() => goto('/projects')}
						class="p-1 sm:p-2 rounded-lg hover:bg-muted transition-colors shrink-0"
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
							aria-label="Show relationship graph"
							title="Show relationship graph"
						>
							<GitBranch class="w-5 h-5 text-muted-foreground" />
						</button>
					{/if}
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
					<button
						onclick={() => (showDeleteProjectModal = true)}
						class="p-2 rounded-lg hover:bg-destructive/10 transition-colors pressable"
						aria-label="Delete project"
					>
						<Trash2 class="w-5 h-5 text-destructive" />
					</button>
				</div>

				<!-- Mobile: State + 3-dot menu -->
				<div class="flex items-center gap-1.5 sm:hidden">
					<StateDisplay state={project.state_key} entityKind="project" />
					<div class="relative">
						<button
							onclick={() => (showMobileMenu = !showMobileMenu)}
							class="p-1.5 rounded-lg hover:bg-muted transition-colors pressable"
							aria-label="Project options"
							aria-expanded={showMobileMenu}
						>
							<MoreVertical class="w-5 h-5 text-muted-foreground" />
						</button>

						{#if showMobileMenu}
							<!-- Backdrop -->
							<button
								type="button"
								class="fixed inset-0 z-0"
								onclick={() => (showMobileMenu = false)}
								aria-label="Close menu"
							></button>

							<!-- Dropdown -->
							<div
								class="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-border bg-card shadow-ink-strong py-1 tx tx-frame tx-weak"
							>
								{#if graphHidden}
									<button
										onclick={() => {
											showMobileMenu = false;
											handleGraphShow();
										}}
										class="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
									>
										<GitBranch class="w-4 h-4 text-muted-foreground" />
										Show graph
									</button>
								{/if}
								<button
									onclick={() => {
										showMobileMenu = false;
										showProjectEditModal = true;
									}}
									class="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
								>
									<Pencil class="w-4 h-4 text-muted-foreground" />
									Edit project
								</button>
								<button
									onclick={() => {
										showMobileMenu = false;
										showProjectCalendarSettingsModal = true;
									}}
									class="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
								>
									<Calendar class="w-4 h-4 text-muted-foreground" />
									Calendar settings
								</button>
								<hr class="my-1 border-border" />
								<button
									onclick={() => {
										showMobileMenu = false;
										showDeleteProjectModal = true;
									}}
									class="w-full flex items-center gap-3 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
								>
									<Trash2 class="w-4 h-4" />
									Delete project
								</button>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Mobile: Compact entity count summary bar -->
			{#if true}
				{@const mobileStats = [
					{ key: 'tasks', count: tasks.length, Icon: ListChecks },
					{ key: 'outputs', count: outputs.length, Icon: Layers },
					{ key: 'docs', count: documents.length, Icon: FileText },
					{ key: 'goals', count: goals.length, Icon: Target },
					{ key: 'plans', count: plans.length, Icon: Calendar }
				].filter((s) => s.count > 0)}
				{#if mobileStats.length > 0}
					<div
						class="flex sm:hidden items-center gap-2.5 text-muted-foreground overflow-x-auto pb-0.5"
					>
						{#each mobileStats as stat (stat.key)}
							{@const StatIcon = stat.Icon}
							<span class="flex items-center gap-0.5 shrink-0" title={stat.key}>
								<StatIcon class="h-3 w-3" />
								<span class="font-semibold text-[10px]">{stat.count}</span>
							</span>
						{/each}
					</div>
				{/if}
			{/if}

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
		<div class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 pt-4">
			<ProjectGraphSection
				projectId={project.id}
				onNodeClick={handleGraphNodeClick}
				onHide={handleGraphHide}
			/>
		</div>
	{/if}

	<!-- Main Content -->
	<main class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 py-2 sm:py-6 overflow-x-hidden">
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
					{#each skeletonRows as _}
						<div class="flex flex-wrap gap-1.5">
							<div
								class="w-[calc(50%-3px)] h-[52px] bg-muted animate-pulse rounded-lg"
							></div>
							<div
								class="w-[calc(50%-3px)] h-[52px] bg-muted animate-pulse rounded-lg"
							></div>
						</div>
					{/each}
				</div>
			{:else}
				<MobileCommandCenter
					{goals}
					{milestones}
					{tasks}
					{plans}
					{risks}
					{decisions}
					{documents}
					{outputs}
					{events}
					onAddGoal={() => (showGoalCreateModal = true)}
					onAddMilestone={() => (showMilestoneCreateModal = true)}
					onAddTask={() => (showTaskCreateModal = true)}
					onAddPlan={() => (showPlanCreateModal = true)}
					onAddRisk={() => (showRiskCreateModal = true)}
					onAddDecision={() => (showDecisionCreateModal = true)}
					onAddDocument={() => {
						activeDocumentId = null;
						showDocumentModal = true;
					}}
					onAddOutput={() => (showOutputCreateModal = true)}
					onAddEvent={() => (showEventCreateModal = true)}
					onEditGoal={(id) => (editingGoalId = id)}
					onEditMilestone={(id) => (editingMilestoneId = id)}
					onEditTask={(id) => (editingTaskId = id)}
					onEditPlan={(id) => (editingPlanId = id)}
					onEditRisk={(id) => (editingRiskId = id)}
					onEditDecision={(id) => (editingDecisionId = id)}
					onEditDocument={(id) => {
						activeDocumentId = id;
						showDocumentModal = true;
					}}
					onEditOutput={(id) => (editingOutputId = id)}
					onEditEvent={(id) => (editingEventId = id)}
				/>
			{/if}
		</div>

		<!-- Desktop Layout (hidden on mobile) -->
		<div
			class="hidden sm:grid sm:grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] gap-2 sm:gap-4 lg:gap-6"
		>
			<!-- Left Column: Outputs & Documents -->
			{#if isHydrating && skeletonCounts}
				<!-- Skeleton state - show loading placeholders with counts -->
				<ProjectContentSkeleton
					outputCount={skeletonCounts.output_count}
					documentCount={skeletonCounts.document_count}
				/>
			{:else}
				<!-- Hydrated state - show real content -->
				<div class="min-w-0 space-y-2 sm:space-y-4">
					<!-- Outputs Section - Collapsible -->
					<section
						class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<div
							class="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3"
						>
							<button
								onclick={() => (outputsExpanded = !outputsExpanded)}
								class="flex items-center gap-2 sm:gap-3 flex-1 text-left hover:bg-muted/60 -m-2 sm:-m-3 p-2 sm:p-3 rounded-lg transition-colors"
							>
								<div
									class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-muted flex items-center justify-center"
								>
									<Layers class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-foreground" />
								</div>
								<div>
									<p class="text-xs sm:text-sm font-semibold text-foreground">
										Outputs
									</p>
									<p class="text-[10px] sm:text-xs text-muted-foreground">
										{outputs.length}
										{outputs.length === 1 ? 'deliverable' : 'deliverables'}
									</p>
								</div>
							</button>
							<div class="flex items-center gap-1 sm:gap-2">
								<button
									onclick={() => (showOutputCreateModal = true)}
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors"
									aria-label="Add output"
								>
									<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
								</button>
								<button
									onclick={() => (outputsExpanded = !outputsExpanded)}
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors"
									aria-label={outputsExpanded
										? 'Collapse outputs'
										: 'Expand outputs'}
								>
									<ChevronDown
										class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform duration-[120ms] {outputsExpanded
											? 'rotate-180'
											: ''}"
									/>
								</button>
							</div>
						</div>

						{#if outputsExpanded}
							<div
								class="border-t border-border"
								transition:slide={{ duration: 120 }}
							>
								{#if outputs.length === 0}
									<div
										class="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-4 bg-muted/30 tx tx-bloom tx-weak"
									>
										<div
											class="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center"
										>
											<Sparkles class="w-3 h-3 sm:w-4 sm:h-4 text-accent" />
										</div>
										<div>
											<p class="text-xs sm:text-sm text-foreground">
												No outputs yet
											</p>
											<p class="text-[10px] sm:text-xs text-muted-foreground">
												Create one to start delivering
											</p>
										</div>
									</div>
								{:else}
									<ul class="divide-y divide-border/80">
										{#each enrichedOutputs as output}
											{@const PrimitiveIcon = getPrimitiveIcon(
												output.primitive
											)}
											<li>
												<button
													type="button"
													onclick={() => (editingOutputId = output.id)}
													class="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
												>
													<div
														class="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-muted flex items-center justify-center flex-shrink-0"
													>
														<PrimitiveIcon
															class="w-3 h-3 sm:w-4 sm:h-4 {getPrimitiveColor(
																output.primitive
															)}"
														/>
													</div>
													<div class="min-w-0 flex-1">
														<p
															class="text-xs sm:text-sm text-foreground truncate"
														>
															{output.name}
														</p>
														<p
															class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
														>
															{output.typeLabel}
														</p>
													</div>
													<span
														class="flex-shrink-0 text-[9px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-border {getStateColor(
															output.state_key
														)}"
													>
														{normalizeState(output.state_key)}
													</span>
												</button>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/if}
					</section>

					<!-- Documents Section - Collapsible -->
					<section
						class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<div
							class="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3"
						>
							<button
								onclick={() => (documentsExpanded = !documentsExpanded)}
								class="flex items-center gap-2 sm:gap-3 flex-1 text-left hover:bg-muted/60 -m-2 sm:-m-3 p-2 sm:p-3 rounded-lg transition-colors"
							>
								<div
									class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-muted flex items-center justify-center"
								>
									<FileText class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-foreground" />
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
								<button
									onclick={() => {
										activeDocumentId = null;
										showDocumentModal = true;
									}}
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors"
									aria-label="Add document"
								>
									<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
								</button>
								<button
									onclick={() => (documentsExpanded = !documentsExpanded)}
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors"
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
								{#if documents.length === 0}
									<div
										class="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-4 bg-muted/30 tx tx-bloom tx-weak"
									>
										<div
											class="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center"
										>
											<FileText class="w-3 h-3 sm:w-4 sm:h-4 text-accent" />
										</div>
										<div>
											<p class="text-xs sm:text-sm text-foreground">
												No documents yet
											</p>
											<p class="text-[10px] sm:text-xs text-muted-foreground">
												Add notes, research, or drafts
											</p>
										</div>
									</div>
								{:else}
									<ul class="divide-y divide-border/80">
										{#each documents as doc}
											<li>
												<button
													type="button"
													onclick={() => {
														activeDocumentId = doc.id;
														showDocumentModal = true;
													}}
													class="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
												>
													<div
														class="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0"
													>
														<FileText
															class="w-3 h-3 sm:w-4 sm:h-4 text-accent"
														/>
													</div>
													<div class="min-w-0 flex-1">
														<p
															class="text-xs sm:text-sm text-foreground truncate"
														>
															{doc.title}
														</p>
														<p
															class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
														>
															{getTypeLabel(doc.type_key)}
														</p>
													</div>
													<span
														class="flex-shrink-0 text-[9px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-card border border-border capitalize"
													>
														{(doc.state_key || 'draft').replace(
															/_/g,
															' '
														)}
													</span>
												</button>
											</li>
										{/each}
									</ul>
								{/if}
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
						icon={Flag}
						label="Milestones"
						count={skeletonCounts.milestone_count}
						description="Checkpoints and dates"
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
						class="bg-card border border-border rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<div class="flex items-center gap-3 px-4 py-3">
							<div
								class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center"
							>
								<FileText class="w-4 h-4 text-foreground" />
							</div>
							<div>
								<p class="text-sm font-semibold text-foreground">Daily Briefs</p>
								<p class="text-xs text-muted-foreground">AI-generated summaries</p>
							</div>
						</div>
					</div>

					<!-- Activity Log Panel - loads lazily, show placeholder -->
					<div
						class="bg-card border border-border rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<div class="flex items-center gap-3 px-4 py-3">
							<div
								class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center"
							>
								<Clock class="w-4 h-4 text-foreground" />
							</div>
							<div>
								<p class="text-sm font-semibold text-foreground">Activity Log</p>
								<p class="text-xs text-muted-foreground">Recent changes</p>
							</div>
						</div>
					</div>
				</aside>
			{:else}
				<!-- Hydrated insight panels -->
				<aside class="min-w-0 space-y-2 sm:space-y-3 lg:sticky lg:top-24">
					{#each insightPanels as section}
						{@const isOpen = expandedPanels[section.key]}
						{@const SectionIcon = section.icon}
						<div
							class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
						>
							<div
								class="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3"
							>
								<button
									onclick={() => togglePanel(section.key)}
									class="flex items-center gap-2 sm:gap-3 flex-1 text-left hover:bg-muted/60 -m-2 sm:-m-3 p-2 sm:p-3 rounded-lg transition-colors"
								>
									<div
										class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-muted flex items-center justify-center"
									>
										<SectionIcon
											class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-foreground"
										/>
									</div>
									<div class="min-w-0">
										<p class="text-xs sm:text-sm font-semibold text-foreground">
											{section.label}
											<span class="text-muted-foreground font-normal"
												>({section.items.length})</span
											>
										</p>
										<p
											class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
										>
											{#if section.description}
												{section.description}
											{/if}
										</p>
									</div>
								</button>
								<div class="flex items-center gap-1 sm:gap-2">
									<button
										onclick={() => openCreateModalForPanel(section.key)}
										class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors"
										aria-label="Add {section.label.toLowerCase()}"
									>
										<Plus
											class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground"
										/>
									</button>
									<button
										onclick={() => togglePanel(section.key)}
										class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors"
										aria-label={isOpen
											? `Collapse ${section.label.toLowerCase()}`
											: `Expand ${section.label.toLowerCase()}`}
									>
										<ChevronDown
											class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform duration-[120ms] {isOpen
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
										class="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20"
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
													{@const visuals = getTaskVisuals(
														task.state_key
													)}
													{@const TaskIcon = visuals.icon}
													{@const sortDisplay = getSortValueDisplay(
														task as unknown as Record<string, unknown>,
														panelStates.tasks.sort.field,
														'tasks'
													)}
													<li>
														<div class="flex items-center min-w-0">
															<button
																type="button"
																onclick={() =>
																	(editingTaskId = task.id)}
																class="flex-1 min-w-0 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
															>
																<TaskIcon
																	class="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 {visuals.color}"
																/>
																<div class="min-w-0 flex-1">
																	<p
																		class="text-xs sm:text-sm text-foreground truncate"
																	>
																		{task.title}
																	</p>
																	<p
																		class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
																	>
																		<span class="capitalize"
																			>{(
																				task.state_key ||
																				'draft'
																			).replace(
																				/_/g,
																				' '
																			)}</span
																		>
																		<span
																			class="mx-1 opacity-50"
																			>·</span
																		>
																		<span
																			class={sortDisplay.color ||
																				''}
																		>
																			{sortDisplay.value}
																		</span>
																	</p>
																</div>
															</button>
															<a
																href="/projects/{project.id}/tasks/{task.id}"
																class="flex-shrink-0 p-1.5 sm:p-2 mr-1.5 sm:mr-2 rounded-lg hover:bg-accent/10 transition-colors pressable"
																title="Open task focus page"
															>
																<ExternalLink
																	class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground hover:text-accent"
																/>
															</a>
														</div>
													</li>
												{/each}
											</ul>
										{:else}
											<div class="px-3 sm:px-4 py-3 sm:py-4 text-center">
												<p class="text-xs sm:text-sm text-muted-foreground">
													No tasks yet
												</p>
												<p
													class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block"
												>
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
														<button
															type="button"
															onclick={() =>
																(editingPlanId = plan.id)}
															class="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
														>
															<Calendar
																class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground"
															/>
															<div class="min-w-0">
																<p
																	class="text-xs sm:text-sm text-foreground truncate"
																>
																	{plan.name}
																</p>
																<p
																	class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
																>
																	<span class="capitalize"
																		>{(
																			plan.state_key ||
																			'draft'
																		).replace(/_/g, ' ')}</span
																	>
																	<span class="mx-1 opacity-50"
																		>·</span
																	>
																	<span
																		class={sortDisplay.color ||
																			''}
																	>
																		{sortDisplay.value}
																	</span>
																</p>
															</div>
														</button>
													</li>
												{/each}
											</ul>
										{:else}
											<div class="px-3 sm:px-4 py-3 sm:py-4 text-center">
												<p class="text-xs sm:text-sm text-muted-foreground">
													No plans yet
												</p>
												<p
													class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block"
												>
													Create a plan to organize work
												</p>
											</div>
										{/if}
									{:else if section.key === 'goals'}
										{#if filteredGoals.length > 0}
											<ul class="divide-y divide-border/80">
												{#each filteredGoals as goal}
													{@const sortDisplay = getSortValueDisplay(
														goal as unknown as Record<string, unknown>,
														panelStates.goals.sort.field,
														'goals'
													)}
													<li>
														<button
															type="button"
															onclick={() =>
																(editingGoalId = goal.id)}
															class="w-full flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
														>
															<Target
																class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 mt-0.5"
															/>
															<div class="min-w-0">
																<p
																	class="text-xs sm:text-sm text-foreground truncate"
																>
																	{goal.name}
																</p>
																<p
																	class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
																>
																	<span class="capitalize"
																		>{(
																			goal.state_key ||
																			'draft'
																		).replace(/_/g, ' ')}</span
																	>
																	<span class="mx-1 opacity-50"
																		>·</span
																	>
																	<span
																		class={sortDisplay.color ||
																			''}
																	>
																		{sortDisplay.value}
																	</span>
																</p>
															</div>
														</button>
													</li>
												{/each}
											</ul>
										{:else}
											<div class="px-3 sm:px-4 py-3 sm:py-4 text-center">
												<p class="text-xs sm:text-sm text-muted-foreground">
													No goals yet
												</p>
												<p
													class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block"
												>
													Define what success looks like
												</p>
											</div>
										{/if}
									{:else if section.key === 'risks'}
										{#if filteredRisks.length > 0}
											<ul class="divide-y divide-border/80">
												{#each filteredRisks as risk}
													{@const impactColor =
														risk.impact === 'critical'
															? 'text-destructive'
															: risk.impact === 'high'
																? 'text-orange-500'
																: risk.impact === 'medium'
																	? 'text-amber-500'
																	: 'text-emerald-500'}
													{@const sortDisplay = getSortValueDisplay(
														risk as unknown as Record<string, unknown>,
														panelStates.risks.sort.field,
														'risks'
													)}
													<li>
														<button
															type="button"
															onclick={() =>
																(editingRiskId = risk.id)}
															class="w-full flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
														>
															<AlertTriangle
																class="w-3.5 h-3.5 sm:w-4 sm:h-4 {impactColor} mt-0.5"
															/>
															<div class="min-w-0 flex-1">
																<p
																	class="text-xs sm:text-sm text-foreground truncate"
																>
																	{risk.title}
																</p>
																<p
																	class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
																>
																	<span class="capitalize"
																		>{risk.state_key?.replace(
																			/_/g,
																			' '
																		) || 'identified'}</span
																	>
																	<span class="mx-1 opacity-50"
																		>·</span
																	>
																	<span
																		class={sortDisplay.color ||
																			''}
																	>
																		{sortDisplay.value}
																	</span>
																</p>
															</div>
														</button>
													</li>
												{/each}
											</ul>
										{:else}
											<div class="px-3 sm:px-4 py-3 sm:py-4 text-center">
												<p class="text-xs sm:text-sm text-muted-foreground">
													No risks logged
												</p>
												<p
													class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block"
												>
													Track potential blockers
												</p>
											</div>
										{/if}
									{:else if section.key === 'milestones'}
										{#if filteredMilestones.length > 0}
											<ul class="divide-y divide-border/80">
												{#each filteredMilestones as milestone}
													{@const stateKey =
														milestone.props?.state_key || 'pending'}
													{@const stateColor =
														stateKey === 'achieved'
															? 'text-emerald-500'
															: stateKey === 'missed'
																? 'text-destructive'
																: stateKey === 'in_progress'
																	? 'text-accent'
																	: stateKey === 'deferred'
																		? 'text-amber-500'
																		: 'text-muted-foreground'}
													{@const sortDisplay = getSortValueDisplay(
														milestone as unknown as Record<
															string,
															unknown
														>,
														panelStates.milestones.sort.field,
														'milestones'
													)}
													<li>
														<button
															type="button"
															onclick={() =>
																(editingMilestoneId = milestone.id)}
															class="w-full flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
														>
															<Flag
																class="w-3.5 h-3.5 sm:w-4 sm:h-4 {stateColor} mt-0.5"
															/>
															<div class="min-w-0 flex-1">
																<p
																	class="text-xs sm:text-sm text-foreground truncate"
																>
																	{milestone.title}
																</p>
																<p
																	class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
																>
																	<span class="capitalize"
																		>{String(stateKey).replace(
																			/_/g,
																			' '
																		)}</span
																	>
																	<span class="mx-1 opacity-50"
																		>·</span
																	>
																	<span
																		class={sortDisplay.color ||
																			''}
																	>
																		{sortDisplay.value}
																	</span>
																</p>
															</div>
														</button>
													</li>
												{/each}
											</ul>
										{:else}
											<div class="px-3 sm:px-4 py-3 sm:py-4 text-center">
												<p class="text-xs sm:text-sm text-muted-foreground">
													No milestones yet
												</p>
												<p
													class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block"
												>
													Set checkpoints and deadlines
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
													<li>
														<button
															type="button"
															onclick={() =>
																(editingEventId = event.id)}
															class="w-full flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
														>
															<Clock
																class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground mt-0.5"
															/>
															<div class="min-w-0 flex-1">
																<p
																	class="text-xs sm:text-sm text-foreground truncate"
																>
																	{event.title}
																</p>
																<p
																	class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
																>
																	<span class="capitalize"
																		>{(
																			event.state_key ||
																			'scheduled'
																		).replace(/_/g, ' ')}</span
																	>
																	<span class="mx-1 opacity-50"
																		>·</span
																	>
																	<span
																		class={sortDisplay.color ||
																			''}
																	>
																		{sortDisplay.value}
																	</span>
																</p>
																{#if !isEventSynced(event)}
																	<p
																		class="text-[10px] sm:text-xs text-amber-500"
																	>
																		Local only
																	</p>
																{/if}
															</div>
														</button>
													</li>
												{/each}
											</ul>
										{:else}
											<div class="px-3 sm:px-4 py-3 sm:py-4 text-center">
												<p class="text-xs sm:text-sm text-muted-foreground">
													No events yet
												</p>
												<p
													class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block"
												>
													Add events to track time
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
				</aside>
			{/if}
		</div>
	</main>
</div>

<!-- Output Create Modal -->
{#if showOutputCreateModal}
	{#await import('$lib/components/ontology/OutputCreateModal.svelte') then { default: OutputCreateModal }}
		<OutputCreateModal
			projectId={project.id}
			onClose={() => (showOutputCreateModal = false)}
			onCreated={handleOutputCreated}
		/>
	{/await}
{/if}

<!-- Output Edit Modal -->
{#if editingOutputId}
	{#await import('$lib/components/ontology/OutputEditModal.svelte') then { default: OutputEditModal }}
		<OutputEditModal
			outputId={editingOutputId}
			projectId={project.id}
			isOpen={true}
			onClose={() => (editingOutputId = null)}
			onUpdated={handleOutputUpdated}
			onDeleted={handleOutputDeleted}
		/>
	{/await}
{/if}

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
			onClose={() => (showMilestoneCreateModal = false)}
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

<!-- Decision Create Modal -->
{#if showDecisionCreateModal}
	{#await import('$lib/components/ontology/DecisionCreateModal.svelte') then { default: DecisionCreateModal }}
		<DecisionCreateModal
			projectId={project.id}
			onClose={() => (showDecisionCreateModal = false)}
			onCreated={handleDecisionCreated}
		/>
	{/await}
{/if}

<!-- Decision Edit Modal -->
{#if editingDecisionId}
	{#await import('$lib/components/ontology/DecisionEditModal.svelte') then { default: DecisionEditModal }}
		<DecisionEditModal
			decisionId={editingDecisionId}
			projectId={project.id}
			onClose={() => (editingDecisionId = null)}
			onUpdated={handleDecisionUpdated}
			onDeleted={handleDecisionDeleted}
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
