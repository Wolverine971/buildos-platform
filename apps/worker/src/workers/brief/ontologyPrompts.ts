// apps/worker/src/workers/brief/ontologyPrompts.ts
/**
 * LLM Prompts for ontology-based daily brief generation.
 * Goal/Output-centric analysis with strategic alignment focus.
 *
 * Spec Reference: /docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md
 */

import type {
	OntologyBriefData,
	GoalProgress,
	OutputStatus,
	OntoTask,
	OntoRisk,
	OntoRequirement,
	OntoDecision,
	ProjectBriefData,
	RecentUpdates
} from './ontologyBriefTypes.js';
import { parseISO } from 'date-fns';
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

function formatGoalProgress(goal: GoalProgress): string {
	const statusEmoji =
		goal.status === 'on_track'
			? '**On Track**'
			: goal.status === 'at_risk'
				? '**At Risk**'
				: '**Behind**';

	return `- **${goal.goal.name}**: ${goal.progressPercent}% (${goal.completedTasks}/${goal.totalTasks} tasks) - ${statusEmoji}`;
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

function formatOutput(output: OutputStatus): string {
	return `- **${output.output.name}** - State: ${output.state}`;
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
		return `You are a BuildOS productivity strategist writing a goal-oriented daily brief analysis.

Your goals:
- Frame the day in terms of STRATEGIC ALIGNMENT: Are the user's daily tasks moving them toward their goals?
- Highlight outputs in progress and their relationship to goals
- Surface blocked work, risks, and upcoming milestones that need attention
- Provide actionable, prioritized recommendations for the day
- Balance execution tasks with strategic planning tasks

Key Ontology Concepts:
- **Goals**: High-level objectives the user is working toward
- **Outputs**: Concrete deliverables being produced
- **Plans**: Structured sets of tasks to achieve outcomes
- **Milestones**: Time-bound checkpoints
- **Risks**: Identified threats to success
- **Tasks**: Individual work items with type (work mode) and state

Tone & Format:
- Confident, strategic, and action-oriented
- Use Markdown with clear hierarchy
- Reference specific goals, outputs, and tasks by name
- Keep writing tight and scannable

Structure your response as:
1. **Strategic Overview** (2-3 sentences)
   - Are today's tasks aligned with active goals?
   - Any strategic concerns or opportunities?

2. **Goal Progress** (brief summary of each active goal)
   - Progress percentage and trajectory
   - Key contributing tasks

3. **Today's Focus** (prioritized action list)
   - High-impact tasks first
   - Unblocking tasks that enable others
   - Group by work mode when helpful

4. **Attention Required** (blockers, risks, decisions)
   - Blocked items and what's needed to unblock
   - Active risks and mitigation suggestions
   - Pending decisions or requirements

5. **This Week's Outlook** (forward-looking context)
   - Upcoming milestones
   - Tasks due in next 7 days
   - Momentum assessment

Never output JSON - deliver polished Markdown only.`;
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
- Decisions: ${briefData.decisions.length}

`;

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

		// Outputs in Flight
		const activeOutputs = briefData.outputs.filter((o) => o.state !== 'published');
		if (activeOutputs.length > 0) {
			prompt += `## Outputs in Progress\n`;
			for (const output of activeOutputs.slice(0, 5)) {
				prompt += formatOutput(output) + '\n';
			}
			if (activeOutputs.length > 5) {
				prompt += `... and ${activeOutputs.length - 5} more outputs\n`;
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

		// Decisions
		if (briefData.decisions.length > 0) {
			prompt += `## Recent Decisions\n`;
			const recentDecisions = [...briefData.decisions]
				.filter((d) => d.decision_at !== null)
				.sort(
					(a, b) =>
						parseISO(b.decision_at!).getTime() - parseISO(a.decision_at!).getTime()
				);
			for (const decision of recentDecisions.slice(0, 5)) {
				prompt += `- ${decision.title}\n`;
			}
			prompt += '\n';
		}

		// Recent Updates
		const totalUpdates =
			briefData.recentUpdates.tasks.length +
			briefData.recentUpdates.goals.length +
			briefData.recentUpdates.outputs.length +
			briefData.recentUpdates.documents.length;

		if (totalUpdates > 0) {
			prompt += `## Recent Activity (Last 24h)\n`;
			prompt += `- ${briefData.recentUpdates.tasks.length} tasks updated\n`;
			prompt += `- ${briefData.recentUpdates.goals.length} goals with activity\n`;
			prompt += `- ${briefData.recentUpdates.outputs.length} outputs updated\n`;
			prompt += `- ${briefData.recentUpdates.documents.length} documents updated\n`;
			prompt += '\n';
		}

		// Project Summaries
		prompt += `## Project Details\n`;
		for (const project of briefData.projects) {
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
Write the analysis following the system instructions.
Focus on strategic alignment and actionable recommendations.
Reference specific projects, goals, outputs, and tasks by name.`;

		return prompt;
	}
}

// ============================================================================
// EXECUTIVE SUMMARY PROMPT
// ============================================================================

export class OntologyExecutiveSummaryPrompt {
	static getSystemPrompt(): string {
		return `You are a BuildOS productivity strategist writing an executive summary for a goal-oriented daily brief.

Your goals:
- Synthesize the user's day into a clear, strategic overview
- Lead with goal alignment - are daily activities moving toward objectives?
- Highlight outputs being produced and their strategic importance
- Surface critical blockers and risks that need immediate attention
- Keep summary scannable and action-oriented

Structure (200 words max):

**IMPORTANT: Do not include a heading with the date or "Daily Brief" prefix - start directly with the overview.**

1. **Strategic Overview** (2-3 sentences)
   - Type of day (execution-heavy, planning, review, mixed)
   - Goal alignment assessment
   - Any critical concerns

2. **Key Focus Areas** (3-5 bullets)
   - Most impactful tasks for goal progress
   - Unblocking work that enables others
   - Outputs needing attention

3. **Watch Points** (1-2 sentences)
   - Active risks or blockers
   - Decisions needed

4. **Momentum Note** (1 sentence)
   - Progress acknowledgment or forward look

Guidelines:
- Reference specific goals and outputs by name
- Be direct about misalignment or concerns
- Prioritize strategic impact over task volume
- Use active, confident language
- No placeholders - only reference actual data`;
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

		const activeOutputs = briefData.outputs.filter((o) => o.state !== 'published');

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
- Decisions: ${briefData.decisions.length}

## Goal Status
- Active Goals: ${activeGoals.length}
- On Track: ${goalsOnTrack}
- At Risk: ${goalsAtRisk}

## Output Status
- Active Outputs: ${activeOutputs.length}

## Risks
- Active Risks: ${briefData.risks.length}

`;

		// Requirements & decisions (brief)
		if (briefData.requirements.length > 0 || briefData.decisions.length > 0) {
			prompt += `## Requirements & Decisions\n`;
			if (briefData.requirements.length > 0) {
				prompt += `- Requirements: ${briefData.requirements
					.slice(0, 3)
					.map((r) => r.text)
					.join('; ')}\n`;
			}
			if (briefData.decisions.length > 0) {
				const recentDecisions = [...briefData.decisions]
					.filter((d) => d.decision_at !== null)
					.sort(
						(a, b) =>
							parseISO(b.decision_at!).getTime() - parseISO(a.decision_at!).getTime()
					);
				prompt += `- Recent decisions: ${recentDecisions
					.slice(0, 3)
					.map((d) => d.title)
					.join('; ')}\n`;
			}
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

		// Add output details
		if (activeOutputs.length > 0) {
			prompt += `## Active Outputs\n`;
			for (const output of activeOutputs.slice(0, 3)) {
				prompt += formatOutput(output) + '\n';
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
Write a 200-word executive summary following the system instructions.
Focus on strategic alignment and what matters most today.
Reference specific projects, goals, and tasks by name using the detailed briefs above.`;

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
		return `You are a BuildOS productivity strategist writing a project-specific daily brief.

Focus on:
- Goal progress within this project
- Outputs being produced
- Today's tasks and their strategic alignment
- Blockers and risks specific to this project
- Next steps and upcoming milestones

Structure:
1. **Project Status** (1-2 sentences on overall health)
2. **Goal Progress** (brief update on each active goal)
3. **Today's Work** (prioritized tasks)
4. **Blockers & Risks** (if any)
5. **Next Steps** (immediate actions)

Keep it concise (150 words max). Use Markdown formatting.`;
	}

	static buildUserPrompt(input: ProjectBriefPromptInput): string {
		const { date, timezone, project } = input;

		let prompt = `Generate a project brief for: ${project.project.name}

Date: ${date}
Timezone: ${timezone}

## Project Info
- State: ${project.project.state_key}
- Type: ${project.project.type_key}
${project.project.description ? `- Description: ${project.project.description}` : ''}

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

		// Outputs
		if (project.outputs.length > 0) {
			const activeOutputs = project.outputs.filter((o) => o.state !== 'published');
			if (activeOutputs.length > 0) {
				prompt += `\n## Active Outputs\n`;
				for (const output of activeOutputs) {
					prompt += formatOutput(output) + '\n';
				}
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

		prompt += `
Write a concise project brief (150 words max) following the system instructions.`;

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
2. Leading with GOAL progress - show them where they stand on their objectives
3. Highlighting outputs in progress that may need attention
4. Surfacing any active risks or blockers
5. Making it easy to jump back in with clear next actions

Structure:
- Start with a warm, brief greeting
- Show goal status (what's on track, what needs attention)
- Mention key outputs in progress
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

## Goal Status
- Active Goals: ${activeGoals.length}
- Goals at Risk: ${goalsAtRisk.length}

`;

		// Goal details
		if (activeGoals.length > 0) {
			prompt += `## Goal Progress\n`;
			for (const goal of activeGoals) {
				prompt += formatGoalProgress(goal) + '\n';
			}
			prompt += '\n';
		}

		// Active outputs
		const activeOutputs = briefData.outputs.filter((o) => o.state !== 'published');
		if (activeOutputs.length > 0) {
			prompt += `## Outputs in Progress\n`;
			for (const output of activeOutputs.slice(0, 3)) {
				prompt += formatOutput(output) + '\n';
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
Lead with goal progress and make it easy to jump back in.`;

		return prompt;
	}
}
