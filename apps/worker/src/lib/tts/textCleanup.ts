// apps/worker/src/lib/tts/textCleanup.ts
import { stripMarkdown } from '../utils/markdown';

const MAX_NARRATION_CHARS = 1800;

export interface BriefNarrationInput {
	briefDate: string;
	executiveSummary: string | null;
	llmAnalysis: string | null;
	priorityActions: string[] | null;
}

function normalizeForSpeech(text: string): string {
	return text
		.replace(/&/g, ' and ')
		.replace(/%/g, ' percent ')
		.replace(/@/g, ' at ')
		.replace(/[•·]/g, '. ')
		.replace(/[→⇒]/g, ' to ')
		.replace(/[←⇐]/g, ' from ')
		.replace(/[–—]/g, '-')
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/<[^>]*>/g, ' ')
		.replace(/\p{Extended_Pictographic}/gu, ' ')
		.replace(/\s+/g, ' ')
		.replace(/\s+([,.;:!?])/g, '$1')
		.trim();
}

function truncateAtSentence(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	const clipped = text.slice(0, maxChars);
	const sentenceEnd = Math.max(
		clipped.lastIndexOf('.'),
		clipped.lastIndexOf('!'),
		clipped.lastIndexOf('?')
	);

	if (sentenceEnd > Math.floor(maxChars * 0.7)) {
		return clipped.slice(0, sentenceEnd + 1).trim();
	}

	return `${clipped.replace(/\s+\S*$/, '').trim()}.`;
}

export function buildBriefNarrationText(input: BriefNarrationInput): string {
	const source = input.llmAnalysis || input.executiveSummary || '';
	const summary = normalizeForSpeech(stripMarkdown(source));
	const priorityActions = (input.priorityActions || [])
		.map((action) => normalizeForSpeech(stripMarkdown(action)))
		.filter((action) => action.length > 0);

	const sections = [`Daily brief for ${input.briefDate}.`, summary];
	if (priorityActions.length > 0) {
		sections.push(`Priority actions. ${priorityActions.join('. ')}.`);
	}

	const text = normalizeForSpeech(sections.filter(Boolean).join(' '));
	if (!text) {
		throw new Error('Brief has no narratable text');
	}

	return truncateAtSentence(text, MAX_NARRATION_CHARS);
}
