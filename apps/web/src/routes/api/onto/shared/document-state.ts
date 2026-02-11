// apps/web/src/routes/api/onto/shared/document-state.ts
import { DOCUMENT_STATES, type DocumentState } from '$lib/types/onto';

const DOCUMENT_STATE_ALIASES: Record<string, string> = {
	review: 'in_review',
	inreview: 'in_review',
	ready_for_review: 'in_review',
	ready: 'ready',
	archive: 'archived',
	archived: 'archived',
	complete: 'published',
	completed: 'published'
};

const DOCUMENT_STATE_SET = new Set(DOCUMENT_STATES);

export function normalizeDocumentStateInput(state: unknown): DocumentState | undefined {
	if (state === undefined || state === null) return undefined;
	if (typeof state !== 'string') return undefined;

	const normalized = state
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	if (!normalized) return undefined;

	const candidate = DOCUMENT_STATE_ALIASES[normalized] ?? normalized;
	return DOCUMENT_STATE_SET.has(candidate as DocumentState) ? (candidate as DocumentState) : undefined;
}
