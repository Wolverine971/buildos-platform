// apps/web/src/lib/email-campaigns/render.ts
// Pure rendering for campaign emails, shared by the sender (server) and the
// review/preview screens (browser) so what DJ previews is what goes out.
//
// Merge fields use {{key}} or {{key|fallback}}. Parsing them, and turning the
// editor's HTML into a plain-text part, are structured-format operations.

import {
	appendEmailOptOutFooterHtml,
	escapeHtmlText,
	generatePlainEmailHTML
} from '$lib/utils/emailTemplate';
import type { RecipientContext } from './types';

export const MERGE_FIELDS = [
	{ key: 'first_name', label: 'First name', fallback: 'there' },
	{ key: 'signup_month', label: 'Signup month', fallback: 'a while back' },
	{ key: 'last_project', label: 'Last project', fallback: 'your project' }
] as const;

export type MergeFieldKey = (typeof MERGE_FIELDS)[number]['key'];

const MERGE_FIELD_PATTERN = /\{\{\s*([a-z_]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/gi;
const KNOWN_KEYS = new Set<string>(MERGE_FIELDS.map((field) => field.key));
const DEFAULT_FALLBACKS = Object.fromEntries(
	MERGE_FIELDS.map((field) => [field.key, field.fallback])
) as Record<string, string>;

export type MergeValues = Partial<Record<MergeFieldKey, string | null | undefined>>;

export interface RenderableRecipient {
	first_name: string | null;
	context: RecipientContext | null | undefined;
	subject_override?: string | null;
	body_override?: string | null;
}

export interface RenderableCampaign {
	subject_template: string;
	body_template: string;
}

export interface RenderedCampaignEmail {
	subject: string;
	/** Body HTML only (what the editor holds, merged). */
	bodyHtml: string;
	/** Plain-text part. */
	text: string;
	/** True when this person has their own subject or body. */
	usesOverride: boolean;
}

export function mergeValuesFor(recipient: RenderableRecipient): MergeValues {
	const context = recipient.context ?? {};
	return {
		first_name: recipient.first_name,
		signup_month: context.signup_month ?? null,
		last_project: context.last_project ?? null
	};
}

/** Replaces {{key}} / {{key|fallback}}. Unknown keys are left untouched so they stay visible. */
export function renderMergeFields(
	template: string,
	values: MergeValues,
	options: { escapeHtml: boolean }
): string {
	return template.replace(MERGE_FIELD_PATTERN, (match, rawKey: string, rawFallback?: string) => {
		const key = rawKey.toLowerCase();
		if (!KNOWN_KEYS.has(key)) return match;
		const value = values[key as MergeFieldKey]?.trim();
		const fallback = rawFallback?.trim() || DEFAULT_FALLBACKS[key] || '';
		const resolved = value || fallback;
		return options.escapeHtml ? escapeHtmlText(resolved) : resolved;
	});
}

/** Merge-field keys in a template that the renderer does not know (typos like {{firstname}}). */
export function findUnknownMergeFields(template: string): string[] {
	const unknown = new Set<string>();
	for (const match of template.matchAll(MERGE_FIELD_PATTERN)) {
		const key = (match[1] ?? '').toLowerCase();
		if (!KNOWN_KEYS.has(key)) unknown.add(match[1] ?? key);
	}
	return [...unknown];
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	'#39': "'",
	apos: "'",
	nbsp: ' ',
	rsquo: '’',
	lsquo: '‘',
	rdquo: '”',
	ldquo: '“',
	mdash: '—',
	ndash: '–',
	hellip: '…'
};

function decodeEntities(value: string): string {
	return value.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*|#39);/gi, (match, entity: string) => {
		const lower = entity.toLowerCase();
		if (lower in NAMED_ENTITIES) return NAMED_ENTITIES[lower] ?? match;
		if (lower.startsWith('#x'))
			return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
		if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
		return match;
	});
}

/** Plain-text part from editor HTML: paragraphs, line breaks, list items, and link targets. */
export function htmlToPlainText(html: string): string {
	const text = html
		.replace(/\r\n?/g, '\n')
		.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
		.replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href, label) => {
			const labelText = String(label)
				.replace(/<[^>]+>/g, '')
				.trim();
			const target = decodeEntities(String(href));
			if (!labelText || decodeEntities(labelText) === target) return target;
			return `${labelText} (${target})`;
		})
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<li[^>]*>/gi, '\n- ')
		.replace(/<\/(p|div|h[1-6]|blockquote|ul|ol|li|tr)>/gi, '\n\n')
		.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*>/gi, '$1')
		.replace(/<[^>]+>/g, '');

	return decodeEntities(text)
		.split('\n')
		.map((line) => line.replace(/[ \t]+/g, ' ').trim())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** The subject and body one person will get (their own version, or the merged template). */
export function renderCampaignEmail(
	campaign: RenderableCampaign,
	recipient: RenderableRecipient
): RenderedCampaignEmail {
	const values = mergeValuesFor(recipient);
	const subjectSource = recipient.subject_override?.trim()
		? recipient.subject_override
		: campaign.subject_template;
	const bodySource = recipient.body_override?.trim()
		? recipient.body_override
		: campaign.body_template;

	const subject = renderMergeFields(subjectSource ?? '', values, { escapeHtml: false })
		.replace(/\s+/g, ' ')
		.trim();
	const bodyHtml = renderMergeFields(bodySource ?? '', values, { escapeHtml: true });

	return {
		subject,
		bodyHtml,
		text: htmlToPlainText(bodyHtml),
		usesOverride: Boolean(recipient.subject_override?.trim() || recipient.body_override?.trim())
	};
}

/**
 * Full HTML document as the recipient sees it, minus the tracking pixel and
 * link rewriting EmailService adds at send time. Pass an unsubscribe URL to
 * preview the footer (the preview uses a placeholder).
 *
 * Campaigns use the plain template (no BuildOS banner): founder email should
 * look like a personal note from DJ (beta-reactivation FRAMEWORK.md §mechanics).
 */
export function renderCampaignEmailDocument(
	rendered: Pick<RenderedCampaignEmail, 'subject' | 'bodyHtml'>,
	options: { unsubscribeUrl?: string } = {}
): string {
	const html = generatePlainEmailHTML({ subject: rendered.subject, content: rendered.bodyHtml });
	return options.unsubscribeUrl
		? appendEmailOptOutFooterHtml(html, options.unsubscribeUrl, 'marketing')
		: html;
}

/** Every href in the HTML, in order (used to check AI tailoring kept DJ's links). */
export function extractLinks(html: string): string[] {
	return [...html.matchAll(/<a\s[^>]*href=["']([^"']+)["']/gi)].map((match) =>
		decodeEntities(match[1] ?? '')
	);
}

export function firstNameFrom(name: string | null | undefined): string | null {
	const first = name?.trim().split(/\s+/)[0];
	if (!first) return null;
	// "dj" → "DJ" is a guess too far; only fix all-lowercase names.
	return first === first.toLowerCase() ? first.charAt(0).toUpperCase() + first.slice(1) : first;
}

export function formatSignupMonth(iso: string | null | undefined): string | null {
	if (!iso) return null;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
