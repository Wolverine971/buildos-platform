// apps/web/src/lib/services/smart-llm/response-parsing.ts

import type { OpenRouterResponse } from './types';

const HIDDEN_CONTENT_TYPES = new Set(['reasoning', 'analysis', 'thinking', 'system']);

function isHiddenContentPartType(type: unknown): boolean {
	return typeof type === 'string' && HIDDEN_CONTENT_TYPES.has(type.toLowerCase());
}

function normalizeVisibleTextChunk(text: string): string {
	return text
		.replace(/[\u3164\u200B\uFEFF]/g, '')
		.replace(/\u00A0/g, ' ')
		.replace(/\r\n?/g, '\n');
}

export function coerceContentToString(content: unknown): string | null {
	if (content === undefined || content === null) {
		return null;
	}

	if (typeof content === 'string') {
		return content;
	}

	if (Array.isArray(content)) {
		const parts: string[] = [];

		for (const part of content) {
			if (typeof part === 'string') {
				parts.push(part);
				continue;
			}

			if (!part || typeof part !== 'object') {
				continue;
			}

			const partValue = part as {
				type?: string;
				text?: string | { value?: string };
				value?: string;
				content?: string;
			};
			if (isHiddenContentPartType(partValue.type)) {
				continue;
			}

			if (typeof partValue.text === 'string') {
				parts.push(partValue.text);
			} else if (partValue.text && typeof partValue.text.value === 'string') {
				parts.push(partValue.text.value);
			} else if (typeof partValue.value === 'string') {
				parts.push(partValue.value);
			} else if (typeof partValue.content === 'string') {
				parts.push(partValue.content);
			}
		}

		return parts.join('');
	}

	if (content && typeof content === 'object') {
		const partValue = content as {
			type?: string;
			text?: string | { value?: string };
			value?: string;
			content?: string;
		};
		if (isHiddenContentPartType(partValue.type)) {
			return null;
		}

		if (typeof partValue.text === 'string') {
			return partValue.text;
		}
		if (partValue.text && typeof partValue.text.value === 'string') {
			return partValue.text.value;
		}
		if (typeof partValue.value === 'string') {
			return partValue.value;
		}
		if (typeof partValue.content === 'string') {
			return partValue.content;
		}
	}

	return null;
}

export function sanitizeVisibleText(text: string): { text: string } {
	const state = createThinkingTokenState();
	const visible = filterThinkingTokens(normalizeVisibleTextChunk(text), state).text;
	return { text: visible + flushThinkingTokens(state) };
}

export function extractVisibleText(content: unknown): string | null {
	const raw = coerceContentToString(content);
	if (raw === null) {
		return null;
	}

	return sanitizeVisibleText(raw).text;
}

export function extractTextFromChoice(choice?: OpenRouterResponse['choices'][0]): string | null {
	if (!choice) {
		return null;
	}

	const messageContent = extractVisibleText(choice.message?.content);
	if (messageContent !== null && messageContent.trim().length > 0) {
		return messageContent;
	}

	const choiceText =
		typeof choice.text === 'string' ? sanitizeVisibleText(choice.text).text : null;
	if (choiceText !== null) {
		return choiceText;
	}

	return messageContent;
}

export function enhanceSystemPromptForJSON(originalPrompt: string): string {
	const jsonInstructions = `
You must respond with valid JSON only. Follow these rules:
1. Output ONLY valid JSON - no text before or after
2. Ensure all strings are properly escaped
3. Use null for missing values, not undefined
4. Numbers should not be quoted unless they're meant to be strings
5. Boolean values should be true/false (lowercase, not quoted)
6. CRITICAL: NO trailing commas after the last item in objects or arrays

`;
	return jsonInstructions + originalPrompt;
}

export function cleanJSONResponse(raw: string): string {
	// Remove markdown code blocks if present
	let cleaned = raw.trim();
	if (cleaned.startsWith('```json')) {
		cleaned = cleaned.slice(7);
	}
	if (cleaned.startsWith('```')) {
		cleaned = cleaned.slice(3);
	}
	if (cleaned.endsWith('```')) {
		cleaned = cleaned.slice(0, -3);
	}

	// Remove any non-JSON prefix
	const jsonStart = cleaned.indexOf('{');
	if (jsonStart > 0) {
		cleaned = cleaned.slice(jsonStart);
	}

	// Remove any non-JSON suffix
	const jsonEnd = cleaned.lastIndexOf('}');
	if (jsonEnd > -1 && jsonEnd < cleaned.length - 1) {
		cleaned = cleaned.slice(0, jsonEnd + 1);
	}

	// Fix common LLM JSON errors
	// Remove trailing commas before closing braces/brackets (e.g., {key: "value",} -> {key: "value"})
	cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

	return cleaned.trim();
}

export function normalizeStreamingContent(
	content: unknown,
	state: ThinkingTokenState
): { text: string } {
	const textParts: string[] = [];

	const pushText = (value?: string) => {
		if (value) {
			textParts.push(value);
		}
	};

	const handleContentPart = (part: any) => {
		if (!part) return;

		if (typeof part === 'string') {
			pushText(part);
			return;
		}

		if (typeof part === 'object') {
			const type = typeof part.type === 'string' ? part.type.toLowerCase() : '';
			if (type && ['reasoning', 'analysis', 'thinking', 'system'].includes(type)) {
				return;
			}

			if (typeof part.text === 'string') {
				pushText(part.text);
			} else if (part.text && typeof part.text.value === 'string') {
				pushText(part.text.value);
			} else if (typeof part.value === 'string') {
				pushText(part.value);
			}
		}
	};

	if (Array.isArray(content)) {
		content.forEach(handleContentPart);
	} else if (typeof content === 'string') {
		pushText(content);
	} else if (typeof content === 'object' && content !== null) {
		handleContentPart(content);
	}

	if (textParts.length === 0) {
		return { text: '' };
	}

	return filterThinkingTokens(normalizeVisibleTextChunk(textParts.join('')), state);
}

export type ThinkingTokenState = {
	phase: 'start' | 'in_block' | 'visible';
	pending: string;
	closingTag: string;
	trimLeadingWhitespace: boolean;
};

export function createThinkingTokenState(): ThinkingTokenState {
	return { phase: 'start', pending: '', closingTag: '', trimLeadingWhitespace: false };
}

const LEADING_REASONING_TAGS = ['think', 'thinking', 'reasoning', 'analysis'].map((tag) => ({
	open: `<${tag}>`,
	close: `</${tag}>`
}));

/**
 * Decode the provider's inline reasoning wire format at content offset 0 only,
 * allowing leading whitespace. This does not classify what prose means. It can
 * misfire when an answer literally opens with one of these four tags; once any
 * visible content starts, later tags are always passed through unchanged.
 * The caller owns one mutable state per stream and flushes it at end of stream.
 */
export function filterThinkingTokens(text: string, state: ThinkingTokenState): { text: string } {
	if (state.phase === 'start') {
		state.pending += text;
		const candidate = state.pending.trimStart();
		const opening = LEADING_REASONING_TAGS.find(({ open }) => candidate.startsWith(open));
		if (opening) {
			state.phase = 'in_block';
			state.closingTag = opening.close;
			text = candidate.slice(opening.open.length);
			state.pending = '';
		} else if (LEADING_REASONING_TAGS.some(({ open }) => open.startsWith(candidate))) {
			return { text: '' };
		} else {
			state.phase = 'visible';
			text = state.pending;
			state.pending = '';
		}
	}

	if (state.phase === 'in_block') {
		const combined = state.pending + text;
		const closeAt = combined.indexOf(state.closingTag);
		if (closeAt === -1) {
			// Retain only enough to recognize a closing tag split across chunks.
			state.pending = combined.slice(-(state.closingTag.length - 1));
			return { text: '' };
		}
		text = combined.slice(closeAt + state.closingTag.length);
		state.pending = '';
		state.phase = 'visible';
		state.trimLeadingWhitespace = true;
	}

	if (state.trimLeadingWhitespace) {
		text = text.trimStart();
		if (text) state.trimLeadingWhitespace = false;
	}
	return { text };
}

/** Emit an undecided literal prefix, but never an unclosed reasoning block. */
export function flushThinkingTokens(state: ThinkingTokenState): string {
	const text = state.phase === 'start' ? state.pending : '';
	state.pending = '';
	state.phase = 'visible';
	state.trimLeadingWhitespace = false;
	return text;
}
