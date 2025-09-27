// src/lib/services/promptTemplate.service.ts
// This file is now a backward compatibility wrapper for the refactored prompt services
import type { Database } from '$lib/database.types';

import type { Project, ProjectWithRelations, Task } from '$lib/types/project';
import type { DisplayedBrainDumpQuestion } from '$lib/types/brain-dump';
import type { SupabaseClient } from '@supabase/supabase-js';

// Import refactored services
import { DataFormatterService, formatProjectData } from './prompts/core/data-formatter';
import { ProjectDataFetcher } from './prompts/core/project-data-fetcher';
import {
	DataModelsComponent,
	generateDateParsing,
	generateQuestionGenerationInstructions,
	generateRecurringTaskRules,
	getDecisionMatrixUpdateCriteria,
	generateProjectContextFramework,
	generateFrameworkAdaptationExamples,
	generateOperationIdInstructions,
	generateOperationId,
	generateDecisionMatrix,
	generateMinimalPreprocessingSteps
} from './prompts/core/prompt-components';

type ProjectBriefTemplate = Database['public']['Tables']['project_brief_templates']['Row'];

interface FormatOptions {
	mode: 'full' | 'summary';
}

export class PromptTemplateService {
	private supabase: SupabaseClient;
	private projectDataFetcher: ProjectDataFetcher;

	constructor(supabase: SupabaseClient) {
		this.supabase = supabase;
		this.projectDataFetcher = new ProjectDataFetcher(supabase);
	}

	// Data formatting methods have been moved to DataFormatterService
	// Import and use DataFormatterService directly for formatting operations

	// ==========================================
	// EXISTING TEMPLATE METHODS (unchanged)
	// ==========================================

	async getUserProjectTemplate(
		userId: string,
		projectId: string,
		project: ProjectWithRelations
	): Promise<ProjectBriefTemplate | null> {
		try {
			const supabase = this.supabase;
			// Try to get user's active project template
			const { data: userTemplate, error: userError } = await supabase
				.from('project_brief_templates')
				.select('*')
				.eq('user_id', userId)
				.eq('project_id', projectId)
				.eq('in_use', true)
				.single();
			if (userError && userError?.details !== 'The result contains 0 rows') {
				console.error('Error fetching user project template:', userError);
				return null;
			}
			if (userTemplate) {
				return userTemplate;
			}

			if (!project?.tasks?.length) {
				const { data: smallTemplate, error: defaultError } = await supabase
					.from('project_brief_templates')
					.select('*')
					.eq('name', 'small_brief')
					.single();
				if (defaultError) {
					console.error('Error fetching default project template:', defaultError);
					return null;
				}
				return smallTemplate;
			}

			if (project?.tasks?.length < 7) {
				const { data: mediumTemplate, error: defaultError } = await supabase
					.from('project_brief_templates')
					.select('*')
					.is('user_id', null)
					.eq('name', 'medium_brief')
					.eq('is_default', true)
					.single();
				if (defaultError) {
					console.error('Error fetching default project template:', defaultError);
					return null;
				}
				return mediumTemplate;
			}
			if (project?.tasks?.length >= 7) {
				const { data: largeTemplate, error: defaultError } = await supabase
					.from('project_brief_templates')
					.select('*')
					.is('user_id', null)
					.eq('name', 'large_brief')
					.eq('is_default', true)
					.single();
				if (defaultError) {
					console.error('Error fetching default project template:', defaultError);
					return null;
				}
				return largeTemplate;
			}

			// If no user template, fall back to system default
			const { data: defaultTemplate, error: defaultError } = await this.supabase
				.from('project_brief_templates')
				.select('*')
				.is('user_id', null)
				.eq('is_default', true)
				.single();
			if (defaultError) {
				console.error('Error fetching default project template:', defaultError);
				return null;
			}
			return defaultTemplate;
		} catch (error) {
			console.error('Error getting user project template:', error);
			return null;
		}
	}

	/**
	 * Replace template variables with actual values
	 */
	substituteTemplateVariables(template: string, variables: Record<string, string>): string {
		let result = template;

		// Replace all {{variable_name}} patterns with actual values
		for (const [key, value] of Object.entries(variables)) {
			const pattern = new RegExp(`{{${key}}}`, 'g');
			result = result.replace(pattern, value || '');
		}

		return result;
	}

	// ==========================================
	// OPTIMIZED PROMPTS FOR PERFORMANCE
	// ==========================================
	/**
	 * Optimized prompt for new project brain dumps (45% smaller, preserves quality)
	 */
	getOptimizedNewProjectPrompt(): string {
		const today = new Date().toISOString().split('T')[0];

		return `You are a BuildOS synthesis engine. Convert brain dumps into structured CRUD operations.


**OBJECTIVE**: Transform unstructured thoughts → CREATE PROJECT with comprehensive context and detailed tasks

**CRITICAL TASK CREATION RULES**:
- ONLY create tasks that are EXPLICITLY mentioned in the braindump
- DO NOT proactively add preparatory, setup, or follow-up tasks
- DO NOT add "missing" tasks or fill gaps unless the user specifically instructs you to
- If the user says "create setup tasks for X" or "add follow-up tasks", then create them
- Otherwise, extract ONLY what is directly stated in the braindump

${getDecisionMatrixUpdateCriteria()}

${DataModelsComponent.getProjectModel()}

${DataModelsComponent.getTaskModel()}

${generateRecurringTaskRules()}

${generateProjectContextFramework()}

${generateFrameworkAdaptationExamples()}

**Output Format**:
${generateOperationIdInstructions()}

Current date: ${today}

Respond with valid JSON matching the output structure.`;
	}

	/**
	 * Optimized prompt for existing project updates (50% smaller, preserves quality)
	 */
	getOptimizedExistingProjectPrompt(projectId: string, projectStartDate?: string): string {
		const today = new Date().toISOString().split('T')[0];

		return `You are a BuildOS synthesis engine for EXISTING project ${projectId}.


**OBJECTIVE**: Process braindump → UPDATE existing project/tasks OR CREATE new items

**CRITICAL TASK CREATION RULES**:
- ONLY create tasks that are EXPLICITLY mentioned in the braindump
- DO NOT proactively add preparatory, setup, or follow-up tasks
- DO NOT add "missing" tasks unless user specifically instructs you to

${getDecisionMatrixUpdateCriteria()}

**Update Operations**:
- UPDATE tasks when braindump references existing work
- UPDATE project context with new strategic information
- CREATE new tasks only for explicitly mentioned items
- CREATE notes for non-actionable information

${DataModelsComponent.getTaskUpdateModel()}

${DataModelsComponent.getTaskCreateModel(projectId)}

${DataModelsComponent.getProjectUpdateModel(projectId)}

${generateRecurringTaskRules()}

**Output Format**:
${generateOperationIdInstructions()}

Project timeline context: ${projectStartDate ? `Started ${projectStartDate}` : 'No start date'}
Current date: ${today}

Respond with valid JSON matching the output structure.`;
	}

	/**
	 * Build the user prompt for phase generation - CORRECTED
	 */
	/**
	 * Enhanced Phase Generation Data Prompt
	 * Focuses on intelligent context building rather than constraint repetition
	 */
	buildPhaseGenerationDataPrompt(
		project: Project,
		tasks: Partial<Task>[],
		schedulingMethod: string = 'schedule_in_phases',
		includeRecurring: boolean = false,
		allowReschedule: boolean = false,
		preserveExistingDates: boolean = false,
		userInstructions?: string,
		preservedPhases?: any[]
	): string {
		const today = new Date().toISOString().split('T')[0] as string;

		// Project timeline analysis
		const projectInfo = this.buildProjectContext(project, today, preservedPhases);
		const taskAnalysis = this.buildTaskAnalysis(
			tasks,
			today,
			schedulingMethod,
			includeRecurring,
			preserveExistingDates
		);
		const contextualInsights = this.buildContextualInsights(project, tasks as Task[]);
		const schedulingInstructions = this.buildSchedulingInstructions(
			schedulingMethod,
			preserveExistingDates
		);
		const recurringTaskInstructions = includeRecurring
			? this.buildRecurringTaskInstructions(tasks, allowReschedule)
			: '';

		// Add user instructions if provided
		const userGuidance = userInstructions
			? `
**USER-PROVIDED GUIDANCE FOR PHASE SCHEDULING:**
${userInstructions}

IMPORTANT: The above user instructions should be given high priority when organizing phases and scheduling tasks. They represent specific requirements and preferences for this project.
`
			: '';

		return `${projectInfo}

${taskAnalysis}

${contextualInsights}

${schedulingInstructions}

${recurringTaskInstructions}${userGuidance}

**PHASE GENERATION OBJECTIVE:**
Create intelligent phases that reflect natural project workflow and task clustering based on the selected scheduling method: ${schedulingMethod}.

**KEY CONSIDERATIONS:**
- ASSIGN ALL TASKS: Every single task in the input must be assigned to a phase - no exceptions
- Group related tasks into coherent phases based on workflow, dependencies, and logical sequence
- Consider task effort and complexity when distributing workload across phases
- Use project context and task details to inform phase strategy and timing
- Balance high-priority tasks across phases while respecting logical dependencies
- Ensure phases tell a meaningful story of project progression
- Follow the specific scheduling method requirements outlined above

Current date: ${today} (all scheduling must respect this baseline)`;
	}

	/**
	 * Build scheduling method specific instructions
	 */
	private buildSchedulingInstructions(
		schedulingMethod: string,
		preserveExistingDates: boolean = false
	): string {
		let baseInstructions = '';

		switch (schedulingMethod) {
			case 'phases_only':
				baseInstructions = `**SCHEDULING METHOD: PHASES ONLY**
- Tasks will be organized into phases WITHOUT specific start dates
- Do NOT generate suggested_start_date values in task assignments
- Focus on logical grouping and phase progression rather than timing
- Tasks will be moved to phases but retain their flexible scheduling
- Phase dates still need to be created to provide structure and sequence`;
				break;

			case 'schedule_in_phases':
				baseInstructions = `**SCHEDULING METHOD: SCHEDULE IN PHASES**
- Tasks will be assigned to phases AND scheduled within phase durations
- Generate appropriate suggested_start_date for each task assignment
- IMPORTANT: Generate full ISO 8601 timestamps with time components (e.g., "2024-03-15T09:00:00Z")
- Schedule tasks during working hours (9am-5pm local time by default)
- Do NOT use midnight (00:00:00) or late evening times
- Distribute tasks logically throughout each phase duration
- Consider task priority and complexity for scheduling sequence
- High-priority tasks should generally be scheduled earlier in phases
- Complex tasks may need more lead time and should be positioned accordingly
- Leave reasonable gaps between tasks to account for dependencies and buffer time
- Example format: "2024-03-15T10:30:00Z" (10:30 AM on March 15, 2024)`;
				break;

			case 'calendar_optimized':
				baseInstructions = `**SCHEDULING METHOD: CALENDAR OPTIMIZED**
- Tasks will be assigned to phases with initial suggested_start_date values
- These dates will be optimized later based on calendar availability
- Focus on logical phase assignment and rough timing estimates
- Suggested dates should respect phase boundaries but will be refined
- Consider that tasks might be moved slightly within phases during calendar optimization
- Prioritize phase assignment accuracy over precise scheduling`;
				break;

			default:
				baseInstructions = `**SCHEDULING METHOD: DEFAULT (SCHEDULE IN PHASES)**
- Tasks will be assigned to phases and scheduled within phase durations
- Generate appropriate suggested_start_date for each task assignment`;
				break;
		}

		// Add preserve dates instructions if applicable
		if (preserveExistingDates && schedulingMethod !== 'phases_only') {
			baseInstructions += `

**PRESERVE EXISTING DATES MODE:**
- For tasks that ALREADY have start_date values, you MUST preserve those dates
- Only assign the task to the phase that contains its existing date
- Do NOT change suggested_start_date for tasks with existing dates - use their current start_date
- Only generate new suggested_start_date values for tasks WITHOUT existing dates
- This ensures existing schedule commitments are maintained`;
		} else if (!preserveExistingDates && schedulingMethod !== 'phases_only') {
			baseInstructions += `

**RESCHEDULE ALL TASKS MODE:**
- You should reschedule ALL non-recurring tasks for optimal project flow
- Generate new suggested_start_date values for all tasks based on phase timing
- Ignore existing start_date values (except for recurring tasks)
- This allows for complete schedule optimization`;
		}

		return baseInstructions;
	}

	/**
	 * Build intelligent task analysis with scheduling method awareness
	 */
	private buildTaskAnalysis(
		tasks: Partial<Task>[],
		today: string,
		schedulingMethod: string,
		includeRecurring: boolean = false,
		preserveExistingDates: boolean = false
	): string {
		const tasksByCategory = this.categorizeTasksForPhasing(tasks, today);

		// Separate recurring and one-off tasks if including recurring
		const oneOffTasks = includeRecurring
			? tasks.filter((t) => t.task_type !== 'recurring')
			: tasks;
		const recurringTasks = includeRecurring
			? tasks.filter((t) => t.task_type === 'recurring')
			: [];

		let analysis = `**TASK LANDSCAPE (${tasks.length} total tasks${includeRecurring && recurringTasks.length > 0 ? `, ${recurringTasks.length} recurring` : ''}) - ${schedulingMethod.toUpperCase()} METHOD:**\n`;

		// Show date information differently based on scheduling method
		const showDates = schedulingMethod !== 'phases_only';

		// Scheduled tasks (with dates) - only relevant for scheduling methods
		if (tasksByCategory.scheduled.length > 0 && showDates) {
			if (preserveExistingDates) {
				analysis += `\nScheduled Tasks (${tasksByCategory.scheduled.length}) - PRESERVE THESE DATES:\n`;
			} else {
				analysis += `\nScheduled Tasks (${tasksByCategory.scheduled.length}) - will be rescheduled:\n`;
			}
			tasksByCategory.scheduled.forEach((task) => {
				const dateNote = task.start_date === today ? ' [TODAY]' : '';
				const urgencyFlag = task.priority === 'high' ? ' 🔴' : '';
				const statusFlag = task.status === 'in_progress' ? ' ▶️' : '';
				const preserveNote = preserveExistingDates ? ' [PRESERVE DATE]' : '';
				analysis += `  • [${task.id}] ${task.title} → ${task.start_date}${dateNote}${urgencyFlag}${statusFlag}${preserveNote}\n`;
			});
		} else if (tasksByCategory.scheduled.length > 0 && !showDates) {
			analysis += `\nPreviously Scheduled Tasks (${tasksByCategory.scheduled.length}) - dates will be removed:\n`;
			tasksByCategory.scheduled.forEach((task) => {
				const urgencyFlag = task.priority === 'high' ? ' 🔴' : '';
				const statusFlag = task.status === 'in_progress' ? ' ▶️' : '';
				analysis += `  • [${task.id}] ${task.title}${urgencyFlag}${statusFlag}\n`;
			});
		}

		// Active work (in-progress or high priority)
		if (tasksByCategory.activeWork.length > 0) {
			analysis += `\nActive Work (${tasksByCategory.activeWork.length}) - Should be prioritized in early phases:\n`;
			tasksByCategory.activeWork.forEach((task) => {
				const flags = [];
				if (task.status === 'in_progress') flags.push('▶️IN-PROGRESS');
				if (task.priority === 'high') flags.push('🔴HIGH-PRIORITY');
				if (task.status === 'blocked') flags.push('🚫BLOCKED');
				analysis += `  • [${task.id}] ${task.title} ${flags.join(' ')}\n`;
			});
		}

		// Flexible tasks grouped by type/complexity
		if (tasksByCategory.flexible.length > 0) {
			const flexibleLabel = showDates ? 'Flexible Tasks' : 'Unscheduled Tasks';
			analysis += `\n${flexibleLabel} (${tasksByCategory.flexible.length}) - Can be strategically organized:\n`;
			const byType = this.groupTasksByType(tasksByCategory.flexible);
			Object.entries(byType).forEach(([type, typeTasks]) => {
				analysis += `  ${type} (${typeTasks.length}): ${typeTasks.map((t) => `[${t.id}] ${t.title}`).join(', ')}\n`;
			});
		}

		// Add scheduling method specific guidance
		if (schedulingMethod === 'phases_only') {
			analysis += `\n**PHASES ONLY GUIDANCE:**
- Focus on logical grouping rather than specific timing
- Ensure each phase has a clear purpose and deliverables
- Consider task dependencies for phase ordering
- Balance workload across phases`;
		} else if (schedulingMethod === 'schedule_in_phases') {
			analysis += `\n**SCHEDULING GUIDANCE:**
- Distribute tasks throughout phase durations intelligently
- Use priority and complexity to determine task sequence within phases
- Leave buffer time between complex tasks
- Consider dependencies when scheduling within phases`;
		} else if (schedulingMethod === 'calendar_optimized') {
			analysis += `\n**CALENDAR OPTIMIZATION GUIDANCE:**
- Provide initial scheduling that respects phase boundaries
- Focus on accurate phase assignment - dates will be optimized later
- Consider task duration and complexity for realistic initial timing`;
		}

		return analysis;
	}

	/**
	 * Build focused project context
	 */
	private buildProjectContext(project: Project, today: string, preservedPhases?: any[]): string {
		const timelineInfo = this.calculateProjectTimeline(project, today, preservedPhases);

		const preservedPhasesInfo =
			preservedPhases && preservedPhases.length > 0
				? `

**PRESERVED HISTORICAL PHASES:**
The following phases have been completed or are in progress and will be preserved:
${preservedPhases.map((p, i) => `- Phase ${p.order}: ${p.name} (${p.start_date.split('T')[0]} to ${p.end_date.split('T')[0]})`).join('\n')}

Note: You are generating NEW phases that should pick up immediately from ${today.split('T')[0]} onward.`
				: '';

		return `**PROJECT OVERVIEW:**
Name: ${project.name}
${project.description ? `Description: ${project.description.substring(0, 300)}` : ''}
Status: ${project.status || 'active'}

${timelineInfo}${preservedPhasesInfo}

**PROJECT CONTEXT:**
${project.executive_summary ? `Vision: ${project.executive_summary}` : ''}
${project.context ? `Background: ${project.context.substring(0, 400)}` : ''}`;
	}

	/**
	 * Calculate and format project timeline intelligently
	 */
	private calculateProjectTimeline(
		project: Project,
		today: string,
		preservedPhases?: any[]
	): string {
		const projectStart = project.start_date ? new Date(project.start_date) : null;
		const projectEnd = project.end_date ? new Date(project.end_date) : null;
		const todayDate = new Date(today);

		if (!projectStart && !projectEnd) {
			return `**TIMELINE:** Open-ended project (use task dates and complexity to determine appropriate phase duration)`;
		}

		if (projectStart && projectEnd) {
			const effectiveStart = projectStart > todayDate ? projectStart : todayDate;
			const remainingDays = Math.ceil(
				(projectEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)
			);
			const remainingWeeks = Math.ceil(remainingDays / 7);

			return `**TIMELINE:** ${effectiveStart.toISOString().split('T')[0]} to ${project.end_date} (${remainingDays} days, ~${remainingWeeks} weeks remaining)

**PHASE BOUNDARY REQUIREMENTS:**
- All phases MUST fall within the project timeline (${projectStart.toISOString().split('T')[0]} to ${project.end_date})
- Phases that would extend beyond project end will be auto-adjusted
- Phases may overlap if it serves the workflow
- Each task MUST be scheduled within its assigned phase's date range`;
		}

		if (projectStart) {
			const effectiveStart = projectStart > todayDate ? projectStart : todayDate;
			return `**TIMELINE:** Starting ${effectiveStart.toISOString().split('T')[0]} (no end date specified)

**PHASE DURATION GUIDANCE (NO END DATE):**
Since no project end date is provided, determine reasonable phase durations based on:
1. Task complexity and estimated effort (simple tasks: days, complex tasks: weeks)
2. Number of tasks per phase (3-5 tasks: 1-2 weeks, 6-10 tasks: 2-3 weeks, 10+ tasks: 3-4 weeks)
3. Dependencies and logical sequencing
4. Industry standards for similar project types
5. Allow buffer time between phases for review and adjustments

Suggested phase duration guidelines:
- Quick wins/setup phase: 1-2 weeks
- Core implementation phases: 2-4 weeks each
- Integration/testing phases: 2-3 weeks
- Deployment/finalization: 1-2 weeks

**PHASE BOUNDARY NOTES:**
- Phases should start at or after the project start date
- Phases may overlap if logical for the workflow
- Tasks MUST be scheduled within their assigned phase dates
- Create a realistic timeline that allows proper time for quality execution`;
		}

		return `**TIMELINE:** Must complete by ${project.end_date} (use task clustering to determine optimal start timing)

**PHASE BOUNDARY REQUIREMENTS:**
- All phases MUST complete by the project end date
- Work backward from the deadline to ensure adequate time
- Phases may overlap if needed to meet timeline
- Tasks MUST fall within their assigned phase dates`;
	}

	/**
	 * Build recurring task instructions for data prompt
	 */
	private buildRecurringTaskInstructions(
		tasks: Partial<Task>[],
		allowReschedule: boolean
	): string {
		const recurringTasks = tasks.filter((t) => t.task_type === 'recurring');
		if (recurringTasks.length === 0) return '';

		let instructions = `\n**RECURRING TASKS (${recurringTasks.length}):**\n`;
		instructions += `These tasks repeat throughout the project lifecycle:\n\n`;

		recurringTasks.forEach((task) => {
			instructions += `• [${task.id}] ${task.title}\n`;
			instructions += `  Pattern: ${task.recurrence_pattern || 'not specified'}\n`;
			instructions += `  Ends: ${task.recurrence_ends || 'project end'}\n`;
			if (task.duration_minutes) {
				instructions += `  Duration: ${task.duration_minutes} minutes\n`;
			}
			instructions += '\n';
		});

		if (allowReschedule) {
			instructions += `\n**RECURRING TASK RESCHEDULING:**\n`;
			instructions += `You MAY suggest rescheduling recurring tasks if it significantly improves project flow:\n`;
			instructions += `- Prefer adjusting start times over changing patterns\n`;
			instructions += `- Consider moving weekly meetings to phase boundaries\n`;
			instructions += `- Align review cycles with phase completions\n`;
			instructions += `- Provide clear reasoning for each suggested change\n\n`;
			instructions += `When suggesting a reschedule, add to your response:\n`;
			instructions += `"recurring_task_suggestions": {\n`;
			instructions += `  "<task_id>": {\n`;
			instructions += `    "action": "reschedule",\n`;
			instructions += `    "current_pattern": "weekly",\n`;
			instructions += `    "suggested_pattern": "weekly",\n`;
			instructions += `    "current_start_date": "2024-01-15",\n`;
			instructions += `    "suggested_start_date": "2024-01-22",\n`;
			instructions += `    "reason": "Align weekly review with Phase 2 start for better context"\n`;
			instructions += `  }\n`;
			instructions += `}\n`;
		} else {
			instructions += `\n**NOTE:** Do NOT reschedule recurring tasks - include them as-is in your planning.\n`;
		}

		return instructions;
	}

	/**
	 * Build recurring task system instructions
	 */
	private buildRecurringSystemInstructions(allowReschedule: boolean): string {
		let instructions = `\n**RECURRING TASK HANDLING:**\n`;
		instructions += `You are working with both one-off and recurring tasks.\n`;
		instructions += `Recurring tasks have patterns like: daily, weekdays, weekly, biweekly, monthly, quarterly, yearly.\n\n`;
		instructions += `Guidelines:\n`;
		instructions += `1. Recurring tasks represent ongoing project rhythms (meetings, reviews, reports)\n`;
		instructions += `2. Consider how these rhythms interact with phase transitions\n`;
		instructions += `3. Account for their time commitment in phase planning\n`;

		if (allowReschedule) {
			instructions += `4. You MAY suggest rescheduling recurring tasks for better project flow\n`;
			instructions += `5. Only suggest changes that provide clear value\n`;
			instructions += `6. Document all suggestions in the recurring_task_suggestions field\n`;
		} else {
			instructions += `4. You MUST NOT change recurring task schedules\n`;
			instructions += `5. Work around existing recurring commitments\n`;
		}

		return instructions;
	}

	/**
	 * Categorize tasks for intelligent phase planning
	 */
	private categorizeTasksForPhasing(tasks: Partial<Task>[], today: string) {
		const scheduled = tasks
			.filter((t) => t.start_date)
			.sort((a, b) => new Date(a.start_date!).getTime() - new Date(b.start_date!).getTime());

		const activeWork = tasks.filter(
			(t) =>
				!t.start_date &&
				(t.status === 'in_progress' || t.priority === 'high' || t.status === 'blocked')
		);

		const flexible = tasks.filter((t) => !t.start_date && !activeWork.includes(t));

		return { scheduled, activeWork, flexible };
	}

	/**
	 * Group tasks by type for better clustering
	 */
	private groupTasksByType(tasks: Partial<Task>[]) {
		const groups: Record<string, Partial<Task>[]> = {};

		tasks.forEach((task) => {
			const type = task.task_type || 'General';
			if (!groups[type]) groups[type] = [];
			groups[type].push(task);
		});

		return groups;
	}

	/**
	 * Build contextual insights from project context and task details
	 */
	private buildContextualInsights(project: Project, tasks: Task[]): string {
		if (!project.context || project.context.length === 0) {
			return `**STRATEGIC CONTEXT:** Use project description and task relationships to determine optimal phase flow.`;
		}

		const contextPreview = project.context.substring(0, 300);
		const tasksWithDetails = tasks.filter((t) => t.details).length;

		return `**STRATEGIC CONTEXT:**
Project context preview: "${contextPreview}${project.context.length > 300 ? '...' : ''}"
Tasks with detailed context: ${tasksWithDetails}/${tasks.length}

Consider the project context and task details when designing phase strategy and task groupings.`;
	}

	/**
	 * Enhanced Phase Generation System Prompt
	 * Focuses on intelligence and workflow logic rather than rigid constraints
	 */
	buildPhaseGenerationSystemPrompt(
		schedulingMethod: string = 'schedule_in_phases',
		includeRecurring: boolean = false,
		allowReschedule: boolean = false,
		preserveExistingDates: boolean = false,
		userInstructions?: string,
		preservedPhases?: any[]
	): string {
		const todayTime = new Date().toISOString();
		const todayDate = todayTime.split('T')[0];

		const basePrompt = `You are an expert project strategist and phase designer. Your goal is to create intelligent, executable project phases that reflect natural workflow progression and optimize task organization based on the specified scheduling method.`;

		const schedulingSpecificInstructions =
			this.getSchedulingSpecificInstructions(schedulingMethod);

		const recurringSystemInstructions = includeRecurring
			? this.buildRecurringSystemInstructions(allowReschedule)
			: '';

		const dateHandlingInstructions = this.buildDateHandlingInstructions(
			schedulingMethod,
			preserveExistingDates
		);

		// Include preserved phases context if provided
		const preservedPhasesSection =
			preservedPhases && preservedPhases.length > 0
				? `

**HISTORICAL PHASES CONTEXT:**
The following phases have been preserved from the previous generation and represent completed work:
${preservedPhases.map((p, i) => `${i + 1}. ${p.name} (Order ${p.order}): ${p.start_date.split('T')[0]} to ${p.end_date.split('T')[0]}`).join('\n')}

IMPORTANT: 
- You are generating NEW phases that will continue immediately after this preserved history
- Start your phase numbering from ${Math.max(...preservedPhases.map((p) => p.order)) + 1}
- New phases must begin no earlier than ${todayDate} (use ${todayTime} if you need an exact timestamp)
- Consider the work already completed in preserved phases when planning new phases
- Completed tasks have been moved to historical phases, focus on incomplete work`
				: '';

		// Include user instructions if provided
		const userInstructionSection = userInstructions
			? `

**USER-PROVIDED REQUIREMENTS:**
The user has provided specific guidance for phase generation that MUST be followed:
${userInstructions}

These instructions take precedence over general guidelines where they provide specific direction.`
			: '';

		return `${basePrompt}${userInstructionSection}${preservedPhasesSection}

**SCHEDULING METHOD: ${schedulingMethod.toUpperCase()}**
${schedulingSpecificInstructions}

**CORE ORGANIZATION PRINCIPLES:**

1. Logical Sequencing
2. Logical Grouping
3. Logical Prioritizing

**CORE PRINCIPLES IN ACTION:**

1. **Natural Workflow Clustering** - Group tasks that logically work together or build upon each other
2. **Intelligent Timeline Design** - Create phases that balance workload and respect critical dependencies
3. **Context-Driven Strategy** - Use project insights and context to inform phase approach
4. **Flexible Organization** - Optimize task arrangement based on priority, effort, and logical sequence

**BASELINE CONSTRAINTS:**
- Current date time: ${todayTime} (nothing can be scheduled before this date time)
- Phases MUST fall within project boundaries (start_date to end_date if provided)
- Phases may overlap if it makes logical sense for the workflow
- Tasks MUST be scheduled within their assigned phase's date range
- If a phase date would fall outside project boundaries, adjust it to fit within
- Tasks with specific dates must be accommodated appropriately based on scheduling method
${dateHandlingInstructions}
${recurringSystemInstructions}

**PHASE DESIGN STRATEGY:**

*Phase Count*: Determine optimal number based on:
- Project complexity and scope (simple projects: 2-4 phases, complex: 5-10+ phases)
- Natural workflow breakpoints and task clustering opportunities
- Timeline constraints and milestone spacing

*Phase Content*: Each phase should:
- Represent a meaningful stage of project progression
- Group 3-15 related tasks (avoid single-task phases)
- Have clear deliverables and purpose
- Balance workload and skill requirements

*Task Distribution*: Consider:
- **CRITICAL REQUIREMENT**: ALL PROVIDED TASKS MUST BE ASSIGNED TO PHASES - no tasks should remain unassigned or in backlog
- **Fixed dates**: Handle according to scheduling method requirements
- **Active work**: Prioritize in-progress and high-priority tasks in early phases
- **Dependencies**: Ensure prerequisite tasks come before dependent ones
- **Effort balance**: Distribute heavy/complex tasks across phases
- **Skill clustering**: Group tasks requiring similar expertise when logical

**INTELLIGENT ORGANIZATION:**

*Priority Logic*:
1. In-progress tasks → prioritize in early phases
2. High-priority tasks → place in appropriate early phases
3. Regular tasks → distribute based on logical flow and capacity
4. Dependencies → ensure proper sequencing

*Timeline Strategy*:
- For projects with end dates: work backward from deadline, ensuring adequate time
- For open-ended projects: use task complexity and dependencies to estimate reasonable phase durations
- Consider project context and task details for timing insights

**OUTPUT REQUIREMENTS:**

Generate phases with:
- **name**: Clear, action-oriented (e.g., "Foundation & Planning", "Core Development", "Integration & Testing")
- **description**: One sentence capturing phase purpose and key outcomes
- **start_date/end_date**: ISO 8601 format with time (e.g., "2024-03-15T09:00:00Z" for 9 AM)
  - Phases MUST fall within project boundaries (will be auto-adjusted if not)
  - Phases may overlap if it serves the project workflow
  - Ensure dates are realistic and achievable
- **order**: Sequential numbering (continuing from preserved phases if any)

IMPORTANT: The task_assignments object MUST include an entry for EVERY task provided in the input. No tasks should be left unassigned. Each task ID from the input MUST appear in task_assignments.

For each task assignment provide:
- **phase_order**: Which phase number this task belongs to (REQUIRED for ALL tasks)
${
	schedulingMethod === 'phases_only'
		? '- **suggested_start_date**: null (do not provide start dates)'
		: `- **suggested_start_date**: Optimal start datetime within the assigned phase in ISO 8601 format with time (e.g., "2024-03-15T14:30:00Z" for 2:30 PM). Schedule during working hours (9am-5pm). MUST fall within the phase's start_date and end_date. Must be ≥ ` +
			todayTime
}
- **reason**: Brief explanation of the assignment logic

**JSON OUTPUT FORMAT:**
\`\`\`json
{
  "phases": [
    {
      "name": "Phase Name",
      "description": "Clear description of phase purpose and deliverables",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "order": 1
    }
  ],
  "task_assignments": {
    "task-id": {
      "phase_order": 1,
      ${
			schedulingMethod === 'phases_only'
				? '"suggested_start_date": null,'
				: '"suggested_start_date": "YYYY-MM-DD",'
		}
      "reason": "Strategic rationale for this assignment and ${schedulingMethod === 'phases_only' ? 'grouping' : 'timing'}"
    }
  },
  "recurring_tasks": [],
  "backlog_tasks": [], // MUST be empty - all tasks must be assigned to phases
  "summary": "Brief description of the phase strategy and key ${schedulingMethod === 'phases_only' ? 'organization' : 'scheduling'} decisions"
}
\`\`\`

Focus on creating a cohesive project execution plan that tells a clear story of progression from start to completion, optimized for the ${schedulingMethod} method.`;
	}

	/**
	 * Build date handling instructions based on preserve dates setting
	 */
	private buildDateHandlingInstructions(
		schedulingMethod: string,
		preserveExistingDates: boolean
	): string {
		if (schedulingMethod === 'phases_only') {
			return ''; // No date handling needed for phases_only
		}

		if (preserveExistingDates) {
			return `
**DATE PRESERVATION REQUIREMENTS:**
- Tasks with existing start_date values MUST keep those dates
- When a task has a start_date, assign it to the phase that contains that date
- If a task's date doesn't fit any phase perfectly, assign to the closest appropriate phase
- Use the existing start_date as the suggested_start_date (do not change it)
- Only create new suggested_start_date values for tasks without existing dates
- Task dates will be validated to ensure they fall within their assigned phase (auto-adjusted if needed)
- This ensures all existing commitments and schedules are maintained`;
		} else {
			return `
**DATE RESCHEDULING REQUIREMENTS:**
- You should reschedule ALL non-recurring tasks for optimal flow
- Generate fresh suggested_start_date values for all tasks based on phase timing
- Ignore existing start_date values when determining optimal scheduling
- Exception: Recurring tasks maintain their patterns (handled separately)
- This allows for complete optimization of the project timeline`;
		}
	}

	/**
	 * Get scheduling method specific instructions for the system prompt
	 */
	private getSchedulingSpecificInstructions(schedulingMethod: string): string {
		switch (schedulingMethod) {
			case 'phases_only':
				return `**PHASES ONLY METHOD:**
- Organize tasks into logical phases WITHOUT assigning specific start dates
- Set suggested_start_date to null for all task assignments
- Focus on grouping related tasks and establishing phase sequence
- Phases should still have start_date and end_date for structure
- Emphasize logical workflow progression over temporal scheduling
- Consider task complexity and dependencies for phase assignment
- Each phase should represent a meaningful work stage
- If no project end date is provided, set reasonable phase durations based on task scope`;

			case 'schedule_in_phases':
				return `**SCHEDULE IN PHASES METHOD:**
- Assign tasks to phases AND provide specific suggested_start_date values
- Distribute tasks intelligently throughout each phase duration
- Consider task priority, complexity, and dependencies for scheduling
- High-priority and in-progress tasks should start early in appropriate phases
- Leave reasonable gaps between tasks for dependencies and buffer time
- Use smart spacing based on task effort and complexity
- Ensure suggested dates fall within phase boundaries
- If no project end date is provided, create phases with reasonable durations based on:
  * Task complexity (simple: days, medium: 1-2 weeks, complex: 2-4 weeks)
  * Number of tasks per phase (more tasks = longer phase)
  * Dependencies and logical workflow
  * Industry-standard timelines for similar work`;

			case 'calendar_optimized':
				return `**CALENDAR OPTIMIZED METHOD:**
- Assign tasks to phases with initial suggested_start_date values
- These dates will be refined later based on calendar availability
- Focus on accurate phase assignment over precise scheduling
- Suggested dates should respect phase boundaries but may be adjusted
- Consider that tasks might shift within phases during calendar optimization
- Provide reasonable initial timing that can be optimized later
- Prioritize logical phase grouping
- If no project end date, estimate phase durations based on task analysis`;

			default:
				return `**DEFAULT SCHEDULING METHOD:**
- Assign tasks to phases with appropriate suggested_start_date values
- Balance timing considerations with logical task grouping`;
		}
	}

	/**
	 * Optimized phase generation prompt (50% smaller)
	 */
	getOptimizedPhaseGenerationPrompt(schedulingMethod: string = 'schedule_in_phases'): string {
		const methodInstructions: Record<string, string> = {
			phases_only: 'Organize tasks into phases WITHOUT start dates (set null)',
			schedule_in_phases: 'Assign tasks to phases WITH suggested_start_date',
			calendar_optimized: 'Initial scheduling - will be optimized later'
		};

		return `Create intelligent project phases. Method: ${schedulingMethod}

**Instructions**: ${methodInstructions[schedulingMethod] || methodInstructions['schedule_in_phases']}

**Phase Design**:
- Count: 2-4 for simple, 5-10 for complex projects
- Each phase: 3-15 tasks, clear purpose, balanced workload
- Respect fixed dates, prioritize active work

**Output**:

\`\`\`json
{
  "phases": [{
    "name": "Action-oriented name",
    "description": "Purpose and deliverables",
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD",
    "order": 1
  }],
  "task_assignments": {
    "task-id": {
      "phase_order": 1,
      "suggested_start_date": ${schedulingMethod === 'phases_only' ? 'null' : '"YYYY-MM-DD"'},
      "reason": "Assignment logic"
    }
  },
  "recurring_tasks": [],
  "backlog_tasks": [],
  "summary": "Phase strategy overview"
}
\`\`\`

Group by workflow, dependencies, and priority. Balance effort across phases.`;
	}

	/**
	 * Optimized daily brief template (40% smaller)
	 */
	getOptimizedDailyBriefTemplate(): string {
		return `Synthesize daily brief from project briefs.

# Project Briefs:
{{project_briefs}}

# User Context:
{{user_context}}

Create brief with:
- Links: [Project Name](/projects/project-slug)
- Focus on actionable items
- Highlight conflicts/dependencies

## 🌅 {{brief_date}}

### Executive Summary
2-3 sentences on momentum and focus.

### 🎯 Top Priorities
1. **Priority 1**: [Task with outcome]
2. **Priority 2**: [Task with deliverable]
3. **Priority 3**: [Task with estimate]

### Project Status
**Attention**: Blocked items
**Do First**: Critical path
**Strategic**: Goal alignment

### 🚧 Blockers & Solutions
Obstacles and resolution steps.

### 💡 Strategic Insights
Patterns and optimization opportunities.`;
	}

	/**
	 * Get the main daily brief synthesis template - CORRECTED
	 */
	getMainDailyBriefTemplate(): string {
		return `You are synthesizing a comprehensive daily brief from individual project briefs.

# Project Briefs:
{{project_briefs}}

# User Context (if provided):
{{user_context}}

**Requirements:**
- Include markdown links for all projects: [Project Name](/projects/project-slug)
- Focus on actionable items and strategic insights
- Highlight resource conflicts and dependencies
- End with 3 specific actions for maximum impact

Create a unified daily brief following this structure:

# Template for Daily Brief

## 🌅 {{brief_date}}

### Executive Summary
A 2-3 sentence overview of your current momentum and day's focus.

### 🎯 Top Priorities Today
- **Priority 1**: [Most important task/focus area with specific outcome]
- **Priority 2**: [Second most important with clear deliverable]
- **Priority 3**: [Third priority with time estimate]

### Project Status
[Organized by priority with links]
**Attention Needed:** What requires focus or is blocked
**Do First:** Critical path items that unlock other work
**Strategic Alignment:** How today's work connects to bigger goals

### Strategic Insights
[Patterns, conflicts, or optimization opportunities]

### 🚧 Blockers & Solutions
Current obstacles and specific steps to resolve them.

### 💡 Strategic Insights
Patterns, opportunities, or adjustments to optimize your systems and progress.

IMPORTANT: When discussing projects in any section, include the markdown link to view that project using the format provided in the project links. For example: [View Marketing Campaign project](/projects/marketing-campaign)

Keep the brief actionable, specific, and highlight the most important parts. Focus on clarity and forward momentum.
`;
	}

	/**
	 * Increment usage count for a template (for analytics)
	 */
	async incrementTemplateUsage(templateId: string): Promise<void> {
		try {
			// Simple increment without checking result
			await this.supabase
				.from('project_brief_templates')
				.update({
					updated_at: new Date().toISOString()
				})
				.eq('id', templateId);

			// Note: Could add usage tracking to a separate table if needed
		} catch (error) {
			// Don't throw - usage tracking shouldn't break the main flow
			console.warn('Could not increment template usage:', error);
		}
	}

	getTaskExtractionPrompt(
		projectId?: string,
		existingTasks?: Task[],
		displayedQuestions?: DisplayedBrainDumpQuestion[],
		isNewProject?: boolean
	): string {
		// Route to appropriate method based on project type
		if (isNewProject || !projectId) {
			return this.getNewProjectTaskExtractionPrompt(displayedQuestions);
		} else {
			return this.getExistingProjectTaskExtractionPrompt(
				projectId,
				existingTasks,
				displayedQuestions
			);
		}
	}

	private getNewProjectTaskExtractionPrompt(
		displayedQuestions?: DisplayedBrainDumpQuestion[]
	): string {
		// Add question analysis section if questions were displayed
		let questionSection = '';
		if (displayedQuestions && displayedQuestions.length > 0) {
			const questionsText = displayedQuestions
				.map((q) => `- Question ${q.id}: "${q.question}"`)
				.join('\n');

			questionSection = `\n\n## Questions to Analyze:\n${questionsText}\n\nDetermine if each question was addressed in the braindump. Include in your response:\n"questionAnalysis": {\n  "[questionId]": {\n    "wasAnswered": boolean,\n    "answerContent": "extracted answer if addressed, null otherwise"\n  }\n}\n`;
		}

		return `A user just brain dumped information about a project and you are a task extraction engine.

## Your Job:
Create all tasks that are specified in the braindump but DO NOT proactively create preparatory, setup, or follow-up tasks unless the user explicitly instructs you to in the brain dump (e.g., "create setup tasks for X", "add follow-up tasks")

## Task Creation Model:

${DataModelsComponent.getTaskCreateModel()}

## Guidelines:
- ONLY create tasks that are explicitly mentioned in the brain dump
- Some braindumps can have 0-2 tasks and other braindumps can have 20+ tasks, create data for all tasks
- DO NOT proactively add preparatory, setup, or follow-up tasks
- If unsure whether to update or create, prefer creating a new task
- Nothing from the brain dump should be lost - if it's not a task title/description, it goes in details
- All tasks will use project_ref: "new-project-1" to link to the project being created

${generateRecurringTaskRules()}

Extract ALL actionable tasks that are EXPLICITLY mentioned in the brain dump. DO NOT add preparatory, setup, or follow-up tasks unless the user specifically requests them. Capture ALL details, context, research, ideas, and observations in the task details field. Nothing from the brain dump should be lost.${questionSection}

## Generate Project Questions:
${generateQuestionGenerationInstructions({ includeFormat: false })}

Include these questions in your response within the main JSON structure:

## Complete Response Format:
\`\`\`json
{
  "title": "Brief title for this extraction",
  "summary": "2-3 sentence summary of what was extracted",
  "insights": "Key insights from the braindump",
  "tags": ["relevant", "tags"],
  "metadata": {
    "processingNote": "Any notes about how the braindump was processed"
  },
  "operations": [
    {
      "id": "op-1234567890-task-create-1",
      "table": "tasks",
      "operation": "create",
      "data": {
        "title": "Task title from brain dump",
        "description": "Brief task summary",
        "details": "COMPREHENSIVE: All implementation details, research notes, ideas, observations, references, and any other context from the brain dump related to this task. Nothing should be lost.",
        "project_ref": "new-project-1",
        "priority": "medium",
        "status": "backlog",
        "task_type": "one_off"
      }
    }
  ],
  "questionAnalysis": {
    // Only if questions were displayed before braindump
    "[questionId]": {
      "wasAnswered": boolean,
      "answerContent": "extracted answer or null"
    }
  },
  "projectQuestions": [
    {
      "question": "Specific, actionable question text",
      "category": "clarification|decision|planning|risk|resource",
      "priority": "high|medium|low",
      "context": "Why this question matters now",
      "expectedOutcome": "What information or decision this should produce"
    }
  ]
}
\`\`\`

Respond with valid JSON matching the complete structure above.`;
	}

	private getExistingProjectTaskExtractionPrompt(
		projectId: string,
		existingTasks?: Task[],
		displayedQuestions?: DisplayedBrainDumpQuestion[]
	): string {
		const existingTasksSection = existingTasks
			? DataFormatterService.formatExistingTasksForPrompt(existingTasks)
			: 'No existing tasks';

		// Add question analysis section if questions were displayed
		let questionSection = '';
		if (displayedQuestions && displayedQuestions.length > 0) {
			const questionsText = displayedQuestions
				.map((q) => `- Question ${q.id}: "${q.question}"`)
				.join('\n');

			questionSection = `\n\n## Questions to Analyze:\n${questionsText}\n\nDetermine if each question was addressed in the braindump. Include in your response:\n"questionAnalysis": {\n  "[questionId]": {\n    "wasAnswered": boolean,\n    "answerContent": "extracted answer if addressed, null otherwise"\n  }\n}\n`;
		}

		return `You are a BuildOS task extraction engine that can CREATE new tasks or UPDATE existing ones.

Mode: Extract/Update for EXISTING project ${projectId}

## Current Project Data:

${existingTasksSection}

## Your Job:
1. **IDENTIFY** if the brain dump refers to existing tasks/notes by their content or explicit references
2. **UPDATE** existing items when the brain dump clearly refers to them
3. **CREATE** new items ONLY for tasks explicitly mentioned in the brain dump
4. **RECOGNIZE** that not all brain dumps need project context - focus on extracting actionable items

**CRITICAL RULE**: Create all tasks that are specified in the braindump but DO NOT proactively create preparatory, setup, or follow-up tasks unless the user explicitly instructs you to in the brain dump (e.g., "create setup tasks for X", "add follow-up tasks")

## Decision Logic:

**UPDATE existing task when:**
- Brain dump explicitly mentions a task by ID (e.g., "task-123", "[task-123]")
- Brain dump clearly refers to an existing task by its title or description
- Content suggests modifications to existing work (e.g., "the API integration is now complete", "update the design task to high priority")

**CREATE new task when:**
- No clear reference to existing tasks
- New action item EXPLICITLY mentioned in the brain dump
- Distinct work item even if related to existing tasks
- User explicitly requests creation of specific task types (e.g., "add setup tasks", "create follow-up tasks")

## Task Operations:

${DataModelsComponent.getTaskUpdateModel()}

${DataModelsComponent.getTaskCreateModel(projectId)}

## Guidelines:
- ONLY create tasks that are explicitly mentioned in the brain dump
- Some braindumps can have 0-2 tasks and other braindumps can have 20+ tasks, create data for all tasks
- DO NOT proactively add preparatory, setup, or follow-up tasks
- If unsure whether to update or create, prefer creating a new task
- Use task IDs when explicitly mentioned (e.g., "task-abc-123" or "[task-abc-123]")
- For updates, only include fields that should change
- Preserve existing content unless explicitly being replaced
- When updating task status to "done", DO NOT automatically create follow-up tasks unless explicitly mentioned
- **CRITICAL**: The details field must capture ALL information from the brain dump related to each task:
  - Implementation specifics and technical details
  - Research notes and references
  - Ideas and observations
  - Context and background information
  - Any non-actionable information that provides context
- Nothing from the brain dump should be lost - if it's not a task title/description, it goes in details

${generateRecurringTaskRules()}

Extract ALL actionable tasks that are EXPLICITLY mentioned in the brain dump. DO NOT add preparatory, setup, or follow-up tasks unless the user specifically requests them. Capture ALL details, context, research, ideas, and observations in the task details field. Nothing from the brain dump should be lost.${questionSection}

## Generate Project Questions:
${generateQuestionGenerationInstructions({ includeFormat: false })}

Include these questions in your response within the main JSON structure:

## Complete Response Format:
\`\`\`json
{
  "title": "Brief title for this extraction",
  "summary": "2-3 sentence summary of what was extracted",
  "insights": "Key insights from the braindump",
  "tags": ["relevant", "tags"],
  "metadata": {
    "processingNote": "Any notes about how the braindump was processed"
  },
  "operations": [
    {
      "id": "op-1234567890-task-update-1",
      "table": "tasks",
      "operation": "update",
      "data": {
        "id": "task-123",
        "status": "in_progress",
        "details": "Added implementation details, research notes, observations from brain dump. Include all context..."
      }
    },
    {
      "id": "op-1234567890-task-create-1",
      "table": "tasks",
      "operation": "create",
      "data": {
        "title": "New task from brain dump",
        "description": "Brief task summary",
        "details": "COMPREHENSIVE: All implementation details, research notes, ideas, observations, references, and any other context from the brain dump related to this task. Nothing should be lost.",
        "project_id": "${projectId}",
        "priority": "medium",
        "status": "backlog",
        "task_type": "one_off"
      }
    }
  ],
  "questionAnalysis": {
    // Only if questions were displayed before braindump
    "[questionId]": {
      "wasAnswered": boolean,
      "answerContent": "extracted answer or null"
    }
  },
  "projectQuestions": [
    {
      "question": "Specific, actionable question text",
      "category": "clarification|decision|planning|risk|resource",
      "priority": "high|medium|low",
      "context": "Why this question matters now",
      "expectedOutcome": "What information or decision this should produce"
    }
  ]
}
\`\`\`

Respond with valid JSON matching the complete structure above.`;
	}

	// Formatting methods have been moved to DataFormatterService
	// Use DataFormatterService.truncateContent() and DataFormatterService.formatExistingTasksForPrompt() directly

	getProjectContextPrompt(
		existingProject: ProjectWithRelations | null,
		userId: string,
		isNewProject?: boolean
	): string {
		// Determine if this is a new or existing project
		// If isNewProject is explicitly provided, use that; otherwise check existingProject
		const isNew = isNewProject !== undefined ? isNewProject : !existingProject;

		if (isNew) {
			return this.getNewProjectContextPrompt(userId);
		} else {
			return this.getExistingProjectContextPrompt(existingProject!, userId);
		}
	}

	private getNewProjectContextPrompt(userId: string): string {
		const today = new Date().toISOString().split('T')[0];

		return `A user just brain dumped information about a new project and you need to create a context document for the new projects.

Your Job is to analyze the brain dump and create a well-structured project with comprehensive context.

## Project Creation Decision:
${generateDecisionMatrix()}

## Date Parsing:
Convert natural language dates to YYYY-MM-DD format:
${generateDateParsing(today)}

## Context Generation Framework:
${generateProjectContextFramework('full')}

${generateFrameworkAdaptationExamples()}

## Project Context Guidelines:
1. Create rich markdown document that brings anyone up to speed
2. Use ## headers for major sections, ### for subsections
3. Capture ALL strategic information, research, ideas, and observations
4. Focus on the "why" and "what" - tasks will handle the "how"
5. Make it comprehensive enough that someone new can understand the project
6. DO NOT include task lists in the context - tasks are handled separately

## When to Create Context:
Create context when the brain dump contains:
- Strategic project information
- Research, ideas, or observations
- Background, goals, or approach details
- Any non-tactical information

## When NOT to Create Context:
Skip context (set to null) when brain dump is:
- ONLY a list of tasks to do
- Pure tactical execution items
- No strategic information or background

## Output JSON for Project WITH Context:
\`\`\`json
{
  "title": "Short title for brain dump",
  "summary": "2-3 sentence overview of what was extracted",
  "insights": "Key observations about the project",
  "tags": ["relevant", "tags"],
  "metadata": {
    "processingNote": "Explain project creation approach"
  },
  "operations": [
    {
      "id": "op-[timestamp]-project-create",
      "table": "projects",
      "operation": "create",
      "ref": "new-project-1",
      "data": {
        "name": "Clear, descriptive project name (max 150 chars)",
        "slug": "project-url-slug (REQUIRED - lowercase, hyphens only)",
        "description": "One-line project description",
        "context": "Rich markdown with all sections from framework above...",
        "executive_summary": "2-3 sentence executive summary",
        "tags": ["project", "tags"],
        "status": "active",
        "start_date": "${today}",
        "end_date": null
      }
    }
  ]
}
\`\`\`

## Output JSON for Task-Only Project (No Context):
\`\`\`json
{
  "title": "Task list or action items",
  "summary": "Collection of tasks extracted",
  "insights": "Tactical execution focus",
  "tags": ["tasks"],
  "metadata": {
    "processingNote": "Task-focused project without strategic context"
  },
  "operations": [
    {
      "id": "op-[timestamp]-project-create",
      "table": "projects",
      "operation": "create",
      "ref": "new-project-1",
      "data": {
        "name": "Project name derived from tasks",
        "slug": "project-slug",
        "description": "Task-focused project",
        "context": null,
        "executive_summary": null,
        "tags": ["tasks"],
        "status": "active",
        "start_date": "${today}",
        "end_date": null
      }
    }
  ]
}
\`\`\`

Focus on extracting strategic project information and creating comprehensive context. Tasks will be handled separately.`;
	}

	private getExistingProjectContextPrompt(
		existingProject: ProjectWithRelations,
		userId: string
	): string {
		const today = new Date().toISOString().split('T')[0];

		return `You are a BuildOS context synthesis engine specializing in project context enrichment.

Mode: UPDATE EXISTING PROJECT CONTEXT

Your Job is to update the project context document based on the user's brain dump. 
The project context document is a comprehensive markdown doc that brings anyone up to speed on the project.
DO NOT include task lists or specific task details - those are handled separately.

## Current Project Data:
${formatProjectData({
	user_id: userId,
	fullProjectWithRelations: existingProject,
	timestamp: new Date().toDateString()
})}

------

${getDecisionMatrixUpdateCriteria()}

## Update Rules:
1. **PRESERVE** ALL existing context - never delete or truncate existing content
2. **MERGE** new insights appropriately within existing structure
3. **ADD** timestamps for significant updates: **[${today}]** New info...
4. **MAINTAIN** existing markdown structure and formatting
5. **OUTPUT** the COMPLETE context document with all existing + new content
6. **FOCUS** on strategic information, not tactical task details

## When to Update Context:
Update context ONLY when the brain dump contains strategic project information that affects the dimensions in the decision matrix above.

## Update the Executive Summary:
Update the executive summary to describe the current state and direction of the project when there are significant changes.

## When NOT to Update Context:
- Brain dump is ONLY about specific tasks or bug fixes
- Simple status updates or progress reports
- Day-to-day tactical information
- Information that belongs in task details instead
- Pure task lists or action items

## Output JSON for Context Update:
\`\`\`json
{
  "title": "Short title for brain dump",
  "summary": "2-3 sentence summary of what was extracted from the braindump",
  "insights": "Key insights or highlights from this braindump",
  "tags": ["relevant", "tags"],
  "metadata": {
    "processingNote": "Explain why context was or wasn't updated"
  },
  "operations": [
    {
      "id": "op-[timestamp]-project-update",
      "table": "projects",
      "operation": "update",
      "data": {
        "id": "${existingProject.id}",
        "context": "COMPLETE markdown with ALL existing content PLUS new updates...",
        "executive_summary": "Updated executive summary (only if project vision/scope changed)",
        "tags": ["updated", "tags", "if", "changed"],
        "status": "active|paused|completed|archived"
      }
    }
  ]
}
\`\`\`

## Output JSON for No Context Update Needed:
\`\`\`json
{
  "title": "Title for the braindump",
  "summary": "Summary of the braindump content",
  "insights": "Key insights from the content",
  "tags": ["relevant", "tags"],
  "metadata": {
    "processingNote": "No context update needed - [explain why: task-focused, progress update, etc.]"
  },
  "operations": []
}
\`\`\`

Focus on strategic project information. Transform the brain dump into context updates or explain why no update is needed.`;
	}

	/**
	 * Get prompt for updating project context based on short braindump
	 */
	getProjectContextPromptForShortBrainDump(
		projectId: string,
		projectData: string,
		userId: string
	): string {
		// Import the minimal preprocessing from prompt-components
		const minimalPreprocessing = generateMinimalPreprocessingSteps();

		return `You are a BuildOS synthesis engine specializing in project context enrichment.

${minimalPreprocessing}

**OBJECTIVE**: Transform brain dump → context update operation for project ${projectId}

**PROJECT DATA:**

${projectData}
 ---------

${getDecisionMatrixUpdateCriteria()}

**Processing Rules**:
1. Preserve ALL existing context (never delete or truncate)
2. Integrate new insights appropriately within existing structure
3. Add new sections with ## headers if needed
4. Update existing sections by appending new information
5. Add timestamps for significant updates: "Updated YYYY-MM-DD: ..."
6. Maintain markdown formatting and structure
7. **Adapt structure as needed**: Add new sections, reorganize, or combine sections to better serve the evolving project

${generateProjectContextFramework('condensed')}

**Framework Flexibility**: The structure above is a guide. Feel free to evolve it based on the project's changing needs and the new information being integrated.

**Output Format**:
{
  "title": "Create context update summary title",
  "summary": "2-3 sentence summary of what context was updated",
  "insights": "Key insights added to the context",
  "tags": ["context", "update"],
  "metadata": {
    "processingNote": "Context-only update for ${projectId}"
  },
  "operations": [
    {
      "id": "${generateOperationId('context-update')}",
      "table": "projects",
      "operation": "update",
      "conditions": { "id": "${projectId}" },
      "data": {
        "context": "Rich markdown with all sections...",
        "executive_summary": "Updated if project vision/scope changed"
      },
      "enabled": true
    }
  ]
}

Respond with valid JSON.`;
	}
}
