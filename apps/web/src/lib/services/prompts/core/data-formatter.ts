// apps/web/src/lib/services/prompts/core/data-formatter.ts
/**
 * Data formatting utilities for prompt generation
 * Extracted from the original PromptTemplateService for reuse across all prompt services
 */

import type { ProjectWithRelations, Task } from '$lib/types/project';
import type { UserContext } from '$lib/types/user-context';
import {
	formatNotesForPrompt,
	formatProjectForPrompt,
	formatTasksForPrompt
} from '$lib/utils/markdown-nesting';

const MAX_TASKS_TO_DISPLAY = 25;

export interface FullProjectData {
	user_id: string;
	fullProjectWithRelations: ProjectWithRelations | null;
	timestamp: string;
}

interface FormatOptions {
	mode: 'full' | 'summary';
}

export function formatProjectData(params: FullProjectData): string {
	const { fullProjectWithRelations: project } = params;

	if (!project) {
		return 'No project data available';
	}

	const sections: string[] = [];

	// Use new markdown nesting utilities for proper hierarchy
	// Using baseLevel 2 to create ## for main sections, ### for subsections
	const projectSection = formatProjectForPrompt(project, 2);
	sections.push(projectSection);

	// Filter and format tasks using new nesting utilities
	const activeTasks = (project.tasks || [])
		.filter((task) => ['backlog', 'in_progress', 'blocked'].includes(task.status))
		.slice(0, MAX_TASKS_TO_DISPLAY);

	if (activeTasks.length > 0) {
		const taskSection = formatTasksForPrompt(activeTasks, 3, 'full'); // Start at ### level
		sections.push(taskSection);
	}

	// Format recent notes using new nesting utilities
	if ((project.notes?.length || 0) > 0) {
		const recentNotes = project.notes!.slice(0, 10);
		const notesSection = formatNotesForPrompt(recentNotes, 3, 'full'); // Start at ### level
		sections.push(notesSection);
	}

	return sections.join('\n\n');
}

/**
 * Format tasks for LLM prompts with proper nesting
 */
export function formatTasks(tasks: Task[], options: FormatOptions): string {
	const { mode } = options;

	if (!tasks || tasks.length === 0) return 'No tasks';

	// Sort tasks by start_date (nulls last)
	const sortedTasks = [...tasks].sort((a, b) => {
		if (!a.start_date && !b.start_date) return 0;
		if (!a.start_date) return 1;
		if (!b.start_date) return -1;
		return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
	});

	// Group tasks by type and status
	const groups = groupTasks(sortedTasks);
	const sections: string[] = [];

	// Format each group that has tasks
	Object.entries(groups).forEach(([groupName, groupTasks]) => {
		if (groupTasks.length > 0) {
			sections.push(
				`\n${groupName.toUpperCase().replace('_', ' ')} TASKS (${groupTasks.length}):`
			);
			// groupTasks.forEach((task) => {
			// 	sections.push(formatSingleTask(task, mode));
			// });
			const taskData = groupTasks.map((task) => ({
				id: task.id,
				title: task.title,
				status: task.status,
				priority: task.priority,
				task_type: task.task_type || 'one_off',
				...(task.start_date && { start_date: task.start_date }),
				...(task.duration_minutes && { duration_minutes: task.duration_minutes }),
				...(task.description && { description: truncateContent(task.description, 400) }),
				...(task.details && { details: truncateContent(task.details, 900) })
			}));

			sections.push(JSON.stringify(taskData));
		}
	});

	return sections.length > 0 ? sections.join('\n') : 'No tasks';
}

/**
 * Format user context for LLM prompts
 */
export function formatUserContext(userContext: UserContext | null, options: FormatOptions): string {
	const { mode } = options;

	if (!userContext) return 'No user context available';

	const sections: string[] = ['**USER CONTEXT:**'];

	// Helper function to add section if it exists
	const addSection = (label: string, content: string | null | undefined, maxLength?: number) => {
		if (content) {
			let formattedContent = content;
			if (mode === 'summary' && maxLength && content.length > maxLength) {
				formattedContent = content.substring(0, maxLength) + '...';
			}
			sections.push(`\n**${label}:**`);
			sections.push(formattedContent);
		}
	};

	// Add sections based on actual data model properties
	addSection('Background', userContext.background, 200);
	addSection('Active Projects', userContext.active_projects, 200);
	addSection('Work Style', userContext.work_style, 150);
	addSection('Workflows', userContext.workflows, 200);
	addSection('Skill Gaps', userContext.skill_gaps, 150);
	addSection('Collaboration Needs', userContext.collaboration_needs, 150);
	addSection('Goals Overview', userContext.goals_overview, 200);
	addSection('Priorities', userContext.priorities, 150);
	addSection('Blockers', userContext.blockers, 150);
	addSection('Schedule Preferences', userContext.schedule_preferences, 150);
	addSection('Habits', userContext.habits, 150);
	addSection('Tools', userContext.tools, 150);
	addSection('Communication Style', userContext.communication_style, 150);
	addSection('Focus Areas', userContext.focus_areas, 150);
	addSection('Help Priorities', userContext.help_priorities, 150);
	addSection('Organization Method', userContext.organization_method, 150);
	addSection('Productivity Challenges', userContext.productivity_challenges, 150);

	return sections.length > 1 ? sections.join('\n') : 'No user context available';
}

/**
 * Format existing tasks for prompt context
 */
export function formatExistingTasksForPrompt(tasks: Task[]): string {
	const relevantTasks = tasks.filter((task) => task.status !== 'done' && !task.deleted_at);

	if (relevantTasks.length === 0) return 'No existing tasks';

	const taskData = relevantTasks.map((task) => ({
		id: task.id,
		title: task.title,
		status: task.status,
		priority: task.priority,
		task_type: task.task_type || 'one_off',
		...(task.start_date && { start_date: task.start_date }),
		...(task.duration_minutes && { duration_minutes: task.duration_minutes }),
		...(task.description && { description: truncateContent(task.description, 400) }),
		...(task.details && { details: truncateContent(task.details, 900) })
	}));

	return `**EXISTING TASKS (${relevantTasks.length}):**
${JSON.stringify(taskData)}`;
}

/**
 * Truncate content to specified length
 */
export function truncateContent(
	content: string | null | undefined,
	maxLength: number = 1300
): string {
	if (!content) return '';
	return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
}

// ==========================================
// PRIVATE HELPER FUNCTIONS
// ==========================================

function groupTasks(tasks: Task[]): Record<string, Task[]> {
	const groups: Record<string, Task[]> = {
		in_progress: [],
		blocked: [],
		high_priority: [],
		one_off: [],
		recurring: [],
		backlog: []
	};

	tasks.forEach((task) => {
		// Group by status first (higher priority)
		if (task.status === 'in_progress') {
			groups.in_progress!.push(task);
		} else if (task.status === 'blocked') {
			groups.blocked!.push(task);
		} else if (task.priority === 'high' && task.status !== 'done') {
			groups.high_priority!.push(task);
		} else if (task.task_type === 'recurring') {
			groups.recurring!.push(task);
		} else if (task.status === 'backlog') {
			groups.backlog!.push(task);
		} else {
			// Default to one_off for other tasks
			groups.one_off!.push(task);
		}
	});

	return groups;
}

function formatSingleTask(task: Task, mode: 'full' | 'summary'): string {
	const parts: string[] = [];

	// ID and title
	parts.push(`[${task.id}] ${task.title || 'Untitled'}`);

	// Status and priority indicators
	const indicators: string[] = [];
	if (task.status === 'blocked') indicators.push('🚫');
	if (task.status === 'in_progress') indicators.push('▶️');
	if (task.priority === 'high') indicators.push('🔴');
	if (task.start_date) indicators.push(`📅${task.start_date}`);
	if (task.dependencies?.length) indicators.push(`deps:[${task.dependencies.length}]`);

	if (indicators.length > 0) {
		parts.push(`(${indicators.join(' ')})`);
	}

	// Description and details
	if (task.description || task.details) {
		const descriptionParts: string[] = [];

		if (task.description) {
			const desc =
				mode === 'summary' && task.description.length > 80
					? task.description.substring(0, 80) + '...'
					: task.description;
			descriptionParts.push(desc);
		}

		if (task.details) {
			const details =
				mode === 'summary' && task.details.length > 60
					? task.details.substring(0, 60) + '...'
					: task.details;
			descriptionParts.push(`Details: ${details}`);
		}

		if (descriptionParts.length > 0) {
			parts.push(`- ${descriptionParts.join(' | ')}`);
		}
	}

	return `- ${parts.join(' ')}`;
}

/**
 * Format project summaries list for similarity detection
 * Used when checking for duplicate/similar projects during new project creation
 */
export function formatProjectsSummaryList(
	projects: Array<{
		id: string;
		name: string;
		slug: string;
		description: string | null;
		executive_summary: string | null;
		tags: string[];
		status: string;
	}>
): string {
	if (!projects || projects.length === 0) {
		return 'No existing projects.';
	}

	const sections: string[] = [];

	projects.forEach((project, index) => {
		const parts: string[] = [];

		// Project number and name
		parts.push(`### Project ${index + 1}: ${project.name}`);

		// Description (truncated)
		if (project.description) {
			const desc = truncateContent(project.description, 200);
			parts.push(`**Description**: ${desc}`);
		}

		// Executive summary (truncated)
		if (project.executive_summary) {
			const summary = truncateContent(project.executive_summary, 300);
			parts.push(`**Summary**: ${summary}`);
		}

		// Tags
		if (project.tags && project.tags.length > 0) {
			parts.push(`**Tags**: ${project.tags.join(', ')}`);
		}

		// Project ID (for reference in recommendations)
		parts.push(`**Project ID**: \`${project.id}\``);

		sections.push(parts.join('\n'));
	});

	return sections.join('\n\n');
}

// Backward compatibility exports
export const DataFormatterService = {
	formatTasks,
	formatUserContext,
	formatExistingTasksForPrompt,
	truncateContent,
	formatProjectsSummaryList
};
