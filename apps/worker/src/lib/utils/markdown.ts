// apps/worker/src/lib/utils/markdown.ts
import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

// The worker renders markdown only for outgoing email (the daily brief). That markdown mixes
// model output with text other people wrote (shared-project titles, names), so it is treated
// as untrusted: raw inline HTML renders as text, images are dropped (no remote loads from the
// mail client), and links stay live only for BuildOS pages and Google Calendar event links.
const emailMarked = new Marked({
	breaks: true, // Convert line breaks to <br>
	gfm: true, // Enable GitHub Flavored Markdown
	async: false,
	renderer: {
		html({ text }) {
			return escapeHtml(text);
		}
	}
});

const DEFAULT_APP_ORIGIN = 'https://build-os.com';

function appOrigins(): Set<string> {
	const origins = new Set<string>([DEFAULT_APP_ORIGIN, 'https://www.build-os.com']);
	const configured = process.env.PUBLIC_APP_URL?.trim();
	if (configured) {
		try {
			origins.add(new URL(configured).origin);
		} catch {
			// Ignore a malformed env value; the default origin still applies.
		}
	}
	return origins;
}

const GOOGLE_CALENDAR_HOSTS = new Set(['calendar.google.com', 'www.google.com']);

/** True for hrefs the brief email may keep clickable. */
export function isAllowedEmailLinkHref(href: string | undefined | null): boolean {
	const value = href?.trim();
	if (!value) return false;
	// Relative app paths (not protocol-relative "//host" or "/\\host").
	if (value.startsWith('/')) return !value.startsWith('//') && !value.startsWith('/\\');
	if (value.startsWith('#')) return true;
	if (value.toLowerCase().startsWith('mailto:')) return true;

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
	if (appOrigins().has(url.origin)) return true;
	// Google Calendar event links from the brief's calendar section.
	return (
		url.protocol === 'https:' &&
		GOOGLE_CALENDAR_HOSTS.has(url.hostname) &&
		(url.hostname === 'calendar.google.com' || url.pathname.startsWith('/calendar/'))
	);
}

const sanitizeOptions: sanitizeHtml.IOptions = {
	allowedTags: [
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'p',
		'br',
		'strong',
		'em',
		'u',
		's',
		'del',
		'ul',
		'ol',
		'li',
		'blockquote',
		'code',
		'pre',
		'a',
		// Unlinked anchors become attribute-less spans. Transforming into a discarded tag
		// trips a sanitize-html 2.17 bug that swallows the rest of the text.
		'span',
		'hr',
		'table',
		'thead',
		'tbody',
		'tr',
		'th',
		'td'
	],
	allowedAttributes: {
		a: ['href', 'title', 'target', 'rel'],
		code: ['class'],
		pre: ['class']
	},
	allowedClasses: {
		code: ['language-*'],
		pre: ['language-*']
	},
	allowedSchemes: ['http', 'https', 'mailto'],
	allowProtocolRelative: false,
	transformTags: {
		a: (tagName: string, attribs: sanitizeHtml.Attributes) => {
			if (!isAllowedEmailLinkHref(attribs.href)) {
				return { tagName: 'span', attribs: {} };
			}
			// Make external links open in new tab
			if (
				attribs.href &&
				(attribs.href.startsWith('http://') || attribs.href.startsWith('https://'))
			) {
				attribs.target = '_blank';
				attribs.rel = 'noopener noreferrer';
			}
			return { tagName, attribs };
		}
	}
};

/**
 * Convert untrusted markdown to HTML that is safe to embed in an email.
 */
export function renderMarkdown(text: string | null | undefined): string {
	if (!text || typeof text !== 'string') return '';

	try {
		const html = emailMarked.parse(text.trim()) as string;
		return sanitizeHtml(html, sanitizeOptions);
	} catch (error) {
		console.error('Error rendering markdown:', error);
		// Fallback to escaped plain text
		return escapeHtml(text);
	}
}

/**
 * Escape HTML characters for server environment
 */
function escapeHtml(text: string): string {
	// Server-side HTML escaping
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Strip markdown formatting and return plain text
 */
export function stripMarkdown(text: string | null | undefined): string {
	if (!text || typeof text !== 'string') return '';

	try {
		// Simple regex to remove common markdown formatting
		return text
			.replace(/\*\*(.*?)\*\*/g, '$1') // Bold
			.replace(/\*(.*?)\*/g, '$1') // Italic
			.replace(/`(.*?)`/g, '$1') // Inline code
			.replace(/#+\s/g, '') // Headers
			.replace(/>\s/g, '') // Blockquotes
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
			.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // Images
			.trim();
	} catch (error) {
		console.error('Error stripping markdown:', error);
		return text;
	}
}
