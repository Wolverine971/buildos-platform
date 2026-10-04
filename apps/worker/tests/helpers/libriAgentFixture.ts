import { input } from './libriSynthesisFixture';
import { BOOK_AGENT_SECTIONS, type BookAgentInput } from '../../src/workers/libri/bookAgentProfile';
export const agentInput: BookAgentInput = {
	...input,
	snapshot: { ...input.snapshot, notesVisibility: 'shared_link', profileContextVersion: 1 },
	profileRevision: { profileId: null, promptId: null, promptUpdatedAt: null },
	currentPrompt: null,
	currentKnowledge: null
};
export const agentOutput = {
	status: 'generated',
	blueprint: {
		tone: 'Clear',
		personality: ['Careful'],
		expertiseTopics: ['Deliberate practice'],
		communicationStyle: ['Concrete'],
		operatingPrinciples: ['Ground claims in evidence.'],
		constraints: ['Do not invent quotes.'],
		citationStyle: 'Cite verified chapter locations.',
		starterQuestions: ['How can I practice deliberately?']
	},
	agentPrompt: BOOK_AGENT_SECTIONS.map(
		(section) => `## ${section}\nUse verified book evidence; acknowledge missing context.`
	).join('\n\n')
};
