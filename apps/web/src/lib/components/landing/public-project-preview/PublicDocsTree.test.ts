// apps/web/src/lib/components/landing/public-project-preview/PublicDocsTree.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import PublicDocsTree from './PublicDocsTree.svelte';

function structure(folderId: string, documentId: string) {
	return {
		version: 1,
		root: [
			{
				id: folderId,
				order: 0,
				children: [{ id: documentId, order: 0, children: [] }]
			}
		]
	};
}

afterEach(() => {
	cleanup();
});

describe('PublicDocsTree folder state ownership', () => {
	it('preserves a local toggle until the document structure changes', async () => {
		const initialStructure = structure('folder-a', 'document-a');
		const view = render(PublicDocsTree, {
			props: { documents: [], docStructure: initialStructure }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Collapse folder' }));
		expect(screen.getByRole('button', { name: 'Expand folder' })).toBeInTheDocument();

		await view.rerender({ documents: [], docStructure: initialStructure });
		expect(screen.getByRole('button', { name: 'Expand folder' })).toBeInTheDocument();

		await view.rerender({
			documents: [],
			docStructure: structure('folder-b', 'document-b')
		});
		expect(screen.getByRole('button', { name: 'Collapse folder' })).toBeInTheDocument();
	});
});
