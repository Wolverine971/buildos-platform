// apps/web/src/lib/services/ontology/start-here-selector.ts

export type StartHereSelectionCandidate = {
	title?: string | null;
	content?: string | null;
	props?: unknown;
	created_at?: string | null;
	updated_at?: string | null;
};

function timestampMs(value: string | null | undefined): number {
	if (!value) return 0;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

export function isExplicitStartHereDocument(document: StartHereSelectionCandidate): boolean {
	const props =
		document.props && typeof document.props === 'object' && !Array.isArray(document.props)
			? (document.props as Record<string, unknown>)
			: {};
	if (props.origin === 'start_here_template') return true;

	const title = typeof document.title === 'string' ? document.title.trim() : '';
	if (/^start\s+here\b/i.test(title)) return true;

	const content = typeof document.content === 'string' ? document.content.trim() : '';
	return /^#\s+start\s+here\b/i.test(content);
}

export function pickStartHereDocument<T extends StartHereSelectionCandidate>(
	documents: T[]
): T | null {
	const explicit = documents.filter(isExplicitStartHereDocument);
	const candidates = explicit.length > 0 ? explicit : documents;
	if (candidates.length === 0) return null;

	const [selected] = [...candidates].sort((left, right) => {
		const rightMs = timestampMs(right.updated_at) || timestampMs(right.created_at);
		const leftMs = timestampMs(left.updated_at) || timestampMs(left.created_at);
		return rightMs - leftMs;
	});
	return selected ?? null;
}
