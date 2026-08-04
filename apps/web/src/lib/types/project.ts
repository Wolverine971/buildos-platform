// apps/web/src/lib/types/project.ts

import type { Database } from '@buildos/shared-types';
import type { UserContext } from './user-context';

// ==========================================
// BASE DATABASE TYPES
// ==========================================

export type Project = Database['public']['Tables']['projects']['Row'];
export type Task = Database['public']['Tables']['tasks']['Row'];
export type CalendarEvent = Database['public']['Tables']['task_calendar_events']['Row'];
export type ProjectQuestion = Database['public']['Tables']['project_questions']['Row'];

// Add a helper type for the old fixed fields (for migration/compatibility)

export type Phase = Database['public']['Tables']['phases']['Row'];

// Insert types
export type ProjectInsert = Database['public']['Tables']['projects']['Insert'];
export type TaskInsert = Database['public']['Tables']['tasks']['Insert'];
export type PhaseInsert = Database['public']['Tables']['phases']['Insert'];

// Update types
export type ProjectUpdate = Database['public']['Tables']['projects']['Update'];
export type TaskUpdate = Database['public']['Tables']['tasks']['Update'];
export type PhaseUpdate = Database['public']['Tables']['phases']['Update'];

// ==========================================
// COMPOSITE TYPES WITH RELATIONS
// ==========================================

export interface ProjectWithRelations extends Project {
	tasks: Task[];
	phases?: PhaseWithTasks[];
}

export interface UserDataResult {
	projects: ProjectWithRelations[];
	userContext: UserContext | null;
}

// ==========================================
// UI/COMPONENT TYPES
// ==========================================

export type TabType = 'tasks' | 'context' | 'phases';

export interface ModalState {
	show: boolean;
	type: 'task' | 'phase' | 'context' | 'delete' | 'synthesis' | 'brain-dump';
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

// ==========================================
// TYPE GUARDS
// ==========================================

export function isProject(obj: any): obj is Project {
	return obj && typeof obj.id === 'string' && typeof obj.name === 'string';
}

export function isTask(obj: any): obj is Task {
	return obj && typeof obj.id === 'string' && typeof obj.title === 'string';
}

export function isProjectWithRelations(obj: ProjectWithRelations): obj is ProjectWithRelations {
	return isProject(obj) && Array.isArray(obj.tasks);
}

// ==========================================
// UTILITY TYPES
// ==========================================

export type ProjectStatus = Database['public']['Enums']['project_status'];
export type TaskStatus = Database['public']['Enums']['task_status'];
export type TaskPriority = Database['public']['Enums']['priority_level'];
export type TaskType = Database['public']['Enums']['task_type'];
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
