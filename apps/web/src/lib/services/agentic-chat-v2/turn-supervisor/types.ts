// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/types.ts
import type { ChatContextType } from '@buildos/shared-types';
import type { FastAgentStreamUsage } from '../types';
import type { TurnSupervisorEntityIndexInput } from './entity-index';

export type TurnSupervisorRisk =
	| 'long_silence'
	| 'many_tool_calls'
	| 'repeated_failures'
	| 'low_novelty_reads'
	| 'near_tool_budget'
	| 'tools_without_final_answer'
	| 'empty_final_candidate';

export type TurnSupervisorObservation =
	| { type: 'turn_started'; at?: number }
	| { type: 'assistant_text_delta'; chars: number; at?: number }
	| {
			type: 'llm_pass_completed';
			pass: number;
			finishedReason?: string;
			usage?: FastAgentStreamUsage;
			at?: number;
	  }
	| {
			type: 'tool_call_emitted';
			toolName: string;
			toolCallId: string;
			argsPreview?: unknown;
			at?: number;
	  }
	| {
			type: 'tool_result_received';
			toolName: string;
			toolCallId: string;
			success: boolean;
			skipped?: boolean;
			error?: string | null;
			resultSummary?: string | null;
			at?: number;
	  }
	| { type: 'tool_round_completed'; round: number; toolCallsMade: number; at?: number }
	| {
			type: 'long_running_operation';
			operation: 'tool_execution' | 'llm_stream';
			toolName?: string;
			toolCallId?: string;
			elapsedMs: number;
			at?: number;
	  }
	| { type: 'final_candidate'; text: string; finishedReason?: string; at?: number }
	| { type: 'stream_detached'; at?: number }
	| { type: 'turn_finished'; finishedReason?: string; at?: number };

export type TurnDigest = {
	turnRunId: string | null;
	sessionId: string;
	userId: string;
	contextType: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	userMessage: string;

	elapsedMs: number;
	msSinceVisibleText: number | null;
	assistantTextChars: number;
	finalCandidateChars: number;

	llmPassCount: number;
	toolRoundCount: number;
	toolCallCount: number;
	validationFailureCount: number;

	recentTools: Array<{
		sequence: number;
		toolName: string;
		canonicalOp?: string | null;
		argsFingerprint?: string | null;
		idArgs?: Record<string, string>;
		success?: boolean | null;
		skipped?: boolean | null;
		errorClass?: string | null;
		resultSummary?: string | null;
	}>;

	progress: {
		successfulWrites: number;
		failedWrites: number;
		readRounds: number;
		lowNoveltyReadRounds: number;
		repeatedToolPatternCount: number;
		repeatedFailureCount: number;
		discoveredEntityCount: number;
	};

	risks: TurnSupervisorRisk[];
};

export type TurnCheckpointPayload = {
	digest: TurnDigest;
	resumeContext: Record<string, unknown>;
};

export type TurnSupervisorDecision =
	| { action: 'continue'; reason?: string }
	| { action: 'emit_status'; message: string; reason: string }
	| { action: 'force_synthesis'; instruction: string; reason: string }
	| {
			action: 'inject_recovery_instruction';
			instruction: string;
			reason: string;
			toolCallId?: string;
			blockToolCall?: boolean;
	  }
	| { action: 'ask_user'; question: string; checkpoint: TurnCheckpointPayload; reason: string }
	| { action: 'stop_with_message'; message: string; reason: string; finishedReason: string }
	| { action: 'flag_eval'; reason: string };

export type TurnSupervisorDecisionRecord = {
	decision: TurnSupervisorDecision;
	digest: TurnDigest;
	at: string;
	source?: 'monitor';
	trigger?: TurnSupervisorDecisionTrigger;
};

export type TurnSupervisor = {
	observe(observation: TurnSupervisorObservation): TurnSupervisorDecision[];
	getDigest(): TurnDigest;
};

// Telemetry classification for supervisor decisions. (Previously named
// TurnSupervisorJudgeTrigger — the optional LLM judge was removed 2026-06-11;
// restore from commit aa585535 if it's ever needed again.)
export type TurnSupervisorDecisionTrigger =
	| 'long_silence'
	| 'long_running_operation'
	| 'repeated_failures'
	| 'many_tool_calls'
	| 'low_novelty_reads'
	| 'near_tool_budget'
	| 'failed_write_recovery'
	| 'empty_final_candidate';

export type TurnSupervisorConfig = {
	statusSilenceMs?: number;
	repeatedStatusIntervalMs?: number;
	maxStatusUpdates?: number;
	toolRunningStatusMs?: number;
	forceSynthesisAfterToolCalls?: number;
	forceSynthesisAfterReadRounds?: number;
	maxToolRounds?: number;
	askUserAfterRepeatedValidationFailures?: number;
};

export type TurnSupervisorCreateParams = {
	turnRunId?: string | null;
	sessionId: string;
	userId: string;
	contextType: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	userMessage: string;
	entityIndex?: TurnSupervisorEntityIndexInput;
	config?: TurnSupervisorConfig;
};
