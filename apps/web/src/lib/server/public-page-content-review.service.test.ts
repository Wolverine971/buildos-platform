// apps/web/src/lib/server/public-page-content-review.service.test.ts
import { describe, expect, it, vi } from 'vitest';

const getJSONResponse = vi.hoisted(() => vi.fn());

vi.mock('$lib/services/smart-llm-service', () => ({
	SmartLLMService: class {
		getJSONResponse() {
			return getJSONResponse();
		}
	}
}));

import {
	PUBLIC_PAGE_CONTENT_POLICY_VERSION,
	runPublicPageContentReview
} from './public-page-content-review.service';

function createSupabaseMock() {
	const emptyQuery = {
		select() {
			return this;
		},
		eq() {
			return this;
		},
		then(resolve: (value: { data: unknown[]; error: null }) => void) {
			resolve({ data: [], error: null });
		}
	};

	return {
		from(table: string) {
			if (table === 'onto_asset_links') return emptyQuery;
			if (table === 'onto_public_page_review_attempts') {
				return {
					insert(payload: Record<string, unknown>) {
						return {
							select() {
								return {
									async single() {
										return {
											data: {
												id: 'review-1',
												created_at: '2026-07-22T00:00:00.000Z',
												...payload
											},
											error: null
										};
									}
								};
							}
						};
					}
				};
			}
			throw new Error(`Unexpected table: ${table}`);
		}
	};
}

describe('public page credential review', () => {
	it('flags common credential formats before content is published', async () => {
		const content = [
			'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
			'sk_' + 'test_' + 'a'.repeat(24),
			'SG.abcdefghijklmnop.qrstuvwxyzABCDEF',
			'AKIAABCDEFGHIJKLMNOP',
			`ghp_${'a'.repeat(36)}`,
			'xoxb-abcdefghijklmnop',
			`AIza${'A'.repeat(35)}`
		].join('\n');

		const result = await runPublicPageContentReview({
			supabase: createSupabaseMock(),
			document: {
				id: 'document-1',
				project_id: 'project-1',
				title: 'Credential check',
				description: null,
				content,
				props: null
			},
			actorId: 'user-1',
			source: 'publish_confirm'
		});

		expect(PUBLIC_PAGE_CONTENT_POLICY_VERSION).toBe('public_page_policy_v2');
		expect(result.status).toBe('flagged');
		expect(result.text_findings).toHaveLength(7);
		expect(result.text_findings.every((finding) => finding.code === 'secret_api_token')).toBe(
			true
		);
		expect(JSON.stringify(result)).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz123456');
		expect(JSON.stringify(result)).not.toContain('SG.abcdefghijklmnop.qrstuvwxyzABCDEF');
		expect(getJSONResponse).not.toHaveBeenCalled();
	});
});
