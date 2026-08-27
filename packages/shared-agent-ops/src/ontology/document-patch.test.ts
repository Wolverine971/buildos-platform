// packages/shared-agent-ops/src/ontology/document-patch.test.ts

import { describe, expect, it } from 'vitest';
import { hashDocumentContent } from '../utils/document-outline';
import {
	DocumentPatchIntegrityError,
	createDocumentPatchV1,
	resolveDocumentPatch,
	type DocumentPatchSelection
} from './document-patch';

function selection(
	content: string,
	target: string,
	replacement_markdown: string,
	op_id = 'op-1',
	occurrence = 0
): DocumentPatchSelection {
	let from = -1;
	let cursor = 0;
	for (let index = 0; index <= occurrence; index += 1) {
		from = content.indexOf(target, cursor);
		if (from < 0) throw new Error(`Missing test target: ${target}`);
		cursor = from + target.length;
	}
	return { op_id, from, to: from + target.length, replacement_markdown };
}

function patchFor(content: string, selections: DocumentPatchSelection[]) {
	return createDocumentPatchV1({
		project_id: 'project-1',
		document_id: 'document-1',
		base_content: content,
		selections
	});
}

describe('document content hash fixtures', () => {
	it.each([
		['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
		['A😀B', 'aacfb6637bd0df2238641c5b15898d1a61df3157b1d0b4099f590fc0b0b6fbbd'],
		[
			'line 1\r\nline 2\r\n',
			'821af7eca18c2b5de4663bfd464e20fac360065baabcfb48082cefab599ac5d1'
		],
		[
			`# Heading\n\n${'é'.repeat(10_000)}`,
			'8e92620dc2baa96e4fa2b6e32deec831f6e1d51f5d0ccd43cc47f8d03e11d53c'
		]
	])('hashes exact UTF-8 Markdown without normalization', (content, expected) => {
		expect(hashDocumentContent(content)).toBe(expected);
	});
});

describe('DocumentPatchV1 capture and integrity', () => {
	it('captures UTF-16 ranges, exact Markdown context, and a nested heading path', () => {
		const content = '# Root\r\n\r\n## Plan\r\nA😀B\r\n';
		const patch = patchFor(content, [selection(content, '😀', 'ready')]);
		const operation = patch.operations[0]!;

		expect(operation.anchor.base_range.to - operation.anchor.base_range.from).toBe(2);
		expect(operation.anchor.before_markdown).toBe('😀');
		expect(operation.anchor.heading_path.map(({ text }) => text)).toEqual(['Root', 'Plan']);
		expect(operation.anchor.prefix.endsWith('A')).toBe(true);
		expect(operation.anchor.suffix.startsWith('B\r\n')).toBe(true);
		expect(patch.patch_hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('rejects a payload changed after review', () => {
		const patch = patchFor('alpha', [selection('alpha', 'alpha', 'beta')]);
		const changed = {
			...patch,
			operations: [{ ...patch.operations[0]!, replacement_markdown: 'surprise' }]
		};

		expect(() => resolveDocumentPatch(changed, 'alpha')).toThrow(DocumentPatchIntegrityError);
	});
});

describe('resolveDocumentPatch', () => {
	it('applies against an unchanged head using the fast path', () => {
		const content = '# Plan\n\nDraft the launch brief.';
		const patch = patchFor(content, [selection(content, 'Draft', 'Publish')]);

		expect(resolveDocumentPatch(patch, content)).toMatchObject({
			status: 'resolved',
			strategy: 'fast_path',
			next_content: '# Plan\n\nPublish the launch brief.'
		});
	});

	it('re-anchors after unrelated edits before and after the selected passage', () => {
		const content = '# Plan\n\nDraft the launch brief.\n';
		const patch = patchFor(content, [selection(content, 'launch brief', 'release brief')]);
		const current = `New preamble\n\n${content}\nUnrelated footer`;

		expect(resolveDocumentPatch(patch, current)).toMatchObject({
			status: 'resolved',
			strategy: 'reanchored',
			next_content: expect.stringContaining('Draft the release brief.')
		});
	});

	it('re-anchors an unchanged section after it moves under a renamed heading', () => {
		const leadIn = `Context that moves with the section. ${'x'.repeat(300)}\n\n`;
		const tail = `\n\n${'y'.repeat(300)} End of moving section.`;
		const content = `# Project\n\n## Plan\n\n${leadIn}Keep this exact sentence.${tail}\n\n## Notes\n\nLater.`;
		const patch = patchFor(content, [
			selection(content, 'Keep this exact sentence.', 'Keep the approved sentence.')
		]);
		const current = `# Project\n\n## Notes\n\nLater.\n\n## Execution plan\n\n${leadIn}Keep this exact sentence.${tail}`;

		expect(resolveDocumentPatch(patch, current)).toMatchObject({
			status: 'resolved',
			strategy: 'reanchored',
			next_content: expect.stringContaining('Keep the approved sentence.')
		});
	});

	it('reports changed selected text without fuzzy matching', () => {
		const content = '# Plan\n\nThe launch is Tuesday.';
		const patch = patchFor(content, [selection(content, 'Tuesday', 'Wednesday')]);

		expect(resolveDocumentPatch(patch, '# Plan\n\nThe launch moved to Wednesday.')).toEqual({
			status: 'conflict',
			reason: 'BASE_TEXT_CHANGED'
		});
	});

	it('reports ambiguity when exact text has multiple indistinguishable candidates', () => {
		const patch = patchFor('A', [selection('A', 'A', 'B')]);

		expect(resolveDocumentPatch(patch, 'XAA')).toEqual({
			status: 'conflict',
			reason: 'ANCHOR_AMBIGUOUS'
		});
	});

	it('reports a missing anchor when its heading and selected text were deleted', () => {
		const content = '# Root\n\n## Plan\n\nDelete this target.\n';
		const patch = patchFor(content, [selection(content, 'Delete this target.', 'Replacement')]);

		expect(resolveDocumentPatch(patch, '# Root\n\n## Notes\n\nNothing here.')).toEqual({
			status: 'conflict',
			reason: 'ANCHOR_NOT_FOUND'
		});
	});

	it('requires one exact contextual boundary for insertions', () => {
		const content = '# Plan\n\nFirst paragraph.\n\nLast paragraph.';
		const insertionPoint = content.indexOf('Last paragraph.');
		const patch = patchFor(content, [
			{
				op_id: 'insert-1',
				from: insertionPoint,
				to: insertionPoint,
				replacement_markdown: 'Inserted paragraph.\n\n'
			}
		]);

		expect(resolveDocumentPatch(patch, `Preamble\n${content}`)).toMatchObject({
			status: 'resolved',
			strategy: 'reanchored',
			next_content: expect.stringContaining('Inserted paragraph.\n\nLast paragraph.')
		});
	});

	it('rejects overlapping operations before applying any of them', () => {
		const content = 'abcdefghij';
		const patch = patchFor(content, [
			{ op_id: 'wide', from: 2, to: 8, replacement_markdown: 'W' },
			{ op_id: 'inside', from: 4, to: 6, replacement_markdown: 'I' }
		]);

		expect(resolveDocumentPatch(patch, content)).toEqual({
			status: 'conflict',
			reason: 'OVERLAPPING_OPERATIONS'
		});
	});

	it('applies multiple replacements in descending offset order', () => {
		const content = 'one two three';
		const patch = patchFor(content, [
			selection(content, 'one', '1', 'first'),
			selection(content, 'three', '3', 'last')
		]);

		expect(resolveDocumentPatch(patch, content)).toMatchObject({
			status: 'resolved',
			next_content: '1 two 3'
		});
	});

	it('rejects edits inside a machine-owned managed region', () => {
		const content = [
			'# START HERE',
			'',
			'<!-- managed:status v=1 -->',
			'**State:** Active',
			'<!-- /managed:status -->',
			'',
			'Human notes.'
		].join('\n');
		const patch = patchFor(content, [selection(content, 'Active', 'Done')]);

		expect(resolveDocumentPatch(patch, content)).toEqual({
			status: 'conflict',
			reason: 'MANAGED_REGION_BOUNDARY'
		});
	});
});
