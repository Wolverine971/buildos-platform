// apps/web/src/lib/components/ontology/insight-panels/insight-panel-config.ts
/**
 * Insight Panel Filter/Sort Configuration
 *
 * Defines available filters, sorts, and special toggles for each entity type
 * displayed in the project insight panels.
 */

import {
	Circle,
	Clock,
	CheckCircle2,
	AlertCircle,
	Zap,
	Scale,
	Gauge,
	Target,
	Flag,
	AlertTriangle,
	Calendar as CalendarIcon
} from 'lucide-svelte';

// ============================================================
// TYPES
// ============================================================

export type InsightPanelKey = 'tasks' | 'plans' | 'goals' | 'risks' | 'milestones' | 'events';

// Lucide icon type - using typeof to match the actual icon component type
type LucideIcon = typeof Circle;

export interface FilterOption {
	value: string;
	label: string;
	icon?: LucideIcon;
	color?: string;
}

export interface FilterGroup {
	id: string;
	label: string;
	options: FilterOption[];
	multiSelect: boolean;
}

export interface SortOption {
	field: string;
	label: string;
	defaultDirection: 'asc' | 'desc';
}

export interface SpecialToggle {
	id: string;
	label: string;
	description?: string;
	defaultValue: boolean;
}

export interface PanelConfig {
	filters: FilterGroup[];
	sorts: SortOption[];
	specialToggles: SpecialToggle[];
	defaultSort: { field: string; direction: 'asc' | 'desc' };
	defaultFilters: Record<string, string[]>;
}

// ============================================================
// TASK CONFIGURATION
// ============================================================

export const TASK_CONFIG: PanelConfig = {
	filters: [
		{
			id: 'state_key',
			label: 'Status',
			multiSelect: true,
			options: [
				{ value: 'todo', label: 'To Do', icon: Circle, color: 'text-muted-foreground' },
				{ value: 'in_progress', label: 'In Progress', icon: Clock, color: 'text-accent' },
				{ value: 'blocked', label: 'Blocked', icon: AlertCircle, color: 'text-destructive' }
			]
		},
		{
			id: 'priority',
			label: 'Priority',
			multiSelect: true,
			options: [
				{ value: 'high', label: 'High (1-2)', icon: Zap, color: 'text-destructive' },
				{ value: 'medium', label: 'Medium (3)', icon: Gauge, color: 'text-amber-500' },
				{ value: 'low', label: 'Low (4-5)', icon: Circle, color: 'text-muted-foreground' }
			]
		},
		{
			id: 'facet_scale',
			label: 'Scale',
			multiSelect: true,
			options: [
				{ value: 'micro', label: 'Micro' },
				{ value: 'small', label: 'Small' },
				{ value: 'medium', label: 'Medium' },
				{ value: 'large', label: 'Large' },
				{ value: 'epic', label: 'Epic' }
			]
		}
	],
	sorts: [
		{ field: 'due_at', label: 'Due Date', defaultDirection: 'asc' },
		{ field: 'priority', label: 'Priority', defaultDirection: 'asc' },
		{ field: 'created_at', label: 'Created', defaultDirection: 'desc' },
		{ field: 'updated_at', label: 'Updated', defaultDirection: 'desc' },
		{ field: 'start_at', label: 'Start Date', defaultDirection: 'asc' }
	],
	specialToggles: [
		{ id: 'showCompleted', label: 'Completed', defaultValue: false },
		{ id: 'showDeleted', label: 'Deleted', defaultValue: false }
	],
	defaultSort: { field: 'updated_at', direction: 'desc' },
	defaultFilters: {
		state_key: ['todo', 'in_progress', 'blocked']
	}
};

// ============================================================
// PLAN CONFIGURATION
// ============================================================

export const PLAN_CONFIG: PanelConfig = {
	filters: [
		{
			id: 'state_key',
			label: 'Status',
			multiSelect: true,
			options: [
				{ value: 'draft', label: 'Draft', icon: Circle, color: 'text-muted-foreground' },
				{ value: 'active', label: 'Active', icon: Clock, color: 'text-accent' }
			]
		},
		{
			id: 'facet_scale',
			label: 'Scale',
			multiSelect: true,
			options: [
				{ value: 'micro', label: 'Micro' },
				{ value: 'small', label: 'Small' },
				{ value: 'medium', label: 'Medium' },
				{ value: 'large', label: 'Large' },
				{ value: 'epic', label: 'Epic' }
			]
		},
		{
			id: 'facet_stage',
			label: 'Stage',
			multiSelect: true,
			options: [
				{ value: 'discovery', label: 'Discovery' },
				{ value: 'planning', label: 'Planning' },
				{ value: 'execution', label: 'Execution' },
				{ value: 'launch', label: 'Launch' },
				{ value: 'maintenance', label: 'Maintenance' }
			]
		}
	],
	sorts: [
		{ field: 'created_at', label: 'Created', defaultDirection: 'desc' },
		{ field: 'updated_at', label: 'Updated', defaultDirection: 'desc' },
		{ field: 'facet_stage', label: 'Stage', defaultDirection: 'asc' }
	],
	specialToggles: [
		{ id: 'showCompleted', label: 'Completed', defaultValue: false },
		{ id: 'showDeleted', label: 'Deleted', defaultValue: false }
	],
	defaultSort: { field: 'updated_at', direction: 'desc' },
	defaultFilters: {
		state_key: ['draft', 'active']
	}
};

// ============================================================
// GOAL CONFIGURATION
// ============================================================

export const GOAL_CONFIG: PanelConfig = {
	filters: [
		{
			id: 'state_key',
			label: 'Status',
			multiSelect: true,
			options: [
				{ value: 'draft', label: 'Draft', icon: Circle, color: 'text-muted-foreground' },
				{ value: 'active', label: 'Active', icon: Target, color: 'text-accent' }
			]
		}
	],
	sorts: [
		{ field: 'target_date', label: 'Target Date', defaultDirection: 'asc' },
		{ field: 'created_at', label: 'Created', defaultDirection: 'desc' },
		{ field: 'updated_at', label: 'Updated', defaultDirection: 'desc' }
	],
	specialToggles: [
		{ id: 'showAchieved', label: 'Achieved', defaultValue: false },
		{ id: 'showAbandoned', label: 'Abandoned', defaultValue: false },
		{ id: 'showDeleted', label: 'Deleted', defaultValue: false }
	],
	defaultSort: { field: 'updated_at', direction: 'desc' },
	defaultFilters: {
		state_key: ['draft', 'active']
	}
};

// ============================================================
// MILESTONE CONFIGURATION
// ============================================================

export const MILESTONE_CONFIG: PanelConfig = {
	filters: [
		{
			id: 'state_key',
			label: 'Status',
			multiSelect: true,
			options: [
				{
					value: 'pending',
					label: 'Pending',
					icon: Circle,
					color: 'text-muted-foreground'
				},
				{ value: 'in_progress', label: 'In Progress', icon: Clock, color: 'text-accent' }
			]
		},
		{
			id: 'timeframe',
			label: 'Timeframe',
			multiSelect: false,
			options: [
				{ value: 'all', label: 'All' },
				{ value: '7days', label: 'Next 7 days' },
				{ value: '14days', label: 'Next 14 days' },
				{ value: '30days', label: 'Next 30 days' },
				{ value: 'overdue', label: 'Overdue' }
			]
		}
	],
	sorts: [
		{ field: 'due_at', label: 'Due Date', defaultDirection: 'asc' },
		{ field: 'created_at', label: 'Created', defaultDirection: 'desc' },
		{ field: 'updated_at', label: 'Updated', defaultDirection: 'desc' }
	],
	specialToggles: [
		{ id: 'showCompleted', label: 'Completed', defaultValue: false },
		{ id: 'showMissed', label: 'Missed', defaultValue: false },
		{ id: 'showDeleted', label: 'Deleted', defaultValue: false }
	],
	defaultSort: { field: 'updated_at', direction: 'desc' },
	defaultFilters: {
		state_key: ['pending', 'in_progress'],
		timeframe: ['all']
	}
};

// ============================================================
// RISK CONFIGURATION
// ============================================================

export const RISK_CONFIG: PanelConfig = {
	filters: [
		{
			id: 'state_key',
			label: 'Status',
			multiSelect: true,
			options: [
				{
					value: 'identified',
					label: 'Identified',
					icon: AlertTriangle,
					color: 'text-amber-500'
				},
				{
					value: 'mitigated',
					label: 'Mitigated',
					icon: CheckCircle2,
					color: 'text-emerald-500'
				},
				{
					value: 'occurred',
					label: 'Occurred',
					icon: AlertCircle,
					color: 'text-destructive'
				}
			]
		},
		{
			id: 'impact',
			label: 'Impact',
			multiSelect: true,
			options: [
				{ value: 'critical', label: 'Critical', color: 'text-destructive' },
				{ value: 'high', label: 'High', color: 'text-orange-500' },
				{ value: 'medium', label: 'Medium', color: 'text-amber-500' },
				{ value: 'low', label: 'Low', color: 'text-emerald-500' }
			]
		}
	],
	sorts: [
		{ field: 'impact', label: 'Impact', defaultDirection: 'desc' },
		{ field: 'probability', label: 'Probability', defaultDirection: 'desc' },
		{ field: 'risk_score', label: 'Risk Score', defaultDirection: 'desc' },
		{ field: 'created_at', label: 'Created', defaultDirection: 'desc' },
		{ field: 'updated_at', label: 'Updated', defaultDirection: 'desc' }
	],
	specialToggles: [
		{ id: 'showClosed', label: 'Closed', defaultValue: false },
		{ id: 'showDeleted', label: 'Deleted', defaultValue: false }
	],
	defaultSort: { field: 'updated_at', direction: 'desc' },
	defaultFilters: {
		state_key: ['identified', 'mitigated', 'occurred']
	}
};

// ============================================================
// EVENT CONFIGURATION
// ============================================================

export const EVENT_CONFIG: PanelConfig = {
	filters: [
		{
			id: 'state_key',
			label: 'Status',
			multiSelect: true,
			options: [
				{
					value: 'scheduled',
					label: 'Scheduled',
					icon: CalendarIcon,
					color: 'text-accent'
				},
				{
					value: 'cancelled',
					label: 'Cancelled',
					icon: AlertTriangle,
					color: 'text-destructive'
				}
			]
		},
		{
			id: 'owner_entity_type',
			label: 'Owner',
			multiSelect: true,
			options: [
				{ value: 'task', label: 'Task' },
				{ value: 'project', label: 'Project' },
				{ value: 'actor', label: 'Actor' },
				{ value: 'standalone', label: 'Standalone' }
			]
		}
	],
	sorts: [
		{ field: 'start_at', label: 'Start', defaultDirection: 'asc' },
		{ field: 'end_at', label: 'End', defaultDirection: 'asc' },
		{ field: 'title', label: 'Title', defaultDirection: 'asc' },
		{ field: 'created_at', label: 'Created', defaultDirection: 'desc' }
	],
	specialToggles: [
		{ id: 'showCancelled', label: 'Cancelled', defaultValue: false },
		{ id: 'showDeleted', label: 'Deleted', defaultValue: false }
	],
	defaultSort: { field: 'updated_at', direction: 'desc' },
	defaultFilters: {
		state_key: ['scheduled']
	}
};

// ============================================================
// CONFIG MAP
// ============================================================

export const PANEL_CONFIGS: Record<InsightPanelKey, PanelConfig> = {
	tasks: TASK_CONFIG,
	plans: PLAN_CONFIG,
	goals: GOAL_CONFIG,
	milestones: MILESTONE_CONFIG,
	risks: RISK_CONFIG,
	events: EVENT_CONFIG
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get priority group from numeric priority (1-5)
 */
export function getPriorityGroup(priority: number | null | undefined): string {
	if (priority == null) return 'low';
	if (priority <= 2) return 'high';
	if (priority === 3) return 'medium';
	return 'low';
}

/**
 * Get impact weight for risk score calculation
 */
export function getImpactWeight(impact: string | null | undefined): number {
	switch (impact) {
		case 'critical':
			return 4;
		case 'high':
			return 3;
		case 'medium':
			return 2;
		case 'low':
			return 1;
		default:
			return 1;
	}
}

/**
 * Calculate risk score (impact_weight * probability)
 */
export function calculateRiskScore(
	impact: string | null | undefined,
	probability: number | null | undefined
): number {
	const weight = getImpactWeight(impact);
	const prob = probability ?? 0.5;
	return weight * prob;
}

/**
 * Check if a date is within a timeframe
 */
export function isWithinTimeframe(
	dateString: string | null | undefined,
	timeframe: string
): boolean {
	if (!dateString) return timeframe === 'all';

	const date = new Date(dateString);
	const now = new Date();

	if (timeframe === 'all') return true;

	if (timeframe === 'overdue') {
		return date < now;
	}

	const days = timeframe === '7days' ? 7 : timeframe === '14days' ? 14 : 30;
	const futureDate = new Date(now);
	futureDate.setDate(futureDate.getDate() + days);

	return date >= now && date <= futureDate;
}

/**
 * Stage order for sorting plans by lifecycle stage
 */
export const STAGE_ORDER: Record<string, number> = {
	discovery: 1,
	planning: 2,
	execution: 3,
	launch: 4,
	maintenance: 5,
	complete: 6
};

/**
 * Impact order for sorting risks
 */
export const IMPACT_ORDER: Record<string, number> = {
	critical: 1,
	high: 2,
	medium: 3,
	low: 4
};

// ============================================================
// SORT VALUE FORMATTING
// ============================================================

/**
 * Format a relative time string (e.g., "2h ago", "3 days ago")
 */
function formatRelativeTime(dateString: string | null | undefined): string {
	if (!dateString) return '—';

	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	// Future dates
	if (diffMs < 0) {
		const absDiffDays = Math.abs(diffDays);
		if (absDiffDays === 0) return 'today';
		if (absDiffDays === 1) return 'tomorrow';
		if (absDiffDays < 7) return `in ${absDiffDays}d`;
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	// Past dates
	if (diffMins < 1) return 'just now';
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays === 1) return 'yesterday';
	if (diffDays < 7) return `${diffDays}d ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format a short date (e.g., "Jan 15")
 */
function formatShortDate(dateString: string | null | undefined): string {
	if (!dateString) return '—';
	const date = new Date(dateString);
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format priority value for display
 */
function formatPriority(priority: number | null | undefined): string {
	if (priority == null) return '—';
	if (priority <= 2) return `P${priority} High`;
	if (priority === 3) return 'P3 Med';
	return `P${priority} Low`;
}

/**
 * Format impact value for display
 */
function formatImpact(impact: string | null | undefined): string {
	if (!impact) return '—';
	return impact.charAt(0).toUpperCase() + impact.slice(1);
}

/**
 * Format probability as percentage
 */
function formatProbability(probability: number | null | undefined): string {
	if (probability == null) return '—';
	return `${Math.round(probability * 100)}%`;
}

/**
 * Format stage for display
 */
function formatStage(stage: string | null | undefined): string {
	if (!stage) return '—';
	return stage.charAt(0).toUpperCase() + stage.slice(1);
}

/**
 * Format scale for display
 */
function formatScale(scale: string | null | undefined): string {
	if (!scale) return '—';
	return scale.charAt(0).toUpperCase() + scale.slice(1);
}

export interface SortValueDisplay {
	label: string;
	value: string;
	color?: string;
}

/**
 * Get the formatted sort value for display in an entity item
 */
export function getSortValueDisplay(
	entity: Record<string, unknown>,
	sortField: string,
	panelKey?: InsightPanelKey
): SortValueDisplay {
	const value = entity[sortField];

	switch (sortField) {
		// Date fields - show relative time
		case 'updated_at':
			return { label: 'Updated', value: formatRelativeTime(value as string) };
		case 'created_at':
			return { label: 'Created', value: formatRelativeTime(value as string) };

		// Date fields - show short date
		case 'due_at':
			return { label: 'Due', value: formatShortDate(value as string) };
		case 'start_at':
			return { label: 'Starts', value: formatShortDate(value as string) };
		case 'end_at':
			return { label: 'Ends', value: formatShortDate(value as string) };
		case 'target_date':
			return { label: 'Target', value: formatShortDate(value as string) };
		case 'completed_at':
			return { label: 'Done', value: formatShortDate(value as string) };

		// Priority
		case 'priority': {
			const priority = value as number | null;
			const formatted = formatPriority(priority);
			let color = 'text-muted-foreground';
			if (priority != null) {
				if (priority <= 2) color = 'text-destructive';
				else if (priority === 3) color = 'text-amber-500';
			}
			return { label: 'Priority', value: formatted, color };
		}

		// Risk fields
		case 'impact': {
			const impact = value as string | null;
			let color = 'text-muted-foreground';
			if (impact === 'critical') color = 'text-destructive';
			else if (impact === 'high') color = 'text-orange-500';
			else if (impact === 'medium') color = 'text-amber-500';
			else if (impact === 'low') color = 'text-emerald-500';
			return { label: 'Impact', value: formatImpact(impact), color };
		}
		case 'probability':
			return { label: 'Prob', value: formatProbability(value as number) };
		case 'risk_score': {
			const score = value as number | null;
			const formatted = score != null ? score.toFixed(1) : '—';
			return { label: 'Score', value: formatted };
		}

		// Plan fields
		case 'facet_stage':
			return { label: 'Stage', value: formatStage(value as string) };
		case 'facet_scale':
			return { label: 'Scale', value: formatScale(value as string) };

		// Title (for events)
		case 'title':
			return { label: 'Title', value: (value as string) || '—' };

		// Default: just return the value
		default:
			return {
				label: sortField.replace(/_/g, ' '),
				value: value != null ? String(value) : '—'
			};
	}
}

// ============================================================
// PANEL STATE TYPE
// ============================================================

export interface InsightPanelState {
	filters: Record<string, string[]>;
	toggles: Record<string, boolean>;
	sort: {
		field: string;
		direction: 'asc' | 'desc';
	};
}

/**
 * Create default panel state from config
 */
export function createDefaultPanelState(config: PanelConfig): InsightPanelState {
	const toggles: Record<string, boolean> = {};
	for (const toggle of config.specialToggles) {
		toggles[toggle.id] = toggle.defaultValue;
	}

	return {
		filters: { ...config.defaultFilters },
		toggles,
		sort: { ...config.defaultSort }
	};
}

/**
 * Create default states for all panels
 */
export function createDefaultPanelStates(): Record<InsightPanelKey, InsightPanelState> {
	return {
		tasks: createDefaultPanelState(TASK_CONFIG),
		plans: createDefaultPanelState(PLAN_CONFIG),
		goals: createDefaultPanelState(GOAL_CONFIG),
		milestones: createDefaultPanelState(MILESTONE_CONFIG),
		risks: createDefaultPanelState(RISK_CONFIG),
		events: createDefaultPanelState(EVENT_CONFIG)
	};
}
