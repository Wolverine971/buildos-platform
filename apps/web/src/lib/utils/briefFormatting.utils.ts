// apps/web/src/lib/utils/briefFormatting.utils.ts

import type { Task, ProjectWithRelations } from '$lib/types/project';

/**
 * Utility functions for formatting brief content and data
 */
export class BriefFormattingUtils {
	/**
	 * Format field name from snake_case to Title Case
	 */
	private static formatFieldName(fieldName: string): string {
		return fieldName.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
	}

	/**
	 * Format tasks for brief display
	 */
	static formatTasks(tasks: Task[]): string {
		if (!tasks?.length) return 'No active tasks';

		return tasks
			.slice(0, 5)
			.map((task) => `- ${task.title} (${task.status})`)
			.join('\n');
	}

	/**
	 * Calculate task completion rate
	 */
	static calculateCompletionRate(tasks: any[]): number {
		if (!tasks?.length) return 0;
		const completed = tasks.filter((task) => task.status === 'done').length;
		return Math.round((completed / tasks.length) * 100);
	}

	/**
	 * Extract priority actions from generated content
	 */
	static extractPriorityActions(content: string): string[] {
		try {
			const priorityPatterns = [
				/### 🎯 Top Priorities Today\s*\n((?:[-*]\s*.+\n?)+)/,
				/\*\*Priority 1\*\*: (.+)/,
				/\*\*Priority 2\*\*: (.+)/,
				/\*\*Priority 3\*\*: (.+)/,
				/### Key Actions\s*\n((?:[-*]\s*.+\n?)+)/,
				/\*\*Do First\*\*: (.+)/,
				/🔥 Key Actions\s*\n((?:[-*]\s*.+\n?)+)/
			];

			let actions: string[] = [];

			for (const pattern of priorityPatterns) {
				const match = content.match(pattern);
				if (match && match[1]) {
					if (match[1].includes('\n')) {
						// Multiple actions in list format
						const listActions = match[1]
							.split('\n')
							.filter(
								(line) => line.trim().startsWith('-') || line.trim().startsWith('*')
							)
							.map((line) => line.replace(/^[-*]\s*/, '').trim())
							.filter((action) => action.length > 0);
						actions.push(...listActions);
					} else {
						// Single action
						actions.push(match[1].trim());
					}

					if (actions.length > 0) break; // Use first successful pattern
				}
			}

			return actions.slice(0, 5); // Limit to top 5 actions
		} catch (error) {
			console.error('Error extracting priority actions:', error);
			return ['Review daily priorities', 'Focus on key project work'];
		}
	}

	/**
	 * Format date for brief display
	 */
	static formatBriefDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	/**
	 * Generate fallback project content when AI generation fails
	 */
	static generateFallbackProjectContent(project: ProjectWithRelations): string {
		let content = `## ${project.name}

**Status Update:** Project is currently ${project.status || 'active'} and requires attention.

**Today's Focus:**
- Review current progress and identify blockers
- Complete priority tasks and deliverables
- Plan next steps and upcoming milestones\n`;

		// Add task information
		if (project.tasks?.length) {
			const activeTasks = project.tasks.filter((t) => t.status !== 'done' && !t.deleted_at);
			const blockedTasks = project.tasks.filter((t) => t.status === 'blocked');
			const highPriorityTasks = project.tasks.filter(
				(t) => t.priority === 'high' && t.status !== 'done'
			);

			content += `\n**Task Overview:**
- Active Tasks: ${activeTasks.length}
- Blocked: ${blockedTasks.length}
- High Priority: ${highPriorityTasks.length}\n`;
		} else {
			content +=
				'\n**No active tasks:** Consider adding specific tasks to maintain momentum\n';
		}

		// Add executive summary if available
		if (project?.executive_summary) {
			content += `\n**Summary:** ${project.executive_summary}\n`;
		}

		content += `\n**Context:** \n${project.context}\n`;

		content +=
			'\n*Focus on maintaining momentum and addressing any blockers to keep the project moving forward.*';

		return content;
	}

	/**
	 * Generate fallback main brief content when AI generation fails
	 */
	static generateFallbackMainContent(projectBriefs: any[], targetDate: string): string {
		const dateString = this.formatBriefDate(targetDate);

		return `# Daily Brief - ${dateString}

## 🌅 Daily Focus

Welcome to your daily brief! Today you have ${projectBriefs.length} active projects to focus on.

## 🎯 Top Priorities Today

${projectBriefs.length > 0 ? '**Project Priorities:**' : ''}
${projectBriefs.map((brief) => `- Make progress on ${brief.project_name || 'project'}`).join('\n')}


## 🔥 Key Actions

**Do First:**
- Review your most important project deliverables
- Complete high-priority tasks from your active projects

**Focus Time:**
- Dedicate focused work sessions to your key initiatives
- Make measurable progress on projects

**Quick Wins:**
- Handle any urgent but small tasks
- Update project status and plan next steps

## 💡 Strategic Insights

*Stay focused, take action, and make today count toward your bigger vision.*`;
	}

	/**
	 * Validate and sanitize template variables
	 */
	static sanitizeTemplateVariables(variables: Record<string, any>): Record<string, string> {
		const sanitized: Record<string, string> = {};

		for (const [key, value] of Object.entries(variables)) {
			// Convert to string and handle null/undefined
			sanitized[key] = value ? String(value) : '';
		}

		return sanitized;
	}

	/**
	 * Extract theme from brief content for dynamic titles
	 */
	static extractBriefTheme(content: string): string {
		// Look for theme patterns in the content
		const themePatterns = [/## 🌅 (.+?) - /, /### (.+?) Focus/, /Theme: (.+)/i];

		for (const pattern of themePatterns) {
			const match = content.match(pattern);
			if (match && match[1]) {
				return match[1].trim();
			}
		}

		// Default themes based on day of week
		const dayNames = [
			'Sunday',
			'Monday',
			'Tuesday',
			'Wednesday',
			'Thursday',
			'Friday',
			'Saturday'
		];
		const today = new Date().getDay();
		const dayThemes = [
			'Reflection & Planning',
			'Fresh Start',
			'Building Momentum',
			'Mid-week Focus',
			'Pushing Forward',
			'Final Sprint',
			'Weekly Review'
		];

		return dayThemes[today] || 'Daily Focus';
	}
}
