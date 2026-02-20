// apps/web/src/routes/api/onto/shared/markdown-normalization.ts
/**
 * Normalize markdown content when it arrives with escaped line breaks.
 * Converts escaped line breaks outside fenced code blocks so mixed payloads
 * (real newlines + literal "\n") still render correctly.
 */
export function normalizeMarkdownInput(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	if (!value) {
		return value;
	}

	// Fast path: nothing to normalize.
	if (!/\\r\\n|\\n|\\r|(?<!\w)\/n(?=$|[^\w])/.test(value)) {
		return value;
	}

	if (!/[\r\n]/.test(value)) {
		return normalizeEscapedLineBreaks(value);
	}

	// For multi-line markdown, normalize per line while preserving fenced
	// code blocks where escaped sequences are often intentional.
	const segments = value.match(/[^\r\n]*\r?\n|[^\r\n]+$/g);
	if (!segments || segments.length === 0) return value;

	let inFence = false;
	let fenceChar: '`' | '~' | null = null;
	let fenceLength = 0;
	let changed = false;
	let normalized = '';

	for (const segment of segments) {
		const line = segment.replace(/\r?\n$/, '');
		const newline = segment.slice(line.length);
		const fenceInfo = getFenceDelimiter(line);

		if (!inFence && fenceInfo) {
			inFence = true;
			fenceChar = fenceInfo.char;
			fenceLength = fenceInfo.length;
			normalized += line + newline;
			continue;
		}

		if (
			inFence &&
			fenceInfo &&
			fenceInfo.char === fenceChar &&
			fenceInfo.length >= fenceLength
		) {
			inFence = false;
			fenceChar = null;
			fenceLength = 0;
			normalized += line + newline;
			continue;
		}

		if (inFence) {
			normalized += line + newline;
			continue;
		}

		const normalizedLine = normalizeEscapedLineBreaks(line);
		if (normalizedLine !== line) changed = true;
		normalized += normalizedLine + newline;
	}

	return changed ? normalized : value;
}

function normalizeEscapedLineBreaks(value: string): string {
	return value
		.replace(/\\r\\n/g, '\n')
		.replace(/\\n/g, '\n')
		.replace(/\\r/g, '\n')
		.replace(/(?<!\w)\/n(?=$|[^\w])/g, '\n');
}

function getFenceDelimiter(line: string): { char: '`' | '~'; length: number } | null {
	const match = line.match(/^\s*(`{3,}|~{3,})/);
	if (!match) return null;

	const marker = match[1];
	if (!marker) return null;
	return {
		char: marker[0] as '`' | '~',
		length: marker.length
	};
}
