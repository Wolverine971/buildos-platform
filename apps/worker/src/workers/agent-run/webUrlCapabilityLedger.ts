// apps/worker/src/workers/agent-run/webUrlCapabilityLedger.ts
type JsonRecord = Record<string, unknown>;

export type AgentRunWebUrlCapabilityLedger = {
	allowsVisit(value: unknown): boolean;
	observeSearchResult(value: unknown): void;
	observeVisitResult(value: unknown): void;
};

/**
 * Bound autonomous URL fetches to user-written URLs and URLs returned by the
 * run's own successful search calls. Page content never grants capabilities,
 * so prompt injection in a fetched page cannot create a novel outbound URL.
 */
export function createAgentRunWebUrlCapabilityLedger(
	seedTexts: readonly (string | null | undefined)[] = []
): AgentRunWebUrlCapabilityLedger {
	const allowedUrls = new Set<string>();
	for (const text of seedTexts) {
		if (typeof text !== 'string') continue;
		for (const rawUrl of extractHttpUrls(text)) {
			const canonical = canonicalizePublicHttpUrl(rawUrl);
			if (canonical) allowedUrls.add(canonical);
		}
	}

	return {
		allowsVisit(value) {
			const canonical = canonicalizePublicHttpUrl(value);
			return canonical !== null && allowedUrls.has(canonical);
		},
		observeSearchResult(value) {
			const result = asRecord(value);
			const rows = Array.isArray(result?.results) ? result.results : [];
			for (const row of rows) {
				const canonical = canonicalizePublicHttpUrl(asRecord(row)?.url);
				if (canonical) allowedUrls.add(canonical);
			}
		},
		observeVisitResult(value) {
			const result = asRecord(value);
			for (const candidate of [result?.url, result?.final_url]) {
				const canonical = canonicalizePublicHttpUrl(candidate);
				if (canonical) allowedUrls.add(canonical);
			}
		}
	};
}

function asRecord(value: unknown): JsonRecord | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function canonicalizePublicHttpUrl(value: unknown): string | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	try {
		const url = new URL(value.trim());
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
			return null;
		url.hash = '';
		return url.toString();
	} catch {
		return null;
	}
}

function extractHttpUrls(text: string): string[] {
	return Array.from(text.matchAll(/https?:\/\/[^\s<>"'`]+/giu), (match) =>
		(match[0] ?? '').replace(/[),.;!?]+$/g, '')
	).filter(Boolean);
}
