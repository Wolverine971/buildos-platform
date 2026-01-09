// apps/web/src/lib/services/agentic-chat/tools/webvisit/parser.ts
import sanitizeHtml from 'sanitize-html';
import type { WebVisitLink, WebVisitParser } from './types';

const STRIP_BLOCK_TAGS = ['script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'form'];
const NOISE_TAGS = ['header', 'footer', 'nav', 'aside'];
const DEFAULT_MAX_LINKS = 20;
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

function extractLargestBlock(html: string, tag: string): string | null {
	const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
	let best: string | null = null;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(html))) {
		const candidate = match[1] ?? '';
		if (!candidate) continue;
		if (!best || candidate.length > best.length) {
			best = candidate;
		}
	}
	return best;
}

function extractMainHtml(html: string): string {
	const article = extractLargestBlock(html, 'article');
	if (article) return article;

	const main = extractLargestBlock(html, 'main');
	if (main) return main;

	const body = extractLargestBlock(html, 'body');
	if (body) return body;

	return html;
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

export function parseHtmlToText(
	html: string,
	options: {
		mode: 'reader' | 'raw';
		includeLinks?: boolean;
		baseUrl: string;
		maxLinks?: number;
	}
): { title?: string; content: string; links?: WebVisitLink[]; parser: WebVisitParser } {
	let stripped = stripTagBlocks(html, STRIP_BLOCK_TAGS);
	if (options.mode === 'reader') {
		stripped = stripTagBlocks(stripped, NOISE_TAGS);
	}
	const title = extractTitle(stripped);

	let parser: WebVisitParser = options.mode === 'reader' ? 'reader' : 'raw';
	let contentSource = stripped;
	if (options.mode === 'reader') {
		contentSource = extractMainHtml(stripped);
	}

	let content = htmlToText(contentSource);
	if (!content && options.mode === 'reader') {
		const fallback = htmlToText(stripped);
		if (fallback) {
			content = fallback;
			parser = 'raw';
		}
	}

	const links = options.includeLinks
		? extractLinks(contentSource, options.baseUrl, options.maxLinks)
		: undefined;

	return { title, content, links, parser };
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
): { title?: string; html: string; parser: WebVisitParser } {
	let stripped = stripTagBlocks(html, STRIP_BLOCK_TAGS);
	if (options.mode === 'reader') {
		stripped = stripTagBlocks(stripped, NOISE_TAGS);
	}
	const title = extractTitle(stripped);

	let parser: WebVisitParser = options.mode === 'reader' ? 'reader' : 'raw';
	let contentSource = stripped;
	if (options.mode === 'reader') {
		contentSource = extractMainHtml(stripped);
	}

	const sanitized = sanitizeHtmlForMarkdown(contentSource, options.baseUrl).trim();
	if (!sanitized && options.mode === 'reader') {
		const fallback = sanitizeHtmlForMarkdown(stripped, options.baseUrl).trim();
		if (fallback) {
			return { title, html: fallback, parser: 'raw' };
		}
	}

	return { title, html: sanitized, parser };
}

export function normalizePlainText(text: string): string {
	return normalizeWhitespace(decodeHtmlEntities(text));
}
