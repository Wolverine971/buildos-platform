// apps/web/src/lib/server/gmail-relevance/metadata-normalizer.ts
// Request-lifetime Gmail metadata normalization for Phase A relevance scoring.
// Restricted strings returned by this module must never be persisted or logged.
import sanitizeHtml from 'sanitize-html';

export const EMAIL_RELEVANCE_METADATA_NORMALIZER_VERSION = 'email-relevance-metadata-normalizer-v1';

const MAX_SUBJECT_CHARACTERS = 500;
const MAX_SNIPPET_CHARACTERS = 500;
const MAX_HEADER_CHARACTERS = 4_000;
const MAX_PARTICIPANTS = 100;
const MAX_LABEL_IDS = 100;
const MAX_LEXICAL_TOKENS = 160;

const ALLOWED_HEADERS = new Set(['from', 'to', 'cc', 'bcc', 'subject']);
const ADDRESS_PATTERN = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,63}/giu;

type ProviderHeader = { name?: unknown; value?: unknown };

export type EmailRelevanceProviderMetadata = {
	id?: unknown;
	threadId?: unknown;
	internalDate?: unknown;
	labelIds?: unknown;
	snippet?: unknown;
	payload?: { headers?: unknown } | null;
};

export type EmailRelevanceMailboxCategories = {
	inbox: boolean;
	sent: boolean;
};

export type NormalizedEmailRelevanceMetadata = {
	provider_message_id: string;
	provider_thread_id: string;
	internal_date: string;
	mailbox_categories: EmailRelevanceMailboxCategories;
	label_ids: string[];
	subject: string;
	snippet: string;
	participant_addresses: string[];
	participant_domains: string[];
	lexical_tokens: string[];
};

export class EmailRelevanceMetadataError extends Error {
	constructor(
		public readonly code:
			| 'invalid_provider_response'
			| 'invalid_provider_identifier'
			| 'invalid_internal_date'
	) {
		super(`Email relevance metadata rejected: ${code}`);
		this.name = 'EmailRelevanceMetadataError';
	}
}

function cleanRestrictedText(value: unknown, maxCharacters: number): string {
	if (typeof value !== 'string') return '';
	return sanitizeHtml(value, {
		allowedTags: [],
		allowedAttributes: {},
		nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript']
	})
		.normalize('NFKC')
		.replace(/[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, maxCharacters);
}

function cleanHeaderLine(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value
		.normalize('NFKC')
		.replace(/[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_HEADER_CHARACTERS);
}

function providerIdentifier(value: unknown): string {
	if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) {
		throw new EmailRelevanceMetadataError('invalid_provider_identifier');
	}
	return value;
}

function normalizeInternalDate(value: unknown): string {
	if (typeof value !== 'string' || !/^\d{1,16}$/.test(value)) {
		throw new EmailRelevanceMetadataError('invalid_internal_date');
	}
	const milliseconds = Number(value);
	const date = new Date(milliseconds);
	if (!Number.isSafeInteger(milliseconds) || Number.isNaN(date.getTime())) {
		throw new EmailRelevanceMetadataError('invalid_internal_date');
	}
	return date.toISOString();
}

function normalizeLabelIds(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return Array.from(
		new Set(
			value
				.filter(
					(label): label is string =>
						typeof label === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(label)
				)
				.slice(0, MAX_LABEL_IDS)
		)
	).sort();
}

function normalizeHeaders(value: unknown): Map<string, string[]> {
	if (value !== undefined && !Array.isArray(value)) {
		throw new EmailRelevanceMetadataError('invalid_provider_response');
	}
	const result = new Map<string, string[]>();
	for (const rawHeader of (value ?? []) as ProviderHeader[]) {
		if (!rawHeader || typeof rawHeader !== 'object') continue;
		const name = typeof rawHeader.name === 'string' ? rawHeader.name.toLowerCase() : '';
		if (!ALLOWED_HEADERS.has(name)) continue;
		const cleaned = cleanHeaderLine(rawHeader.value);
		if (!cleaned) continue;
		result.set(name, [...(result.get(name) ?? []), cleaned]);
	}
	return result;
}

function extractParticipants(headers: Map<string, string[]>): {
	addresses: string[];
	domains: string[];
} {
	const addresses = new Set<string>();
	for (const name of ['from', 'to', 'cc', 'bcc']) {
		for (const value of headers.get(name) ?? []) {
			for (const match of value.matchAll(ADDRESS_PATTERN)) {
				const address = match[0]?.toLocaleLowerCase('en-US').slice(0, 320);
				if (address) addresses.add(address);
				if (addresses.size >= MAX_PARTICIPANTS) break;
			}
			if (addresses.size >= MAX_PARTICIPANTS) break;
		}
		if (addresses.size >= MAX_PARTICIPANTS) break;
	}
	const sortedAddresses = [...addresses].sort();
	return {
		addresses: sortedAddresses,
		domains: [
			...new Set(
				sortedAddresses.map((address) => address.slice(address.lastIndexOf('@') + 1))
			)
		].sort()
	};
}

export function tokenizeEmailRelevanceText(value: string): string[] {
	const tokens = value
		.normalize('NFKC')
		.toLocaleLowerCase('en-US')
		.split(/[^\p{L}\p{N}._:/-]+/u)
		.map((token) => token.replace(/^[._:/-]+|[._:/-]+$/g, ''))
		.filter((token) => token.length >= 2 && token.length <= 120);
	return [...new Set(tokens)].sort().slice(0, MAX_LEXICAL_TOKENS);
}

export function normalizeEmailRelevanceMetadata(
	provider: EmailRelevanceProviderMetadata
): NormalizedEmailRelevanceMetadata {
	if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
		throw new EmailRelevanceMetadataError('invalid_provider_response');
	}
	const headers = normalizeHeaders(provider.payload?.headers);
	const subject = cleanRestrictedText(headers.get('subject')?.[0], MAX_SUBJECT_CHARACTERS);
	const snippet = cleanRestrictedText(provider.snippet, MAX_SNIPPET_CHARACTERS);
	const labels = normalizeLabelIds(provider.labelIds);
	const participants = extractParticipants(headers);

	return {
		provider_message_id: providerIdentifier(provider.id),
		provider_thread_id: providerIdentifier(provider.threadId),
		internal_date: normalizeInternalDate(provider.internalDate),
		mailbox_categories: {
			inbox: labels.includes('INBOX'),
			sent: labels.includes('SENT')
		},
		label_ids: labels,
		subject,
		snippet,
		participant_addresses: participants.addresses,
		participant_domains: participants.domains,
		lexical_tokens: tokenizeEmailRelevanceText(`${subject} ${snippet}`)
	};
}
