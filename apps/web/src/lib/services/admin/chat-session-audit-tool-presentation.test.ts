// apps/web/src/lib/services/admin/chat-session-audit-tool-presentation.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildToolPayloadOverview,
	normalizeToolPayloadValue
} from './chat-session-audit-tool-presentation';

describe('chat-session-audit-tool-presentation', () => {
	it('decodes JSON stored in trace preview strings', () => {
		expect(
			normalizeToolPayloadValue('{"query":"read gmail email inbox","group":"email"}')
		).toEqual({
			query: 'read gmail email inbox',
			group: 'email'
		});
	});

	it('surfaces the main request and compact supporting facts', () => {
		const overview = buildToolPayloadOverview(
			'{"query":"read gmail email inbox","group":"email","limit":10}',
			'request'
		);

		expect(overview.headline).toBe('read gmail email inbox');
		expect(overview.facts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ label: 'Group', value: 'email' }),
				expect.objectContaining({ label: 'Limit', value: '10' })
			])
		);
	});

	it('summarizes tool-search responses and promotes matching operations', () => {
		const overview = buildToolPayloadOverview(
			{
				type: 'tool_search_results',
				query: 'read gmail email inbox',
				total_matches: 3,
				matches: [
					{
						op: 'email.accounts.list',
						summary: "List the user's connected Gmail accounts that BuildOS can read.",
						group: 'email',
						kind: 'read',
						entity: 'account'
					}
				]
			},
			'response'
		);

		expect(overview.headline).toBe('3 results for “read gmail email inbox”');
		expect(overview.collectionLabel).toBe('Matches');
		expect(overview.facts).not.toEqual(
			expect.arrayContaining([expect.objectContaining({ key: 'query' })])
		);
		expect(overview.items[0]).toMatchObject({
			title: 'email.accounts.list',
			detail: "List the user's connected Gmail accounts that BuildOS can read.",
			meta: 'email · read · account'
		});
	});

	it('recovers the useful portion of a truncated JSON result preview', () => {
		const overview = buildToolPayloadOverview(
			'{"type":"tool_search_results","query":"read gmail email inbox","total_matches":3,"matches":[{"op":"email.accounts.list","summary":"List connected accounts","group":"email","kind":"read","entity":"account"},{"op":"email.messages.get","summary":"Fetch one message"}...',
			'response'
		);

		expect(overview.headline).toBe('3 results for “read gmail email inbox”');
		expect(overview.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ title: 'email.accounts.list' }),
				expect.objectContaining({ title: 'email.messages.get' })
			])
		);
	});
});
