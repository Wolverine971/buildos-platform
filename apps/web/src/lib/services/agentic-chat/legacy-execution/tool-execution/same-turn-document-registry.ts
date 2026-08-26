// apps/web/src/lib/services/agentic-chat/legacy-execution/tool-execution/same-turn-document-registry.ts
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import type { ToolArguments } from './argument-values';

export interface SameTurnCreatedDocument {
	id: string | null;
	title: string;
}

/** Request-scoped state for document duplicate protection. */
export class SameTurnDocumentRegistry {
	private readonly documentsByTitle = new Map<string, SameTurnCreatedDocument>();

	rememberCreatedDocument(
		args: ToolArguments,
		executionResult: { data?: unknown; result?: unknown }
	): void {
		const title = typeof args.title === 'string' ? args.title.trim() : '';
		const normalizedTitle = normalizeDocumentTitleIdentity(title);
		if (!normalizedTitle) return;

		this.documentsByTitle.set(normalizedTitle, {
			id:
				findDocumentId(executionResult.data, 0) ??
				findDocumentId(executionResult.result, 0),
			title
		});
	}

	findByTitle(value: unknown): SameTurnCreatedDocument | undefined {
		const normalizedTitle = normalizeDocumentTitleIdentity(value);
		return normalizedTitle ? this.documentsByTitle.get(normalizedTitle) : undefined;
	}
}

export function normalizeDocumentTitleIdentity(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value
		.normalize('NFKC')
		.toLocaleLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

function findDocumentId(value: unknown, depth: number): string | null {
	if (!value || typeof value !== 'object' || depth > 3) return null;
	if (Array.isArray(value)) {
		for (const entry of value) {
			const found = findDocumentId(entry, depth + 1);
			if (found) return found;
		}
		return null;
	}

	const record = value as Record<string, unknown>;
	for (const key of ['document_id', 'documentId']) {
		const id = record[key];
		if (typeof id === 'string' && isValidUUID(id)) return id;
	}
	if (
		typeof record.id === 'string' &&
		isValidUUID(record.id) &&
		(typeof record.title === 'string' || typeof record.type_key === 'string')
	) {
		return record.id;
	}
	for (const entry of Object.values(record)) {
		const found = findDocumentId(entry, depth + 1);
		if (found) return found;
	}
	return null;
}
