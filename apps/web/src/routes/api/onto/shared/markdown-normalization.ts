// apps/web/src/routes/api/onto/shared/markdown-normalization.ts
/**
 * Normalize markdown content when it arrives with escaped line breaks.
 * Only normalizes when the input has no real line breaks, to avoid
 * altering intentional escape sequences in code blocks.
 */
export function normalizeMarkdownInput(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	if (!value) {
		return value;
	}

	if (/[\r\n]/.test(value)) {
		return value;
	}

	const escapedMatches = value.match(/\\r\\n|\\n|\\r/g) ?? [];
	const slashMatches = value.match(/(?<!\w)\/n(?=$|[^\w])/g) ?? [];

	if (escapedMatches.length === 0 && slashMatches.length === 0) {
		return value;
	}

	let normalized = value;

	if (escapedMatches.length > 0) {
		normalized = normalized
			.replace(/\\r\\n/g, '\n')
			.replace(/\\n/g, '\n')
			.replace(/\\r/g, '\n');
	}

	if (slashMatches.length > 0) {
		normalized = normalized.replace(/(?<!\w)\/n(?=$|[^\w])/g, '\n');
	}

	return normalized;
}
