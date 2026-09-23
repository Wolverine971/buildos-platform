// apps/web/src/lib/components/ontology/doc-tree/tree-images.test.ts
import { describe, expect, it } from 'vitest';
import {
	groupTreeImages,
	treeImageTitle,
	treeImageViewerOrder,
	type DocTreeImage
} from './tree-images';

function image(id: string, overrides: Partial<DocTreeImage> = {}): DocTreeImage {
	return {
		id,
		caption: null,
		alt_text: null,
		original_filename: `${id}.png`,
		width: 100,
		height: 100,
		ocr_status: 'complete',
		extraction_summary: null,
		created_at: '2026-09-22T00:00:00.000Z',
		...overrides
	};
}

describe('groupTreeImages', () => {
	it('puts images without a document link on the shelf', () => {
		const grouped = groupTreeImages([image('logo')], [], new Set(['doc-1']));
		expect(grouped.shelf.map((entry) => entry.id)).toEqual(['logo']);
		expect(grouped.byDocumentId.size).toBe(0);
	});

	it('files a linked image under its visible document and off the shelf', () => {
		const grouped = groupTreeImages(
			[image('logo'), image('shot')],
			[{ asset_id: 'logo', document_id: 'doc-1' }],
			new Set(['doc-1'])
		);
		expect(grouped.shelf.map((entry) => entry.id)).toEqual(['shot']);
		expect(grouped.byDocumentId.get('doc-1')?.map((entry) => entry.id)).toEqual(['logo']);
	});

	it('falls back to the shelf when the linked document is not in the tree', () => {
		// Archived or deleted documents keep their links; the image must not vanish.
		const grouped = groupTreeImages(
			[image('logo')],
			[{ asset_id: 'logo', document_id: 'archived-doc' }],
			new Set(['doc-1'])
		);
		expect(grouped.shelf.map((entry) => entry.id)).toEqual(['logo']);
		expect(grouped.byDocumentId.has('archived-doc')).toBe(false);
	});

	it('shows an image under every visible document it is linked to, once each', () => {
		const grouped = groupTreeImages(
			[image('logo')],
			[
				{ asset_id: 'logo', document_id: 'doc-1' },
				{ asset_id: 'logo', document_id: 'doc-2' },
				{ asset_id: 'logo', document_id: 'doc-1' }
			],
			new Set(['doc-1', 'doc-2'])
		);
		expect(grouped.shelf).toEqual([]);
		expect(grouped.byDocumentId.get('doc-1')?.length).toBe(1);
		expect(grouped.byDocumentId.get('doc-2')?.length).toBe(1);
	});

	it('ignores links for images that are not loaded', () => {
		const grouped = groupTreeImages(
			[],
			[{ asset_id: 'gone', document_id: 'doc-1' }],
			new Set(['doc-1'])
		);
		expect(grouped.byDocumentId.size).toBe(0);
	});
});

describe('treeImageTitle', () => {
	it('prefers the caption, then alt text, then the file name', () => {
		expect(treeImageTitle(image('a', { caption: ' Redline logo ' }))).toBe('Redline logo');
		expect(treeImageTitle(image('a', { alt_text: 'Logo mark' }))).toBe('Logo mark');
		expect(treeImageTitle(image('a'))).toBe('a.png');
		expect(treeImageTitle(image('a', { original_filename: null }))).toBe('Untitled image');
	});
});

describe('treeImageViewerOrder', () => {
	it('walks the shelf, then documents in tree order, listing each image once', () => {
		const grouped = groupTreeImages(
			[image('shelf-a'), image('in-child'), image('in-both'), image('in-root')],
			[
				{ asset_id: 'in-root', document_id: 'doc-root' },
				{ asset_id: 'in-both', document_id: 'doc-root' },
				{ asset_id: 'in-both', document_id: 'doc-child' },
				{ asset_id: 'in-child', document_id: 'doc-child' }
			],
			new Set(['doc-root', 'doc-child'])
		);

		expect(treeImageViewerOrder(grouped, ['doc-root', 'doc-child'])).toEqual([
			'shelf-a',
			'in-both',
			'in-root',
			'in-child'
		]);
	});
});
