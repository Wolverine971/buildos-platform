// apps/web/src/lib/utils/markdown.ts
import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import sanitizeHtml from 'sanitize-html';
import { normalizeMarkdownTables } from './markdown-text';

export {
	getProseClasses,
	getMarkdownPreview,
	hasMarkdownFormatting,
	normalizeMarkdownTables,
	stripMarkdown
} from './markdown-text';

// Enable heading IDs for anchor links (marked v16+ dropped them by default)
marked.use(gfmHeadingId());

// Configure marked with useful options
marked.setOptions({
	breaks: true, // Convert line breaks to <br>
	gfm: true, // Enable GitHub Flavored Markdown
	async: false // Force synchronous operation
});

// Safe HTML sanitization options
const sanitizeOptions = {
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
		'img',
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
		img: ['src', 'alt', 'title', 'width', 'height'],
		h1: ['id'],
		h2: ['id'],
		h3: ['id'],
		h4: ['id'],
		h5: ['id'],
		h6: ['id'],
		code: ['class'],
		pre: ['class'],
		th: ['align'],
		td: ['align']
	},
	allowedClasses: {
		code: ['language-*'],
		pre: ['language-*']
	},
	transformTags: {
		a: (tagName: string, attribs: any) => {
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

// Permissive sanitization for FIRST-PARTY blog content only.
//
// Blog posts live in apps/web/src/content/blogs/ and ship through git review, so
// authors are trusted. This lets a markdown post drop in rich HTML — styled
// layout blocks, figures, and embeds (YouTube/Vimeo/Loom...) — that the strict
// `sanitizeOptions` above intentionally strips. `<script>`/`<style>` and
// event-handler attributes are still removed, and iframes are restricted to a
// hostname allowlist. Do NOT use this for user-generated content.
const TRUSTED_IFRAME_HOSTNAMES = [
	'youtube.com',
	'www.youtube.com',
	'youtube-nocookie.com',
	'www.youtube-nocookie.com',
	'player.vimeo.com',
	'www.loom.com',
	'codesandbox.io',
	'codepen.io',
	'player.cloudinary.com'
];

const blogSanitizeOptions: sanitizeHtml.IOptions = {
	allowedTags: [
		// headings & inline text
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'p',
		'br',
		'hr',
		'span',
		'strong',
		'em',
		'b',
		'i',
		'u',
		's',
		'del',
		'ins',
		'small',
		'sub',
		'sup',
		'mark',
		'abbr',
		'kbd',
		'samp',
		'q',
		'cite',
		'time',
		// lists
		'ul',
		'ol',
		'li',
		'dl',
		'dt',
		'dd',
		// quotes & code
		'blockquote',
		'code',
		'pre',
		// links & media
		'a',
		'img',
		'picture',
		'source',
		'video',
		'audio',
		'track',
		'iframe',
		'figure',
		'figcaption',
		// tables
		'table',
		'caption',
		'colgroup',
		'col',
		'thead',
		'tbody',
		'tfoot',
		'tr',
		'th',
		'td',
		// structural / layout
		'div',
		'section',
		'article',
		'aside',
		'header',
		'footer',
		'nav',
		'main',
		'details',
		'summary'
	],
	allowedAttributes: {
		'*': ['class', 'id', 'style', 'title', 'lang', 'dir', 'role', 'aria-*', 'data-*'],
		a: ['href', 'title', 'target', 'rel', 'name'],
		img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding', 'srcset', 'sizes'],
		source: ['src', 'srcset', 'type', 'media', 'sizes'],
		video: [
			'src',
			'poster',
			'width',
			'height',
			'controls',
			'autoplay',
			'muted',
			'loop',
			'playsinline',
			'preload'
		],
		audio: ['src', 'controls', 'autoplay', 'muted', 'loop', 'preload'],
		track: ['src', 'kind', 'srclang', 'label', 'default'],
		iframe: [
			'src',
			'width',
			'height',
			'title',
			'frameborder',
			'allow',
			'allowfullscreen',
			'loading',
			'referrerpolicy',
			'sandbox'
		],
		th: ['align', 'colspan', 'rowspan', 'scope'],
		td: ['align', 'colspan', 'rowspan'],
		col: ['span'],
		colgroup: ['span'],
		ol: ['start', 'type', 'reversed'],
		details: ['open']
	},
	// Keep syntax-highlight classes scoped; all other tags allow arbitrary classes
	// (so Tailwind / Inkprint utility classes survive).
	allowedClasses: {
		code: ['language-*'],
		pre: ['language-*']
	},
	// `style` is allowed above; leaving allowedStyles undefined permits inline
	// styles unfiltered, which is acceptable for trusted authored content.
	allowedSchemes: ['http', 'https', 'mailto', 'tel'],
	allowedSchemesByTag: {
		img: ['http', 'https', 'data']
	},
	allowedIframeHostnames: TRUSTED_IFRAME_HOSTNAMES,
	allowIframeRelativeUrls: true,
	transformTags: {
		a: (tagName: string, attribs: Record<string, string>) => {
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
 * Convert markdown to safe HTML
 */
export function renderMarkdown(text: string | null | undefined): string {
	if (!text || typeof text !== 'string') return '';

	try {
		// Use marked.parse for synchronous operation (async: false is set globally)
		const html = marked.parse(normalizeMarkdownTables(text.trim())) as string;
		return sanitizeHtml(html, sanitizeOptions);
	} catch (error) {
		console.error('Error rendering markdown:', error);
		// Fallback to escaped plain text
		return escapeHtml(text);
	}
}

/**
 * Convert markdown to HTML for FIRST-PARTY blog content, preserving rich inline
 * HTML (layout blocks, figures, trusted iframe embeds). Authors are trusted
 * because posts ship through git review. Never call this on user-generated
 * content — use `renderMarkdown` for that.
 */
export function renderBlogMarkdown(text: string | null | undefined): string {
	if (!text || typeof text !== 'string') return '';

	try {
		const html = marked.parse(normalizeMarkdownTables(text.trim())) as string;
		return sanitizeHtml(html, blogSanitizeOptions);
	} catch (error) {
		console.error('Error rendering blog markdown:', error);
		return escapeHtml(text);
	}
}

/**
 * Escape HTML characters for browser environment
 */
function escapeHtml(text: string): string {
	// Handle both browser and server environments
	if (typeof document !== 'undefined') {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	} else {
		// Server-side fallback
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}
}
