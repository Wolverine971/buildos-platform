// packages/shared-agent-ops/src/knowledge/normalize.ts
//
// Normalizers for structured identifiers (emails, phones, URLs, LinkedIn and YouTube ids).
// These parse formats, not language: regex here is limited to structured values.

import type { KnowledgeValueType } from './vocabulary';

export type KnowledgeKeyType =
	| 'domain'
	| 'url'
	| 'youtube_video'
	| 'youtube_channel'
	| 'linkedin'
	| 'email'
	| 'phone'
	| 'external';

export interface KnowledgeKey {
	type: KnowledgeKeyType;
	value: string;
}

/** A Postgres uuid in canonical text form (ids from tools, URLs and forms). */
export const KNOWLEDGE_UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function collapseWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

/** Same rule as the generated knowledge_entities.normalized_name column. */
export function normalizeKnowledgeName(value: string): string {
	return collapseWhitespace(value).toLowerCase();
}

const EMAIL_PATTERN = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;

export function normalizeEmail(value: string): string | null {
	const trimmed = value
		.trim()
		.replace(/^mailto:/i, '')
		.toLowerCase();
	return EMAIL_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Normalize a phone number. US-style 10-digit numbers get +1; numbers written with + keep
 * their country code; anything else keeps its digits. Returns null for fewer than 7 digits.
 */
export function normalizePhone(value: string, defaultCountryCode = '1'): string | null {
	const trimmed = value.trim().replace(/^tel:/i, '');
	const extensionCut = trimmed.split(/\s*(?:ext\.?|x|#)\s*\d+$/i)[0] ?? trimmed;
	const hasPlus = extensionCut.startsWith('+') || extensionCut.startsWith('00');
	let digits = extensionCut.replace(/\D/g, '');
	if (extensionCut.startsWith('00')) digits = digits.slice(2);
	if (digits.length < 7 || digits.length > 15) return null;
	if (hasPlus) return `+${digits}`;
	if (defaultCountryCode === '1') {
		if (digits.length === 10) return `+1${digits}`;
		if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
	}
	return digits.length >= 11 ? `+${digits}` : digits;
}

/** Canonical URL: https, lowercase host without www., no fragment, no trailing slash. */
export function normalizeUrl(value: string): string | null {
	const raw = value.trim();
	if (!raw) return null;
	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
	let url: URL;
	try {
		url = new URL(withScheme);
	} catch {
		return null;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	if (!url.hostname.includes('.')) return null;
	const host = url.hostname.toLowerCase().replace(/^www\./, '');
	const path = url.pathname.replace(/\/+$/, '');
	// Drop common tracking parameters; keep the rest (YouTube's v= matters).
	const params = new URLSearchParams(url.search);
	for (const key of [...params.keys()]) {
		if (/^(utm_|fbclid$|gclid$|si$|feature$|mc_)/i.test(key)) params.delete(key);
	}
	const query = params.toString();
	return `https://${host}${path}${query ? `?${query}` : ''}`;
}

export function domainOf(value: string): string | null {
	const normalized = normalizeUrl(value);
	if (!normalized) return null;
	return new URL(normalized).hostname;
}

/** LinkedIn profile slug, e.g. "in/jane-doe-123" or "company/acme". */
export function linkedinKey(value: string): string | null {
	const normalized = normalizeUrl(value);
	if (!normalized) return null;
	const url = new URL(normalized);
	if (!/(^|\.)linkedin\.com$/.test(url.hostname)) return null;
	const match = url.pathname.match(/^\/(in|company|school|pub)\/([^/?#]+)/i);
	if (!match) return null;
	let slug = match[2]!;
	try {
		slug = decodeURIComponent(slug);
	} catch {
		// A stray "%" in an exported URL: keep the slug as written.
	}
	return `${match[1]!.toLowerCase()}/${slug.toLowerCase()}`;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoId(value: string): string | null {
	const raw = value.trim();
	if (YOUTUBE_ID.test(raw)) return raw;
	const normalized = normalizeUrl(raw);
	if (!normalized) return null;
	const url = new URL(normalized);
	const host = url.hostname;
	if (host === 'youtu.be') {
		const id = url.pathname.slice(1).split('/')[0] ?? '';
		return YOUTUBE_ID.test(id) ? id : null;
	}
	if (!/(^|\.)youtube\.com$/.test(host)) return null;
	const v = url.searchParams.get('v');
	if (v && YOUTUBE_ID.test(v)) return v;
	const path = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
	return path ? path[1]! : null;
}

/** A channel key: "UC…" id or "@handle", lowercased for handles. */
export function youtubeChannelKey(value: string): string | null {
	const raw = value.trim();
	if (/^UC[A-Za-z0-9_-]{22}$/.test(raw)) return raw;
	if (/^@[A-Za-z0-9._-]{3,30}$/.test(raw)) return raw.toLowerCase();
	const normalized = normalizeUrl(raw);
	if (!normalized) return null;
	const url = new URL(normalized);
	if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
	const handle = url.pathname.match(/^\/(@[A-Za-z0-9._-]{3,30})/);
	if (handle) return handle[1]!.toLowerCase();
	const channel = url.pathname.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})/);
	if (channel) return channel[1]!;
	const legacy = url.pathname.match(/^\/(?:c|user)\/([A-Za-z0-9._-]+)/);
	return legacy ? `c/${legacy[1]!.toLowerCase()}` : null;
}

/** Normalize a property value for its predicate's type; null when it does not parse. */
export function normalizeKnowledgeValue(
	valueType: KnowledgeValueType,
	value: string | number
): string | null {
	const text = typeof value === 'number' ? String(value) : collapseWhitespace(value);
	if (!text) return null;
	switch (valueType) {
		case 'email':
			return normalizeEmail(text);
		case 'phone':
			return normalizePhone(text);
		case 'url':
			return normalizeUrl(text);
		case 'number': {
			const n = Number(text.replace(/,/g, ''));
			return Number.isFinite(n) ? String(n) : null;
		}
		case 'date': {
			// Accept YYYY, YYYY-MM or YYYY-MM-DD, and --MM-DD (vCard birthday without a year).
			if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(text)) return text;
			if (/^--\d{2}-?\d{2}$/.test(text))
				return text.replace(/^--(\d{2})-?(\d{2})$/, '--$1-$2');
			const parsed = new Date(text);
			return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
		}
		case 'text':
		case 'json':
			return text.slice(0, 4000);
		case 'entity':
			return null;
	}
}

/** Identity keys implied by a property value (used to recognise the entity later). */
export function keysForKnowledgeValue(predicate: string, normalizedValue: string): KnowledgeKey[] {
	switch (predicate) {
		case 'email':
			return [{ type: 'email', value: normalizedValue }];
		case 'phone':
			return normalizedValue.startsWith('+')
				? [{ type: 'phone', value: normalizedValue }]
				: [];
		case 'profile_url': {
			const li = linkedinKey(normalizedValue);
			if (li) return [{ type: 'linkedin', value: li }];
			const channel = youtubeChannelKey(normalizedValue);
			return channel ? [{ type: 'youtube_channel', value: channel }] : [];
		}
		case 'homepage': {
			const domain = domainOf(normalizedValue);
			return domain ? [{ type: 'domain', value: domain }] : [];
		}
		case 'url': {
			const video = youtubeVideoId(normalizedValue);
			if (video) return [{ type: 'youtube_video', value: video }];
			const channel = youtubeChannelKey(normalizedValue);
			if (channel) return [{ type: 'youtube_channel', value: channel }];
			return [{ type: 'url', value: normalizedValue }];
		}
		default:
			return [];
	}
}

/** Normalize a caller-supplied identity key; null when it does not parse. */
export function normalizeKnowledgeKey(key: KnowledgeKey): KnowledgeKey | null {
	const value = key.value?.trim();
	if (!value) return null;
	switch (key.type) {
		case 'email': {
			const v = normalizeEmail(value);
			return v ? { type: 'email', value: v } : null;
		}
		case 'phone': {
			const v = normalizePhone(value);
			return v && v.startsWith('+') ? { type: 'phone', value: v } : null;
		}
		case 'domain': {
			const v = domainOf(value);
			return v ? { type: 'domain', value: v } : null;
		}
		case 'url': {
			const v = normalizeUrl(value);
			return v ? { type: 'url', value: v } : null;
		}
		case 'linkedin': {
			const v =
				linkedinKey(value) ??
				(/^(in|company|school)\/[^/\s]+$/i.test(value) ? value.toLowerCase() : null);
			return v ? { type: 'linkedin', value: v } : null;
		}
		case 'youtube_video': {
			const v = youtubeVideoId(value);
			return v ? { type: 'youtube_video', value: v } : null;
		}
		case 'youtube_channel': {
			const v = youtubeChannelKey(value);
			return v ? { type: 'youtube_channel', value: v } : null;
		}
		case 'external':
			return value.length <= 500 ? { type: 'external', value } : null;
	}
}

/** Person names with two or more words are specific enough to reuse an existing private entity. */
export function isSpecificPersonName(name: string): boolean {
	return (
		normalizeKnowledgeName(name)
			.split(' ')
			.filter((part) => part.length > 1).length >= 2
	);
}
