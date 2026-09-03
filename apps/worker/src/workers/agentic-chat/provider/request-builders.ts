// apps/worker/src/workers/agentic-chat/provider/request-builders.ts
import { createHash } from 'node:crypto';
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	type ContextUsageSnapshot,
	type JsonObject,
	type JsonValue,
	appendAgenticChatAttachmentContextV1,
	buildAgenticChatAttachmentDisplayTextV1,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import {
	REPEAT_READ_NOTICE,
	type ToolValidationIssue,
	buildToolPayloadForModel,
	buildToolValidationRepairInstruction,
	isControlToolName,
	parseToolArguments
} from '@buildos/agentic-chat-runtime/loop';
import type { AgenticChatWorkerExecutionInputV1 } from '../executionInput';
import type { AgenticChatProviderMutationCapabilitiesV1 } from '../mutationToolCatalog';
import {
	AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION,
	type AgenticChatPreparedProviderInvocationV1,
	type AgenticChatProviderBudgetV1,
	type AgenticChatProviderToolSynthesisInputV1,
	type AgenticChatProviderUsageV1,
	type AgenticChatTurnProviderClientPortV1,
	type AgenticChatTurnProviderMessageV1,
	type AgenticChatTurnProviderRequestV1,
	type AgenticChatTurnProviderToolV1
} from './contracts';
import {
	type AgenticChatFeedbackToolCall,
	completedProviderCallToChatToolCall,
	isFailedToolFeedback
} from './feedback';
import {
	canonicalRequiredText,
	nullableString,
	providerError,
	requireRecord,
	requiredContent
} from './protocol';
import { buildWorkerSemanticMutationOrdering } from './review/turn-contract';
import type { CompletedProviderToolCall } from './stream-tool-calls';
import {
	buildWorkerToolSurfaceOverride,
	deferComplexWriteContractForInitialPass,
	hasSchedulingSidecar,
	productionToolsFor
} from './tool-surface';
import { validationFailureError, validationIssuesForCall } from './validation';
import { collectReadResultEntityRefs, summarizeReadResultEntityRefs } from './write-routing';

export const TOOL_EXECUTION_BATCHING_INSTRUCTION =
	'Tool execution batching: independent calls returned in one response may run in parallel. When a call must wait for another call in the same response, give each a unique call_ref and list prerequisite refs in after. Use after only when all dependent arguments are already known. Never reference a call_ref from an earlier response; completed earlier calls need no after dependency. If a later call needs a value returned by an earlier call, wait for that tool result and issue the dependent call in the next response. The worker may serialize calls that touch conflicting resources.';

export function appendSystemInstruction(
	request: AgenticChatTurnProviderRequestV1,
	content: string
): AgenticChatTurnProviderRequestV1 {
	return {
		...request,
		messages: [...request.messages, { role: 'system', content }]
	};
}

export function forceToolFreeRequest(
	request: AgenticChatTurnProviderRequestV1
): AgenticChatTurnProviderRequestV1 {
	return {
		...request,
		tools: [],
		toolChoice: 'none',
		providerRound: 'synthesis',
		passRole: 'final_response'
	};
}

export function latestToolPayloadChars(request: AgenticChatTurnProviderRequestV1): number {
	let total = 0;
	for (let index = request.messages.length - 1; index >= 0; index -= 1) {
		const message = request.messages[index];
		if (message?.role !== 'tool') break;
		total += message.content.length;
	}
	return total;
}

export function getAdmissionContextUsage(
	input: AgenticChatWorkerExecutionInputV1
): ContextUsageSnapshot | undefined {
	if (input.artifact.artifactVersion !== AGENTIC_CHAT_INPUT_ARTIFACT_VERSION) {
		return undefined;
	}
	return input.artifact.prepared.contextUsageSnapshot;
}

export function buildBaseProviderRequest(
	input: AgenticChatWorkerExecutionInputV1,
	processingToken: string,
	signal: AbortSignal,
	mutationCapabilities: Readonly<Partial<AgenticChatProviderMutationCapabilitiesV1>>,
	liveVisionEnabled: boolean,
	semanticReviewEnabled: boolean,
	budget?: AgenticChatProviderBudgetV1
): {
	request: AgenticChatTurnProviderRequestV1;
	admittedTools: readonly AgenticChatTurnProviderToolV1[];
} {
	const systemPrompt = requiredContent(input.artifact.prepared.systemPrompt, 'system prompt');
	const requestMessage = requiredContent(input.requestPayload.message, 'user message');
	const requestAttachments = input.requestPayload.attachments;
	if (!Array.isArray(requestAttachments)) {
		throw providerError('attachment_contract_mismatch', 'permanent');
	}
	const currentTurn = input.artifact.prepared.currentTurn;
	if (currentTurn?.liveVision?.requested && !liveVisionEnabled) {
		throw providerError('provider_live_vision_unavailable', 'permanent');
	}
	let userMessage = requestMessage;
	if (currentTurn) {
		const expectedDisplayMessage =
			currentTurn.message ||
			buildAgenticChatAttachmentDisplayTextV1(currentTurn.attachments.length);
		const requestAttachmentEvidence = currentTurn.attachments.map((attachment) => ({
			attachment_kind: attachment.attachment_kind,
			media_type: attachment.media_type,
			asset_id: attachment.asset_id,
			temporary_attachment_id: attachment.temporary_attachment_id,
			project_id: attachment.project_id,
			role: attachment.role,
			display_order: attachment.display_order,
			file_name: attachment.file_name,
			content_type: attachment.content_type,
			file_size_bytes: attachment.file_size_bytes,
			width: attachment.width,
			height: attachment.height,
			checksum_sha256: attachment.checksum_sha256,
			ocr_status: attachment.ocr_status,
			extraction_summary: attachment.extraction_summary,
			extracted_text_preview: attachment.extracted_text_preview
		}));
		if (
			requestMessage !== expectedDisplayMessage ||
			canonicalizeAgenticChatJson(requestAttachments as JsonValue) !==
				canonicalizeAgenticChatJson(requestAttachmentEvidence as JsonValue)
		) {
			throw providerError('attachment_contract_mismatch', 'permanent');
		}
		userMessage = appendAgenticChatAttachmentContextV1(
			currentTurn.message,
			currentTurn.attachments,
			{
				maxChars: currentTurn.attachmentContextMaxChars,
				rawMediaPassedToModel:
					liveVisionEnabled && (currentTurn.liveVision?.requested ?? false)
			}
		);
	} else if (requestAttachments.length !== 0) {
		throw providerError('attachments_missing_artifact_evidence', 'permanent');
	}

	const messages: AgenticChatTurnProviderMessageV1[] = [
		{ role: 'system', content: systemPrompt }
	];
	for (const history of input.artifact.history) {
		const message: AgenticChatTurnProviderMessageV1 = {
			role: history.role,
			content: history.content
		};
		if (history.toolCalls.length > 0) message.tool_calls = history.toolCalls;
		if (history.toolCallId) message.tool_call_id = history.toolCallId;
		messages.push(message);
	}
	const resumeCheckpoint = input.artifact.prepared.resumeCheckpoint;
	if (resumeCheckpoint) {
		messages.push({ role: 'system', content: resumeCheckpoint.resumeMessage });
	}

	const context = requireRecord(input.requestPayload.context, 'request context');
	const contextType = canonicalRequiredText(context.type, 'context type');
	const admittedTools = productionToolsFor(input, mutationCapabilities, semanticReviewEnabled);
	const tools = deferComplexWriteContractForInitialPass(
		input,
		admittedTools,
		semanticReviewEnabled && contextType !== 'project_create'
	);
	const workerToolSurfaceOverride = buildWorkerToolSurfaceOverride(input, tools);
	if (workerToolSurfaceOverride) {
		messages.push({ role: 'system', content: workerToolSurfaceOverride });
	}
	const semanticMutationOrdering = buildWorkerSemanticMutationOrdering(tools, contextType);
	if (semanticMutationOrdering) {
		messages.push({ role: 'system', content: semanticMutationOrdering });
	}
	// The batching contract only means something when a mounted tool actually
	// carries the call_ref/after sidecar; on a sidecar-free surface the message
	// is ~120 tokens of instruction about arguments that do not exist.
	if (hasSchedulingSidecar(tools)) {
		messages.push({ role: 'system', content: TOOL_EXECUTION_BATCHING_INSTRUCTION });
	}
	messages.push({ role: 'user', content: userMessage });
	return {
		admittedTools,
		request: {
			messages,
			tools,
			toolChoice: tools.length > 0 ? 'auto' : 'none',
			userId: input.claim.userId,
			sessionId: input.claim.sessionId,
			turnRunId: input.claim.turnRunId,
			streamRunId: input.streamRunId,
			clientTurnId: input.clientTurnId,
			contextType,
			entityId: nullableString(context.entityId, 'context entity id'),
			projectId: nullableString(context.projectId, 'context project id'),
			queueJobId: input.claim.queueJobId,
			processingToken,
			executionGeneration: input.claim.executionGeneration,
			logicalProviderRound: 1,
			providerRound: 'initial',
			passRole: 'acting',
			signal,
			...(budget ? { budget } : {}),
			...(liveVisionEnabled && currentTurn?.liveVision?.requested
				? {
						liveVisionRequest: {
							turnRunId: input.claim.turnRunId,
							queueJobId: input.claim.queueJobId,
							processingToken,
							userId: input.claim.userId,
							executionGeneration: input.claim.executionGeneration,
							policy: currentTurn.liveVision,
							attachments: currentTurn.attachments
						}
					}
				: {})
		}
	};
}

/**
 * Tool results are replayed on every later pass. Once a round has been
 * consumed by the model pass that produced the next round, its full bodies
 * are dead weight: the model already acted on them. Older tool messages are
 * replaced with a stub that keeps what a later write still needs (the tool,
 * its status, and the entity ids with their titles); the round just appended
 * stays full. Control results (contract declaration, reviewer decisions,
 * clarification) are never stubbed: they are the harness's own record.
 */
const SUPERSEDED_TOOL_RESULT_MIN_CHARS = 400;
const SUPERSEDED_TOOL_RESULT_MAX_ENTITIES = 64;
const SUPERSEDED_TOOL_RESULT_TITLE_CHARS = 48;
const SUPERSEDED_TOOL_RESULT_ERROR_CHARS = 160;

type SupersededToolResultStub = JsonObject & { superseded: true };

function isSupersededToolResultStub(content: string): boolean {
	return content.startsWith('{"superseded":true') || content.includes('"superseded":true');
}

function supersededEntities(result: unknown): JsonObject {
	const refs = collectReadResultEntityRefs(result);
	if (refs.length === 0) return {};
	const entities: JsonObject[] = refs
		.slice(0, SUPERSEDED_TOOL_RESULT_MAX_ENTITIES)
		.map((ref) => ({
			id: ref.id,
			kind: ref.kind,
			...(ref.title ? { title: ref.title.slice(0, SUPERSEDED_TOOL_RESULT_TITLE_CHARS) } : {})
		}));
	const omitted = refs.length - entities.length;
	return omitted > 0 ? { entities, entities_omitted: omitted } : { entities };
}

function buildSupersededToolResultStub(toolName: string, content: string): string | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		parsed = null;
	}
	const record =
		parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	const stub: SupersededToolResultStub = { superseded: true, tool: toolName };
	if (record && typeof record.error === 'string') {
		stub.status = 'error';
		stub.error = record.error.slice(0, SUPERSEDED_TOOL_RESULT_ERROR_CHARS);
	} else {
		stub.status = 'ok';
		const refs = collectReadResultEntityRefs(parsed);
		stub.summary =
			refs.length > 0
				? summarizeReadResultEntityRefs(refs)
				: `${content.length} chars, no entity ids`;
		Object.assign(stub, supersededEntities(parsed));
	}
	const serialized = canonicalizeAgenticChatJson(stub);
	// A stub that is not smaller than what it replaces saves nothing.
	return serialized.length < content.length ? serialized : null;
}

export function supersedeConsumedToolResults(
	messages: readonly AgenticChatTurnProviderMessageV1[]
): AgenticChatTurnProviderMessageV1[] {
	const toolNamesByCallId = new Map<string, string>();
	return messages.map((message) => {
		if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
			for (const toolCall of message.tool_calls) {
				const fn = toolCall.function;
				if (
					typeof toolCall.id === 'string' &&
					fn &&
					typeof fn === 'object' &&
					!Array.isArray(fn) &&
					typeof (fn as JsonObject).name === 'string'
				) {
					toolNamesByCallId.set(toolCall.id, (fn as JsonObject).name as string);
				}
			}
			return message;
		}
		if (message.role !== 'tool' || typeof message.content !== 'string') return message;
		if (message.content.length <= SUPERSEDED_TOOL_RESULT_MIN_CHARS) return message;
		if (isSupersededToolResultStub(message.content)) return message;
		const toolName = message.tool_call_id ? toolNamesByCallId.get(message.tool_call_id) : null;
		if (!toolName || isControlToolName(toolName)) return message;
		const stub = buildSupersededToolResultStub(toolName, message.content);
		return stub ? { ...message, content: stub } : message;
	});
}

/**
 * A memo-served repeat read re-injected the whole cached payload on the
 * pass that asked for it; the model saw that payload already. Return the
 * notice and the entity evidence instead.
 */
function buildMemoServedToolResultContent(toolName: string, result: JsonObject): string {
	const refs = collectReadResultEntityRefs(result);
	return canonicalizeAgenticChatJson({
		superseded: true,
		served_from_turn_memo: true,
		repeat_read_notice:
			typeof result.repeat_read_notice === 'string'
				? result.repeat_read_notice
				: REPEAT_READ_NOTICE,
		tool: toolName,
		status: 'ok',
		summary:
			refs.length > 0
				? summarizeReadResultEntityRefs(refs)
				: 'identical to the earlier result',
		...supersededEntities(result)
	});
}

export function buildContinuationRequest(
	request: AgenticChatTurnProviderRequestV1,
	calls: readonly AgenticChatFeedbackToolCall[],
	feedback: readonly AgenticChatProviderToolSynthesisInputV1[]
): AgenticChatTurnProviderRequestV1 {
	if (calls.length === 0 || calls.length !== feedback.length) {
		throw providerError('provider_read_continuation_result_count_invalid', 'unknown');
	}
	const toolMessages = calls.map((call, index): AgenticChatTurnProviderMessageV1 => {
		const result = feedback[index]!;
		if (isFailedToolFeedback(result)) {
			return {
				role: 'tool',
				content: canonicalizeAgenticChatJson(result.failure.modelPayload as JsonValue),
				tool_call_id: call.id
			};
		}
		const execution = result.execution;
		if (
			call.kind === 'read' &&
			execution.result &&
			typeof execution.result === 'object' &&
			(execution.result as JsonObject).served_from_turn_memo === true
		) {
			return {
				role: 'tool',
				content: buildMemoServedToolResultContent(
					call.name,
					execution.result as JsonObject
				),
				tool_call_id: call.id
			};
		}
		const modelPayload = buildToolPayloadForModel(
			completedProviderCallToChatToolCall(call),
			{
				tool_call_id: call.id,
				result: execution.result,
				success: true,
				duration_ms: execution.executionTimeMs ?? undefined,
				tokens_consumed: execution.tokensConsumed ?? undefined,
				requires_user_action: execution.requiresUserAction ?? undefined
			},
			parseToolArguments,
			// The worker surface is immutable between passes: a hint naming a tool
			// outside it would be the model's next permanent rejection.
			{ callableToolNames: request.tools.map((tool) => tool.function.name) }
		);
		return {
			role: 'tool',
			content: canonicalizeAgenticChatJson(modelPayload as JsonValue),
			tool_call_id: call.id
		};
	});
	return {
		...request,
		logicalProviderRound: request.logicalProviderRound + 1,
		providerRound: 'synthesis',
		passRole: 'acting',
		messages: [
			...supersedeConsumedToolResults(request.messages),
			{
				role: 'assistant',
				content: '',
				tool_calls: calls.map((call) => ({
					id: call.id,
					type: 'function',
					function: { name: call.name, arguments: call.canonicalProviderArguments }
				}))
			},
			...toolMessages
		],
		tools: request.tools,
		toolChoice: request.tools.length > 0 ? 'auto' : 'none'
	};
}

export function buildValidationRepairRequest(
	request: AgenticChatTurnProviderRequestV1,
	calls: readonly CompletedProviderToolCall[],
	issues: ToolValidationIssue[]
): AgenticChatTurnProviderRequestV1 {
	if (calls.length === 0) {
		throw providerError('provider_tool_validation_issue_identity_mismatch', 'permanent');
	}
	const toolMessages = calls.map((call): AgenticChatTurnProviderMessageV1 => {
		const callIssues = validationIssuesForCall(call, issues);
		const fieldErrors = callIssues.flatMap((issue) => issue.errors);
		const issueOp = callIssues.find((issue) => issue.op)?.op;
		const validationPayload: JsonObject = {
			error: validationFailureError(callIssues),
			details: { field_errors: fieldErrors }
		};
		if (issueOp) {
			validationPayload.op = issueOp;
			validationPayload.help_path = issueOp;
		}
		return {
			role: 'tool',
			content: canonicalizeAgenticChatJson(validationPayload),
			tool_call_id: call.id
		};
	});
	return appendSystemInstruction(
		{
			...request,
			logicalProviderRound: request.logicalProviderRound + 1,
			providerRound: 'synthesis',
			passRole: 'repair',
			messages: [
				...request.messages,
				{
					role: 'assistant',
					content: '',
					tool_calls: calls.map((call) => ({
						id: call.id,
						type: 'function',
						function: { name: call.name, arguments: call.canonicalProviderArguments }
					}))
				},
				...toolMessages
			],
			tools: request.tools,
			toolChoice:
				request.toolChoice === 'required'
					? 'required'
					: request.tools.length > 0
						? 'auto'
						: 'none'
		},
		buildToolValidationRepairInstruction(issues, false)
	);
}

export function combineUsage(
	initial: AgenticChatProviderUsageV1 | null,
	synthesis: AgenticChatProviderUsageV1 | null
): AgenticChatProviderUsageV1 | null {
	if (!initial || !synthesis) return null;
	const promptTokens = initial.promptTokens + synthesis.promptTokens;
	const completionTokens = initial.completionTokens + synthesis.completionTokens;
	const totalTokens = initial.totalTokens + synthesis.totalTokens;
	if (![promptTokens, completionTokens, totalTokens].every(Number.isSafeInteger)) {
		throw providerError('provider_aggregate_usage_invalid', 'unknown');
	}
	return { promptTokens, completionTokens, totalTokens };
}

export function buildPromptSnapshot(
	messages: readonly AgenticChatTurnProviderMessageV1[],
	tools: readonly AgenticChatTurnProviderToolV1[]
): NonNullable<AgenticChatPreparedProviderInvocationV1['promptSnapshot']> {
	const canonical = canonicalizeAgenticChatJson(messages as unknown as JsonValue);
	const modelMessages = JSON.parse(canonical) as JsonObject[];
	const canonicalTools = canonicalizeAgenticChatJson(tools as unknown as JsonValue);
	const toolDefinitions = JSON.parse(canonicalTools) as JsonObject[];
	const systemPrompt = modelMessages[0]?.content;
	if (typeof systemPrompt !== 'string' || systemPrompt.length === 0) {
		throw providerError('provider_snapshot_system_prompt_invalid', 'permanent');
	}
	return {
		snapshotVersion: AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION,
		modelMessages,
		toolDefinitions,
		systemPromptSha256: sha256(systemPrompt),
		messagesSha256: sha256(canonical),
		toolsSha256: sha256(canonicalTools),
		systemPromptChars: systemPrompt.length,
		messageChars: modelMessages.reduce(
			(total, message) =>
				total + (typeof message.content === 'string' ? message.content.length : 0),
			0
		),
		approxPromptTokens: modelMessages.reduce(
			(total, message) =>
				total +
				(typeof message.content === 'string' ? Math.ceil(message.content.length / 4) : 0),
			0
		)
	};
}

export function providerClientRequest(
	request: AgenticChatTurnProviderRequestV1
): Parameters<AgenticChatTurnProviderClientPortV1['stream']>[0] {
	const {
		liveVisionRequest: _liveVisionRequest,
		semanticDispositionGate: _semanticDispositionGate,
		unavailableSkillRepairAttempted: _unavailableSkillRepairAttempted,
		...clientRequest
	} = request;
	return clientRequest;
}

function sha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}
