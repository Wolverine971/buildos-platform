// apps/worker/src/workers/agentic-chat/turn/read-tool-runner.ts
//
// Runs one provider read-tool call behind the ownership fence: the durable
// tool_call / tool_result pair, live progress, the ledger receipt, and the
// failure receipts (validation and recoverable read failures) that are fed
// back so the model can recover.
import { extractContextShiftPayload } from '@buildos/agentic-chat-runtime/loop';
import type { ChatToolResult, JsonObject } from '@buildos/shared-types';
import {
	AgenticChatProviderExecutionError,
	type AgenticChatProviderFailedToolSynthesisInputV1,
	type AgenticChatProviderReadSynthesisInputV1
} from '../provider/contracts';
import {
	type AgenticChatReadToolExecutionV1,
	createStableAgenticChatToolExecutionIdV1
} from '../tools/tool-execution';
import { abortable, throwIfAborted } from '../shared/abortable-deadline';
import {
	createStableAgenticChatReadToolProgressTransitionIdV1,
	createStableAgenticChatReadToolTransitionIdV1
} from '../tools/read-tool-identity';
import {
	AGENTIC_CHAT_MAX_READ_TOOL_PROGRESS_EVENTS,
	type AgenticChatReadToolProgressV1,
	type AgenticChatTurnExecutorPorts,
	type AgenticChatTurnProviderStepV1
} from './executor-contracts';
import { canonicalText, canonicalUuid, elapsedMs } from './executor-helpers';
import { executionErrorCode, logAgenticChatExecutionBoundary } from './executor-failures';
import {
	type AgenticChatReadPlanningContextV1,
	DEFAULT_RUNNING_ACTIVITY,
	READ_TOOL_ACTIVITY,
	type TurnRun,
	providerToolCall,
	recordTerminalToolExecution
} from './turn-run';
import type { AgenticChatTurnRunServices } from './turn-run-services';

export class AgenticChatReadToolRunner {
	constructor(
		private readonly ports: Pick<AgenticChatTurnExecutorPorts, 'readTool' | 'toolExecutions'>,
		private readonly services: AgenticChatTurnRunServices
	) {}

	async execute(
		run: TurnRun,
		step: Extract<AgenticChatTurnProviderStepV1, { type: 'read_tool' }>,
		sequenceIndex: number,
		planning: AgenticChatReadPlanningContextV1,
		signal: AbortSignal
	): Promise<
		| AgenticChatProviderReadSynthesisInputV1
		| AgenticChatProviderFailedToolSynthesisInputV1
		| null
	> {
		const {
			job,
			executionInput,
			processingToken,
			projection,
			terminalContext,
			markToolExecution
		} = run;
		canonicalUuid(step.callTransitionId, 'callTransitionId');
		canonicalUuid(step.resultTransitionId, 'resultTransitionId');
		if (!canonicalText(step.providerToolCallId, 512)) {
			throw new Error('Fixture provider tool-call id is invalid');
		}
		if (!canonicalText(step.toolName, 256)) throw new Error('Fixture tool name is invalid');
		await this.services.assertCurrentReadToolFence(executionInput, processingToken, signal);

		await this.services.publishSemantic(
			executionInput,
			projection,
			{
				type: 'semantic',
				transitionId: step.callTransitionId,
				phase: 'tool',
				eventType: 'tool_call',
				currentActivity: READ_TOOL_ACTIVITY,
				eventPayload: {
					type: 'tool_call',
					tool_call: {
						id: step.providerToolCallId,
						type: 'function',
						function: {
							name: step.toolName,
							arguments: JSON.stringify(step.arguments)
						}
					}
				}
			},
			signal
		);
		throwIfAborted(signal);
		if (step.validationFailure) {
			const result = await this.persistReadValidationFailure(
				run,
				step,
				sequenceIndex,
				signal
			);
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
					error_code: 'validation_failure'
				},
				signal
			);
			return result;
		}
		const readStartedAt = Date.now();
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
		let toolResult: AgenticChatReadToolExecutionV1;
		if (step.memoServed) {
			toolResult = step.memoServed;
			validateReadToolExecution(toolResult);
			validateMemoServedExecution(toolResult);
		} else {
			await logAgenticChatExecutionBoundary(job, executionInput, {
				stage: 'read_op',
				state: 'started',
				providerToolCallId: step.providerToolCallId,
				toolName: step.toolName
			});
			let progressIndex = 0;
			const onProgress = (progress: AgenticChatReadToolProgressV1) => {
				if (progressIndex >= AGENTIC_CHAT_MAX_READ_TOOL_PROGRESS_EVENTS || signal.aborted)
					return;
				const index = progressIndex++;
				const message = progress.message.slice(0, 300);
				void this.services
					.publishSemantic(
						executionInput,
						projection,
						{
							type: 'semantic',
							transitionId: createStableAgenticChatReadToolProgressTransitionIdV1({
								turnRunId: executionInput.claim.turnRunId,
								executionGeneration: executionInput.claim.executionGeneration,
								providerToolCallId: step.providerToolCallId,
								index
							}),
							phase: 'tool',
							eventType: 'tool_progress',
							currentActivity: message,
							eventPayload: {
								type: 'tool_progress',
								tool_call_id: step.providerToolCallId,
								tool_name: step.toolName,
								step_index: index,
								message,
								data: progress.data
							}
						},
						signal
					)
					.catch(() => undefined);
			};
			try {
				toolResult = await abortable(
					this.ports.readTool.execute({
						processingToken,
						toolName: step.toolName,
						arguments: step.arguments,
						providerToolCallId: step.providerToolCallId,
						...(step.decidedBy ? { decidedBy: step.decidedBy } : {}),
						executionInput,
						signal,
						onProgress
					}),
					signal
				);
				validateReadToolExecution(toolResult);
			} catch (error) {
				await logAgenticChatExecutionBoundary(job, executionInput, {
					stage: 'read_op',
					state: 'failed',
					providerToolCallId: step.providerToolCallId,
					toolName: step.toolName,
					durationMs: elapsedMs(readStartedAt),
					error
				});
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
						duration_ms: elapsedMs(readStartedAt),
						error_code: executionErrorCode(error, signal)
					},
					signal
				);
				// Policy denials, failed web lookups, and anything a shared read
				// implementation threw (access denial on a guessed id, not-found,
				// semantic argument checks, database errors) produce no usable
				// evidence. Persist failed receipts and feed the failure back so the
				// model can recover, the way mutation failures already do
				// (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F55). Keyed on the adapter's
				// catch-all code, not the failure class, so allowlist and context
				// violations, ownership fences, timeouts of private reads, and
				// cancellation still terminate through recovery.
				if (
					!signal.aborted &&
					error instanceof AgenticChatProviderExecutionError &&
					(error.code === 'read_tool_execution_failed' ||
						error.code === 'read_tool_egress_blocked_private_content' ||
						error.code === 'read_tool_egress_provenance_required' ||
						(['web_search', 'web_visit', 'web_navigate'].includes(step.toolName) &&
							[
								'read_tool_timeout',
								'read_tool_research_review_unavailable',
								'read_tool_egress_security_capacity_exceeded',
								'read_tool_result_too_large',
								'read_tool_result_invalid'
							].includes(error.code)))
				) {
					return this.persistRecoverableReadFailure(
						run,
						step,
						sequenceIndex,
						error,
						signal
					);
				}
				throw error;
			}
			await logAgenticChatExecutionBoundary(job, executionInput, {
				stage: 'read_op',
				state: 'finished',
				providerToolCallId: step.providerToolCallId,
				toolName: step.toolName,
				durationMs: elapsedMs(readStartedAt)
			});
		}
		const ledgerStartedAt = Date.now();
		await logAgenticChatExecutionBoundary(job, executionInput, {
			stage: 'ledger_persist',
			state: 'started',
			providerToolCallId: step.providerToolCallId,
			toolName: step.toolName
		});
		try {
			await abortable(
				this.ports.toolExecutions.persistRead(
					{
						turnRunId: executionInput.claim.turnRunId,
						queueJobId: executionInput.claim.queueJobId,
						processingToken,
						userId: executionInput.claim.userId,
						executionGeneration: executionInput.claim.executionGeneration,
						toolExecutionId: createStableAgenticChatToolExecutionIdV1({
							turnRunId: executionInput.claim.turnRunId,
							sequenceIndex
						}),
						sequenceIndex,
						providerToolCallId: step.providerToolCallId,
						toolName: step.toolName,
						arguments: step.arguments,
						execution: toolResult
					},
					signal
				),
				signal
			);
		} catch (error) {
			await logAgenticChatExecutionBoundary(job, executionInput, {
				stage: 'ledger_persist',
				state: 'failed',
				providerToolCallId: step.providerToolCallId,
				toolName: step.toolName,
				durationMs: elapsedMs(ledgerStartedAt),
				error
			});
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
					duration_ms: elapsedMs(readStartedAt),
					error_code: executionErrorCode(error, signal)
				},
				signal
			);
			throw error;
		}
		await logAgenticChatExecutionBoundary(job, executionInput, {
			stage: 'ledger_persist',
			state: 'finished',
			providerToolCallId: step.providerToolCallId,
			toolName: step.toolName,
			durationMs: elapsedMs(ledgerStartedAt)
		});
		const chatToolResult: ChatToolResult = {
			tool_call_id: step.providerToolCallId,
			result: toolResult.result,
			success: true,
			...(toolResult.executionTimeMs !== null
				? { duration_ms: toolResult.executionTimeMs }
				: {}),
			...(toolResult.tokensConsumed !== null
				? { tokens_consumed: toolResult.tokensConsumed }
				: {})
		};
		// Once the ledger RPC acknowledges persistence, terminal recovery must
		// describe that durable row even if observation or public publication
		// fails afterward.
		recordTerminalToolExecution(
			terminalContext,
			sequenceIndex,
			providerToolCall(step),
			chatToolResult
		);
		markToolExecution();
		const contextShift = extractContextShiftPayload(chatToolResult);
		if (contextShift) {
			await this.services.persistSessionHandoff(
				executionInput,
				processingToken,
				contextShift
			);
		}
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
				duration_ms: step.memoServed ? 0 : elapsedMs(readStartedAt),
				error_code: null
			},
			signal
		);
		const resultPublishStartedAt = Date.now();
		await logAgenticChatExecutionBoundary(job, executionInput, {
			stage: 'tool_result_publish',
			state: 'started',
			providerToolCallId: step.providerToolCallId,
			toolName: step.toolName
		});
		try {
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
							affected_entities: toolResult.affectedEntities,
							...(toolResult.toolCategory !== null
								? { tool_category: toolResult.toolCategory }
								: {}),
							...(toolResult.resultCount !== null
								? {
										result_count: toolResult.resultCount,
										zero_result: toolResult.zeroResult
									}
								: {}),
							...(toolResult.requiresUserAction !== null
								? { requires_user_action: toolResult.requiresUserAction }
								: {}),
							tool_name: step.toolName
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
		} catch (error) {
			await logAgenticChatExecutionBoundary(job, executionInput, {
				stage: 'tool_result_publish',
				state: 'failed',
				providerToolCallId: step.providerToolCallId,
				toolName: step.toolName,
				durationMs: elapsedMs(resultPublishStartedAt),
				error
			});
			throw error;
		}
		await logAgenticChatExecutionBoundary(job, executionInput, {
			stage: 'tool_result_publish',
			state: 'finished',
			providerToolCallId: step.providerToolCallId,
			toolName: step.toolName,
			durationMs: elapsedMs(resultPublishStartedAt)
		});
		return {
			providerToolCallId: step.providerToolCallId,
			toolName: step.toolName,
			arguments: step.arguments,
			execution: toolResult
		};
	}

	private async persistRecoverableReadFailure(
		run: TurnRun,
		step: Extract<AgenticChatTurnProviderStepV1, { type: 'read_tool' }>,
		sequenceIndex: number,
		readFailure: AgenticChatProviderExecutionError,
		signal: AbortSignal
	): Promise<AgenticChatProviderFailedToolSynthesisInputV1> {
		const { executionInput, processingToken, projection, terminalContext, markToolExecution } =
			run;
		const code = readFailure.code;
		const policyDenied =
			code === 'read_tool_egress_blocked_private_content' ||
			code === 'read_tool_egress_provenance_required';
		const deniedPageVisit =
			code === 'read_tool_egress_provenance_required' &&
			(step.toolName === 'web_visit' || step.toolName === 'web_navigate');
		const webResearch =
			step.toolName === 'web_search' ||
			step.toolName === 'web_visit' ||
			step.toolName === 'web_navigate';
		const error =
			code === 'read_tool_egress_blocked_private_content'
				? 'Email lookup did not run: mailbox egress is restricted after reading private content.'
				: code === 'read_tool_egress_provenance_required'
					? deniedPageVisit
						? 'Page visit did not run: the URL was not supplied by you or returned by a search this turn.'
						: 'External lookup did not run: the query or URL was not authorized for this research request.'
					: webResearch
						? 'Live research did not return usable evidence. The lookup service was unavailable, timed out, or could not complete its checks.'
						: privateReadFailureMessage(readFailure);
		await abortable(
			this.ports.toolExecutions.persistFailure(
				{
					turnRunId: executionInput.claim.turnRunId,
					queueJobId: executionInput.claim.queueJobId,
					processingToken,
					userId: executionInput.claim.userId,
					executionGeneration: executionInput.claim.executionGeneration,
					failureKind: policyDenied ? 'read_policy' : 'read_failure',
					toolExecutionId: createStableAgenticChatToolExecutionIdV1({
						turnRunId: executionInput.claim.turnRunId,
						sequenceIndex
					}),
					sequenceIndex,
					providerToolCallId: step.providerToolCallId,
					toolName: step.toolName,
					arguments: step.arguments,
					toolCategory: null,
					error: `${code}: ${error}`
				},
				signal
			),
			signal
		);
		const result: ChatToolResult = {
			tool_call_id: step.providerToolCallId,
			result: null,
			success: false,
			error
		};
		recordTerminalToolExecution(terminalContext, sequenceIndex, providerToolCall(step), result);
		markToolExecution();
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
						...result,
						tool_name: step.toolName,
						affected_entities: [],
						error_code: code
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
				error,
				toolCategory: null,
				modelPayload: {
					error,
					error_code: code,
					executed: policyDenied ? false : null,
					retryable: false,
					instruction:
						webResearch || policyDenied
							? [
									deniedPageVisit
										? "To reach a page linked from one you already opened, call web_navigate from that page with a goal; it follows the page's own links. Otherwise use web_search with include_domains for the relevant public domain and open an exact returned URL. Do not guess or modify URLs to bypass authorization."
										: 'Do not repeat this failed lookup or route around an authorization denial.',
									'Continue useful work using loaded context and any successful research results. Disclose which live facts could not be verified; cite only evidence that actually returned.'
								].join(' ')
							: 'Do not repeat this call with the same arguments. If the id was guessed, locate the record with a search or list tool that is available this turn; otherwise continue with the loaded context and tell the user what could not be read.'
				}
			}
		};
	}

	private async persistReadValidationFailure(
		run: TurnRun,
		step: Extract<AgenticChatTurnProviderStepV1, { type: 'read_tool' }>,
		sequenceIndex: number,
		signal: AbortSignal
	): Promise<null> {
		const { executionInput, processingToken, projection, terminalContext } = run;
		const failure = step.validationFailure;
		if (!failure) throw new Error('Fixture validation failure payload is missing');
		if (!canonicalText(failure.error, 4_000)) {
			throw new Error('Fixture validation failure error is invalid');
		}
		if (failure.toolCategory !== null && !canonicalText(failure.toolCategory, 128)) {
			throw new Error('Fixture validation failure tool category is invalid');
		}
		await abortable(
			this.ports.toolExecutions.persistFailure(
				{
					turnRunId: executionInput.claim.turnRunId,
					queueJobId: executionInput.claim.queueJobId,
					processingToken,
					userId: executionInput.claim.userId,
					executionGeneration: executionInput.claim.executionGeneration,
					failureKind: 'validation',
					toolExecutionId: createStableAgenticChatToolExecutionIdV1({
						turnRunId: executionInput.claim.turnRunId,
						sequenceIndex
					}),
					sequenceIndex,
					providerToolCallId: step.providerToolCallId,
					toolName: step.toolName,
					arguments: step.arguments,
					toolCategory: failure.toolCategory,
					error: failure.error
				},
				signal
			),
			signal
		);

		const chatToolResult: ChatToolResult = {
			tool_call_id: step.providerToolCallId,
			result: { execution_status: 'not_executed', failure_kind: 'validation' },
			success: false,
			error: failure.error
		};
		// Validation failures are separate legacy-visible attempts even when the
		// repaired successor is yielded by the same adapter generator.
		terminalContext.toolRoundCount += 1;
		recordTerminalToolExecution(
			terminalContext,
			sequenceIndex,
			providerToolCall(step),
			chatToolResult
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
						...(failure.toolCategory !== null
							? { tool_category: failure.toolCategory }
							: {}),
						tool_name: step.toolName
					}
				}
			},
			signal
		);
		return null;
	}
}

function validateReadToolExecution(execution: AgenticChatReadToolExecutionV1): void {
	if (!execution || typeof execution !== 'object' || Array.isArray(execution)) {
		throw new Error('Fixture read-tool execution is invalid');
	}
	if (
		!execution.result ||
		typeof execution.result !== 'object' ||
		Array.isArray(execution.result)
	) {
		throw new Error('Fixture read-tool result is invalid');
	}
	if (!Array.isArray(execution.affectedEntities)) {
		throw new Error('Fixture read-tool affected entities are invalid');
	}
	if (
		execution.affectedEntities.some(
			(entity) => !entity || typeof entity !== 'object' || Array.isArray(entity)
		)
	) {
		throw new Error('Fixture read-tool affected entities are invalid');
	}
	for (const [label, value] of [
		['executionTimeMs', execution.executionTimeMs],
		['tokensConsumed', execution.tokensConsumed],
		['resultCount', execution.resultCount]
	] as const) {
		if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
			throw new Error(`Fixture read-tool ${label} is invalid`);
		}
	}
	if (execution.toolCategory !== null && !canonicalText(execution.toolCategory, 128)) {
		throw new Error('Fixture read-tool category is invalid');
	}
	if (execution.zeroResult !== null && typeof execution.zeroResult !== 'boolean') {
		throw new Error('Fixture read-tool zero-result evidence is invalid');
	}
	if (
		(execution.resultCount === null) !== (execution.zeroResult === null) ||
		(execution.resultCount !== null && execution.zeroResult !== (execution.resultCount === 0))
	) {
		throw new Error('Fixture read-tool result-count evidence is inconsistent');
	}
	if (
		execution.requiresUserAction !== null &&
		typeof execution.requiresUserAction !== 'boolean'
	) {
		throw new Error('Fixture read-tool user-action evidence is invalid');
	}
}

function validateMemoServedExecution(execution: AgenticChatReadToolExecutionV1): void {
	if (
		execution.executionTimeMs !== 0 ||
		execution.requiresUserAction === true ||
		execution.result.served_from_turn_memo !== true ||
		!canonicalText(execution.result.repeat_read_notice, 2_000)
	) {
		throw new Error('Fixture memo-served read execution is invalid');
	}
}

/**
 * Model-facing text for a private (non-web) read the adapter reported as
 * `read_tool_execution_failed`. The shared implementations' own throws
 * ('permanent': access denial, not-found, semantic argument checks) are
 * written for the caller and are replayed verbatim; database and PostgREST
 * failures ('unknown') are replaced so raw driver messages never reach the
 * model.
 */
function privateReadFailureMessage(error: AgenticChatProviderExecutionError): string {
	if (error.failureClass !== 'permanent') return 'The read could not be completed.';
	const message = error.message.trim().slice(0, 2_000).trim();
	// Only the shared read implementations' own caller-facing messages are
	// replayed. Anything that may embed driver output (PostgREST, SQL state,
	// row text) is replaced so raw database text never reaches the model
	// (review of AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F55).
	if (
		!message ||
		/\b(PGRST\d+|SQLSTATE|syntax for type|relation "|column "|violates)\b/i.test(message)
	) {
		return 'The read could not be completed.';
	}
	return message;
}
