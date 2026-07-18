// apps/web/src/lib/services/agentic-chat/tools/webvisit/markdown.ts
//
// Deterministic HTML→Markdown conversion for web_visit. This replaced the
// LLM-based converter (2026-07-18): converting via a non-streaming balanced-lane
// LLM call took 25s+ per model attempt inside a 60s tool timeout and failed on
// large real-world pages, while Turndown handles the same trimmed HTML in
// milliseconds. The input is the sanitized, reader-extracted HTML produced by
// prepareHtmlForMarkdown, never raw fetched markup.
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

let sharedService: TurndownService | null = null;

function getTurndownService(): TurndownService {
	if (sharedService) return sharedService;
	const service = new TurndownService({
		headingStyle: 'atx',
		codeBlockStyle: 'fenced',
		bulletListMarker: '-',
		emDelimiter: '_',
		hr: '---'
	});
	service.use(gfm);
	sharedService = service;
	return service;
}

export interface HtmlToMarkdownResult {
	markdown: string;
	conversionMs: number;
}

export function convertHtmlToMarkdown(html: string): HtmlToMarkdownResult {
	const start = performance.now();
	const trimmed = html.trim();
	if (!trimmed) {
		return { markdown: '', conversionMs: 0 };
	}

	const raw = getTurndownService().turndown(trimmed);
	// Order matters: <br> renders as trailing-spaces + newline, so trailing
	// whitespace must be stripped before blank-line collapsing can see \n runs.
	const markdown = raw
		.replace(/[ \t]+$/gm, '')
		.replace(/\n{3,}/g, '\n\n')
		.replace(/^(\s*)-\s{3}/gm, '$1- ')
		.trim();

	return {
		markdown,
		conversionMs: Math.round(performance.now() - start)
	};
}
