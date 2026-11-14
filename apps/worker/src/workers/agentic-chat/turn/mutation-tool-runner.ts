// apps/worker/src/workers/agentic-chat/turn/mutation-tool-runner.ts
//
// Runs one reviewed provider mutation: the durable tool_call / tool_result
// pair, the committed-effect receipt, the read-epoch advance, the structural
// retry cap for calls that already failed permanently this turn, and the
// dependency-failure receipts for batch calls whose prerequisites failed.
import { extractContextShiftPayload } from '@buildos/agentic-chat-runtime/loop';
import type { ChatToolResult, JsonObject } from '@buildos/shared-types';
import { AgenticChatEffectExecutionError } from '../mutations/mutation-executor';
import type {
	AgenticChatProviderFailedToolSynthesisInputV1,
	AgenticChatProviderMutationSynthesisInputV1
} from '../provider/contracts';
import { createStableAgenticChatToolExecutionIdV1 } from '../tools/tool-execution';
import { abortable, throwIfAborted } from '../shared/abortable-deadline';
import { createStableAgenticChatReadToolTransitionIdV1 } from '../tools/read-tool-identity';
import type {
	AgenticChatTurnExecutorPorts,
	AgenticChatTurnProviderStepV1
} from './executor-contracts';
import { canonicalText, canonicalUuid, elapsedMs } from './executor-helpers';
import {
	AgenticChatCommittedEffectPersistError,
	errorMessage,
	executionErrorCode
} from './executor-failures';
import {
	type AgenticChatExecutableToolStepV1,
	type AgenticChatReadPlanningContextV1,
	DEFAULT_RUNNING_ACTIVITY,
	type KnownMutationFailure,
	MUTATING_TOOL_ACTIVITY,
	READ_TOOL_ACTIVITY,
	type TerminalContextState,
	type TurnRun,
	providerToolCall,
	recordTerminalToolExecution
} from './turn-run';
import type { AgenticChatTurnRunServices } from './turn-run-services';

export class AgenticChatMutationToolRunner {
	constructor(
		private readonly ports: Pick<AgenticChatTurnExecutorPorts, 'mutation' | 'toolExecutions'>,
		private readonly services: AgenticChatTurnRunServices
	) {}

	async execute(
		run: TurnRun,
		step: Extract<AgenticChatTurnProviderStepV1, { type: 'mutating_tool' }>,
		sequenceIndex: number,
		planning: AgenticChatReadPlanningContextV1,
		signal: AbortSignal
	): Promise<
		AgenticChatProviderMutationSynthesisInputV1 | AgenticChatProviderFailedToolSynthesisInputV1
	> {
		const { executionInput, processingToken, projection, terminalContext } = run;
		const { readInvalidationEpoch, markToolExecution } = run;
		canonicalUuid(step.callTransitionId, 'callTransitionId');
		canonicalUuid(step.resultTransitionId, 'resultTransitionId');
		canonicalUuid(step.logicalOperationId, 'logicalOperationId');
		if (!canonicalText(step.providerToolCallId, 512)) {
			throw new Error('Fixture provider tool-call id is invalid');
		}
		if (!canonicalText(step.toolName, 256)) throw new Error('Fixture tool name is invalid');
		if (!canonicalText(step.operationName, 256)) {
			throw new Error('Fixture operation name is invalid');
		}
		if (typeof step.downstreamIdempotencySupported !== 'boolean') {
			throw new Error('Fixture downstream idempotency capability is invalid');
		}

		await this.services.publishSemantic(
			executionInput,
			projection,
			{
				type: 'semantic',
				transitionId: step.callTransitionId,
				phase: 'tool',
				eventType: 'tool_call',
				currentActivity: MUTATING_TOOL_ACTIVITY,
				eventPayload: {
					type: 'tool_call',
					tool_call: {
						id: step.providerToolCallId,
						type: 'function',
						function: {
							name: step.toolName,
							arguments: JSON.stringify(step.arguments)
						}
					},
					// The user's words this write came from (tasker 155), display only.
					...(step.sourceQuote ? { source_quote: step.sourceQuote } : {})
				}
			},
			signal
		);
		const mutationStartedAt = Date.now();
		this.services.observeToolExecution(
			executionInput,
			processingToken,
			step,
			sequenceIndex,
			planning,
			'tool_execution_started',
			{
				tool_name: step.toolName,
				provider_tool_call_id: step.providerToolCallId,
				sequence_index: sequenceIndex
			},
			signal
		);
		// Structural retry cap: a call that already failed permanently this turn
		// is answered deterministically without reserving an effect or running
		// the adapter, so a model that keeps re-issuing it cannot burn the turn.
		const cappedRetry = findPermanentMutationFailureCap(terminalContext, step);
		if (cappedRetry) {
			return this.persistKnownMutationFailure(
				run,
				step,
				cappedRetry,
				sequenceIndex,
				planning,
				mutationStartedAt,
				signal
			);
		}
		let mutation;
		try {
			mutation = await this.ports.mutation.execute({
				executionInput,
				processingToken,
				step: {
					logicalOperationId: step.logicalOperationId,
					providerToolCallId: step.providerToolCallId,
					toolName: step.toolName,
					operationName: step.operationName,
					arguments: step.arguments,
					downstreamIdempotencySupported: step.downstreamIdempotencySupported
				},
				signal,
				lease: run.lease
			});
		} catch (error) {
			if (
				error instanceof AgenticChatEffectExecutionError &&
				error.failureClass === 'uncertain_external_commit'
			) {
				// Effect reconciliation is authoritative. Carry only its uncertain
				// disposition and exact attempted arguments into the terminal receipt;
				// this is not a success or permission to retry the effect.
				recordTerminalToolExecution(
					terminalContext,
					sequenceIndex,
					providerToolCall(step),
					{
						tool_call_id: step.providerToolCallId,
						success: false,
						error: 'The attempted change has an uncertain outcome. Reconcile it before retrying.',
						result: {
							effect_outcome: 'uncertain',
							effect_id: error.effectId,
							failure_code: error.failureCode
						}
					}
				);
			}
			if (
				!(error instanceof AgenticChatEffectExecutionError) ||
				error.failureClass !== 'permanent'
			) {
				this.services.observeToolExecution(
					executionInput,
					processingToken,
					step,
					sequenceIndex,
					planning,
					'tool_execution_ended',
					{
						tool_name: step.toolName,
						provider_tool_call_id: step.providerToolCallId,
						sequence_index: sequenceIndex,
						status: signal.aborted ? 'aborted' : 'failure',
						duration_ms: elapsedMs(mutationStartedAt),
						error_code: executionErrorCode(error, signal),
						replayed: false
					},
					signal
				);
				throw error;
			}
			return this.persistKnownMutationFailure(
				run,
				step,
				{
					effectId: error.effectId,
					message: errorMessage(error),
					observationErrorCode: 'known_mutation_failure',
					toolLevel: !error.retryable && isToolLevelPermanentMutationFailure(error),
					retryable: error.retryable
				},
				sequenceIndex,
				planning,
				mutationStartedAt,
				signal
			);
		}
		const telemetry = deriveMutationTelemetry(
			step,
			mutation.downstreamReceipt,
			elapsedMs(mutationStartedAt)
		);
		// The words this write came from are kept with the record it touched, so the chat can
		// light the phrase up again after a reload. The domain arguments never carry them.
		const storedAffectedEntities = withSourceQuote(
			telemetry.affectedEntities,
			step.sourceQuote
		);
		// A committed effect must become durable telemetry even if cancellation
		// arrives after the irreversible boundary. The ledger adapter owns its own
		// bounded deadline; a fresh signal prevents user cancellation from hiding
		// an already-committed mutation receipt.
		try {
			await this.ports.toolExecutions.persistMutation(
				{
					turnRunId: executionInput.claim.turnRunId,
					queueJobId: executionInput.claim.queueJobId,
					processingToken,
					userId: executionInput.claim.userId,
					executionGeneration: executionInput.claim.executionGeneration,
					effectId: mutation.effectId,
					canonicalArgumentHash: mutation.canonicalArgumentHash,
					toolExecutionId: createStableAgenticChatToolExecutionIdV1({
						turnRunId: executionInput.claim.turnRunId,
						sequenceIndex
					}),
					sequenceIndex,
					providerToolCallId: step.providerToolCallId,
					toolName: step.toolName,
					operationName: step.operationName,
					arguments: step.arguments,
					executionTimeMs: telemetry.executionTimeMs,
					tokensConsumed: telemetry.tokensConsumed,
					requiresUserAction: telemetry.requiresUserAction,
					affectedEntities: storedAffectedEntities
				},
				new AbortController().signal
			);
		} catch (error) {
			// The effect committed at the gateway; only its receipt row failed. The
			// partial-completion lane must not read this as "not done" and disclose
			// a write that happened (review of AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08
			// F56). Tag it so the terminal path keeps the failure route.
			throw new AgenticChatCommittedEffectPersistError(mutation.effectId, error);
		}
		const chatToolResult: ChatToolResult = {
			tool_call_id: step.providerToolCallId,
			result: mutation.downstreamReceipt,
			success: true
		};
		// Advance only after the committed mutation receipt is durable. Reads in
		// the same concurrent layer remain on the pre-mutation snapshot; later
		// layers and provider rounds are attributed to the invalidated epoch.
		readInvalidationEpoch.value += 1;
		recordTerminalToolExecution(
			terminalContext,
			sequenceIndex,
			providerToolCall(step),
			chatToolResult
		);
		markToolExecution();
		this.services.observeToolExecution(
			executionInput,
			processingToken,
			step,
			sequenceIndex,
			planning,
			'tool_execution_ended',
			{
				tool_name: step.toolName,
				provider_tool_call_id: step.providerToolCallId,
				sequence_index: sequenceIndex,
				status: 'success',
				duration_ms: elapsedMs(mutationStartedAt),
				error_code: null,
				replayed: mutation.replayed
			},
			signal
		);
		const contextShift = extractContextShiftPayload(chatToolResult);
		if (contextShift) {
			await this.services.persistSessionHandoff(
				executionInput,
				processingToken,
				contextShift
			);
		}
		throwIfAborted(signal);
		await this.services.publishSemantic(
			executionInput,
			projection,
			{
				type: 'semantic',
				transitionId: step.resultTransitionId,
				phase: 'tool',
				eventType: 'tool_result',
				currentActivity: DEFAULT_RUNNING_ACTIVITY,
				eventPayload: {
					type: 'tool_result',
					result: {
						tool_call_id: step.providerToolCallId,
						tool_name: step.toolName,
						success: true,
						tool_category: mutationToolCategory(step),
						gateway_op: step.operationName,
						// True when nothing was saved yet: the person has to choose first.
						requires_user_action: telemetry.requiresUserAction,
						affected_entities: storedAffectedEntities,
						effect_id: mutation.effectId,
						replayed: mutation.replayed,
						result: mutation.downstreamReceipt,
						// The stored execution time, so the live row and a reload agree.
						duration_ms: telemetry.executionTimeMs,
						...(step.sourceQuote ? { source_quote: step.sourceQuote } : {})
					}
				}
			},
			signal
		);
		if (contextShift) {
			terminalContext.contextShift = contextShift;
			await this.services.publishSemantic(
				executionInput,
				projection,
				{
					type: 'semantic',
					transitionId: createStableAgenticChatReadToolTransitionIdV1({
						turnRunId: executionInput.claim.turnRunId,
						providerToolCallId: step.providerToolCallId,
						stage: 'context_shift'
					}),
					phase: 'tool',
					eventType: 'context_shift',
					currentActivity: DEFAULT_RUNNING_ACTIVITY,
					eventPayload: {
						type: 'context_shift',
						context_shift: { ...contextShift } satisfies JsonObject
					}
				},
				signal
			);
		}
		return {
			providerToolCallId: step.providerToolCallId,
			toolName: step.toolName,
			arguments: step.arguments,
			execution: {
				result: mutation.downstreamReceipt,
				executionTimeMs: telemetry.executionTimeMs,
				tokensConsumed: telemetry.tokensConsumed,
				affectedEntities: telemetry.affectedEntities,
				toolCategory: mutationToolCategory(step),
				resultCount: null,
				zeroResult: null,
				requiresUserAction: telemetry.requiresUserAction
			},
			mutation: {
				effectId: mutation.effectId,
				logicalOperationId: step.logicalOperationId,
				operationName: step.operationName,
				replayed: mutation.replayed
			}
		};
	}

	/** A batch call skipped because a prerequisite failed; records a read or a mutation step. */
	async persistDependencyFailure(
		run: TurnRun,
		step: AgenticChatExecutableToolStepV1,
		sequenceIndex: number,
		blockedBy: readonly string[],
		planning: AgenticChatReadPlanningContextV1,
		signal: AbortSignal
	): Promise<AgenticChatProviderFailedToolSynthesisInputV1> {
		const { executionInput, processingToken, projection, terminalContext, markToolExecution } =
			run;
		const error = `Skipped because prerequisite tool calls failed: ${blockedBy.join(', ')}`;
		await this.services.assertCurrentReadToolFence(executionInput, processingToken, signal);
		await this.services.publishSemantic(
			executionInput,
			projection,
			{
				type: 'semantic',
				transitionId: step.callTransitionId,
				phase: 'tool',
				eventType: 'tool_call',
				currentActivity:
					step.type === 'mutating_tool' ? MUTATING_TOOL_ACTIVITY : READ_TOOL_ACTIVITY,
				eventPayload: {
					type: 'tool_call',
					tool_call: {
						id: step.providerToolCallId,
						type: 'function',
						function: {
							name: step.toolName,
							arguments: JSON.stringify(step.arguments)
						}
					},
					// The user's words this write came from (tasker 155), display only.
					...(step.type === 'mutating_tool' && step.sourceQuote
						? { source_quote: step.sourceQuote }
						: {})
				}
			},
			signal
		);
		await abortable(
			this.ports.toolExecutions.persistFailure(
				{
					turnRunId: executionInput.claim.turnRunId,
					queueJobId: executionInput.claim.queueJobId,
					processingToken,
					userId: executionInput.claim.userId,
					executionGeneration: executionInput.claim.executionGeneration,
					failureKind: 'dependency_failed',
					toolExecutionId: createStableAgenticChatToolExecutionIdV1({
						turnRunId: executionInput.claim.turnRunId,
						sequenceIndex
					}),
					sequenceIndex,
					providerToolCallId: step.providerToolCallId,
					toolName: step.toolName,
					arguments: step.arguments,
					toolCategory: null,
					error
				},
				signal
			),
			signal
		);
		const chatToolResult: ChatToolResult = {
			tool_call_id: step.providerToolCallId,
			result: null,
			success: false,
			error
		};
		recordTerminalToolExecution(
			terminalContext,
			sequenceIndex,
			providerToolCall(step),
			chatToolResult
		);
		markToolExecution();
		this.services.observeToolExecution(
			executionInput,
			processingToken,
			step,
			sequenceIndex,
			planning,
			'tool_execution_ended',
			{
				tool_name: step.toolName,
				provider_tool_call_id: step.providerToolCallId,
				sequence_index: sequenceIndex,
				status: 'failure',
				duration_ms: 0,
				error_code: 'dependency_failed'
			},
			signal
		);
		await this.services.publishSemantic(
			executionInput,
			projection,
			{
				type: 'semantic',
				transitionId: step.resultTransitionId,
				phase: 'tool',
				eventType: 'tool_result',
				currentActivity: DEFAULT_RUNNING_ACTIVITY,
				eventPayload: {
					type: 'tool_result',
					result: {
						...chatToolResult,
						affected_entities: [],
						tool_name: step.toolName,
						blocked_by_provider_tool_call_ids: [...blockedBy]
					}
				}
			},
			signal
		);
		return {
			providerToolCallId: step.providerToolCallId,
			toolName: step.toolName,
			arguments: step.arguments,
			failure: {
				kind: 'dependency_failed',
				error,
				toolCategory: null,
				modelPayload: {
					error,
					dependency_failed: true,
					blocked_by_provider_tool_call_ids: [...blockedBy]
				}
			}
		};
	}

	private async persistKnownMutationFailure(
		run: TurnRun,
		step: Extract<AgenticChatTurnProviderStepV1, { type: 'mutating_tool' }>,
		failure: KnownMutationFailure,
		sequenceIndex: number,
		planning: AgenticChatReadPlanningContextV1,
		mutationStartedAt: number,
		signal: AbortSignal
	): Promise<AgenticChatProviderFailedToolSynthesisInputV1> {
		const { executionInput, processingToken, projection, terminalContext, markToolExecution } =
			run;
		const failureMessage = failure.message;
		const toolCategory = mutationToolCategory(step);
		// Remember the failure before any await so a concurrent call of the same
		// tool in this layer already sees the cap. A rolled-back write is not
		// permanent, so it is never capped: the model may make the call again.
		const ledger = terminalContext.permanentMutationFailures;
		if (!failure.retryable) {
			ledger.byCall.set(mutationCallKey(step), failureMessage);
			if (failure.toolLevel) ledger.byTool.set(step.toolName, failureMessage);
		}
		// The effect executor has already reconciled this attempt to durable
		// `failed`. Persist its failed tool row with an independent bounded signal
		// so a known outcome can never be mistaken for an uncertain commit.
		await this.ports.toolExecutions.persistFailure(
			{
				turnRunId: executionInput.claim.turnRunId,
				queueJobId: executionInput.claim.queueJobId,
				processingToken,
				userId: executionInput.claim.userId,
				executionGeneration: executionInput.claim.executionGeneration,
				failureKind: 'mutation',
				toolExecutionId: createStableAgenticChatToolExecutionIdV1({
					turnRunId: executionInput.claim.turnRunId,
					sequenceIndex
				}),
				sequenceIndex,
				providerToolCallId: step.providerToolCallId,
				toolName: step.toolName,
				arguments: step.arguments,
				toolCategory,
				error: failureMessage
			},
			new AbortController().signal
		);
		const chatToolResult: ChatToolResult = {
			tool_call_id: step.providerToolCallId,
			result: null,
			success: false,
			error: failureMessage
		};
		recordTerminalToolExecution(
			terminalContext,
			sequenceIndex,
			providerToolCall(step),
			chatToolResult
		);
		markToolExecution();
		this.services.observeToolExecution(
			executionInput,
			processingToken,
			step,
			sequenceIndex,
			planning,
			'tool_execution_ended',
			{
				tool_name: step.toolName,
				provider_tool_call_id: step.providerToolCallId,
				sequence_index: sequenceIndex,
				status: 'failure',
				duration_ms: elapsedMs(mutationStartedAt),
				error_code: failure.observationErrorCode,
				replayed: false
			},
			signal
		);
		throwIfAborted(signal);
		await this.services.publishSemantic(
			executionInput,
			projection,
			{
				type: 'semantic',
				transitionId: step.resultTransitionId,
				phase: 'tool',
				eventType: 'tool_result',
				currentActivity: DEFAULT_RUNNING_ACTIVITY,
				eventPayload: {
					type: 'tool_result',
					result: {
						...chatToolResult,
						affected_entities: [],
						tool_category: toolCategory,
						tool_name: step.toolName,
						gateway_op: step.operationName,
						effect_id: failure.effectId
					}
				}
			},
			signal
		);
		return {
			providerToolCallId: step.providerToolCallId,
			toolName: step.toolName,
			arguments: step.arguments,
			failure: {
				kind: 'known_execution_failure',
				error: failureMessage,
				toolCategory,
				modelPayload: { error: failureMessage }
			}
		};
	}
}

function deriveMutationTelemetry(
	step: Extract<AgenticChatTurnProviderStepV1, { type: 'mutating_tool' }>,
	downstreamReceipt: JsonObject | null,
	// Adapter wall time measured by the executor; mutation rows previously
	// persisted NULL here while read rows carried their duration.
	executionTimeMs: number
): {
	executionTimeMs: number | null;
	tokensConsumed: number | null;
	requiresUserAction: boolean;
	affectedEntities: JsonObject[];
} {
	const requiresUserAction = findRequiresUserAction(downstreamReceipt) ?? false;
	return {
		executionTimeMs,
		tokensConsumed: null,
		requiresUserAction,
		affectedEntities: deriveMutationAffectedEntities(step, downstreamReceipt)
	};
}

function mutationToolCategory(
	step: Extract<AgenticChatTurnProviderStepV1, { type: 'mutating_tool' }>
): string {
	return step.operationName.startsWith('onto.') || step.toolName.includes('_onto_')
		? 'ontology_action'
		: 'action';
}

const MAX_CAPPED_RETRY_PRIOR_MESSAGE_CHARS = 600;

/**
 * A backend contract mismatch (adapter code `*_contract_mismatch`) fails every
 * call of the tool regardless of arguments, so the whole tool is capped for the
 * turn. Decided from the adapter's structured failure code only, never from the
 * wording of its message.
 */
function isToolLevelPermanentMutationFailure(error: AgenticChatEffectExecutionError): boolean {
	return error.failureCode?.trim().endsWith('_contract_mismatch') === true;
}

function findPermanentMutationFailureCap(
	terminalContext: TerminalContextState,
	step: Extract<AgenticChatTurnProviderStepV1, { type: 'mutating_tool' }>
): KnownMutationFailure | null {
	const ledger = terminalContext.permanentMutationFailures;
	const toolLevelPrior = ledger.byTool.get(step.toolName);
	if (toolLevelPrior !== undefined) {
		return {
			effectId: null,
			message:
				`${step.toolName} already failed permanently this turn; do not retry it. ` +
				`Earlier failure: ${truncateCappedRetryMessage(toolLevelPrior)}`,
			observationErrorCode: 'mutation_retry_capped',
			toolLevel: true
		};
	}
	const identicalPrior = ledger.byCall.get(mutationCallKey(step));
	if (identicalPrior !== undefined) {
		return {
			effectId: null,
			message:
				`${step.toolName} was already called with these exact arguments this turn and failed permanently; ` +
				`do not retry the identical call. Earlier failure: ${truncateCappedRetryMessage(identicalPrior)}`,
			observationErrorCode: 'mutation_retry_capped',
			toolLevel: false
		};
	}
	return null;
}

function truncateCappedRetryMessage(message: string): string {
	return message.length > MAX_CAPPED_RETRY_PRIOR_MESSAGE_CHARS
		? `${message.slice(0, MAX_CAPPED_RETRY_PRIOR_MESSAGE_CHARS - 3)}...`
		: message;
}

function mutationCallKey(
	step: Extract<AgenticChatTurnProviderStepV1, { type: 'mutating_tool' }>
): string {
	return `${step.toolName}\u0000${stableJson(step.arguments)}`;
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

/** Where the first affected entity keeps the user's words (`source_quote`). */
function withSourceQuote(entities: JsonObject[], sourceQuote: string | undefined): JsonObject[] {
	const [first, ...rest] = entities;
	if (!sourceQuote || !first) return entities;
	return [{ ...first, source_quote: sourceQuote }, ...rest];
}

type MutationStep = Pick<
	Extract<AgenticChatTurnProviderStepV1, { type: 'mutating_tool' }>,
	'toolName' | 'operationName' | 'arguments'
>;
type AffectedEntityDraft = {
	kind: string;
	id: string | null;
	title?: string | null;
	projectId?: string | null;
	operation: string;
	/** Short facts about the change, e.g. how many table rows moved. */
	extra?: JsonObject;
};

/** Kinds the app opens by `?entity=` on the project page. */
const PROJECT_PAGE_KINDS = new Set(['task', 'goal', 'plan', 'milestone', 'risk']);

function affectedEntity(draft: AffectedEntityDraft): JsonObject[] {
	if (!draft.id) return [];
	const projectId = draft.kind === 'project' ? draft.id : (draft.projectId ?? null);
	const url =
		draft.kind === 'project'
			? `/projects/${draft.id}`
			: !projectId
				? null
				: draft.kind === 'document'
					? `/projects/${projectId}?doc=${draft.id}`
					: PROJECT_PAGE_KINDS.has(draft.kind)
						? `/projects/${projectId}?entity=${encodeURIComponent(draft.kind)}&entity_id=${draft.id}`
						: null;
	return [
		{
			kind: draft.kind,
			id: draft.id,
			title: draft.title ?? null,
			projectId,
			operation: draft.operation,
			url,
			...(draft.extra ?? {})
		}
	];
}

const record = (value: unknown): JsonObject | null => (isJsonRecord(value) ? value : null);

/** A document's title inside a doc-structure tree receipt. */
function treeNodeTitle(nodes: unknown, id: string, depth = 0): string | null {
	if (!Array.isArray(nodes) || depth > 12) return null;
	for (const node of nodes) {
		if (!isJsonRecord(node)) continue;
		if (node.id === id) return firstText(node.title);
		const nested = treeNodeTitle(node.children, id, depth + 1);
		if (nested) return nested;
	}
	return null;
}

/**
 * Writes whose receipt is not one `onto.<kind>.<verb>` entity row. Without an entry here the
 * step reports nothing touched, and the chat counts a calendar event or a moved document as
 * something it only read. Keyed by operation name (a structured id, never free text).
 */
const NAMED_AFFECTED_ENTITIES: Readonly<
	Record<string, (step: MutationStep, receipt: JsonObject) => JsonObject[]>
> = {
	'onto.document.tree.move': (step, receipt) => {
		const id = firstText(step.arguments.document_id);
		return affectedEntity({
			kind: 'document',
			id,
			title: id ? treeNodeTitle(record(receipt.structure)?.root, id) : null,
			projectId: firstText(step.arguments.project_id),
			operation: 'moved'
		});
	},
	'onto.task.docs.create_or_attach': (_step, receipt) => {
		const document = record(receipt.document);
		return affectedEntity({
			kind: 'document',
			id: firstText(document?.id),
			title: firstText(document?.title),
			projectId: firstText(document?.project_id),
			operation: 'linked'
		});
	},
	// Linking what is already linked changes nothing.
	'onto.edge.link': (step, receipt) =>
		receipt.created === 0
			? []
			: affectedEntity({
					kind: 'edge',
					id: firstText(receipt.edge_id, record(receipt.edge)?.id),
					projectId: firstText(
						record(receipt.edge)?.project_id,
						step.arguments.project_id
					),
					operation: 'linked'
				}),
	'onto.edge.unlink': (step, receipt) =>
		receipt.deleted === true
			? affectedEntity({
					kind: 'edge',
					id: firstText(step.arguments.edge_id),
					projectId: firstText(step.arguments.project_id),
					operation: 'unlinked'
				})
			: [],
	// A task that was already in the destination did not move this turn.
	'onto.task.move': (step, receipt) => {
		const task = record(receipt.task);
		return receipt.status === 'moved'
			? affectedEntity({
					kind: 'task',
					id: firstText(task?.id, step.arguments.task_id),
					title: firstText(task?.title),
					projectId: firstText(task?.project_id, step.arguments.destination_project_id),
					operation: 'moved'
				})
			: [];
	},
	'x.misc.tag_onto_entity': (_step, receipt) =>
		affectedEntity({
			kind: firstText(receipt.entity_type) ?? 'entity',
			id: firstText(receipt.entity_id),
			projectId: firstText(receipt.project_id),
			operation: 'mentioned'
		}),
	'onto.table.create': (_step, receipt) => tableAffectedEntity(receipt, 'created'),
	'onto.table.update': (_step, receipt) => tableAffectedEntity(receipt, 'updated'),
	'onto.table.rows.update': (_step, receipt) => tableAffectedEntity(receipt, 'updated'),
	'util.agent.delegate': (_step, receipt) =>
		receipt.ok === true
			? affectedEntity({
					kind: 'agent_run',
					id: firstText(Array.isArray(receipt.run_ids) ? receipt.run_ids[0] : null),
					title: firstText(receipt.label),
					projectId: firstText(receipt.project_id),
					operation: 'delegated'
				})
			: [],
	'cal.event.create': (step, receipt) => calendarAffectedEntity(step, receipt, 'created'),
	'cal.event.update': (step, receipt) => calendarAffectedEntity(step, receipt, 'updated'),
	'cal.event.delete': (step, receipt) =>
		receipt.already_missing === true ? [] : calendarAffectedEntity(step, receipt, 'deleted'),
	'cal.project.set': (_step, receipt) =>
		receipt.ok === true
			? affectedEntity({
					kind: 'project',
					id: firstText(receipt.project_id),
					operation: 'updated'
				})
			: []
};

/** A table write touches the table's document; `rows_changed` counts the rows it moved. */
function tableAffectedEntity(receipt: JsonObject, operation: string): JsonObject[] {
	const document = record(receipt.document);
	const change = record(receipt.table_change);
	const count = (key: string) =>
		typeof change?.[key] === 'number' ? (change[key] as number) : 0;
	const rowsChanged = count('rows_added') + count('rows_updated') + count('rows_deleted');
	return affectedEntity({
		kind: 'document',
		id: firstText(document?.id),
		title: firstText(document?.title),
		projectId: firstText(document?.project_id),
		operation,
		extra: { table: true, ...(change ? { rows_changed: rowsChanged } : {}) }
	});
}

/** A calendar write can fail as data (`ok: false`); only a write that happened is reported. */
function calendarAffectedEntity(
	step: MutationStep,
	receipt: JsonObject,
	operation: string
): JsonObject[] {
	if (receipt.ok !== true) return [];
	return affectedEntity({
		kind: 'event',
		id: firstText(
			receipt.event_id,
			step.arguments.onto_event_id,
			receipt.google_event_id,
			step.arguments.event_id
		),
		title: firstText(step.arguments.title),
		projectId: firstText(step.arguments.project_id),
		operation
	});
}

/**
 * What a committed write touched, for the step row, the receipt and the stored execution:
 * `{ kind, id, title, projectId, operation, url }` (+ `table`/`rows_changed` on table writes).
 * Empty when nothing was saved: a change waiting on the person, a no-op, a failed provider half.
 */
export function deriveMutationAffectedEntities(
	step: MutationStep,
	downstreamReceipt: JsonObject | null
): JsonObject[] {
	// A change waiting on the person's choice has touched nothing yet.
	if (!downstreamReceipt || findRequiresUserAction(downstreamReceipt) === true) return [];
	const named = NAMED_AFFECTED_ENTITIES[step.operationName];
	if (named) return named(step, downstreamReceipt);
	const operation = mutationOperation(step.toolName, step.operationName);
	const kind = mutationEntityKind(step.toolName, step.operationName);
	if (!operation || !kind) return [];

	const candidate = downstreamReceipt[kind];
	const entity = isJsonRecord(candidate) ? candidate : downstreamReceipt;
	const id = firstText(
		entity.id,
		entity[`${kind}_id`],
		step.arguments[`${kind}_id`],
		step.arguments.id
	);
	if (!id) return [];
	const projectId =
		kind === 'project'
			? id
			: firstText(
					entity.project_id,
					entity.projectId,
					step.arguments.project_id,
					step.arguments.projectId
				);
	const title = firstText(entity.title, entity.name, step.arguments.title, step.arguments.name);
	const url =
		kind === 'project'
			? `/projects/${id}`
			: projectId
				? kind === 'document'
					? `/projects/${projectId}?doc=${id}`
					: `/projects/${projectId}?entity=${encodeURIComponent(kind)}&entity_id=${id}`
				: null;
	return [{ kind, id, title, projectId, operation, url }];
}

function mutationEntityKind(toolName: string, operationName: string): string | null {
	const operationMatch = operationName.match(
		/^onto\.([a-z_]+)\.(?:create|update|delete|move|link)$/
	);
	if (operationMatch?.[1]) return operationMatch[1].replace(/s$/, '');
	const toolMatch = toolName.match(/^(?:create|update|delete|move)_onto_([a-z_]+)$/);
	return toolMatch?.[1]?.replace(/s$/, '') ?? null;
}

function mutationOperation(toolName: string, operationName: string): string | null {
	const source = `${operationName}:${toolName}`;
	if (source.includes('.create') || toolName.startsWith('create_')) return 'created';
	if (source.includes('.update') || toolName.startsWith('update_')) return 'updated';
	if (source.includes('.delete') || toolName.startsWith('delete_')) return 'deleted';
	if (source.includes('.move') || toolName.startsWith('move_')) return 'moved';
	if (source.includes('.link') || toolName.includes('link_')) return 'linked';
	return null;
}

function findRequiresUserAction(value: unknown, depth = 0): boolean | null {
	if (!isJsonRecord(value) || depth > 2) return null;
	const direct = value.requires_user_action ?? value.requiresUserAction;
	if (typeof direct === 'boolean') return direct;
	return (
		findRequiresUserAction(value.result, depth + 1) ??
		findRequiresUserAction(value.data, depth + 1)
	);
}

function isJsonRecord(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstText(...values: unknown[]): string | null {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return null;
}
