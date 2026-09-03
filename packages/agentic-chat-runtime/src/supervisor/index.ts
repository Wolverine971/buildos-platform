// packages/agentic-chat-runtime/src/supervisor/index.ts
export { createDeterministicTurnSupervisor } from './deterministic-supervisor';
export {
	buildToolPatternKey,
	classifyToolError,
	classifyToolExecution,
	extractCanonicalOp,
	isLikelyReadToolName,
	isLikelyWriteToolName,
	parseToolArguments,
	summarizeToolArguments,
	summarizeToolResult
} from './digest';
export {
	buildTurnSupervisorEntityIndexFromContextData,
	findEntityIndexEntry,
	normalizeEntityKind,
	normalizeTurnSupervisorEntityIndex
} from './entity-index';
/**
 * @deprecated The finalization guard is terminal-text integrity, not supervision.
 * It lives in `@buildos/agentic-chat-runtime/loop`; this re-export exists only
 * for the web `turn-supervisor/finalization-guard.ts` shim.
 */
export {
	applyFinalizationGuard,
	type FinalizationGuardFinishedReason,
	type FinalizationGuardReason,
	type FinalizationGuardResult
} from '../loop/finalization-guard';
export {
	AGENTIC_CHAT_SUPERVISOR_BLOCKED_RETRY_ERROR_V1,
	buildTurnStatusMessage
} from './status-messages';
export type {
	TurnDigest,
	TurnSupervisor,
	TurnSupervisorConfig,
	TurnSupervisorCreateParams,
	TurnSupervisorDecision,
	TurnSupervisorDecisionRecord,
	TurnSupervisorDecisionTrigger,
	TurnSupervisorObservation,
	TurnSupervisorRisk,
	TurnSupervisorUsage
} from './types';
export type {
	TurnSupervisorEntityIndexEntry,
	TurnSupervisorEntityIndexInput
} from './entity-index';
