// apps/worker/src/workers/brief/prompts.ts

// Layer 4: LLM Enhancement - Timeblock-aware types
export interface TimeBlockContextSuggestion {
	title: string;
	reason?: string;
	project_id?: string | null;
	project_name?: string | null;
	priority?: string;
	estimated_minutes?: number | null;
	confidence?: number;
}

export interface ProjectAllocationContext {
	projectId: string;
	projectName: string;
	allocatedMinutes: number;
	taskCount: number;
	capacityStatus: 'aligned' | 'underallocated' | 'overallocated';
	suggestionsFromBlocks: TimeBlockContextSuggestion[];
}

export interface UnscheduledTimeContext {
	totalMinutes: number;
	blockCount: number;
	suggestedTasks: TimeBlockContextSuggestion[];
}

export interface TimeAllocationContext {
	totalAllocatedMinutes: number;
	projectAllocations: ProjectAllocationContext[];
	unscheduledTimeAnalysis: UnscheduledTimeContext;
}

export interface DailyBriefAnalysisTask {
	id: string;
	title: string;
	status: string;
	priority: string | null;
	start_date: string | null;
	start_date_formatted: string | null;
	completed_at: string | null;
	completed_at_formatted: string | null;
	link: string;
	has_calendar_event: boolean;
}

export interface DailyBriefAnalysisNote {
	id: string;
	title: string;
	updated_at: string;
	updated_at_formatted: string;
	link: string;
}

export interface DailyBriefAnalysisProject {
	project_id: string;
	project_name: string;
	project_link: string;
	description?: string | null;
	current_phase?: {
		id: string;
		name: string;
		start_date: string;
		end_date: string;
	} | null;
	executive_summary?: unknown; // Project-level executive summary if available
	stats: {
		todays_task_count: number;
		next_seven_days_task_count: number;
		overdue_task_count: number;
		recently_completed_count: number;
	};
	tasks_today: DailyBriefAnalysisTask[];
	tasks_next_seven_days: DailyBriefAnalysisTask[];
	overdue_tasks: DailyBriefAnalysisTask[];
	recently_completed_tasks: DailyBriefAnalysisTask[];
	recent_notes: DailyBriefAnalysisNote[];
}

export interface DailyBriefAnalysisPromptInput {
	date: string;
	timezone: string;
	mainBriefMarkdown: string;
	projects: DailyBriefAnalysisProject[];
	priorityActions?: string[];
	timeAllocationContext?: TimeAllocationContext;
}

function formatMinutes(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
	if (hours > 0) return `${hours}h`;
	return `${mins}m`;
}

export class DailyBriefAnalysisPrompt {
	static getSystemPrompt(includeTimeblocks: boolean = false): string {
		const basePrompt = `You are a BuildOS productivity strategist who writes insightful, actionable daily brief analyses.

Your goals:
- Explain what the user should focus on today based on their current workload.
- Highlight blockers, overdue work, and meaningful recent progress.
- Summarize each active project with counts and linked task bullets so the user can dive in quickly.`;

		const timeblockGoals = includeTimeblocks
			? `
- Consider scheduled timeblocks when assessing capacity and prioritization.
- Highlight when a project's scheduled time aligns with its workload, or when there's a gap.
- Reference timeblock ai_suggestions as contextual work recommendations.
- Suggest reallocating unscheduled time to projects that need it.`
			: '';

		const toneAndFormat = `

Tone & format:
- Confident, encouraging, and pragmatic.
- Use Markdown with clear hierarchy and short paragraphs.
- Always include task/project links that are provided in the data. Never invent URLs.
- Keep the writing tight—avoid filler language.`;

		const structure = `

Structure your response as:
1. A top-level heading for the analysis (e.g. "# Daily Brief Analysis - <Date>").
2. A section summarizing today's outlook and priorities.${includeTimeblocks ? '\n3. If timeblocks are included: briefly assess time allocation and capacity across projects.' : ''}
3. A section called "## Active Projects" with one sub-section per project (ordered by workload or urgency).
4. Within each project, show quick stats plus bullets for "Tasks Today" and "Next 7 Days". Include counts, status cues, and links. If a list is empty, note that explicitly.
5. Mention overdue or recently completed work when it shapes today's focus.${includeTimeblocks ? '\n6. If significant unscheduled time exists, suggest how the user could allocate it.' : ''}

Never output JSON—deliver polished Markdown only.`;

		return basePrompt + timeblockGoals + toneAndFormat + structure;
	}

	static buildUserPrompt(input: DailyBriefAnalysisPromptInput): string {
		const {
			date,
			timezone,
			mainBriefMarkdown,
			projects,
			priorityActions,
			timeAllocationContext
		} = input;
		const safeProjects = JSON.stringify(projects, null, 2);
		const safePriorityActions =
			priorityActions && priorityActions.length > 0
				? priorityActions.join(', ')
				: 'None provided';

		let prompt = `Date: ${date}
Timezone: ${timezone}

Priority actions detected: ${safePriorityActions}
`;

		// Add timeblock context if available
		if (timeAllocationContext) {
			prompt += `
## Time Allocation Context

**Total scheduled**: ${formatMinutes(timeAllocationContext.totalAllocatedMinutes)}

### Projects & Time Allocation:
`;

			for (const proj of timeAllocationContext.projectAllocations) {
				prompt += `\n- **${proj.projectName}**: ${formatMinutes(proj.allocatedMinutes)} allocated, ${proj.taskCount} task(s) today
  - Capacity status: ${proj.capacityStatus}`;

				if (proj.suggestionsFromBlocks && proj.suggestionsFromBlocks.length > 0) {
					prompt += `\n  - Timeblock suggestions: ${proj.suggestionsFromBlocks
						.slice(0, 2)
						.map((s) => s.title)
						.join(', ')}`;
				}
				prompt += `\n`;
			}

			// Unscheduled time
			if (
				timeAllocationContext.unscheduledTimeAnalysis &&
				timeAllocationContext.unscheduledTimeAnalysis.totalMinutes > 0
			) {
				prompt += `\n### Unscheduled Time:
- **${timeAllocationContext.unscheduledTimeAnalysis.blockCount} blocks** (${formatMinutes(timeAllocationContext.unscheduledTimeAnalysis.totalMinutes)} total)`;

				if (
					timeAllocationContext.unscheduledTimeAnalysis.suggestedTasks &&
					timeAllocationContext.unscheduledTimeAnalysis.suggestedTasks.length > 0
				) {
					prompt += `\n- Suggested tasks: ${timeAllocationContext.unscheduledTimeAnalysis.suggestedTasks
						.slice(0, 3)
						.map((s) => s.title)
						.join(', ')}`;
				}
				prompt += `\n`;
			}
		}

		prompt += `
Project data:
\`\`\`json
${safeProjects}
\`\`\`

Original daily brief markdown for reference:
\`\`\`markdown
${mainBriefMarkdown}
\`\`\`

Write the analysis following the system instructions.`;

		return prompt;
	}
}

/**
 * Re-engagement Prompt - for users who haven't logged in for a while
 */

export interface ReengagementPromptInput {
	date: string;
	timezone: string;
	daysSinceLastLogin: number;
	lastLoginDate: string;
	pendingTasksCount: number;
	overdueTasksCount: number;
	activeProjectsCount: number;
	topPriorityTasks: Array<{ title: string; project: string }>;
	recentCompletions: Array<{ title: string; completedAt: string }>;
	mainBriefMarkdown: string;
}

/**
 * Executive Summary Prompt - for generating rich, contextual daily brief summaries
 */

export interface ExecutiveSummaryPromptInput {
	date: string;
	timezone: string;
	projects: DailyBriefAnalysisProject[];
	timeAllocationContext?: TimeAllocationContext;
	holidays?: string[];
}

export class ExecutiveSummaryPrompt {
	static getSystemPrompt(includeTimeblocks: boolean = false): string {
		const basePrompt = `You are a BuildOS productivity strategist writing an insightful executive summary for a daily brief.

Your goals:
- Synthesize the user's day into a clear, actionable overview
- Identify cross-project patterns, priorities, and strategic focus areas
- Highlight critical items (overdue, starting today, blockers) while maintaining encouraging tone
- Reference specific projects and tasks by name to provide immediate context
- Make the summary scannable with clear formatting and structure`;

		const timeblockGoals = includeTimeblocks
			? `
- Assess whether scheduled time aligns with actual workload across projects
- Flag significant capacity mismatches (under/overallocated projects)
- Suggest time reallocation opportunities when relevant`
			: '';

		const toneAndFormat = `

Tone & Style:
- Professional yet encouraging - acknowledge challenges while highlighting momentum
- Strategic and synthesized - don't just list stats, show how pieces connect
- Specific - use actual project names, task titles, and phase names from the data
- Action-oriented - guide the user toward clear next steps`;

		const structure = `

Structure & Format (300 words max):
Use clean Markdown formatting with these sections:

**IMPORTANT: Do not include a heading with the date or "Daily Brief" prefix - this is already displayed in the UI. Start directly with the Opening Context paragraph.**

1. **Opening Context** (2-3 sentences)
   - What type of day is this? (Heavy workload, cleanup day, momentum building, etc.)
   - Reference holidays if present
   - Set expectations for the day's flow

2. **Key Focus Areas** (Bulleted list)
   - List 3-5 most important things to focus on today
   - Reference specific project names and task counts
   - Mention overdue items and tasks starting today
   - Connect tasks to their project phases when relevant

3. **Project Insights** (2-3 sentences)
   - Brief mention of notable projects (those with high activity or concerns)
   - Reference current phases when they provide context
   - Highlight any cross-project dependencies or patterns${includeTimeblocks ? '\n   - Note capacity allocation issues if significant' : ''}

4. **Momentum & Outlook** (1-2 sentences)
   - Acknowledge recent progress if any
   - Brief look ahead to what's coming in next 7 days if relevant
   - Encouraging close that guides action`;

		const guidelines = `

Critical Guidelines:
- **Never invent data** - only reference projects, tasks, and phases provided in the input
- **Use actual names** - don't say "Project A" when you have the real project name
- **Be selective** - don't mention every project if some are more critical
- **Stay within 300 words** - be concise but comprehensive
- **Format with Markdown** - use bold, bullets, and clear structure
- **No placeholders** - every statement should reference actual data`;

		return basePrompt + timeblockGoals + toneAndFormat + structure + guidelines;
	}

	static buildUserPrompt(input: ExecutiveSummaryPromptInput): string {
		const { date, timezone, projects, timeAllocationContext, holidays } = input;

		// Calculate aggregate stats for overview
		const totalProjects = projects.length;
		const totalTodaysTasks = projects.reduce((sum, p) => sum + p.stats.todays_task_count, 0);
		const totalOverdueTasks = projects.reduce((sum, p) => sum + p.stats.overdue_task_count, 0);
		const totalUpcomingTasks = projects.reduce(
			(sum, p) => sum + p.stats.next_seven_days_task_count,
			0
		);
		const totalRecentlyCompleted = projects.reduce(
			(sum, p) => sum + p.stats.recently_completed_count,
			0
		);

		let prompt = `Generate an executive summary for this daily brief.

Date: ${date}
Timezone: ${timezone}
${holidays && holidays.length > 0 ? `🎉 Today is ${holidays.join(' and ')}\n` : ''}
Overview Stats:
- ${totalProjects} active projects
- ${totalTodaysTasks} tasks starting today
- ${totalOverdueTasks} overdue tasks
- ${totalUpcomingTasks} tasks in next 7 days
- ${totalRecentlyCompleted} completed in last 24h

`;

		// Add timeblock context if available
		if (timeAllocationContext) {
			const totalHours = (timeAllocationContext.totalAllocatedMinutes / 60).toFixed(1);
			prompt += `Time Allocation Today:
- Total scheduled: ${totalHours}h
`;

			const underallocated = timeAllocationContext.projectAllocations.filter(
				(p) => p.capacityStatus === 'underallocated'
			);
			const overallocated = timeAllocationContext.projectAllocations.filter(
				(p) => p.capacityStatus === 'overallocated'
			);

			if (underallocated.length > 0) {
				prompt += `- Underallocated: ${underallocated.map((p) => p.projectName).join(', ')}\n`;
			}
			if (overallocated.length > 0) {
				prompt += `- Overallocated: ${overallocated.map((p) => p.projectName).join(', ')}\n`;
			}

			if (timeAllocationContext.unscheduledTimeAnalysis.totalMinutes > 0) {
				const unscheduledHours = (
					timeAllocationContext.unscheduledTimeAnalysis.totalMinutes / 60
				).toFixed(1);
				prompt += `- Unscheduled time available: ${unscheduledHours}h\n`;
			}

			prompt += `\n`;
		}

		// Format each project with rich context
		prompt += `Project Details:\n\n`;

		projects.forEach((project) => {
			prompt += `**${project.project_name}**\n`;

			if (project.description) {
				prompt += `Description: ${project.description}\n`;
			}

			if (project.current_phase) {
				prompt += `Current Phase: ${project.current_phase.name} (${project.current_phase.start_date} to ${project.current_phase.end_date})\n`;
			}

			// Task breakdown for this project
			prompt += `Tasks:\n`;
			if (project.stats.todays_task_count > 0) {
				prompt += `  - Starting today: ${project.stats.todays_task_count}\n`;
				// List actual task titles for today
				if (project.tasks_today.length > 0) {
					project.tasks_today.slice(0, 3).forEach((task) => {
						prompt += `    • ${task.title}${task.priority && task.priority !== 'medium' ? ` (${task.priority} priority)` : ''}\n`;
					});
					if (project.tasks_today.length > 3) {
						prompt += `    • ... and ${project.tasks_today.length - 3} more\n`;
					}
				}
			}

			if (project.stats.overdue_task_count > 0) {
				prompt += `  - Overdue: ${project.stats.overdue_task_count}\n`;
				// List overdue task titles
				if (project.overdue_tasks.length > 0) {
					project.overdue_tasks.slice(0, 2).forEach((task) => {
						prompt += `    • ${task.title}\n`;
					});
					if (project.overdue_tasks.length > 2) {
						prompt += `    • ... and ${project.overdue_tasks.length - 2} more\n`;
					}
				}
			}

			if (project.stats.next_seven_days_task_count > 0) {
				prompt += `  - Next 7 days: ${project.stats.next_seven_days_task_count}\n`;
			}

			if (project.stats.recently_completed_count > 0) {
				prompt += `  - Recently completed: ${project.stats.recently_completed_count}\n`;
			}

			// Note if project has recent activity (notes)
			if (project.recent_notes.length > 0) {
				prompt += `  - Recent notes: ${project.recent_notes.length}\n`;
			}

			prompt += `\n`;
		});

		prompt += `
Using the project details above, write a 300-word executive summary that synthesizes the user's day.
Follow the structure in the system prompt (Opening Context, Key Focus Areas, Project Insights, Momentum & Outlook).
Use Markdown formatting and reference specific project names and task titles.`;

		return prompt;
	}
}

export class ReengagementBriefPrompt {
	static getSystemPrompt(daysSinceLastLogin: number): string {
		const tone = this.getToneForInactivityLevel(daysSinceLastLogin);

		return `You are a BuildOS productivity coach writing a re-engagement email to a user who hasn't logged in for ${daysSinceLastLogin} days.

Your tone should be ${tone}. Focus on:
1. Acknowledging their absence without guilt or shame
2. Highlighting what's waiting for them (tasks, projects) with specific details
3. Providing motivation to return based on their actual work context
4. Keeping the message concise, actionable, and encouraging

Structure your response:
- Start with a brief, warm greeting that acknowledges the absence
- Present a clear summary of what's waiting (use specific numbers and task names)
- For tasks starting today or overdue, emphasize their importance without creating pressure
- End with an encouraging call-to-action to return

Format in Markdown with clear sections and task links when provided.
Do NOT use placeholders - write actual personalized content based on the user's data.
Be specific about their pending work but encouraging about getting back on track.

Key guidelines:
- Never use guilt or negative framing ("You've been gone too long")
- Focus on the positive ("Your projects are ready for you")
- Highlight progress they made before leaving if available
- Make it easy to jump back in (clear next steps)`;
	}

	static getToneForInactivityLevel(daysSinceLastLogin: number): string {
		if (daysSinceLastLogin <= 4) {
			return 'gentle and encouraging';
		} else if (daysSinceLastLogin <= 10) {
			return 'motivating and action-oriented';
		} else {
			return 'warm but direct with a clear value proposition';
		}
	}

	static getSubjectLine(daysSinceLastLogin: number): string {
		if (daysSinceLastLogin <= 4) {
			return 'Your BuildOS tasks are waiting for you';
		} else if (daysSinceLastLogin <= 10) {
			return "You've made progress - don't let it slip away";
		} else {
			return "We miss you at BuildOS - here's what's waiting";
		}
	}

	static buildUserPrompt(input: ReengagementPromptInput): string {
		const {
			date,
			timezone,
			daysSinceLastLogin,
			lastLoginDate,
			pendingTasksCount,
			overdueTasksCount,
			activeProjectsCount,
			topPriorityTasks,
			recentCompletions,
			mainBriefMarkdown
		} = input;

		let prompt = `Generate a re-engagement email for a user with the following context:

Date: ${date}
Timezone: ${timezone}
Days since last login: ${daysSinceLastLogin}
Last login: ${lastLoginDate}
Pending tasks: ${pendingTasksCount}${overdueTasksCount > 0 ? ` (${overdueTasksCount} overdue)` : ''}
Active projects: ${activeProjectsCount}

`;

		if (topPriorityTasks.length > 0) {
			prompt += `Top priority tasks:\n`;
			topPriorityTasks.forEach((task) => {
				prompt += `  - ${task.title} (${task.project})\n`;
			});
			prompt += `\n`;
		}

		if (recentCompletions.length > 0) {
			prompt += `Recent completions before leaving:\n`;
			recentCompletions.forEach((task) => {
				prompt += `  - ${task.title}\n`;
			});
			prompt += `\n`;
		}

		prompt += `Current brief content for reference:
\`\`\`markdown
${mainBriefMarkdown}
\`\`\`

Create a personalized re-engagement message that encourages them to return and continue their productivity journey.`;

		return prompt;
	}
}
