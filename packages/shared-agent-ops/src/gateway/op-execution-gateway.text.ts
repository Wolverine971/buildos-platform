// packages/shared-agent-ops/src/gateway/op-execution-gateway.text.ts
export function summarizeDescription(description: string): string {
	const trimmed = description.trim();
	if (!trimmed) return '';
	const sentenceEnd = trimmed.indexOf('.');
	return sentenceEnd === -1 ? trimmed : trimmed.slice(0, sentenceEnd + 1);
}

export function truncateText(content: string | null | undefined, maxChars: number) {
	const safeContent = content ?? '';
	if (safeContent.length <= maxChars) {
		return { content: safeContent, truncated: false };
	}

	return {
		content: safeContent.slice(0, maxChars),
		truncated: true
	};
}
