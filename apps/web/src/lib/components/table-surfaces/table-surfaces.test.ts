// apps/web/src/lib/components/table-surfaces/table-surfaces.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderDocumentMarkdown } from '$lib/utils/markdown';
import {
	gridToCsv,
	matchMarkdownTable,
	readRenderedTable,
	replaceRangeWithEmbed,
	tableEmbedBlock,
	tableRowCountOf
} from './table-surface-utils';

const DOC_ID = '0f8c1d5e-3b2a-4c6d-9e8f-1a2b3c4d5e6f';
const PROJECT_ID = '7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d';

describe('renderDocumentMarkdown', () => {
	it('renders [[document:id|label]] as an in-app link scoped to the project', () => {
		const html = renderDocumentMarkdown(`See [[document:${DOC_ID}|Job tracker]] for status.`, {
			projectId: PROJECT_ID
		});
		expect(html).toContain(
			`<a href="/projects/${PROJECT_ID}/documents/${DOC_ID}">Job tracker</a>`
		);
	});

	it('keeps the literal text inside code and escapes the label', () => {
		const html = renderDocumentMarkdown(
			`\`[[document:${DOC_ID}|x]]\`\n\n[[document:${DOC_ID}|<b>bold</b>]]`,
			{ projectId: PROJECT_ID }
		);
		expect(html).toContain(`<code>[[document:${DOC_ID}|x]]</code>`);
		expect(html).not.toContain('<b>');
		expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
	});

	it('renders the label as text when no project is known', () => {
		const html = renderDocumentMarkdown(`[[document:${DOC_ID}|Tracker]]`);
		expect(html).toContain('Tracker');
		expect(html).not.toContain('<a');
	});

	it('passes a buildos-table fence through for post-render embedding', () => {
		const html = renderDocumentMarkdown(`Intro\n\n${tableEmbedBlock(DOC_ID)}\n`);
		expect(html).toContain('<code class="language-buildos-table">');
		expect(html).toContain(DOC_ID);
	});
});

describe('table surface helpers', () => {
	it('reads header and body cells from a rendered table', () => {
		const container = document.createElement('div');
		container.innerHTML = renderDocumentMarkdown(
			'| Company | Salary |\n|---|---|\n| **Acme** | $150k |\n| Globex, Inc | |\n|  |  |'
		);
		const table = container.querySelector('table')!;
		expect(readRenderedTable(table)).toEqual({
			headers: ['Company', 'Salary'],
			rows: [
				['Acme', '$150k'],
				['Globex, Inc', '']
			]
		});
		expect(gridToCsv(readRenderedTable(table))).toBe(
			'Company,Salary\nAcme,$150k\n"Globex, Inc",'
		);
	});

	it('matches the rendered table to the parsed block by header cells', () => {
		const candidates = [{ headers: ['A', 'B'] }, { headers: ['**Company**', 'Stage'] }];
		expect(matchMarkdownTable(candidates, 1, ['Company', 'Stage'])).toBe(1);
		// A table hidden in a code fence shifts ordinals: still found by header.
		expect(matchMarkdownTable(candidates, 0, ['Company', 'Stage'])).toBe(1);
		expect(matchMarkdownTable(candidates, 0, ['Nope'])).toBe(-1);
	});

	it('replaces a markdown block with an embed on its own lines', () => {
		const content = 'Intro\n| A |\n|---|\n| 1 |\nOutro';
		const start = content.indexOf('| A |');
		const end = content.indexOf('Outro') - 1;
		expect(replaceRangeWithEmbed(content, { start, end }, DOC_ID)).toBe(
			`Intro\n${tableEmbedBlock(DOC_ID)}\nOutro`
		);
	});

	it('reads row counts from props.table.row_count', () => {
		expect(tableRowCountOf({ props: { table: { row_count: 12 } } })).toBe(12);
		expect(tableRowCountOf({ props: {} })).toBeNull();
		expect(tableRowCountOf(null)).toBeNull();
	});
});
