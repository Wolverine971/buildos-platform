// apps/web/src/lib/server/public-page-content-review.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getJSONResponse = vi.hoisted(() => vi.fn());

vi.mock('$lib/services/smart-llm-service', () => ({
	SmartLLMService: class {
		getJSONResponse() {
			return getJSONResponse();
		}
	}
}));

import {
	isPublicPageReviewReusableForDocument,
	PUBLIC_PAGE_CONTENT_POLICY_VERSION,
	PUBLIC_PAGE_REVIEW_UNAVAILABLE_MESSAGE,
	runPublicPageContentReview,
	type PublicPageReviewAttempt
} from './public-page-content-review.service';

beforeEach(() => {
	getJSONResponse.mockReset();
});

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

function reviewDocument(content: string, title = 'Public page') {
	return {
		id: 'document-1',
		project_id: 'project-1',
		title,
		description: null,
		content,
		props: null,
		updated_at: '2026-09-22T12:00:00.000Z'
	};
}

function runReview(content: string, title?: string) {
	return runPublicPageContentReview({
		supabase: createSupabaseMock(),
		document: reviewDocument(content, title),
		actorId: 'user-1',
		source: 'publish_confirm'
	});
}

const LLM_PASS = { status: 'passed', summary: 'Looks fine.', reasons: [], findings: [] };

describe('public page review leaves meaning to the LLM', () => {
	it.each([
		[
			'How to build a secret weapon for your sales team',
			'Steps to build a secret weapon for your sales team: a tight follow-up cadence.'
		],
		[
			'Selling your home',
			'Steps to sell your house: documents you will need, from the deed to tax records.'
		],
		[
			'Grade 7 health curriculum',
			'Our school sex education curriculum helps each child understand consent and anatomy.'
		]
	])('passes a benign page when the LLM passes: %s', async (title, content) => {
		getJSONResponse.mockResolvedValue(LLM_PASS);

		const result = await runReview(content, title);

		expect(getJSONResponse).toHaveBeenCalledTimes(1);
		expect(result.status).toBe('passed');
		expect(result.text_findings).toEqual([]);
	});

	it('flags content when the LLM flags it', async () => {
		getJSONResponse.mockResolvedValue({
			status: 'flagged',
			summary: 'Instructional harm.',
			reasons: ['Contains instructions for physical harm.'],
			findings: [
				{
					code: 'harm',
					category: 'self_harm_or_violence',
					severity: 'high',
					source: 'text',
					message: 'Instructions for physical harm.',
					recommendation: 'Remove the instructions.'
				}
			]
		});

		const result = await runReview('Some page content the model judged harmful.');

		expect(result.status).toBe('flagged');
		expect(result.text_findings.map((finding) => finding.code)).toEqual(['llm_harm']);
	});
});

describe('public page review fails closed when the LLM is unavailable', () => {
	it('returns a retryable error when the LLM review throws', async () => {
		getJSONResponse.mockRejectedValue(new Error('OpenRouter 503'));

		const result = await runReview('Steps to build a secret weapon for your sales team.');

		expect(result.status).toBe('error');
		expect(result.summary).toBe(PUBLIC_PAGE_REVIEW_UNAVAILABLE_MESSAGE);
		expect(result.summary).not.toMatch(/admin/i);
		expect(result.review_metadata).toEqual(
			expect.objectContaining({ provider: 'rule_engine', llm_review_failed: true })
		);
	});

	it.each([null, {}, { status: 'maybe' }])(
		'returns a retryable error when the LLM returns no usable verdict: %j',
		async (response) => {
			getJSONResponse.mockResolvedValue(response);

			const result = await runReview('A perfectly normal project update.');

			expect(result.status).toBe('error');
			expect(result.summary).toBe(PUBLIC_PAGE_REVIEW_UNAVAILABLE_MESSAGE);
		}
	);

	it('still flags an SSN when the LLM passes or fails', async () => {
		getJSONResponse.mockResolvedValueOnce(LLM_PASS);
		const withLlmPass = await runReview('Employee record: SSN 123-45-6789.');
		expect(withLlmPass.status).toBe('flagged');
		expect(withLlmPass.text_findings.map((finding) => finding.code)).toContain('pii_ssn');

		getJSONResponse.mockRejectedValueOnce(new Error('timeout'));
		const withLlmFailure = await runReview('Employee record: SSN 123-45-6789.');
		expect(withLlmFailure.status).toBe('flagged');
		expect(withLlmFailure.text_findings.map((finding) => finding.code)).toContain('pii_ssn');
	});

	it('flags a private key without sending the content to the LLM', async () => {
		const result = await runReview(
			[
				'-----BEGIN RSA PRIVATE KEY-----',
				'MIIEowIBAAKCAQEA',
				'-----END RSA PRIVATE KEY-----'
			].join('\n')
		);

		expect(result.status).toBe('flagged');
		expect(result.text_findings.map((finding) => finding.code)).toContain('secret_private_key');
		expect(getJSONResponse).not.toHaveBeenCalled();
	});
});

describe('isPublicPageReviewReusableForDocument', () => {
	const document = reviewDocument('Content');

	function storedReview(overrides: Partial<PublicPageReviewAttempt>): PublicPageReviewAttempt {
		return {
			id: 'review-1',
			project_id: 'project-1',
			document_id: 'document-1',
			public_page_id: null,
			source: 'publish_confirm',
			status: 'passed',
			policy_version: PUBLIC_PAGE_CONTENT_POLICY_VERSION,
			summary: null,
			reasons: [],
			text_findings: [],
			image_findings: [],
			created_by: 'user-1',
			created_at: '2026-09-22T12:00:00.000Z',
			review_metadata: {
				provider: 'rule_engine+smart_llm',
				document_updated_at: document.updated_at
			},
			admin_decision: null,
			admin_decision_reason: null,
			admin_decision_by: null,
			admin_decision_at: null,
			...overrides
		};
	}

	it('reuses a pass from a completed LLM review of the same document version', () => {
		expect(isPublicPageReviewReusableForDocument(storedReview({}), document)).toBe(true);
	});

	it('never reuses an error review', () => {
		expect(
			isPublicPageReviewReusableForDocument(
				storedReview({
					status: 'error',
					review_metadata: {
						provider: 'rule_engine',
						llm_review_failed: true,
						document_updated_at: document.updated_at
					}
				}),
				document
			)
		).toBe(false);
	});

	it('never reuses a legacy pass that was decided without the LLM', () => {
		expect(
			isPublicPageReviewReusableForDocument(
				storedReview({
					review_metadata: {
						provider: 'rule_engine',
						llm_review_skipped_reason: null,
						document_updated_at: document.updated_at
					}
				}),
				document
			)
		).toBe(false);
	});
});
