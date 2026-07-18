// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/__budget-probe.test.ts
// TEMPORARY probe test - delete after review.
import { describe, expect, it } from 'vitest';
import { buildToolPayloadForModel } from './tool-payload-compaction';

function makeToolCall(name: string): any {
	return { id: 'tc1', type: 'function', function: { name, arguments: '{}' } };
}

describe('budget probe', () => {
	it('web_search: 10 advanced results with ordinary urls/titles', () => {
		const results = Array.from({ length: 10 }, (_, i) => ({
			title: `Comparing the Top Enterprise Project Management Platforms in 2026 - Part ${i}`,
			url: `https://www.example-industry-review.com/articles/2026/07/enterprise-pm-platforms-comparison-part-${i}?utm_source=tavily`,
			// Tavily advanced content ~2000 chars -> websearch caps at 1600 + '...'
			snippet: `${'Asana pricing starts at $10.99 per user per month billed annually, while Monday.com "standard" tier lists $12 per seat. '.repeat(20).slice(0, 1600)}...`,
			score: 0.987654321,
			published_date: '2026-07-01'
		}));
		const payload = {
			query: 'enterprise project management platform pricing comparison 2026',
			answer: 'The leading enterprise project management platforms in 2026 include Asana, Monday.com, Wrike, Smartsheet, and ClickUp. Pricing generally ranges from $10 to $25 per user per month for business tiers, with enterprise tiers priced by custom quote. '
				.repeat(3)
				.slice(0, 700),
			results,
			follow_up_questions: [
				'What are the enterprise tier prices for Asana and Monday.com?',
				'Which platform offers the best value for teams over 500 seats?',
				'How do annual discounts compare across these vendors?'
			],
			message:
				'Web search results from Tavily for "enterprise project management platform pricing comparison 2026" (advanced, max 10).',
			info: {
				provider: 'tavily',
				search_depth: 'advanced',
				max_results: 10,
				include_answer: true,
				fetched_at: '2026-07-18T12:00:00.000Z'
			}
		};
		const out: any = buildToolPayloadForModel(
			makeToolCall('web_search'),
			{ tool_call_id: 'tc1', success: true, result: payload } as any,
			() => ({ args: {} })
		);
		const serialized = JSON.stringify(out);
		const degraded = typeof out.preview === 'string' && out.truncated === true;
		expect(
			`WEB_SEARCH len=${serialized.length} degraded=${degraded} original=${out.original_length ?? 'n/a'}`
		).toBe('PROBE');
	});

	it('web_visit: markdown-heavy page with rich links/meta', () => {
		const mdLine =
			'- [Release notes](https://docs.example.com/releases/v2) covering the "July" update and `config` changes\n';
		const content = mdLine.repeat(200); // ~20k chars, newline-dense markdown
		const payload = {
			url: 'https://docs.example.com/platform/releases?utm_campaign=x',
			final_url: 'https://docs.example.com/platform/releases',
			status_code: 200,
			content_type: 'text/html',
			title: 'Platform Release Notes and Migration Guide - Example Docs Portal',
			canonical_url: 'https://docs.example.com/platform/releases',
			content_format: 'markdown',
			excerpt: 'Release notes covering the July update. '.repeat(15).slice(0, 490),
			content,
			truncated: true,
			structured_data: Array.from({ length: 20 }, (_, i) => ({
				type: 'BreadcrumbList',
				name: `Docs breadcrumb entry number ${i} for the platform release documentation`,
				url: `https://docs.example.com/platform/releases/breadcrumb/${i}`
			})),
			links: Array.from({ length: 10 }, (_, i) => ({
				url: `https://docs.example.com/platform/releases/v${i}?ref=footer-navigation-block`,
				text: `Release ${i} notes with migration steps and deprecation timeline details for enterprise`
			})),
			meta: Object.fromEntries(
				Array.from({ length: 12 }, (_, i) => [
					`og:custom_property_${i}`,
					'A fairly long open-graph style meta value describing the documentation page contents for social preview cards. '
						.repeat(2)
						.slice(0, 210)
				])
			),
			message: 'Fetched https://docs.example.com/platform/releases (reader mode).',
			info: {
				fetched_at: '2026-07-18T12:00:00.000Z',
				mode: 'reader',
				parser: 'readability',
				extraction_strategy: 'article',
				fetch_ms: 812,
				bytes: 431222,
				html_chars: 210000,
				markdown_chars: 20200,
				conversion: 'turndown',
				conversion_ms: 12,
				cache_hit: false
			}
		};
		const out: any = buildToolPayloadForModel(
			makeToolCall('web_visit'),
			{ tool_call_id: 'tc1', success: true, result: payload } as any,
			() => ({ args: {} })
		);
		const serialized = JSON.stringify(out);
		const degraded = typeof out.preview === 'string' && out.truncated === true;
		expect(
			`WEB_VISIT len=${serialized.length} degraded=${degraded} original=${out.original_length ?? 'n/a'} contentLen=${typeof out.content === 'string' ? out.content.length : 'n/a'}`
		).toBe('PROBE');
	});
});
