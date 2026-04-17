// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/assistant-text-sanitization.ts
//
// Two families of scratchpad leakage are handled here:
//   1. Legacy / generic scratchpad (tool_call echoes, "actually, wait", etc.)
//   2. Grok-4.1-fast prompt-section mirroring observed in the 2026-04-17
//      consolidation replay, where the model restated prompt section headers
//      ("Final-response rules:", "Operating Strategy:") and narrated the
//      ledger/prompt contents as its own plan before writing the real reply.
const SCRATCHPAD_SENTENCE_PATTERNS = [
	// Tool-call / schema echoes
	/\bfunction_call\b/i,
	/<\s*xai:function_call\b/i,
	/\bcall\s+(?:a\s+)?tool\b/i,
	/\b[a-z][a-z0-9_]*\s*\(\s*\{?/i,
	/\b(?:op|input|path|query)\s*[:=]/i,
	/"(?:op|input|args|path|query)"\s*:/i,
	// Self-correction lead-ins
	/^\s*(?:no\b|no,\s*wait\b|actually\b|correct(?:\s+that)?\b|better\b|to be safe\b|yes\.)/i,
	/^\s*(?:from|since)\b/i,
	/^\s*guidelines\b/i,
	/\bargs?\s+need\b/i,
	/\bfetch\s+schema\b/i,
	// Meta-narration about the prompt/conversation
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
	/^\s*(?:onto|cal|util)\.[a-z0-9_]+(?:\.[a-z0-9_]+){1,6}\s*$/i,
	// Grok-style prompt-section mirroring — sentences that restate a prompt
	// header as if the model were narrating its plan. These must be tight
	// enough not to catch legitimate responses that mention "rules" in passing.
	/^\s*final[-\s]response rules\s*:/i,
	/^\s*operating strategy\s*:/i,
	/^\s*safety and data rules\s*:/i,
	/^\s*communication pattern\s*:/i,
	/^\s*entity resolution order\s*:/i,
	/^\s*how to pick a skill\s*:/i,
	/^\s*response (?:should|structure)\s*:/i,
	/^\s*response (?:should|structure)\b/i,
	/^\s*final response structure\s*:/i,
	/^\s*follow additional instructions\b/i,
	/^\s*this is (?:a )?(?:post|pre)[-\s]tool\b/i,
	/^\s*the tool call (?:succeeded|failed|returned)\b/i,
	/^\s*counts? include\b/i,
	/^\s*in (?:my|the) tool call\b/i,
	/^\s*in the (?:human|user) message\b/i,
	/^\s*lead[-\s]in was\b/i,
	/^\s*no more tool calls\b/i,
	/^\s*ground(?:ing|ed)? (?:in|the response)\b/i,
	/^\s*mention every (?:successful)? ?writ/i,
	/^\s*do not claim (?:anything|task progress|document type|tree placement|linking|any state_key|any type_key)\b/i,
	/^\s*disclose (?:each|every) failed\b/i,
	/^\s*use (?:this|the) ledger\b/i,
	/^\s*keep (?:it|the response) (?:proactive|direct|useful|user-facing)\b/i,
	/^\s*write ledger\b/i,
	/^\s*<write_ledger\b/i,
	/^\s*successful[_\s]writes\s*:/i,
	/^\s*failed[_\s]writes\s*:/i
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

function stripLeadingListMarker(value: string): string {
	// Strip a single leading list marker (`- `, `* `, `+ `, `1.`, `1)`, `(1)`)
	// before scratchpad pattern matching. Grok frequently emits bulleted
	// scratchpad lines ("- Mention every Successful write...", "- Operating
	// Strategy...") and the patterns anchor on the meaningful prefix that
	// follows the bullet, not on the bullet itself.
	return value.replace(/^\s*(?:[-*+]\s+|\(?\d+[.)]\s+)/, '');
}

function looksLikeScratchpadSentence(sentence: string): boolean {
	const normalized = normalizeAssistantSentence(sentence);
	if (!normalized) {
		return true;
	}

	const deBulleted = stripLeadingListMarker(normalized);

	if (
		SCRATCHPAD_SENTENCE_PATTERNS.some(
			(pattern) => pattern.test(normalized) || pattern.test(deBulleted)
		)
	) {
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
