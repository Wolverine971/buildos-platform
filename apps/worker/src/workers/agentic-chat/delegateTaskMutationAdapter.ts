// apps/worker/src/workers/agentic-chat/delegateTaskMutationAdapter.ts
import {
	type Database,
	type Json,
	type JsonObject,
	validateAgentRunMetadata
} from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgenticChatMutatingToolPortV1 } from './mutation-executor';
import {
	type MutationInput,
	assertMutationAdapterBoundary,
	assertMutationReceiptSize,
	canonicalMutationReceipt,
	canonicalUuid,
	isRecord,
	knownFailure,
	requestProjectId,
	requiredUuid,
	uncertainFailure
} from './mutationAdapterBoundary';
import { AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1 } from './mutationToolCatalog';
import { WorkerAgenticChatToolAccessAdapter } from './workerAccessAdapter';

const TOOL_NAME = 'delegate_task';
const MUTATION_SPEC = AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1[TOOL_NAME];
const REVIEWED_ARGUMENT_NAMES = new Set(MUTATION_SPEC.reviewedArgumentNames);
const DEFAULT_MAX_TOOL_CALLS = 30;
const MAX_TOOL_CALLS = 40;
const DEFAULT_MAX_COST_USD = 0.5;
const MAX_COST_USD = 1;

type AtomicDispatch = (args: {
	p_run: Json;
	p_job_metadata: Json;
	p_priority: number;
}) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;

/**
 * Narrow worker bridge for the Phase 4 plan-then-approve path.
 *
 * It can dispatch only a focused-project, read-write Agent Run with
 * review_required=true. The Agent Run therefore stages ProposedChanges and
 * ends at proposal_ready; this adapter never applies ontology mutations.
 * Atomic DB admission keeps the run row and queue job in one transaction.
 */
export class AgenticChatDelegateTaskMutationAdapter implements AgenticChatMutatingToolPortV1 {
	private readonly dispatch: AtomicDispatch;
	private readonly assertProjectWriteAccess: (userId: string, projectId: string) => Promise<void>;

	constructor(
		private readonly client: SupabaseClient<Database>,
		options: {
			dispatch?: AtomicDispatch;
			assertProjectWriteAccess?: (userId: string, projectId: string) => Promise<void>;
		} = {}
	) {
		this.dispatch =
			options.dispatch ??
			(async (args) => {
				const { data, error } = await this.client.rpc('create_agent_run_with_job', args);
				return { data, error };
			});
		this.assertProjectWriteAccess =
			options.assertProjectWriteAccess ??
			((userId, projectId) =>
				new WorkerAgenticChatToolAccessAdapter({
					client: this.client,
					userId
				}).assertProjectAccess(projectId, 'write'));
	}

	async execute(input: MutationInput): Promise<JsonObject> {
		assertMutationAdapterBoundary(input, {
			toolName: TOOL_NAME,
			operationName: MUTATION_SPEC.operationName,
			downstreamIdempotencySupported: MUTATION_SPEC.downstreamIdempotencySupported,
			reviewedArgumentNames: REVIEWED_ARGUMENT_NAMES
		});

		const contextProjectId = requestProjectId(input);
		const projectId = requiredUuid(input.arguments.project_id, 'project_id');
		if (contextProjectId === null || contextProjectId !== projectId) {
			throw knownFailure(
				'mutation_project_scope_mismatch',
				'delegate_task must target the exact focused project'
			);
		}

		const goal = requiredText(input.arguments.goal, 'goal', 4_000);
		const label = optionalText(input.arguments.label, 'label', 80) ?? goal.slice(0, 80);
		const instructions = optionalText(input.arguments.instructions, 'instructions', 20_000);
		const expectedOutput = optionalText(
			input.arguments.expected_output,
			'expected_output',
			4_000
		);
		const maxToolCalls = boundedInteger(
			input.arguments.max_tool_calls,
			'max_tool_calls',
			DEFAULT_MAX_TOOL_CALLS,
			MAX_TOOL_CALLS
		);
		const maxCostUsd = boundedCost(input.arguments.max_cost_usd);
		const budgets = {
			max_tool_calls: maxToolCalls,
			max_cost_usd: maxCostUsd
		};

		try {
			await this.assertProjectWriteAccess(input.executionInput.claim.userId, projectId);
		} catch (error) {
			throw knownFailure(
				'delegate_task_access_denied',
				error instanceof Error ? error.message : 'Project write access is required'
			);
		}

		const metadata = {
			run_id: input.effectId,
			trigger: 'chat' as const,
			context_type: 'project' as const,
			project_id: projectId,
			parent_run_id: null,
			depth: 0,
			scope_mode: 'read_write' as const,
			effort: 'standard' as const,
			run_template: 'agent' as const,
			allowed_ops: null,
			review_required: true,
			budgets
		};
		try {
			validateAgentRunMetadata(metadata);
		} catch (error) {
			throw knownFailure(
				'delegate_task_metadata_invalid',
				error instanceof Error ? error.message : 'Invalid Agent Run metadata'
			);
		}

		let dispatchResult: Awaited<ReturnType<AtomicDispatch>>;
		try {
			dispatchResult = await this.dispatch({
				p_run: {
					user_id: input.executionInput.claim.userId,
					trigger: 'chat',
					label,
					goal,
					instructions,
					expected_output: expectedOutput,
					context_type: 'project',
					project_id: projectId,
					scope_mode: 'read_write',
					effort: 'standard',
					run_template: 'agent',
					allowed_ops: null,
					review_required: true,
					budgets,
					parent_run_id: null,
					parent_session_id: input.executionInput.claim.sessionId,
					parent_message_id: null,
					depth: 0,
					source_suggestion_id: null,
					source_decision: null
				} as Json,
				p_job_metadata: {
					...metadata,
					// The atomic RPC replaces run_id with the real row id. A stable
					// correlation id still ties this control-plane effect to the chat effect.
					correlationId: input.effectId
				} as Json,
				p_priority: 7
			});
		} catch (error) {
			throw uncertainFailure(
				'delegate_task_dispatch_uncertain',
				error instanceof Error ? error.message : 'Agent Run dispatch outcome is unknown'
			);
		}

		if (dispatchResult.error) {
			const message = dispatchResult.error.message ?? 'Agent Run dispatch failed';
			throw knownFailure(
				message.includes('agent_run_limit_exceeded') || message.includes('slots')
					? 'delegate_task_capacity_exhausted'
					: 'delegate_task_dispatch_failed',
				message
			);
		}

		const { runId, jobId } = requireDispatchReceipt(
			dispatchResult.data,
			input.executionInput.claim.userId,
			projectId
		);
		const receipt = canonicalMutationReceipt(
			{
				ok: true,
				run_ids: [runId],
				queue_job_id: jobId,
				label,
				status: 'queued',
				context_type: 'project',
				project_id: projectId,
				scope_mode: 'read_write',
				effort: 'standard',
				run_template: 'agent',
				max_cost_usd: maxCostUsd,
				review: true,
				requires_user_action: false,
				message:
					`Dispatched background proposal agent "${label}". It can only stage changes; ` +
					'nothing will be applied until the user approves the resulting change set.'
			},
			TOOL_NAME
		);
		assertMutationReceiptSize(receipt, TOOL_NAME);
		return receipt;
	}
}

function requireDispatchReceipt(
	value: unknown,
	userId: string,
	projectId: string
): { runId: string; jobId: string } {
	if (!isRecord(value) || !isRecord(value.run)) {
		throw uncertainFailure(
			'delegate_task_receipt_invalid',
			'delegate_task returned no Agent Run receipt'
		);
	}
	const run = value.run;
	if (
		!canonicalUuid(run.id) ||
		run.user_id !== userId ||
		run.project_id !== projectId ||
		run.context_type !== 'project' ||
		run.scope_mode !== 'read_write' ||
		run.review_required !== true ||
		run.status !== 'queued'
	) {
		throw uncertainFailure(
			'delegate_task_receipt_invalid',
			'delegate_task returned a mismatched Agent Run receipt'
		);
	}
	if (!canonicalUuid(value.job_id)) {
		throw uncertainFailure(
			'delegate_task_receipt_invalid',
			'delegate_task returned no queue-job receipt'
		);
	}
	return { runId: run.id, jobId: value.job_id };
}

function requiredText(value: unknown, label: string, maxLength: number): string {
	const text = optionalText(value, label, maxLength);
	if (!text) throw knownFailure('mutation_arguments_not_admitted', `${label} is required`);
	return text;
}

function optionalText(value: unknown, label: string, maxLength: number): string | null {
	if (value === undefined || value === null || value === '') return null;
	if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			`${label} must be non-empty text of at most ${maxLength} characters`
		);
	}
	return value.trim();
}

function boundedInteger(value: unknown, label: string, fallback: number, maximum: number): number {
	if (value === undefined || value === null) return fallback;
	if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > maximum) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			`${label} must be an integer from 1 to ${maximum}`
		);
	}
	return Number(value);
}

function boundedCost(value: unknown): number {
	if (value === undefined || value === null) return DEFAULT_MAX_COST_USD;
	if (
		typeof value !== 'number' ||
		!Number.isFinite(value) ||
		value <= 0 ||
		value > MAX_COST_USD
	) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			`max_cost_usd must be greater than 0 and no more than $${MAX_COST_USD}`
		);
	}
	return value;
}
