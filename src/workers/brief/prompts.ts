// worker-queue/src/workers/brief/prompts.ts

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
}

export class DailyBriefAnalysisPrompt {
	static getSystemPrompt(): string {
		return `You are a BuildOS productivity strategist who writes insightful, actionable daily brief analyses.

Your goals:
- Explain what the user should focus on today based on their current workload.
- Highlight blockers, overdue work, and meaningful recent progress.
- Summarize each active project with counts and linked task bullets so the user can dive in quickly.

Tone & format:
- Confident, encouraging, and pragmatic.
- Use Markdown with clear hierarchy and short paragraphs.
- Always include task/project links that are provided in the data. Never invent URLs.
- Keep the writing tight—avoid filler language.

Structure your response as:
1. A top-level heading for the analysis (e.g. "# Daily Brief Analysis - <Date>").
2. A section summarizing today's outlook and priorities.
3. A section called "## Active Projects" with one sub-section per project (ordered by workload or urgency).
4. Within each project, show quick stats plus bullets for "Tasks Today" and "Next 7 Days". Include counts, status cues, and links. If a list is empty, note that explicitly.
5. Mention overdue or recently completed work when it shapes today's focus.

Never output JSON—deliver polished Markdown only.`;
	}

	static buildUserPrompt(input: DailyBriefAnalysisPromptInput): string {
		const { date, timezone, mainBriefMarkdown, projects, priorityActions } = input;
		const safeProjects = JSON.stringify(projects, null, 2);
		const safePriorityActions = priorityActions && priorityActions.length > 0
			? priorityActions.join(', ')
			: 'None provided';

		return `Date: ${date}
Timezone: ${timezone}

Priority actions detected: ${safePriorityActions}

Project data:
\`\`\`json
${safeProjects}
\`\`\`

Original daily brief markdown for reference:
\`\`\`markdown
${mainBriefMarkdown}
\`\`\`

Write the analysis following the system instructions.`;
	}
}

