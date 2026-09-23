// apps/web/src/lib/components/agent/document-change-cards.test.ts
import { describe, expect, it, vi } from 'vitest';
import { summarizeDocumentChange } from '@buildos/shared-agent-ops/ontology/document-edits';
import { createDocumentFieldDiffFromHunks } from '$lib/utils/document-diff';
import {
	buildDocumentChangeCards,
	buildDocumentChangeToast,
	extractDocumentChangeReceipt,
	undoDocumentChange,
	type DocumentChangeReceipt
} from './document-change-cards';

const BEFORE = '# Plan\n\nIntro.\n\n## Scope\n\nOld scope.\n\n## Risks\n\nNone.\n';
const MIDDLE = BEFORE.replace('Old scope.', 'New scope.\nMore scope.');
const AFTER = MIDDLE.replace('None.', 'Budget.');

function receipt(before: string, after: string, title = 'Plan'): DocumentChangeReceipt {
	const summary = summarizeDocumentChange({
		project_id: 'project-1',
		document_id: 'document-1',
		title,
		before,
		after
	});
	if (!summary) throw new Error('fixture has no change');
	return summary;
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('extractDocumentChangeReceipt', () => {
	it('reads the receipt from a live tool_result payload and from stored results', () => {
		const change = receipt(BEFORE, MIDDLE);
		const receiptBody = {
			document: { id: 'document-1' },
			message: 'Updated',
			document_change_status: 'changed',
			document_change: change
		};

		expect(extractDocumentChangeReceipt({ tool_call_id: 'c1', result: receiptBody })).toBe(
			change
		);
		expect(extractDocumentChangeReceipt(receiptBody)).toBe(change);
		expect(extractDocumentChangeReceipt({ data: receiptBody })).toBe(change);
	});

	it('returns null for title/state-only updates and malformed receipts', () => {
		expect(extractDocumentChangeReceipt({ result: { document: { id: 'd' } } })).toBeNull();
		expect(
			extractDocumentChangeReceipt({ result: { document_change: { version: 2 } } })
		).toBeNull();
		expect(extractDocumentChangeReceipt(null)).toBeNull();
	});
});

describe('buildDocumentChangeCards', () => {
	it('merges a turn’s edits per document with summed stats and a newest-first undo chain', () => {
		const first = receipt(BEFORE, MIDDLE);
		const second = receipt(MIDDLE, AFTER, 'Plan v2');

		const [card, ...rest] = buildDocumentChangeCards([first, second]);

		expect(rest).toHaveLength(0);
		expect(card).toMatchObject({
			id: `document-1:${second.after_hash}`,
			documentId: 'document-1',
			projectId: 'project-1',
			title: 'Plan v2',
			editCount: 2,
			linesAdded: first.lines_added + second.lines_added,
			linesRemoved: first.lines_removed + second.lines_removed,
			beforeHash: first.before_hash,
			afterHash: second.after_hash
		});
		expect(card!.hunks).toEqual([...first.hunks, ...second.hunks]);
		expect(card!.revertPatches).toEqual([second.revert_patch, first.revert_patch]);
	});

	it('drops Undo when any edit lacks an inverse patch, and ignores replayed receipts', () => {
		const first = receipt(BEFORE, MIDDLE);
		const oversized = { ...receipt(MIDDLE, AFTER), revert_patch: null };

		const [card] = buildDocumentChangeCards([first, first, oversized]);

		expect(card!.editCount).toBe(2);
		expect(card!.revertPatches).toBeNull();
	});
});

describe('buildDocumentChangeToast', () => {
	it('builds the rich "updated · +X −Y" toast with document and history links', () => {
		const change = receipt(BEFORE, MIDDLE);

		expect(buildDocumentChangeToast(change)).toMatchObject({
			type: 'success',
			message: 'Plan updated',
			documentChange: {
				title: 'Plan',
				linesAdded: change.lines_added,
				linesRemoved: change.lines_removed,
				hunks: change.hunks,
				hunksTruncated: false,
				documentHref: '/projects/project-1?doc=document-1',
				historyHref: '/projects/project-1?entity=document&entity_id=document-1'
			}
		});
	});
});

describe('createDocumentFieldDiffFromHunks', () => {
	it('maps hunks to unified lines with line numbers and gap separators', () => {
		const change = receipt(BEFORE, AFTER);
		const field = createDocumentFieldDiffFromHunks('content', 'Changes', change.hunks, {
			added: change.lines_added,
			removed: change.lines_removed
		});

		const changed = field.unifiedLines.filter(
			(line) => line.type === 'added' || line.type === 'removed'
		);
		expect(changed.map((line) => [line.type, line.content])).toEqual([
			['removed', 'Old scope.'],
			['added', 'New scope.'],
			['added', 'More scope.'],
			['removed', 'None.'],
			['added', 'Budget.']
		]);
		expect(changed[1]).toMatchObject({ lineNumber: 7 });
		expect(field.stats).toEqual({
			added: change.lines_added,
			removed: change.lines_removed,
			modified: 0
		});
	});

	it('marks the unchanged gap between two hunks with its line count', () => {
		const before = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join('\n');
		const after = before.replace('line 3\n', 'line three\n').replace('line 25\n', 'line 25!\n');
		const change = receipt(before, after);
		const field = createDocumentFieldDiffFromHunks('content', 'Changes', change.hunks, {
			added: change.lines_added,
			removed: change.lines_removed
		});

		expect(change.hunks).toHaveLength(2);
		const separators = field.unifiedLines.filter((line) => line.type === 'separator');
		expect(separators).toEqual([{ type: 'separator', content: '', hiddenLineCount: 17 }]);
	});
});

describe('undoDocumentChange', () => {
	const [card] = buildDocumentChangeCards([receipt(BEFORE, MIDDLE)]);

	it('posts the undo chain with the pre- and post-edit hashes', async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse(200, {
				success: true,
				data: { document: { id: 'document-1' }, already_undone: false }
			})
		);

		const result = await undoDocumentChange(card!, fetchImpl as unknown as typeof fetch);

		expect(result).toEqual({
			status: 'undone',
			alreadyUndone: false,
			document: { id: 'document-1' }
		});
		const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('/api/onto/documents/document-1/revert-change');
		expect(JSON.parse(String(init.body))).toEqual({
			revert_patches: card!.revertPatches,
			before_hash: card!.beforeHash,
			expected_after_hash: card!.afterHash
		});
	});

	it('maps a 409 to a conflict with plain-language copy', async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse(409, { success: false, error: 'changed', code: 'BASE_TEXT_CHANGED' })
		);

		const result = await undoDocumentChange(card!, fetchImpl as unknown as typeof fetch);

		expect(result).toMatchObject({ status: 'conflict', reason: 'BASE_TEXT_CHANGED' });
		expect(result.status === 'conflict' && result.message).toMatch(/version history/);
	});

	it('reports server and network failures as retryable errors', async () => {
		const serverError = vi.fn(async () =>
			jsonResponse(500, { success: false, error: 'Failed to undo the document change' })
		);
		const offline = vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		});

		expect(await undoDocumentChange(card!, serverError as unknown as typeof fetch)).toEqual({
			status: 'error',
			message: 'Failed to undo the document change'
		});
		expect((await undoDocumentChange(card!, offline as unknown as typeof fetch)).status).toBe(
			'error'
		);
	});
});
