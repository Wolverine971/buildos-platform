// packages/agentic-chat-runtime/src/loop/web-egress-policy.ts
import type { JsonObject } from '@buildos/shared-types';

export type AgenticChatWebEgressToolName = 'web_search' | 'web_visit' | 'search_email_messages';

export type AgenticChatWebEgressProvenanceDecision =
	| { allowed: true }
	| {
			allowed: false;
			reason:
				| 'search_review_required'
				| 'query_not_explicitly_requested'
				| 'url_not_explicitly_requested'
				| 'invalid_web_egress_arguments';
	  };

const WEB_EGRESS_TOOL_NAMES = new Set<AgenticChatWebEgressToolName>([
	'web_search',
	'web_visit',
	'search_email_messages'
]);

export function isAgenticChatWebEgressToolName(
	toolName: string
): toolName is AgenticChatWebEgressToolName {
	return WEB_EGRESS_TOOL_NAMES.has(toolName.trim().toLowerCase() as AgenticChatWebEgressToolName);
}

/**
 * Email tools whose payload carries account plumbing (connection ids, labels,
 * addresses the user already named, capability booleans) and no message
 * content. They must not taint the turn's egress state: `search_email_messages`
 * is unusable without first calling `list_email_accounts` for its connection
 * ids, so treating that prerequisite as private content would make Gmail search
 * permanently unreachable. Web classifies `list_email_accounts` the same way
 * (`PROVIDER_NEUTRAL_OR_CONTROL_TOOLS` in turn-security-policy.ts).
 */
export const AGENTIC_CHAT_CONTENT_FREE_EMAIL_TOOL_NAMES_V1 = Object.freeze([
	'get_external_account_status',
	'request_email_account_connection',
	'list_email_accounts'
] as const);

const CONTENT_FREE_EMAIL_TOOL_NAMES = new Set<string>(
	AGENTIC_CHAT_CONTENT_FREE_EMAIL_TOOL_NAMES_V1
);

export function isAgenticChatContentFreeEmailToolNameV1(toolName: string): boolean {
	return CONTENT_FREE_EMAIL_TOOL_NAMES.has(toolName.trim().toLowerCase());
}

/**
 * Exact user-requested searches take a deterministic fast path. Other searches
 * require an isolated semantic review before dispatch. Successful search URLs
 * are supplied by the host's receipt ledger, never by model-authored arguments.
 */
export function evaluateAgenticChatWebEgressProvenance(params: {
	toolName: string;
	arguments: JsonObject;
	userMessage: string;
	knownResearchUrl?: boolean;
}): AgenticChatWebEgressProvenanceDecision {
	const toolName = params.toolName.trim().toLowerCase();
	if (toolName === 'search_email_messages') {
		const query = readNonemptyText(params.arguments.query);
		if (!query) return { allowed: false, reason: 'invalid_web_egress_arguments' };
		const normalizedQuery = normalizeProvenanceText(query);
		const explicitQueries = extractExplicitGmailQueries(params.userMessage);
		if (
			hasNegatedGmailSearchRequest(params.userMessage) ||
			!normalizedQuery ||
			explicitQueries.size !== 1 ||
			!explicitQueries.has(normalizedQuery) ||
			(params.arguments.max_results !== undefined && params.arguments.max_results !== 12)
		) {
			return { allowed: false, reason: 'query_not_explicitly_requested' };
		}
		// The optional cursor is an opaque BuildOS AES-GCM envelope, bound to the
		// current user, connection, and exact query with a short expiry. The Gmail
		// gateway consumes it locally before any provider request, so permitting the
		// field restores pagination without creating a model-controlled egress value.
		return { allowed: true };
	}
	if (toolName === 'web_search') {
		const normalized = normalizeAgenticChatWebSearchArguments(params.arguments);
		if (!normalized) return { allowed: false, reason: 'invalid_web_egress_arguments' };
		const query = normalized.query as string;
		const normalizedQuery = normalizeProvenanceText(query);
		if (hasNegatedWebEgressRequest(params.userMessage, 'search')) {
			return { allowed: false, reason: 'query_not_explicitly_requested' };
		}
		const explicitQueries = extractExplicitSearchQueries(params.userMessage);
		if (
			!explicitQueries.has(normalizedQuery) ||
			normalized.include_domains ||
			normalized.exclude_domains
		) {
			return { allowed: false, reason: 'search_review_required' };
		}
		return { allowed: true };
	}

	if (toolName === 'web_visit') {
		const requestedUrl = canonicalizeHttpUrl(readNonemptyText(params.arguments.url));
		if (!requestedUrl) return { allowed: false, reason: 'invalid_web_egress_arguments' };
		if (hasNegatedWebEgressRequest(params.userMessage, 'visit')) {
			return { allowed: false, reason: 'url_not_explicitly_requested' };
		}
		const preferLanguage = readNonemptyText(params.arguments.prefer_language);
		if (preferLanguage && !hasExplicitVisitLanguage(params.userMessage, preferLanguage)) {
			return { allowed: false, reason: 'url_not_explicitly_requested' };
		}
		if (
			params.arguments.allow_redirects !== undefined &&
			params.arguments.allow_redirects !== true
		) {
			// Redirect behavior changes the provider-visible request graph. Pin it
			// to the server default so it cannot carry a model-selected bit.
			return { allowed: false, reason: 'url_not_explicitly_requested' };
		}
		const userUrls = extractHttpUrls(params.userMessage);
		if (userUrls.has(requestedUrl) || params.knownResearchUrl === true) {
			return { allowed: true };
		}
		return { allowed: false, reason: 'url_not_explicitly_requested' };
	}

	return { allowed: true };
}

/** Only these fields may cross the search-provider boundary. */
export function normalizeAgenticChatWebSearchArguments(args: JsonObject): JsonObject | null {
	const query = readNonemptyText(args.query);
	if (!query || query.length > 1_000 || /[\u0000-\u001f\u007f]/u.test(query)) return null;
	const result: JsonObject = {
		query,
		search_depth: 'advanced',
		max_results: 4,
		include_answer: false
	};
	for (const field of ['include_domains', 'exclude_domains'] as const) {
		const domains = args[field];
		if (domains === undefined) continue;
		if (
			!Array.isArray(domains) ||
			domains.length > 5 ||
			domains.some(
				(domain) =>
					typeof domain !== 'string' ||
					domain.length > 253 ||
					!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/iu.test(domain)
			)
		)
			return null;
		if (domains.length) result[field] = [...new Set(domains as string[])].sort();
	}
	return result;
}

function extractExplicitGmailQueries(message: string): Set<string> {
	const queries = new Set<string>();
	for (const match of message
		.normalize('NFKC')
		.matchAll(
			/\b(?:search|find|look\s+up)\s+(?:my\s+)?(?:gmail|email|inbox)(?:\s+(?:messages?|emails?))?\s+(?:for\s+)?(?:["“']([^"”']+)["”']|(.+?))(?=[.;!?]|$)/giu
		)) {
		const candidate = (match[1] ?? match[2] ?? '').trim();
		if (candidate) queries.add(normalizeProvenanceText(candidate));
	}
	return queries;
}

function hasNegatedGmailSearchRequest(message: string): boolean {
	return /\b(?:do\s+not|don['’]?t|never|avoid)\s+(?:\w+\s+){0,3}(?:search|find|look\s+up)\s+(?:my\s+)?(?:gmail|email|inbox)\b/iu.test(
		message.normalize('NFKC')
	);
}

function extractExplicitSearchQueries(message: string): Set<string> {
	const queries = new Set<string>();
	const normalizedWhole = normalizeProvenanceText(message)
		.replace(/[.!?]+$/g, '')
		.trim();
	// A bare query is deterministic because it offers the model only one exact
	// outbound value. Longer prose must use an explicit research verb.
	if (normalizedWhole && !/\s/.test(normalizedWhole)) queries.add(normalizedWhole);
	for (const match of message
		.normalize('NFKC')
		.matchAll(
			/\b(?:search|research|look\s+up|browse|find)\s+(?:for\s+)?(.+?)(?=\s*,?\s*\bthen\b|[.;!?]|$)/giu
		)) {
		const candidate = (match[1] ?? '')
			.trim()
			.replace(/^(?:["“'])(.*)(?:["”'])$/u, '$1')
			.replace(/\s+for\s+me$/iu, '')
			.trim();
		if (candidate) queries.add(normalizeProvenanceText(candidate));
	}
	return queries;
}

function hasExplicitVisitLanguage(message: string, language: string): boolean {
	const escaped = language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(
		`\\b(?:prefer(?:red)?\\s+language|language)\\s*[:=]?\\s*["“']?${escaped}["”']?\\b`,
		'iu'
	).test(message.normalize('NFKC'));
}

function hasNegatedWebEgressRequest(message: string, operation: 'search' | 'visit'): boolean {
	const verb =
		operation === 'search'
			? '(?:search|research|browse|look\\s+up|fetch)'
			: '(?:open|visit|browse|fetch)';
	return new RegExp(
		`\\b(?:(?:do\\s+not|don['’]?t|never|avoid)\\s+(?:\\w+\\s+){0,3}${verb}|without\\s+(?:\\w+\\s+){0,3}${verb}(?:ing)?)\\b`,
		'iu'
	).test(message.normalize('NFKC'));
}

export function canonicalizeAgenticChatWebUrl(value: string): string | null {
	return canonicalizeHttpUrl(value);
}

function normalizeProvenanceText(value: string): string {
	return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function extractHttpUrls(value: string): Set<string> {
	const urls = new Set<string>();
	for (const match of value.matchAll(/https?:\/\/[^\s<>"'`]+/giu)) {
		let candidate = match[0];
		while (/[),.;!?\]}]$/.test(candidate)) candidate = candidate.slice(0, -1);
		const canonical = canonicalizeHttpUrl(candidate);
		if (canonical) urls.add(canonical);
	}
	return urls;
}

function canonicalizeHttpUrl(value: string | null): string | null {
	if (!value) return null;
	try {
		const parsed = new URL(value);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
		if (parsed.username || parsed.password) return null;
		parsed.hash = '';
		return parsed.toString();
	} catch {
		return null;
	}
}

function readNonemptyText(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}
