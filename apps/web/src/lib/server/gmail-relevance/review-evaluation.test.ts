// apps/web/src/lib/server/gmail-relevance/review-evaluation.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	computeEmailRelevanceReviewMetrics,
	EmailRelevanceReviewService,
	EmailRelevanceReviewServiceError,
	type EmailRelevanceReviewRepository
} from './review-evaluation';

vi.mock('./metadata-crypto', () => ({
	decryptEmailRelevanceValue: vi.fn(() => 'synthetic_provider_message')
}));

const USER_ID = '10000000-0000-4000-8000-000000000001';
const RUN_ID = '20000000-0000-4000-8000-000000000001';
const SCOPE_ID = '30000000-0000-4000-8000-000000000001';
const CONNECTION_ID = '40000000-0000-4000-8000-000000000001';
const SAMPLE_ID = '50000000-0000-4000-8000-000000000001';
const OBSERVATION_ID = '60000000-0000-4000-8000-000000000001';
const PROJECT_ID = '70000000-0000-4000-8000-000000000001';
const OTHER_PROJECT_ID = '70000000-0000-4000-8000-000000000002';
const PROFILE_ID = '80000000-0000-4000-8000-000000000001';
const CANDIDATE_A_ID = '90000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-07-24T12:00:00.000Z');

function sample(overrides: Record<string, unknown> = {}) {
	return {
		id: SAMPLE_ID,
		connection_scope_id: SCOPE_ID,
		source_observation_id: OBSERVATION_ID,
		project_id: PROJECT_ID,
		profile_version_id: PROFILE_ID,
		candidate_a_id: CANDIDATE_A_ID,
		candidate_b_id: null,
		sampling_stratum: 'a_only' as const,
		sample_order: 1,
		sampling_weight: 2,
		a_score: 72,
		a_confidence: 0.72,
		a_confirmed_thread: false,
		a_explicit_rule: false,
		a_actor_overlap: true,
		a_domain_overlap: true,
		a_artifact_overlap: false,
		a_identifier_overlap: false,
		a_lexical_overlap: false,
		a_negative_evidence: false,
		b_score: null,
		b_confidence: null,
		b_confirmed_thread: false,
		b_explicit_rule: false,
		b_actor_overlap: false,
		b_domain_overlap: false,
		b_artifact_overlap: false,
		b_identifier_overlap: false,
		b_lexical_overlap: false,
		b_negative_evidence: false,
		state: 'pending' as const,
		source_retention_expires_at: '2026-07-31T12:00:00.000Z',
		created_at: '2026-07-24T11:00:00.000Z',
		reviewed_at: null,
		...overrides
	};
}

function dependencies() {
	const currentSample = sample();
	const repository = {
		listRuns: vi.fn().mockResolvedValue([
			{
				id: RUN_ID,
				state: 'completed',
				created_at: '2026-07-24T03:44:00.000Z',
				expires_at: '2026-07-25T03:44:00.000Z'
			}
		]),
		prepareSample: vi.fn().mockResolvedValue({ total_samples: 300, scope_count: 3 }),
		expireSamples: vi.fn().mockResolvedValue(undefined),
		loadProjects: vi
			.fn()
			.mockResolvedValue([
				{ id: PROJECT_ID, label: 'Synthetic Project', profile_version: 1 }
			]),
		loadSamples: vi.fn().mockResolvedValue([currentSample]),
		loadAdjudications: vi.fn().mockResolvedValue([]),
		loadScopeAccounting: vi.fn().mockResolvedValue([
			{
				id: SCOPE_ID,
				list_pages_completed: 2,
				observations_processed: 100,
				gmail_quota_used: 2_050,
				runtime_ms_used: 20_000
			}
		]),
		loadOpenSource: vi.fn().mockResolvedValue({
			sample: currentSample,
			connection_id: CONNECTION_ID,
			provider_message_id_ciphertext: 'synthetic_ciphertext',
			project_label: 'Synthetic Project'
		}),
		recordAdjudication: vi.fn().mockResolvedValue({
			adjudication_id: 'a0000000-0000-4000-8000-000000000001',
			replayed: false
		}),
		loadSample: vi.fn().mockResolvedValue({
			...currentSample,
			state: 'reviewed',
			reviewed_at: '2026-07-24T12:01:00.000Z'
		})
	};
	const gateway = {
		getMetadataBatch: vi.fn().mockResolvedValue({
			messages: [
				{
					provider_message_id: 'synthetic_provider_message',
					provider_thread_id: 'synthetic_thread',
					internal_date: '2026-07-23T12:00:00.000Z',
					mailbox_categories: { inbox: true, sent: false },
					subject: 'Synthetic subject',
					snippet: 'Synthetic snippet',
					participant_addresses: ['person@synthetic.invalid'],
					participant_domains: ['synthetic.invalid'],
					lexical_tokens: [],
					label_categories: []
				}
			]
		})
	};
	return { repository, gateway };
}

function service(input = dependencies()) {
	return {
		...input,
		service: new EmailRelevanceReviewService({
			repository: input.repository as unknown as EmailRelevanceReviewRepository,
			gateway: input.gateway,
			environment: {
				GMAIL_RELEVANCE_PHASE_A_REVIEW_ENABLED: 'true',
				GMAIL_RELEVANCE_PHASE_A_REVIEW_USER_IDS: USER_ID
			},
			now: () => NOW
		})
	};
}

beforeEach(() => vi.clearAllMocks());

describe('EmailRelevanceReviewService', () => {
	it('fails closed before repository or provider work when review is disabled', async () => {
		const input = dependencies();
		const review = new EmailRelevanceReviewService({
			repository: input.repository,
			gateway: input.gateway,
			environment: {},
			now: () => NOW
		});
		await expect(
			review.dashboard(USER_ID)
		).rejects.toMatchObject<EmailRelevanceReviewServiceError>({
			code: 'review_disabled'
		});
		expect(input.repository.listRuns).not.toHaveBeenCalled();
		expect(input.gateway.getMetadataBatch).not.toHaveBeenCalled();
	});

	it('loads only the owned completed run and content-free queue metrics', async () => {
		const input = service();
		const dashboard = await input.service.dashboard(USER_ID, RUN_ID);

		expect(input.repository.expireSamples).toHaveBeenCalledWith(USER_ID, RUN_ID);
		expect(dashboard.selected_run_id).toBe(RUN_ID);
		expect(dashboard.queue).toEqual([
			{
				id: SAMPLE_ID,
				account_label: 'Account 1',
				project_label: 'Synthetic Project',
				sample_order: 1,
				quick_review_order: 1,
				state: 'pending'
			}
		]);
		expect(dashboard.metrics).toMatchObject({
			target: 1,
			adjudicated: 0,
			candidate_yield_per_100_observations: { a: 2, b: 0 }
		});
		expect(JSON.stringify(dashboard)).not.toContain('synthetic_ciphertext');
	});

	it('marks a fixed maximum of 20 candidate-positive rows for the quick review', async () => {
		const input = service();
		const positiveSamples = Array.from({ length: 22 }, (_, index) =>
			sample({
				id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
				source_observation_id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
				candidate_a_id: `90000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
				sample_order: index + 1
			})
		);
		const negativeControl = sample({
			id: '50000000-0000-4000-8000-000000000099',
			source_observation_id: '60000000-0000-4000-8000-000000000099',
			candidate_a_id: null,
			sampling_stratum: 'none',
			sample_order: 23,
			a_score: null,
			a_confidence: null
		});
		input.repository.loadSamples.mockResolvedValue([...positiveSamples, negativeControl]);

		const dashboard = await input.service.dashboard(USER_ID, RUN_ID);
		const quickRows = dashboard.queue.filter((row) => row.quick_review_order !== null);

		expect(quickRows).toHaveLength(20);
		expect(quickRows.map((row) => row.quick_review_order)).toEqual(
			Array.from({ length: 20 }, (_, index) => index + 1)
		);
		expect(dashboard.queue.slice(20).every((row) => row.quick_review_order === null)).toBe(true);
	});

	it('re-fetches exactly one metadata-only message for an explicitly opened sample', async () => {
		const input = service();
		const context = await input.service.openSample({
			user_id: USER_ID,
			run_id: RUN_ID,
			sample_id: SAMPLE_ID
		});

		expect(input.gateway.getMetadataBatch).toHaveBeenCalledWith({
			user_id: USER_ID,
			connection_id: CONNECTION_ID,
			provider_message_ids: ['synthetic_provider_message']
		});
		expect(context).toMatchObject({
			sample_id: SAMPLE_ID,
			project_label: 'Synthetic Project',
			subject: 'Synthetic subject',
			snippet: 'Synthetic snippet'
		});
		expect(context.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
		expect(context).not.toHaveProperty('sampling_stratum');
		expect(context).not.toHaveProperty('candidate_a_id');
	});

	it('rejects an expired source before making a Gmail call', async () => {
		const input = dependencies();
		input.repository.loadOpenSource = vi.fn().mockResolvedValue({
			sample: sample({ source_retention_expires_at: '2026-07-24T11:59:59.000Z' }),
			connection_id: CONNECTION_ID,
			provider_message_id_ciphertext: 'synthetic_ciphertext',
			project_label: 'Synthetic Project'
		});
		const review = service(input);

		await expect(
			review.service.openSample({ user_id: USER_ID, run_id: RUN_ID, sample_id: SAMPLE_ID })
		).rejects.toMatchObject({ code: 'sample_unavailable' });
		expect(input.gateway.getMetadataBatch).not.toHaveBeenCalled();
	});

	it('records a bounded decision, accepts a corrected wrong project, and reveals variants afterward', async () => {
		const input = service();
		const result = await input.service.adjudicate({
			user_id: USER_ID,
			run_id: RUN_ID,
			sample_id: SAMPLE_ID,
			idempotency_key: 'b0000000-0000-4000-8000-000000000001',
			decision: 'wrong_project',
			correction_reason: 'cross_project_ambiguity',
			corrected_project_id: OTHER_PROJECT_ID,
			rule_proposal: null
		});

		expect(input.repository.recordAdjudication).toHaveBeenCalledWith(
			expect.objectContaining({
				user_id: USER_ID,
				decision: 'wrong_project',
				corrected_project_id: OTHER_PROJECT_ID,
				idempotency_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
				decision_hash: expect.stringMatching(/^[a-f0-9]{64}$/)
			})
		);
		expect(JSON.stringify(input.repository.recordAdjudication.mock.calls)).not.toContain(
			'b0000000-0000-4000-8000-000000000001'
		);
		expect(result.variant_reveal).toMatchObject({
			stratum: 'a_only',
			a: { score: 72 },
			b: null
		});
	});

	it('rejects malformed decision combinations before the database', async () => {
		const input = service();
		await expect(
			input.service.adjudicate({
				user_id: USER_ID,
				run_id: RUN_ID,
				sample_id: SAMPLE_ID,
				idempotency_key: 'b0000000-0000-4000-8000-000000000001',
				decision: 'correct_project',
				correction_reason: 'wrong_actor',
				corrected_project_id: null,
				rule_proposal: null
			})
		).rejects.toMatchObject({ code: 'invalid_input' });
		await expect(
			input.service.adjudicate({
				user_id: USER_ID,
				run_id: RUN_ID,
				sample_id: SAMPLE_ID,
				idempotency_key: 'b0000000-0000-4000-8000-000000000002',
				decision: 'wrong_project',
				correction_reason: 'wrong_domain',
				corrected_project_id: null,
				rule_proposal: null
			})
		).rejects.toMatchObject({ code: 'invalid_input' });
		expect(input.repository.recordAdjudication).not.toHaveBeenCalled();
	});
});

describe('computeEmailRelevanceReviewMetrics', () => {
	it('reports weighted A/B quality, overlap, cost, and account/project segments', () => {
		const secondSampleId = '50000000-0000-4000-8000-000000000002';
		const secondProjectId = '70000000-0000-4000-8000-000000000002';
		const metrics = computeEmailRelevanceReviewMetrics({
			samples: [
				sample(),
				sample({
					id: secondSampleId,
					project_id: secondProjectId,
					candidate_a_id: null,
					candidate_b_id: '90000000-0000-4000-8000-000000000002',
					sampling_stratum: 'b_only',
					a_score: null,
					a_confidence: null,
					b_score: 70,
					b_confidence: 0.7
				})
			],
			adjudications: [
				{
					id: 'a0000000-0000-4000-8000-000000000001',
					sample_id: SAMPLE_ID,
					decision: 'correct_project',
					correction_reason: null,
					corrected_project_id: null,
					rule_proposal: null,
					created_at: '2026-07-24T12:01:00.000Z'
				},
				{
					id: 'a0000000-0000-4000-8000-000000000002',
					sample_id: secondSampleId,
					decision: 'wrong_project',
					correction_reason: 'wrong_domain',
					corrected_project_id: PROJECT_ID,
					rule_proposal: null,
					created_at: '2026-07-24T12:02:00.000Z'
				}
			],
			accounting: [
				{
					id: SCOPE_ID,
					list_pages_completed: 2,
					observations_processed: 100,
					gmail_quota_used: 2_000,
					runtime_ms_used: 1_000
				}
			],
			candidate_counts: { a: 40, b: 20 },
			project_labels: {
				[PROJECT_ID]: 'Project A',
				[secondProjectId]: 'Project B'
			}
		});

		expect(metrics.variant_a).toMatchObject({ precision: 1, recall: 1 });
		expect(metrics.variant_b).toMatchObject({ precision: 0, wrong_project_rate: 1 });
		expect(metrics.overlap).toEqual({ both: 0, a_only: 2, b_only: 2, none: 0 });
		expect(metrics.candidate_yield_per_100_observations).toEqual({ a: 40, b: 20 });
		expect(metrics.segments.accounts).toHaveLength(1);
		expect(metrics.segments.projects.map((project) => project.label)).toEqual([
			'Project A',
			'Project B'
		]);
		expect(
			metrics.segments.projects[0]?.variant_a.cost_per_accepted_candidate.provider_calls
		).toBe(25.5);
	});
});
