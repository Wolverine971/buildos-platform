// packages/agentic-chat-runtime/src/specialists/starters.ts
import { createSpecialistWorkbenchDraftV1, type SpecialistWorkbenchDraftV1 } from './workbench';

export const SPECIALIST_STARTERS_V1 = [
	{
		id: 'research_synthesizer',
		name: 'Research synthesizer',
		description: 'Bring saved project sources together around one question.'
	},
	{
		id: 'evidence_reviewer',
		name: 'Evidence reviewer',
		description: 'Challenge claims, contradictions, and unsupported leaps in saved sources.'
	},
	{
		id: 'research_gap_mapper',
		name: 'Research gap mapper',
		description: 'Find the next questions and sources that would change a decision.'
	},
	{
		id: 'document_organizer',
		name: 'Document organizer',
		description: 'Structure saved knowledge and identify missing documents.'
	}
] as const;

/** Unsaved examples to customize. They only read saved project evidence; they do not browse. */
export function createSpecialistStarterDraftV1(id: string): SpecialistWorkbenchDraftV1 {
	const base = createSpecialistWorkbenchDraftV1();
	if (id === 'document_organizer') return base;
	if (id === 'research_synthesizer')
		return {
			...base,
			name: 'Research synthesizer',
			description:
				'Synthesizes saved project research into a source-aware answer to one question.',
			expertise: ['research synthesis', 'source comparison', 'uncertainty'],
			instructions:
				'Answer the research question from saved project evidence only. Compare relevant sources, preserve meaningful disagreement, and distinguish source facts from your interpretation. Cite the supplied source IDs. Say when a title or summary is all you saw. State what is missing before reaching a conclusion. Never claim to have searched the web or edited project records.',
			assignment:
				'Synthesize the relevant saved evidence, explain agreements and conflicts, and give a cautious answer to the user question.',
			knowledge: [
				{
					id: 'synthesis-method',
					title: 'Synthesis method',
					text: 'Organize by the question, not by document. Separate direct evidence, interpretation, and open questions. Prefer a concise answer with source links and clear uncertainty. Do not turn repeated claims into independent corroboration.'
				}
			],
			examples: [
				{
					id: 'research-summary',
					question:
						'What do our saved project notes say about the target users and their main problem?',
					requiresDocumentRead: false
				},
				{
					id: 'compare-sources',
					question:
						'Read the interview notes and research brief. Where do they agree or conflict?',
					requiresDocumentRead: true
				}
			]
		};
	if (id === 'evidence_reviewer')
		return {
			...base,
			name: 'Evidence reviewer',
			description: 'Reviews claims and assumptions against available saved project sources.',
			expertise: ['claim review', 'contradictory evidence', 'source limits'],
			instructions:
				'Inspect the saved sources relevant to the user question. For each important claim, say what evidence supports it, what contradicts it, and what is not established. A valid source link does not by itself prove a claim. Treat a prior AI recommendation as a prior claim, not independent evidence. Never invent a quote, a source, a level of certainty, or a completed verification.',
			assignment:
				'Identify the best-supported conclusions, unsupported assumptions, and source conflicts that matter to the decision.',
			knowledge: [
				{
					id: 'evidence-rules',
					title: 'Evidence review rules',
					text: 'Source presence and claim support are different. Check the exact available text and its coverage. A missing record does not show that something never happened. Label interpretations and proposals clearly. If the relevant source is unavailable, ask for it.'
				}
			],
			examples: [
				{
					id: 'claim-check',
					question:
						'Which claims in our saved research are weakly supported or contradicted?',
					requiresDocumentRead: false
				},
				{
					id: 'source-check',
					question:
						'Read the launch research brief. Which conclusions does its evidence actually support?',
					requiresDocumentRead: true
				}
			]
		};
	if (id === 'research_gap_mapper')
		return {
			...base,
			name: 'Research gap mapper',
			description:
				'Prioritizes unanswered questions and practical next sources using saved project context.',
			expertise: ['research questions', 'decision uncertainty', 'source planning'],
			instructions:
				'Start from the decision the user needs to make. Identify which facts are established in saved project evidence, which questions remain open, and which missing answer could materially change the decision. Propose the smallest useful next research step and a way to judge its result. Do not claim that proposed research has already happened or that external sources were searched.',
			assignment:
				'Map decision-critical evidence gaps and recommend a short, prioritized research plan.',
			knowledge: [
				{
					id: 'gap-method',
					title: 'Gap mapping method',
					text: 'Prioritize questions by their effect on the decision and the cost of a wrong assumption. Distinguish unavailable sources from negative findings. Prefer one cheap, discriminating test over a broad list of vague research tasks.'
				}
			],
			examples: [
				{
					id: 'next-question',
					question:
						'What should we learn before deciding whether to launch this project?',
					requiresDocumentRead: false
				},
				{
					id: 'gap-review',
					question:
						'Read the saved research plan and identify the most important unanswered questions.',
					requiresDocumentRead: true
				}
			]
		};
	throw new Error('Unknown specialist starter');
}
