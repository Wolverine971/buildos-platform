// apps/web/src/lib/services/phase-generation/types.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { Project, Phase } from '$lib/types/project';

export interface PhaseGenerationConfig {
	selectedStatuses: string[];
	schedulingMethod: SchedulingMethod;
	projectStartDate?: string;
	projectEndDate?: string;
	projectDatesChanged?: boolean;
	includeRecurringTasks?: boolean;
	allowRecurringReschedule?: boolean;
	preserveExistingDates?: boolean; // When false (default), reschedule all non-recurring tasks
	preserveHistoricalPhases?: boolean; // When true (default), preserve completed/current phases during regeneration
	userInstructions?: string; // User-provided guidance for phase generation
	userId?: string;
	// Calendar event handling during phase regeneration
	calendarHandling?: 'update' | 'clear_and_reschedule' | 'preserve'; // Default: 'update' (current behavior)
	preserveRecurringEvents?: boolean; // When true, preserve recurring master events during cleanup
	calendarCleanupBatchSize?: number; // Batch size for calendar deletion operations (default: 5)
}

export type SchedulingMethod = 'phases_only' | 'schedule_in_phases' | 'calendar_optimized';

export interface Task {
	id: string;
	title: string | null;
	description: string | null;
	task_type: Database['public']['Enums']['task_type'] | null;
	priority: Database['public']['Enums']['priority_level'] | null;
	dependencies: string[] | null;
	status: Database['public']['Enums']['task_status'] | null;
	start_date: string | null;
	duration_minutes?: number | null;
	recurrence_pattern?: Database['public']['Enums']['recurrence_pattern'] | null;
	recurrence_ends?: string | null;
	recurrence_end_source?: Database['public']['Enums']['recurrence_end_reason'] | null;
}

export interface TaskFilterResult {
	compatibleTasks: Task[];
	excludedTasks: Task[];
	exclusionReasons: Record<string, string>;
	warnings: string[];
	rescheduledTasks: RescheduledTask[];
}

export interface RescheduledTask {
	id: string;
	title: string | null;
	current_start_date: string | null;
	new_start_date: string | null;
}

export interface FilteringSummary {
	total_tasks: number;
	compatible_tasks: number;
	excluded_tasks: number;
	rescheduled_tasks: number;
	exclusion_reasons: Record<string, string>;
	warnings: string[];
	scheduling_method: SchedulingMethod;
}

export interface PhaseGenerationResult {
	phases: Phase[];
	task_assignments: Record<string, TaskAssignment>;
	recurring_tasks?: string[];
	summary?: string;
	recurring_task_suggestions?: Record<string, RecurringTaskSuggestion>;
	filtering_summary?: FilteringSummary;
	project_dates_updated?: boolean;
	is_regeneration?: boolean;
	backlogTasks?: any[]; // Standardized to use backlogTasks instead of backlog_tasks
	scheduling_method?: SchedulingMethod;
}

export interface TaskAssignment {
	phase_order: number;
	suggested_start_date: string | null;
	reason: string;
}

export interface RecurringTaskSuggestion {
	action: string;
	current_pattern: string;
	suggested_pattern: string;
	current_start_date: string;
	suggested_start_date: string;
	reason: string;
}

export interface PhaseTaskAssignment {
	phase_id: string;
	task_id: string;
	suggested_start_date: string | null;
	assignment_reason: string;
}

export interface ExistingPhaseAssignment {
	task_id: string;
	phase_id: string;
	phases: {
		id: string;
		project_id: string;
	};
}

export interface GenerationContext {
	project: Project;
	tasks: Task[];
	isRegeneration: boolean;
	existingAssignments: ExistingPhaseAssignment[];
	config: PhaseGenerationConfig;
	preservedPhases?: any[]; // Phases preserved from previous generation
}

export interface StrategyDependencies {
	supabase: SupabaseClient;
	taskFilteringService: any; // Will be defined when we create the service
	promptTemplateService: any; // Will be defined when we create the service
	phasePersistenceService: any; // Will be defined when we create the service
	llmPool: any; // Will be defined when we create the service
}
