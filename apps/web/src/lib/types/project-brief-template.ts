// apps/web/src/lib/types/project-brief-template.ts

export interface ProjectBriefTemplate {
	id: string;
	name: string;
	description: string | null;
	template_content: string;
	variables: ProjectBriefVariables | null;
	project_id: string | null;
	user_id: string | null;
	in_use: boolean | null;
	is_default: boolean | null;
	created_at: string | null;
	updated_at: string | null;
}

export interface ProjectBriefVariables {
	// Standard variables available in all templates
	project_name?: string;
	project_description?: string;
	brief_date?: string;
	executive_summary?: string;
	task_summary?: string;
	active_tasks?: string;
	blocked_tasks?: string;
	high_priority_tasks?: string;
	upcoming_tasks?: string;
	recent_notes?: string;
	key_context?: Record<string, string>;
	progress_metrics?: string;
	next_actions?: string;

	// Custom variables defined by the template
	[key: string]: any;
}

export interface TemplateGenerationRequest {
	projectId: string;
	userId: string;
	templateName?: string;
	description?: string;
}

export interface TemplateGenerationResponse {
	success: boolean;
	template?: ProjectBriefTemplate;
	error?: string;
	details?: string;
	regenerated?: boolean;
}

export interface ProjectContextField {
	key: string;
	value: string;
	metadata?: {
		description?: string;
		category?: 'situation' | 'mission' | 'execution' | 'operations' | 'coordination';
		source?: 'quoted' | 'inferred' | 'implied';
		priority?: boolean;
	};
}

export interface TemplateSection {
	title: string;
	icon?: string;
	condition?: string; // Handlebars condition like "{{#if blocked_tasks}}"
	content: string;
	order: number;
}

export interface TemplateMetadata {
	projectType?: 'software' | 'creative' | 'business' | 'personal' | 'research' | 'other';
	focusAreas?: string[];
	updateFrequency?: 'daily' | 'weekly' | 'on-demand';
	complexity?: 'simple' | 'standard' | 'detailed';
	generatedAt?: string;
	lastUsed?: string;
	usageCount?: number;
}

// Helper type for template variable substitution
export type TemplateVariableMap = Map<string, string | number | boolean | any>;

// Template validation schema
export interface TemplateValidation {
	isValid: boolean;
	errors?: string[];
	warnings?: string[];
	requiredVariables?: string[];
	availableVariables?: string[];
}
