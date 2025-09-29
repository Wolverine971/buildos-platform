// src/lib/types/index.ts
// Comprehensive type definitions for your SvelteKit + Supabase project

import type { Database } from '@buildos/shared-types';
import type { ParsedOperation } from './brain-dump';
import type { Task, ProjectWithRelations } from './project';
import type { UserContext } from './user-context';

// Re-export brain dump types
export type {
	BrainDumpOptions,
	BrainDumpParseResult,
	ParsedOperation,
	ExecutionResult,
	CompletedBrainDump,
	TableName,
	OperationType
} from './brain-dump';

// ==========================================
// BASE DATABASE TYPES & INTERFACES
// ==========================================

// Soft delete interface for items with deleted_at timestamp
export interface SoftDeletable {
	deleted_at: string | null;
}

// Task filter type (updated to use 'deleted' instead of 'outdated')
export type TaskFilter = 'all' | 'active' | 'scheduled' | 'overdue' | 'completed' | 'deleted';

// ==========================================
// BASE DATABASE TYPES
// ==========================================

// Row types from database
export type Phase = Database['public']['Tables']['phases']['Row'];
export type ProjectSynthesis = Database['public']['Tables']['project_synthesis']['Row'];
export type BrainDump = Database['public']['Tables']['brain_dumps']['Row'];
export type BrainDumpLink = Database['public']['Tables']['brain_dump_links']['Row'];
export type DailyBrief = Database['public']['Tables']['daily_briefs']['Row'];
export type ProjectDailyBrief = Database['public']['Tables']['project_daily_briefs']['Row'];
export type ProjectBriefTemplate = Database['public']['Tables']['project_brief_templates']['Row'];

// Insert types for creating new records
export type PhaseInsert = Database['public']['Tables']['phases']['Insert'];

// ==========================================
// COMPOSITE TYPES WITH RELATIONS
// ==========================================

export interface PhaseWithTasks extends Phase {
	tasks: Task[];
	task_count: number;
	completed_tasks: number;
}

export interface UserDataResult {
	projects: ProjectWithRelations[];
	userContext: UserContext | null;
}

// ==========================================
// DAILY BRIEF TYPES
// ==========================================

export interface DailyBriefWithRelations extends DailyBrief {
	project_daily_briefs?: ProjectDailyBriefWithProject[];
}

export interface ProjectDailyBriefWithProject extends ProjectDailyBrief {
	projects?: {
		name: string;
		description?: string | null;
		slug: string;
	};
}

export interface BriefTemplate {
	id: string;
	name: string;
	description: string | null;
	template_content: string;
	is_default: boolean | null;
	variables: Record<string, any>;
	created_at: string | null;
	updated_at: string | null;
	user_id?: string | null;
	project_id?: string | null;
	in_use?: boolean;
}

export interface StreamEvent {
	type: 'status' | 'project_brief' | 'main_brief' | 'complete' | 'error' | 'progress';
	data: any;
}

export interface StreamingStatus {
	isGenerating: boolean;
	currentStep:
		| 'idle'
		| 'starting'
		| 'gathering_data'
		| 'generating_project_briefs'
		| 'generating_main_brief'
		| 'completed'
		| 'error';
	message: string;
	progress: {
		projects: {
			completed: number;
			total: number;
		};
	};
	error?: string;
}

export interface StreamingBriefData {
	projectBriefs: ProjectDailyBrief[];
	mainBrief?: {
		id: string;
		content: string;
		priority_actions?: string[];
	};
}

export interface BriefGenerationOptions {
	briefDate?: string;
	includeProjects?: boolean;
	customTemplateIds?: {
		projectTemplateId?: string;
	};
	regenerate?: boolean;
	streaming?: boolean;
	background?: boolean;
}

export interface BriefGenerationResult {
	success: boolean;
	daily_brief?: {
		id: string;
		content: string;
	};
	project_briefs?: Array<{
		id: string;
		content: string;
		project_name: string;
		project_id: string;
	}>;
	errors?: string[];
	warnings?: string[];
	brief_id?: string;
	result?: {
		daily_brief: DailyBrief;
		project_briefs: ProjectDailyBrief[];
	};
}

export interface BriefGenerationStatus {
	isGenerating: boolean;
	briefId?: string;
	briefDate?: string;
	status?: 'pending' | 'completed' | 'failed';
	progress?: {
		projects_completed: number;
		total_projects: number;
	};
	error?: string;
	startedAt?: string;
	started_at?: string;
}

// ==========================================
// PROJECT SYNTHESIS TYPES
// ==========================================

export interface ProjectSynthesisResult {
	id: string;
	operations: ParsedOperation[];
	insights: string;
	comparison: TaskComparison[];
	summary: string;
}

export interface TaskComparison {
	type: 'consolidated' | 'deleted' | 'suggested';
	originalTasks?: string[] | Task[];
	newTask?: Partial<Task>;
	reasoning: string;
}

export interface SynthesisContent {
	operations: ParsedOperation[];
	insights: string;
	comparison: TaskComparison[];
	summary: string;
}

// ==========================================
// PHASE GENERATION TYPES
// ==========================================

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
}

// ==========================================
// UI/COMPONENT TYPES
// ==========================================

export type TabType = 'tasks' | 'context' | 'notes' | 'phases';

export interface ModalState {
	show: boolean;
	type: 'task' | 'note' | 'phase' | 'context' | 'delete' | string;
	data: any;
}

// ==========================================
// ONBOARDING TYPES
// ==========================================

export interface OnboardingProgressData {
	completed: boolean;
	progress: number;
	missingFields: string[];
	completedFields: string[];
	missingRequiredFields: string[];
	categoryProgress: Record<
		string,
		{
			completed: number;
			total: number;
			percentage: number;
		}
	>;
}

export interface OnboardingCategory {
	id: 'who' | 'building' | 'believe' | 'work' | 'help' | 'goals';
	title: string;
	description: string;
	fields: string[];
}

// ==========================================
// ACTIVITY/METRIC TYPES
// ==========================================

export interface ActivityLog {
	id: string;
	user_id: string;
	activity_type: string;
	metadata?: Record<string, any>;
	created_at: string;
}

export interface SystemMetric {
	metric_name: string;
	value: number;
	unit?: string;
	description?: string;
	timestamp: string;
}

// ==========================================
// API RESPONSE TYPES
// ==========================================

export interface ApiResponse<T = any> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
}

export interface PaginatedResponse<T> {
	data: T[];
	total: number;
	page: number;
	pageSize: number;
	hasMore: boolean;
}

// ==========================================
// PROMPT TEMPLATE TYPES
// ==========================================

export interface PromptTemplate {
	id: string;
	name: string;
	description?: string;
	template_content: string;
	variables?: string[];
	is_default?: boolean;
	user_id?: string;
}

export interface EnhancementOptions {
	useEnhancedContext?: boolean;
	includeTimeContext?: boolean;
	includeActivityMetrics?: boolean;
	includeUpcomingEvents?: boolean;
	includeMotivationalContext?: boolean;
	includeEnergyAssessment?: boolean;
}

// ==========================================
// LLM/AI TYPES
// ==========================================

export interface LLMRequest {
	systemPrompt: string;
	userPrompt: string;
	userId?: string;
	responseFormat?: 'json' | 'text';
	temperature?: number;
	preferredModels?: string[];
}

export interface LLMResponse {
	result: any;
	model: string;
	tokensUsed?: number;
	duration?: number;
}

// ==========================================
// HELPER TYPES
// ==========================================

export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequireAtLeastOne<T> = {
	[K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>;
}[keyof T];

export type Nullable<T> = T | null;

// ==========================================
// VALIDATION TYPES
// ==========================================

export interface ValidationResult {
	isValid: boolean;
	errors?: string[];
	warnings?: string[];
	missingFields?: string[];
}

export interface CleanedData<T = any> {
	data: T;
	validation: ValidationResult;
}
