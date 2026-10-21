// apps/web/src/lib/components/agent/shared-chat-markdown.ts
//
// Renderer for public share pages (/share/<token>) and the owner's share preview.
// It is deliberately stricter than the in-app chat renderer: a shared page is
// read by signed-in BuildOS users on build-os.com, so stored markdown must never
// load media, link into the workspace, or fire a same-origin request (for
// example `<img src="/auth/logout">`).
import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { normalizeMarkdownTables } from '$lib/utils/markdown-text';

/** Absolute `https:` links outside BuildOS (and never localhost) are the only links a share keeps. */
export function isPublicExternalLink(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	try {
		const url = new URL(value);
		const host = url.hostname.toLowerCase().replace(/\.$/, '');
		return (
			url.protocol === 'https:' &&
			!url.username &&
			!url.password &&
			host !== 'build-os.com' &&
			!host.endsWith('.build-os.com') &&
			host !== 'localhost' &&
			!host.endsWith('.localhost') &&
			host !== '127.0.0.1' &&
			host !== '[::1]'
		);
	} catch {
		return false;
	}
}

export const SHARED_LINK_REL = 'noopener noreferrer nofollow ugc';

// Bare URLs never become links here (GFM would turn `www.build-os.com/projects/x`
// into a workspace link). The snapshot cleaner already rewrote every public
// external URL as an explicit markdown link, so nothing shareable is lost.
const sharedMarked = new Marked(
	{ breaks: true, gfm: true, async: false },
	{
		tokenizer: {
			url: () => undefined,
			autolink: () => undefined
		}
	}
);

const SHARED_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
	allowedTags: [
		'p',
		'br',
		'strong',
		'em',
		'del',
		's',
		'blockquote',
		'ul',
		'ol',
		'li',
		'pre',
		'code',
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'hr',
		'a',
		'table',
		'thead',
		'tbody',
		'tr',
		'th',
		'td',
		// Unlinked labels become attribute-less spans. Transforming into a *discarded* tag trips a
		// sanitize-html 2.17 bug: the next real link closes with </span> and swallows what follows.
		'span'
	],
	allowedAttributes: {
		a: ['href', 'rel', 'target'],
		code: ['class'],
		pre: ['class'],
		th: ['align'],
		td: ['align']
	},
	allowedClasses: { code: ['language-*'], pre: ['language-*'] },
	allowedSchemes: ['https'],
	allowedSchemesByTag: {},
	allowProtocolRelative: false,
	// Disallowed tags (img, iframe, video, svg, forms, …) are dropped; their text stays as text.
	disallowedTagsMode: 'discard',
	transformTags: {
		a: (_tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag =>
			isPublicExternalLink(attribs.href)
				? {
						tagName: 'a',
						attribs: { href: attribs.href, rel: SHARED_LINK_REL, target: '_blank' }
					}
				: // Plain text in an attribute-less span (see allowedTags).
					{ tagName: 'span', attribs: {} }
	}
};

const TABLE_OPEN_TAG = /<table(\s[^>]*)?>/g;
const TABLE_CLOSE_TAG = /<\/table>/g;

const escapeHtml = (value: string) =>
	value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Markdown → sanitized HTML for a shared chat. Tables get the same scroll shell
 * as the in-app transcript; the wrapper is added after sanitizing, so stored
 * markdown can never supply its classes.
 */
export function renderSharedChatMarkdown(text: string | null | undefined): string {
	if (!text || typeof text !== 'string') return '';
	try {
		const html = sharedMarked.parse(normalizeMarkdownTables(text.trim())) as string;
		return sanitizeHtml(html, SHARED_SANITIZE_OPTIONS)
			.replace(
				TABLE_OPEN_TAG,
				'<div class="agent-markdown-table-shell"><div class="agent-markdown-table-scroll" data-scrollable="false" data-at-end="true" tabindex="-1"><table$1>'
			)
			.replace(
				TABLE_CLOSE_TAG,
				'</table></div><span class="agent-markdown-table-cue" aria-hidden="true">Scroll →</span></div>'
			);
	} catch {
		return `<p>${escapeHtml(text)}</p>`;
	}
}
