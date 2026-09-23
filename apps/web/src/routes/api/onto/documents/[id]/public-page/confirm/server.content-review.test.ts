// apps/web/src/routes/api/onto/documents/[id]/public-page/confirm/server.content-review.test.ts
// Runs the confirm route against the real content review service; only the LLM,
// the public-page persistence layer, the admin client, and access checks are mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getJSONResponse: vi.fn(),
	confirmDocumentPublicPage: vi.fn(),
	getDocumentPublicPageState: vi.fn(),
	ensureDocumentAccessForPublicPage: vi.fn(),
	createAdminSupabaseClient: vi.fn()
}));

vi.mock('$lib/services/smart-llm-service', () => ({
	SmartLLMService: class {
		getJSONResponse(options: unknown) {
			return mocks.getJSONResponse(options);
		}
	}
}));

vi.mock('$lib/server/public-page.service', () => ({
	PublicPageSlugConflictError: class extends Error {},
	confirmDocumentPublicPage: mocks.confirmDocumentPublicPage,
	getDocumentPublicPageState: mocks.getDocumentPublicPageState
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

vi.mock('../../../shared-public-page', () => ({
	ensureDocumentAccessForPublicPage: mocks.ensureDocumentAccessForPublicPage
}));

import { POST } from './+server';
import {
	computePublicPageReviewFingerprint,
	PUBLIC_PAGE_CONTENT_POLICY_VERSION
} from '$lib/server/public-page-content-review.service';
import { resolvePublicPagePublicationText } from '$lib/server/public-page-publication';

const DOCUMENT = {
	id: 'doc-1',
	project_id: 'project-1',
	title: 'How to build a secret weapon for your sales team',
	description: null,
	content: 'Steps to build a secret weapon for your sales team: a follow-up cadence.',
	props: null,
	updated_at: '2026-09-22T11:00:00.000Z'
};

const LLM_PASS = { status: 'passed', summary: 'No policy issues.', reasons: [], findings: [] };

/** User-scoped client: reads the latest stored review and inline assets only. */
function createUserSupabase(latestReview: Record<string, unknown> | null = null) {
	return {
		from(table: string) {
			if (table === 'onto_asset_links') {
				const query: any = {
					select: () => query,
					eq: () => query,
					then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
						resolve({ data: [], error: null })
				};
				return query;
			}
			if (table === 'onto_public_page_review_attempts') {
				const query: any = {
					select: () => query,
					eq: () => query,
					order: () => query,
					limit: () => query,
					maybeSingle: async () => ({ data: latestReview, error: null }),
					insert: () => {
						throw new Error('User client must not insert review attempts');
					}
				};
				return query;
			}
			throw new Error(`Unexpected table: ${table}`);
		}
	};
}

/** Service-role client: records review-attempt inserts. */
function createAdminSupabase() {
	const insertedReviews: Array<Record<string, unknown>> = [];
	const client = {
		from(table: string) {
			if (table !== 'onto_public_page_review_attempts') {
				throw new Error(`Unexpected admin table: ${table}`);
			}
			return {
				insert: (payload: Record<string, unknown>) => {
					insertedReviews.push(payload);
					return {
						select: () => ({
							single: async () => ({
								data: {
									id: `review-${insertedReviews.length}`,
									created_at: '2026-09-22T12:00:00.000Z',
									...payload
								},
								error: null
							})
						})
					};
				}
			};
		}
	};
	return { client, insertedReviews };
}

function confirmRequest(supabase: unknown, body: Record<string, unknown> = {}) {
	return POST({
		params: { id: 'doc-1' },
		request: new Request('http://localhost/api/onto/documents/doc-1/public-page/confirm', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug_base: 'sales-playbook', ...body })
		}),
		locals: {
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
			supabase
		}
	} as any);
}

function storedReviewRow(overrides: Record<string, unknown>) {
	return {
		id: 'stored-review',
		project_id: 'project-1',
		document_id: 'doc-1',
		public_page_id: null,
		source: 'publish_confirm',
		status: 'passed',
		policy_version: PUBLIC_PAGE_CONTENT_POLICY_VERSION,
		summary: null,
		reasons: [],
		text_findings: [],
		image_findings: [],
		created_by: 'actor-1',
		created_at: '2026-09-22T11:30:00.000Z',
		admin_decision: null,
		...overrides
	};
}

/** Metadata of a completed review of exactly what a default confirm publishes. */
function completedMetadata(document: typeof DOCUMENT) {
	return {
		provider: 'rule_engine+smart_llm',
		llm_review_completed: true,
		llm_review_failed: false,
		document_updated_at: document.updated_at,
		input_fingerprint: computePublicPageReviewFingerprint(
			document,
			resolvePublicPagePublicationText(document)
		)
	};
}

let admin: ReturnType<typeof createAdminSupabase>;

describe('POST /api/onto/documents/[id]/public-page/confirm content review', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		admin = createAdminSupabase();
		mocks.createAdminSupabaseClient.mockReturnValue(admin.client);
		mocks.ensureDocumentAccessForPublicPage.mockResolvedValue({
			document: { ...DOCUMENT },
			actorId: 'actor-1'
		});
		mocks.getDocumentPublicPageState.mockResolvedValue(null);
		mocks.confirmDocumentPublicPage.mockResolvedValue({ id: 'page-1', slug: 'sales-playbook' });
	});

	it('publishes a benign page when the LLM review passes', async () => {
		mocks.getJSONResponse.mockResolvedValue(LLM_PASS);

		const response = await confirmRequest(createUserSupabase());

		expect(response.status).toBe(200);
		expect(admin.insertedReviews).toEqual([expect.objectContaining({ status: 'passed' })]);
		expect(mocks.confirmDocumentPublicPage).toHaveBeenCalledTimes(1);
	});

	it('refuses to publish with a retryable message when the LLM review throws', async () => {
		mocks.getJSONResponse.mockRejectedValue(new Error('OpenRouter 503'));

		const response = await confirmRequest(createUserSupabase());
		const payload = await response.json();

		expect(response.status).toBe(503);
		expect(payload.code).toBe('CONTENT_REVIEW_UNAVAILABLE');
		expect(payload.error).toBe(
			'Content review is temporarily unavailable. Please try again in a few minutes.'
		);
		expect(payload.error).not.toMatch(/admin/i);
		expect(payload.details.review.status).toBe('error');
		expect(admin.insertedReviews).toEqual([expect.objectContaining({ status: 'error' })]);
		expect(mocks.confirmDocumentPublicPage).not.toHaveBeenCalled();
	});

	it('re-runs the review when the stored review for this version is an error', async () => {
		mocks.getJSONResponse.mockResolvedValue(LLM_PASS);
		const stored = storedReviewRow({
			status: 'error',
			review_metadata: {
				...completedMetadata(DOCUMENT),
				provider: 'rule_engine',
				llm_review_completed: false,
				llm_review_failed: true
			}
		});

		const response = await confirmRequest(createUserSupabase(stored));

		expect(response.status).toBe(200);
		expect(mocks.getJSONResponse).toHaveBeenCalled();
		expect(admin.insertedReviews).toHaveLength(1);
	});

	it.each([
		[
			'an old v2 pass',
			{
				policy_version: 'public_page_policy_v2',
				review_metadata: completedMetadata(DOCUMENT)
			}
		],
		[
			'a rule-engine-only pass',
			{
				review_metadata: {
					...completedMetadata(DOCUMENT),
					provider: 'rule_engine',
					llm_review_completed: false
				}
			}
		]
	])('re-runs the review instead of reusing %s', async (_label, overrides) => {
		mocks.getJSONResponse.mockResolvedValue(LLM_PASS);

		const response = await confirmRequest(createUserSupabase(storedReviewRow(overrides)));

		expect(response.status).toBe(200);
		expect(mocks.getJSONResponse).toHaveBeenCalled();
		expect(admin.insertedReviews).toHaveLength(1);
	});

	it('does not honor an admin approval on a flag where the LLM never ran', async () => {
		const leakingDocument = {
			...DOCUMENT,
			content: 'Our key: sk-proj-abcdefghijklmnopqrstuvwxyz123456'
		};
		mocks.ensureDocumentAccessForPublicPage.mockResolvedValue({
			document: leakingDocument,
			actorId: 'actor-1'
		});
		mocks.getJSONResponse.mockResolvedValue(LLM_PASS);
		const approvedWithoutLlm = storedReviewRow({
			status: 'flagged',
			admin_decision: 'approved',
			review_metadata: {
				...completedMetadata(leakingDocument),
				provider: 'rule_engine',
				llm_review_skipped_reason: 'deterministic_credential_finding',
				llm_review_failed: false
			}
		});

		const response = await confirmRequest(createUserSupabase(approvedWithoutLlm));
		const payload = await response.json();

		expect(response.status).toBe(422);
		expect(payload.code).toBe('CONTENT_REVIEW_FLAGGED');
		expect(payload.details.review.admin_decision).toBeNull();
		expect(mocks.getJSONResponse).toHaveBeenCalled();
		expect(admin.insertedReviews).toHaveLength(1);
		expect(mocks.confirmDocumentPublicPage).not.toHaveBeenCalled();
	});

	it('honors an admin approval on a flag the LLM completed for the same text', async () => {
		const approved = storedReviewRow({
			status: 'flagged',
			admin_decision: 'approved',
			review_metadata: completedMetadata(DOCUMENT)
		});

		const response = await confirmRequest(createUserSupabase(approved));

		expect(response.status).toBe(200);
		expect(mocks.getJSONResponse).not.toHaveBeenCalled();
		expect(admin.insertedReviews).toEqual([]);
		expect(mocks.confirmDocumentPublicPage).toHaveBeenCalledTimes(1);
	});

	it('re-reviews when the publish request changes the title after an approval', async () => {
		const approved = storedReviewRow({
			status: 'flagged',
			admin_decision: 'approved',
			review_metadata: completedMetadata(DOCUMENT)
		});
		mocks.getJSONResponse.mockImplementation(async (options: { userPrompt: string }) =>
			options.userPrompt.includes('TITLE_SENTINEL')
				? {
						status: 'flagged',
						summary: 'Harassing title.',
						reasons: ['The title targets a protected group.'],
						findings: []
					}
				: LLM_PASS
		);

		const response = await confirmRequest(createUserSupabase(approved), {
			title: 'TITLE_SENTINEL swapped-in headline'
		});

		expect(response.status).toBe(422);
		expect(mocks.getJSONResponse).toHaveBeenCalled();
		expect(admin.insertedReviews).toEqual([expect.objectContaining({ status: 'flagged' })]);
		expect(mocks.confirmDocumentPublicPage).not.toHaveBeenCalled();
	});

	it('reviews the publish request summary with fixed-format detectors', async () => {
		mocks.getJSONResponse.mockResolvedValue(LLM_PASS);

		const response = await confirmRequest(createUserSupabase(), {
			summary: 'Reach me at SSN 123-45-6789'
		});
		const payload = await response.json();

		expect(response.status).toBe(422);
		expect(payload.details.review.text_findings.map((finding: any) => finding.code)).toContain(
			'pii_ssn'
		);
		expect(mocks.confirmDocumentPublicPage).not.toHaveBeenCalled();
	});
});
