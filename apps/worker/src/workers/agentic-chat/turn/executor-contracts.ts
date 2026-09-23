// apps/worker/src/workers/agentic-chat/turn/executor-contracts.ts
//
// The turn executor's public contract: the ports it is composed with, the
// result it returns, and its default budgets. Every import here is type-only,
// so configuration can read the defaults without loading the executor.
import type {
	AgenticChatTerminalFinalizeRpcResultV1,
	AgenticChatTurnClaimResultV1,
	ChatTurnTerminalStatusV1,
	JsonObject
} from '@buildos/shared-types';
import type { AgenticChatCancellationObserver } from './cancellation-observer';
import type { AgenticChatExecutionControlPortV1 } from './execution-control';
import type {
	AgenticChatExecutionInputPortV1,
	AgenticChatWorkerExecutionInputV1
} from './execution-input';
import type { AgenticChatMutationExecutor } from '../mutations/mutation-executor';
import type { AgenticChatStreamPublisher } from '../stream/stream-publisher';
import type {
	AgenticChatControlDecisionAuthorV1,
	AgenticChatProviderPortV1,
	AgenticChatProviderStepV1,
	AgenticChatProviderUsageV1
} from '../provider/contracts';
import type { AgenticChatMonotonicClockV1 } from '../stream/runtime-timing';
import type {
	AgenticChatReadToolExecutionV1,
	AgenticChatToolExecutionPortV1
} from '../tools/tool-execution';
import type { AgenticChatExecutorEffectPortsV1 } from '../effects/executor-effects';
import type { AgenticChatSessionHandoffPortV1 } from './session-handoff';
import type { AgenticChatRawWorkflowTurnPortV1 } from '../workflow/raw-turn-preparation';

// The retained Phase 0 acceptance baseline reaches 245,137 ms, and independent
// semantic review adds one bounded provider pass. Production organization
// canaries have reached the former 270-second ceiling after completing every
// approved write. Preserve a 60-second finalization reserve below the
// 360-second worker timeout without adding deployment configuration.
export const DEFAULT_AGENTIC_CHAT_PROVIDER_BUDGET_MS = 300_000;
export const DEFAULT_AGENTIC_CHAT_EXECUTOR_OVERHEAD_TIMEOUT_MS = 10_000;
// Keep aligned with the legacy web loop defaults
// (apps/web/src/lib/services/agentic-chat-v2/limits.ts FASTCHAT_LIMITS).
export const DEFAULT_AGENTIC_CHAT_MAX_TOOL_ROUNDS = 16;
export const DEFAULT_AGENTIC_CHAT_MAX_TOOL_CALLS = 40;
export const DEFAULT_AGENTIC_CHAT_MAX_TOOL_CONCURRENCY = 4;

export type ExecutableClaim = Extract<
	AgenticChatTurnClaimResultV1,
	{ outcome: 'claimed' | 'matching_current_claim' }
>;
export type TerminalReceipt = Extract<
	AgenticChatTerminalFinalizeRpcResultV1,
	{ outcome: 'finalized' | 'already_terminal' }
>;

export type TerminalClaim = Pick<
	ExecutableClaim,
	'turnRunId' | 'queueJobId' | 'sessionId' | 'userId' | 'executionGeneration'
>;

export type AgenticChatTurnUsageV1 = AgenticChatProviderUsageV1;
export type AgenticChatTurnProviderStepV1 = AgenticChatProviderStepV1;
export type AgenticChatTurnProviderPortV1 = AgenticChatProviderPortV1;

export type AgenticChatReadToolProgressV1 = {
	/** One human-readable line, e.g. `Jev: not here (4%) → "Pricing" (91%)`. */
	message: string;
	/** Structured step for richer rendering; kept small (a few hundred bytes). */
	data: JsonObject;
};

/** Cap per tool call: each event is a durable row and a projection slot. */
export const AGENTIC_CHAT_MAX_READ_TOOL_PROGRESS_EVENTS = 16;

export type AgenticChatReadToolPortV1 = {
	execute(input: {
		toolName: string;
		arguments: JsonObject;
		providerToolCallId: string;
		processingToken?: string;
		/** Author of a control-tool decision; undefined for ordinary reads. */
		decidedBy?: AgenticChatControlDecisionAuthorV1;
		executionInput: AgenticChatWorkerExecutionInputV1;
		signal: AbortSignal;
		/**
		 * Best-effort live sub-steps for long reads (web_navigate). Never awaited
		 * by the tool; publication failures are dropped, never fatal to the tool.
		 */
		onProgress?: (progress: AgenticChatReadToolProgressV1) => void;
	}): Promise<AgenticChatReadToolExecutionV1>;
	prepareTurnToolBatchSecurity?(input: {
		userId: string;
		turnRunId: string;
		toolNames: readonly string[];
	}): void;
	completeTurnSecurityState?(userId: string, turnRunId: string): void;
};

export type PublisherPort = Pick<
	AgenticChatStreamPublisher,
	| 'registerTurn'
	| 'publishReconcileHint'
	| 'appendText'
	| 'enqueueSemantic'
	| 'publishSemantic'
	| 'flushTurn'
	| 'publishCommittedSemantic'
	| 'publishTerminal'
	| 'getSnapshot'
	| 'unregisterTurn'
	| 'abandonTurn'
>;

export type CancellationPort = Pick<
	AgenticChatCancellationObserver,
	'registerTurn' | 'unregisterTurn'
>;
export type MutationPort = Pick<AgenticChatMutationExecutor, 'execute'>;

export type AgenticChatTurnExecutionOutcomeV1 =
	| 'completed'
	| 'failed'
	| 'cancelled'
	| 'requeued'
	| 'terminal_reconciled'
	| 'stale_generation'
	| 'effect_reconciliation_required'
	| 'recovery_required';

export type AgenticChatTurnExecutionResultV1 = {
	outcome: AgenticChatTurnExecutionOutcomeV1;
	turnRunId: string;
	executionGeneration: number | null;
	terminalStatus: ChatTurnTerminalStatusV1 | null;
	queueReconciled: boolean;
};

/** Everything an executor is composed with; `host/composition-root` wires production. */
export type AgenticChatTurnExecutorPorts = AgenticChatExecutorEffectPortsV1 & {
	control: AgenticChatExecutionControlPortV1;
	input: AgenticChatExecutionInputPortV1;
	publisher: PublisherPort;
	cancellation: CancellationPort;
	provider: AgenticChatProviderPortV1;
	readTool: AgenticChatReadToolPortV1;
	toolExecutions: AgenticChatToolExecutionPortV1;
	sessionHandoff: AgenticChatSessionHandoffPortV1;
	mutation: MutationPort;
	/** Tasker 86: default-off preparation for `agentic_chat_input_v4` turns. */
	rawWorkflow?: AgenticChatRawWorkflowTurnPortV1;
	createId?: () => string;
	timingClock?: AgenticChatMonotonicClockV1;
};
