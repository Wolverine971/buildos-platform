// apps/web/src/lib/services/agentic-chat/tools/webvisit/types.ts
//
// Types for the HTML parser. The web_visit tool itself runs in the worker; this
// parser stays only for the web-navigation research probes
// (docs/research/web-navigation-2026-09-22/) that import parseHtmlToText.

export type WebVisitExtractionStrategy = 'raw' | 'article' | 'main' | 'body' | 'html';

export interface WebVisitLink {
	url: string;
	text?: string;
}

export type WebVisitParser = 'reader' | 'raw' | 'text';

export interface WebVisitStructuredDataItem {
	type?: string | string[];
	name?: string;
	url?: string;
	description?: string;
	[key: string]: unknown;
}
