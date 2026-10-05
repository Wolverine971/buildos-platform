// apps/web/src/lib/components/table-surfaces/document-embeds.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const svelteMocks = vi.hoisted(() => ({ mount: vi.fn(), unmount: vi.fn() }));
vi.mock('svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('svelte')>()),
	mount: svelteMocks.mount,
	unmount: svelteMocks.unmount
}));
vi.mock('$lib/components/tables/TableEmbed.svelte', () => ({ default: function TableEmbed() {} }));

import { renderDocumentMarkdown } from '$lib/utils/markdown';
import { documentEmbeds } from './document-embeds';
import { tableEmbedBlock } from './table-surface-utils';

const TABLE_ID = '0f8c1d5e-3b2a-4c6d-9e8f-1a2b3c4d5e6f';
const PROJECT_ID = '7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d';

function flush() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
	svelteMocks.mount.mockReset().mockReturnValue({});
	svelteMocks.unmount.mockReset();
});

describe('documentEmbeds', () => {
	it('turns a buildos-table fence into an embed host and mounts TableEmbed', async () => {
		const root = document.createElement('div');
		const html = renderDocumentMarkdown(`Before\n\n${tableEmbedBlock(TABLE_ID)}\n\nAfter`);
		root.innerHTML = html;

		const cleanup = documentEmbeds({ projectId: PROJECT_ID, html })(root);
		await flush();
		await flush();

		const host = root.querySelector<HTMLElement>('pre[data-table-embed]');
		expect(host?.dataset.tableEmbed).toBe(TABLE_ID);
		expect(host?.querySelector('code')).toBeNull();
		expect(svelteMocks.mount).toHaveBeenCalledWith(expect.any(Function), {
			target: host,
			props: { documentId: TABLE_ID, projectId: PROJECT_ID, onOpen: undefined }
		});

		(cleanup as () => void)();
		expect(svelteMocks.unmount).toHaveBeenCalledTimes(1);
	});

	it('ignores fences without a table id and leaves other code alone', async () => {
		const root = document.createElement('div');
		const html = renderDocumentMarkdown('```buildos-table\nnot-an-id\n```\n\n```js\nx()\n```');
		root.innerHTML = html;
		documentEmbeds({ projectId: PROJECT_ID, html })(root);
		await flush();
		expect(root.querySelector('pre[data-table-embed]')).toBeNull();
		expect(root.querySelectorAll('pre code')).toHaveLength(2);
		expect(svelteMocks.mount).not.toHaveBeenCalled();
	});

	it('offers "Make live table" under each markdown table and reports which one', async () => {
		const root = document.createElement('div');
		const html = renderDocumentMarkdown(
			'| A | B |\n|---|---|\n| 1 | 2 |\n\ntext\n\n| Company | Stage |\n|---|---|\n| Acme | Applied |'
		);
		root.innerHTML = html;
		const onMakeLiveTable = vi.fn();
		const cleanup = documentEmbeds({ projectId: PROJECT_ID, html, onMakeLiveTable })(root);
		await flush();

		const buttons = root.querySelectorAll<HTMLButtonElement>('.buildos-make-live-table button');
		expect(buttons).toHaveLength(2);
		buttons[1]!.click();
		expect(onMakeLiveTable).toHaveBeenCalledWith(
			expect.objectContaining({ renderedIndex: 1, renderedHeaders: ['Company', 'Stage'] })
		);

		(cleanup as () => void)();
		expect(root.querySelectorAll('.buildos-make-live-table')).toHaveLength(0);
	});
});
