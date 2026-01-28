// apps/web/src/lib/services/dailyBrief/projectBriefGenerator.ts
import type { DailyBriefRepository } from './repository';
import type { SmartLLMService } from '../smart-llm-service';
import { PromptTemplateService } from '../promptTemplate.service';
import { formatTasks } from '../prompts/core/data-formatter';
import { ProjectDataFetcher } from '../prompts/core/project-data-fetcher';
import { PromptEnhancerService } from '../promptEnhancer.service';
import { BriefFormattingUtils } from '$lib/utils/briefFormatting.utils';
import type { ProjectWithRelations, Task } from '$lib/types/project';
import type { UserContext } from '$lib/types/user-context';
import type { StreamEvent } from '$lib/types';

export interface ProjectBriefResult {
	id: string;
	content: string;
	condensed_content?: string; // New field for condensed version
	project_name: string;
	project_description?: string;
	project_slug: string;
	project_id: string;
	user_id: string;
	brief_date: string;
	metadata?: any;
}

interface BriefSizeConfig {
	maxTasksForDetail: number;
	maxNotesForDetail: number;
	maxContextChars: number;
	condensedMaxChars: number;
}

export class ProjectBriefGenerator {
	private promptTemplateService: PromptTemplateService;
	private promptEnhancerService: PromptEnhancerService;
	private projectDataFetcher: ProjectDataFetcher;

	// Configuration for brief sizes
	private sizeConfig: BriefSizeConfig = {
		maxTasksForDetail: 10,
		maxNotesForDetail: 5,
		maxContextChars: 2000,
		condensedMaxChars: 500
	};

	constructor(
		private repository: DailyBriefRepository,
		private smartLLM: SmartLLMService
	) {
		this.promptTemplateService = new PromptTemplateService(this.repository.supabase);
		this.promptEnhancerService = new PromptEnhancerService();
		this.projectDataFetcher = new ProjectDataFetcher(this.repository.supabase);
	}

	async generateBriefs(
		userId: string,
		projects: ProjectWithRelations[],
		briefDate: string,
		userContext: UserContext | null,
		sendEvent?: (event: StreamEvent) => void
	): Promise<ProjectBriefResult[]> {
		const briefs: ProjectBriefResult[] = [];

		if (projects.length > 0 && sendEvent) {
			sendEvent({
				type: 'progress',
				data: {
					step: 'generating_project_briefs',
					message: 'Generating project briefs...',
					counts: { projects: projects.length }
				}
			});
		}

		// Analyze total context size to determine generation strategy
		const contextAnalysis = this.analyzeContextSize(projects, userContext);

		for (let i = 0; i < projects.length; i++) {
			const project = projects[i];
			if (!project) continue;

			try {
				const brief = await this.generateSingleBrief(
					userId,
					project,
					briefDate,
					userContext,
					contextAnalysis.requiresCondensed
				);

				const briefResult: ProjectBriefResult = {
					id: brief.id,
					content: brief.content,
					condensed_content: brief.condensed_content,
					project_name: project.name || 'Untitled Project',
					project_description: project.description || '',
					project_slug: project.slug || '',
					project_id: project.id,
					user_id: userId,
					brief_date: briefDate,
					metadata: brief.metadata
				};

				briefs.push(briefResult);

				if (sendEvent) {
					sendEvent({
						type: 'project_brief',
						data: {
							...briefResult,
							progress: {
								completed: i + 1,
								total: projects.length
							}
						}
					});

					// Small delay for better UX
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
			} catch (error) {
				console.error(`Error generating brief for project ${project.id}:`, error);

				// Add fallback content
				const fallbackContent = this.generateFallbackContent(project);
				const fallbackResult: ProjectBriefResult = {
					id: `fallback-${project.id}`,
					content: fallbackContent,
					condensed_content: this.createCondensedVersion(fallbackContent),
					project_name: project.name || 'Untitled Project',
					project_description: project.description || '',
					project_slug: project.slug || '',
					project_id: project.id,
					user_id: userId,
					brief_date: briefDate,
					metadata: { error: true }
				};

				briefs.push(fallbackResult);

				if (sendEvent) {
					sendEvent({
						type: 'project_brief',
						data: {
							...fallbackResult,
							error: true,
							progress: {
								completed: i + 1,
								total: projects.length
							}
						}
					});
				}
			}
		}

		return briefs;
	}

	private analyzeContextSize(
		projects: ProjectWithRelations[],
		userContext: UserContext | null
	): { totalEstimatedTokens: number; requiresCondensed: boolean } {
		let totalChars = 0;

		// Estimate user context size
		if (userContext) {
			totalChars += JSON.stringify(userContext).length;
		}

		// Estimate project sizes
		for (const project of projects) {
			totalChars += (project.name?.length || 0) + (project.description?.length || 0);
			totalChars += (project.tasks?.length || 0) * 100; // Avg 100 chars per task
			totalChars += (project.notes?.length || 0) * 200; // Avg 200 chars per note

			if (project.context) {
				// For dynamic context, check the actual content
				totalChars += JSON.stringify(project.context).length;
			}
		}

		// Rough token estimation (1 token ≈ 4 chars)
		const estimatedTokens = Math.ceil(totalChars / 4);

		// Require condensed if exceeding 5K tokens (safe margin for Mistral)
		return {
			totalEstimatedTokens: estimatedTokens,
			requiresCondensed: estimatedTokens > 5000
		};
	}

	private async generateSingleBrief(
		userId: string,
		project: ProjectWithRelations,
		briefDate: string,
		userContext: UserContext | null,
		generateCondensed: boolean
	): Promise<{ id: string; content: string; condensed_content?: string; metadata?: any }> {
		// Check if project has minimal data
		const taskCount = project.tasks?.length || 0;
		const noteCount = project.notes?.length || 0;

		if (taskCount < 2 && noteCount < 2) {
			// Generate simple brief without LLM
			const content = this.generateSimpleBrief(project);
			const savedBrief = await this.repository.saveProjectBrief(
				userId,
				project.id,
				content,
				briefDate,
				{
					task_count: taskCount,
					note_count: noteCount,
					type: 'simple',
					has_condensed: generateCondensed
				}
			);

			return {
				id: savedBrief.id,
				content,
				condensed_content: generateCondensed
					? this.createCondensedVersion(content)
					: undefined,
				metadata: savedBrief.metadata
			};
		}

		// Generate full brief with LLM
		const template = await this.promptTemplateService.getUserProjectTemplate(
			userId,
			project.id,
			project
		);

		// Create optimized prompt based on project size
		const prompt = this.createOptimizedProjectPrompt(project, generateCondensed);

		// Enhance prompt if needed
		const enhancedPrompt = await this.promptEnhancerService.enhancePromptWithContext(
			prompt,
			userContext,
			{
				useEnhancedContext: true,
				includeTimeContext: true
			}
		);

		// Add template if available
		let finalPrompt = enhancedPrompt;
		if (template?.template_content) {
			finalPrompt += `\n\nUse this template:\n${template.template_content}`;
		}

		const systemPrompt = `You are a helpful assistant creating a brief summary of a project for a daily briefing. Highlight key tasks, progress, and upcoming deadlines. Keep the response focused and actionable.`;
		// Generate content with LLM
		const content = await this.smartLLM.generateText({
			systemPrompt,
			prompt: finalPrompt,
			userId,
			profile: 'balanced',
			temperature: 0.7,
			maxTokens: 2048,
			operationType: 'daily_brief',
			projectId: project.id
		});

		// Generate condensed version if needed
		let condensedContent: string | undefined;
		if (generateCondensed) {
			condensedContent = await this.generateCondensedBrief(project, content, userId);
		}

		// Save to database
		const savedBrief = await this.repository.saveProjectBrief(
			userId,
			project.id,
			content,
			briefDate,
			{
				task_count: taskCount,
				note_count: noteCount,
				template_id: template?.id,
				type: 'full',
				has_condensed: generateCondensed,
				condensed_content: condensedContent
			}
		);

		// Update template usage
		if (template) {
			await this.promptTemplateService.incrementTemplateUsage(template.id);
		}

		return {
			id: savedBrief.id,
			content,
			condensed_content: condensedContent,
			metadata: savedBrief.metadata
		};
	}

	private createOptimizedProjectPrompt(
		project: ProjectWithRelations,
		includeCondensedInstructions: boolean
	): string {
		// Format project for brief
		const projectSection = this.formatProjectForBrief(project, 'summary');

		// Filter and prioritize actionable tasks (first 7 most important)
		const actionableTasks = (project.tasks || [])
			.filter((t) => t.status !== 'done' && !t.deleted_at)
			.sort((a, b) => {
				// Priority sort logic
				if (a.status === 'blocked' && b.status !== 'blocked') return -1;
				if (a.priority === 'high' && b.priority !== 'high') return -1;
				if (a.start_date && !b.start_date) return -1;
				return 0;
			})
			.slice(0, 7);

		// Use PromptTemplateService for task formatting
		const taskSection =
			actionableTasks.length > 0
				? formatTasks(actionableTasks, { mode: 'summary' })
				: 'No active tasks';

		// Calculate metrics for overview
		const metrics = {
			blockedTasks: (project.tasks || []).filter((t) => t.status === 'blocked').length,
			highPriorityTasks: (project.tasks || []).filter(
				(t) => t.priority === 'high' && t.status !== 'done'
			).length,
			startingSoonTasks: this.getUpcomingTasks(project.tasks || []).length,
			totalActiveTasks: (project.tasks || []).filter(
				(t) => t.status !== 'done' && !t.deleted_at
			).length
		};

		const basePrompt = `Create a focused brief for "${project.name}".

${projectSection}

-----
Task Overview:
- Active: ${metrics.totalActiveTasks} tasks
- Blocked: ${metrics.blockedTasks} tasks
- High Priority: ${metrics.highPriorityTasks} tasks
- Starting Soon: ${metrics.startingSoonTasks} tasks

${taskSection}

----
Generate a brief that:
1. Summarizes current momentum and project health
2. Identifies TOP 3 priorities for today/this week
3. Flags any critical blockers or risks
4. Suggests 1-2 strategic insights based on the context

Keep it actionable and under 300 words.`;

		if (includeCondensedInstructions) {
			return (
				basePrompt + `\n\nALSO provide a 2-sentence TL;DR covering status + top priority.`
			);
		}

		return basePrompt;
	}

	private async generateCondensedBrief(
		project: ProjectWithRelations,
		fullBrief: string,
		userId: string
	): Promise<string> {
		// Extract key information for condensed prompt
		const upcomingTasks = this.getUpcomingTasks(project.tasks || []);

		// Format project for brief
		const projectSection = this.formatProjectForBrief(project, 'summary');

		// Use PromptTemplateService for task formatting
		const upcomingTasksSection =
			upcomingTasks.length > 0
				? formatTasks(upcomingTasks, { mode: 'summary' })
				: 'No upcoming tasks';

		const condensedPrompt = `Create a 3-4 sentence condensed summary of this project brief.

${projectSection}

Full Brief: ${this.truncate(fullBrief, 1000)}

Upcoming Tasks:
${upcomingTasksSection}

Focus the condensed summary on:
1. Overall project momentum (moving/blocked/needs attention)
2. The single most important next action
3. Any critical deadline or blocker

Keep it under ${this.sizeConfig.condensedMaxChars} characters.`;

		const systemPrompt = `You are a helpful assistant creating a condensed brief of a project. Provide only the most essential information: 1-2 key tasks, critical deadlines, and main blocker. Be very concise.`;
		try {
			const condensed = await this.smartLLM.generateText({
				systemPrompt,
				prompt: condensedPrompt,
				userId,
				profile: 'speed',
				temperature: 0.5,
				maxTokens: 512,
				operationType: 'daily_brief_condensed',
				projectId: project.id
			});

			return this.truncate(condensed, this.sizeConfig.condensedMaxChars);
		} catch (error) {
			console.error('Error generating condensed brief:', error);
			// Fallback to simple extraction
			return this.createCondensedVersion(fullBrief);
		}
	}

	private prioritizeTasks(tasks: Task[]): Task[] {
		return tasks.sort((a, b) => {
			// First priority: status (in_progress > blocked > backlog > done)
			const statusOrder = { in_progress: 0, blocked: 1, backlog: 2, done: 3 };
			const statusDiff = (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
			if (statusDiff !== 0) return statusDiff;

			// Second priority: priority level
			const priorityOrder = { high: 0, medium: 1, low: 2 };
			const priorityDiff =
				(priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
			if (priorityDiff !== 0) return priorityDiff;

			// Third priority: start date (sooner is higher priority)
			if (a.start_date && b.start_date) {
				return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
			}
			if (a.start_date) return -1;
			if (b.start_date) return 1;

			// Finally: updated date (more recent first)
			return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
		});
	}

	private getUpcomingTasks(tasks: Task[]): Task[] {
		const now = new Date();
		const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

		return tasks
			.filter((task) => {
				if (!task.start_date || task.status === 'done') return false;
				const startDate = new Date(task.start_date);
				return startDate >= now && startDate <= weekFromNow;
			})
			.sort((a, b) => {
				return new Date(a.start_date!).getTime() - new Date(b.start_date!).getTime();
			});
	}

	private truncate(text: string, maxLength: number): string {
		if (!text || text.length <= maxLength) return text;
		return text.substring(0, maxLength - 3) + '...';
	}

	private createCondensedVersion(fullContent: string): string {
		// Simple fallback condensing logic
		const lines = fullContent.split('\n').filter((line) => line.trim());
		const condensed =
			lines
				.slice(0, 4)
				.join(' ')
				.substring(0, this.sizeConfig.condensedMaxChars - 3) + '...';
		return condensed;
	}

	private generateSimpleBrief(project: ProjectWithRelations): string {
		// Format project for brief
		const projectSection = this.formatProjectForBrief(project, 'full');

		const sections = [projectSection];

		if ((project.tasks?.length || 0) > 0) {
			const taskSection = formatTasks(project.tasks!.slice(0, 5), {
				mode: 'summary'
			});
			sections.push(taskSection);
		}

		sections.push(
			'\n*This project needs more tasks and context to generate detailed insights.*'
		);

		return sections.join('\n\n');
	}

	private generateFallbackContent(project: ProjectWithRelations): string {
		return BriefFormattingUtils.generateFallbackProjectContent(project);
	}

	// Helper method to format project for briefs
	private formatProjectForBrief(project: ProjectWithRelations, mode: 'full' | 'summary'): string {
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
			if (mode === 'summary' && project.executive_summary.length > 200) {
				sections.push(project.executive_summary.substring(0, 200) + '...');
			} else {
				sections.push(project.executive_summary);
			}
		}

		// Context
		if (project.context) {
			sections.push(`\n**Context:**`);
			if (mode === 'summary' && project.context.length > 500) {
				sections.push(project.context.substring(0, 500) + '...');
			} else {
				sections.push(project.context);
			}
		}

		return sections.join('\n');
	}
}
