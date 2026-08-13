// apps/web/src/lib/utils/document-export.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	buildDocumentExportDocx,
	buildDocumentExportHtml,
	getExportBaseFilename,
	type DocumentExportPayload
} from './document-export';

const payload: DocumentExportPayload = {
	title: 'Launch <Plan>',
	description: 'A focused plan for shipping the next release.',
	stateKey: 'in_review',
	updatedAt: '2026-08-12T15:30:00.000Z',
	markdown: `# Direction

Keep the **core idea** visible.

> Make the next move obvious.

| Owner | Status |
| --- | --- |
| Team | Ready |

\`inline code\`

<script>window.evil = true</script>`
};

afterEach(() => {
	vi.useRealTimers();
});

describe('document export', () => {
	it('builds a standalone, branded HTML document with print-safe layout rules', () => {
		const html = buildDocumentExportHtml(payload, { forPrint: true });

		expect(html).toContain(
			'<div class="wordmark" aria-label="BuildOS">Build<span>OS</span></div>'
		);
		expect(html).toContain('<h1 class="document-title">Launch &lt;Plan&gt;</h1>');
		expect(html).toContain('<span class="state">In Review</span>');
		expect(html).toContain('<strong>core idea</strong>');
		expect(html).toContain('<table>');
		expect(html).toContain('Turn messy thinking into structured work.');
		expect(html).toContain('size: letter');
		expect(html).toContain('break-inside: avoid-page');
		expect(html).not.toContain('<script>window.evil = true</script>');
	});

	it('only adds the print launcher to PDF-oriented HTML', () => {
		const downloadableHtml = buildDocumentExportHtml(payload);
		const printableHtml = buildDocumentExportHtml(payload, {
			forPrint: true,
			autoPrint: true
		});

		expect(downloadableHtml).toContain('class="html-export"');
		expect(downloadableHtml).not.toContain('window.print()');
		expect(printableHtml).toContain('class="print-export"');
		expect(printableHtml).toContain('window.print()');
	});

	it('falls back to a valid export date when updatedAt is malformed', () => {
		const html = buildDocumentExportHtml({ ...payload, updatedAt: 'not-a-date' });

		expect(html).not.toContain('Invalid Date');
	});

	it('packages the BuildOS header, footer, metadata, and styled content in DOCX', async () => {
		const blob = buildDocumentExportDocx(payload);
		const archiveText = new TextDecoder().decode(await blob.arrayBuffer());

		expect(blob.type).toBe(
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		);
		expect(archiveText).toContain('word/header1.xml');
		expect(archiveText).toContain('word/footer1.xml');
		expect(archiveText).toContain('<w:headerReference w:type="default" r:id="rId2"/>');
		expect(archiveText).toContain('IN REVIEW | Updated');
		expect(archiveText).toContain('<w:t xml:space="preserve">Created in </w:t>');
		expect(archiveText).toContain('<w:t>OS</w:t>');
		expect(archiveText).toContain('<w:pStyle w:val="Heading1"/>');
		expect(archiveText).toContain('<w:tbl>');
		expect(archiveText).toContain('<w:tblHeader/>');
		expect(archiveText).toContain('<w:t xml:space="preserve">Owner</w:t>');
	});

	it('creates a readable, date-stamped filename', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-12T12:00:00'));

		expect(getExportBaseFilename('  Project Plan / v2  ')).toBe('project-plan-v2-20260812');
	});
});
