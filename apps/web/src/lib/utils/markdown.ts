// apps/web/src/lib/utils/markdown.ts
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

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
		a: ['href', 'title', 'target'],
		img: ['src', 'alt', 'title', 'width', 'height'],
		code: ['class'],
		pre: ['class']
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

/**
 * Convert markdown to safe HTML
 */
export function renderMarkdown(text: string | null | undefined): string {
	if (!text || typeof text !== 'string') return '';

	try {
		// Use marked.parse for synchronous operation (async: false is set globally)
		const html = marked.parse(text.trim()) as string;
		return sanitizeHtml(html, sanitizeOptions);
	} catch (error) {
		console.error('Error rendering markdown:', error);
		// Fallback to escaped plain text
		return escapeHtml(text);
	}
}

// Add a function to get the appropriate prose classes
// INKPRINT Design System: Uses semantic color tokens for proper theming
export function getProseClasses(
	size: 'sm' | 'base' | 'lg' = 'base',
	removeMaxWidth = true
): string {
	const sizeClass = size === 'base' ? 'prose' : `prose-${size}`;
	const maxWidth = removeMaxWidth ? 'max-w-none' : '';

	// INKPRINT semantic prose styling with proper header hierarchy
	// Note: prose-pre and prose-table have overflow-x-auto to allow horizontal scroll for wide content
	return `${sizeClass} dark:prose-invert ${maxWidth}
		prose-headings:text-foreground prose-headings:font-semibold
		prose-h1:text-lg prose-h1:font-bold prose-h1:mb-3 prose-h1:mt-4
		prose-h2:text-base prose-h2:font-bold prose-h2:mb-2 prose-h2:mt-3
		prose-h3:text-sm prose-h3:font-bold prose-h3:mb-2 prose-h3:mt-3
		prose-h4:text-sm prose-h4:font-semibold prose-h4:mb-1.5 prose-h4:mt-2
		prose-h5:text-xs prose-h5:font-semibold prose-h5:mb-1 prose-h5:mt-2 prose-h5:uppercase prose-h5:tracking-wide
		prose-h6:text-xs prose-h6:font-medium prose-h6:mb-1 prose-h6:mt-2 prose-h6:text-muted-foreground
		prose-p:text-foreground prose-p:leading-relaxed
		prose-li:text-foreground
		prose-strong:text-foreground prose-strong:font-semibold
		prose-a:text-accent prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-accent/80
		prose-blockquote:text-muted-foreground prose-blockquote:border-l-accent prose-blockquote:not-italic
		prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none
		prose-pre:bg-muted prose-pre:text-foreground prose-pre:overflow-x-auto
		prose-table:overflow-x-auto prose-table:block
		prose-hr:border-border`.trim();
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

/**
 * Get a preview of markdown content (first N characters, stripped of formatting)
 */
export function getMarkdownPreview(
	text: string | null | undefined,
	maxLength: number = 150
): string {
	if (!text) return '';

	const stripped = stripMarkdown(text);
	if (stripped.length <= maxLength) return stripped;

	return stripped.substring(0, maxLength).trim() + '...';
}

/**
 * Check if text contains markdown formatting
 */
export function hasMarkdownFormatting(text: string | null | undefined): boolean {
	if (!text || typeof text !== 'string') return false;

	const markdownPatterns = [
		/\*\*.*?\*\*/, // Bold
		/\*.*?\*/, // Italic
		/`.*?`/, // Inline code
		/#+\s/, // Headers
		/>\s/, // Blockquotes
		/\[.*?\]\(.*?\)/, // Links
		/!\[.*?\]\(.*?\)/, // Images
		/^\s*[-*+]\s/m, // Lists
		/^\s*\d+\.\s/m // Numbered lists
	];

	return markdownPatterns.some((pattern) => pattern.test(text));
}
