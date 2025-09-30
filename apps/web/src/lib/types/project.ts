// apps/web/src/lib/types/project.ts

import type { Database } from '@buildos/shared-types';
import type { UserContext } from './user-context';

// ==========================================
// BASE DATABASE TYPES
// ==========================================

export type Project = Database['public']['Tables']['projects']['Row'];
export type Task = Database['public']['Tables']['tasks']['Row'];
export type Note = Database['public']['Tables']['notes']['Row'];
export type CalendarEvent = Database['public']['Tables']['task_calendar_events']['Row'];
export type ProjectQuestion = Database['public']['Tables']['project_questions']['Row'];

// Add a helper type for the old fixed fields (for migration/compatibility)

export type Phase = Database['public']['Tables']['phases']['Row'];

// Insert types
export type ProjectInsert = Database['public']['Tables']['projects']['Insert'];
export type TaskInsert = Database['public']['Tables']['tasks']['Insert'];
export type NoteInsert = Database['public']['Tables']['notes']['Insert'];
export type PhaseInsert = Database['public']['Tables']['phases']['Insert'];

// Update types
export type ProjectUpdate = Database['public']['Tables']['projects']['Update'];
export type TaskUpdate = Database['public']['Tables']['tasks']['Update'];
export type NoteUpdate = Database['public']['Tables']['notes']['Update'];
export type PhaseUpdate = Database['public']['Tables']['phases']['Update'];

// ==========================================
// COMPOSITE TYPES WITH RELATIONS
// ==========================================

export interface ProjectWithRelations extends Project {
	tasks: Task[];
	notes: Note[];
	phases?: PhaseWithTasks[];
}

export interface UserDataResult {
	projects: ProjectWithRelations[];
	userContext: UserContext | null;
}

// ==========================================
// UI/COMPONENT TYPES
// ==========================================

export type TabType = 'tasks' | 'context' | 'notes' | 'phases';

export interface ModalState {
	show: boolean;
	type: 'task' | 'note' | 'phase' | 'context' | 'delete' | 'synthesis' | 'brain-dump';
	data: any; // Consider making this generic: ModalState<T>
}

// ==========================================
// PHASE TYPES
// ==========================================

export interface PhaseWithTasks extends Phase {
	tasks: Task[];
	task_count: number;
	completed_tasks: number;
}

export interface PhaseGenerationResult {
	phases: Array<{
		name: string;
		description: string;
		start_date: string;
		end_date: string;
		order: number;
	}>;
	task_assignments: {
		[task_id: string]: {
			phase_order: number | null;
			suggested_start_date: string | null;
			reason: string;
		};
	};
	recurring_tasks: string[];
	backlog_tasks: string[];
	summary: string;
	recurring_task_suggestions?: {
		[task_id: string]: {
			action: 'keep_as_is' | 'reschedule' | 'adjust_pattern';
			current_pattern?: string;
			suggested_pattern?: string;
			current_start_date?: string;
			suggested_start_date?: string;
			suggested_end_date?: string;
			reason: string;
			phase_alignment?: number;
		};
	};
	recurring_task_warnings?: string[];
}

// ==========================================
// TYPE GUARDS
// ==========================================

export function isProject(obj: any): obj is Project {
	return obj && typeof obj.id === 'string' && typeof obj.name === 'string';
}

export function isTask(obj: any): obj is Task {
	return obj && typeof obj.id === 'string' && typeof obj.title === 'string';
}

export function isNote(obj: any): obj is Note {
	return (
		obj &&
		typeof obj.id === 'string' &&
		(typeof obj.title === 'string' || typeof obj.content === 'string')
	);
}

export function isProjectWithRelations(obj: ProjectWithRelations): obj is ProjectWithRelations {
	return isProject(obj) && Array.isArray(obj.tasks) && Array.isArray(obj.notes);
}

// ==========================================
// UTILITY TYPES
// ==========================================

export type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived';
export type TaskStatus = 'backlog' | 'in_progress' | 'done' | 'blocked';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskType = 'one_off' | 'recurring';
export type NoteCategory =
	| 'insight'
	| 'research'
	| 'idea'
	| 'observation'
	| 'reference'
	| 'question';

// ==========================================
// API TYPES
// ==========================================

export interface ProjectCreatePayload
	extends Omit<ProjectInsert, 'id' | 'user_id' | 'created_at' | 'updated_at'> {
	// Additional fields that might be sent from the client
}

export interface TaskCreatePayload
	extends Omit<TaskInsert, 'id' | 'user_id' | 'created_at' | 'updated_at'> {
	// Additional fields that might be sent from the client
}

export interface NoteCreatePayload
	extends Omit<NoteInsert, 'id' | 'user_id' | 'created_at' | 'updated_at'> {
	// Additional fields that might be sent from the client
}

// ==========================================
// FILTER TYPES
// ==========================================

export interface ProjectFilters {
	status?: ProjectStatus[];
	tags?: string[];
	dateRange?: {
		start: string;
		end: string;
	};
	search?: string;
}

export interface TaskFilters {
	status?: TaskStatus[];
	priority?: TaskPriority[];
	type?: TaskType[];
	phaseId?: string;
	search?: string;
}

export interface NoteFilters {
	category?: NoteCategory[];
	tags?: string[];
	search?: string;
}
