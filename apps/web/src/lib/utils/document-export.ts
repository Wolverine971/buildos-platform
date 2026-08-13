// apps/web/src/lib/utils/document-export.ts
import { renderMarkdown } from '$lib/utils/markdown';

export type DocumentExportFormat = 'docx' | 'html' | 'pdf';

export type DocumentExportPayload = {
	title: string;
	description?: string | null;
	markdown: string;
	stateKey?: string | null;
	updatedAt?: string | null;
};

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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
	const html = buildDocumentExportHtml(payload, { forPrint: false });
	const filename = `${getExportBaseFilename(payload.title)}.html`;
	downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), filename);
}

export function exportDocumentAsPdf(payload: DocumentExportPayload): boolean {
	if (typeof window === 'undefined') return false;

	const printWindow = window.open('', '_blank');
	if (!printWindow) return false;

	const html = buildDocumentExportHtml(payload, { forPrint: true, autoPrint: true });
	printWindow.document.open();
	printWindow.document.write(html);
	printWindow.document.close();

	return true;
}

export function exportDocumentAsDocx(payload: DocumentExportPayload): void {
	const blob = buildDocumentExportDocx(payload);
	const filename = `${getExportBaseFilename(payload.title)}.docx`;
	downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string): void {
	if (typeof document === 'undefined') return;
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.hidden = true;
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

type HtmlOptions = {
	forPrint: boolean;
	autoPrint?: boolean;
};

export function buildDocumentExportHtml(
	payload: DocumentExportPayload,
	options: HtmlOptions = { forPrint: false }
): string {
	const title = escapeHtml(payload.title || 'Untitled Document');
	const description = payload.description?.trim() ? escapeHtml(payload.description.trim()) : '';
	const stateLabel = escapeHtml(formatStateLabel(payload.stateKey));
	const updatedLabel = escapeHtml(formatExportDate(payload.updatedAt));
	const bodyHtml = renderMarkdown(payload.markdown || '');

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>${title}</title>
	<style>
		:root {
			color-scheme: light;
			--page-bg: #f1efe9;
			--paper-bg: #fffefa;
			--ink: #211f1c;
			--ink-soft: #47423c;
			--muted: #736d64;
			--line: #ded8ce;
			--line-strong: #c9c0b2;
			--accent: #f97316;
			--accent-soft: #fff1e7;
			--code-bg: #f4f1eb;
		}

		* {
			box-sizing: border-box;
		}

		html {
			background: var(--page-bg);
		}

		body {
			margin: 0;
			background: var(--page-bg);
			color: var(--ink);
			font-family: 'Avenir Next', Avenir, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
			font-size: 16px;
			line-height: 1.68;
			-webkit-font-smoothing: antialiased;
		}

		main {
			position: relative;
			width: min(calc(100% - 32px), 816px);
			min-height: 880px;
			margin: 32px auto;
			background: var(--paper-bg);
			border: 1px solid var(--line-strong);
			border-radius: 4px;
			box-shadow: 0 18px 60px rgba(51, 45, 37, 0.12);
			overflow: hidden;
		}

		main::before {
			position: absolute;
			inset: 0 0 auto;
			height: 5px;
			background: var(--accent);
			content: '';
		}

		.document-header {
			padding: 36px 48px 32px;
			border-bottom: 1px solid var(--line);
		}

		.brand-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 20px;
			margin-bottom: 40px;
		}

		.wordmark {
			color: var(--ink);
			font-size: 15px;
			font-weight: 800;
			letter-spacing: -0.025em;
			line-height: 1;
		}

		.wordmark span,
		.footer-brand span {
			color: var(--accent);
		}

		.artifact-label {
			color: var(--muted);
			font-size: 10px;
			font-weight: 700;
			letter-spacing: 0.16em;
			line-height: 1;
		}

		.document-title {
			margin: 0;
			max-width: 680px;
			font-size: clamp(2rem, 5vw, 3rem);
			font-weight: 750;
			letter-spacing: -0.042em;
			line-height: 1.08;
		}

		.meta {
			display: flex;
			align-items: center;
			gap: 10px 16px;
			margin-top: 22px;
			color: var(--muted);
			font-size: 12px;
			font-weight: 600;
			flex-wrap: wrap;
		}

		.state {
			display: inline-flex;
			align-items: center;
			gap: 7px;
			color: var(--ink-soft);
		}

		.state::before {
			width: 6px;
			height: 6px;
			border-radius: 999px;
			background: var(--accent);
			content: '';
		}

		.meta-divider {
			width: 1px;
			height: 12px;
			background: var(--line-strong);
		}

		.description {
			max-width: 640px;
			margin: 18px 0 0;
			color: var(--ink-soft);
			font-size: 17px;
			line-height: 1.55;
		}

		.document-body {
			padding: 36px 48px 56px;
		}

		.document-body > :first-child {
			margin-top: 0;
		}

		.document-body > :last-child {
			margin-bottom: 0;
		}

		.document-body h1,
		.document-body h2,
		.document-body h3,
		.document-body h4,
		.document-body h5,
		.document-body h6 {
			margin: 1.8em 0 0.58em;
			color: var(--ink);
			font-weight: 720;
			letter-spacing: -0.025em;
			line-height: 1.22;
		}

		.document-body h1 { font-size: 1.8rem; }
		.document-body h2 { font-size: 1.45rem; }
		.document-body h3 { font-size: 1.2rem; }
		.document-body h4,
		.document-body h5,
		.document-body h6 { font-size: 1rem; }

		.document-body p {
			margin: 0 0 1em;
		}

		.document-body ul,
		.document-body ol {
			margin: 0 0 1.1em;
			padding-left: 1.45em;
		}

		.document-body li {
			margin: 0.34em 0;
			padding-left: 0.2em;
		}

		.document-body li::marker {
			color: var(--accent);
			font-weight: 700;
		}

		.document-body a {
			color: #b84c08;
			text-decoration-color: rgba(184, 76, 8, 0.35);
			text-decoration-thickness: 1px;
			text-underline-offset: 3px;
		}

		.document-body a:hover {
			text-decoration-color: currentColor;
		}

		.document-body strong {
			font-weight: 720;
		}

		.document-body blockquote {
			margin: 1.5em 0;
			padding: 0.8em 1em;
			border-left: 3px solid var(--accent);
			background: var(--accent-soft);
			color: var(--ink-soft);
		}

		.document-body blockquote > :last-child {
			margin-bottom: 0;
		}

		.document-body pre {
			max-width: 100%;
			margin: 1.4em 0;
			padding: 16px 18px;
			border: 1px solid var(--line);
			border-radius: 6px;
			background: var(--code-bg);
			overflow: auto;
			font-size: 0.875rem;
			line-height: 1.55;
		}

		.document-body code {
			font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
			font-size: 0.9em;
		}

		.document-body :not(pre) > code {
			padding: 0.12em 0.35em;
			border: 1px solid var(--line);
			border-radius: 4px;
			background: var(--code-bg);
		}

		.document-body hr {
			margin: 2.25em 0;
			border: 0;
			border-top: 1px solid var(--line-strong);
		}

		.document-body img {
			display: block;
			max-width: 100%;
			height: auto;
			margin: 1.5em auto;
			border: 1px solid var(--line);
			border-radius: 4px;
		}

		.document-body table {
			width: 100%;
			margin: 1.5em 0;
			border: 1px solid var(--line-strong);
			border-collapse: collapse;
			font-size: 0.9rem;
			line-height: 1.45;
		}

		.document-body th,
		.document-body td {
			border: 1px solid var(--line);
			padding: 10px 12px;
			text-align: left;
			vertical-align: top;
		}

		.document-body th {
			background: var(--code-bg);
			font-weight: 700;
		}

		.document-footer {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 16px;
			border-top: 1px solid var(--line);
			padding: 16px 48px;
			color: var(--muted);
			font-size: 11px;
			letter-spacing: 0.015em;
		}

		.footer-brand {
			color: var(--ink-soft);
			font-weight: 760;
			letter-spacing: -0.02em;
		}

		.empty-state {
			color: var(--muted);
			font-style: italic;
		}

		@media (max-width: 640px) {
			main {
				width: 100%;
				min-height: 100vh;
				margin: 0;
				border: 0;
				border-radius: 0;
				box-shadow: none;
			}

			.document-header,
			.document-body {
				padding-right: 24px;
				padding-left: 24px;
			}

			.document-footer {
				padding-right: 24px;
				padding-left: 24px;
			}

			.brand-row {
				margin-bottom: 30px;
			}
		}

		@media print {
			@page {
				size: letter;
				margin: 17mm 18mm 19mm;
			}

			html,
			body {
				background: #fff;
				font-size: 10.5pt;
				line-height: 1.58;
				-webkit-print-color-adjust: exact;
				print-color-adjust: exact;
			}

			main {
				width: auto;
				min-height: 0;
				margin: 0;
				border: none;
				border-radius: 0;
				box-shadow: none;
				overflow: visible;
			}

			main::before {
				height: 2.5pt;
			}

			.document-header {
				padding: 9mm 0 8mm;
			}

			.brand-row {
				margin-bottom: 9mm;
			}

			.document-title {
				font-size: 27pt;
			}

			.description {
				font-size: 11pt;
			}

			.document-body {
				padding: 9mm 0 10mm;
			}

			.document-body h1,
			.document-body h2,
			.document-body h3,
			.document-body h4,
			.document-body h5,
			.document-body h6 {
				break-after: avoid-page;
				page-break-after: avoid;
			}

			.document-body p,
			.document-body li {
				orphans: 3;
				widows: 3;
			}

			.document-body blockquote,
			.document-body pre,
			.document-body img,
			.document-body tr {
				break-inside: avoid-page;
				page-break-inside: avoid;
			}

			.document-body thead {
				display: table-header-group;
			}

			.document-body pre {
				white-space: pre-wrap;
				word-break: break-word;
			}

			.document-body a {
				color: var(--ink);
				text-decoration-color: var(--line-strong);
			}

			.document-footer {
				break-inside: avoid-page;
				padding: 2.5mm 0 0;
				font-size: 8pt;
				page-break-inside: avoid;
			}

			.footer-tagline {
				display: none;
			}
		}
	</style>
</head>
<body class="${options.forPrint ? 'print-export' : 'html-export'}">
	<main>
		<header class="document-header">
			<div class="brand-row">
				<div class="wordmark" aria-label="BuildOS">Build<span>OS</span></div>
				<div class="artifact-label">DOCUMENT</div>
			</div>
			<h1 class="document-title">${title}</h1>
			${description ? `<p class="description">${description}</p>` : ''}
			<div class="meta">
				<span class="state">${stateLabel}</span>
				<span class="meta-divider" aria-hidden="true"></span>
				<span>Updated ${updatedLabel}</span>
			</div>
		</header>
		<article class="document-body">
			${bodyHtml || '<p class="empty-state">No content yet.</p>'}
		</article>
		<footer class="document-footer">
			<span>Created in <span class="footer-brand">Build<span>OS</span></span></span>
			<span class="footer-tagline">Turn messy thinking into structured work.</span>
		</footer>
	</main>
	${
		options.autoPrint
			? `<script>
				window.addEventListener('load', function () {
					requestAnimationFrame(function () {
						setTimeout(function () {
							window.print();
						}, 150);
					});
				});
			</script>`
			: ''
	}
</body>
</html>`;
}

export function buildDocumentExportDocx(payload: DocumentExportPayload): Blob {
	const docxTitle = payload.title?.trim() || 'Untitled Document';
	const description = payload.description?.trim() || '';
	const blocks = markdownToWordBlocks(payload.markdown || '');
	const stateLabel = formatStateLabel(payload.stateKey);
	const updatedLabel = formatExportDate(payload.updatedAt);
	const documentXml = buildDocumentXml(docxTitle, description, stateLabel, updatedLabel, blocks);
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
	<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
	<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
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
			name: 'word/header1.xml',
			content: buildHeaderXml()
		},
		{
			name: 'word/footer1.xml',
			content: buildFooterXml()
		},
		{
			name: 'word/_rels/document.xml.rels',
			content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
	<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
	<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
	<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`
		}
	];

	return buildZipBlob(files, DOCX_MIME);
}

type ParagraphStyle =
	| 'Normal'
	| 'Title'
	| 'Subtitle'
	| 'Heading1'
	| 'Heading2'
	| 'Heading3'
	| 'Metadata'
	| 'ListParagraph'
	| 'Quote'
	| 'CodeBlock'
	| 'Divider';

type WordParagraph = {
	style: ParagraphStyle;
	text: string;
};

type WordTable = {
	headers: string[];
	rows: string[][];
};

type WordBlock = WordParagraph | WordTable;

function buildDocumentXml(
	title: string,
	description: string,
	stateLabel: string,
	updatedLabel: string,
	blocks: WordBlock[]
): string {
	const xmlParagraphs: string[] = [
		wordParagraph('Title', title),
		wordParagraph('Metadata', `${stateLabel.toUpperCase()} | Updated ${updatedLabel}`)
	];
	if (description) {
		xmlParagraphs.push(wordParagraph('Subtitle', description));
	}

	for (const block of blocks) {
		xmlParagraphs.push(
			'headers' in block ? wordTable(block) : wordParagraph(block.style, block.text)
		);
	}

	if (xmlParagraphs.length === 0) {
		xmlParagraphs.push(wordParagraph('Normal', ''));
	}

	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
	<w:body>
		${xmlParagraphs.join('\n\t\t')}
		<w:sectPr>
			<w:headerReference w:type="default" r:id="rId2"/>
			<w:footerReference w:type="default" r:id="rId3"/>
			<w:pgSz w:w="12240" w:h="15840"/>
			<w:pgMar w:top="1224" w:right="1296" w:bottom="1224" w:left="1296" w:header="540" w:footer="540" w:gutter="0"/>
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
				<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/>
				<w:color w:val="292620"/>
				<w:sz w:val="22"/>
				<w:szCs w:val="22"/>
			</w:rPr>
		</w:rPrDefault>
		<w:pPrDefault>
			<w:pPr>
				<w:spacing w:after="160" w:line="330" w:lineRule="auto"/>
			</w:pPr>
		</w:pPrDefault>
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
			<w:keepNext/>
			<w:spacing w:after="100"/>
			<w:pBdr>
				<w:bottom w:val="single" w:sz="18" w:space="10" w:color="F97316"/>
			</w:pBdr>
		</w:pPr>
		<w:rPr>
			<w:b/>
			<w:color w:val="211F1C"/>
			<w:kern w:val="28"/>
			<w:sz w:val="56"/>
			<w:szCs w:val="56"/>
		</w:rPr>
	</w:style>
	<w:style w:type="paragraph" w:styleId="Metadata">
		<w:name w:val="Document metadata"/>
		<w:basedOn w:val="Normal"/>
		<w:pPr>
			<w:keepNext/>
			<w:spacing w:before="80" w:after="160"/>
		</w:pPr>
		<w:rPr>
			<w:b/>
			<w:color w:val="736D64"/>
			<w:spacing w:val="12"/>
			<w:sz w:val="16"/>
			<w:szCs w:val="16"/>
		</w:rPr>
	</w:style>
	<w:style w:type="paragraph" w:styleId="Subtitle">
		<w:name w:val="Subtitle"/>
		<w:basedOn w:val="Normal"/>
		<w:qFormat/>
		<w:pPr>
			<w:spacing w:after="300" w:line="330" w:lineRule="auto"/>
		</w:pPr>
		<w:rPr>
			<w:color w:val="47423C"/>
			<w:sz w:val="24"/>
			<w:szCs w:val="24"/>
		</w:rPr>
	</w:style>
	<w:style w:type="paragraph" w:styleId="Heading1">
		<w:name w:val="Heading 1"/>
		<w:basedOn w:val="Normal"/>
		<w:qFormat/>
		<w:pPr>
			<w:keepNext/>
			<w:keepLines/>
			<w:spacing w:before="360" w:after="140"/>
		</w:pPr>
		<w:rPr>
			<w:b/>
			<w:color w:val="211F1C"/>
			<w:sz w:val="36"/>
			<w:szCs w:val="36"/>
		</w:rPr>
	</w:style>
	<w:style w:type="paragraph" w:styleId="Heading2">
		<w:name w:val="Heading 2"/>
		<w:basedOn w:val="Normal"/>
		<w:qFormat/>
		<w:pPr>
			<w:keepNext/>
			<w:keepLines/>
			<w:spacing w:before="300" w:after="120"/>
		</w:pPr>
		<w:rPr>
			<w:b/>
			<w:color w:val="292620"/>
			<w:sz w:val="29"/>
			<w:szCs w:val="29"/>
		</w:rPr>
	</w:style>
	<w:style w:type="paragraph" w:styleId="Heading3">
		<w:name w:val="Heading 3"/>
		<w:basedOn w:val="Normal"/>
		<w:qFormat/>
		<w:pPr>
			<w:keepNext/>
			<w:keepLines/>
			<w:spacing w:before="240" w:after="100"/>
		</w:pPr>
		<w:rPr>
			<w:b/>
			<w:color w:val="47423C"/>
			<w:sz w:val="24"/>
			<w:szCs w:val="24"/>
		</w:rPr>
	</w:style>
	<w:style w:type="paragraph" w:styleId="ListParagraph">
		<w:name w:val="List Paragraph"/>
		<w:basedOn w:val="Normal"/>
		<w:pPr>
			<w:ind w:left="420" w:hanging="260"/>
			<w:spacing w:after="80"/>
		</w:pPr>
	</w:style>
	<w:style w:type="paragraph" w:styleId="Quote">
		<w:name w:val="Quote"/>
		<w:basedOn w:val="Normal"/>
		<w:pPr>
			<w:pBdr>
				<w:left w:val="single" w:sz="20" w:space="10" w:color="F97316"/>
			</w:pBdr>
			<w:shd w:val="clear" w:color="auto" w:fill="FFF1E7"/>
			<w:ind w:left="360" w:right="180"/>
			<w:spacing w:before="100" w:after="140"/>
		</w:pPr>
		<w:rPr>
			<w:i/>
			<w:color w:val="47423C"/>
		</w:rPr>
	</w:style>
	<w:style w:type="paragraph" w:styleId="CodeBlock">
		<w:name w:val="Code Block"/>
		<w:basedOn w:val="Normal"/>
		<w:pPr>
			<w:shd w:val="clear" w:color="auto" w:fill="F4F1EB"/>
			<w:ind w:left="240" w:right="240"/>
			<w:spacing w:before="40" w:after="40" w:line="280" w:lineRule="auto"/>
		</w:pPr>
		<w:rPr>
			<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>
			<w:color w:val="3D3933"/>
			<w:sz w:val="20"/>
			<w:szCs w:val="20"/>
		</w:rPr>
	</w:style>
	<w:style w:type="paragraph" w:styleId="Divider">
		<w:name w:val="Divider"/>
		<w:basedOn w:val="Normal"/>
		<w:pPr>
			<w:pBdr>
				<w:bottom w:val="single" w:sz="6" w:space="8" w:color="DED8CE"/>
			</w:pBdr>
			<w:spacing w:before="160" w:after="220"/>
		</w:pPr>
	</w:style>
</w:styles>`;
}

function buildHeaderXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
	<w:p>
		<w:pPr>
			<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="5" w:color="F97316"/></w:pBdr>
			<w:spacing w:after="60"/>
		</w:pPr>
		<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="211F1C"/><w:sz w:val="19"/></w:rPr><w:t>Build</w:t></w:r>
		<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="F97316"/><w:sz w:val="19"/></w:rPr><w:t>OS</w:t></w:r>
		<w:r><w:rPr><w:color w:val="736D64"/><w:spacing w:val="12"/><w:sz w:val="14"/></w:rPr><w:t xml:space="preserve">  DOCUMENT</w:t></w:r>
	</w:p>
</w:hdr>`;
}

function buildFooterXml(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
	<w:p>
		<w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="5" w:color="DED8CE"/></w:pBdr></w:pPr>
		<w:r><w:rPr><w:color w:val="736D64"/><w:sz w:val="15"/></w:rPr><w:t xml:space="preserve">Created in </w:t></w:r>
		<w:r><w:rPr><w:b/><w:color w:val="47423C"/><w:sz w:val="15"/></w:rPr><w:t>Build</w:t></w:r>
		<w:r><w:rPr><w:b/><w:color w:val="F97316"/><w:sz w:val="15"/></w:rPr><w:t>OS</w:t></w:r>
		<w:r><w:rPr><w:color w:val="736D64"/><w:sz w:val="15"/></w:rPr><w:t xml:space="preserve">  |  Page </w:t></w:r>
		<w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:color w:val="736D64"/><w:sz w:val="15"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>
	</w:p>
</w:ftr>`;
}

function wordParagraph(style: ParagraphStyle, text: string): string {
	if (!text) {
		return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr></w:p>`;
	}
	return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(
		text
	)}</w:t></w:r></w:p>`;
}

function wordTable(table: WordTable): string {
	const headerRow = wordTableRow(table.headers, true);
	const bodyRows = table.rows.map((row) => wordTableRow(row, false)).join('');

	return `<w:tbl>
	<w:tblPr>
		<w:tblW w:w="5000" w:type="pct"/>
		<w:tblLayout w:type="autofit"/>
		<w:tblCellMar>
			<w:top w:w="100" w:type="dxa"/>
			<w:left w:w="120" w:type="dxa"/>
			<w:bottom w:w="100" w:type="dxa"/>
			<w:right w:w="120" w:type="dxa"/>
		</w:tblCellMar>
		<w:tblBorders>
			<w:top w:val="single" w:sz="5" w:color="C9C0B2"/>
			<w:left w:val="single" w:sz="5" w:color="C9C0B2"/>
			<w:bottom w:val="single" w:sz="5" w:color="C9C0B2"/>
			<w:right w:val="single" w:sz="5" w:color="C9C0B2"/>
			<w:insideH w:val="single" w:sz="4" w:color="DED8CE"/>
			<w:insideV w:val="single" w:sz="4" w:color="DED8CE"/>
		</w:tblBorders>
	</w:tblPr>
	${headerRow}${bodyRows}
</w:tbl>
<w:p/>`;
}

function wordTableRow(cells: string[], isHeader: boolean): string {
	const cellXml = cells
		.map((cell) => {
			const shading = isHeader
				? '<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F4F1EB"/></w:tcPr>'
				: '<w:tcPr/>';
			const runProperties = isHeader ? '<w:rPr><w:b/><w:color w:val="292620"/></w:rPr>' : '';
			return `<w:tc>${shading}<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r>${runProperties}<w:t xml:space="preserve">${escapeXml(
				cell
			)}</w:t></w:r></w:p></w:tc>`;
		})
		.join('');

	return `<w:tr><w:trPr>${isHeader ? '<w:tblHeader/>' : ''}<w:cantSplit/></w:trPr>${cellXml}</w:tr>`;
}

function markdownToWordBlocks(markdown: string): WordBlock[] {
	const lines = markdown.replace(/\r\n/g, '\n').split('\n');
	const blocks: WordBlock[] = [];
	let inCodeFence = false;

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const rawLine = lines[lineIndex];
		const line = rawLine ?? '';
		const trimmed = line.trim();

		if (trimmed.startsWith('```')) {
			inCodeFence = !inCodeFence;
			continue;
		}

		if (!trimmed) {
			continue;
		}

		if (inCodeFence) {
			blocks.push({ style: 'CodeBlock', text: line });
			continue;
		}

		const nextLine = lines[lineIndex + 1] ?? '';
		if (line.includes('|') && isMarkdownTableDivider(nextLine)) {
			const headers = parseMarkdownTableRow(line);
			const rows: string[][] = [];
			lineIndex += 2;

			while (lineIndex < lines.length && (lines[lineIndex] ?? '').includes('|')) {
				rows.push(parseMarkdownTableRow(lines[lineIndex] ?? ''));
				lineIndex += 1;
			}
			lineIndex -= 1;
			blocks.push({ headers, rows });
			continue;
		}

		const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
		if (headingMatch) {
			const level = (headingMatch[1] ?? '').length;
			const style: ParagraphStyle =
				level === 1 ? 'Heading1' : level === 2 ? 'Heading2' : 'Heading3';
			blocks.push({ style, text: stripInlineMarkdown(headingMatch[2] ?? '') });
			continue;
		}

		if (/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
			blocks.push({ style: 'Divider', text: '' });
			continue;
		}

		const blockquoteMatch = line.match(/^>\s?(.*)$/);
		if (blockquoteMatch) {
			blocks.push({
				style: 'Quote',
				text: stripInlineMarkdown(blockquoteMatch[1] ?? '')
			});
			continue;
		}

		const unorderedListMatch = line.match(/^\s*[-*+]\s+(.*)$/);
		if (unorderedListMatch) {
			blocks.push({
				style: 'ListParagraph',
				text: `- ${stripInlineMarkdown(unorderedListMatch[1] ?? '')}`
			});
			continue;
		}

		const orderedListMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
		if (orderedListMatch) {
			blocks.push({
				style: 'ListParagraph',
				text: `${orderedListMatch[1] ?? '1'}. ${stripInlineMarkdown(orderedListMatch[2] ?? '')}`
			});
			continue;
		}

		blocks.push({ style: 'Normal', text: stripInlineMarkdown(line) });
	}

	return blocks;
}

function isMarkdownTableDivider(line: string): boolean {
	const cells = parseMarkdownTableRow(line);
	return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseMarkdownTableRow(line: string): string[] {
	return line
		.trim()
		.replace(/^\|/, '')
		.replace(/\|$/, '')
		.split('|')
		.map((cell) => stripInlineMarkdown(cell.replace(/\\\|/g, '|').trim()));
}

function stripInlineMarkdown(text: string): string {
	return text
		.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, src: string) => {
			const safeAlt = alt?.trim() || 'image';
			return `[Image: ${safeAlt}] (${src})`;
		})
		.replace(
			/\[([^\]]+)\]\(([^)]+)\)/g,
			(_, label: string, href: string) => `${label} (${href})`
		)
		.replace(/`([^`]+)`/g, '$1')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/__([^_]+)__/g, '$1')
		.replace(/~~([^~]+)~~/g, '$1')
		.replace(/\*([^*]+)\*/g, '$1')
		.replace(/_([^_]+)_/g, '$1')
		.trim();
}

function formatStateLabel(stateKey?: string | null): string {
	const normalized = stateKey?.trim().replace(/[_-]+/g, ' ') || 'draft';
	return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatExportDate(value?: string | null): string {
	const candidate = value ? new Date(value) : new Date();
	const date = Number.isNaN(candidate.getTime()) ? new Date() : candidate;

	return new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	}).format(date);
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
