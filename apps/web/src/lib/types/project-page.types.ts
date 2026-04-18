// apps/web/src/lib/types/project-page.types.ts
import type { Database } from '@buildos/shared-types';
import type { Project, Task, Note, Phase } from '$lib/types/project';

// ==========================================
// CALENDAR EVENT TYPES
// ==========================================

type TaskCalendarEventRow = Database['public']['Tables']['task_calendar_events']['Row'];

/**
 * Narrowed projection of `task_calendar_events` used by task/phase UI.
 * Only the fields the UI actually reads — keep aligned with the DB row.
 */
export type TaskCalendarEvent = Pick<
	TaskCalendarEventRow,
	| 'id'
	| 'calendar_event_id'
	| 'calendar_id'
	| 'event_start'
	| 'event_end'
	| 'event_link'
	| 'event_title'
	| 'sync_status'
	| 'sync_error'
	| 'last_synced_at'
>;

// ==========================================
// ENHANCED TASK TYPE WITH CALENDAR EVENTS
// ==========================================

export interface TaskWithCalendarEvents extends Task {
	task_calendar_events?: TaskCalendarEvent[];
}

// ==========================================
// PHASE TASK TYPE (task with phase metadata)
// ==========================================

export interface PhaseTask extends TaskWithCalendarEvents {
	suggested_start_date?: string | null;
	assignment_reason?: string | null;
}

// ==========================================
// PROCESSED PHASE TYPE
// ==========================================

export interface ProcessedPhase extends Omit<Phase, 'tasks'> {
	tasks: PhaseTask[];
	task_count: number;
	completed_tasks: number;
}

// ==========================================
// CALENDAR STATUS TYPE
// ==========================================

export interface CalendarStatus {
	isConnected: boolean;
	needsRefresh: boolean;
	scope: string | null;
	lastSync: string | null;
}

// ==========================================
// TASK STATISTICS TYPE
// ==========================================

export interface TaskStats {
	total: number;
	completed: number;
	inProgress: number;
	blocked: number;
	deleted: number;
	active: number;
	backlog: number;
	scheduled: number;
}

// ==========================================
// TAB COUNTS TYPE
// ==========================================

export interface TabCounts {
	tasks: number;
	notes: number;
	deletedTasks: number;
	doneTasks: number;
	phases: number;
	scheduled: number;
	briefs: number;
}

// ==========================================
// PAGE METADATA TYPE
// ==========================================

export interface PageMetadata {
	activeTab: string;
	loadedAt: string;
	dataSize: {
		tasks: number;
		deletedTasks: number;
		doneTasks: number;
		notes: number;
		phases: number;
		backlog: number;
		scheduled: number;
	};
	loadStrategy: string;
	calendarConnected: boolean;
}

// ==========================================
// PAGE DATA TYPE (Server Load Return)
// ==========================================

export interface ProjectPageData {
	// Core project data
	project: Project;

	// Task collections
	tasks: TaskWithCalendarEvents[];
	doneTasks: TaskWithCalendarEvents[];
	deletedTasks: TaskWithCalendarEvents[];
	backlogTasks: TaskWithCalendarEvents[];
	scheduledTasks: TaskWithCalendarEvents[];

	// Other data
	notes: Note[];
	phases: ProcessedPhase[];

	// Calendar and user info
	calendarStatus: CalendarStatus;
	user: {
		id: string;
	};

	// UI flags and computed data
	isFirstProject: boolean;
	taskStats: TaskStats;
	tabCounts: TabCounts;

	// Metadata
	__meta: PageMetadata;
}

// ==========================================
// PHASE WITH TASKS TYPE (for store/components)
// ==========================================

export type PhaseWithTasks = ProcessedPhase;

// ==========================================
// SVELTE KIT PAGE TYPES
// ==========================================

export type PageData = ProjectPageData;
