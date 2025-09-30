// apps/web/src/lib/services/dailyBrief/mainBriefGenerator.ts
import type { DailyBriefRepository } from './repository';
import type { SmartLLMService } from '../smart-llm-service';
import { PromptTemplateService } from '../promptTemplate.service';
import { PromptEnhancerService } from '../promptEnhancer.service';
import { BriefFormattingUtils } from '$lib/utils/briefFormatting.utils';
import type { ProjectBriefResult } from './projectBriefGenerator';

interface MainBriefConfig {
	maxProjectsForFullContext: number;
	useCondensedThreshold: number;
	maxUserContextChars: number;
}

export class MainBriefGenerator {
	private promptTemplateService: PromptTemplateService;
	private promptEnhancerService: PromptEnhancerService;

	private config: MainBriefConfig = {
		maxProjectsForFullContext: 5,
		useCondensedThreshold: 7,
		maxUserContextChars: 1000
	};

	constructor(
		private repository: DailyBriefRepository,
		private smartLLM: SmartLLMService
	) {
		this.promptTemplateService = new PromptTemplateService(this.repository.supabase);
		this.promptEnhancerService = new PromptEnhancerService();
	}

	async generateMainBrief(
		userId: string,
		projectBriefs: ProjectBriefResult[],
		briefDate: string,
		userContext: any
	): Promise<{ id: string; content: string }> {
		try {
			// Get template
			const template = this.promptTemplateService.getMainDailyBriefTemplate();

			// Intelligently format project briefs based on count and priority
			const formattedBriefs = this.intelligentlyFormatProjectBriefs(projectBriefs);

			// Create optimized prompt
			let prompt = this.createOptimizedMainBriefPrompt(
				template,
				formattedBriefs,
				briefDate,
				projectBriefs
			);

			// Enhance prompt with filtered user context
			const filteredUserContext = this.filterUserContext(userContext);
			prompt = await this.promptEnhancerService.enhancePromptWithContext(
				prompt,
				filteredUserContext,
				{
					useEnhancedContext: true,
					includeTimeContext: true,
					includeMotivationalContext: false // Skip to save tokens
				}
			);

			// Select appropriate model based on context size
			const preferredModels = this.selectModelsForContextSize(prompt);

			// Generate content
			const content = await this.smartLLM.generateText({
				prompt,
				userId,
				profile:
					projectBriefs.length > this.config.useCondensedThreshold
						? 'balanced'
						: 'quality',
				temperature: 0.7,
				maxTokens: 4096,
				operationType: 'daily_brief_main'
			});

			// Extract insights
			const priorityActions = this.extractPriorityActions(content);

			// Save to database
			const savedBrief = await this.repository.saveMainBrief(
				userId,
				briefDate,
				content,
				projectBriefs.map((b) => b.id)
			);

			return {
				id: savedBrief.id,
				content
			};
		} catch (error) {
			console.error('Error generating main brief:', error);

			// Return fallback
			const fallbackContent = BriefFormattingUtils.generateFallbackMainContent(
				projectBriefs,
				briefDate
			);

			return {
				id: 'fallback-main',
				content: fallbackContent
			};
		}
	}

	private intelligentlyFormatProjectBriefs(projectBriefs: ProjectBriefResult[]): string {
		if (projectBriefs.length === 0) {
			return 'No active projects';
		}

		// Categorize projects by importance/activity
		const categorizedProjects = this.categorizeProjects(projectBriefs);

		// Use different formatting strategies based on project count
		if (projectBriefs.length <= this.config.maxProjectsForFullContext) {
			// Use full briefs for small number of projects
			return this.formatFullBriefs(categorizedProjects);
		} else if (projectBriefs.length <= this.config.useCondensedThreshold) {
			// Mix of full and condensed for medium number
			return this.formatMixedBriefs(categorizedProjects);
		} else {
			// Use condensed for all when many projects
			return this.formatCondensedBriefs(categorizedProjects);
		}
	}

	private categorizeProjects(briefs: ProjectBriefResult[]): {
		highPriority: ProjectBriefResult[];
		active: ProjectBriefResult[];
		maintenance: ProjectBriefResult[];
	} {
		const highPriority: ProjectBriefResult[] = [];
		const active: ProjectBriefResult[] = [];
		const maintenance: ProjectBriefResult[] = [];

		briefs.forEach((brief) => {
			// Analyze brief content for categorization
			const content = brief.condensed_content || brief.content;
			const lowerContent = content.toLowerCase();

			if (
				lowerContent.includes('urgent') ||
				lowerContent.includes('critical') ||
				lowerContent.includes('high priority') ||
				lowerContent.includes('blocked') ||
				lowerContent.includes('deadline')
			) {
				highPriority.push(brief);
			} else if (
				lowerContent.includes('in progress') ||
				lowerContent.includes('momentum') ||
				lowerContent.includes('moving forward')
			) {
				active.push(brief);
			} else {
				maintenance.push(brief);
			}
		});

		return { highPriority, active, maintenance };
	}

	// In mainBriefGenerator.ts, update the formatting methods to preserve project slugs

	private formatFullBriefs(categorized: ReturnType<typeof this.categorizeProjects>): string {
		const sections: string[] = [];

		if (categorized.highPriority.length > 0) {
			sections.push('### 🔴 High Priority Projects\n');
			sections.push(
				...categorized.highPriority.map(
					(b) =>
						`**${b.project_name}:**\n${b.content}\n[View ${b.project_name} project](/projects/${b.project_id})\n`
				)
			);
		}

		if (categorized.active.length > 0) {
			sections.push('\n### 🟢 Active Projects\n');
			sections.push(
				...categorized.active.map(
					(b) =>
						`**${b.project_name}:**\n${b.content}\n[View ${b.project_name} project](/projects/${b.project_id})\n`
				)
			);
		}

		if (categorized.maintenance.length > 0) {
			sections.push('\n### 🔵 Maintenance Projects\n');
			sections.push(
				...categorized.maintenance.map(
					(b) =>
						`**${b.project_name}:**\n${b.content}\n[View ${b.project_name} project](/projects/${b.project_id})\n`
				)
			);
		}

		return sections.join('\n');
	}

	private formatMixedBriefs(categorized: ReturnType<typeof this.categorizeProjects>): string {
		const sections: string[] = [];

		// Full briefs for high priority
		if (categorized.highPriority.length > 0) {
			sections.push('### 🔴 High Priority Projects (Detailed)\n');
			sections.push(
				...categorized.highPriority.map(
					(b) =>
						`**${b.project_name}:**\n${b.content}\n[View ${b.project_name} project](/projects/${b.project_id})\n`
				)
			);
		}

		// Condensed for others
		if (categorized.active.length > 0) {
			sections.push('\n### 🟢 Active Projects (Summary)\n');
			sections.push(
				...categorized.active.map(
					(b) =>
						`**${b.project_name}:** ${b.condensed_content || this.extractFirstParagraph(b.content)}\n[View ${b.project_name} project](/projects/${b.project_id})\n`
				)
			);
		}

		if (categorized.maintenance.length > 0) {
			sections.push('\n### 🔵 Other Projects (Summary)\n');
			sections.push(
				...categorized.maintenance.map(
					(b) =>
						`**${b.project_name}:** ${b.condensed_content || this.extractFirstParagraph(b.content)}\n[View ${b.project_name} project](/projects/${b.project_id})\n`
				)
			);
		}

		return sections.join('\n');
	}

	private formatCondensedBriefs(categorized: ReturnType<typeof this.categorizeProjects>): string {
		const sections: string[] = [];

		// All condensed but organized by priority
		const allProjects = [
			...categorized.highPriority.map((p) => ({ ...p, priority: 'high' })),
			...categorized.active.map((p) => ({ ...p, priority: 'active' })),
			...categorized.maintenance.map((p) => ({ ...p, priority: 'maintenance' }))
		];

		sections.push('### 📊 Project Status Overview\n');

		allProjects.forEach((project) => {
			const icon =
				project.priority === 'high' ? '🔴' : project.priority === 'active' ? '🟢' : '🔵';
			const summary =
				project.condensed_content || this.extractFirstParagraph(project.content);
			sections.push(`${icon} **${project.project_name}:** ${summary}`);
			sections.push(
				`[View ${project.project_name} project](/projects/${project.project_id})\n`
			);
		});

		return sections.join('\n');
	}

	private createOptimizedMainBriefPrompt(
		template: string,
		formattedBriefs: string,
		briefDate: string,
		projectBriefs: ProjectBriefResult[]
	): string {
		// Extract key metrics for the prompt
		const metrics = this.extractKeyMetrics(projectBriefs);

		// Create project links mapping
		const projectLinks = projectBriefs.map((brief) => ({
			name: brief.project_name,
			url: `/projects/${brief.project_id}`
		}));

		const variables = {
			project_briefs: formattedBriefs,
			brief_date: BriefFormattingUtils.formatBriefDate(briefDate),
			user_context: 'Active user working on personal and professional development',
			key_metrics: `${metrics.totalProjects} projects, ${metrics.highPriorityCount} high priority, ${metrics.upcomingDeadlines} upcoming deadlines`,
			project_links: JSON.stringify(projectLinks)
		};

		let optimizedTemplate = template;

		// Add link generation instructions
		const linkInstructions = `\n\nPROJECT LINKS:
For each project mentioned in the brief, include a markdown link using this format:
[View "projectName" project](/projects/"projectId")

Available projects and their URLs:
${projectLinks.map((p) => `- ${p.name}: [View ${p.name} project](${p.url})`).join('\n')}

Include these links naturally within the brief sections where each project is discussed.`;

		optimizedTemplate += linkInstructions;

		// Add instructions for handling many projects
		if (projectBriefs.length > this.config.useCondensedThreshold) {
			optimizedTemplate += `\n\nNote: With ${projectBriefs.length} active projects, focus on:
1. Cross-project patterns and synergies
2. Resource allocation and priority conflicts
3. Strategic recommendations for managing multiple initiatives
4. The 3-5 most critical actions across all projects`;
		}

		return this.promptTemplateService.substituteTemplateVariables(optimizedTemplate, variables);
	}

	private filterUserContext(userContext: any): any {
		if (!userContext) return null;

		// Keep only the most relevant fields for daily briefs
		const relevantFields = [
			'priorities',
			'active_projects',
			'blockers',
			'goals_overview',
			'work_style',
			'schedule_preferences'
		];

		const filtered: any = {};

		relevantFields.forEach((field) => {
			if (userContext[field]) {
				// Truncate long fields
				filtered[field] = this.truncate(userContext[field], 200);
			}
		});

		return filtered;
	}

	private selectModelsForContextSize(prompt: string): string[] {
		const estimatedTokens = Math.ceil(prompt.length / 4);

		if (estimatedTokens < 4000) {
			// Can use Mistral
			return ['gpt-5-nano'];
		} else if (estimatedTokens < 25000) {
			// Skip Mistral, use Qwen or GPT
			return ['gpt-5-nano'];
		} else {
			// Only GPT can handle
			return ['gpt-5-nano', 'gpt-5-mini'];
		}
	}

	private extractKeyMetrics(projectBriefs: ProjectBriefResult[]): {
		totalProjects: number;
		highPriorityCount: number;
		upcomingDeadlines: number;
	} {
		let highPriorityCount = 0;
		let upcomingDeadlines = 0;

		projectBriefs.forEach((brief) => {
			const content = (brief.content + (brief.condensed_content || '')).toLowerCase();

			if (
				content.includes('high priority') ||
				content.includes('urgent') ||
				content.includes('critical')
			) {
				highPriorityCount++;
			}

			if (content.includes('due') || content.includes('deadline')) {
				upcomingDeadlines++;
			}
		});

		return {
			totalProjects: projectBriefs.length,
			highPriorityCount,
			upcomingDeadlines
		};
	}

	private extractFirstParagraph(content: string): string {
		const lines = content.split('\n').filter((line) => line.trim());
		const firstContentLine = lines.find(
			(line) => !line.startsWith('#') && !line.startsWith('*') && line.length > 20
		);

		return firstContentLine
			? this.truncate(firstContentLine, 200)
			: this.truncate(lines[0] || '', 200);
	}

	private truncate(text: string, maxLength: number): string {
		if (!text || text.length <= maxLength) return text;
		return text.substring(0, maxLength - 3) + '...';
	}

	private extractPriorityActions(content: string): string[] {
		const actions: string[] = [];
		const lines = content.split('\n');

		for (const line of lines) {
			const trimmed = line.trim();
			// Match numbered lists or bullet points
			const match = trimmed.match(/^(\d+\.|[-•*])\s+(.+)$/);
			if (match && match[2]) {
				actions.push(match[2].trim());
				if (actions.length >= 5) break;
			}
		}

		return actions;
	}
}
