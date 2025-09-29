// src/lib/services/projectBriefTemplateGenerator.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { Project } from '$lib/types/project';
import type { UserContext } from '$lib/types/user-context';
import { SmartLLMService } from './smart-llm-service';
import { PromptTemplateService } from './promptTemplate.service';
import { formatUserContext } from './prompts/core/data-formatter';
import { ProjectDataFetcher } from './prompts/core/project-data-fetcher';

export interface ProjectBriefTemplateGenerationRequest {
	projectId: string;
	userId: string;
	templateName?: string;
	description?: string;
}

export interface GeneratedTemplate {
	name: string;
	description: string;
	template_content: string;
	variables: Record<string, any>;
	project_id: string;
	user_id: string;
	in_use: boolean;
	is_default: boolean;
}

export class ProjectBriefTemplateGeneratorService {
	private smartLLM: SmartLLMService;
	private promptTemplateService: PromptTemplateService;
	private projectDataFetcher: ProjectDataFetcher;

	constructor(private supabase: SupabaseClient<Database>) {
		this.smartLLM = new SmartLLMService({
			supabase,
			httpReferer: 'https://buildos.io',
			appName: 'BuildOS Brief Template Generator'
		});
		this.promptTemplateService = new PromptTemplateService(supabase);
		this.projectDataFetcher = new ProjectDataFetcher(supabase);
	}

	async generateProjectBriefTemplate({
		projectId,
		userId,
		templateName,
		description
	}: ProjectBriefTemplateGenerationRequest): Promise<GeneratedTemplate> {
		const startTime = Date.now();

		try {
			// Fetch project with context
			const project = await this.fetchProject(projectId, userId);
			if (!project) {
				throw new Error('Project not found');
			}

			// Fetch user context
			const userContext = await this.fetchUserContext(userId);

			// Generate template using LLM
			const generatedTemplate = await this.generateTemplateWithLLM(
				project,
				userContext,
				templateName,
				description
			);

			// Save template to database
			const savedTemplate = await this.saveTemplate(generatedTemplate);

			// Activity logging can be added here if needed
			// Template generation completed successfully

			return savedTemplate;
		} catch (error) {
			console.error('Error generating project brief template:', error);
			throw error;
		}
	}

	private async fetchProject(projectId: string, userId: string): Promise<Project> {
		const { data, error } = await this.supabase
			.from('projects')
			.select(`*`)
			.eq('id', projectId)
			.eq('user_id', userId)
			.single();

		if (error || !data) {
			throw new Error('Failed to fetch project');
		}

		return data;
	}

	private async fetchUserContext(userId: string): Promise<UserContext | null> {
		const { data } = await this.supabase
			.from('user_context')
			.select('*')
			.eq('user_id', userId)
			.single();

		return data;
	}

	private async generateTemplateWithLLM(
		project: Project,
		userContext: UserContext | null,
		templateName?: string,
		description?: string
	): Promise<GeneratedTemplate> {
		const systemPrompt = this.buildSystemPrompt();
		const userPrompt = this.buildUserPrompt(project, userContext);

		const response = await this.smartLLM.getJSONResponse({
			systemPrompt,
			userPrompt,
			userId: project.user_id!,
			profile: 'balanced',
			temperature: 0.7,
			validation: {
				retryOnParseError: true,
				maxRetries: 2
			}
		});

		const parsed = this.validateTemplateResponse(response);

		return {
			name: templateName || parsed.name || `${project.name} Brief Template`,
			description:
				description || parsed.description || `Custom brief template for ${project.name}`,
			template_content: parsed.template_content,
			variables: parsed.variables || {},
			project_id: project.id,
			user_id: project.user_id!,
			in_use: true,
			is_default: false
		};
	}

	private buildSystemPrompt(): string {
		return `You are a project brief template generator for BuildOS. Your task is to create custom brief templates that capture the unique aspects of each project.

## Your Mission
Generate a project-specific brief template that:
1. Highlights the most relevant context fields for this project
2. Creates a narrative structure that flows naturally
3. Uses template variables for dynamic content
4. Focuses on actionable insights and momentum

## Template Variables Available
You can use these variables in your template:
- {{project_name}} - The project name
- {{project_description}} - Project description
- {{brief_date}} - The date of the brief
- {{executive_summary}} - Project executive summary
- {{task_summary}} - Summary of tasks (active, blocked, etc.)
- {{active_tasks}} - List of active tasks
- {{blocked_tasks}} - List of blocked tasks
- {{high_priority_tasks}} - High priority tasks
- {{upcoming_tasks}} - Tasks starting soon
- {{recent_notes}} - Recent project notes
- {{key_context}} - Dynamically selected important context fields
- {{progress_metrics}} - Progress indicators
- {{next_actions}} - Suggested next steps

## Template Structure Guidelines
1. Start with a compelling summary that captures momentum
2. Highlight critical information based on project type
3. Include actionable sections relevant to the project
4. End with strategic insights or recommendations
5. Keep sections concise but informative

## Context Field Selection
When designing the template, prioritize context fields that are:
- Actionable (problems, blockers, next steps)
- Time-sensitive (deadlines, milestones)
- Strategic (goals, success metrics)
- Currently relevant (based on project status)

## Output Format
Return JSON with:
{
  "name": "Template name",
  "description": "What makes this template unique",
  "template_content": "The actual template with markdown and variables",
  "variables": {
    "custom_var_1": "Description of any custom variables you create"
  }
}`;
	}

	private buildUserPrompt(project: Project, userContext: UserContext | null): string {
		// Format project data inline
		const projectSection = this.formatProjectForTemplate(project);

		// Format user context using PromptTemplateService
		const userContextSection = formatUserContext(userContext, {
			mode: 'summary'
		});

		return `Create a custom project brief template for this project:

${projectSection}

${userContextSection}

## Requirements
1. Design a template that highlights the most important aspects of THIS specific project
2. The template should adapt to the project's unique context fields
3. Focus on what would be most helpful for daily execution
4. Consider the project type and status when structuring sections
5. Make it scannable and action-oriented

Generate a template that feels custom-built for this project's needs.`;
	}

	private validateTemplateResponse(response: any): {
		name: string;
		description: string;
		template_content: string;
		variables?: Record<string, any>;
	} {
		if (!response || typeof response !== 'object') {
			throw new Error('Invalid template response format');
		}

		if (!response.template_content || typeof response.template_content !== 'string') {
			throw new Error('Template response missing template_content');
		}

		return {
			name: response.name || 'Generated Template',
			description: response.description || 'AI-generated template',
			template_content: response.template_content,
			variables: response.variables || {}
		};
	}

	private async saveTemplate(
		template: GeneratedTemplate
	): Promise<GeneratedTemplate & { id: string }> {
		// First, set any existing templates for this project to not in_use
		await this.supabase
			.from('project_brief_templates')
			.update({ in_use: false })
			.eq('project_id', template.project_id)
			.eq('user_id', template.user_id);

		// Insert the new template
		const { data, error } = await this.supabase
			.from('project_brief_templates')
			.insert({
				...template,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.select()
			.single();

		if (error || !data) {
			throw new Error('Failed to save template');
		}

		return data;
	}

	async regenerateTemplate(
		templateId: string,
		userId: string
	): Promise<GeneratedTemplate & { id: string }> {
		// Fetch existing template
		const { data: existingTemplate, error } = await this.supabase
			.from('project_brief_templates')
			.select('*')
			.eq('id', templateId)
			.eq('user_id', userId)
			.single();

		if (error || !existingTemplate) {
			throw new Error('Template not found');
		}

		// Generate new template
		const newTemplate = await this.generateProjectBriefTemplate({
			projectId: existingTemplate.project_id!,
			userId,
			templateName: existingTemplate.name,
			description: existingTemplate.description
		});

		// Update the existing template
		const { data: updated, error: updateError } = await this.supabase
			.from('project_brief_templates')
			.update({
				template_content: newTemplate.template_content,
				variables: newTemplate.variables,
				updated_at: new Date().toISOString()
			})
			.eq('id', templateId)
			.select()
			.single();

		if (updateError || !updated) {
			throw new Error('Failed to update template');
		}

		return updated;
	}

	// Helper method to format project for template generation
	private formatProjectForTemplate(project: Project): string {
		if (!project) return 'No project data available';

		const sections: string[] = [];

		// Basic project info
		sections.push(`**PROJECT: ${project.name || 'Untitled'}** (ID: ${project.id})`);
		sections.push(
			`Status: ${project.status || 'No status'} | ${project.description || 'No description'}`
		);
		sections.push(
			`Start: ${project.start_date || 'Not set'} | End: ${project.end_date || 'Not set'}`
		);

		if (project.tags && project.tags.length > 0) {
			sections.push(`Tags: ${project.tags.join(', ')}`);
		}

		// Executive Summary
		if (project.executive_summary) {
			sections.push(`\n**Executive Summary:**`);
			sections.push(project.executive_summary);
		}

		// Context
		if (project.context) {
			sections.push(`\n**Context:**`);
			sections.push(project.context);
		}

		return sections.join('\n');
	}
}
