import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decryptEmailRelevanceValue } from './metadata-crypto';
import {
	EmailRelevanceMetadataDriver,
	EmailRelevanceMetadataDriverError,
	type EmailRelevanceMetadataDriverContext,
	type EmailRelevanceMetadataRepository
} from './metadata-driver';
import {
	GmailRelevanceMetadataGatewayError,
	type EmailRelevanceListPage,
	type EmailRelevanceMetadataBatch,
	type GmailRelevanceMetadataGateway
} from './metadata-gateway';
import { normalizeEmailRelevanceMetadata } from './metadata-normalizer';
import type {
	EmailRelevanceCandidateInput,
	EmailRelevanceMetadataSettlementInput,
	EmailRelevanceProtectedObservationInput,
	EmailRelevanceScanControlPlane
} from './scan-control-plane';
import type { ProjectEmailProfileGroups } from './project-email-profile';
import type {
	EmailRelevanceScoringProfile,
	EmailRelevanceScoringRule
} from './metadata-scorer';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '10000000-0000-4000-8000-000000000002';
const RUN_ID = '20000000-0000-4000-8000-000000000001';
const PROJECT_ALPHA_ID = '30000000-0000-4000-8000-000000000001';
const PROJECT_BETA_ID = '30000000-0000-4000-8000-000000000002';
const SCOPE_IDS = [
	'40000000-0000-4000-8000-000000000001',
	'40000000-0000-4000-8000-000000000002',
	'40000000-0000-4000-8000-000000000003'
] as const;
const CONNECTION_IDS = [
	'50000000-0000-4000-8000-000000000001',
	'50000000-0000-4000-8000-000000000002',
	'50000000-0000-4000-8000-000000000003'
] as const;
const WINDOW_START = '2026-06-23T00:00:00.000Z';
const WINDOW_END = '2026-07-23T00:00:00.000Z';
const originalEncryptionKey = process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1;

type SyntheticMessage = {
	id: string;
	threadId: string;
	from: string;
	subject: string;
	snippet: string;
	labels?: string[];
};

type DurableObservation = EmailRelevanceProtectedObservationInput & {
	id: string;
	processing_state: 'pending' | 'processed';
	internal_date: string | null;
	evidence_fingerprints: string[];
};

type DurableCandidate = EmailRelevanceCandidateInput & {
	observation_id: string;
};

type ScopeState = {
	id: string;
	connection_id: string;
	state: 'pending' | 'leased' | 'paused' | 'cancelled' | 'expired' | 'failed' | 'completed';
	checkpoint_version: number;
	cursor_envelope: string | null;
	pending_cursor_envelope: string | null;
	pending_page_is_final: boolean;
	observations: Map<string, DurableObservation>;
	candidates: DurableCandidate[];
	list_pages_completed: number;
	observations_discovered: number;
	observations_processed: number;
	provider_calls: number;
	gmail_quota_units: number;
	runtime_ms: number;
	retries: number;
	pause_requested: boolean;
	cancel_requested: boolean;
	disconnected: boolean;
	expired: boolean;
	active_operation: {
		id: string;
		checkpoint: number;
		processing_token: string;
		operation_code: 'list_page' | 'metadata_batch';
		message_count: number;
	} | null;
};

function entry(field: string, value: string) {
	return {
		field,
		value,
		normalized_value: value.toLowerCase(),
		sources: [
			{
				source_type: 'project' as const,
				source_id: PROJECT_ALPHA_ID,
				source_field: 'invented'
			}
		],
		value_truncated: false
	};
}

function groups(overrides: Partial<ProjectEmailProfileGroups>): ProjectEmailProfileGroups {
	return {
		identity: [],
		actors: [],
		artifacts: [],
		identifiers: [],
		semantic_context: [],
		negative_evidence: [],
		user_rules: [],
		recency: [],
		...overrides
	};
}

function scoringProfiles(): EmailRelevanceScoringProfile[] {
	return [
		{
			project_id: PROJECT_ALPHA_ID,
			profile_id: '31000000-0000-4000-8000-000000000001',
			profile_version_id: '32000000-0000-4000-8000-000000000001',
			profile_version: 1,
			groups: groups({
				identity: [
					entry('alias', 'cobalt'),
					entry('product', 'launchpad'),
					entry('vocabulary', 'harbor'),
					entry('vocabulary', 'signal'),
					entry('vocabulary', 'matrix')
				],
				actors: [
					entry('email', 'pilot@alpha.test'),
					entry('domain', 'alpha.test'),
					entry('domain', 'shared.test')
				],
				artifacts: [entry('url', 'alpha.example')],
				identifiers: [entry('ticket', 'ALP-101')],
				negative_evidence: [entry('generic_term', 'blocked')]
			})
		},
		{
			project_id: PROJECT_BETA_ID,
			profile_id: '31000000-0000-4000-8000-000000000002',
			profile_version_id: '32000000-0000-4000-8000-000000000002',
			profile_version: 1,
			groups: groups({
				identity: [entry('alias', 'beta beacon')],
				actors: [
					entry('email', 'pilot@beta.test'),
					entry('domain', 'beta.test'),
					entry('domain', 'shared.test')
				],
				identifiers: [entry('ticket', 'BET-202')]
			})
		}
	];
}

function scoringRules(): EmailRelevanceScoringRule[] {
	return [
		{
			project_id: PROJECT_ALPHA_ID,
			rule_kind: 'always_thread',
			normalized_value: 'confirmed_thread'
		},
		{
			project_id: PROJECT_BETA_ID,
			rule_kind: 'always_sender',
			normalized_value: 'suppressed@beta.test'
		},
		{
			project_id: PROJECT_BETA_ID,
			rule_kind: 'never_sender',
			normalized_value: 'suppressed@beta.test'
		}
	];
}

function message(
	id: string,
	input: Partial<Omit<SyntheticMessage, 'id' | 'threadId'>> & { threadId?: string } = {}
): SyntheticMessage {
	return {
		id,
		threadId: input.threadId ?? `thread_${id}`,
		from: input.from ?? 'unmatched@outside.test',
		subject: input.subject ?? `Routine synthetic update ${id}`,
		snippet: input.snippet ?? 'No matching invented profile evidence.',
		labels: input.labels ?? ['INBOX']
	};
}

function lifecyclePages(reverse = false) {
	const meaningful = [
		message('alpha_a_only', {
			subject: 'ALP-101 blocked',
			snippet: 'The invented ticket is blocked.'
		}),
		message('alpha_ab', {
			from: 'pilot@alpha.test',
			subject: 'Invented participant update'
		}),
		message('alpha_b_only', {
			subject: 'cobalt launchpad harbor signal matrix'
		}),
		message('confirmed', {
			threadId: 'confirmed_thread',
			subject: 'Invented confirmed thread'
		}),
		message('suppressed', {
			from: 'suppressed@beta.test',
			subject: 'BET-202 should remain suppressed'
		}),
		message('ambiguous', {
			from: 'invented@shared.test',
			subject: 'Shared-domain invented update'
		}),
		message('no_match')
	];
	const filler = Array.from({ length: 47 }, (_, index) => message(`filler_${index}`));
	const firstPage = [...meaningful, ...filler, meaningful[1]!];
	const order = <T>(values: T[]) => (reverse ? [...values].reverse() : values);
	return new Map<string, Map<string, { messages: SyntheticMessage[]; next: string | null }>>([
		[
			CONNECTION_IDS[0],
			new Map([
				['first', { messages: order(firstPage), next: 'cursor_second_page' }],
				[
					'cursor_second_page',
					{
						messages: order([
							message('second_page_final', {
								from: 'pilot@beta.test',
								subject: 'BET-202 final page',
								labels: ['SENT']
							})
						]),
						next: null
					}
				]
			])
		],
		[
			CONNECTION_IDS[1],
			new Map([
				[
					'first',
					{
						messages: order([
							message('shared_provider_id', { from: 'pilot@alpha.test' }),
							message('connection_two_other')
						]),
						next: null
					}
				]
			])
		],
		[
			CONNECTION_IDS[2],
			new Map([
				[
					'first',
					{
						messages: order([
							message('shared_provider_id', { from: 'pilot@beta.test' }),
							message('connection_three_other')
						]),
						next: null
					}
				]
			])
		]
	]);
}

class SyntheticGateway {
	readonly events: Array<{
		kind: 'list' | 'metadata';
		connection_id: string;
		count: number;
	}> = [];
	beforeReturn?: (event: { kind: 'list' | 'metadata'; connection_id: string }) => void;
	failure: GmailRelevanceMetadataGatewayError | null = null;

	constructor(
		private readonly pages: Map<
			string,
			Map<string, { messages: SyntheticMessage[]; next: string | null }>
		>
	) {}

	private allMessages(connectionId: string): SyntheticMessage[] {
		return [...(this.pages.get(connectionId)?.values() ?? [])].flatMap((page) => page.messages);
	}

	async listPage(input: {
		connection_id: string;
		page_token?: string | null;
	}): Promise<EmailRelevanceListPage> {
		this.events.push({ kind: 'list', connection_id: input.connection_id, count: 1 });
		if (this.failure) throw this.failure;
		const page = this.pages.get(input.connection_id)?.get(input.page_token ?? 'first');
		if (!page) throw new GmailRelevanceMetadataGatewayError('invalid_provider_response', 1);
		this.beforeReturn?.({ kind: 'list', connection_id: input.connection_id });
		return {
			messages: page.messages.map((item) => ({
				provider_message_id: item.id,
				provider_thread_id: item.threadId
			})),
			next_page_token: page.next
		};
	}

	async getMetadataBatch(input: {
		connection_id: string;
		provider_message_ids: string[];
	}): Promise<EmailRelevanceMetadataBatch> {
		this.events.push({
			kind: 'metadata',
			connection_id: input.connection_id,
			count: input.provider_message_ids.length
		});
		if (this.failure) throw this.failure;
		const byId = new Map(this.allMessages(input.connection_id).map((item) => [item.id, item]));
		this.beforeReturn?.({ kind: 'metadata', connection_id: input.connection_id });
		return {
			messages: input.provider_message_ids.map((providerId) => {
				const item = byId.get(providerId);
				if (!item) throw new GmailRelevanceMetadataGatewayError('invalid_provider_response', 1);
				return normalizeEmailRelevanceMetadata({
					id: item.id,
					threadId: item.threadId,
					internalDate: '1784764800000',
					labelIds: item.labels,
					snippet: item.snippet,
					payload: {
						headers: [
							{ name: 'From', value: item.from },
							{ name: 'Subject', value: item.subject }
						]
					}
				});
			})
		};
	}
}

class InMemoryLifecycle implements EmailRelevanceMetadataRepository {
	readonly scopes = new Map<string, ScopeState>();
	readonly events: Array<{
		kind: 'claim' | 'settle';
		scope_id: string;
		operation_code: 'list_page' | 'metadata_batch';
	}> = [];
	private operationCounter = 0;
	private observationCounter = 0;
	private readonly profiles: EmailRelevanceScoringProfile[];
	private readonly rules: EmailRelevanceScoringRule[];

	constructor(input: { reverseProfileOrder?: boolean } = {}) {
		this.profiles = input.reverseProfileOrder
			? scoringProfiles().reverse()
			: scoringProfiles();
		this.rules = input.reverseProfileOrder ? scoringRules().reverse() : scoringRules();
		SCOPE_IDS.forEach((scopeId, index) => {
			this.scopes.set(scopeId, {
				id: scopeId,
				connection_id: CONNECTION_IDS[index]!,
				state: 'pending',
				checkpoint_version: 0,
				cursor_envelope: null,
				pending_cursor_envelope: null,
				pending_page_is_final: false,
				observations: new Map(),
				candidates: [],
				list_pages_completed: 0,
				observations_discovered: 0,
				observations_processed: 0,
				provider_calls: 0,
				gmail_quota_units: 0,
				runtime_ms: 0,
				retries: 0,
				pause_requested: false,
				cancel_requested: false,
				disconnected: false,
				expired: false,
				active_operation: null
			});
		});
	}

	private scope(input: { user_id: string; run_id: string; connection_scope_id: string }) {
		if (input.user_id !== USER_ID || input.run_id !== RUN_ID) {
			throw new EmailRelevanceMetadataDriverError('scope_unavailable');
		}
		const scope = this.scopes.get(input.connection_scope_id);
		if (!scope) throw new EmailRelevanceMetadataDriverError('scope_unavailable');
		return scope;
	}

	async loadContext(input: {
		user_id: string;
		run_id: string;
		connection_scope_id: string;
	}): Promise<EmailRelevanceMetadataDriverContext> {
		const scope = this.scope(input);
		return {
			connection_id: scope.connection_id,
			window_start: WINDOW_START,
			window_end: WINDOW_END,
			checkpoint_version: scope.checkpoint_version,
			cursor_envelope: scope.cursor_envelope,
			message_cap: 1_000,
			observations_discovered: scope.observations_discovered,
			pending_observations: [...scope.observations.values()]
				.filter((observation) => observation.processing_state === 'pending')
				.slice(0, 50)
				.map((observation) => ({
					id: observation.id,
					provider_message_id_ciphertext: observation.provider_message_id_ciphertext
				})),
			profiles: this.profiles,
			rules: this.rules
		};
	}

	async claimOperation(input: {
		user_id: string;
		run_id: string;
		connection_scope_id: string;
		expected_checkpoint: number;
		processing_token: string;
		operation: { operation_code: 'list_page' } | { operation_code: 'metadata_batch'; message_count: number };
	}) {
		const scope = this.scope(input);
		const operationCode = input.operation.operation_code;
		this.events.push({ kind: 'claim', scope_id: scope.id, operation_code: operationCode });
		if (scope.pause_requested) {
			scope.state = 'paused';
			return this.denied(scope, 'paused');
		}
		if (scope.cancel_requested || scope.disconnected) {
			scope.state = 'cancelled';
			return this.denied(scope, 'cancelled');
		}
		if (scope.expired) {
			scope.state = 'expired';
			return this.denied(scope, 'expired');
		}
		if (
			['completed', 'cancelled', 'expired', 'failed'].includes(scope.state) ||
			input.expected_checkpoint !== scope.checkpoint_version
		) {
			return this.denied(scope, 'stale_checkpoint');
		}
		const pendingCount = [...scope.observations.values()].filter(
			(observation) => observation.processing_state === 'pending'
		).length;
		if (
			(operationCode === 'list_page' && pendingCount > 0) ||
			(operationCode === 'metadata_batch' &&
				(input.operation.message_count < 1 || input.operation.message_count > Math.min(50, pendingCount)))
		) {
			return this.denied(scope, 'invalid_operation');
		}
		const messageCount = operationCode === 'metadata_batch' ? input.operation.message_count : 0;
		const reservedQuota = operationCode === 'list_page' ? 5 : messageCount * 20;
		const reservedRuntime = operationCode === 'list_page' ? 15_000 : 60_000;
		if (
			scope.list_pages_completed >= 10 ||
			scope.gmail_quota_units + reservedQuota > 20_050 ||
			scope.runtime_ms + reservedRuntime > 1_200_000
		) {
			scope.state = 'failed';
			return this.denied(scope, 'budget_exceeded');
		}
		this.operationCounter += 1;
		const operationId = `60000000-0000-4000-8000-${String(this.operationCounter).padStart(12, '0')}`;
		scope.active_operation = {
			id: operationId,
			checkpoint: scope.checkpoint_version,
			processing_token: input.processing_token,
			operation_code: operationCode,
			message_count: messageCount
		};
		scope.state = 'leased';
		return {
			claimed: true,
			operation_id: operationId,
			checkpoint_version: scope.checkpoint_version,
			scope_state: scope.state,
			error_code: null,
			reservation: {
				operation_code: operationCode,
				gmail_quota_units: reservedQuota,
				runtime_ms: reservedRuntime,
				message_count: messageCount
			}
		};
	}

	private denied(scope: ScopeState, errorCode: string) {
		return {
			claimed: false,
			operation_id: null,
			checkpoint_version: scope.checkpoint_version,
			scope_state: scope.state,
			error_code: errorCode,
			reservation: {
				operation_code: 'list_page' as const,
				gmail_quota_units: 5,
				runtime_ms: 15_000,
				message_count: 0
			}
		};
	}

	private active(input: {
		user_id: string;
		run_id: string;
		connection_scope_id: string;
		expected_checkpoint: number;
		processing_token: string;
		operation_id: string;
	}) {
		const scope = this.scope(input);
		const operation = scope.active_operation;
		if (
			!operation ||
			operation.id !== input.operation_id ||
			operation.checkpoint !== input.expected_checkpoint ||
			operation.processing_token !== input.processing_token ||
			scope.checkpoint_version !== input.expected_checkpoint
		) {
			return { scope, operation: null };
		}
		return { scope, operation };
	}

	private settleNoOp(scope: ScopeState) {
		return {
			committed: false,
			checkpoint_version: scope.checkpoint_version,
			scope_state: scope.state,
			error_code: 'stale_checkpoint'
		};
	}

	private finishSettlement(scope: ScopeState, operationCode: 'list_page' | 'metadata_batch') {
		scope.checkpoint_version += 1;
		scope.active_operation = null;
		this.events.push({ kind: 'settle', scope_id: scope.id, operation_code: operationCode });
		const pending = [...scope.observations.values()].some(
			(observation) => observation.processing_state === 'pending'
		);
		if (!pending && (scope.pending_cursor_envelope || scope.pending_page_is_final)) {
			scope.cursor_envelope = scope.pending_cursor_envelope;
			scope.pending_cursor_envelope = null;
			if (scope.pending_page_is_final) scope.state = 'completed';
			else scope.state = 'pending';
			scope.pending_page_is_final = false;
		} else {
			scope.state = 'pending';
		}
		if (scope.pause_requested) scope.state = 'paused';
		if (scope.cancel_requested || scope.disconnected) scope.state = 'cancelled';
		if (scope.expired) scope.state = 'expired';
		return {
			committed: true,
			checkpoint_version: scope.checkpoint_version,
			scope_state: scope.state,
			error_code: null
		};
	}

	async settleListPage(input: {
		user_id: string;
		run_id: string;
		connection_scope_id: string;
		expected_checkpoint: number;
		processing_token: string;
		operation_id: string;
		actual_runtime_ms: number;
		observations: EmailRelevanceProtectedObservationInput[];
		next_cursor_envelope: string | null;
	}) {
		const { scope, operation } = this.active(input);
		if (!operation || operation.operation_code !== 'list_page') return this.settleNoOp(scope);
		for (const observation of input.observations) {
			if (scope.observations.has(observation.provider_message_id_hash)) continue;
			this.observationCounter += 1;
			scope.observations.set(observation.provider_message_id_hash, {
				...observation,
				id: `70000000-0000-4000-8000-${String(this.observationCounter).padStart(12, '0')}`,
				processing_state: 'pending',
				internal_date: null,
				evidence_fingerprints: []
			});
			scope.observations_discovered += 1;
		}
		scope.pending_cursor_envelope = input.next_cursor_envelope;
		scope.pending_page_is_final = input.next_cursor_envelope === null;
		scope.list_pages_completed += 1;
		scope.provider_calls += 1;
		scope.gmail_quota_units += 5;
		scope.runtime_ms += input.actual_runtime_ms;
		return this.finishSettlement(scope, 'list_page');
	}

	async settleMetadataBatch(input: {
		user_id: string;
		run_id: string;
		connection_scope_id: string;
		expected_checkpoint: number;
		processing_token: string;
		operation_id: string;
		actual_runtime_ms: number;
		results: EmailRelevanceMetadataSettlementInput[];
	}) {
		const { scope, operation } = this.active(input);
		if (!operation || operation.operation_code !== 'metadata_batch') return this.settleNoOp(scope);
		for (const result of input.results) {
			const observation = [...scope.observations.values()].find(
				(candidate) => candidate.id === result.observation_id
			);
			if (!observation || observation.processing_state !== 'pending') continue;
			observation.processing_state = 'processed';
			observation.internal_date = result.internal_date;
			observation.evidence_fingerprints = [...result.evidence_fingerprints];
			scope.observations_processed += 1;
			for (const candidate of result.candidates) {
				const duplicate = scope.candidates.some(
					(existing) =>
						existing.observation_id === observation.id &&
						existing.project_id === candidate.project_id &&
						existing.variant === candidate.variant
				);
				if (!duplicate) scope.candidates.push({ observation_id: observation.id, ...candidate });
			}
		}
		scope.provider_calls += input.results.length;
		scope.gmail_quota_units += input.results.length * 20;
		scope.runtime_ms += input.actual_runtime_ms;
		return this.finishSettlement(scope, 'metadata_batch');
	}

	async settleOperationFailure(input: {
		user_id: string;
		run_id: string;
		connection_scope_id: string;
		expected_checkpoint: number;
		processing_token: string;
		operation_id: string;
		provider_calls_started: number;
		actual_runtime_ms: number;
		error_code: string;
	}) {
		const { scope, operation } = this.active(input);
		if (!operation) return this.settleNoOp(scope);
		scope.provider_calls += input.provider_calls_started;
		scope.gmail_quota_units +=
			operation.operation_code === 'list_page'
				? input.provider_calls_started * 5
				: input.provider_calls_started * 20;
		scope.runtime_ms += input.actual_runtime_ms;
		scope.retries += 1;
		scope.active_operation = null;
		if (scope.retries >= 3) scope.state = 'failed';
		else scope.state = 'pending';
		return {
			committed: true,
			checkpoint_version: scope.checkpoint_version,
			scope_state: scope.state,
			error_code: input.error_code
		};
	}

	controlPlane(): EmailRelevanceScanControlPlane {
		return this as unknown as EmailRelevanceScanControlPlane;
	}

	aggregateState() {
		const states = [...this.scopes.values()].map((scope) => scope.state);
		return states.every((state) => state === 'completed') ? 'completed' : 'running';
	}

	durableReceipt() {
		return [...this.scopes.values()].map((scope) => ({
			scope_id: scope.id,
			connection_id: scope.connection_id,
			state: scope.state,
			checkpoint_version: scope.checkpoint_version,
			list_pages_completed: scope.list_pages_completed,
			observations_discovered: scope.observations_discovered,
			observations_processed: scope.observations_processed,
			provider_calls: scope.provider_calls,
			gmail_quota_units: scope.gmail_quota_units,
			runtime_ms: scope.runtime_ms,
			retries: scope.retries,
			observations: [...scope.observations.values()],
			candidates: scope.candidates
		}));
	}

	candidateSignatures() {
		return [...this.scopes.values()]
			.flatMap((scope) =>
				scope.candidates.map((candidate) => {
					const observation = [...scope.observations.entries()].find(
						([, value]) => value.id === candidate.observation_id
					);
					return JSON.stringify({
						scope_id: scope.id,
						provider_hash: observation?.[0],
						...candidate,
						observation_id: undefined
					});
				})
			)
			.sort();
	}
}

function driver(input: {
	lifecycle: InMemoryLifecycle;
	gateway: SyntheticGateway;
}) {
	let tokenCounter = 0;
	let clock = 1_000;
	return new EmailRelevanceMetadataDriver({
		controlPlane: input.lifecycle.controlPlane(),
		gateway: input.gateway as unknown as GmailRelevanceMetadataGateway,
		repository: input.lifecycle,
		processingToken: () => {
			tokenCounter += 1;
			return `80000000-0000-4000-8000-${String(tokenCounter).padStart(12, '0')}`;
		},
		now: () => {
			clock += 10;
			return clock;
		}
	});
}

async function runToTerminal(input: {
	lifecycle: InMemoryLifecycle;
	gateway: SyntheticGateway;
}) {
	const executor = driver(input);
	for (let pass = 0; pass < 30; pass += 1) {
		for (const scopeId of SCOPE_IDS) {
			const scope = input.lifecycle.scopes.get(scopeId)!;
			if (scope.state === 'completed') continue;
			await executor.runOneOperation({
				user_id: USER_ID,
				run_id: RUN_ID,
				connection_scope_id: scopeId
			});
		}
		if (input.lifecycle.aggregateState() === 'completed') return;
	}
	throw new Error('Synthetic lifecycle did not terminate');
}

beforeAll(() => {
	process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1 =
		'invented-lifecycle-encryption-key-with-at-least-32-bytes';
});

afterAll(() => {
	if (originalEncryptionKey === undefined) {
		delete process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1;
	} else {
		process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1 = originalEncryptionKey;
	}
});

describe('EmailRelevanceMetadataDriver three-connection lifecycle', () => {
	it('completes list, multi-batch fetch, score, and settle with isolated durable checkpoints', async () => {
		const lifecycle = new InMemoryLifecycle();
		const gateway = new SyntheticGateway(lifecyclePages());
		await runToTerminal({ lifecycle, gateway });

		expect(lifecycle.aggregateState()).toBe('completed');
		const receipt = lifecycle.durableReceipt();
		expect(receipt.map((scope) => scope.state)).toEqual([
			'completed',
			'completed',
			'completed'
		]);
		expect(receipt[0]).toMatchObject({
			list_pages_completed: 2,
			observations_discovered: 55,
			observations_processed: 55,
			provider_calls: 57,
			gmail_quota_units: 1_110
		});
		expect(receipt.slice(1).map((scope) => scope.list_pages_completed)).toEqual([1, 1]);
		expect(gateway.events.filter((event) => event.kind === 'metadata')[0]?.count).toBe(50);
		expect(gateway.events.every((event) => event.count <= (event.kind === 'list' ? 1 : 50))).toBe(
			true
		);

		for (const scope of receipt) {
			expect(scope.list_pages_completed).toBeLessThanOrEqual(10);
			expect(scope.observations_discovered).toBeLessThanOrEqual(1_000);
			expect(scope.observations_processed).toBe(scope.observations_discovered);
			expect(scope.observations.every((observation) => observation.processing_state === 'processed')).toBe(
				true
			);
			expect(
				scope.observations.every(
					(observation) =>
						observation.provider_message_id_ciphertext.startsWith(
							'enc:gmail-relevance:v1.'
						) &&
						observation.provider_thread_id_ciphertext.startsWith(
							'enc:gmail-relevance:v1.'
						)
				)
			).toBe(true);
		}

		const alphaCandidates = receipt[0]!.candidates.filter(
			(candidate) => candidate.project_id === PROJECT_ALPHA_ID
		);
		const candidatesForProvider = (providerId: string) => {
			const scope = lifecycle.scopes.get(SCOPE_IDS[0])!;
			const observation = [...scope.observations.values()].find(
				(candidate) =>
					decryptEmailRelevanceValue(candidate.provider_message_id_ciphertext, {
						userId: USER_ID,
						connectionScopeId: scope.id,
						kind: 'provider_message'
					}) === providerId
			);
			return scope.candidates.filter(
				(candidate) => candidate.observation_id === observation?.id
			);
		};
		expect(
			candidatesForProvider('alpha_a_only')
				.filter((candidate) => candidate.project_id === PROJECT_ALPHA_ID)
				.map((candidate) => candidate.variant)
		).toEqual(['a']);
		expect(
			candidatesForProvider('alpha_ab')
				.filter((candidate) => candidate.project_id === PROJECT_ALPHA_ID)
				.map((candidate) => candidate.variant)
		).toEqual(['a', 'b']);
		expect(
			candidatesForProvider('alpha_b_only')
				.filter((candidate) => candidate.project_id === PROJECT_ALPHA_ID)
				.map((candidate) => candidate.variant)
		).toEqual(['b']);
		expect(
			new Set(candidatesForProvider('ambiguous').map((candidate) => candidate.project_id))
		).toEqual(new Set([PROJECT_ALPHA_ID, PROJECT_BETA_ID]));
		expect(candidatesForProvider('suppressed')).toEqual([]);
		expect(candidatesForProvider('no_match')).toEqual([]);
		expect(alphaCandidates.some((candidate) => candidate.variant === 'a' && candidate.identifier_overlap)).toBe(
			true
		);
		expect(alphaCandidates.some((candidate) => candidate.variant === 'b' && candidate.lexical_overlap)).toBe(
			true
		);
		expect(
			alphaCandidates.some(
				(candidate) => candidate.variant === 'a' && candidate.confirmed_thread
			)
		).toBe(true);
		expect(
			receipt[0]!.candidates.some(
				(candidate) => candidate.project_id === PROJECT_BETA_ID && candidate.explicit_rule
			)
		).toBe(false);

		const eventKinds = lifecycle.events.map((event) => `${event.scope_id}:${event.kind}:${event.operation_code}`);
		for (const gatewayEvent of gateway.events) {
			const scopeId = SCOPE_IDS[CONNECTION_IDS.indexOf(gatewayEvent.connection_id as never)]!;
			const operationCode = gatewayEvent.kind === 'list' ? 'list_page' : 'metadata_batch';
			expect(eventKinds).toContain(`${scopeId}:claim:${operationCode}`);
		}

		const durable = JSON.stringify(receipt);
		for (const restricted of [
			'alpha_a_only',
			'cursor_second_page',
			'pilot@alpha.test',
			'cobalt launchpad harbor signal matrix',
			'ALP-101 blocked'
		]) {
			expect(durable).not.toContain(restricted);
		}
	});

	it('promotes an encrypted page cursor only after every observation on the page is drained', async () => {
		const lifecycle = new InMemoryLifecycle();
		const gateway = new SyntheticGateway(lifecyclePages());
		const executor = driver({ lifecycle, gateway });
		const scope = lifecycle.scopes.get(SCOPE_IDS[0])!;
		const runOne = () =>
			executor.runOneOperation({
				user_id: USER_ID,
				run_id: RUN_ID,
				connection_scope_id: SCOPE_IDS[0]
			});

		await runOne();
		expect(scope.cursor_envelope).toBeNull();
		expect(scope.pending_cursor_envelope).toMatch(/^enc:gmail-relevance:v1\./);
		expect(scope.observations_discovered).toBe(54);

		await runOne();
		expect(scope.observations_processed).toBe(50);
		expect(scope.cursor_envelope).toBeNull();
		expect(scope.pending_cursor_envelope).toMatch(/^enc:gmail-relevance:v1\./);

		await runOne();
		expect(scope.observations_processed).toBe(54);
		expect(scope.pending_cursor_envelope).toBeNull();
		expect(scope.cursor_envelope).toMatch(/^enc:gmail-relevance:v1\./);
		expect(
			decryptEmailRelevanceValue(scope.cursor_envelope!, {
				userId: USER_ID,
				connectionScopeId: scope.id,
				kind: 'page_cursor'
			})
		).toBe('cursor_second_page');
	});

	it('produces identical candidates and evidence when provider/profile input ordering changes', async () => {
		const forward = new InMemoryLifecycle();
		const reversed = new InMemoryLifecycle({ reverseProfileOrder: true });
		await runToTerminal({ lifecycle: forward, gateway: new SyntheticGateway(lifecyclePages()) });
		await runToTerminal({
			lifecycle: reversed,
			gateway: new SyntheticGateway(lifecyclePages(true))
		});

		expect(reversed.candidateSignatures()).toEqual(forward.candidateSignatures());
	});

	it('denies wrong-user and paused claims before any provider call, then resumes from the checkpoint', async () => {
		const lifecycle = new InMemoryLifecycle();
		const gateway = new SyntheticGateway(lifecyclePages());
		const executor = driver({ lifecycle, gateway });

		await expect(
			executor.runOneOperation({
				user_id: OTHER_USER_ID,
				run_id: RUN_ID,
				connection_scope_id: SCOPE_IDS[0]
			})
		).rejects.toEqual(
			expect.objectContaining<EmailRelevanceMetadataDriverError>({ code: 'scope_unavailable' })
		);
		const scope = lifecycle.scopes.get(SCOPE_IDS[0])!;
		scope.pause_requested = true;
		const paused = await executor.runOneOperation({
			user_id: USER_ID,
			run_id: RUN_ID,
			connection_scope_id: SCOPE_IDS[0]
		});
		expect(paused).toMatchObject({ status: 'no_op', provider_calls_started: 0 });
		expect(gateway.events).toEqual([]);

		scope.pause_requested = false;
		scope.state = 'pending';
		const resumed = await executor.runOneOperation({
			user_id: USER_ID,
			run_id: RUN_ID,
			connection_scope_id: SCOPE_IDS[0]
		});
		expect(resumed).toMatchObject({ status: 'committed', operation_code: 'list_page' });
		expect(scope.checkpoint_version).toBe(1);
		expect(gateway.events).toHaveLength(1);
	});

	it.each([
		'provider_timeout',
		'provider_rejected',
		'provider_response_too_large',
		'invalid_provider_response'
	] as const)('settles %s through a fixed code without advancing the cursor', async (code) => {
		const lifecycle = new InMemoryLifecycle();
		const gateway = new SyntheticGateway(lifecyclePages());
		gateway.failure = new GmailRelevanceMetadataGatewayError(code, 1);
		const result = await driver({ lifecycle, gateway }).runOneOperation({
			user_id: USER_ID,
			run_id: RUN_ID,
			connection_scope_id: SCOPE_IDS[0]
		});
		const scope = lifecycle.scopes.get(SCOPE_IDS[0])!;

		expect(result).toMatchObject({
			status: 'committed',
			error_code: code,
			provider_calls_started: 1
		});
		expect(scope.checkpoint_version).toBe(0);
		expect(scope.cursor_envelope).toBeNull();
		expect(scope.observations_discovered).toBe(0);
		expect(JSON.stringify(result)).not.toContain('messages');
	});

	it('settles an in-flight page once after pause and makes the next operation a no-op', async () => {
		const lifecycle = new InMemoryLifecycle();
		const gateway = new SyntheticGateway(lifecyclePages());
		const scope = lifecycle.scopes.get(SCOPE_IDS[0])!;
		gateway.beforeReturn = () => {
			scope.pause_requested = true;
		};
		const executor = driver({ lifecycle, gateway });

		const inFlight = await executor.runOneOperation({
			user_id: USER_ID,
			run_id: RUN_ID,
			connection_scope_id: SCOPE_IDS[0]
		});
		const next = await executor.runOneOperation({
			user_id: USER_ID,
			run_id: RUN_ID,
			connection_scope_id: SCOPE_IDS[0]
		});

		expect(inFlight.status).toBe('committed');
		expect(scope.state).toBe('paused');
		expect(next).toMatchObject({ status: 'no_op', provider_calls_started: 0 });
		expect(gateway.events).toHaveLength(1);
	});

	it.each([
		['cancel_requested', 'cancelled'],
		['expired', 'expired'],
		['disconnected', 'cancelled']
	] as const)('stops %s scopes before another provider call', async (flag, expectedState) => {
		const lifecycle = new InMemoryLifecycle();
		const gateway = new SyntheticGateway(lifecyclePages());
		const scope = lifecycle.scopes.get(SCOPE_IDS[0])!;
		scope[flag] = true;

		const result = await driver({ lifecycle, gateway }).runOneOperation({
			user_id: USER_ID,
			run_id: RUN_ID,
			connection_scope_id: SCOPE_IDS[0]
		});

		expect(result).toMatchObject({ status: 'no_op', provider_calls_started: 0 });
		expect(scope.state).toBe(expectedState);
		expect(gateway.events).toEqual([]);
	});

	it('denies exhausted quota before a provider call and exhausts retries without cursor corruption', async () => {
		const quotaLifecycle = new InMemoryLifecycle();
		const quotaGateway = new SyntheticGateway(lifecyclePages());
		quotaLifecycle.scopes.get(SCOPE_IDS[0])!.gmail_quota_units = 20_050;
		const denied = await driver({ lifecycle: quotaLifecycle, gateway: quotaGateway }).runOneOperation({
			user_id: USER_ID,
			run_id: RUN_ID,
			connection_scope_id: SCOPE_IDS[0]
		});
		expect(denied).toMatchObject({ status: 'no_op', provider_calls_started: 0 });
		expect(quotaGateway.events).toEqual([]);

		const retryLifecycle = new InMemoryLifecycle();
		const retryGateway = new SyntheticGateway(lifecyclePages());
		retryGateway.failure = new GmailRelevanceMetadataGatewayError('provider_timeout', 1);
		const retryDriver = driver({ lifecycle: retryLifecycle, gateway: retryGateway });
		for (let attempt = 0; attempt < 3; attempt += 1) {
			await retryDriver.runOneOperation({
				user_id: USER_ID,
				run_id: RUN_ID,
				connection_scope_id: SCOPE_IDS[0]
			});
		}
		const failedScope = retryLifecycle.scopes.get(SCOPE_IDS[0])!;
		expect(failedScope).toMatchObject({
			state: 'failed',
			retries: 3,
			checkpoint_version: 0,
			cursor_envelope: null,
			observations_discovered: 0
		});
		const replay = await retryDriver.runOneOperation({
			user_id: USER_ID,
			run_id: RUN_ID,
			connection_scope_id: SCOPE_IDS[0]
		});
		expect(replay).toMatchObject({ status: 'no_op', provider_calls_started: 0 });
		expect(retryGateway.events).toHaveLength(3);
	});

	it('keeps the same raw provider ID cryptographically isolated across account scopes', async () => {
		const lifecycle = new InMemoryLifecycle();
		await runToTerminal({ lifecycle, gateway: new SyntheticGateway(lifecyclePages()) });
		const second = lifecycle.scopes.get(SCOPE_IDS[1])!;
		const third = lifecycle.scopes.get(SCOPE_IDS[2])!;
		const findShared = (scope: ScopeState) =>
			[...scope.observations.values()].find(
				(observation) =>
					decryptEmailRelevanceValue(observation.provider_message_id_ciphertext, {
						userId: USER_ID,
						connectionScopeId: scope.id,
						kind: 'provider_message'
					}) === 'shared_provider_id'
			);
		const secondShared = findShared(second)!;
		const thirdShared = findShared(third)!;

		expect(secondShared.provider_message_id_hash).not.toBe(
			thirdShared.provider_message_id_hash
		);
		expect(secondShared.provider_message_id_ciphertext).not.toBe(
			thirdShared.provider_message_id_ciphertext
		);
		expect(() =>
			decryptEmailRelevanceValue(secondShared.provider_message_id_ciphertext, {
				userId: USER_ID,
				connectionScopeId: SCOPE_IDS[2],
				kind: 'provider_message'
			})
		).toThrow();
	});
});
