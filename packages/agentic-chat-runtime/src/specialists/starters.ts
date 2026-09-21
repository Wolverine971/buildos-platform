// packages/agentic-chat-runtime/src/specialists/starters.ts
import { createSpecialistWorkbenchDraftV1, type SpecialistWorkbenchDraftV1 } from './workbench';

export const SPECIALIST_STARTERS_V1 = [
	{
		id: 'document_organizer',
		name: 'Document organizer',
		description: 'Structure knowledge and find useful missing documents.'
	},
	{
		id: 'project_planner',
		name: 'Planning analyst',
		description: 'Sequence work, identify dependencies, and propose the next milestone.'
	},
	{
		id: 'risk_reviewer',
		name: 'Risk reviewer',
		description: 'Stress-test assumptions and recommend practical mitigations.'
	}
] as const;

/** Unsaved examples to customize. No publication, network access, or additional authority. */
export function createSpecialistStarterDraftV1(id: string): SpecialistWorkbenchDraftV1 {
	const base = createSpecialistWorkbenchDraftV1();
	if (id === 'document_organizer') return base;
	if (id === 'project_planner')
		return {
			...base,
			name: 'Planning analyst',
			description:
				'Turns saved project context into a sequenced plan with dependencies and a clear next milestone.',
			expertise: ['project planning', 'dependencies', 'milestone design'],
			instructions:
				'Assess the current project and answer the planning question. Separate committed work from proposals. Identify dependencies, uncertainty, and the smallest useful next milestone. Never invent dates, owners, progress, or external evidence. Explain what would change the plan. Do not claim proposed tasks were created.',
			assignment:
				'Recommend a practical sequence of next steps, identify blockers, and define evidence that the next milestone is complete.',
			knowledge: [
				{
					id: 'planning-principles',
					title: 'Planning principles',
					text: 'Sequence work by dependency and uncertainty. Prefer a small milestone that tests the main assumption. Distinguish prerequisites from nice-to-haves. Explicitly label proposed owners and estimates. Missing evidence is a question to resolve, not a fact to invent.'
				}
			],
			examples: [
				{
					id: 'next-milestone',
					question:
						'What is the next useful milestone for this project, and what needs to happen first?',
					requiresDocumentRead: false
				},
				{
					id: 'plan-evidence',
					question:
						'Read the saved project plan and identify dependencies or sequencing problems.',
					requiresDocumentRead: true
				}
			]
		};
	if (id === 'risk_reviewer')
		return {
			...base,
			name: 'Risk reviewer',
			description:
				'Finds unsupported assumptions, delivery risks, and practical mitigations in saved project evidence.',
			expertise: ['assumption testing', 'delivery risk', 'evidence review'],
			instructions:
				'Answer the risk question using saved project evidence. Distinguish observed issues from hypothetical risks. Rank risks by impact and supporting evidence without fabricating numeric probabilities. For each material risk, suggest an early warning signal and a proportionate mitigation. Do not claim the mitigation was applied.',
			assignment:
				'Identify the most consequential assumptions and risks, explain supporting evidence and uncertainty, and propose concrete checks or mitigations.',
			knowledge: [
				{
					id: 'risk-principles',
					title: 'Risk review principles',
					text: 'A useful risk has a cause, possible consequence, and observable warning signal. Missing evidence is not proof of failure. Prioritize assumptions that could invalidate the plan. Prefer inexpensive checks that reduce uncertainty before irreversible commitments.'
				}
			],
			examples: [
				{
					id: 'assumptions',
					question: 'Which assumptions in this project should we test first?',
					requiresDocumentRead: false
				},
				{
					id: 'risk-evidence',
					question:
						'Read the saved launch plan and identify the biggest risks and missing evidence.',
					requiresDocumentRead: true
				}
			]
		};
	throw new Error('Unknown specialist starter');
}
