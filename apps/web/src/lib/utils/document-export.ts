import { renderMarkdown } from '$lib/utils/markdown';

export type DocumentExportFormat = 'docx' | 'html' | 'pdf';

export type DocumentExportPayload = {
	title: string;
	description?: string | null;
	markdown: string;
	stateKey?: string | null;
	updatedAt?: string | null;
};

const DOCX_MIME =
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const TEXT_ENCODER = new TextEncoder();

const CRC32_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i += 1) {
		let c = i;
		for (let j = 0; j < 8; j += 1) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[i] = c >>> 0;
	}
	return table;
})();

export function getExportBaseFilename(title: string): string {
	const safeTitle = (title || 'document')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64);

	const date = new Date();
	const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
		date.getDate()
	).padStart(2, '0')}`;

	return `${safeTitle || 'document'}-${stamp}`;
}

export function exportDocumentAsHtml(payload: DocumentExportPayload): void {
	const html = buildHtmlDocument(payload, { forPrint: false });
	const filename = `${getExportBaseFilename(payload.title)}.html`;
	downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), filename);
}

export function exportDocumentAsPdf(payload: DocumentExportPayload): boolean {
	if (typeof window === 'undefined') return false;

	const printWindow = window.open('', '_blank');
	if (!printWindow) return false;

	const html = buildHtmlDocument(payload, { forPrint: true, autoPrint: true });
	printWindow.document.open();
	printWindow.document.write(html);
	printWindow.document.close();

	return true;
}

export function exportDocumentAsDocx(payload: DocumentExportPayload): void {
	const blob = buildDocxBlob(payload);
	const filename = `${getExportBaseFilename(payload.title)}.docx`;
	downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string): void {
	if (typeof document === 'undefined') return;
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

type HtmlOptions = {
	forPrint: boolean;
	autoPrint?: boolean;
};

function buildHtmlDocument(payload: DocumentExportPayload, options: HtmlOptions): string {
	const title = escapeHtml(payload.title || 'Untitled Document');
	const description = payload.description?.trim() ? escapeHtml(payload.description.trim()) : '';
	const stateLabel = escapeHtml((payload.stateKey || 'draft').replace(/_/g, ' '));
	const updatedLabel = payload.updatedAt
		? new Date(payload.updatedAt).toLocaleString()
		: new Date().toLocaleString();
	const bodyHtml = renderMarkdown(payload.markdown || '');

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>${title}</title>
	<style>
		:root {
			--page-bg: #f7f7f6;
			--paper-bg: #ffffff;
			--ink: #111827;
			--muted: #6b7280;
			--line: #e5e7eb;
			--accent: #2563eb;
		}

		* { box-sizing: border-box; }
		body {
			margin: 0;
			background: var(--page-bg);
			color: var(--ink);
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
			line-height: 1.6;
		}

		main {
			max-width: 900px;
			margin: 24px auto;
			background: var(--paper-bg);
			border: 1px solid var(--line);
			border-radius: 12px;
			box-shadow: 0 8px 32px rgba(17, 24, 39, 0.08);
			overflow: hidden;
		}

		header {
			padding: 28px 32px 18px;
			border-bottom: 1px solid var(--line);
		}

		h1 {
			margin: 0;
			font-size: 1.75rem;
			line-height: 1.2;
		}

		.meta {
			margin-top: 10px;
			font-size: 0.875rem;
			color: var(--muted);
			display: flex;
			gap: 16px;
			flex-wrap: wrap;
		}

		.description {
			margin-top: 12px;
			color: #374151;
		}

		article {
			padding: 28px 32px 30px;
		}

		article h1, article h2, article h3, article h4 {
			margin-top: 1.4em;
			margin-bottom: 0.45em;
			line-height: 1.25;
		}

		article p,
		article li,
		article blockquote {
			font-size: 1rem;
		}

		article blockquote {
			margin: 1rem 0;
			padding: 0.2rem 0 0.2rem 0.9rem;
			border-left: 3px solid #d1d5db;
			color: #374151;
		}

		article pre {
			background: #f3f4f6;
			padding: 12px;
			border-radius: 8px;
			overflow: auto;
		}

		article code {
			font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
		}

		article table {
			width: 100%;
			border-collapse: collapse;
			margin: 1rem 0;
		}

		article th,
		article td {
			border: 1px solid var(--line);
			padding: 8px;
			text-align: left;
		}

		footer {
			border-top: 1px solid var(--line);
			padding: 12px 32px;
			font-size: 0.8rem;
			color: var(--muted);
		}

		@media print {
			@page {
				size: A4;
				margin: 18mm;
			}

			body {
				background: #fff;
			}

			main {
				max-width: none;
				margin: 0;
				border: none;
				border-radius: 0;
				box-shadow: none;
			}

			footer {
				padding-bottom: 0;
			}
		}

		${options.forPrint ? '' : '.no-print { display: none !important; }'}
	</style>
</head>
<body>
	<main>
		<header>
			<h1>${title}</h1>
			<div class="meta">
				<span>State: ${stateLabel}</span>
				<span>Updated: ${escapeHtml(updatedLabel)}</span>
			</div>
			${description ? `<p class="description">${description}</p>` : ''}
		</header>
		<article>
			${bodyHtml || '<p><em>No content</em></p>'}
		</article>
		<footer>
			Exported from BuildOS
		</footer>
	</main>
	${
		options.autoPrint
			? `<script>
				window.addEventListener('load', function () {
					setTimeout(function () {
						window.print();
					}, 350);
				});
			</script>`
			: ''
	}
</body>
</html>`;
}

function buildDocxBlob(payload: DocumentExportPayload): Blob {
	const docxTitle = payload.title?.trim() || 'Untitled Document';
	const description = payload.description?.trim() || '';
	const paragraphs = markdownToWordParagraphs(payload.markdown || '');
	const documentXml = buildDocumentXml(docxTitle, description, paragraphs);
	const nowIso = new Date().toISOString();

	const files: Array<{ name: string; content: string }> = [
		{
			name: '[Content_Types].xml',
			content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
	<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
	<Default Extension="xml" ContentType="application/xml"/>
	<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
	<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
	<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
	<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
		},
		{
			name: '_rels/.rels',
			content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
	<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
	<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
	<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
		},
		{
			name: 'docProps/core.xml',
			content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<dc:title>${escapeXml(docxTitle)}</dc:title>
	<dc:creator>BuildOS</dc:creator>
	<cp:lastModifiedBy>BuildOS</cp:lastModifiedBy>
	<dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created>
	<dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified>
</cp:coreProperties>`
		},
		{
			name: 'docProps/app.xml',
			content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
	<Application>BuildOS</Application>
	<DocSecurity>0</DocSecurity>
	<ScaleCrop>false</ScaleCrop>
	<Company>BuildOS</Company>
	<LinksUpToDate>false</LinksUpToDate>
	<SharedDoc>false</SharedDoc>
	<HyperlinksChanged>false</HyperlinksChanged>
	<AppVersion>1.0</AppVersion>
</Properties>`
		},
		{
			name: 'word/document.xml',
			content: documentXml
		},
		{
			name: 'word/styles.xml',
			content: buildStylesXml()
		},
		{
			name: 'word/_rels/document.xml.rels',
			content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
	<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
		}
	];

	return buildZipBlob(files, DOCX_MIME);
}

type ParagraphStyle = 'Normal' | 'Title' | 'Heading1' | 'Heading2' | 'Heading3' | 'Quote' | 'CodeBlock';

type WordParagraph = {
	style: ParagraphStyle;
	text: string;
};

function buildDocumentXml(
	title: string,
	description: string,
	paragraphs: WordParagraph[]
): string {
	const xmlParagraphs: string[] = [wordParagraph('Title', title)];
	if (description) {
		xmlParagraphs.push(wordParagraph('Quote', description));
		xmlParagraphs.push('<w:p/>');
	}

	for (const paragraph of paragraphs) {
		xmlParagraphs.push(wordParagraph(paragraph.style, paragraph.text));
	}

	if (xmlParagraphs.length === 0) {
		xmlParagraphs.push(wordParagraph('Normal', ''));
	}

	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
	<w:body>
		${xmlParagraphs.join('\n\t\t')}
		<w:sectPr>
			<w:pgSz w:w="12240" w:h="15840"/>
			<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
		</w:sectPr>
	</w:body>
</w:document>`;
}

function buildStylesXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
	<w:docDefaults>
		<w:rPrDefault>
			<w:rPr>
				<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
				<w:sz w:val="22"/>
				<w:szCs w:val="22"/>
			</w:rPr>
		</w:rPrDefault>
	</w:docDefaults>
	<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
		<w:name w:val="Normal"/>
		<w:qFormat/>
	</w:style>
	<w:style w:type="paragraph" w:styleId="Title">
		<w:name w:val="Title"/>
		<w:basedOn w:val="Normal"/>
		<w:qFormat/>
		<w:pPr>
			<w:spacing w:after="240"/>
		</w:pPr>
		<w:rPr>
			<w:b/>
			<w:sz w:val="40"/>
			<w:szCs w:val="40"/>
		</w:rPr>
	</w:style>
	<w:style w:type="paragraph" w:styleId="Heading1">
		<w:name w:val="Heading 1"/>
		<w:basedOn w:val="Normal"/>
		<w:qFormat/>
		<w:pPr>
			<w:spacing w:before="240" w:after="120"/>
		</w:pPr>
		<w:rPr>
			<w:b/>
			<w:sz w:val="32"/>
			<w:szCs w:val="32"/>
		</w:rPr>
	</w:style>
	<w:style w:type="paragraph" w:styleId="Heading2">
		<w:name w:val="Heading 2"/>
		<w:basedOn w:val="Normal"/>
		<w:qFormat/>
		<w:pPr>
			<w:spacing w:before="180" w:after="100"/>
		</w:pPr>
		<w:rPr>
			<w:b/>
			<w:sz w:val="28"/>
			<w:szCs w:val="28"/>
		</w:rPr>
	</w:style>
	<w:style w:type="paragraph" w:styleId="Heading3">
		<w:name w:val="Heading 3"/>
		<w:basedOn w:val="Normal"/>
		<w:qFormat/>
		<w:pPr>
			<w:spacing w:before="160" w:after="80"/>
		</w:pPr>
		<w:rPr>
			<w:b/>
			<w:sz w:val="24"/>
			<w:szCs w:val="24"/>
		</w:rPr>
	</w:style>
	<w:style w:type="paragraph" w:styleId="Quote">
		<w:name w:val="Quote"/>
		<w:basedOn w:val="Normal"/>
		<w:pPr>
			<w:ind w:left="720"/>
			<w:spacing w:after="120"/>
		</w:pPr>
		<w:rPr>
			<w:i/>
			<w:color w:val="4B5563"/>
		</w:rPr>
	</w:style>
	<w:style w:type="paragraph" w:styleId="CodeBlock">
		<w:name w:val="Code Block"/>
		<w:basedOn w:val="Normal"/>
		<w:pPr>
			<w:ind w:left="360" w:right="360"/>
			<w:spacing w:after="80"/>
		</w:pPr>
		<w:rPr>
			<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>
			<w:sz w:val="20"/>
			<w:szCs w:val="20"/>
		</w:rPr>
	</w:style>
</w:styles>`;
}

function wordParagraph(style: ParagraphStyle, text: string): string {
	if (!text) {
		return '<w:p/>';
	}
	return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(
		text
	)}</w:t></w:r></w:p>`;
}

function markdownToWordParagraphs(markdown: string): WordParagraph[] {
	const lines = markdown.replace(/\r\n/g, '\n').split('\n');
	const paragraphs: WordParagraph[] = [];
	let inCodeFence = false;
	let pendingBlank = false;

	for (const rawLine of lines) {
		const line = rawLine ?? '';
		const trimmed = line.trim();

		if (trimmed.startsWith('```')) {
			inCodeFence = !inCodeFence;
			pendingBlank = false;
			continue;
		}

		if (!trimmed) {
			pendingBlank = true;
			continue;
		}

		if (pendingBlank && paragraphs.length > 0) {
			paragraphs.push({ style: 'Normal', text: '' });
		}
		pendingBlank = false;

		if (inCodeFence) {
			paragraphs.push({ style: 'CodeBlock', text: line });
			continue;
		}

		const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
		if (headingMatch) {
			const level = (headingMatch[1] ?? '').length;
			const style: ParagraphStyle = level === 1 ? 'Heading1' : level === 2 ? 'Heading2' : 'Heading3';
			paragraphs.push({ style, text: stripInlineMarkdown(headingMatch[2] ?? '') });
			continue;
		}

		const blockquoteMatch = line.match(/^>\s?(.*)$/);
		if (blockquoteMatch) {
			paragraphs.push({ style: 'Quote', text: stripInlineMarkdown(blockquoteMatch[1] ?? '') });
			continue;
		}

		const unorderedListMatch = line.match(/^\s*[-*+]\s+(.*)$/);
		if (unorderedListMatch) {
			paragraphs.push({
				style: 'Normal',
				text: `- ${stripInlineMarkdown(unorderedListMatch[1] ?? '')}`
			});
			continue;
		}

		const orderedListMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
		if (orderedListMatch) {
			paragraphs.push({
				style: 'Normal',
				text: `${orderedListMatch[1] ?? '1'}. ${stripInlineMarkdown(orderedListMatch[2] ?? '')}`
			});
			continue;
		}

		paragraphs.push({ style: 'Normal', text: stripInlineMarkdown(line) });
	}

	return paragraphs;
}

function stripInlineMarkdown(text: string): string {
	return text
		.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, src: string) => {
			const safeAlt = alt?.trim() || 'image';
			return `[Image: ${safeAlt}] (${src})`;
		})
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, href: string) => `${label} (${href})`)
		.replace(/`([^`]+)`/g, '$1')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/__([^_]+)__/g, '$1')
		.replace(/~~([^~]+)~~/g, '$1')
		.replace(/\*([^*]+)\*/g, '$1')
		.replace(/_([^_]+)_/g, '$1')
		.trim();
}

function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < data.length; i += 1) {
		const value = data[i] ?? 0;
		const tableEntry = CRC32_TABLE[(crc ^ value) & 0xff] ?? 0;
		crc = (crc >>> 8) ^ tableEntry;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function buildZipBlob(files: Array<{ name: string; content: string }>, mimeType: string): Blob {
	const localFileParts: Uint8Array[] = [];
	const centralDirectoryParts: Uint8Array[] = [];
	let offset = 0;

	for (const file of files) {
		const nameBytes = TEXT_ENCODER.encode(file.name);
		const dataBytes = TEXT_ENCODER.encode(file.content);
		const checksum = crc32(dataBytes);

		const localHeader = new Uint8Array(30 + nameBytes.length + dataBytes.length);
		const localView = new DataView(localHeader.buffer);
		localView.setUint32(0, 0x04034b50, true);
		localView.setUint16(4, 20, true);
		localView.setUint16(6, 0, true);
		localView.setUint16(8, 0, true);
		localView.setUint16(10, 0, true);
		localView.setUint16(12, 0, true);
		localView.setUint32(14, checksum, true);
		localView.setUint32(18, dataBytes.length, true);
		localView.setUint32(22, dataBytes.length, true);
		localView.setUint16(26, nameBytes.length, true);
		localView.setUint16(28, 0, true);
		localHeader.set(nameBytes, 30);
		localHeader.set(dataBytes, 30 + nameBytes.length);
		localFileParts.push(localHeader);

		const centralHeader = new Uint8Array(46 + nameBytes.length);
		const centralView = new DataView(centralHeader.buffer);
		centralView.setUint32(0, 0x02014b50, true);
		centralView.setUint16(4, 20, true);
		centralView.setUint16(6, 20, true);
		centralView.setUint16(8, 0, true);
		centralView.setUint16(10, 0, true);
		centralView.setUint16(12, 0, true);
		centralView.setUint16(14, 0, true);
		centralView.setUint32(16, checksum, true);
		centralView.setUint32(20, dataBytes.length, true);
		centralView.setUint32(24, dataBytes.length, true);
		centralView.setUint16(28, nameBytes.length, true);
		centralView.setUint16(30, 0, true);
		centralView.setUint16(32, 0, true);
		centralView.setUint16(34, 0, true);
		centralView.setUint16(36, 0, true);
		centralView.setUint32(38, 0, true);
		centralView.setUint32(42, offset, true);
		centralHeader.set(nameBytes, 46);
		centralDirectoryParts.push(centralHeader);

		offset += localHeader.length;
	}

	let centralSize = 0;
	for (const part of centralDirectoryParts) {
		centralSize += part.length;
	}

	const endRecord = new Uint8Array(22);
	const endView = new DataView(endRecord.buffer);
	endView.setUint32(0, 0x06054b50, true);
	endView.setUint16(4, 0, true);
	endView.setUint16(6, 0, true);
	endView.setUint16(8, files.length, true);
	endView.setUint16(10, files.length, true);
	endView.setUint32(12, centralSize, true);
	endView.setUint32(16, offset, true);
	endView.setUint16(20, 0, true);

	const blobParts: BlobPart[] = [
		...localFileParts.map((part) => Uint8Array.from(part) as unknown as BlobPart),
		...centralDirectoryParts.map((part) => Uint8Array.from(part) as unknown as BlobPart),
		Uint8Array.from(endRecord) as unknown as BlobPart
	];

	return new Blob(blobParts, {
		type: mimeType
	});
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}
