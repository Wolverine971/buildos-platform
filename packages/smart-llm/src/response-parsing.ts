// packages/smart-llm/src/response-parsing.ts

import type { OpenRouterResponse } from './types';

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
			const partType = typeof partValue.type === 'string' ? partValue.type.toLowerCase() : '';
			if (partType && ['reasoning', 'analysis', 'thinking', 'system'].includes(partType)) {
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
			text?: string | { value?: string };
			value?: string;
			content?: string;
		};

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

export function extractTextFromChoice(choice?: OpenRouterResponse['choices'][0]): string | null {
	if (!choice) {
		return null;
	}

	const messageContent = coerceContentToString(choice.message?.content);
	if (messageContent !== null && messageContent.trim().length > 0) {
		return messageContent;
	}

	const choiceText = typeof choice.text === 'string' ? choice.text : null;
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

type JSONStructureScan = {
	stack: Array<'{' | '['>;
	inString: boolean;
	currentStringStart: number;
	hasMismatchedClose: boolean;
};

function scanJSONStructure(input: string): JSONStructureScan {
	const stack: Array<'{' | '['> = [];
	let inString = false;
	let escapeNext = false;
	let currentStringStart = -1;
	let hasMismatchedClose = false;

	for (let i = 0; i < input.length; i++) {
		const char = input[i];

		if (inString) {
			if (escapeNext) {
				escapeNext = false;
				continue;
			}
			if (char === '\\') {
				escapeNext = true;
				continue;
			}
			if (char === '"') {
				inString = false;
				currentStringStart = -1;
			}
			continue;
		}

		if (char === '"') {
			inString = true;
			currentStringStart = i;
			continue;
		}

		if (char === '{' || char === '[') {
			stack.push(char);
			continue;
		}

		if (char === '}' || char === ']') {
			const open = stack.pop();
			const matches = (open === '{' && char === '}') || (open === '[' && char === ']');
			if (!matches) {
				hasMismatchedClose = true;
				break;
			}
		}
	}

	return { stack, inString, currentStringStart, hasMismatchedClose };
}

function collectCandidateCutPoints(input: string): number[] {
	const points = new Set<number>([input.length]);
	let inString = false;
	let escapeNext = false;

	for (let i = 0; i < input.length; i++) {
		const char = input[i];

		if (inString) {
			if (escapeNext) {
				escapeNext = false;
				continue;
			}
			if (char === '\\') {
				escapeNext = true;
				continue;
			}
			if (char === '"') {
				inString = false;
			}
			continue;
		}

		if (char === '"') {
			inString = true;
			continue;
		}

		if (char === ',' || char === ':') {
			points.add(i);
			points.add(i + 1);
			continue;
		}

		if (char === '{' || char === '[' || char === '}' || char === ']') {
			points.add(i + 1);
		}
	}

	return Array.from(points)
		.filter((value) => value > 0 && value <= input.length)
		.sort((a, b) => b - a);
}

function trimDanglingSeparators(value: string): string {
	let trimmed = value.trimEnd();
	while (trimmed.length > 0) {
		const lastChar = trimmed[trimmed.length - 1];
		if (lastChar === ',' || lastChar === ':') {
			trimmed = trimmed.slice(0, -1).trimEnd();
			continue;
		}
		break;
	}
	return trimmed;
}

function trimDanglingOpenContainers(value: string): string {
	let trimmed = value.trimEnd();
	while (trimmed.length > 1) {
		const lastChar = trimmed[trimmed.length - 1];
		if (lastChar === '{' || lastChar === '[') {
			trimmed = trimDanglingSeparators(trimmed.slice(0, -1));
			continue;
		}
		break;
	}
	return trimmed;
}

function buildRepairedCandidate(prefix: string): string | null {
	let working = prefix.trimEnd();
	if (!working) return null;
	if (!working.startsWith('{') && !working.startsWith('[')) return null;

	let scan = scanJSONStructure(working);
	if (scan.hasMismatchedClose) return null;
	if (scan.inString && scan.currentStringStart >= 0) {
		working = working.slice(0, scan.currentStringStart).trimEnd();
	}

	working = trimDanglingSeparators(working);
	working = trimDanglingOpenContainers(working);
	if (!working) return null;

	scan = scanJSONStructure(working);
	if (scan.hasMismatchedClose || scan.inString) return null;
	if (!working.startsWith('{') && !working.startsWith('[')) return null;

	let candidate = working;
	for (let i = scan.stack.length - 1; i >= 0; i--) {
		candidate += scan.stack[i] === '{' ? '}' : ']';
	}

	candidate = candidate.replace(/,(\s*[}\]])/g, '$1').trim();
	return candidate.length > 0 ? candidate : null;
}

export function repairTruncatedJSONResponse(raw: string): string | null {
	const input = raw.trim();
	if (!input) return null;
	if (!input.startsWith('{') && !input.startsWith('[')) return null;

	const candidateCutPoints = collectCandidateCutPoints(input).slice(0, 512);
	for (const cutPoint of candidateCutPoints) {
		const prefix = input.slice(0, cutPoint);
		const candidate = buildRepairedCandidate(prefix);
		if (!candidate) continue;
		try {
			JSON.parse(candidate);
			return candidate;
		} catch {
			continue;
		}
	}

	return null;
}

export function normalizeStreamingContent(
	content: unknown,
	inThinkingBlock: boolean
): { text: string; inThinkingBlock: boolean } {
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
		return { text: '', inThinkingBlock };
	}

	let combined = textParts.join('');

	// Strip invisible padding and normalize whitespace without collapsing intentional spacing
	combined = combined.replace(/[\u3164\u200B\uFEFF]/g, '');
	combined = combined.replace(/\u00A0/g, ' ');
	combined = combined.replace(/\r\n?/g, '\n');

	const { text, inThinkingBlock: thinkingState } = filterThinkingTokens(
		combined,
		inThinkingBlock
	);

	const trimmed = text.trim();
	// Skip obvious filler punctuation bursts often used for "thinking" animations
	if (trimmed && /^[.,;·•…]+$/.test(trimmed) && trimmed.length >= 6) {
		return { text: '', inThinkingBlock: thinkingState };
	}

	return { text, inThinkingBlock: thinkingState };
}

export function filterThinkingTokens(
	text: string,
	inThinkingBlock: boolean
): { text: string; inThinkingBlock: boolean } {
	let output = text;
	let thinking = inThinkingBlock;

	const startRegex = /<\s*(think|thinking|analysis|reasoning)\s*>/i;
	const endRegex = /<\s*\/\s*(think|thinking|analysis|reasoning)\s*>/i;

	// If already inside a thinking block, drop content until a closing tag appears
	if (thinking) {
		const endMatch = output.match(endRegex);
		if (endMatch?.index !== undefined) {
			output = output.slice(endMatch.index + endMatch[0].length);
			thinking = false;
		} else {
			return { text: '', inThinkingBlock: true };
		}
	}

	// Remove any complete thinking blocks inside this chunk
	while (true) {
		const startMatch = output.match(startRegex);
		if (!startMatch || startMatch.index === undefined) break;

		const afterStart = output.slice(startMatch.index + startMatch[0].length);
		const endMatch = afterStart.match(endRegex);

		if (endMatch?.index !== undefined) {
			output =
				output.slice(0, startMatch.index) +
				afterStart.slice(endMatch.index + endMatch[0].length);
		} else {
			// Start marker without an end - drop trailing content and keep state
			output = output.slice(0, startMatch.index);
			thinking = true;
			break;
		}
	}

	// Remove bracket-based markers that can leak thinking output
	output = output.replace(/【\s*(thinking|reasoning|analysis)\s*】/gi, '');

	return { text: output, inThinkingBlock: thinking };
}
