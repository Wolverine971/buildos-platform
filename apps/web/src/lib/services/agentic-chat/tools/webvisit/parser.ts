// apps/web/src/lib/services/agentic-chat/tools/webvisit/parser.ts
import sanitizeHtml from 'sanitize-html';
import type { WebVisitLink, WebVisitParser } from './types';

const STRIP_BLOCK_TAGS = ['script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'form'];
const NOISE_TAGS = ['header', 'footer', 'nav', 'aside'];
const DEFAULT_MAX_LINKS = 20;

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

export function normalizePlainText(text: string): string {
	return normalizeWhitespace(decodeHtmlEntities(text));
}
