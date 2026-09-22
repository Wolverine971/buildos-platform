// packages/shared-agent-ops/src/web/page-reader.ts
//
// One HTML pass for web research: readable main-content text plus every link a
// reader could click. sanitize-html tokenizes linearly, so hostile markup (e.g.
// megabytes of unclosed <script>) cannot trigger regex backtracking; the only
// regexes below run over its attribute-free, well-formed output.
import sanitizeHtml from 'sanitize-html';

export interface PageLink {
	url: string;
	/** Anchor text (or aria-label/title); several anchors to one URL are merged. */
	label: string;
	/** Up to ~90 chars of text just before the first anchor ("Read more" context). */
	context: string;
	/** Same approximate registrable domain as the page. Used for ordering only. */
	sameSite: boolean;
}

export type PageReaderStrategy = 'main' | 'article' | 'body' | 'full';

export interface ReadHtmlPageResult {
	title?: string;
	text: string;
	strategy: PageReaderStrategy;
	links: PageLink[];
	/** Links dropped by `maxLinks`. */
	linksTruncated: number;
}

// Content never worth reading. <form> is deliberately absent: ASP.NET and
// SharePoint sites wrap the entire body in one form, so discarding it emptied
// whole government pages. Dropping <select> removes the option lists (e.g. a
// 76-language picker) that made forms noisy.
const DISCARD_TAGS = [
	'script',
	'style',
	'noscript',
	'svg',
	'canvas',
	'iframe',
	'template',
	'object',
	'embed',
	'select',
	'textarea',
	'title',
	'head'
];
// Site chrome: dropped for reading, kept when listing links.
const CHROME_TAGS = ['nav', 'header', 'footer', 'aside'];
const BLOCK_TAGS = [
	'address',
	'article',
	'blockquote',
	'br',
	'dd',
	'div',
	'dl',
	'dt',
	'figcaption',
	'figure',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'hr',
	'li',
	'main',
	'ol',
	'p',
	'pre',
	'section',
	'table',
	'td',
	'th',
	'tr',
	'ul'
];
const MIN_READER_CHARS = 200;
const DEFAULT_MAX_LINKS = 600;
const LINK_LABEL_CHARS = 90;
const LINK_CONTEXT_CHARS = 90;
// Asset URLs are never pages to navigate to (URL structure, not language).
const ASSET_PATH =
	/\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|map|zip|gz|mp4|webm|mov|mp3|wav|woff2?|ttf|eot|rss|atom)$/i;

export function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => {
			const codePoint = Number.parseInt(hex, 16);
			return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
		})
		.replace(/&#(\d+);/g, (match, decimal: string) => {
			const codePoint = Number.parseInt(decimal, 10);
			return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
		})
		.replace(/&nbsp;/gi, ' ')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&amp;/gi, '&');
}

export function normalizeReadableText(value: string): string {
	return value
		.replace(/\r\n?/g, '\n')
		.replace(/[^\S\n]+/g, ' ')
		.replace(/ *\n */g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function inlineText(fragment: string): string {
	return decodeHtmlEntities(fragment.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();
}

/** Approximate registrable domain (last two labels). Only orders links. */
function siteOf(hostname: string): string {
	return hostname
		.toLowerCase()
		.replace(/^www\./, '')
		.split('.')
		.slice(-2)
		.join('.');
}

function structuralHtml(html: string, dropChrome: boolean): string {
	return sanitizeHtml(html, {
		allowedTags: BLOCK_TAGS,
		allowedAttributes: {},
		nonTextTags: dropChrome ? [...DISCARD_TAGS, ...CHROME_TAGS] : DISCARD_TAGS
	});
}

// Only block tags survive structuralHtml, so every remaining tag is a line break.
function blocksToText(fragment: string): string {
	return normalizeReadableText(decodeHtmlEntities(fragment.replace(/<[^>]*>/g, '\n')));
}

function largestBlock(
	structural: string,
	tag: 'main' | 'article'
): { html: string; chars: number; count: number } | null {
	// Sanitized output has attribute-free, balanced tags; lazy matching finds the
	// outermost-first block for each opening tag without nesting ambiguity for
	// these rarely nested elements.
	let best: { html: string; chars: number } | null = null;
	let count = 0;
	for (const match of structural.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))) {
		count += 1;
		const html = match[1] ?? '';
		const chars = inlineText(html).length;
		if (!best || chars > best.chars) best = { html, chars };
	}
	return best ? { ...best, count } : null;
}

/** Readable main-content text only (no link extraction). */
export function readHtmlMainText(html: string): { text: string; strategy: PageReaderStrategy } {
	const structural = structuralHtml(html, true);
	const bodyText = blocksToText(structural);
	const main = largestBlock(structural, 'main');
	if (main && main.chars >= MIN_READER_CHARS) {
		return { text: blocksToText(main.html), strategy: 'main' };
	}
	const article = largestBlock(structural, 'article');
	// One article, or one that holds most of the page, is the content; a feed of
	// many small articles is better read whole.
	if (
		article &&
		article.chars >= MIN_READER_CHARS &&
		(article.count === 1 || article.chars >= bodyText.length * 0.5)
	) {
		return { text: blocksToText(article.html), strategy: 'article' };
	}
	if (bodyText.length >= MIN_READER_CHARS) return { text: bodyText, strategy: 'body' };
	// Chrome-only or app-shell pages: keep whatever text exists anywhere.
	const full = blocksToText(structuralHtml(html, false));
	return full.length > bodyText.length
		? { text: full, strategy: 'full' }
		: { text: bodyText, strategy: 'body' };
}

export function readHtmlTitle(html: string): string | undefined {
	const match = html.slice(0, 200_000).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
	if (!match) return undefined;
	const title = inlineText(sanitizeHtml(match[1] ?? '', { allowedTags: [] })).slice(0, 300);
	return title || undefined;
}

export function extractPageLinks(
	html: string,
	pageUrl: string,
	options: { maxLinks?: number; exclude?: ReadonlySet<string> } = {}
): { links: PageLink[]; truncated: number } {
	// Block tags survive so card-style anchors (<a><h3>Database</h3><p>Supabase
	// provides…</p></a>) read "Database Supabase provides…", not "DatabaseSupabase".
	const anchorsOnly = sanitizeHtml(html, {
		allowedTags: ['a', ...BLOCK_TAGS],
		allowedAttributes: { a: ['href', 'aria-label', 'title'] },
		nonTextTags: DISCARD_TAGS
	});
	const pageHost = new URL(pageUrl).hostname.toLowerCase();
	const site = siteOf(pageHost);
	const byUrl = new Map<string, PageLink>();
	for (const match of anchorsOnly.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
		const attrs = match[1] ?? '';
		const href = decodeHtmlEntities(attrs.match(/\bhref="([^"]*)"/i)?.[1] ?? '').trim();
		if (!href || href.startsWith('#')) continue;
		let resolved: URL;
		try {
			resolved = new URL(href, pageUrl);
		} catch {
			continue;
		}
		if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
		if (resolved.username || resolved.password || ASSET_PATH.test(resolved.pathname)) continue;
		resolved.hash = '';
		const url = resolved.toString();
		if (options.exclude?.has(url)) continue;
		const text = inlineText(match[2] ?? '');
		const aria = decodeHtmlEntities(
			attrs.match(/\b(?:aria-label|title)="([^"]*)"/i)?.[1] ?? ''
		).trim();
		const label = text || aria;
		const existing = byUrl.get(url);
		if (existing) {
			// "2 hours ago" and "587 comments" often point at one URL.
			if (label && !existing.label.includes(label)) {
				existing.label = `${existing.label} | ${label}`.slice(0, LINK_LABEL_CHARS * 2);
			}
			continue;
		}
		const index = match.index ?? 0;
		const context = inlineText(anchorsOnly.slice(Math.max(0, index - 400), index)).slice(
			-LINK_CONTEXT_CHARS
		);
		byUrl.set(url, {
			url,
			label: label.slice(0, LINK_LABEL_CHARS),
			context,
			sameSite: siteOf(resolved.hostname) === site
		});
	}
	const all = [...byUrl.values()];
	// Same-site links first (document order), then links to other sites.
	const ordered = [...all.filter((l) => l.sameSite), ...all.filter((l) => !l.sameSite)];
	const maxLinks = Math.max(0, options.maxLinks ?? DEFAULT_MAX_LINKS);
	return { links: ordered.slice(0, maxLinks), truncated: Math.max(0, ordered.length - maxLinks) };
}

export function readHtmlPage(
	html: string,
	pageUrl: string,
	options: { maxLinks?: number; excludeLinks?: ReadonlySet<string> } = {}
): ReadHtmlPageResult {
	const { text, strategy } = readHtmlMainText(html);
	const { links, truncated } = extractPageLinks(html, pageUrl, {
		maxLinks: options.maxLinks,
		exclude: options.excludeLinks
	});
	return { title: readHtmlTitle(html), text, strategy, links, linksTruncated: truncated };
}
