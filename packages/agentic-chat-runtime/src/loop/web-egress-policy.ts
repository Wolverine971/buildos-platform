// packages/agentic-chat-runtime/src/loop/web-egress-policy.ts
import type { JsonObject } from '@buildos/shared-types';

export type AgenticChatWebEgressToolName = 'web_search' | 'web_visit' | 'search_email_messages';

export type AgenticChatWebEgressProvenanceDecision =
	| { allowed: true }
	| {
			allowed: false;
			reason:
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
 * Authorize outbound research from the current trusted user message, never from
 * model-visible history or preloaded workspace context. Search queries must be
 * explicitly present in the current message. Visits must target a URL written
 * by the user. Model selection among search-result URLs is not authority: it
 * can become a covert channel for preloaded private context.
 */
export function evaluateAgenticChatWebEgressProvenance(params: {
	toolName: string;
	arguments: JsonObject;
	userMessage: string;
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
		const query = readNonemptyText(params.arguments.query);
		if (!query) return { allowed: false, reason: 'invalid_web_egress_arguments' };
		const normalizedQuery = normalizeProvenanceText(query);
		if (hasNegatedWebEgressRequest(params.userMessage, 'search')) {
			return { allowed: false, reason: 'query_not_explicitly_requested' };
		}
		const explicitQueries = extractExplicitSearchQueries(params.userMessage);
		if (
			!normalizedQuery ||
			explicitQueries.size !== 1 ||
			!explicitQueries.has(normalizedQuery)
		) {
			return { allowed: false, reason: 'query_not_explicitly_requested' };
		}
		for (const field of ['include_domains', 'exclude_domains'] as const) {
			const domains = params.arguments[field];
			if (domains === undefined) continue;
			// Optional domain arrays introduce another model-controlled choice channel.
			// Users can place a deterministic `site:domain` term in the exact query.
			if (!Array.isArray(domains) || domains.length > 0) {
				return { allowed: false, reason: 'query_not_explicitly_requested' };
			}
		}
		if (
			(params.arguments.search_depth !== undefined &&
				params.arguments.search_depth !== 'advanced') ||
			(params.arguments.max_results !== undefined && params.arguments.max_results !== 4) ||
			(params.arguments.include_answer !== undefined &&
				params.arguments.include_answer !== false)
		) {
			// These values are sent to the provider and affect both response shape
			// and billing. Pin them to server defaults so a model cannot encode data
			// through otherwise user-authorized search calls.
			return { allowed: false, reason: 'query_not_explicitly_requested' };
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
		if (userUrls.size === 1 && userUrls.has(requestedUrl)) {
			return { allowed: true };
		}
		return { allowed: false, reason: 'url_not_explicitly_requested' };
	}

	return { allowed: true };
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
		return parsed.toString();
	} catch {
		return null;
	}
}

function readNonemptyText(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}
