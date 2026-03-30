// apps/web/src/lib/services/agentic-chat/tools/skills/forecast.skill.ts
import type { SkillDefinition } from './types';

export const workflowForecastSkill: SkillDefinition = {
	path: 'workflow.forecast.skill',
	id: 'workflow_forecast',
	name: 'workflow forecast',
	summary:
		'Project forecast playbook for estimating likely timeline outcomes, identifying schedule risk, and stating assumptions and confidence clearly.',
	relatedOps: [
		'onto.project.graph.get',
		'onto.task.list',
		'onto.plan.list',
		'onto.milestone.list',
		'onto.goal.list',
		'onto.risk.list',
		'cal.event.list'
	],
	whenToUse: [
		'Forecast whether a project is on track',
		'Establish likely schedule risk or slippage',
		'Estimate what is most likely to happen next',
		'Connect blocked work, upcoming milestones, and risks into a timeline view',
		'Provide a forward-looking assessment rather than a static status summary'
	],
	workflow: [
		'Start from a concrete project scope and gather the main schedule anchors: task dates, plan states, milestone due dates, unresolved risks, and upcoming calendar commitments.',
		'Distinguish hard facts from assumptions before forecasting.',
		'Look for leading indicators such as blocked critical tasks, missing owners, missing dates, overloaded near-term schedules, or milestone work with no supporting execution.',
		'Use targeted reads when key schedule fields are absent from the snapshot or when the user asks for a wider date range.',
		'State the forecast as a likely outcome with assumptions and confidence, not as certainty.',
		'If dates are sparse, forecast directionally instead of inventing precise deadlines.',
		'Separate what is likely to slip from what is merely at risk.',
		'End with the smallest set of actions that would improve the forecast materially.'
	],
	guardrails: [
		'Do not invent dates, durations, or dependencies that were not observed or clearly inferred.',
		'Do not present a forecast as certainty when the schedule data is thin.',
		'Keep confidence proportional to evidence.',
		'Forecasting is analysis by default; do not make write changes unless the user explicitly asks for them.'
	],
	examples: [
		{
			description: 'Forecast whether a milestone is likely to land on time',
			next_steps: [
				'Inspect the supporting tasks, plan state, unresolved risks, and upcoming calendar commitments.',
				'Identify what work is on the critical path versus merely related.',
				'State the likely outcome, the assumptions behind it, and the biggest drivers of uncertainty.'
			]
		},
		{
			description: 'Estimate near-term project slippage risk',
			next_steps: [
				'Read active tasks, blocked work, near-term milestones, and open risks.',
				'Use calendar reads if work sessions or deadlines outside the context window matter.',
				'Present the forecast with explicit confidence and the top corrective actions.'
			]
		}
	],
	notes: [
		'Forecasts are forward-looking judgments built on current evidence, not guarantees.',
		'When evidence is thin, a narrow, honest forecast is better than a precise but fabricated one.'
	]
};
