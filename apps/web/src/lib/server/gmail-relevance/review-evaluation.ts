// apps/web/src/lib/server/gmail-relevance/review-evaluation.ts
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { isGmailRelevancePhaseAReviewUserAllowed } from './config';
import { decryptEmailRelevanceValue } from './metadata-crypto';
import {
	GmailRelevanceMetadataGateway,
	GmailRelevanceMetadataGatewayError
} from './metadata-gateway';

export const EMAIL_RELEVANCE_REVIEW_SAMPLING_VERSION = 'email-relevance-review-sampling-v1';
export const EMAIL_RELEVANCE_REVIEW_CONTRACT_VERSION = 'email-relevance-review-contract-v1';
export const EMAIL_RELEVANCE_REVIEW_TARGET_PER_ACCOUNT = 100;
export const EMAIL_RELEVANCE_QUICK_REVIEW_TARGET = 20;

export const EMAIL_RELEVANCE_REVIEW_DECISIONS = [
	'correct_project',
	'wrong_project',
	'relevant_missing_project',
	'not_project_relevant',
	'ambiguous'
] as const;
export const EMAIL_RELEVANCE_REVIEW_CORRECTION_REASONS = [
	'wrong_actor',
	'wrong_domain',
	'wrong_artifact',
	'wrong_identifier',
	'lexical_false_positive',
	'negative_signal_missed',
	'missing_profile_signal',
	'cross_project_ambiguity',
	'insufficient_metadata'
] as const;
export const EMAIL_RELEVANCE_REVIEW_RULE_PROPOSALS = [
	'always_sender',
	'always_domain',
	'always_thread',
	'never_sender',
	'never_domain',
	'never_thread'
] as const;

type ReviewDecision = (typeof EMAIL_RELEVANCE_REVIEW_DECISIONS)[number];
type ReviewCorrectionReason = (typeof EMAIL_RELEVANCE_REVIEW_CORRECTION_REASONS)[number];
type ReviewRuleProposal = (typeof EMAIL_RELEVANCE_REVIEW_RULE_PROPOSALS)[number];

const UUID_SCHEMA = z.string().uuid();
const REVIEW_INPUT_SCHEMA = z
	.object({
		user_id: UUID_SCHEMA,
		run_id: UUID_SCHEMA,
		sample_id: UUID_SCHEMA,
		idempotency_key: UUID_SCHEMA,
		decision: z.enum(EMAIL_RELEVANCE_REVIEW_DECISIONS),
		correction_reason: z.enum(EMAIL_RELEVANCE_REVIEW_CORRECTION_REASONS).nullable(),
		corrected_project_id: UUID_SCHEMA.nullable(),
		rule_proposal: z.enum(EMAIL_RELEVANCE_REVIEW_RULE_PROPOSALS).nullable()
	})
	.strict();

type QueryResult = {
	data: unknown;
	error: { code?: string; message?: string } | null;
	count?: number | null;
};
type QueryBuilder = PromiseLike<QueryResult> & {
	select(columns: string, options?: { count?: 'exact'; head?: boolean }): QueryBuilder;
	eq(column: string, value: unknown): QueryBuilder;
	in(column: string, values: unknown[]): QueryBuilder;
	gt(column: string, value: unknown): QueryBuilder;
	order(column: string, options?: { ascending?: boolean }): QueryBuilder;
	limit(count: number): QueryBuilder;
	maybeSingle(): PromiseLike<QueryResult>;
	single(): PromiseLike<QueryResult>;
};
type ReviewDatabaseClient = {
	from(table: string): QueryBuilder;
	rpc(name: string, parameters: Record<string, unknown>): PromiseLike<QueryResult>;
};

const RUN_SCHEMA = z.object({
	id: UUID_SCHEMA,
	state: z.string(),
	created_at: z.string(),
	expires_at: z.string()
});
const PROJECT_SCHEMA = z.object({
	project_id: UUID_SCHEMA,
	profile_id: UUID_SCHEMA,
	profile_version: z.number().int().positive()
});
const SAMPLE_SCHEMA = z
	.object({
		id: UUID_SCHEMA,
		connection_scope_id: UUID_SCHEMA,
		source_observation_id: UUID_SCHEMA,
		project_id: UUID_SCHEMA,
		profile_version_id: UUID_SCHEMA,
		candidate_a_id: UUID_SCHEMA.nullable(),
		candidate_b_id: UUID_SCHEMA.nullable(),
		sampling_stratum: z.enum(['none', 'a_only', 'b_only', 'both']),
		sample_order: z.number().int().min(1).max(100),
		sampling_weight: z.coerce.number().min(1),
		a_score: z.number().int().min(0).max(100).nullable(),
		a_confidence: z.coerce.number().min(0).max(1).nullable(),
		a_confirmed_thread: z.boolean(),
		a_explicit_rule: z.boolean(),
		a_actor_overlap: z.boolean(),
		a_domain_overlap: z.boolean(),
		a_artifact_overlap: z.boolean(),
		a_identifier_overlap: z.boolean(),
		a_lexical_overlap: z.boolean(),
		a_negative_evidence: z.boolean(),
		b_score: z.number().int().min(0).max(100).nullable(),
		b_confidence: z.coerce.number().min(0).max(1).nullable(),
		b_confirmed_thread: z.boolean(),
		b_explicit_rule: z.boolean(),
		b_actor_overlap: z.boolean(),
		b_domain_overlap: z.boolean(),
		b_artifact_overlap: z.boolean(),
		b_identifier_overlap: z.boolean(),
		b_lexical_overlap: z.boolean(),
		b_negative_evidence: z.boolean(),
		state: z.enum(['pending', 'reviewed', 'expired']),
		source_retention_expires_at: z.string(),
		created_at: z.string(),
		reviewed_at: z.string().nullable()
	})
	.passthrough();
const ADJUDICATION_SCHEMA = z.object({
	id: UUID_SCHEMA,
	sample_id: UUID_SCHEMA,
	decision: z.enum(EMAIL_RELEVANCE_REVIEW_DECISIONS),
	correction_reason: z.enum(EMAIL_RELEVANCE_REVIEW_CORRECTION_REASONS).nullable(),
	corrected_project_id: UUID_SCHEMA.nullable(),
	rule_proposal: z.enum(EMAIL_RELEVANCE_REVIEW_RULE_PROPOSALS).nullable(),
	created_at: z.string()
});

export type EmailRelevanceReviewRun = z.infer<typeof RUN_SCHEMA> & {
	label: string;
};
export type EmailRelevanceReviewProject = {
	id: string;
	label: string;
	profile_version: number;
};
export type EmailRelevanceReviewQueueItem = {
	id: string;
	account_label: string;
	project_label: string;
	sample_order: number;
	quick_review_order: number | null;
	state: 'pending' | 'reviewed' | 'expired';
};
export type EmailRelevanceReviewContext = {
	sample_id: string;
	project_id: string;
	idempotency_key: string;
	account_label: string;
	project_label: string;
	internal_date: string;
	mailbox_categories: { inbox: boolean; sent: boolean };
	subject: string;
	snippet: string;
	participant_addresses: string[];
};

type ReviewSample = z.infer<typeof SAMPLE_SCHEMA>;
type ReviewAdjudication = z.infer<typeof ADJUDICATION_SCHEMA>;
type ScopeAccounting = {
	id: string;
	list_pages_completed: number;
	observations_processed: number;
	gmail_quota_used: number;
	runtime_ms_used: number;
};

export type EmailRelevanceVariantMetrics = {
	precision: number | null;
	recall: number | null;
	wrong_project_rate: number | null;
	ambiguous_rate: number | null;
	estimated_accepted_candidates: number;
	cost_per_accepted_candidate: {
		provider_calls: number | null;
		gmail_units: number | null;
		runtime_ms: number | null;
	};
};

export type EmailRelevanceReviewSegmentMetrics = {
	id: string;
	label: string;
	reviewed: number;
	variant_a: EmailRelevanceVariantMetrics;
	variant_b: EmailRelevanceVariantMetrics;
	candidate_yield_per_100_observations: { a: number | null; b: number | null };
};

export type EmailRelevanceReviewMetrics = {
	target: number;
	adjudicated: number;
	pending: number;
	expired: number;
	decision_counts: Record<ReviewDecision, number>;
	rule_proposal_count: number;
	correction_count: number;
	variant_a: EmailRelevanceVariantMetrics;
	variant_b: EmailRelevanceVariantMetrics;
	overlap: { both: number; a_only: number; b_only: number; none: number };
	coverage: { accounts: number; projects: number };
	candidate_yield_per_100_observations: { a: number | null; b: number | null };
	account_progress: Array<{ account_label: string; reviewed: number; target: number }>;
	segments: {
		accounts: EmailRelevanceReviewSegmentMetrics[];
		projects: EmailRelevanceReviewSegmentMetrics[];
	};
};

export type EmailRelevanceReviewDashboard = {
	runs: EmailRelevanceReviewRun[];
	selected_run_id: string | null;
	projects: EmailRelevanceReviewProject[];
	queue: EmailRelevanceReviewQueueItem[];
	metrics: EmailRelevanceReviewMetrics | null;
	source_retention_expires_at: string | null;
};

export type EmailRelevanceReviewRepository = {
	listRuns(userId: string): Promise<z.infer<typeof RUN_SCHEMA>[]>;
	prepareSample(
		userId: string,
		runId: string
	): Promise<{ total_samples: number; scope_count: number }>;
	expireSamples(userId: string, runId: string): Promise<void>;
	loadProjects(userId: string, runId: string): Promise<EmailRelevanceReviewProject[]>;
	loadSamples(userId: string, runId: string): Promise<ReviewSample[]>;
	loadAdjudications(userId: string, runId: string): Promise<ReviewAdjudication[]>;
	loadScopeAccounting(userId: string, runId: string): Promise<ScopeAccounting[]>;
	loadOpenSource(input: { user_id: string; run_id: string; sample_id: string }): Promise<{
		sample: ReviewSample;
		connection_id: string;
		provider_message_id_ciphertext: string;
		project_label: string;
	}>;
	recordAdjudication(input: {
		user_id: string;
		run_id: string;
		sample_id: string;
		decision: ReviewDecision;
		correction_reason: ReviewCorrectionReason | null;
		corrected_project_id: string | null;
		rule_proposal: ReviewRuleProposal | null;
		idempotency_key_hash: string;
		decision_hash: string;
	}): Promise<{ adjudication_id: string; replayed: boolean }>;
	loadSample(userId: string, runId: string, sampleId: string): Promise<ReviewSample>;
};

function storageError(): never {
	throw new EmailRelevanceReviewServiceError('storage_unavailable');
}

function parseRows<T>(schema: z.ZodType<T>, result: QueryResult): T[] {
	const parsed = z.array(schema).safeParse(result.data ?? []);
	if (result.error || !parsed.success) storageError();
	return parsed.data;
}

class SupabaseEmailRelevanceReviewRepository implements EmailRelevanceReviewRepository {
	constructor(
		private readonly database: ReviewDatabaseClient = createAdminSupabaseClient() as unknown as ReviewDatabaseClient
	) {}

	async listRuns(userId: string): Promise<z.infer<typeof RUN_SCHEMA>[]> {
		const result = await this.database
			.from('email_relevance_scan_runs')
			.select('id, state, created_at, expires_at')
			.eq('user_id', userId)
			.eq('state', 'completed')
			.order('created_at', { ascending: false })
			.limit(5);
		return parseRows(RUN_SCHEMA, result);
	}

	async prepareSample(userId: string, runId: string) {
		const result = await this.database.rpc('prepare_email_relevance_review_sample', {
			p_user_id: userId,
			p_run_id: runId,
			p_target_per_scope: EMAIL_RELEVANCE_REVIEW_TARGET_PER_ACCOUNT
		});
		const parsed = z
			.array(z.object({ total_samples: z.number().int(), scope_count: z.number().int() }))
			.safeParse(result.data ?? []);
		if (result.error || !parsed.success || parsed.data.length !== 1) storageError();
		return parsed.data[0]!;
	}

	async expireSamples(userId: string, runId: string): Promise<void> {
		const result = await this.database.rpc('expire_email_relevance_review_samples', {
			p_user_id: userId,
			p_run_id: runId
		});
		if (result.error) storageError();
	}

	async loadProjects(userId: string, runId: string): Promise<EmailRelevanceReviewProject[]> {
		const runResult = await this.database
			.from('email_relevance_scan_runs')
			.select('id')
			.eq('id', runId)
			.eq('user_id', userId)
			.maybeSingle();
		if (runResult.error || !runResult.data) {
			throw new EmailRelevanceReviewServiceError('run_unavailable');
		}
		const selectedResult = await this.database
			.from('email_relevance_scan_projects')
			.select('project_id, profile_id, profile_version')
			.eq('run_id', runId)
			.order('project_id', { ascending: true });
		const selected = parseRows(PROJECT_SCHEMA, selectedResult);
		const projectResult = await this.database
			.from('onto_projects')
			.select('id, name')
			.in(
				'id',
				selected.map((project) => project.project_id)
			);
		const names = parseRows(z.object({ id: UUID_SCHEMA, name: z.string() }), projectResult);
		const nameById = new Map(names.map((project) => [project.id, project.name]));
		return selected.map((project, index) => ({
			id: project.project_id,
			label: nameById.get(project.project_id) ?? `Project ${index + 1}`,
			profile_version: project.profile_version
		}));
	}

	async loadSamples(userId: string, runId: string): Promise<ReviewSample[]> {
		const result = await this.database
			.from('email_relevance_review_samples')
			.select('*')
			.eq('user_id', userId)
			.eq('run_id', runId)
			.order('sample_order', { ascending: true })
			.order('connection_scope_id', { ascending: true })
			.limit(500);
		return parseRows(SAMPLE_SCHEMA, result);
	}

	async loadAdjudications(userId: string, runId: string): Promise<ReviewAdjudication[]> {
		const result = await this.database
			.from('email_relevance_adjudications')
			.select(
				'id, sample_id, decision, correction_reason, corrected_project_id, rule_proposal, created_at'
			)
			.eq('user_id', userId)
			.eq('run_id', runId)
			.order('created_at', { ascending: true })
			.limit(500);
		return parseRows(ADJUDICATION_SCHEMA, result);
	}

	async loadScopeAccounting(userId: string, runId: string): Promise<ScopeAccounting[]> {
		const ownerResult = await this.database
			.from('email_relevance_scan_runs')
			.select('id')
			.eq('id', runId)
			.eq('user_id', userId)
			.maybeSingle();
		if (ownerResult.error || !ownerResult.data) {
			throw new EmailRelevanceReviewServiceError('run_unavailable');
		}
		const result = await this.database
			.from('email_relevance_scan_connections')
			.select(
				'id, list_pages_completed, observations_processed, gmail_quota_used, runtime_ms_used'
			)
			.eq('run_id', runId)
			.order('id', { ascending: true });
		return parseRows(
			z.object({
				id: UUID_SCHEMA,
				list_pages_completed: z.number().int().nonnegative(),
				observations_processed: z.number().int().nonnegative(),
				gmail_quota_used: z.coerce.number().nonnegative(),
				runtime_ms_used: z.coerce.number().nonnegative()
			}),
			result
		);
	}

	async loadSample(userId: string, runId: string, sampleId: string): Promise<ReviewSample> {
		const result = await this.database
			.from('email_relevance_review_samples')
			.select('*')
			.eq('id', sampleId)
			.eq('user_id', userId)
			.eq('run_id', runId)
			.maybeSingle();
		const parsed = SAMPLE_SCHEMA.safeParse(result.data);
		if (result.error || !parsed.success) {
			throw new EmailRelevanceReviewServiceError('sample_unavailable');
		}
		return parsed.data;
	}

	async loadOpenSource(input: { user_id: string; run_id: string; sample_id: string }) {
		const sample = await this.loadSample(input.user_id, input.run_id, input.sample_id);
		if (
			sample.state !== 'pending' ||
			Date.parse(sample.source_retention_expires_at) <= Date.now()
		) {
			throw new EmailRelevanceReviewServiceError('sample_unavailable');
		}
		const observationResult = await this.database
			.from('email_relevance_message_observations')
			.select('provider_message_id_ciphertext, connection_scope_id, retention_expires_at')
			.eq('id', sample.source_observation_id)
			.eq('user_id', input.user_id)
			.eq('run_id', input.run_id)
			.eq('processing_state', 'processed')
			.maybeSingle();
		const observation = z
			.object({
				provider_message_id_ciphertext: z.string(),
				connection_scope_id: UUID_SCHEMA,
				retention_expires_at: z.string()
			})
			.safeParse(observationResult.data);
		if (
			observationResult.error ||
			!observation.success ||
			observation.data.connection_scope_id !== sample.connection_scope_id ||
			Date.parse(observation.data.retention_expires_at) <= Date.now()
		) {
			throw new EmailRelevanceReviewServiceError('sample_unavailable');
		}
		const scopeResult = await this.database
			.from('email_relevance_scan_connections')
			.select('connection_id')
			.eq('id', sample.connection_scope_id)
			.eq('run_id', input.run_id)
			.maybeSingle();
		const scope = z
			.object({ connection_id: UUID_SCHEMA.nullable() })
			.safeParse(scopeResult.data);
		if (scopeResult.error || !scope.success || !scope.data.connection_id) {
			throw new EmailRelevanceReviewServiceError('connection_unavailable');
		}
		const projectResult = await this.database
			.from('onto_projects')
			.select('name')
			.eq('id', sample.project_id)
			.maybeSingle();
		const project = z.object({ name: z.string() }).safeParse(projectResult.data);
		if (projectResult.error || !project.success) {
			throw new EmailRelevanceReviewServiceError('project_unavailable');
		}
		return {
			sample,
			connection_id: scope.data.connection_id,
			provider_message_id_ciphertext: observation.data.provider_message_id_ciphertext,
			project_label: project.data.name
		};
	}

	async recordAdjudication(input: {
		user_id: string;
		run_id: string;
		sample_id: string;
		decision: ReviewDecision;
		correction_reason: ReviewCorrectionReason | null;
		corrected_project_id: string | null;
		rule_proposal: ReviewRuleProposal | null;
		idempotency_key_hash: string;
		decision_hash: string;
	}) {
		const result = await this.database.rpc('record_email_relevance_adjudication', {
			p_user_id: input.user_id,
			p_run_id: input.run_id,
			p_sample_id: input.sample_id,
			p_reviewer_user_id: input.user_id,
			p_decision: input.decision,
			p_correction_reason: input.correction_reason,
			p_corrected_project_id: input.corrected_project_id,
			p_rule_proposal: input.rule_proposal,
			p_idempotency_key_hash: input.idempotency_key_hash,
			p_decision_hash: input.decision_hash
		});
		const parsed = z
			.array(z.object({ adjudication_id: UUID_SCHEMA, replayed: z.boolean() }))
			.safeParse(result.data ?? []);
		if (result.error) {
			if (result.error.message?.includes('idempotency_conflict')) {
				throw new EmailRelevanceReviewServiceError('idempotency_conflict');
			}
			if (
				result.error.message?.includes('sample_unavailable') ||
				result.error.message?.includes('corrected_project_unavailable')
			) {
				throw new EmailRelevanceReviewServiceError('sample_unavailable');
			}
			storageError();
		}
		if (!parsed.success || parsed.data.length !== 1) storageError();
		return parsed.data[0]!;
	}
}

export type EmailRelevanceReviewServiceErrorCode =
	| 'review_disabled'
	| 'user_not_allowed'
	| 'invalid_input'
	| 'run_unavailable'
	| 'sample_unavailable'
	| 'connection_unavailable'
	| 'project_unavailable'
	| 'provider_timeout'
	| 'provider_rejected'
	| 'idempotency_conflict'
	| 'storage_unavailable';

export class EmailRelevanceReviewServiceError extends Error {
	constructor(public readonly code: EmailRelevanceReviewServiceErrorCode) {
		super(`Gmail relevance review rejected: ${code}`);
		this.name = 'EmailRelevanceReviewServiceError';
	}
}

function ratio(numerator: number, denominator: number): number | null {
	return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function variantMetrics(
	variant: 'a' | 'b',
	samples: ReviewSample[],
	bySample: Map<string, ReviewAdjudication>,
	accounting: ScopeAccounting[],
	costMultiplier = 1
): EmailRelevanceVariantMetrics {
	let accepted = 0;
	let candidateNonAmbiguous = 0;
	let relevantPopulation = 0;
	let relevantDetected = 0;
	let wrongProject = 0;
	let candidateReviewed = 0;
	let candidateAmbiguous = 0;
	for (const sample of samples) {
		const adjudication = bySample.get(sample.id);
		if (!adjudication) continue;
		const hasCandidate =
			variant === 'a' ? Boolean(sample.candidate_a_id) : Boolean(sample.candidate_b_id);
		const relevant = ['correct_project', 'relevant_missing_project'].includes(
			adjudication.decision
		);
		if (adjudication.decision !== 'ambiguous' && relevant) {
			relevantPopulation += sample.sampling_weight;
			if (hasCandidate) relevantDetected += sample.sampling_weight;
		}
		if (!hasCandidate) continue;
		candidateReviewed += sample.sampling_weight;
		if (adjudication.decision === 'ambiguous') {
			candidateAmbiguous += sample.sampling_weight;
			continue;
		}
		candidateNonAmbiguous += sample.sampling_weight;
		if (relevant) accepted += sample.sampling_weight;
		if (adjudication.decision === 'wrong_project') wrongProject += sample.sampling_weight;
	}
	const providerCalls = accounting.reduce(
		(total, scope) => total + scope.list_pages_completed + scope.observations_processed,
		0
	);
	const gmailUnits = accounting.reduce((total, scope) => total + scope.gmail_quota_used, 0);
	const runtimeMs = accounting.reduce((total, scope) => total + scope.runtime_ms_used, 0);
	return {
		precision: ratio(accepted, candidateNonAmbiguous),
		recall: ratio(relevantDetected, relevantPopulation),
		wrong_project_rate: ratio(wrongProject, candidateNonAmbiguous),
		ambiguous_rate: ratio(candidateAmbiguous, candidateReviewed),
		estimated_accepted_candidates: Number(accepted.toFixed(2)),
		cost_per_accepted_candidate: {
			provider_calls: ratio(providerCalls * costMultiplier, accepted),
			gmail_units: ratio(gmailUnits * costMultiplier, accepted),
			runtime_ms: ratio(runtimeMs * costMultiplier, accepted)
		}
	};
}

function estimatedCandidateCount(variant: 'a' | 'b', samples: ReviewSample[]): number {
	return samples.reduce(
		(total, sample) =>
			total +
			((variant === 'a' ? sample.candidate_a_id : sample.candidate_b_id)
				? sample.sampling_weight
				: 0),
		0
	);
}

function segmentMetrics(input: {
	id: string;
	label: string;
	samples: ReviewSample[];
	by_sample: Map<string, ReviewAdjudication>;
	accounting: ScopeAccounting[];
	cost_multiplier?: number;
}): EmailRelevanceReviewSegmentMetrics {
	const observations = input.accounting.reduce(
		(total, scope) => total + scope.observations_processed,
		0
	);
	return {
		id: input.id,
		label: input.label,
		reviewed: input.samples.filter((sample) => input.by_sample.has(sample.id)).length,
		variant_a: variantMetrics(
			'a',
			input.samples,
			input.by_sample,
			input.accounting,
			input.cost_multiplier
		),
		variant_b: variantMetrics(
			'b',
			input.samples,
			input.by_sample,
			input.accounting,
			input.cost_multiplier
		),
		candidate_yield_per_100_observations: {
			a:
				observations > 0
					? Number(
							(
								(estimatedCandidateCount('a', input.samples) / observations) *
								100
							).toFixed(2)
						)
					: null,
			b:
				observations > 0
					? Number(
							(
								(estimatedCandidateCount('b', input.samples) / observations) *
								100
							).toFixed(2)
						)
					: null
		}
	};
}

export function computeEmailRelevanceReviewMetrics(input: {
	samples: ReviewSample[];
	adjudications: ReviewAdjudication[];
	accounting: ScopeAccounting[];
	candidate_counts: { a: number; b: number };
	project_labels?: Record<string, string>;
}): EmailRelevanceReviewMetrics {
	const bySample = new Map(input.adjudications.map((row) => [row.sample_id, row]));
	const scopeIds = [...new Set(input.samples.map((sample) => sample.connection_scope_id))].sort();
	const scopeLabel = new Map(scopeIds.map((id, index) => [id, `Account ${index + 1}`]));
	const decisionCounts = Object.fromEntries(
		EMAIL_RELEVANCE_REVIEW_DECISIONS.map((decision) => [decision, 0])
	) as Record<ReviewDecision, number>;
	for (const adjudication of input.adjudications) decisionCounts[adjudication.decision] += 1;
	const observationCount = input.accounting.reduce(
		(total, scope) => total + scope.observations_processed,
		0
	);
	const projectIds = [...new Set(input.samples.map((sample) => sample.project_id))].sort();
	const projectCostMultiplier = projectIds.length > 0 ? 1 / projectIds.length : 1;
	return {
		target: input.samples.length,
		adjudicated: input.adjudications.length,
		pending: input.samples.filter((sample) => sample.state === 'pending').length,
		expired: input.samples.filter((sample) => sample.state === 'expired').length,
		decision_counts: decisionCounts,
		rule_proposal_count: input.adjudications.filter((row) => row.rule_proposal !== null).length,
		correction_count: input.adjudications.filter((row) => row.correction_reason !== null)
			.length,
		variant_a: variantMetrics('a', input.samples, bySample, input.accounting),
		variant_b: variantMetrics('b', input.samples, bySample, input.accounting),
		overlap: {
			both: Number(
				input.samples
					.filter((sample) => sample.sampling_stratum === 'both')
					.reduce((total, sample) => total + sample.sampling_weight, 0)
					.toFixed(2)
			),
			a_only: Number(
				input.samples
					.filter((sample) => sample.sampling_stratum === 'a_only')
					.reduce((total, sample) => total + sample.sampling_weight, 0)
					.toFixed(2)
			),
			b_only: Number(
				input.samples
					.filter((sample) => sample.sampling_stratum === 'b_only')
					.reduce((total, sample) => total + sample.sampling_weight, 0)
					.toFixed(2)
			),
			none: Number(
				input.samples
					.filter((sample) => sample.sampling_stratum === 'none')
					.reduce((total, sample) => total + sample.sampling_weight, 0)
					.toFixed(2)
			)
		},
		coverage: {
			accounts: new Set(
				input.samples
					.filter((sample) => bySample.has(sample.id))
					.map((sample) => sample.connection_scope_id)
			).size,
			projects: new Set(
				input.samples
					.filter((sample) => bySample.has(sample.id))
					.map((sample) => sample.project_id)
			).size
		},
		candidate_yield_per_100_observations: {
			a:
				observationCount > 0
					? Number(((input.candidate_counts.a / observationCount) * 100).toFixed(2))
					: null,
			b:
				observationCount > 0
					? Number(((input.candidate_counts.b / observationCount) * 100).toFixed(2))
					: null
		},
		account_progress: scopeIds.map((id) => ({
			account_label: scopeLabel.get(id)!,
			reviewed: input.samples.filter(
				(sample) => sample.connection_scope_id === id && bySample.has(sample.id)
			).length,
			target: input.samples.filter((sample) => sample.connection_scope_id === id).length
		})),
		segments: {
			accounts: scopeIds.map((id) =>
				segmentMetrics({
					id,
					label: scopeLabel.get(id)!,
					samples: input.samples.filter((sample) => sample.connection_scope_id === id),
					by_sample: bySample,
					accounting: input.accounting.filter((scope) => scope.id === id)
				})
			),
			projects: projectIds.map((id, index) =>
				segmentMetrics({
					id,
					label: input.project_labels?.[id] ?? `Project ${index + 1}`,
					samples: input.samples.filter((sample) => sample.project_id === id),
					by_sample: bySample,
					accounting: input.accounting,
					cost_multiplier: projectCostMultiplier
				})
			)
		}
	};
}

function validDecisionShape(input: z.infer<typeof REVIEW_INPUT_SCHEMA>): boolean {
	if (input.decision === 'correct_project') {
		return input.correction_reason === null && input.corrected_project_id === null;
	}
	if (input.decision === 'relevant_missing_project') {
		return input.correction_reason !== null && input.corrected_project_id !== null;
	}
	if (input.decision === 'ambiguous') {
		return (
			['cross_project_ambiguity', 'insufficient_metadata'].includes(
				input.correction_reason ?? ''
			) && input.corrected_project_id === null
		);
	}
	if (input.decision === 'wrong_project') {
		return input.correction_reason !== null && input.corrected_project_id !== null;
	}
	return input.correction_reason !== null && input.corrected_project_id === null;
}

function selectQuickReviewSamples(samples: ReviewSample[]): ReviewSample[] {
	const orderedCandidates = samples
		.filter((sample) => sample.candidate_a_id !== null || sample.candidate_b_id !== null)
		.sort(
			(left, right) =>
				left.sample_order - right.sample_order ||
				left.connection_scope_id.localeCompare(right.connection_scope_id) ||
				left.project_id.localeCompare(right.project_id) ||
				left.id.localeCompare(right.id)
		);
	const groups = new Map<string, ReviewSample[]>();
	for (const sample of orderedCandidates) {
		const key = `${sample.connection_scope_id}:${sample.sampling_stratum}:${sample.project_id}`;
		const group = groups.get(key) ?? [];
		group.push(sample);
		groups.set(key, group);
	}
	const groupKeys = [...groups.keys()].sort();
	const cursors = new Map(groupKeys.map((key) => [key, 0]));
	const selected: ReviewSample[] = [];
	const selectedIds = new Set<string>();
	const selectedSources = new Set<string>();

	while (selected.length < EMAIL_RELEVANCE_QUICK_REVIEW_TARGET) {
		let added = false;
		for (const key of groupKeys) {
			const group = groups.get(key)!;
			let cursor = cursors.get(key)!;
			while (
				cursor < group.length &&
				selectedSources.has(group[cursor]!.source_observation_id)
			) {
				cursor += 1;
			}
			cursors.set(key, cursor + 1);
			if (cursor >= group.length) continue;
			const sample = group[cursor]!;
			selected.push(sample);
			selectedIds.add(sample.id);
			selectedSources.add(sample.source_observation_id);
			added = true;
			if (selected.length === EMAIL_RELEVANCE_QUICK_REVIEW_TARGET) break;
		}
		if (!added) break;
	}

	if (selected.length < EMAIL_RELEVANCE_QUICK_REVIEW_TARGET) {
		for (const sample of orderedCandidates) {
			if (selectedIds.has(sample.id)) continue;
			selected.push(sample);
			if (selected.length === EMAIL_RELEVANCE_QUICK_REVIEW_TARGET) break;
		}
	}

	return selected;
}

function sha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

type EmailRelevanceReviewServiceDependencies = {
	repository?: EmailRelevanceReviewRepository;
	gateway?: Pick<GmailRelevanceMetadataGateway, 'getMetadataBatch'>;
	environment?: Record<string, string | undefined>;
	now?: () => number;
};

export class EmailRelevanceReviewService {
	private readonly repository: EmailRelevanceReviewRepository;
	private readonly gateway: Pick<GmailRelevanceMetadataGateway, 'getMetadataBatch'>;
	private readonly environment: Record<string, string | undefined>;
	private readonly now: () => number;

	constructor(dependencies: EmailRelevanceReviewServiceDependencies = {}) {
		const admin =
			dependencies.repository && dependencies.gateway ? null : createAdminSupabaseClient();
		this.repository =
			dependencies.repository ??
			new SupabaseEmailRelevanceReviewRepository(admin as unknown as ReviewDatabaseClient);
		this.gateway = dependencies.gateway ?? new GmailRelevanceMetadataGateway(admin!);
		this.environment = dependencies.environment ?? process.env;
		this.now = dependencies.now ?? Date.now;
	}

	private assertAllowed(userId: string): void {
		if (!isGmailRelevancePhaseAReviewUserAllowed(userId, this.environment)) {
			throw new EmailRelevanceReviewServiceError(
				this.environment.GMAIL_RELEVANCE_PHASE_A_REVIEW_ENABLED
					? 'user_not_allowed'
					: 'review_disabled'
			);
		}
	}

	async dashboard(
		userId: string,
		requestedRunId?: string | null
	): Promise<EmailRelevanceReviewDashboard> {
		this.assertAllowed(userId);
		if (!UUID_SCHEMA.safeParse(userId).success) {
			throw new EmailRelevanceReviewServiceError('invalid_input');
		}
		const runs = await this.repository.listRuns(userId);
		const selected = requestedRunId ? runs.find((run) => run.id === requestedRunId) : runs[0];
		if (requestedRunId && !selected) {
			throw new EmailRelevanceReviewServiceError('run_unavailable');
		}
		const labeledRuns = runs.map((run, index) => ({ ...run, label: `Run ${index + 1}` }));
		if (!selected) {
			return {
				runs: labeledRuns,
				selected_run_id: null,
				projects: [],
				queue: [],
				metrics: null,
				source_retention_expires_at: null
			};
		}
		await this.repository.expireSamples(userId, selected.id);
		const [projects, samples, adjudications, accounting] = await Promise.all([
			this.repository.loadProjects(userId, selected.id),
			this.repository.loadSamples(userId, selected.id),
			this.repository.loadAdjudications(userId, selected.id),
			this.repository.loadScopeAccounting(userId, selected.id)
		]);
		const projectLabel = new Map(projects.map((project) => [project.id, project.label]));
		const scopeIds = [...new Set(samples.map((sample) => sample.connection_scope_id))].sort();
		const scopeLabel = new Map(scopeIds.map((id, index) => [id, `Account ${index + 1}`]));
		const quickReviewOrder = new Map(
			selectQuickReviewSamples(samples).map((sample, index) => [sample.id, index + 1])
		);
		const pendingQuickSamples = samples.filter(
			(sample) => sample.state === 'pending' && quickReviewOrder.has(sample.id)
		);
		return {
			runs: labeledRuns,
			selected_run_id: selected.id,
			projects,
			queue: samples.map((sample) => ({
				id: sample.id,
				account_label: scopeLabel.get(sample.connection_scope_id) ?? 'Account',
				project_label: projectLabel.get(sample.project_id) ?? 'Project',
				sample_order: sample.sample_order,
				quick_review_order: quickReviewOrder.get(sample.id) ?? null,
				state: sample.state
			})),
			metrics: computeEmailRelevanceReviewMetrics({
				samples,
				adjudications,
				accounting,
				candidate_counts: {
					a: estimatedCandidateCount('a', samples),
					b: estimatedCandidateCount('b', samples)
				},
				project_labels: Object.fromEntries(
					projects.map((project) => [project.id, project.label])
				)
			}),
			source_retention_expires_at:
				pendingQuickSamples.length > 0
					? pendingQuickSamples.reduce(
							(earliest, sample) =>
								Date.parse(sample.source_retention_expires_at) <
								Date.parse(earliest)
									? sample.source_retention_expires_at
									: earliest,
							pendingQuickSamples[0]!.source_retention_expires_at
						)
					: null
		};
	}

	async prepareSample(userId: string, runId: string) {
		this.assertAllowed(userId);
		if (!UUID_SCHEMA.safeParse(userId).success || !UUID_SCHEMA.safeParse(runId).success) {
			throw new EmailRelevanceReviewServiceError('invalid_input');
		}
		return this.repository.prepareSample(userId, runId);
	}

	async openSample(input: {
		user_id: string;
		run_id: string;
		sample_id: string;
	}): Promise<EmailRelevanceReviewContext> {
		this.assertAllowed(input.user_id);
		if (
			!z
				.object({ user_id: UUID_SCHEMA, run_id: UUID_SCHEMA, sample_id: UUID_SCHEMA })
				.strict()
				.safeParse(input).success
		) {
			throw new EmailRelevanceReviewServiceError('invalid_input');
		}
		const source = await this.repository.loadOpenSource(input);
		if (Date.parse(source.sample.source_retention_expires_at) <= this.now()) {
			throw new EmailRelevanceReviewServiceError('sample_unavailable');
		}
		const providerMessageId = decryptEmailRelevanceValue(
			source.provider_message_id_ciphertext,
			{
				userId: input.user_id,
				connectionScopeId: source.sample.connection_scope_id,
				kind: 'provider_message'
			}
		);
		try {
			const metadata = await this.gateway.getMetadataBatch({
				user_id: input.user_id,
				connection_id: source.connection_id,
				provider_message_ids: [providerMessageId]
			});
			const message = metadata.messages[0];
			if (!message || message.provider_message_id !== providerMessageId) {
				throw new EmailRelevanceReviewServiceError('provider_rejected');
			}
			if (Date.parse(source.sample.source_retention_expires_at) <= this.now()) {
				throw new EmailRelevanceReviewServiceError('sample_unavailable');
			}
			return {
				sample_id: source.sample.id,
				project_id: source.sample.project_id,
				idempotency_key: randomUUID(),
				account_label: 'Selected account',
				project_label: source.project_label,
				internal_date: message.internal_date,
				mailbox_categories: message.mailbox_categories,
				subject: message.subject,
				snippet: message.snippet,
				participant_addresses: message.participant_addresses
			};
		} catch (cause) {
			if (cause instanceof EmailRelevanceReviewServiceError) throw cause;
			if (cause instanceof GmailRelevanceMetadataGatewayError) {
				throw new EmailRelevanceReviewServiceError(
					cause.code === 'provider_timeout' ? 'provider_timeout' : 'provider_rejected'
				);
			}
			throw new EmailRelevanceReviewServiceError('provider_rejected');
		}
	}

	async adjudicate(input: {
		user_id: string;
		run_id: string;
		sample_id: string;
		idempotency_key: string;
		decision: string;
		correction_reason: string | null;
		corrected_project_id: string | null;
		rule_proposal: string | null;
	}) {
		this.assertAllowed(input.user_id);
		const parsed = REVIEW_INPUT_SCHEMA.safeParse(input);
		if (!parsed.success || !validDecisionShape(parsed.data)) {
			throw new EmailRelevanceReviewServiceError('invalid_input');
		}
		const canonicalDecision = JSON.stringify({
			sample_id: parsed.data.sample_id,
			decision: parsed.data.decision,
			correction_reason: parsed.data.correction_reason,
			corrected_project_id: parsed.data.corrected_project_id,
			rule_proposal: parsed.data.rule_proposal,
			contract: EMAIL_RELEVANCE_REVIEW_CONTRACT_VERSION
		});
		const { idempotency_key: _idempotencyKey, ...boundedDecision } = parsed.data;
		const sample = await this.repository.loadSample(
			parsed.data.user_id,
			parsed.data.run_id,
			parsed.data.sample_id
		);
		const result = await this.repository.recordAdjudication({
			...boundedDecision,
			idempotency_key_hash: sha256(`${parsed.data.user_id}:${parsed.data.idempotency_key}`),
			decision_hash: sha256(canonicalDecision)
		});
		return {
			...result,
			variant_reveal: {
				stratum: sample.sampling_stratum,
				a: sample.candidate_a_id
					? {
							score: sample.a_score,
							confidence: sample.a_confidence,
							evidence: {
								confirmed_thread: sample.a_confirmed_thread,
								explicit_rule: sample.a_explicit_rule,
								actor_overlap: sample.a_actor_overlap,
								domain_overlap: sample.a_domain_overlap,
								artifact_overlap: sample.a_artifact_overlap,
								identifier_overlap: sample.a_identifier_overlap,
								lexical_overlap: sample.a_lexical_overlap,
								negative_evidence: sample.a_negative_evidence
							}
						}
					: null,
				b: sample.candidate_b_id
					? {
							score: sample.b_score,
							confidence: sample.b_confidence,
							evidence: {
								confirmed_thread: sample.b_confirmed_thread,
								explicit_rule: sample.b_explicit_rule,
								actor_overlap: sample.b_actor_overlap,
								domain_overlap: sample.b_domain_overlap,
								artifact_overlap: sample.b_artifact_overlap,
								identifier_overlap: sample.b_identifier_overlap,
								lexical_overlap: sample.b_lexical_overlap,
								negative_evidence: sample.b_negative_evidence
							}
						}
					: null
			}
		};
	}
}

export function createEmailRelevanceReviewService(): EmailRelevanceReviewService {
	return new EmailRelevanceReviewService();
}
