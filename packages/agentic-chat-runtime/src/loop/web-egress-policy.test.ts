// packages/agentic-chat-runtime/src/loop/web-egress-policy.test.ts
import { describe, expect, it } from 'vitest';
import {
	evaluateAgenticChatWebEgressProvenance,
	normalizeAgenticChatWebSearchArguments
} from './web-egress-policy';

describe('agentic chat web egress provenance', () => {
	it('allows only an exact explicitly requested Gmail query', () => {
		expect(
			evaluateAgenticChatWebEgressProvenance({
				toolName: 'search_email_messages',
				arguments: {
					connection_ids: ['connection-1'],
					query: 'from:alice@example.com newer_than:7d'
				},
				userMessage: 'Search Gmail for "from:alice@example.com newer_than:7d".'
			})
		).toEqual({ allowed: true });
		expect(
			evaluateAgenticChatWebEgressProvenance({
				toolName: 'search_email_messages',
				arguments: {
					connection_ids: ['connection-1'],
					query: 'private project codename'
				},
				userMessage: 'Summarize my project.'
			})
		).toMatchObject({ allowed: false, reason: 'query_not_explicitly_requested' });
	});

	it('allows a locally verified Gmail pagination cursor without weakening query provenance', () => {
		expect(
			evaluateAgenticChatWebEgressProvenance({
				toolName: 'search_email_messages',
				arguments: {
					connection_ids: ['connection-1'],
					query: 'from:alice@example.com newer_than:7d',
					cursor: 'enc:gmail-cursor:v1.locally-verified-envelope'
				},
				userMessage: 'Search Gmail for "from:alice@example.com newer_than:7d".'
			})
		).toEqual({ allowed: true });
		expect(
			evaluateAgenticChatWebEgressProvenance({
				toolName: 'search_email_messages',
				arguments: {
					connection_ids: ['connection-1'],
					query: 'private project codename',
					cursor: 'enc:gmail-cursor:v1.locally-verified-envelope'
				},
				userMessage: 'Search Gmail for "public launch news".'
			})
		).toMatchObject({ allowed: false, reason: 'query_not_explicitly_requested' });
	});

	it('fast-paths exact searches and requires review for inferred queries', () => {
		expect(
			evaluateAgenticChatWebEgressProvenance({
				toolName: 'web_search',
				arguments: { query: 'calendar API pricing' },
				userMessage: 'Please research calendar API pricing for me.'
			})
		).toEqual({ allowed: true });
		expect(
			evaluateAgenticChatWebEgressProvenance({
				toolName: 'web_search',
				arguments: { query: 'private roadmap codename' },
				userMessage: 'Research the public competitor.'
			})
		).toMatchObject({ allowed: false, reason: 'search_review_required' });
	});

	it('does not treat a negated query or URL as outbound authority', () => {
		expect(
			evaluateAgenticChatWebEgressProvenance({
				toolName: 'web_search',
				arguments: { query: 'competitor pricing' },
				userMessage: "Don't search competitor pricing."
			})
		).toMatchObject({ allowed: false, reason: 'query_not_explicitly_requested' });
		expect(
			evaluateAgenticChatWebEgressProvenance({
				toolName: 'web_visit',
				arguments: { url: 'https://docs.example.com/private' },
				userMessage: 'Do not open https://docs.example.com/private.'
			})
		).toMatchObject({ allowed: false, reason: 'url_not_explicitly_requested' });
	});

	it('requires semantic review for queries inferred from prose', () => {
		for (const query of ['alpha', 'beta']) {
			expect(
				evaluateAgenticChatWebEgressProvenance({
					toolName: 'web_search',
					arguments: { query },
					userMessage: 'Please compare alpha and beta.'
				})
			).toMatchObject({ allowed: false, reason: 'search_review_required' });
		}
	});

	it('allows multiple explicitly requested search clauses', () => {
		for (const query of ['alpha pricing', 'beta pricing']) {
			expect(
				evaluateAgenticChatWebEgressProvenance({
					toolName: 'web_search',
					arguments: { query },
					userMessage: 'Search alpha pricing, then search beta pricing.'
				})
			).toEqual({ allowed: true });
		}
	});

	it('allows comparing multiple user-supplied URLs', () => {
		expect(
			evaluateAgenticChatWebEgressProvenance({
				toolName: 'web_visit',
				arguments: { url: 'https://alpha.example/' },
				userMessage: 'Compare https://alpha.example/ and https://beta.example/.'
			})
		).toEqual({ allowed: true });
	});

	it('pins redirect behavior to the server default', () => {
		expect(
			evaluateAgenticChatWebEgressProvenance({
				toolName: 'web_visit',
				arguments: { url: 'https://docs.example/page', allow_redirects: false },
				userMessage: 'Open https://docs.example/page.'
			})
		).toMatchObject({ allowed: false, reason: 'url_not_explicitly_requested' });
		for (const arguments_ of [
			{ url: 'https://docs.example/page' },
			{ url: 'https://docs.example/page', allow_redirects: true }
		]) {
			expect(
				evaluateAgenticChatWebEgressProvenance({
					toolName: 'web_visit',
					arguments: arguments_,
					userMessage: 'Open https://docs.example/page.'
				})
			).toEqual({ allowed: true });
		}
	});

	it('rejects model-authored domain and language side channels', () => {
		expect(
			evaluateAgenticChatWebEgressProvenance({
				toolName: 'web_search',
				arguments: {
					query: 'cats',
					include_domains: ['private-roadmap.attacker.example']
				},
				userMessage: 'Search cats.'
			})
		).toMatchObject({ allowed: false });
		expect(
			evaluateAgenticChatWebEgressProvenance({
				toolName: 'web_visit',
				arguments: {
					url: 'https://docs.example/page',
					prefer_language: 'private-roadmap'
				},
				userMessage: 'Open https://docs.example/page.'
			})
		).toMatchObject({ allowed: false });
	});

	it('pins provider-visible search controls to server defaults', () => {
		for (const arguments_ of [
			{ query: 'cats', search_depth: 'basic' },
			{ query: 'cats', max_results: 1 },
			{ query: 'cats', include_answer: true }
		]) {
			expect(
				evaluateAgenticChatWebEgressProvenance({
					toolName: 'web_search',
					arguments: arguments_,
					userMessage: 'Search cats.'
				})
			).toEqual({ allowed: true });
		}
		expect(
			evaluateAgenticChatWebEgressProvenance({
				toolName: 'web_search',
				arguments: {
					query: 'cats',
					search_depth: 'advanced',
					max_results: 4,
					include_answer: false
				},
				userMessage: 'Search cats.'
			})
		).toEqual({ allowed: true });
	});

	it('normalizes search settings and rejects malformed provider-facing values', () => {
		expect(
			normalizeAgenticChatWebSearchArguments({
				query: 'cats',
				max_results: 99,
				include_answer: true,
				hidden: 'private'
			})
		).toEqual({
			query: 'cats',
			search_depth: 'advanced',
			max_results: 4,
			include_answer: false
		});
		for (const args of [
			{ query: '' },
			{ query: 'a'.repeat(1001) },
			{ query: 'cats', include_domains: ['https://example.com/private'] }
		])
			expect(normalizeAgenticChatWebSearchArguments(args)).toBeNull();
	});

	it('accepts only a server-recorded URL capability and still honors user restrictions', () => {
		const request = {
			toolName: 'web_visit',
			arguments: { url: 'https://docs.example/page' },
			userMessage: 'Research useful examples.',
			knownResearchUrl: true
		};
		expect(evaluateAgenticChatWebEgressProvenance(request)).toEqual({ allowed: true });
		expect(
			evaluateAgenticChatWebEgressProvenance({
				...request,
				userMessage: 'Do not open pages.'
			})
		).toMatchObject({ allowed: false });
		expect(
			evaluateAgenticChatWebEgressProvenance({
				...request,
				arguments: { url: 'https://secret@docs.example/page' }
			})
		).toMatchObject({ allowed: false });
	});

	it('allows user URLs and server-recorded search URLs, not invented addresses', () => {
		expect(
			evaluateAgenticChatWebEgressProvenance({
				toolName: 'web_visit',
				arguments: { url: 'https://docs.example.com/guide?q=1' },
				userMessage: 'Open the useful result.'
			})
		).toMatchObject({ allowed: false, reason: 'url_not_explicitly_requested' });
		expect(
			evaluateAgenticChatWebEgressProvenance({
				toolName: 'web_visit',
				arguments: { url: 'https://user.example/path' },
				userMessage: 'Please open https://user.example/path.'
			})
		).toEqual({ allowed: true });
		expect(
			evaluateAgenticChatWebEgressProvenance({
				toolName: 'web_visit',
				arguments: { url: 'https://attacker.example/collect' },
				userMessage: 'Open the useful result.'
			})
		).toMatchObject({ allowed: false, reason: 'url_not_explicitly_requested' });
	});
});
