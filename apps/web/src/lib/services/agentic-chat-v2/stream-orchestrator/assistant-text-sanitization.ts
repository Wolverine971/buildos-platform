// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/assistant-text-sanitization.ts
const SCRATCHPAD_SENTENCE_PATTERNS = [
	/\bfunction_call\b/i,
	/<\s*xai:function_call\b/i,
	/\bcall\s+(?:a\s+)?tool\b/i,
	/\b[a-z][a-z0-9_]*\s*\(\s*\{?/i,
	/\b(?:op|input|path|query)\s*[:=]/i,
	/"(?:op|input|args|path|query)"\s*:/i,
	/^\s*(?:no\b|no,\s*wait\b|actually\b|correct(?:\s+that)?\b|better\b|to be safe\b|yes\.)/i,
	/^\s*(?:from|since)\b/i,
	/^\s*guidelines\b/i,
	/\bargs?\s+need\b/i,
	/\bfetch\s+schema\b/i,
	/\bthe user's question\b/i,
	/\bthe last assistant message\b/i,
	/\bthe drafted response\b/i,
	/\bmy output should be\b/i,
	/\bthe task is to generate the next response\b/i,
	/\bthe prompt is set up\b/i,
	/\bthe input is the full history\b/i,
	/\blooking back,\s*the conversation flow\b/i,
	/\brespond as if this is the continuation\b/i,
	/\binternal thought\b/i,
	/^\s*(?:human|assistant|system)\s*:/i,
	/^\s*<[^>]+>\s*$/i,
	/^\s*(?:onto|cal|util)\.[a-z0-9_]+(?:\.[a-z0-9_]+){1,6}\s*$/i
];

const USER_FACING_LEAD_IN_PATTERNS = [
	/^(?:i'll|i will|let me|i can|i'm going to|first,\s*i'll)\b/i
];

export function sanitizeToolPassLeadIn(raw: string, message: string): string {
	const trimmed = raw.trim();
	if (!trimmed) {
		return '';
	}

	const cleanSentences = extractCleanAssistantSentences(trimmed);
	const preferredLeadIn =
		cleanSentences.find((sentence) =>
			USER_FACING_LEAD_IN_PATTERNS.some((pattern) => pattern.test(sentence))
		) ?? cleanSentences[0];

	if (preferredLeadIn) {
		return preferredLeadIn;
	}

	return buildGenericToolLeadIn(message);
}

export function sanitizeAssistantFinalText(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) {
		return '';
	}

	if (!containsScratchpadMarkers(trimmed)) {
		return trimmed;
	}

	const cleanSentences = extractCleanAssistantSentences(trimmed);
	if (cleanSentences.length === 0) {
		return '';
	}

	return cleanSentences.join('\n\n');
}

function buildGenericToolLeadIn(message: string): string {
	const normalizedMessage = message.trim().toLowerCase();
	if (normalizedMessage.includes('calendar') || normalizedMessage.includes('event')) {
		return "I'll check BuildOS and the relevant calendar details.";
	}
	if (normalizedMessage.includes('project')) {
		return "I'll look that up in BuildOS and gather the relevant project details.";
	}
	if (normalizedMessage.includes('task')) {
		return "I'll look that up in BuildOS and gather the relevant task details.";
	}
	return "I'll look that up in BuildOS and gather the relevant details.";
}

function containsScratchpadMarkers(raw: string): boolean {
	return splitAssistantTextIntoSentences(raw).some((sentence) =>
		looksLikeScratchpadSentence(sentence)
	);
}

function extractCleanAssistantSentences(raw: string): string[] {
	const sentences = splitAssistantTextIntoSentences(raw);
	const cleanSentences: string[] = [];
	const seen = new Set<string>();

	for (const sentence of sentences) {
		if (looksLikeScratchpadSentence(sentence)) {
			continue;
		}

		const normalized = normalizeAssistantSentence(sentence);
		if (!normalized || normalized.length < 8) {
			continue;
		}
		if (seen.has(normalized)) {
			continue;
		}

		seen.add(normalized);
		cleanSentences.push(normalized);
	}

	return cleanSentences;
}

function splitAssistantTextIntoSentences(raw: string): string[] {
	return raw
		.replace(/\r/g, '\n')
		.split(/\n+/)
		.flatMap((line) =>
			line
				.split(/(?<=[.!?])\s+(?=(?:[A-Z0-9"'`<{]|Let me|I'll|I can|I will|Actually|No))/)
				.map((segment) => segment.trim())
		)
		.filter((segment) => segment.length > 0);
}

function normalizeAssistantSentence(sentence: string): string {
	return sentence.replace(/\s+/g, ' ').trim();
}

function looksLikeScratchpadSentence(sentence: string): boolean {
	const normalized = normalizeAssistantSentence(sentence);
	if (!normalized) {
		return true;
	}

	if (SCRATCHPAD_SENTENCE_PATTERNS.some((pattern) => pattern.test(normalized))) {
		return true;
	}

	if (
		/\b(?:prompt|history|conversation)\b/i.test(normalized) &&
		/\b(?:next turn|continuation|tool calls?|last assistant message|user's question)\b/i.test(
			normalized
		)
	) {
		return true;
	}

	if (
		/\b(?:human|assistant|system)\b/i.test(normalized) &&
		/\b(?:prompt|history|conversation|tool calls?)\b/i.test(normalized)
	) {
		return true;
	}

	if (
		normalized.toLowerCase().includes('schema') &&
		(/(?:^from\b|^since\b|^fetch\b)/i.test(normalized) ||
			/\b(?:tool_|onto\.|cal\.|util\.)/i.test(normalized))
	) {
		return true;
	}

	if ((normalized.includes('{') || normalized.includes('}')) && normalized.includes(':')) {
		return true;
	}

	if (/^(?:onto|cal|util)\./i.test(normalized)) {
		return true;
	}

	if (/^[<{[]/.test(normalized)) {
		return true;
	}

	return false;
}
