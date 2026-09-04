// packages/agentic-chat-runtime/src/contracts.ts
import type {
	AgentSSEMessage,
	AgentStreamEventV1,
	ChatTurnTerminalStatusV1,
	JsonObject,
	NormalizedChatAttachmentV1,
	TurnHandleV1
} from '@buildos/shared-types';

export const AGENTIC_CHAT_RUNTIME_CONTRACT_VERSION = 'agentic_chat_runtime_v1' as const;

export type AdmittedTurnHandleV1 = Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>;

export type AgenticChatTurnContextV1 = {
	type: string;
	entityId: string | null;
	projectId: string | null;
};

/**
 * Transport-neutral input to one admitted turn execution.
 *
 * Host adapters retain ownership of authentication, HTTP parsing, admission,
 * and transport setup. `input` carries adapter-specific retained input until
 * the shared artifact contract is wired all the way through.
 */
export type AgenticChatTurnCommand<TInput = unknown> = {
	runtimeContractVersion: typeof AGENTIC_CHAT_RUNTIME_CONTRACT_VERSION;
	handle: AdmittedTurnHandleV1;
	userId: string;
	userMessageId: string;
	userMessage: string;
	context: AgenticChatTurnContextV1;
	attachments: readonly NormalizedChatAttachmentV1[];
	input: TInput;
};

export type AgenticChatTurnOutcome<TMetadata extends JsonObject = JsonObject> = {
	status: ChatTurnTerminalStatusV1;
	finishedReason: string;
	assistantText: string;
	assistantMessageId: string | null;
	metadata: TMetadata;
};

/**
 * Runtime event payloads derive from the current public chat union so extraction
 * cannot omit a supported wire variant. The generic remains open for a reviewed host
 * extension without weakening the default contract to an untyped record.
 */
export type AgenticChatRuntimeEvent<TPayload extends { type: string } = AgentSSEMessage> = TPayload;

export type AgenticChatStreamEvent<
	TPayload extends AgenticChatRuntimeEvent = AgenticChatRuntimeEvent
> = AgentStreamEventV1<TPayload>;

/**
 * One execution mode since one-engine stage S8, so the handle shape is already
 * the admitted shape. The runtime guard still holds: a handle with a blank
 * session or turn identity never reached durable admission.
 */
export function isAdmittedTurnHandle(handle: TurnHandleV1): handle is AdmittedTurnHandleV1 {
	return Boolean(handle.sessionId.trim() && handle.turnRunId.trim());
}
