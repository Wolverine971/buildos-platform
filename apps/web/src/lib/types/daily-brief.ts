// apps/web/src/lib/types/daily-brief.ts
export interface DailyBrief {
	id: string;
	chat_brief_id?: string; // Ontology brief id to use for brief chat context
	user_id: string;
	brief_date: string;
	summary_content: string;
	executive_summary?: string; // Used when mapping from ontology briefs
	llm_analysis?: any; // LLM analysis data from ontology briefs
	project_brief_ids?: string[];
	insights?: string;
	priority_actions?: string[];
	generation_status?: 'pending' | 'completed' | 'failed';
	generation_error?: string;
	generation_started_at?: string;
	generation_completed_at?: string;
	generation_progress?: any;
	metadata?: any;
	created_at?: string;
	updated_at?: string;
}

export interface ProjectDailyBrief {
	id: string;
	user_id: string;
	project_id: string;
	template_id?: string;
	brief_content: string;
	brief_date: string;
	generation_status?: 'pending' | 'completed' | 'failed';
	metadata?: any;
	created_at?: string;
	updated_at?: string;
	projects?: {
		id?: string;
		name: string;
		description?: string;
	};
}

export interface DailyBriefResult {
	project_briefs: Array<{
		id: string;
		content: string;
		project_name: string;
	}>;
	main_brief?: {
		id: string;
		content: string;
	};
}

export interface BriefTemplate {
	id: string;
	name: string;
	description: string | null;
	template_content: string;
	is_default: boolean | null;
	variables: any;
	created_at: string | null;
	updated_at: string | null;
}

export interface StreamEvent {
	type:
		| 'status'
		| 'project_brief'
		| 'main_brief'
		| 'complete'
		| 'error'
		| 'progress'
		| 'ping'
		| 'abort';
	data: any;
}

export interface StreamingStatus {
	isGenerating: boolean;
	currentStep:
		| 'idle'
		| 'initializing'
		| 'starting'
		| 'queued'
		| 'gathering_data'
		| 'data_gathered'
		| 'fetching_projects'
		| 'generating_project_briefs'
		| 'consolidating_briefs'
		| 'generating_main_brief'
		| 'finalizing'
		| 'completed'
		| 'error'
		| string; // Allow dynamic project processing steps
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
}

export interface BriefGenerationResult {
	success: boolean;
	daily_brief: {
		id: string;
		content: string;
	};
	project_briefs: Array<{
		id: string;
		content: string;
		project_name: string;
		project_id: string;
	}>;
	errors?: string[];
	warnings?: string[];
}

export interface TemplateVariable {
	name: string;
	description: string;
	required: boolean;
	type: 'string' | 'number' | 'boolean' | 'array';
	defaultValue?: string | number | boolean | any[];
}

export interface TemplateValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
	variables: TemplateVariable[];
}

// Template creation/update interfaces
export interface CreateProjectBriefTemplate {
	name: string;
	description?: string;
	template_content: string;
	is_default?: boolean;
	variables?: string[];
}

export interface UpdateProjectBriefTemplate extends Partial<CreateProjectBriefTemplate> {
	id: string;
}

// Brief filtering and search
export interface BriefFilters {
	dateFrom?: string;
	dateTo?: string;
	projectIds?: string[];
	templateIds?: string[];
	hasInsights?: boolean;
	hasPriorityActions?: boolean;
}

export interface BriefSearchResult {
	briefs: DailyBrief[];
	project_briefs: ProjectDailyBrief[];
	total: number;
	page: number;
	pageSize: number;
}

// Brief analytics
export interface BriefAnalytics {
	generation_frequency: {
		total_briefs: number;
		briefs_this_month: number;
		briefs_this_week: number;
		streak_days: number;
	};
	engagement_metrics: {
		avg_brief_length: number;
		avg_priority_actions: number;
		most_active_projects: Array<{
			project_id: string;
			project_name: string;
			brief_count: number;
		}>;
	};
	template_usage: {
		most_used_project_template: string;
		most_used_goal_template: string;
		custom_template_count: number;
	};
}

// Export a utility type for common brief operations
export type BriefType = 'daily' | 'project';

export interface BriefMetadata {
	createdBy?: string;
	tags?: string[];
	notes?: string;
	[key: string]: any;
}

export interface BriefSummary {
	type: BriefType;
	id: string;
	date: string;
	title: string;
	preview: string;
	metadata: BriefMetadata;
}
