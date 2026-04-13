// apps/worker/src/workers/brief/ontologyPrompts.ts
/**
 * LLM Prompts for ontology-based daily brief generation.
 * Goal-centric analysis with strategic alignment focus.
 *
 * Spec Reference: /docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md
 */

import type {
	OntologyBriefData,
	GoalProgress,
	OntoTask,
	OntoRisk,
	OntoRequirement,
	ProjectBriefData,
	CalendarBriefCounts,
	CalendarBriefItem,
	ProjectRecentChange
} from './ontologyBriefTypes.js';
import { format, parseISO } from 'date-fns';
import { getWorkMode } from './ontologyBriefDataLoader.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatMinutes(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
	if (hours > 0) return `${hours}h`;
	return `${mins}m`;
}

function formatGoalTarget(goal: GoalProgress): string | null {
	if (!goal.targetDate) return null;

	const formattedDate = format(parseISO(`${goal.targetDate}T00:00:00`), 'MMM d, yyyy');
	if (goal.targetDaysAway === null) {
		return `Target: ${formattedDate}`;
	}

	if (goal.targetDaysAway === 0) {
		return `Target: ${formattedDate} (today)`;
	}
	if (goal.targetDaysAway > 0) {
		const dayLabel = goal.targetDaysAway === 1 ? 'day' : 'days';
		return `Target: ${formattedDate} (in ${goal.targetDaysAway} ${dayLabel})`;
	}

	const overdueDays = Math.abs(goal.targetDaysAway);
	const overdueLabel = overdueDays === 1 ? 'day' : 'days';
	return `Target: ${formattedDate} (${overdueDays} ${overdueLabel} overdue)`;
}

function formatGoalProgress(goal: GoalProgress): string {
	const targetSummary = formatGoalTarget(goal);
	if (!targetSummary) {
		return `- **${goal.goal.name}**`;
	}

	return `- **${goal.goal.name}**: ${targetSummary}`;
}

function formatTaskForPrompt(task: OntoTask, projectName?: string): string {
	const priority = task.priority !== null && task.priority <= 2 ? ` [P${task.priority}]` : '';
	const workMode = getWorkMode(task.type_key);
	const workModeStr = workMode ? ` (${workMode})` : '';
	const projectStr = projectName ? ` | ${projectName}` : '';
	return `- ${task.title}${priority}${workModeStr}${projectStr}`;
}

function formatRisk(risk: OntoRisk): string {
	const impact = risk.impact || 'medium';
	return `- **${risk.title}** (Impact: ${impact})`;
}

function formatCalendarItemForPrompt(item: CalendarBriefItem, includeDate: boolean): string {
	const when = includeDate ? `${item.displayDate} ${item.displayTime}` : item.displayTime;
	const project = item.projectName ? ` | ${item.projectName}` : '';
	return `- ${when}: ${item.title} (${item.sourceLabel}${project})`;
}

function formatCalendarPromptSourceCounts(counts: CalendarBriefCounts): string {
	const syncIssueLabel = `sync issue${counts.syncIssue === 1 ? '' : 's'}`;
	const staleLabel = counts.staleGoogle > 0 ? `, ${counts.staleGoogle} stale Google` : '';
	const unconfirmedLabel =
		counts.unconfirmedGoogle > 0 ? `, ${counts.unconfirmedGoogle} unconfirmed Google` : '';
	return `${counts.google} Google${unconfirmedLabel}, ${counts.internal} internal, ${counts.syncIssue} ${syncIssueLabel}${staleLabel}`;
}

function buildCalendarSummaryForPrompt(briefData: OntologyBriefData): string {
	const calendar = briefData.calendar;
	const lines: string[] = [
		`- Today: ${calendar.todayTotal} item${calendar.todayTotal === 1 ? '' : 's'} (${formatCalendarPromptSourceCounts(calendar.counts.today)})`,
		`- Upcoming next 7 days: ${calendar.upcomingTotal} item${calendar.upcomingTotal === 1 ? '' : 's'} (${formatCalendarPromptSourceCounts(calendar.counts.upcoming)})`
	];

	const promptToday = calendar.today.slice(0, 2);
	const promptUpcoming = calendar.upcoming.slice(0, 2);
	const commitments = [
		...promptToday.map((item) => formatCalendarItemForPrompt(item, false)),
		...promptUpcoming.map((item) => formatCalendarItemForPrompt(item, true))
	];

	if (commitments.length > 0) {
		lines.push('- Next commitments:');
		lines.push(...commitments.map((item) => `  ${item}`));
	}

	const hiddenFromPrompt =
		Math.max(0, calendar.todayTotal - promptToday.length) +
		Math.max(0, calendar.upcomingTotal - promptUpcoming.length);
	if (hiddenFromPrompt > 0) {
		lines.push(
			`- Hidden from prompt: ${hiddenFromPrompt} additional calendar item${hiddenFromPrompt === 1 ? '' : 's'}`
		);
	}

	return lines.join('\n');
}

function formatRecentChangeForPrompt(change: ProjectRecentChange): string {
	const actor = change.actorName ? ` by ${change.actorName}` : '';
	return `- ${change.kind} ${change.action}: ${change.title}${actor}`;
}

function formatPlanForPrompt(plan: ProjectBriefData['plans'][number]): string {
	const description = plan.description ? ` - ${plan.description}` : '';
	const facets = [plan.facet_context, plan.facet_scale, plan.facet_stage].filter(Boolean);
	const facetText = facets.length > 0 ? ` (${facets.join(' / ')})` : '';
	return `- ${plan.name} [${plan.state_key}${facetText}]${description}`;
}

function formatDocumentForPrompt(document: ProjectBriefData['documents'][number]): string {
	const description = document.description ? ` - ${document.description}` : '';
	return `- ${document.title || 'Untitled document'} [${document.state_key}]${description}`;
}

// ============================================================================
// MAIN ANALYSIS PROMPT
// ============================================================================

export interface OntologyAnalysisPromptInput {
	date: string;
	timezone: string;
	briefData: OntologyBriefData;
	holidays?: string[];
	projectBriefContents?: string[];
}

export class OntologyAnalysisPrompt {
	static getSystemPrompt(): string {
		return `You are a productivity analyst. Your job: provide INSIGHT, not summary. The user already has the brief—you're adding perspective they might miss.

**Your Mindset:**
- Editorial: Not everything deserves mention. Focus on the meaningful 20%.
- Diagnostic: What's the real bottleneck? What's hiding in plain sight?
- Actionable: Every insight should lead to a decision or action.

**Structure (3 sections, 250 words max):**

1. **The Real Picture** (2-3 sentences)
   - What's actually going on today? (Not stats—interpretation)
   - Is the user set up for a productive day, or fighting fires?
   - Any patterns they should notice? (e.g., "3 projects waiting on the same blocker")

2. **What Matters Most** (3-5 bullets)
   - The ONE bottleneck that, if solved, unblocks the most
   - Any hidden wins: small tasks with outsized impact
   - Cross-project dependencies or context-switching risks
   - Goals at risk and what would fix them

3. **One Clear Recommendation** (1-2 sentences)
   - If the user can only do ONE thing today, what should it be?
   - Be specific: name the task/goal and explain why

**Rules:**
- Lead with insight, not data
- Reference specific projects and tasks by name
- No filler paragraphs—every sentence earns its place
- Skip sections if you have nothing meaningful to say
- Don't repeat what's in the executive summary

Never output JSON.`;
	}

	static buildUserPrompt(input: OntologyAnalysisPromptInput): string {
		const { date, timezone, briefData, holidays, projectBriefContents } = input;

		let prompt = `Generate a goal-oriented daily brief analysis.

Date: ${date}
Timezone: ${timezone}
${holidays && holidays.length > 0 ? `Holidays: ${holidays.join(', ')}\n` : ''}

## Overview Stats
- Active Projects: ${briefData.projects.length}
- Tasks Today: ${briefData.todaysTasks.length}
- Recently Updated Tasks (7d): ${briefData.recentlyUpdatedTasks?.length ?? 0}
- Upcoming Tasks (next 7d): ${briefData.upcomingTasks?.length ?? 0}
- Blocked Tasks: ${briefData.blockedTasks.length}
- Overdue Tasks: ${briefData.overdueTasks.length}
- High Priority Tasks: ${briefData.highPriorityCount}
- Active Risks: ${briefData.risks.length}
- Requirements: ${briefData.requirements.length}
- Calendar Today: ${briefData.calendar.todayTotal}
- Calendar Upcoming: ${briefData.calendar.upcomingTotal}

`;

		if (briefData.calendar.todayTotal > 0 || briefData.calendar.upcomingTotal > 0) {
			prompt += `## Calendar Summary\n`;
			prompt += `${buildCalendarSummaryForPrompt(briefData)}\n\n`;
		}

		// Goal Progress Section
		if (briefData.goals.length > 0) {
			prompt += `## Goal Progress\n`;
			const activeGoals = briefData.goals.filter(
				(g) => g.goal.state_key !== 'achieved' && g.goal.state_key !== 'abandoned'
			);

			if (activeGoals.length > 0) {
				for (const goal of activeGoals) {
					prompt += formatGoalProgress(goal) + '\n';
				}
			} else {
				prompt += `No active goals defined.\n`;
			}
			prompt += '\n';
		}

		// Today's Tasks by Work Mode
		prompt += `## Today's Tasks\n`;
		if (briefData.todaysTasks.length === 0) {
			prompt += `No tasks scheduled for today.\n`;
		} else {
			const tasksByMode = briefData.tasksByWorkMode;
			for (const [mode, tasks] of Object.entries(tasksByMode)) {
				const modeTasks = tasks.filter((t) =>
					briefData.todaysTasks.some((tt) => tt.id === t.id)
				);
				if (modeTasks.length > 0) {
					prompt += `\n### ${mode.charAt(0).toUpperCase() + mode.slice(1)} Tasks\n`;
					for (const task of modeTasks.slice(0, 3)) {
						prompt += formatTaskForPrompt(task) + '\n';
					}
					if (modeTasks.length > 3) {
						prompt += `... and ${modeTasks.length - 3} more\n`;
					}
				}
			}
		}
		prompt += '\n';

		// Recently Updated Tasks (per PROJECT_CONTEXT_ENRICHMENT_SPEC.md)
		if (briefData.recentlyUpdatedTasks && briefData.recentlyUpdatedTasks.length > 0) {
			prompt += `## Recently Updated Tasks (Last 7 Days)\n`;
			prompt += `*Tasks with recent activity - ordered by update time*\n\n`;
			for (const task of briefData.recentlyUpdatedTasks.slice(0, 10)) {
				prompt += formatTaskForPrompt(task) + '\n';
			}
			if (briefData.recentlyUpdatedTasks.length > 10) {
				prompt += `... and ${briefData.recentlyUpdatedTasks.length - 10} more\n`;
			}
			prompt += '\n';
		}

		// Upcoming Tasks (per PROJECT_CONTEXT_ENRICHMENT_SPEC.md)
		if (briefData.upcomingTasks && briefData.upcomingTasks.length > 0) {
			prompt += `## Upcoming Tasks (Next 7 Days)\n`;
			prompt += `*Tasks with due dates or start dates coming up - deduplicated from recent updates*\n\n`;
			for (const task of briefData.upcomingTasks.slice(0, 5)) {
				prompt += formatTaskForPrompt(task) + '\n';
			}
			if (briefData.upcomingTasks.length > 5) {
				prompt += `... and ${briefData.upcomingTasks.length - 5} more\n`;
			}
			prompt += '\n';
		}

		// Blocked Tasks
		if (briefData.blockedTasks.length > 0) {
			prompt += `## Blocked Tasks\n`;
			for (const task of briefData.blockedTasks.slice(0, 5)) {
				prompt += formatTaskForPrompt(task) + '\n';
			}
			prompt += '\n';
		}

		// Overdue Tasks
		if (briefData.overdueTasks.length > 0) {
			prompt += `## Overdue Tasks\n`;
			for (const task of briefData.overdueTasks.slice(0, 5)) {
				prompt += formatTaskForPrompt(task) + '\n';
			}
			prompt += '\n';
		}

		// Risks
		if (briefData.risks.length > 0) {
			prompt += `## Active Risks\n`;
			for (const risk of briefData.risks.slice(0, 3)) {
				prompt += formatRisk(risk) + '\n';
			}
			prompt += '\n';
		}

		// Requirements
		if (briefData.requirements.length > 0) {
			prompt += `## Requirements\n`;
			for (const req of briefData.requirements.slice(0, 5)) {
				prompt += `- ${req.text}\n`;
			}
			prompt += '\n';
		}

		// Recent Updates
		const totalUpdates =
			briefData.recentUpdates.tasks.length +
			briefData.recentUpdates.goals.length +
			briefData.recentUpdates.documents.length;

		if (totalUpdates > 0) {
			prompt += `## Recent Activity (Last 24h)\n`;
			prompt += `- ${briefData.recentUpdates.tasks.length} tasks updated\n`;
			prompt += `- ${briefData.recentUpdates.goals.length} goals with activity\n`;
			prompt += `- ${briefData.recentUpdates.documents.length} documents updated\n`;
			prompt += '\n';
		}

		// Project Summaries
		prompt += `## Project Details\n`;
		const maxProjectDetails = 5;
		const sortedProjects = [...briefData.projects].sort((a, b) => {
			const scoreA =
				a.todaysTasks.length * 3 +
				a.blockedTasks.length * 2 +
				a.upcomingTasks.length +
				a.recentlyUpdatedTasks.length;
			const scoreB =
				b.todaysTasks.length * 3 +
				b.blockedTasks.length * 2 +
				b.upcomingTasks.length +
				b.recentlyUpdatedTasks.length;
			if (scoreA !== scoreB) return scoreB - scoreA;
			return a.project.name.localeCompare(b.project.name);
		});
		for (const project of sortedProjects.slice(0, maxProjectDetails)) {
			prompt += `\n### ${project.project.name}\n`;
			prompt += `- State: ${project.project.state_key}\n`;
			prompt += `- Today's Tasks: ${project.todaysTasks.length}\n`;
			prompt += `- This Week: ${project.thisWeekTasks.length}\n`;
			prompt += `- Blocked: ${project.blockedTasks.length}\n`;

			if (project.nextSteps.length > 0) {
				prompt += `- Next Steps: ${project.nextSteps[0]}\n`;
			}
			if (project.nextMilestone) {
				prompt += `- Next Milestone: ${project.nextMilestone}\n`;
			}
			if (project.goals.length > 0) {
				const activeGoals = project.goals.filter(
					(g) => g.goal.state_key !== 'achieved' && g.goal.state_key !== 'abandoned'
				);
				if (activeGoals.length > 0) {
					prompt += `- Goal Progress:\n`;
					for (const goal of activeGoals.slice(0, 2)) {
						prompt += `  ${formatGoalProgress(goal)}\n`;
					}
				}
			}
		}
		if (briefData.projects.length > maxProjectDetails) {
			prompt += `\n... and ${briefData.projects.length - maxProjectDetails} more projects\n`;
		}

		// Include formatted project briefs for detailed context (if available)
		if (projectBriefContents && projectBriefContents.length > 0) {
			prompt += `\n## Formatted Project Briefs\n`;
			prompt += `*Use these finalized briefs for accurate, specific analysis:*\n\n`;
			const maxBriefs = 5;
			const truncatedBriefs = projectBriefContents.slice(0, maxBriefs).map((content) => {
				if (content.length > 3000) {
					return content.slice(0, 3000) + '\n...(truncated)';
				}
				return content;
			});
			prompt += truncatedBriefs.join('\n---\n');
			prompt += '\n';
		}

		prompt += `
Write the analysis (250 words max). Lead with insight, not data.
Focus on: (1) What's really going on, (2) What matters most, (3) One clear recommendation.
Reference specific projects and tasks. Skip sections if you have nothing meaningful to add.`;

		return prompt;
	}
}

// ============================================================================
// EXECUTIVE SUMMARY PROMPT
// ============================================================================

export class OntologyExecutiveSummaryPrompt {
	static getSystemPrompt(): string {
		return `You are a confident productivity coach writing a daily brief summary. Your job: help the user understand what matters today and what to do about it—in 30 seconds or less.

**Your Voice:**
- Confident: The user CAN handle today
- Direct: Lead with the verdict, not the data
- Action-focused: Every sentence points to something to do
- Honest: If something's at risk, say it plainly

**Format (150 words max):**

Do NOT include a heading—start directly with content.

1. **Day Verdict** (1 sentence)
   - What kind of day is this? "Loaded but manageable" / "Light day, good for deep work" / "3 blockers need attention first"

2. **Start Here** (1-2 sentences)
   - The ONE thing to do first and why it matters
   - Pattern: "Start with [Task] — it unblocks [impact]"

3. **Key Items** (3-4 bullets max)
   - Use 🔴 for urgent/blocked, ✅ for momentum, ⚠️ for at-risk
   - Reference actual task/goal names (never generic)
   - Each bullet = one actionable insight

4. **Momentum** (1 sentence, optional)
   - Only if there's recent progress worth noting
   - Skip if nothing meaningful to say

**Rules:**
- Scannable in 30 seconds (busy person glancing at phone)
- Bold the most important items
- No corporate language ("optimize", "leverage", "synergize")
- No filler ("It's important to note that...")
- If data is missing, skip that section—don't pad`;
	}

	static buildUserPrompt(input: OntologyAnalysisPromptInput): string {
		const { date, timezone, briefData, holidays, projectBriefContents } = input;

		// Calculate aggregate stats
		const activeGoals = briefData.goals.filter(
			(g) => g.goal.state_key !== 'achieved' && g.goal.state_key !== 'abandoned'
		);
		const goalsOnTrack = activeGoals.filter((g) => g.status === 'on_track').length;
		const goalsAtRisk = activeGoals.filter(
			(g) => g.status === 'at_risk' || g.status === 'behind'
		).length;

		let prompt = `Generate an executive summary for this ontology-based daily brief.

Date: ${date}
Timezone: ${timezone}
${holidays && holidays.length > 0 ? `Holidays: ${holidays.join(', ')}\n` : ''}

## Quick Stats
- Projects: ${briefData.projects.length}
- Tasks Today: ${briefData.todaysTasks.length}
- Recently Updated (7d): ${briefData.recentlyUpdatedTasks?.length ?? 0}
- Upcoming (next 7d): ${briefData.upcomingTasks?.length ?? 0}
- High Priority: ${briefData.highPriorityCount}
- Blocked: ${briefData.blockedTasks.length}
- Overdue: ${briefData.overdueTasks.length}
- Requirements: ${briefData.requirements.length}
- Calendar Today: ${briefData.calendar.todayTotal}
- Calendar Upcoming: ${briefData.calendar.upcomingTotal}

## Goal Status
- Active Goals: ${activeGoals.length}
- On Track: ${goalsOnTrack}
- At Risk: ${goalsAtRisk}

## Risks
- Active Risks: ${briefData.risks.length}

`;

		if (briefData.calendar.todayTotal > 0 || briefData.calendar.upcomingTotal > 0) {
			prompt += `## Calendar Summary\n`;
			prompt += `${buildCalendarSummaryForPrompt(briefData)}\n\n`;
		}

		// Requirements (brief)
		if (briefData.requirements.length > 0) {
			prompt += `## Requirements\n`;
			prompt += `- Requirements: ${briefData.requirements
				.slice(0, 3)
				.map((r) => r.text)
				.join('; ')}\n`;
			prompt += '\n';
		}

		// Add goal details
		if (activeGoals.length > 0) {
			prompt += `## Goal Details\n`;
			for (const goal of activeGoals) {
				prompt += formatGoalProgress(goal) + '\n';
			}
			prompt += '\n';
		}

		// Add project context with strategic task splits
		prompt += `## Project Context\n`;
		for (const project of briefData.projects.slice(0, 3)) {
			prompt += `- **${project.project.name}**: ${project.todaysTasks.length} today`;
			if (project.recentlyUpdatedTasks && project.recentlyUpdatedTasks.length > 0) {
				prompt += `, ${project.recentlyUpdatedTasks.length} recently updated`;
			}
			if (project.upcomingTasks && project.upcomingTasks.length > 0) {
				prompt += `, ${project.upcomingTasks.length} upcoming`;
			}
			if (project.blockedTasks.length > 0) {
				prompt += `, ${project.blockedTasks.length} blocked`;
			}
			if (project.nextMilestone) {
				prompt += ` | Next: ${project.nextMilestone}`;
			}
			prompt += '\n';
		}

		// Include formatted project briefs for full context (if available)
		if (projectBriefContents && projectBriefContents.length > 0) {
			prompt += `\n## Detailed Project Briefs\n`;
			prompt += `*These are the finalized project briefs - use them to provide accurate, specific context:*\n\n`;
			// Limit to first 3 project briefs and truncate each to avoid token overflow
			const truncatedBriefs = projectBriefContents.slice(0, 3).map((content) => {
				if (content.length > 2000) {
					return content.slice(0, 2000) + '\n...(truncated)';
				}
				return content;
			});
			prompt += truncatedBriefs.join('\n---\n');
			prompt += '\n';
		}

		prompt += `
Write a 150-word executive summary following the system prompt structure.
Lead with the verdict ("Loaded day" / "Light day" / "Blockers first"), then the ONE thing to start with.
Use actual project/task names from the briefs above. Be scannable—busy person, 30 seconds.`;

		return prompt;
	}
}

// ============================================================================
// PROJECT BRIEF PROMPT
// ============================================================================

export interface ProjectBriefPromptInput {
	date: string;
	timezone: string;
	project: ProjectBriefData;
}

export class OntologyProjectBriefPrompt {
	static getSystemPrompt(): string {
		return `You are a BuildOS productivity strategist writing a concise project-specific daily brief.

Prioritize:
- Calendar commitments for this project today and over the next 7 days
- Recently created or updated documents, goals, plans, tasks, and events
- Active goals, active plans, blockers, milestones, and the next best action

Rules:
- Use only the provided calendar event information for scheduling context.
- Do not invent events, documents, goals, plans, or task status.
- Be concrete and name the work that changed.
- Keep the briefMarkdown under 220 words.
- Return JSON only with this shape:
{
  "briefMarkdown": "Markdown brief beginning with the project heading",
  "statusLine": "One-sentence project status",
  "recentChangeSummary": "One sentence about what changed, or empty string",
  "calendarSummary": "One sentence about calendar commitments, or empty string",
  "nextAction": "One concrete next action, or empty string"
}`;
	}

	static buildUserPrompt(input: ProjectBriefPromptInput): string {
		const { date, timezone, project } = input;

		let prompt = `Generate a project brief for: ${project.project.name}

Date: ${date}
Timezone: ${timezone}

## Project Info
- Project ID: ${project.project.id}
- State: ${project.project.state_key}
- Type: ${project.project.type_key}
${project.project.description ? `- Description: ${project.project.description}` : ''}

## Calendar Today (${project.calendarToday.length})
`;

		if (project.calendarToday.length > 0) {
			for (const item of project.calendarToday.slice(0, 5)) {
				prompt += formatCalendarItemForPrompt(item, false) + '\n';
			}
		} else {
			prompt += `No project calendar items today.\n`;
		}

		if (project.calendarUpcoming.length > 0) {
			prompt += `\n## Upcoming Calendar (${project.calendarUpcoming.length})\n`;
			for (const item of project.calendarUpcoming.slice(0, 5)) {
				prompt += formatCalendarItemForPrompt(item, true) + '\n';
			}
		}

		if (project.recentChanges.length > 0) {
			prompt += `\n## Recent Changes\n`;
			for (const change of project.recentChanges.slice(0, 8)) {
				prompt += formatRecentChangeForPrompt(change) + '\n';
			}
		}

		if (project.documents.length > 0) {
			prompt += `\n## Recent Documents\n`;
			for (const document of project.documents.slice(0, 5)) {
				prompt += formatDocumentForPrompt(document) + '\n';
			}
		}

		if (project.plans.length > 0) {
			prompt += `\n## Plans\n`;
			for (const plan of project.plans.slice(0, 5)) {
				prompt += formatPlanForPrompt(plan) + '\n';
			}
		}

		prompt += `
## Today's Tasks (${project.todaysTasks.length})
`;

		if (project.todaysTasks.length > 0) {
			for (const task of project.todaysTasks.slice(0, 5)) {
				prompt += formatTaskForPrompt(task) + '\n';
			}
		} else {
			prompt += `No tasks scheduled for today.\n`;
		}

		prompt += `\n## This Week (${project.thisWeekTasks.length} tasks)\n`;

		// Recently Updated Tasks (per PROJECT_CONTEXT_ENRICHMENT_SPEC.md)
		if (project.recentlyUpdatedTasks && project.recentlyUpdatedTasks.length > 0) {
			prompt += `\n## Recently Updated (Last 7 Days)\n`;
			for (const task of project.recentlyUpdatedTasks.slice(0, 5)) {
				prompt += formatTaskForPrompt(task) + '\n';
			}
			if (project.recentlyUpdatedTasks.length > 5) {
				prompt += `... and ${project.recentlyUpdatedTasks.length - 5} more\n`;
			}
		}

		// Upcoming Tasks (per PROJECT_CONTEXT_ENRICHMENT_SPEC.md)
		if (project.upcomingTasks && project.upcomingTasks.length > 0) {
			prompt += `\n## Upcoming (Next 7 Days)\n`;
			for (const task of project.upcomingTasks.slice(0, 5)) {
				prompt += formatTaskForPrompt(task) + '\n';
			}
		}

		// Goals
		if (project.goals.length > 0) {
			prompt += `\n## Goal Progress\n`;
			for (const goal of project.goals) {
				prompt += formatGoalProgress(goal) + '\n';
			}
		}

		// Blocked
		if (project.blockedTasks.length > 0) {
			prompt += `\n## Blocked Tasks (${project.blockedTasks.length})\n`;
			for (const task of project.blockedTasks.slice(0, 3)) {
				prompt += formatTaskForPrompt(task) + '\n';
			}
		}

		// Next Steps
		if (project.nextSteps.length > 0) {
			prompt += `\n## Next Steps\n`;
			for (const step of project.nextSteps) {
				prompt += `- ${step}\n`;
			}
		}

		// Milestone
		if (project.nextMilestone) {
			prompt += `\n## Next Milestone\n- ${project.nextMilestone}\n`;
		}

		if (project.requirements.length > 0) {
			prompt += `\n## Requirements\n`;
			for (const requirement of project.requirements.slice(0, 5)) {
				prompt += `- ${requirement.text}\n`;
			}
		}

		prompt += `
Write the JSON response now. The briefMarkdown should use this structure when data exists:
## [${project.project.name}](/projects/${project.project.id})

### Status
### Calendar
### Recent Changes
### Goal Progress
### Today's Work
### Blockers
### Next Steps

Omit empty sections.`;

		return prompt;
	}
}

// ============================================================================
// RE-ENGAGEMENT PROMPT (Ontology version)
// ============================================================================

export interface OntologyReengagementPromptInput {
	date: string;
	timezone: string;
	daysSinceLastLogin: number;
	lastLoginDate: string;
	briefData: OntologyBriefData;
}

export class OntologyReengagementPrompt {
	static getSystemPrompt(daysSinceLastLogin: number): string {
		const tone = this.getToneForInactivityLevel(daysSinceLastLogin);

		return `You are a BuildOS productivity coach writing a re-engagement message for a user who hasn't logged in for ${daysSinceLastLogin} days.

Your tone should be ${tone}. Focus on:
1. Acknowledging their absence without guilt
2. Leading with goal targets (if set) - show upcoming or overdue dates
3. Highlighting requirements in progress that may need attention
4. Surfacing any active risks or blockers
5. Making it easy to jump back in with clear next actions

Structure:
- Start with a warm, brief greeting
- Show goal status (what's on track, what needs attention)
- Mention key requirements in progress
- Highlight any urgent items (overdue, blocked, risks)
- End with an encouraging call-to-action

Keep it under 200 words. Use Markdown formatting.
Be specific about their actual work - no placeholders.`;
	}

	static getToneForInactivityLevel(daysSinceLastLogin: number): string {
		if (daysSinceLastLogin <= 4) {
			return 'gentle and encouraging';
		} else if (daysSinceLastLogin <= 10) {
			return 'motivating and goal-focused';
		} else {
			return 'warm but direct with strategic value proposition';
		}
	}

	static buildUserPrompt(input: OntologyReengagementPromptInput): string {
		const { date, timezone, daysSinceLastLogin, lastLoginDate, briefData } = input;

		const activeGoals = briefData.goals.filter(
			(g) => g.goal.state_key !== 'achieved' && g.goal.state_key !== 'abandoned'
		);
		const goalsAtRisk = activeGoals.filter(
			(g) => g.status === 'at_risk' || g.status === 'behind'
		);

		let prompt = `Generate a re-engagement message.

Date: ${date}
Timezone: ${timezone}
Days since last login: ${daysSinceLastLogin}
Last login: ${lastLoginDate}

## Quick Stats
- Active Projects: ${briefData.projects.length}
- Pending Tasks: ${briefData.todaysTasks.length + briefData.overdueTasks.length}
- Overdue: ${briefData.overdueTasks.length}
- Blocked: ${briefData.blockedTasks.length}
- Calendar Today: ${briefData.calendar.todayTotal}
- Calendar Upcoming: ${briefData.calendar.upcomingTotal}

## Goal Status
- Active Goals: ${activeGoals.length}
- Goals at Risk: ${goalsAtRisk.length}

`;

		if (briefData.calendar.todayTotal > 0 || briefData.calendar.upcomingTotal > 0) {
			prompt += `## Calendar Summary\n`;
			prompt += `${buildCalendarSummaryForPrompt(briefData)}\n\n`;
		}

		// Goal details
		if (activeGoals.length > 0) {
			prompt += `## Goal Progress\n`;
			for (const goal of activeGoals) {
				prompt += formatGoalProgress(goal) + '\n';
			}
			prompt += '\n';
		}

		// Risks
		if (briefData.risks.length > 0) {
			prompt += `## Active Risks\n`;
			for (const risk of briefData.risks.slice(0, 2)) {
				prompt += formatRisk(risk) + '\n';
			}
			prompt += '\n';
		}

		// Overdue tasks
		if (briefData.overdueTasks.length > 0) {
			prompt += `## Overdue Tasks\n`;
			for (const task of briefData.overdueTasks.slice(0, 3)) {
				prompt += formatTaskForPrompt(task) + '\n';
			}
			prompt += '\n';
		}

		prompt += `
Write a re-engagement message following the system instructions.
Lead with goal targets (if set) and make it easy to jump back in.`;

		return prompt;
	}
}
