import type { SynthesisInput } from '../../src/workers/libri/bookSynthesis';
export const book = 'a0000000-0000-4000-8000-000000000001';
export const chapter = 'a0000000-0000-4000-8000-000000000002';
export const input: SynthesisInput = {
	dataset: {
		book: { id: book, title: 'Offline Book' },
		chapters: [
			{
				chapterId: chapter,
				number: '1',
				title: 'First',
				summary: 'A chapter about deliberate practice.',
				keyConcepts: ['practice']
			}
		],
		fragments: []
	},
	snapshot: { chapterCount: 1 },
	fingerprint: 'a'.repeat(64),
	currentAnalysis: null
};
export const analysis = {
	status: 'generated',
	overview: {
		elevatorPitch: 'Evidence-backed overview.',
		centralThesis: 'Practice matters.',
		contextAndScope: 'Learning',
		intendedAudience: 'Readers'
	},
	keyIdeas: [
		{
			ideaId: 'practice',
			title: 'Practice',
			description: 'Structured practice helps.',
			whyItMatters: 'Learning',
			confidence: 0.8,
			chapterRefs: [{ chapterId: chapter }]
		}
	],
	chapterInsights: [
		{ chapterId: chapter, contribution: 'Introduces practice.', keyIdeaIds: ['practice'] }
	],
	peopleMentioned: [],
	frameworkTerms: [],
	practicalTakeaways: ['Practice deliberately.'],
	discussionQuestions: ['How should practice be structured?'],
	blindSpots: []
};
