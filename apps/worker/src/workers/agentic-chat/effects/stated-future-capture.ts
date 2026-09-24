// apps/worker/src/workers/agentic-chat/effects/stated-future-capture.ts
import type { AgenticChatEffectControlPortV1 } from './effect-control';
import type { AgenticChatWorkerExecutionInputV1 } from '../turn/execution-input';

/**
 * Stated-future capture is retired: it had no structured trigger.
 *
 * The 2026-07-26 forward-carry floor created a follow-up task on its own when
 * the user's message matched phrases such as "waiting to hear back" or
 * "blocked on", and the turn wrote something without creating a new record.
 * The trigger was a regex over the user's words, which AGENTS.md ("Never
 * classify language with regex") rules out. It also contradicted the acting
 * model's commission rule (ACTOR_COMMISSION_GUIDANCE): the model carries a
 * stated next step on the matched entity instead of creating a separate one,
 * so a correct turn still got a duplicate follow-up task.
 *
 * Stated futures now reach durable state through the acting model (the next
 * step written onto the completed entity) and through chat checkpoint
 * capture, which records the user's words in the thinking log and START HERE
 * "Current state". The trade-off is that no task is created automatically
 * when the model records nothing; checkpoint capture lands minutes later, not
 * inside the turn.
 *
 * The port stays so the composition root keeps its shape; `capture` never
 * reads the message or writes. Re-enable only from a structured signal, for
 * example a follow-up field the acting model sets on its write. The fenced
 * effect implementation is in git history (before 2026-09-23).
 */
export type AgenticChatStatedFutureCaptureRpcClient = {
	rpc(name: string, args: Record<string, unknown>): PromiseLike<unknown>;
};

export type AgenticChatStatedFutureCaptureResultV1 = {
	status: 'skipped';
	reason: 'no_structured_signal';
};

export type AgenticChatStatedFutureCapturePortV1 = {
	capture(input: {
		executionInput: AgenticChatWorkerExecutionInputV1;
		processingToken: string;
		signal: AbortSignal;
	}): Promise<AgenticChatStatedFutureCaptureResultV1>;
};

export class SupabaseAgenticChatStatedFutureCaptureAdapter
	implements AgenticChatStatedFutureCapturePortV1
{
	constructor(
		_client: AgenticChatStatedFutureCaptureRpcClient,
		_control: AgenticChatEffectControlPortV1,
		_options: { timeoutMs?: number; maximumAdapterAttempts?: number } = {}
	) {}

	capture(
		_input: Parameters<AgenticChatStatedFutureCapturePortV1['capture']>[0]
	): Promise<AgenticChatStatedFutureCaptureResultV1> {
		return Promise.resolve({ status: 'skipped', reason: 'no_structured_signal' });
	}
}
