import type {
	AgentSSEMessage,
	AgentStreamEventV1,
	ChatTurnTerminalStatusV1,
	JsonObject,
	NormalizedChatAttachmentV1,
	TurnHandleV1
} from '@buildos/shared-types';

export const AGENTIC_CHAT_RUNTIME_CONTRACT_VERSION = 'agentic_chat_runtime_v1' as const;

export type AdmittedTurnHandleV1 =
	| (Omit<Extract<TurnHandleV1, { executionMode: 'legacy_sse' }>, 'sessionId' | 'turnRunId'> & {
			sessionId: string;
			turnRunId: string;
	  })
	| Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>;

export type AgenticChatTurnContextV1 = {
	type: string;
	entityId: string | null;
	projectId: string | null;
};

/**
 * Transport-neutral input to one admitted turn execution.
 *
 * Host adapters retain ownership of authentication, HTTP parsing, admission,
 * and transport setup. `input` carries adapter-specific retained or legacy
 * input until the shared artifact contract is wired through both modes.
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
 * cannot omit a legacy variant. The generic remains open for a reviewed host
 * extension without weakening the default contract to an untyped record.
 */
export type AgenticChatRuntimeEvent<TPayload extends { type: string } = AgentSSEMessage> = TPayload;

export type AgenticChatStreamEvent<
	TPayload extends AgenticChatRuntimeEvent = AgenticChatRuntimeEvent
> = AgentStreamEventV1<TPayload>;

export function isAdmittedTurnHandle(handle: TurnHandleV1): handle is AdmittedTurnHandleV1 {
	return Boolean(handle.sessionId?.trim() && handle.turnRunId?.trim());
}
