// apps/web/src/lib/server/public-page-content-review.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getJSONResponse = vi.hoisted(() => vi.fn());

vi.mock('$lib/services/smart-llm-service', () => ({
	SmartLLMService: class {
		getJSONResponse(options: unknown) {
			return getJSONResponse(options);
		}
	}
}));

import {
	computePublicPageReviewFingerprint,
	getLatestPublicPageReviewForDocument,
	getPublicPageReviewApprovalBlocker,
	isPublicPageReviewApprovedForPublish,
	isPublicPageReviewReusableForDocument,
	PUBLIC_PAGE_CONTENT_POLICY_VERSION,
	PUBLIC_PAGE_REVIEW_TOO_LONG_CODE,
	PUBLIC_PAGE_REVIEW_UNAVAILABLE_MESSAGE,
	PublicPageReviewDecisionError,
	runPublicPageContentReview,
	setPublicPageReviewAdminDecision,
	splitTextForLlmReview,
	type PublicPageReviewAttempt
} from './public-page-content-review.service';

beforeEach(() => {
	getJSONResponse.mockReset();
});

/** User-scoped client: only asset reads. Any review-attempt write fails the test. */
function createUserSupabaseMock() {
	const emptyQuery: any = {
		select: () => emptyQuery,
		eq: () => emptyQuery,
		then(resolve: (value: { data: unknown[]; error: null }) => void) {
			resolve({ data: [], error: null });
		}
	};
	return {
		from(table: string) {
			if (table === 'onto_asset_links') return emptyQuery;
			throw new Error(`User client must not touch ${table}`);
		}
	};
}

/** Service-role client: records review-attempt inserts. */
function createAdminSupabaseMock() {
	const inserted: Array<Record<string, unknown>> = [];
	const client = {
		from(table: string) {
			if (table !== 'onto_public_page_review_attempts') {
				throw new Error(`Unexpected admin table: ${table}`);
			}
			return {
				insert(payload: Record<string, unknown>) {
					inserted.push(payload);
					return {
						select() {
							return {
								async single() {
									return {
										data: {
											id: `review-${inserted.length}`,
											created_at: '2026-09-22T12:00:00.000Z',
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
	};
	return { client, inserted };
}

function reviewDocument(content: string, overrides: Record<string, unknown> = {}) {
	return {
		id: 'document-1',
		project_id: 'project-1',
		title: 'Public page',
		description: null,
		content,
		props: null,
		updated_at: '2026-09-22T12:00:00.000Z',
		...overrides
	} as {
		id: string;
		project_id: string;
		title: string | null;
		description: string | null;
		content: string | null;
		props: Record<string, unknown> | null;
		updated_at: string;
	};
}

function runReview(
	content: string,
	options: {
		title?: string;
		summary?: string | null;
		document?: Record<string, unknown>;
		previousReview?: PublicPageReviewAttempt | null;
	} = {}
) {
	const admin = createAdminSupabaseMock();
	const document = reviewDocument(content, options.document);
	const promise = runPublicPageContentReview({
		supabase: createUserSupabaseMock(),
		adminSupabase: admin.client,
		document,
		publication: { title: options.title ?? 'Public page', summary: options.summary ?? null },
		actorId: 'actor-1',
		source: 'publish_confirm',
		previousReview: options.previousReview ?? null
	});
	return { promise, admin };
}

function sentPrompts(): string[] {
	return getJSONResponse.mock.calls.map(
		([options]) => (options as { userPrompt: string }).userPrompt
	);
}

const LLM_PASS = { status: 'passed', summary: 'Looks fine.', reasons: [], findings: [] };
const LLM_FLAG = {
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
};

describe('public page review persistence', () => {
	it('writes the review attempt through the service-role client only', async () => {
		getJSONResponse.mockResolvedValue(LLM_PASS);
		const { promise, admin } = runReview('A perfectly normal project update.');

		const result = await promise;

		expect(PUBLIC_PAGE_CONTENT_POLICY_VERSION).toBe('public_page_policy_v3');
		expect(result.status).toBe('passed');
		expect(admin.inserted).toHaveLength(1);
		expect(admin.inserted[0]).toMatchObject({
			policy_version: 'public_page_policy_v3',
			created_by: 'actor-1',
			review_metadata: expect.objectContaining({
				provider: 'rule_engine+smart_llm',
				llm_review_completed: true,
				llm_review_failed: false,
				input_fingerprint: expect.any(String)
			})
		});
	});
});

describe('public page credential review', () => {
	it('flags credentials and still runs the LLM on the redacted text', async () => {
		getJSONResponse.mockResolvedValue(LLM_PASS);
		const secrets = [
			'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
			'sk_' + 'test_' + 'a'.repeat(24),
			'SG.abcdefghijklmnop.qrstuvwxyzABCDEF',
			'AKIAABCDEFGHIJKLMNOP',
			`ghp_${'a'.repeat(36)}`,
			'xoxb-abcdefghijklmnop',
			`AIza${'A'.repeat(35)}`
		];
		const { promise } = runReview(`Keys:\n${secrets.join('\n')}\nThe rest of the page.`);

		const result = await promise;

		expect(result.status).toBe('flagged');
		expect(result.text_findings).toHaveLength(7);
		expect(result.text_findings.every((finding) => finding.code === 'secret_api_token')).toBe(
			true
		);
		expect(getJSONResponse).toHaveBeenCalledTimes(1);
		const prompt = sentPrompts()[0];
		expect(prompt).toContain('The rest of the page.');
		expect(prompt).toContain('[redacted-credential]');
		for (const secret of secrets) {
			expect(prompt).not.toContain(secret);
			expect(JSON.stringify(result)).not.toContain(secret);
		}
		expect(result.review_metadata).toEqual(
			expect.objectContaining({
				provider: 'rule_engine+smart_llm',
				llm_review_completed: true,
				llm_input_redacted: true
			})
		);
	});

	it('redacts a whole private key block before the LLM reviews the page', async () => {
		getJSONResponse.mockResolvedValue(LLM_PASS);
		const keyBody = 'MIIEowIBAAKCAQEA'.repeat(4);
		const { promise } = runReview(
			[
				'Deployment notes.',
				'-----BEGIN RSA PRIVATE KEY-----',
				keyBody,
				keyBody,
				'-----END RSA PRIVATE KEY-----',
				'Closing paragraph.'
			].join('\n')
		);

		const result = await promise;

		expect(result.status).toBe('flagged');
		expect(result.text_findings.map((finding) => finding.code)).toContain('secret_private_key');
		expect(getJSONResponse).toHaveBeenCalledTimes(1);
		const prompt = sentPrompts()[0];
		expect(prompt).toContain('[redacted-private-key]');
		expect(prompt).toContain('Closing paragraph.');
		expect(prompt).not.toContain('MIIEowIBAAKCAQEA');
		expect(JSON.stringify(result)).not.toContain('MIIEowIBAAKCAQEA');
	});

	it('redacts private key body lines even when the END line is missing', async () => {
		getJSONResponse.mockResolvedValue(LLM_PASS);
		const keyLine = 'MIIEowIBAAKCAQEAx'.padEnd(64, 'Q');
		const { promise } = runReview(
			['-----BEGIN PRIVATE KEY-----', keyLine, keyLine, '', 'Readable text after.'].join('\n')
		);

		await promise;

		const prompt = sentPrompts()[0];
		expect(prompt).not.toContain(keyLine);
		expect(prompt).toContain('Readable text after.');
	});

	it('never sends a detected SSN to the LLM', async () => {
		getJSONResponse.mockResolvedValue(LLM_PASS);
		const { promise } = runReview('Employee record: SSN 123-45-6789.');

		const result = await promise;

		expect(result.status).toBe('flagged');
		expect(sentPrompts()[0]).not.toContain('123-45-6789');
		expect(JSON.stringify(result)).not.toContain('123-45-6789');
	});
});

describe('public page review covers what gets published', () => {
	it('reviews the published title and summary, not just the body', async () => {
		getJSONResponse.mockResolvedValue(LLM_PASS);
		const { promise } = runReview('Plain body.', {
			title: 'TITLE_SENTINEL headline',
			summary: 'SUMMARY_SENTINEL teaser'
		});

		await promise;

		const prompt = sentPrompts()[0];
		expect(prompt).toContain('TITLE_SENTINEL headline');
		expect(prompt).toContain('SUMMARY_SENTINEL teaser');
	});

	it('flags an SSN placed only in the published summary', async () => {
		getJSONResponse.mockResolvedValue(LLM_PASS);
		const { promise } = runReview('Plain body.', { summary: 'Call me: 123-45-6789' });

		const result = await promise;

		expect(result.status).toBe('flagged');
		expect(result.text_findings.map((finding) => finding.code)).toContain('pii_ssn');
	});

	it('reviews citation text that renders on the public page', async () => {
		getJSONResponse.mockResolvedValue(LLM_PASS);
		const { promise } = runReview('Plain body.', {
			document: {
				props: {
					citations: [
						{ url: 'https://example.com/a', label: 'CITATION_SENTINEL label' },
						{ url: 'javascript:alert(1)', label: 'Unsafe link label' }
					]
				}
			}
		});

		await promise;

		const prompt = sentPrompts()[0];
		expect(prompt).toContain('CITATION_SENTINEL label');
		expect(prompt).toContain('https://example.com/a');
		expect(prompt).toContain('Unsafe link label');
		expect(prompt).not.toContain('javascript:alert(1)');
	});

	it('only reuses a review for the exact title and summary it covered', () => {
		const document = reviewDocument('Content');
		const fingerprint = computePublicPageReviewFingerprint(document, {
			title: 'Reviewed title',
			summary: null
		});
		const review = storedReview({
			review_metadata: {
				provider: 'rule_engine+smart_llm',
				llm_review_completed: true,
				llm_review_failed: false,
				document_updated_at: document.updated_at,
				input_fingerprint: fingerprint
			}
		});

		expect(
			isPublicPageReviewReusableForDocument(review, document, {
				title: 'Reviewed title',
				summary: null
			})
		).toBe(true);
		expect(
			isPublicPageReviewReusableForDocument(review, document, {
				title: 'A different, unreviewed title',
				summary: null
			})
		).toBe(false);
	});
});

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

		const result = await runReview(content, { title }).promise;

		expect(getJSONResponse).toHaveBeenCalledTimes(1);
		expect(result.status).toBe('passed');
		expect(result.text_findings).toEqual([]);
	});

	it('flags content when the LLM flags it', async () => {
		getJSONResponse.mockResolvedValue(LLM_FLAG);

		const result = await runReview('Some page content the model judged harmful.').promise;

		expect(result.status).toBe('flagged');
		expect(result.text_findings.map((finding) => finding.code)).toEqual(['llm_harm']);
	});
});

describe('public page review of long pages', () => {
	const SENTINEL = 'HARMFUL_PAYLOAD_SENTINEL step-by-step instructions';

	function flagOnlyTheSentinel() {
		getJSONResponse.mockImplementation(async (options: { userPrompt: string }) =>
			options.userPrompt.includes('HARMFUL_PAYLOAD_SENTINEL') ? LLM_FLAG : LLM_PASS
		);
	}

	it('reviews content after the first 12,000 characters', async () => {
		flagOnlyTheSentinel();
		const content = `${'Benign filler paragraph.\n\n'.repeat(900)}${SENTINEL}`;
		expect(content.indexOf(SENTINEL)).toBeGreaterThan(12_000);

		const result = await runReview(content).promise;

		expect(getJSONResponse.mock.calls.length).toBeGreaterThan(1);
		expect(sentPrompts().some((prompt) => prompt.includes('HARMFUL_PAYLOAD_SENTINEL'))).toBe(
			true
		);
		expect(result.status).toBe('flagged');
		expect(result.text_findings.map((finding) => finding.code)).toContain('llm_harm');
		expect(result.review_metadata).toEqual(
			expect.objectContaining({
				llm_review_completed: true,
				llm_review: expect.objectContaining({ truncated: false })
			})
		);
	});

	it('fully reviews a page just under the 30,000-character cap automatically', async () => {
		getJSONResponse.mockResolvedValue(LLM_PASS);
		const paragraph = `${'The chapter continues with ordinary narrative prose. '.repeat(10)}\n\n`;
		const content = paragraph.repeat(Math.floor(29_900 / paragraph.length));
		expect(content.length).toBeGreaterThan(29_000);
		expect(content.length).toBeLessThanOrEqual(30_000);

		const result = await runReview(content).promise;

		expect(result.status).toBe('passed');
		expect(getJSONResponse.mock.calls.length).toBeLessThanOrEqual(3);
		expect(result.review_metadata.llm_review).toEqual(
			expect.objectContaining({ truncated: false })
		);
	});

	it('sends content past the automatic review cap to an admin instead of passing it', async () => {
		getJSONResponse.mockResolvedValue(LLM_PASS);
		const content = 'Benign filler sentence number one. '.repeat(1_000);
		expect(content.length).toBeGreaterThan(30_000);

		const result = await runReview(content).promise;

		expect(result.status).toBe('flagged');
		expect(result.text_findings.map((finding) => finding.code)).toContain(
			PUBLIC_PAGE_REVIEW_TOO_LONG_CODE
		);
		const llmReview = result.review_metadata.llm_review as {
			truncated: boolean;
			chunks_reviewed: number;
			reviewed_chars: number;
		};
		expect(llmReview.truncated).toBe(true);
		expect(llmReview.reviewed_chars).toBeLessThanOrEqual(30_000);
		expect(getJSONResponse).toHaveBeenCalledTimes(llmReview.chunks_reviewed);
		// The LLM finished what it could read, so an admin may take responsibility
		// for the remainder.
		expect(getPublicPageReviewApprovalBlocker(result)).toBeNull();
	});

	it('returns a retryable error when any part of the LLM review fails', async () => {
		let call = 0;
		getJSONResponse.mockImplementation(async () => {
			call += 1;
			if (call === 2) throw new Error('OpenRouter 503');
			return LLM_PASS;
		});
		const content = 'Benign filler paragraph.\n\n'.repeat(900);

		const result = await runReview(content).promise;

		expect(getJSONResponse.mock.calls.length).toBeGreaterThan(1);
		expect(result.status).toBe('error');
		expect(result.summary).toBe(PUBLIC_PAGE_REVIEW_UNAVAILABLE_MESSAGE);
		expect(result.review_metadata).toEqual(
			expect.objectContaining({
				provider: 'rule_engine',
				llm_review_completed: false,
				llm_review_failed: true
			})
		);
	});

	it('keeps a flag from one part but refuses admin approval when another part failed', async () => {
		getJSONResponse.mockImplementation(async (options: { userPrompt: string }) => {
			if (options.userPrompt.includes('HARMFUL_PAYLOAD_SENTINEL')) return LLM_FLAG;
			throw new Error('timeout');
		});
		const content = `${'Benign filler paragraph.\n\n'.repeat(900)}${SENTINEL}`;

		const result = await runReview(content).promise;

		expect(result.status).toBe('flagged');
		expect(getPublicPageReviewApprovalBlocker(result)).toMatch(/did not finish/);
		expect(
			isPublicPageReviewApprovedForPublish({ ...result, admin_decision: 'approved' })
		).toBe(false);
	});

	it('splits long text into bounded chunks without losing characters', () => {
		const text = 'Sentence with several words in it. '.repeat(3_000);
		const chunks = splitTextForLlmReview(text);

		expect(chunks.join('')).toBe(text);
		expect(chunks.every((chunk) => chunk.length <= 12_000)).toBe(true);
		expect(chunks.slice(0, -1).every((chunk) => chunk.length >= 10_200)).toBe(true);
	});

	it('only sends the parts that changed since the last review to the LLM', async () => {
		getJSONResponse.mockResolvedValue(LLM_PASS);
		const chapter = 'A paragraph of the chapter that stays the same.\n\n'.repeat(550);

		const first = await runReview(chapter).promise;
		const firstCalls = getJSONResponse.mock.calls.length;
		expect(firstCalls).toBeGreaterThan(2);

		getJSONResponse.mockClear();
		const unchanged = await runReview(chapter, { previousReview: first }).promise;
		expect(getJSONResponse).not.toHaveBeenCalled();
		expect(unchanged.status).toBe('passed');
		expect(unchanged.review_metadata.llm_review).toEqual(
			expect.objectContaining({ chunks_reused: firstCalls })
		);

		getJSONResponse.mockClear();
		const appended = await runReview(`${chapter}One new closing paragraph.`, {
			previousReview: unchanged
		}).promise;
		expect(appended.status).toBe('passed');
		expect(getJSONResponse.mock.calls.length).toBeLessThanOrEqual(2);
		expect(sentPrompts().some((prompt) => prompt.includes('One new closing paragraph.'))).toBe(
			true
		);
	});

	it('never reuses part verdicts from another document or policy version', async () => {
		getJSONResponse.mockResolvedValue(LLM_PASS);
		const chapter = 'A paragraph of the chapter that stays the same.\n\n'.repeat(550);
		const first = await runReview(chapter).promise;
		const firstCalls = getJSONResponse.mock.calls.length;

		getJSONResponse.mockClear();
		await runReview(chapter, { previousReview: { ...first, document_id: 'document-2' } })
			.promise;
		expect(getJSONResponse.mock.calls.length).toBe(firstCalls);

		getJSONResponse.mockClear();
		await runReview(chapter, {
			previousReview: { ...first, policy_version: 'public_page_policy_v2' }
		}).promise;
		expect(getJSONResponse.mock.calls.length).toBe(firstCalls);
	});
});

describe('public page review fails closed when the LLM is unavailable', () => {
	it('returns a retryable error when the LLM review throws', async () => {
		getJSONResponse.mockRejectedValue(new Error('OpenRouter 503'));

		const result = await runReview('Steps to build a secret weapon for your sales team.')
			.promise;

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

			const result = await runReview('A perfectly normal project update.').promise;

			expect(result.status).toBe('error');
			expect(result.summary).toBe(PUBLIC_PAGE_REVIEW_UNAVAILABLE_MESSAGE);
		}
	);

	it('still flags an SSN when the LLM passes or fails', async () => {
		getJSONResponse.mockResolvedValueOnce(LLM_PASS);
		const withLlmPass = await runReview('Employee record: SSN 123-45-6789.').promise;
		expect(withLlmPass.status).toBe('flagged');
		expect(withLlmPass.text_findings.map((finding) => finding.code)).toContain('pii_ssn');

		getJSONResponse.mockRejectedValueOnce(new Error('timeout'));
		const withLlmFailure = await runReview('Employee record: SSN 123-45-6789.').promise;
		expect(withLlmFailure.status).toBe('flagged');
		expect(withLlmFailure.text_findings.map((finding) => finding.code)).toContain('pii_ssn');
		// The LLM never finished, so an admin approval must not publish it.
		expect(getPublicPageReviewApprovalBlocker(withLlmFailure)).not.toBeNull();
	});
});

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
		created_by: 'actor-1',
		created_at: '2026-09-22T12:00:00.000Z',
		review_metadata: {},
		admin_decision: null,
		admin_decision_reason: null,
		admin_decision_by: null,
		admin_decision_at: null,
		...overrides
	};
}

describe('isPublicPageReviewReusableForDocument', () => {
	const document = reviewDocument('Content');
	const publication = { title: 'Public page', summary: null };
	const completedMetadata = {
		provider: 'rule_engine+smart_llm',
		llm_review_completed: true,
		llm_review_failed: false,
		document_updated_at: document.updated_at,
		input_fingerprint: computePublicPageReviewFingerprint(document, publication)
	};

	it('reuses a pass from a completed LLM review of the same document version', () => {
		expect(
			isPublicPageReviewReusableForDocument(
				storedReview({ review_metadata: completedMetadata }),
				document,
				publication
			)
		).toBe(true);
	});

	it('never reuses an error review', () => {
		expect(
			isPublicPageReviewReusableForDocument(
				storedReview({
					status: 'error',
					review_metadata: {
						...completedMetadata,
						provider: 'rule_engine',
						llm_review_failed: true
					}
				}),
				document,
				publication
			)
		).toBe(false);
	});

	it('never reuses a pass that was decided without the LLM', () => {
		expect(
			isPublicPageReviewReusableForDocument(
				storedReview({
					review_metadata: {
						...completedMetadata,
						provider: 'rule_engine',
						llm_review_skipped_reason: null
					}
				}),
				document,
				publication
			)
		).toBe(false);
	});

	it('never reuses a review from an older policy version', () => {
		expect(
			isPublicPageReviewReusableForDocument(
				storedReview({
					policy_version: 'public_page_policy_v2',
					review_metadata: completedMetadata
				}),
				document,
				publication
			)
		).toBe(false);
	});

	it('never reuses an approved flag where the LLM never ran', () => {
		const review = storedReview({
			status: 'flagged',
			admin_decision: 'approved',
			review_metadata: {
				...completedMetadata,
				provider: 'rule_engine',
				llm_review_skipped_reason: 'deterministic_credential_finding',
				llm_review_failed: false
			}
		});

		expect(isPublicPageReviewReusableForDocument(review, document, publication)).toBe(false);
		expect(isPublicPageReviewApprovedForPublish(review)).toBe(false);
	});
});

describe('stored review status normalization', () => {
	it('treats an unknown stored status as an error, never a pass', async () => {
		const query: any = {
			select: () => query,
			eq: () => query,
			order: () => query,
			limit: () => query,
			maybeSingle: async () => ({
				data: {
					id: 'review-x',
					project_id: 'project-1',
					document_id: 'document-1',
					status: 'approved_by_magic',
					created_by: 'actor-1',
					created_at: '2026-09-22T12:00:00.000Z'
				},
				error: null
			})
		};

		const review = await getLatestPublicPageReviewForDocument(
			{ from: () => query },
			'document-1'
		);

		expect(review?.status).toBe('error');
	});
});

describe('setPublicPageReviewAdminDecision', () => {
	function createDecisionAdminMock(row: Record<string, unknown>) {
		const updates: Array<Record<string, unknown>> = [];
		const client = {
			from() {
				let pendingUpdate: Record<string, unknown> | null = null;
				const query: any = {
					select: () => query,
					eq: () => query,
					update: (payload: Record<string, unknown>) => {
						pendingUpdate = payload;
						updates.push(payload);
						return query;
					},
					maybeSingle: async () => ({
						data: { ...row, ...(pendingUpdate ?? {}) },
						error: null
					})
				};
				return query;
			}
		};
		return { client, updates };
	}

	const flaggedRow = {
		id: 'review-1',
		project_id: 'project-1',
		document_id: 'document-1',
		status: 'flagged',
		policy_version: PUBLIC_PAGE_CONTENT_POLICY_VERSION,
		created_by: 'actor-1',
		created_at: '2026-09-22T12:00:00.000Z'
	};

	it('refuses to approve a flag where the LLM review did not complete', async () => {
		const { client, updates } = createDecisionAdminMock({
			...flaggedRow,
			review_metadata: { provider: 'rule_engine', llm_review_failed: true }
		});

		await expect(
			setPublicPageReviewAdminDecision({
				adminSupabase: client,
				reviewId: 'review-1',
				actorId: 'admin-actor',
				decision: 'approved'
			})
		).rejects.toBeInstanceOf(PublicPageReviewDecisionError);
		expect(updates).toEqual([]);
	});

	it('still lets an admin reject a flag where the LLM review did not complete', async () => {
		const { client, updates } = createDecisionAdminMock({
			...flaggedRow,
			review_metadata: { provider: 'rule_engine', llm_review_failed: true }
		});

		const review = await setPublicPageReviewAdminDecision({
			adminSupabase: client,
			reviewId: 'review-1',
			actorId: 'admin-actor',
			decision: 'rejected'
		});

		expect(review.admin_decision).toBe('rejected');
		expect(updates).toHaveLength(1);
	});

	it('approves a flag where the LLM review completed', async () => {
		const { client, updates } = createDecisionAdminMock({
			...flaggedRow,
			review_metadata: {
				provider: 'rule_engine+smart_llm',
				llm_review_completed: true,
				llm_review_failed: false
			}
		});

		const review = await setPublicPageReviewAdminDecision({
			adminSupabase: client,
			reviewId: 'review-1',
			actorId: 'admin-actor',
			decision: 'approved'
		});

		expect(review.admin_decision).toBe('approved');
		expect(isPublicPageReviewApprovedForPublish(review)).toBe(true);
		expect(updates).toEqual([expect.objectContaining({ admin_decision: 'approved' })]);
	});
});
