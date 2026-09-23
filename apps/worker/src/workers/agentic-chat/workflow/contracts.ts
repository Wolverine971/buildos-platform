// apps/worker/src/workers/agentic-chat/workflow/contracts.ts
// Small host-facing workflow contracts, so host configuration does not import the runner.
import type { AgenticChatWorkflowStepKeyV1 } from '@buildos/shared-types';

/**
 * Host-owned hidden reasoning per step. `none` sends `reasoning: { enabled: false }`, which
 * DeepSeek V4.1 Flash honors (Tasker 98 replay, 2026-09-23: 0 reasoning tokens) where it ignores
 * `effort`. A step left out keeps its definition's frozen setting (`low`); definitions are not
 * edited because published snapshots must equal the host baseline.
 */
export type AgenticChatWorkflowReasoningPolicyV1 = Readonly<
	Partial<Record<AgenticChatWorkflowStepKeyV1, 'low' | 'none'>>
>;
