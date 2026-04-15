// apps/web/src/lib/services/agentic-chat/shared/update-value-validation.ts

export function hasMeaningfulUpdateValue(value: unknown): boolean {
	if (value === undefined || value === null) return false;

	if (typeof value === 'string') {
		return value.trim().length > 0;
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return true;
	}

	if (Array.isArray(value)) {
		return value.some(hasMeaningfulUpdateValue);
	}

	if (typeof value === 'object') {
		return Object.values(value as Record<string, unknown>).some(hasMeaningfulUpdateValue);
	}

	return true;
}

export function isAppendOrMergeUpdateStrategy(value: unknown): value is 'append' | 'merge_llm' {
	return value === 'append' || value === 'merge_llm';
}

export function getDocumentUpdateContentCandidate(args: Record<string, unknown>): string | null {
	const nestedDocument =
		args.document && typeof args.document === 'object' && !Array.isArray(args.document)
			? (args.document as Record<string, unknown>)
			: null;

	const candidates = [
		args.content,
		args.body_markdown,
		args.markdown,
		args.body,
		args.text,
		nestedDocument?.content,
		nestedDocument?.body_markdown,
		nestedDocument?.markdown,
		nestedDocument?.body,
		nestedDocument?.text
	];

	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate.trim().length > 0) {
			return candidate;
		}
	}

	return null;
}
