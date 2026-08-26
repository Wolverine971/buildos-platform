// apps/web/src/lib/utils/markdown-nesting.ts
import { format } from 'date-fns/format';
import type { Task, ProjectWithRelations } from '$lib/types/project';
import { DataFormatterService } from '$lib/services/prompts/core/data-formatter';

interface TaskHierarchy {
	task: Task;
	children: TaskHierarchy[];
	level: number;
}

/**
 * Adjust markdown heading levels in content to maintain hierarchy
 */
export function adjustMarkdownHeadingLevels(
	content: string,
	baseLevel: number = 2,
	preserveStructure: boolean = true
): string {
	if (!content) return '';

	const lines = content.split('\n');
	let adjustedLines: string[] = [];

	for (const line of lines) {
		// Check if line is a markdown header
		const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);

		if (headerMatch) {
			const [, hashes = '', headerText = ''] = headerMatch;
			const currentLevel = hashes.length;

			// Calculate new level (minimum baseLevel + 1, maximum 6)
			let newLevel: number;
			if (preserveStructure) {
				// Maintain relative structure but shift to start at baseLevel + 1
				newLevel = Math.min(baseLevel + currentLevel, 6);
			} else {
				// Simple shift by baseLevel
				newLevel = Math.min(currentLevel + baseLevel, 6);
			}

			const newHashes = '#'.repeat(newLevel);
			adjustedLines.push(`${newHashes} ${headerText}`);
		} else {
			adjustedLines.push(line);
		}
	}

	return adjustedLines.join('\n');
}

// Add these functions to your markdown-nesting.ts file

/**
 * Normalize markdown headings back to a reasonable base level
 * This undoes the effects of repeated adjustMarkdownHeadingLevels calls
 */
export function normalizeMarkdownHeadings(content: string, targetBaseLevel: number = 2): string {
	if (!content) return '';

	const lines = content.split('\n');

	// Find all heading levels in the content
	const headingLevels: number[] = [];
	lines.forEach((line) => {
		const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
		if (headerMatch && headerMatch[1]) {
			headingLevels.push(headerMatch[1].length);
		}
	});

	if (headingLevels.length === 0) return content; // No headings found

	// Find the minimum heading level (this represents the "base" level in the content)
	const minLevel = Math.min(...headingLevels);

	// If the minimum level is deeper than our target, we need to normalize
	if (minLevel > targetBaseLevel) {
		const levelOffset = minLevel - targetBaseLevel;

		const adjustedLines = lines.map((line) => {
			const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
			if (headerMatch && headerMatch[1]) {
				const [, hashes = '', headerText = ''] = headerMatch;
				const currentLevel = hashes.length;
				const newLevel = Math.max(currentLevel - levelOffset, 1); // Minimum H1
				const newHashes = '#'.repeat(newLevel);
				return `${newHashes} ${headerText}`;
			}
			return line;
		});

		return adjustedLines.join('\n');
	}

	return content;
}

/**
 * Check if content has inflated headings (headings that are deeper than expected)
 */
export function hasInflatedHeadings(content: string, expectedMaxDepth: number = 3): boolean {
	if (!content) return false;

	const lines = content.split('\n');
	const headingLevels: number[] = [];

	lines.forEach((line) => {
		const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
		if (headerMatch && headerMatch[1]) {
			headingLevels.push(headerMatch[1].length);
		}
	});

	if (headingLevels.length === 0) return false;

	// Check if any headings are deeper than expected
	const maxLevel = Math.max(...headingLevels);
	return maxLevel > expectedMaxDepth;
}

/**
 * Updated formatProjectForPrompt with heading normalization
 */
export function formatProjectForPrompt(
	project: ProjectWithRelations,
	baseLevel: number = 2
): string {
	if (!project) return 'No project data available';

	const subHeadingPrefix = '#'.repeat(baseLevel + 1);
	const sections: string[] = [];

	let projectData = {
		id: project.id,
		name: project.name,
		status: project.status,
		description: project.description,
		start_date: project.start_date,
		end_date: project.end_date,
		tags: project.tags,
		executive_summary: project.executive_summary,
		context: `${project.context?.slice(0, 50)}...`
	};

	sections.push(JSON.stringify(projectData));

	// Project Context (with heading normalization)
	if (project.context) {
		sections.push(`\n**Full Context:**`);

		// First normalize any inflated headings from previous LLM processing
		const normalizedContext = normalizeMarkdownHeadings(project.context, 2);

		// Then adjust all headers in context to be nested under this section
		const nestedContext = adjustMarkdownHeadingLevels(
			normalizedContext,
			baseLevel + 1, // Start context headers at baseLevel + 2 (####)
			true
		);
		sections.push(nestedContext);
	}

	// Project Phases
	if (project.phases && project.phases.length > 0) {
		sections.push(`\n---------`);
		sections.push(`\n${subHeadingPrefix} Project Phases`);

		project.phases.forEach((phase) => {
			const phaseHeadingPrefix = '#'.repeat(baseLevel + 2);
			sections.push(`\n${phaseHeadingPrefix} Phase ${phase.order}: ${phase.name}`);

			if (phase.description) {
				sections.push(phase.description);
			}

			if (phase.start_date || phase.end_date) {
				sections.push(
					`**Timeline:** ${phase.start_date || 'Not set'} → ${phase.end_date || 'Not set'}`
				);
			}
		});
	}

	return sections.join('\n');
}

/**
 * Build a hierarchical structure from flat task array
 */
export function buildTaskHierarchy(tasks: Task[]): TaskHierarchy[] {
	const taskMap = new Map<string, TaskHierarchy>();
	const rootTasks: TaskHierarchy[] = [];

	// First pass: create all task nodes
	tasks.forEach((task) => {
		taskMap.set(task.id, {
			task,
			children: [],
			level: 0
		});
	});

	// Second pass: build parent-child relationships
	tasks.forEach((task) => {
		const taskNode = taskMap.get(task.id);
		if (!taskNode) return;

		if (task.parent_task_id && taskMap.has(task.parent_task_id)) {
			const parent = taskMap.get(task.parent_task_id)!;
			parent.children.push(taskNode);
			taskNode.level = parent.level + 1;
		} else {
			rootTasks.push(taskNode);
		}
	});

	// Third pass: calculate proper nesting levels
	function calculateLevels(nodes: TaskHierarchy[], level: number = 0) {
		nodes.forEach((node) => {
			node.level = level;
			calculateLevels(node.children, level + 1);
		});
	}

	calculateLevels(rootTasks);
	return rootTasks;
}

/**
 * Generate properly nested markdown for task hierarchy
 */
export function formatTaskHierarchy(
	taskHierarchy: TaskHierarchy[],
	title: string,
	baseLevel: number = 2,
	showDependencies: boolean = true
): string {
	if (!taskHierarchy.length) return '';

	const headingPrefix = '#'.repeat(baseLevel);
	let output = `${headingPrefix} ${title}\n\n`;

	function renderTaskNode(node: TaskHierarchy, currentLevel: number): string {
		const { task } = node;
		const taskLevel = Math.max(currentLevel, baseLevel + 1);
		const taskHeading = '#'.repeat(taskLevel);

		// Task status emoji and priority
		const status = getTaskStatusEmoji(task.status);
		const priority = task.priority === 'high' ? ' 🔥' : task.priority === 'low' ? ' 🔽' : '';
		const recurring = task.task_type === 'recurring' ? ' 🔄' : '';

		let taskOutput = `${taskHeading} ${status} ${task.title}${priority}${recurring}\n\n`;

		// Task description with proper markdown nesting
		if (task.description) {
			const description = task.description.trim();
			if (description) {
				// Ensure nested content is properly indented
				const nestedDescription = description
					.split('\n')
					.map((line) => line.trim())
					.join('\n');
				taskOutput += `${nestedDescription}\n\n`;
			}
		}

		// Task details if available
		if (task.details) {
			taskOutput += `**Details:**\n${task.details}\n\n`;
		}

		// Task metadata
		const metadata = buildTaskMetadata(task, showDependencies);
		if (metadata.length > 0) {
			taskOutput += `*${metadata.join(' • ')}*\n\n`;
		}

		// Dependencies section
		if (showDependencies && task.dependencies?.length) {
			taskOutput += `**Dependencies:** ${task.dependencies.length} task(s)\n\n`;
		}

		// Render child tasks with increased nesting
		if (node.children.length > 0) {
			taskOutput += `**Subtasks:**\n\n`;
			node.children.forEach((child) => {
				taskOutput += renderTaskNode(child, taskLevel + 1);
			});
		}

		return taskOutput;
	}

	taskHierarchy.forEach((rootNode) => {
		output += renderTaskNode(rootNode, baseLevel + 1);
	});

	return output;
}

/**
 * Format tasks for prompts with proper nesting and grouping
 */
export function formatTasksForPrompt(tasks: Task[], baseLevel: number = 2): string {
	if (!tasks || tasks.length === 0) return '';

	// Sort tasks by start_date (nulls last)
	const sortedTasks = [...tasks].sort((a, b) => {
		if (!a.start_date && !b.start_date) return 0;
		if (!a.start_date) return 1;
		if (!b.start_date) return -1;
		return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
	});

	// Group tasks by type and status
	const groups = groupTasks(sortedTasks);
	const headingPrefix = '#'.repeat(baseLevel);
	const subHeadingPrefix = '#'.repeat(baseLevel + 1);
	let output = `${headingPrefix} Tasks\n\n`;

	// Format each group that has tasks
	Object.entries(groups).forEach(([groupName, groupTasks]) => {
		if (groupTasks.length > 0) {
			output += `${subHeadingPrefix} ${groupName.toUpperCase().replace('_', ' ')} (${groupTasks.length})\n\n`;

			output += DataFormatterService.formatExistingTasksForPrompt(groupTasks);
			output += '\n';
		}
	});

	return output;
}

/**
 * Generate status-based task collections with proper nesting
 */
export function formatTasksByStatus(tasks: Task[], baseLevel: number = 2): string {
	if (!tasks.length) return '';

	const tasksByStatus = {
		in_progress: tasks.filter((t) => t.status === 'in_progress'),
		blocked: tasks.filter((t) => t.status === 'blocked'),
		backlog: tasks.filter((t) => t.status === 'backlog'),
		done: tasks.filter((t) => t.status === 'done')
	};

	let output = '';

	// Process each status group
	Object.entries(tasksByStatus).forEach(([status, statusTasks]) => {
		if (statusTasks.length === 0) return;

		const statusConfig = getStatusConfig(status);
		const hierarchy = buildTaskHierarchy(statusTasks);

		if (hierarchy.length > 0) {
			output += formatTaskHierarchy(
				hierarchy,
				`${statusConfig.emoji} ${statusConfig.title} (${statusTasks.length})`,
				baseLevel + 1
			);
		}
	});

	return output;
}

// Helper functions

function getTaskStatusEmoji(status: string): string {
	const statusMap: Record<string, string> = {
		done: '✅',
		in_progress: '🔄',
		blocked: '🚫',
		backlog: '📋'
	};
	return statusMap[status] || '📋';
}

function getStatusConfig(status: string) {
	const configs: Record<string, { emoji: string; title: string }> = {
		in_progress: { emoji: '🔄', title: 'In Progress' },
		blocked: { emoji: '🚫', title: 'Blocked' },
		backlog: { emoji: '📋', title: 'Backlog' },
		done: { emoji: '✅', title: 'Completed' }
	};
	return configs[status] || { emoji: '📋', title: 'Unknown' };
}

function buildTaskMetadata(task: Task, showDependencies: boolean): string[] {
	const metadata: string[] = [];

	if (task.start_date) {
		metadata.push(`**Start Date:** ${format(new Date(task.start_date), 'MMM d, yyyy')}`);
	}

	if (task.task_type) {
		metadata.push(`**Type:** ${task.task_type.replace('_', ' ')}`);
	}

	if (task.priority && task.priority !== 'medium') {
		metadata.push(`**Priority:** ${task.priority}`);
	}

	if (task.recurrence_pattern) {
		metadata.push(`**Recurrence:** ${task.recurrence_pattern}`);
	}

	if (showDependencies && task.dependencies?.length) {
		metadata.push(`**Dependencies:** ${task.dependencies.length}`);
	}

	if (task.completed_at) {
		metadata.push(`**Completed:** ${format(new Date(task.completed_at), 'MMM d, yyyy')}`);
	}

	return metadata;
}

function groupTasks(tasks: Task[]): {
	in_progress: Task[];
	blocked: Task[];
	high_priority: Task[];
	one_off: Task[];
	recurring: Task[];
	backlog: Task[];
} {
	const groups: {
		in_progress: Task[];
		blocked: Task[];
		high_priority: Task[];
		one_off: Task[];
		recurring: Task[];
		backlog: Task[];
	} = {
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
			groups.in_progress.push(task);
		} else if (task.status === 'blocked') {
			groups.blocked.push(task);
		} else if (task.priority === 'high' && task.status !== 'done') {
			groups.high_priority.push(task);
		} else if (task.task_type === 'recurring') {
			groups.recurring.push(task);
		} else if (task.status === 'backlog') {
			groups.backlog.push(task);
		} else {
			// Default to one_off for other tasks
			groups.one_off.push(task);
		}
	});

	return groups;
}
