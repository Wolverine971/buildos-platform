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
 * Executive Summary Prompt - for generating concise daily brief summaries
 */

export interface ExecutiveSummaryPromptInput {
	date: string;
	timezone: string;
	totalProjects: number;
	projectsWithTodaysTasks: number;
	totalTodaysTasks: number;
	totalOverdueTasks: number;
	totalUpcomingTasks: number;
	totalNextSevenDaysTasks: number;
	totalRecentlyCompleted: number;
	timeAllocationContext?: TimeAllocationContext;
	holidays?: string[];
}

export class ExecutiveSummaryPrompt {
	static getSystemPrompt(includeTimeblocks: boolean = false): string {
		const basePrompt = `You are a BuildOS productivity strategist writing a concise, action-oriented executive summary for a daily brief.

Your goals:
- Provide a straight-to-the-point summary of the user's day
- Highlight key numbers and priorities without unnecessary filler
- Be encouraging but realistic about the workload
- Make it scannable and immediately useful`;

		const timeblockGoals = includeTimeblocks
			? `
- Reference time allocation when it provides critical context about capacity
- Mention scheduling gaps or overallocations if they're significant`
			: '';

		const toneAndFormat = `

Tone & format:
- Direct, professional, and action-focused
- 2-3 sentences maximum
- No greeting or sign-off - just the summary
- Use exact numbers provided in the data
- Focus on what matters most: tasks starting today, overdue items, and time constraints`;

		const guidelines = `

Guidelines:
- Start with the most important information (tasks starting today or overdue items)
- Mention total projects only if relevant to context
- Include upcoming tasks if they impact today's priorities
- Reference recent completions only if they provide momentum context
- Keep it under 100 words
- Output plain text only - no markdown formatting needed`;

		return basePrompt + timeblockGoals + toneAndFormat + guidelines;
	}

	static buildUserPrompt(input: ExecutiveSummaryPromptInput): string {
		const {
			date,
			timezone,
			totalProjects,
			projectsWithTodaysTasks,
			totalTodaysTasks,
			totalOverdueTasks,
			totalUpcomingTasks,
			totalNextSevenDaysTasks,
			totalRecentlyCompleted,
			timeAllocationContext,
			holidays
		} = input;

		let prompt = `Generate an executive summary for this daily brief:

Date: ${date}
Timezone: ${timezone}
${holidays && holidays.length > 0 ? `Holidays: ${holidays.join(', ')}\n` : ''}
Statistics:
- Total active projects: ${totalProjects}
- Projects with tasks starting today: ${projectsWithTodaysTasks}
- Tasks starting today: ${totalTodaysTasks}
- Overdue tasks: ${totalOverdueTasks}
- Upcoming tasks: ${totalUpcomingTasks}
- Tasks in next 7 days: ${totalNextSevenDaysTasks}
- Recently completed (last 24h): ${totalRecentlyCompleted}
`;

		// Add timeblock context if available
		if (timeAllocationContext) {
			const totalHours = (timeAllocationContext.totalAllocatedMinutes / 60).toFixed(1);
			prompt += `
Time Allocation:
- Total scheduled time today: ${totalHours}h across ${timeAllocationContext.projectAllocations.length} project(s)`;

			// Mention significant capacity issues
			const underallocated = timeAllocationContext.projectAllocations.filter(
				(p) => p.capacityStatus === 'underallocated'
			);
			const overallocated = timeAllocationContext.projectAllocations.filter(
				(p) => p.capacityStatus === 'overallocated'
			);

			if (underallocated.length > 0) {
				prompt += `\n- ${underallocated.length} project(s) underallocated`;
			}
			if (overallocated.length > 0) {
				prompt += `\n- ${overallocated.length} project(s) overallocated`;
			}

			if (timeAllocationContext.unscheduledTimeAnalysis.totalMinutes > 0) {
				const unscheduledHours = (
					timeAllocationContext.unscheduledTimeAnalysis.totalMinutes / 60
				).toFixed(1);
				prompt += `\n- ${unscheduledHours}h unscheduled time available`;
			}

			prompt += `\n`;
		}

		prompt += `
Write a concise executive summary (2-3 sentences max) that gives the user immediate clarity on their day.`;

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
