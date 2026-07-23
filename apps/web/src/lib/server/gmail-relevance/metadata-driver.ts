// apps/web/src/lib/server/gmail-relevance/metadata-driver.ts
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	decryptEmailRelevanceValue,
	encryptEmailRelevanceValue,
	getActiveEmailRelevanceKeyVersion,
	hashEmailRelevanceValue
} from './metadata-crypto';
import {
	GmailRelevanceMetadataGateway,
	GmailRelevanceMetadataGatewayError,
	type GmailRelevanceMetadataGatewayErrorCode
} from './metadata-gateway';
import {
	EmailRelevanceScanControlPlane,
	type EmailRelevanceCandidateInput,
	type EmailRelevanceMetadataSettlementInput
} from './scan-control-plane';
import {
	scoreEmailRelevanceVariants,
	type EmailRelevanceRuleKind,
	type EmailRelevanceScoringProfile,
	type EmailRelevanceScoringRule
} from './metadata-scorer';
import type { ProjectEmailProfileGroups } from './project-email-profile';

export const EMAIL_RELEVANCE_METADATA_POLICY_VERSION = 'email-relevance-metadata-policy-v1';
export const EMAIL_RELEVANCE_METADATA_DRIVER_VERSION = 'email-relevance-metadata-driver-v1';

const UUID_SCHEMA = z.string().uuid();

type QueryResult = { data: unknown; error: { message?: string } | null };
type QueryBuilder = PromiseLike<QueryResult> & {
	select(columns: string): QueryBuilder;
	eq(column: string, value: unknown): QueryBuilder;
	in(column: string, values: unknown[]): QueryBuilder;
	is(column: string, value: null): QueryBuilder;
	or(filter: string): QueryBuilder;
	order(column: string, options?: { ascending?: boolean }): QueryBuilder;
	limit(count: number): QueryBuilder;
	single(): PromiseLike<QueryResult>;
};
type MetadataDatabaseClient = { from(table: string): QueryBuilder };

export type EmailRelevancePendingObservation = {
	id: string;
	provider_message_id_ciphertext: string;
};

export type EmailRelevanceMetadataDriverContext = {
	connection_id: string;
	window_start: string;
	window_end: string;
	checkpoint_version: number;
	cursor_envelope: string | null;
	message_cap: number;
	observations_discovered: number;
	pending_observations: EmailRelevancePendingObservation[];
	profiles: EmailRelevanceScoringProfile[];
	rules: EmailRelevanceScoringRule[];
};

export type EmailRelevanceMetadataRepository = {
	loadContext(input: {
		user_id: string;
		run_id: string;
		connection_scope_id: string;
	}): Promise<EmailRelevanceMetadataDriverContext>;
};

export type EmailRelevanceMetadataDriverResult = {
	status: 'committed' | 'no_op';
	operation_code: 'list_page' | 'metadata_batch';
	checkpoint_version: number;
	scope_state: string;
	error_code: string | null;
	provider_calls_started: number;
	observation_count: number;
	candidate_count: number;
};

export class EmailRelevanceMetadataDriverError extends Error {
	constructor(
		public readonly code: 'scope_unavailable' | 'storage_unavailable' | 'internal_error'
	) {
		super(`Email relevance metadata driver rejected: ${code}`);
		this.name = 'EmailRelevanceMetadataDriverError';
	}
}

const SCOPE_ROW_SCHEMA = z
	.object({
		connection_id: UUID_SCHEMA.nullable(),
		checkpoint_version: z.number().int().nonnegative(),
		cursor_envelope: z.string().nullable(),
		message_cap: z.number().int().min(1).max(1_000),
		observations_discovered: z.number().int().nonnegative().max(1_000),
		state: z.string(),
		email_relevance_scan_runs: z.object({
			user_id: UUID_SCHEMA,
			window_start: z.string(),
			window_end: z.string()
		})
	})
	.passthrough();

class SupabaseEmailRelevanceMetadataRepository implements EmailRelevanceMetadataRepository {
	constructor(private readonly database: MetadataDatabaseClient) {}

	async loadContext(input: {
		user_id: string;
		run_id: string;
		connection_scope_id: string;
	}): Promise<EmailRelevanceMetadataDriverContext> {
		const scopeResult = await this.database
			.from('email_relevance_scan_connections')
			.select(
				'connection_id, checkpoint_version, cursor_envelope, message_cap, observations_discovered, state, email_relevance_scan_runs!inner(user_id, window_start, window_end)'
			)
			.eq('id', input.connection_scope_id)
			.eq('run_id', input.run_id)
			.single();
		const parsedScope = SCOPE_ROW_SCHEMA.safeParse(scopeResult.data);
		if (
			scopeResult.error ||
			!parsedScope.success ||
			parsedScope.data.email_relevance_scan_runs.user_id !== input.user_id ||
			!parsedScope.data.connection_id
		) {
			throw new EmailRelevanceMetadataDriverError('scope_unavailable');
		}

		const pendingResult = await this.database
			.from('email_relevance_message_observations')
			.select('id, provider_message_id_ciphertext')
			.eq('connection_scope_id', input.connection_scope_id)
			.eq('processing_state', 'pending')
			.order('created_at', { ascending: true })
			.order('id', { ascending: true })
			.limit(50);
		const pending = z
			.array(
				z.object({
					id: UUID_SCHEMA,
					provider_message_id_ciphertext: z.string()
				})
			)
			.safeParse(pendingResult.data ?? []);
		if (pendingResult.error || !pending.success) {
			throw new EmailRelevanceMetadataDriverError('storage_unavailable');
		}

		const selectedResult = await this.database
			.from('email_relevance_scan_projects')
			.select('project_id, profile_id, profile_version')
			.eq('run_id', input.run_id)
			.is('invalidated_at', null);
		const selected = z
			.array(
				z.object({
					project_id: UUID_SCHEMA,
					profile_id: UUID_SCHEMA,
					profile_version: z.number().int().positive()
				})
			)
			.safeParse(selectedResult.data ?? []);
		if (selectedResult.error || !selected.success || selected.data.length === 0) {
			throw new EmailRelevanceMetadataDriverError('storage_unavailable');
		}

		const versionsResult = await this.database
			.from('email_project_profile_versions')
			.select('id, profile_id, profile_version, groups')
			.in(
				'profile_id',
				selected.data.map((project) => project.profile_id)
			);
		const versions = z
			.array(
				z.object({
					id: UUID_SCHEMA,
					profile_id: UUID_SCHEMA,
					profile_version: z.number().int().positive(),
					groups: z.record(z.unknown())
				})
			)
			.safeParse(versionsResult.data ?? []);
		if (versionsResult.error || !versions.success) {
			throw new EmailRelevanceMetadataDriverError('storage_unavailable');
		}
		const versionBySelection = new Map(
			versions.data.map((version) => [
				`${version.profile_id}:${version.profile_version}`,
				version
			])
		);
		const profiles = selected.data.map((selection) => {
			const version = versionBySelection.get(
				`${selection.profile_id}:${selection.profile_version}`
			);
			if (!version) throw new EmailRelevanceMetadataDriverError('storage_unavailable');
			return {
				project_id: selection.project_id,
				profile_id: selection.profile_id,
				profile_version_id: version.id,
				profile_version: selection.profile_version,
				groups: version.groups as ProjectEmailProfileGroups
			};
		});

		const projectIds = selected.data.map((project) => project.project_id);
		const rulesResult = await this.database
			.from('email_project_rules')
			.select('project_id, connection_id, rule_kind, match_value_ciphertext')
			.eq('user_id', input.user_id)
			.in('project_id', projectIds)
			.is('disabled_at', null)
			.or(`connection_id.is.null,connection_id.eq.${parsedScope.data.connection_id}`);
		const rules = z
			.array(
				z.object({
					project_id: UUID_SCHEMA,
					connection_id: UUID_SCHEMA.nullable(),
					rule_kind: z.enum([
						'always_sender',
						'always_domain',
						'always_label',
						'always_thread',
						'never_sender',
						'never_domain',
						'never_label',
						'never_thread'
					]),
					match_value_ciphertext: z.string()
				})
			)
			.safeParse(rulesResult.data ?? []);
		if (rulesResult.error || !rules.success) {
			throw new EmailRelevanceMetadataDriverError('storage_unavailable');
		}

		return {
			connection_id: parsedScope.data.connection_id,
			window_start: parsedScope.data.email_relevance_scan_runs.window_start,
			window_end: parsedScope.data.email_relevance_scan_runs.window_end,
			checkpoint_version: parsedScope.data.checkpoint_version,
			cursor_envelope: parsedScope.data.cursor_envelope,
			message_cap: parsedScope.data.message_cap,
			observations_discovered: parsedScope.data.observations_discovered,
			pending_observations: pending.data,
			profiles,
			rules: rules.data.map((rule) => ({
				project_id: rule.project_id,
				rule_kind: rule.rule_kind as EmailRelevanceRuleKind,
				normalized_value: decryptEmailRelevanceValue(rule.match_value_ciphertext, {
					userId: input.user_id,
					connectionId: rule.connection_id ?? 'global',
					kind: 'rule_value',
					projectId: rule.project_id
				})
			}))
		};
	}
}

type MetadataDriverDependencies = {
	controlPlane?: EmailRelevanceScanControlPlane;
	gateway?: GmailRelevanceMetadataGateway;
	repository?: EmailRelevanceMetadataRepository;
	now?: () => number;
	processingToken?: () => string;
};

function candidateInput(
	score: ReturnType<typeof scoreEmailRelevanceVariants>[number]
): EmailRelevanceCandidateInput {
	return {
		project_id: score.project_id,
		profile_version_id: score.profile_version_id,
		variant: score.variant,
		score: score.score,
		confidence: score.confidence,
		confirmed_thread: score.evidence.confirmed_thread,
		explicit_rule: score.evidence.explicit_rule,
		actor_overlap: score.evidence.actor_overlap,
		domain_overlap: score.evidence.domain_overlap,
		artifact_overlap: score.evidence.artifact_overlap,
		identifier_overlap: score.evidence.identifier_overlap,
		lexical_overlap: score.evidence.lexical_overlap,
		negative_evidence: score.evidence.negative_evidence,
		actor_overlap_count: score.evidence.actor_overlap_count,
		domain_overlap_count: score.evidence.domain_overlap_count,
		artifact_overlap_count: score.evidence.artifact_overlap_count,
		identifier_overlap_count: score.evidence.identifier_overlap_count,
		lexical_overlap_count: score.evidence.lexical_overlap_count,
		negative_evidence_count: score.evidence.negative_evidence_count
	};
}

function failureCode(
	error: unknown,
	fallbackCalls: number
): {
	code: Parameters<EmailRelevanceScanControlPlane['settleOperationFailure']>[0]['error_code'];
	calls: number;
} {
	if (error instanceof GmailRelevanceMetadataGatewayError) {
		const code: Record<
			GmailRelevanceMetadataGatewayErrorCode,
			Parameters<EmailRelevanceScanControlPlane['settleOperationFailure']>[0]['error_code']
		> = {
			invalid_request: 'internal_error',
			connection_unavailable: 'connection_disconnected',
			provider_timeout: 'provider_timeout',
			provider_rejected: 'provider_rejected',
			provider_response_too_large: 'provider_response_too_large',
			invalid_provider_response: 'invalid_provider_response'
		};
		return { code: code[error.code], calls: error.providerCallsStarted };
	}
	return { code: 'internal_error', calls: fallbackCalls };
}

export class EmailRelevanceMetadataDriver {
	private readonly controlPlane: EmailRelevanceScanControlPlane;
	private readonly gateway: GmailRelevanceMetadataGateway;
	private readonly repository: EmailRelevanceMetadataRepository;
	private readonly now: () => number;
	private readonly processingToken: () => string;

	constructor(dependencies: MetadataDriverDependencies = {}) {
		const admin =
			dependencies.gateway && dependencies.repository ? null : createAdminSupabaseClient();
		this.controlPlane = dependencies.controlPlane ?? new EmailRelevanceScanControlPlane();
		this.gateway = dependencies.gateway ?? new GmailRelevanceMetadataGateway(admin!);
		this.repository =
			dependencies.repository ??
			new SupabaseEmailRelevanceMetadataRepository(
				admin as unknown as MetadataDatabaseClient
			);
		this.now = dependencies.now ?? (() => Date.now());
		this.processingToken = dependencies.processingToken ?? randomUUID;
	}

	async runOneOperation(input: {
		user_id: string;
		run_id: string;
		connection_scope_id: string;
		lease_owner?: string;
	}): Promise<EmailRelevanceMetadataDriverResult> {
		const parsed = z
			.object({
				user_id: UUID_SCHEMA,
				run_id: UUID_SCHEMA,
				connection_scope_id: UUID_SCHEMA,
				lease_owner: z
					.string()
					.regex(/^[a-z0-9_-]{1,64}$/)
					.optional()
			})
			.strict()
			.safeParse(input);
		if (!parsed.success) throw new EmailRelevanceMetadataDriverError('scope_unavailable');
		const context = await this.repository.loadContext(parsed.data);
		const operation =
			context.pending_observations.length > 0
				? {
						operation_code: 'metadata_batch' as const,
						message_count: context.pending_observations.length
					}
				: { operation_code: 'list_page' as const };
		const processingToken = this.processingToken();
		const claim = await this.controlPlane.claimOperation({
			...parsed.data,
			expected_checkpoint: context.checkpoint_version,
			processing_token: processingToken,
			lease_owner: parsed.data.lease_owner ?? EMAIL_RELEVANCE_METADATA_DRIVER_VERSION,
			operation
		});
		if (!claim.claimed || !claim.operation_id) {
			return {
				status: 'no_op',
				operation_code: operation.operation_code,
				checkpoint_version: claim.checkpoint_version,
				scope_state: claim.scope_state,
				error_code: claim.error_code,
				provider_calls_started: 0,
				observation_count: 0,
				candidate_count: 0
			};
		}

		const startedAt = this.now();
		let providerCallsStarted = 0;
		try {
			if (operation.operation_code === 'list_page') {
				const pageToken = context.cursor_envelope
					? decryptEmailRelevanceValue(context.cursor_envelope, {
							userId: parsed.data.user_id,
							connectionScopeId: parsed.data.connection_scope_id,
							kind: 'page_cursor'
						})
					: null;
				const page = await this.gateway.listPage({
					user_id: parsed.data.user_id,
					connection_id: context.connection_id,
					window_start: context.window_start,
					window_end: context.window_end,
					page_token: pageToken
				});
				providerCallsStarted = 1;
				const remaining = context.message_cap - context.observations_discovered;
				const selected = page.messages.slice(0, remaining);
				const reachedCap = selected.length >= remaining;
				const keyVersion = getActiveEmailRelevanceKeyVersion();
				const settlement = await this.controlPlane.settleListPage({
					...parsed.data,
					expected_checkpoint: context.checkpoint_version,
					processing_token: processingToken,
					operation_id: claim.operation_id,
					actual_runtime_ms: Math.min(15_000, Math.max(0, this.now() - startedAt)),
					observations: selected.map((message) => ({
						provider_message_id_hash: hashEmailRelevanceValue(
							message.provider_message_id,
							{
								userId: parsed.data.user_id,
								connectionScopeId: parsed.data.connection_scope_id,
								kind: 'provider_message'
							}
						),
						provider_message_id_ciphertext: encryptEmailRelevanceValue(
							message.provider_message_id,
							{
								userId: parsed.data.user_id,
								connectionScopeId: parsed.data.connection_scope_id,
								kind: 'provider_message'
							}
						),
						provider_thread_id_hash: hashEmailRelevanceValue(
							message.provider_thread_id,
							{
								userId: parsed.data.user_id,
								connectionScopeId: parsed.data.connection_scope_id,
								kind: 'provider_thread'
							}
						),
						provider_thread_id_ciphertext: encryptEmailRelevanceValue(
							message.provider_thread_id,
							{
								userId: parsed.data.user_id,
								connectionScopeId: parsed.data.connection_scope_id,
								kind: 'provider_thread'
							}
						),
						key_version: keyVersion
					})),
					next_cursor_envelope:
						!reachedCap && page.next_page_token
							? encryptEmailRelevanceValue(page.next_page_token, {
									userId: parsed.data.user_id,
									connectionScopeId: parsed.data.connection_scope_id,
									kind: 'page_cursor'
								})
							: null,
					next_cursor_key_version: !reachedCap && page.next_page_token ? keyVersion : null
				});
				return {
					status: settlement.committed ? 'committed' : 'no_op',
					operation_code: 'list_page',
					checkpoint_version: settlement.checkpoint_version,
					scope_state: settlement.scope_state,
					error_code: settlement.error_code,
					provider_calls_started: 1,
					observation_count: selected.length,
					candidate_count: 0
				};
			}

			const providerIds = context.pending_observations.map((observation) =>
				decryptEmailRelevanceValue(observation.provider_message_id_ciphertext, {
					userId: parsed.data.user_id,
					connectionScopeId: parsed.data.connection_scope_id,
					kind: 'provider_message'
				})
			);
			const metadataBatch = await this.gateway.getMetadataBatch({
				user_id: parsed.data.user_id,
				connection_id: context.connection_id,
				provider_message_ids: providerIds
			});
			providerCallsStarted = providerIds.length;
			const observationByProviderId = new Map(
				providerIds.map((providerId, index) => [
					providerId,
					context.pending_observations[index]!
				])
			);
			let candidateCount = 0;
			const results: EmailRelevanceMetadataSettlementInput[] = metadataBatch.messages.map(
				(metadata) => {
					const observation = observationByProviderId.get(metadata.provider_message_id);
					if (!observation) throw new EmailRelevanceMetadataDriverError('internal_error');
					const scores = scoreEmailRelevanceVariants({
						metadata,
						profiles: context.profiles,
						rules: context.rules
					});
					const candidates = scores
						.filter((score) => score.is_candidate)
						.map(candidateInput);
					candidateCount += candidates.length;
					const evidenceValues = [
						...metadata.participant_addresses,
						...metadata.participant_domains,
						...metadata.lexical_tokens
					];
					return {
						observation_id: observation.id,
						internal_date: metadata.internal_date,
						mailbox_inbox: metadata.mailbox_categories.inbox,
						mailbox_sent: metadata.mailbox_categories.sent,
						evidence_fingerprints: [...new Set(evidenceValues)]
							.slice(0, 32)
							.map((value) =>
								hashEmailRelevanceValue(value, {
									userId: parsed.data.user_id,
									connectionScopeId: parsed.data.connection_scope_id,
									kind: 'evidence'
								})
							),
						candidates
					};
				}
			);
			const settlement = await this.controlPlane.settleMetadataBatch({
				...parsed.data,
				expected_checkpoint: context.checkpoint_version,
				processing_token: processingToken,
				operation_id: claim.operation_id,
				actual_runtime_ms: Math.min(60_000, Math.max(0, this.now() - startedAt)),
				results
			});
			return {
				status: settlement.committed ? 'committed' : 'no_op',
				operation_code: 'metadata_batch',
				checkpoint_version: settlement.checkpoint_version,
				scope_state: settlement.scope_state,
				error_code: settlement.error_code,
				provider_calls_started: providerIds.length,
				observation_count: results.length,
				candidate_count: candidateCount
			};
		} catch (error) {
			const failure = failureCode(error, providerCallsStarted);
			const settlement = await this.controlPlane.settleOperationFailure({
				...parsed.data,
				expected_checkpoint: context.checkpoint_version,
				processing_token: processingToken,
				operation_id: claim.operation_id,
				provider_calls_started: failure.calls,
				actual_runtime_ms: Math.min(60_000, Math.max(0, this.now() - startedAt)),
				error_code: failure.code
			});
			return {
				status: settlement.committed ? 'committed' : 'no_op',
				operation_code: operation.operation_code,
				checkpoint_version: settlement.checkpoint_version,
				scope_state: settlement.scope_state,
				error_code: settlement.error_code,
				provider_calls_started: failure.calls,
				observation_count: 0,
				candidate_count: 0
			};
		}
	}
}
