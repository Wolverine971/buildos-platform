// apps/web/src/lib/services/agentic-chat/legacy-execution/tool-execution/same-turn-document-registry.test.ts
import { describe, expect, it } from 'vitest';
import {
	SameTurnDocumentRegistry,
	normalizeDocumentTitleIdentity
} from './same-turn-document-registry';

const documentId = '7b1e5f7c-2f4a-4f6e-9d2b-8a1c3e5f7a9b';

describe('same-turn document registry', () => {
	it('normalizes punctuation, width, and case for duplicate identity', () => {
		expect(normalizeDocumentTitleIdentity('ＩＬＹＡＮ Rook — Character Sheet')).toBe(
			'ilyan rook character sheet'
		);
		expect(normalizeDocumentTitleIdentity('Ilyan Rook - Character Sheet')).toBe(
			'ilyan rook character sheet'
		);
	});

	it('remembers a created document id from nested execution data', () => {
		const registry = new SameTurnDocumentRegistry();
		registry.rememberCreatedDocument(
			{ title: 'Ilyan Rook — Character Sheet' },
			{ data: { payload: { document_id: documentId } } }
		);

		expect(registry.findByTitle('Ilyan Rook - Character Sheet')).toEqual({
			id: documentId,
			title: 'Ilyan Rook — Character Sheet'
		});
	});

	it('retains title evidence when no trustworthy document id is returned', () => {
		const registry = new SameTurnDocumentRegistry();
		registry.rememberCreatedDocument(
			{ title: 'Research Notes' },
			{ result: { id: 'not-a-uuid', title: 'Research Notes' } }
		);

		expect(registry.findByTitle('research notes')).toEqual({
			id: null,
			title: 'Research Notes'
		});
	});

	it('never shares state between request-scoped registry instances', () => {
		const first = new SameTurnDocumentRegistry();
		const second = new SameTurnDocumentRegistry();
		first.rememberCreatedDocument(
			{ title: 'Research Notes' },
			{ data: { document_id: documentId } }
		);

		expect(first.findByTitle('Research Notes')).toBeDefined();
		expect(second.findByTitle('Research Notes')).toBeUndefined();
	});
});
