// apps/web/src/lib/services/agentic-chat-v2/prompt-builder.ts
import type { ChatContextType } from '@buildos/shared-types';

export const FAST_SYSTEM_PROMPT_VERSION = 'v2-fast-2026-02-06';

export type FastPromptContext = {
	contextType: ChatContextType;
	entityId?: string | null;
};

const SCOPE_HINTS: Partial<Record<ChatContextType, string>> = {
	global: 'General BuildOS assistant across projects and tasks.',
	project: 'Project-focused assistant. Ask for specific project details when needed.',
	ontology: 'Ontology-focused assistant. Ask for specific entity details when needed.',
	calendar: 'Calendar-focused assistant. Ask for dates or time constraints when needed.',
	project_create: 'Project creation assistant. Keep questions minimal and focused.'
};

export function normalizeFastContextType(input?: string): ChatContextType {
	if (!input) return 'global';
	if (input === 'general') return 'global';
	return input as ChatContextType;
}

export function buildFastSystemPrompt(context: FastPromptContext): string {
	const contextType = normalizeFastContextType(context.contextType);
	const scopeHint = SCOPE_HINTS[contextType] ?? 'Fast, general-purpose assistant.';
	const scopeLine = `Context: ${contextType}. ${scopeHint}`;

	return [
		'You are BuildOS Agentic Chat V2.',
		'Priorities: speed, clarity, correctness.',
		'Keep responses concise unless the user asks for depth.',
		'Ask at most one clarifying question if required to proceed.',
		'Do not claim to have executed tools or actions.',
		scopeLine,
		`System prompt version: ${FAST_SYSTEM_PROMPT_VERSION}`
	].join('\n');
}
