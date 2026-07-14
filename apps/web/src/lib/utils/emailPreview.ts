// apps/web/src/lib/utils/emailPreview.ts
import sanitizeHtml from 'sanitize-html';
import { generateMinimalEmailHTML, type EmailTemplateData } from './emailTemplate';

const EMAIL_PREVIEW_CSP = [
	"default-src 'none'",
	"script-src 'none'",
	"object-src 'none'",
	"base-uri 'none'",
	"form-action 'none'",
	"frame-src 'none'",
	"style-src 'unsafe-inline'",
	'img-src https: http: data:'
].join('; ');

const emailPreviewSanitizeOptions: sanitizeHtml.IOptions = {
	allowedTags: [
		'a',
		'abbr',
		'address',
		'b',
		'blockquote',
		'br',
		'caption',
		'center',
		'cite',
		'code',
		'col',
		'colgroup',
		'del',
		'div',
		'em',
		'figcaption',
		'figure',
		'font',
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'hr',
		'i',
		'img',
		'ins',
		'kbd',
		'li',
		'mark',
		'ol',
		'p',
		'pre',
		'q',
		's',
		'small',
		'span',
		'strike',
		'strong',
		'sub',
		'sup',
		'table',
		'tbody',
		'td',
		'tfoot',
		'th',
		'thead',
		'tr',
		'tt',
		'u',
		'ul'
	],
	allowedAttributes: {
		'*': ['align', 'aria-*', 'class', 'dir', 'lang', 'role', 'style', 'title'],
		a: ['href', 'rel', 'target', 'title'],
		col: ['span', 'width'],
		colgroup: ['span', 'width'],
		font: ['color', 'face', 'size'],
		img: ['alt', 'height', 'src', 'title', 'width'],
		li: ['value'],
		ol: ['reversed', 'start', 'type'],
		table: ['border', 'cellpadding', 'cellspacing', 'height', 'role', 'width'],
		td: ['colspan', 'height', 'rowspan', 'valign', 'width'],
		th: ['colspan', 'height', 'rowspan', 'scope', 'valign', 'width']
	},
	allowedSchemes: ['http', 'https', 'mailto', 'tel'],
	allowedSchemesByTag: {
		img: ['http', 'https', 'data']
	},
	allowProtocolRelative: false,
	transformTags: {
		a: sanitizeHtml.simpleTransform('a', {
			rel: 'noopener noreferrer',
			target: '_blank'
		})
	}
};

/**
 * Build an isolated browser preview from potentially untrusted email content.
 *
 * The returned document is intentionally sanitized and carries a restrictive
 * CSP. It should still be rendered in a sandboxed iframe; the two protections
 * are complementary and keep the preview safe if either layer regresses.
 */
export function generateSafeEmailPreviewHTML(data: EmailTemplateData): string {
	return generateMinimalEmailHTML(
		{
			subject: data.subject,
			content: sanitizeHtml(data.content, emailPreviewSanitizeOptions),
			trackingPixel: ''
		},
		{
			contentSecurityPolicy: EMAIL_PREVIEW_CSP,
			referrerPolicy: 'no-referrer'
		}
	);
}
