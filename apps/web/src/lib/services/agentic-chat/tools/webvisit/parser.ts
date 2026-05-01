// apps/web/src/lib/services/agentic-chat/tools/webvisit/parser.ts
import sanitizeHtml from 'sanitize-html';
import type {
	WebVisitExtractionStrategy,
	WebVisitLink,
	WebVisitParser,
	WebVisitStructuredDataItem
} from './types';

const STRIP_BLOCK_TAGS = ['script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'form'];
const NOISE_TAGS = ['header', 'footer', 'nav', 'aside'];
const DEFAULT_MAX_LINKS = 20;
const MAX_STRUCTURED_DATA_ITEMS = 40;
const MAX_STRUCTURED_ARRAY_ITEMS = 30;
const MAX_STRUCTURED_OBJECT_KEYS = 50;
const MAX_STRUCTURED_DEPTH = 6;
const MAX_STRUCTURED_STRING_CHARS = 4000;
const META_ALLOWED_KEYS = new Set([
	'description',
	'author',
	'keywords',
	'robots',
	'generator',
	'theme-color'
]);
const MARKDOWN_ALLOWED_TAGS = [
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'p',
	'ul',
	'ol',
	'li',
	'table',
	'thead',
	'tbody',
	'tr',
	'th',
	'td',
	'blockquote',
	'pre',
	'code',
	'a',
	'img',
	'strong',
	'em',
	'b',
	'i',
	'time',
	'br',
	'hr'
];
const MARKDOWN_ALLOWED_ATTRIBUTES: Record<string, string[]> = {
	a: ['href', 'title'],
	img: ['src', 'alt', 'title'],
	th: ['colspan', 'rowspan'],
	td: ['colspan', 'rowspan']
};

const BLOCK_TAG_REGEX =
	/(<\/?(p|div|section|article|main|header|footer|nav|aside|li|ul|ol|h[1-6]|tr|td|th|table|blockquote|pre)\b[^>]*>)/gi;

function stripTagBlocks(html: string, tags: string[]): string {
	let output = html;
	for (const tag of tags) {
		const regex = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
		output = output.replace(regex, ' ');
	}
	return output;
}

type HtmlBlock = {
	html: string;
	textLength: number;
};

type SelectedHtml = {
	html: string;
	strategy: WebVisitExtractionStrategy;
};

function extractBlocks(html: string, tag: string): HtmlBlock[] {
	const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
	const blocks: HtmlBlock[] = [];
	let match: RegExpExecArray | null;
	while ((match = regex.exec(html))) {
		const candidate = match[1] ?? '';
		if (!candidate) continue;
		blocks.push({
			html: candidate,
			textLength: stripTags(candidate).length
		});
	}
	return blocks.sort((a, b) => b.textLength - a.textLength);
}

function extractLargestBlock(html: string, tag: string): HtmlBlock | null {
	return extractBlocks(html, tag)[0] ?? null;
}

function countTags(html: string, tag: string): number {
	const regex = new RegExp(`<${tag}\\b`, 'gi');
	return html.match(regex)?.length ?? 0;
}

function selectReaderHtml(html: string): SelectedHtml {
	const main = extractLargestBlock(html, 'main');
	const articles = extractBlocks(html, 'article').filter((block) => block.textLength > 0);

	if (main && main.textLength > 0) {
		const articlesInsideMain = countTags(main.html, 'article');
		const singleArticle = articles.length === 1 ? articles[0] : null;
		if (
			singleArticle &&
			articlesInsideMain <= 1 &&
			singleArticle.textLength >= 400 &&
			singleArticle.textLength >= main.textLength * 0.55
		) {
			return { html: singleArticle.html, strategy: 'article' };
		}
		return { html: main.html, strategy: 'main' };
	}

	if (articles.length === 1) {
		const article = articles[0];
		if (article) {
			return { html: article.html, strategy: 'article' };
		}
	}

	const body = extractLargestBlock(html, 'body');
	if (body && body.textLength > 0) {
		return { html: body.html, strategy: 'body' };
	}

	return { html, strategy: 'html' };
}

function decodeHtmlEntities(text: string): string {
	const namedEntities: Record<string, string> = {
		amp: '&',
		lt: '<',
		gt: '>',
		quot: '"',
		apos: "'",
		nbsp: ' '
	};

	return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity) => {
		if (entity.startsWith('#x')) {
			const codePoint = Number.parseInt(entity.slice(2), 16);
			return Number.isFinite(codePoint) && codePoint <= 0x10ffff
				? String.fromCodePoint(codePoint)
				: match;
		}
		if (entity.startsWith('#')) {
			const codePoint = Number.parseInt(entity.slice(1), 10);
			return Number.isFinite(codePoint) && codePoint <= 0x10ffff
				? String.fromCodePoint(codePoint)
				: match;
		}
		return namedEntities[entity] ?? match;
	});
}

function parseTagAttributes(tag: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	const regex = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(tag))) {
		const rawName = match[1]?.toLowerCase();
		if (!rawName) continue;
		const value = match[2] ?? match[3] ?? match[4] ?? '';
		if (!value) continue;
		attrs[rawName] = decodeHtmlEntities(value.trim());
	}
	return attrs;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanJsonLdText(raw: string): string {
	return raw
		.trim()
		.replace(/^<!--\s*/, '')
		.replace(/\s*-->$/, '')
		.trim();
}

function collectJsonLdItems(value: unknown): unknown[] {
	if (Array.isArray(value)) {
		return value.flatMap((item) => collectJsonLdItems(item));
	}

	if (!isPlainRecord(value)) {
		return [];
	}

	const graph = value['@graph'];
	if (Array.isArray(graph)) {
		const graphItems = graph.flatMap((item) => collectJsonLdItems(item));
		const wrapper = { ...value };
		delete wrapper['@graph'];
		if (isStructuredDataCandidate(wrapper)) {
			return [wrapper, ...graphItems];
		}
		return graphItems;
	}

	return [value];
}

function normalizeStructuredDataKey(key: string): string | null {
	if (!key || key === '@context') return null;
	if (key === '@type') return 'type';
	if (key === '@id') return 'id';
	if (key === '__proto__' || key === 'prototype' || key === 'constructor') return null;
	return key;
}

function sanitizeStructuredDataValue(value: unknown, depth = 0): unknown {
	if (value === null) return null;
	if (typeof value === 'string') {
		const cleaned = normalizeWhitespace(decodeHtmlEntities(value));
		return cleaned.length > MAX_STRUCTURED_STRING_CHARS
			? `${cleaned.slice(0, MAX_STRUCTURED_STRING_CHARS)}...`
			: cleaned;
	}
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : undefined;
	}
	if (typeof value === 'boolean') {
		return value;
	}
	if (depth >= MAX_STRUCTURED_DEPTH) {
		return undefined;
	}
	if (Array.isArray(value)) {
		const items = value
			.slice(0, MAX_STRUCTURED_ARRAY_ITEMS)
			.map((item) => sanitizeStructuredDataValue(item, depth + 1))
			.filter((item) => item !== undefined);
		return items.length > 0 ? items : undefined;
	}
	if (!isPlainRecord(value)) {
		return undefined;
	}

	const output: Record<string, unknown> = {};
	for (const [rawKey, rawValue] of Object.entries(value).slice(0, MAX_STRUCTURED_OBJECT_KEYS)) {
		const key = normalizeStructuredDataKey(rawKey);
		if (!key) continue;
		const sanitized = sanitizeStructuredDataValue(rawValue, depth + 1);
		if (sanitized !== undefined) {
			output[key] = sanitized;
		}
	}

	return Object.keys(output).length > 0 ? output : undefined;
}

function isStructuredDataCandidate(value: unknown): boolean {
	if (!isPlainRecord(value)) return false;
	return Boolean(
		value['@type'] ??
			value.type ??
			value.name ??
			value.url ??
			value.startDate ??
			value.itemListElement
	);
}

function stringifyStructuredDataIdentity(value: WebVisitStructuredDataItem): string {
	const type = Array.isArray(value.type) ? value.type.join(',') : (value.type ?? '');
	const name = typeof value.name === 'string' ? value.name : '';
	const url = typeof value.url === 'string' ? value.url : '';
	const startDate =
		typeof (value as Record<string, unknown>).startDate === 'string'
			? ((value as Record<string, unknown>).startDate as string)
			: '';
	const identity = `${type}|${name}|${url}|${startDate}`;
	if (identity !== '|||') return identity;
	try {
		return JSON.stringify(value).slice(0, 500);
	} catch {
		return '';
	}
}

function normalizeUrlAttribute(value: string, baseUrl: string): string | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (trimmed.startsWith('#')) return trimmed;
	if (/^(mailto:|tel:)/i.test(trimmed)) return trimmed;
	if (/^(javascript:|data:)/i.test(trimmed)) return undefined;
	try {
		if (trimmed.startsWith('//')) {
			const base = new URL(baseUrl);
			return `${base.protocol}${trimmed}`;
		}
		return new URL(trimmed, baseUrl).toString();
	} catch {
		return undefined;
	}
}

function sanitizeHtmlForMarkdown(html: string, baseUrl: string): string {
	return sanitizeHtml(html, {
		allowedTags: MARKDOWN_ALLOWED_TAGS,
		allowedAttributes: MARKDOWN_ALLOWED_ATTRIBUTES,
		allowedSchemes: ['http', 'https', 'mailto', 'tel'],
		transformTags: {
			a: (tagName, attribs) => {
				const href = attribs.href
					? normalizeUrlAttribute(attribs.href, baseUrl)
					: undefined;
				const next: Record<string, string> = {};
				if (href) next.href = href;
				if (attribs.title) next.title = attribs.title;
				return { tagName, attribs: next };
			},
			img: (tagName, attribs) => {
				const src = attribs.src ? normalizeUrlAttribute(attribs.src, baseUrl) : undefined;
				const next: Record<string, string> = {};
				if (src) next.src = src;
				if (attribs.alt) next.alt = attribs.alt;
				if (attribs.title) next.title = attribs.title;
				return { tagName, attribs: next };
			}
		}
	});
}

function normalizeWhitespace(text: string): string {
	const lines = text
		.replace(/\r/g, '\n')
		.split('\n')
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter((line) => line.length > 0);
	return lines.join('\n');
}

function htmlToText(html: string): string {
	let normalized = html.replace(/<\s*br\s*\/?>/gi, '\n');
	normalized = normalized.replace(BLOCK_TAG_REGEX, '\n');
	const stripped = sanitizeHtml(normalized, { allowedTags: [], allowedAttributes: {} });
	return normalizeWhitespace(decodeHtmlEntities(stripped));
}

function stripTags(html: string): string {
	const stripped = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
	return normalizeWhitespace(decodeHtmlEntities(stripped));
}

function extractTitle(html: string): string | undefined {
	const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
	if (titleMatch?.[1]) {
		const title = stripTags(titleMatch[1]);
		if (title) return title;
	}

	const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
	if (h1Match?.[1]) {
		const title = stripTags(h1Match[1]);
		if (title) return title;
	}

	return undefined;
}

function isRelevantMetaKey(key: string): boolean {
	if (key.startsWith('og:') || key.startsWith('twitter:')) return true;
	return META_ALLOWED_KEYS.has(key);
}

function extractCanonicalUrl(html: string, baseUrl: string): string | undefined {
	const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
	for (const tag of linkTags) {
		const attrs = parseTagAttributes(tag);
		const rel = attrs.rel?.toLowerCase();
		if (!rel || !rel.split(/\s+/).includes('canonical')) continue;
		if (!attrs.href) continue;
		const resolved = normalizeUrlAttribute(attrs.href, baseUrl);
		if (resolved && resolved.startsWith('http')) {
			return resolved;
		}
	}
	return undefined;
}

function extractHtmlLang(html: string): string | undefined {
	const htmlTag = html.match(/<html\b[^>]*>/i)?.[0];
	if (!htmlTag) return undefined;
	const attrs = parseTagAttributes(htmlTag);
	return attrs.lang;
}

function extractLinks(
	html: string,
	baseUrl: string,
	maxLinks: number = DEFAULT_MAX_LINKS
): WebVisitLink[] {
	const links: WebVisitLink[] = [];
	const seenUrls = new Set<string>();
	const seenHosts = new Set<string>();
	const regex = /<a\b[^>]*href\s*=\s*(['"]?)([^'" >]+)\1[^>]*>([\s\S]*?)<\/a>/gi;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(html))) {
		const href = match[2]?.trim();
		if (!href || href.startsWith('#')) continue;
		if (/^(javascript|mailto|tel):/i.test(href)) continue;

		let resolved: URL;
		try {
			resolved = new URL(href, baseUrl);
		} catch {
			continue;
		}

		if (!['http:', 'https:'].includes(resolved.protocol)) continue;

		const url = resolved.toString();
		if (seenUrls.has(url)) continue;

		const host = resolved.hostname;
		if (seenHosts.has(host)) continue;

		const text = stripTags(match[3] ?? '').slice(0, 140) || undefined;
		links.push({ url, text });
		seenUrls.add(url);
		seenHosts.add(host);

		if (links.length >= maxLinks) break;
	}

	return links;
}

export function extractStructuredData(html: string): WebVisitStructuredDataItem[] {
	const items: WebVisitStructuredDataItem[] = [];
	const seen = new Set<string>();
	const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
	let match: RegExpExecArray | null;

	while ((match = scriptRegex.exec(html))) {
		const attrs = parseTagAttributes(match[1] ?? '');
		const type = attrs.type?.trim().toLowerCase().replace(/\s+/g, '');
		if (!type?.startsWith('application/ld+json')) continue;

		const rawJson = cleanJsonLdText(match[2] ?? '');
		if (!rawJson) continue;

		let parsed: unknown;
		try {
			parsed = JSON.parse(rawJson);
		} catch {
			continue;
		}

		for (const rawItem of collectJsonLdItems(parsed)) {
			if (!isStructuredDataCandidate(rawItem)) continue;
			const sanitized = sanitizeStructuredDataValue(rawItem);
			if (!isPlainRecord(sanitized)) continue;

			const item = sanitized as WebVisitStructuredDataItem;
			const identity = stringifyStructuredDataIdentity(item);
			if (identity && seen.has(identity)) continue;
			seen.add(identity);
			items.push(item);
			if (items.length >= MAX_STRUCTURED_DATA_ITEMS) {
				return items;
			}
		}
	}

	return items;
}

export function parseHtmlToText(
	html: string,
	options: {
		mode: 'reader' | 'raw';
		includeLinks?: boolean;
		baseUrl: string;
		maxLinks?: number;
	}
): {
	title?: string;
	content: string;
	links?: WebVisitLink[];
	parser: WebVisitParser;
	extraction_strategy: WebVisitExtractionStrategy;
} {
	let stripped = stripTagBlocks(html, STRIP_BLOCK_TAGS);
	if (options.mode === 'reader') {
		stripped = stripTagBlocks(stripped, NOISE_TAGS);
	}
	const title = extractTitle(stripped);

	let parser: WebVisitParser = options.mode === 'reader' ? 'reader' : 'raw';
	let contentSource = stripped;
	let extractionStrategy: WebVisitExtractionStrategy = options.mode === 'reader' ? 'html' : 'raw';
	if (options.mode === 'reader') {
		const selected = selectReaderHtml(stripped);
		contentSource = selected.html;
		extractionStrategy = selected.strategy;
	}

	let content = htmlToText(contentSource);
	if (!content && options.mode === 'reader') {
		const fallback = htmlToText(stripped);
		if (fallback) {
			content = fallback;
			parser = 'raw';
			extractionStrategy = 'raw';
		}
	}

	const links = options.includeLinks
		? extractLinks(contentSource, options.baseUrl, options.maxLinks)
		: undefined;

	return { title, content, links, parser, extraction_strategy: extractionStrategy };
}

export function extractPageMetadata(
	html: string,
	baseUrl: string
): {
	title?: string;
	description?: string;
	canonical_url?: string;
	lang?: string;
	meta: Record<string, string>;
} {
	const meta: Record<string, string> = {};
	const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];

	for (const tag of metaTags) {
		const attrs = parseTagAttributes(tag);
		const key = attrs.name?.toLowerCase() ?? attrs.property?.toLowerCase();
		const content = attrs.content ?? attrs.value;
		if (!key || !content) continue;
		if (!isRelevantMetaKey(key)) continue;
		if (!meta[key]) {
			meta[key] = content.trim();
		}
	}

	const canonicalUrl = extractCanonicalUrl(html, baseUrl);
	const lang = extractHtmlLang(html);
	const title = meta['og:title'] || meta['twitter:title'] || extractTitle(html);
	const description = meta.description || meta['og:description'] || meta['twitter:description'];

	if (lang) {
		meta.lang = meta.lang ?? lang;
	}

	if (canonicalUrl) {
		meta.canonical_url = meta.canonical_url ?? canonicalUrl;
	}

	return {
		title: title ? stripTags(title) : undefined,
		description: description ? stripTags(description) : undefined,
		canonical_url: canonicalUrl,
		lang,
		meta
	};
}

export function prepareHtmlForMarkdown(
	html: string,
	options: {
		mode: 'reader' | 'raw';
		baseUrl: string;
	}
): {
	title?: string;
	html: string;
	parser: WebVisitParser;
	extraction_strategy: WebVisitExtractionStrategy;
} {
	let stripped = stripTagBlocks(html, STRIP_BLOCK_TAGS);
	if (options.mode === 'reader') {
		stripped = stripTagBlocks(stripped, NOISE_TAGS);
	}
	const title = extractTitle(stripped);

	let parser: WebVisitParser = options.mode === 'reader' ? 'reader' : 'raw';
	let contentSource = stripped;
	let extractionStrategy: WebVisitExtractionStrategy = options.mode === 'reader' ? 'html' : 'raw';
	if (options.mode === 'reader') {
		const selected = selectReaderHtml(stripped);
		contentSource = selected.html;
		extractionStrategy = selected.strategy;
	}

	const sanitized = sanitizeHtmlForMarkdown(contentSource, options.baseUrl).trim();
	if (!sanitized && options.mode === 'reader') {
		const fallback = sanitizeHtmlForMarkdown(stripped, options.baseUrl).trim();
		if (fallback) {
			return { title, html: fallback, parser: 'raw', extraction_strategy: 'raw' };
		}
	}

	return { title, html: sanitized, parser, extraction_strategy: extractionStrategy };
}

export function normalizePlainText(text: string): string {
	return normalizeWhitespace(decodeHtmlEntities(text));
}
