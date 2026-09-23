// apps/worker/src/workers/agentic-chat/tools/read-tool-fence.ts
import type { AgenticChatTurnClaimResultV1 } from '@buildos/shared-types';
import { abortable, throwIfAborted } from '../shared/abortable-deadline';
import type { AgenticChatExecutionIdentityV1 } from '../turn/execution-control';

/**
 * Case 14 of the 2026-09-21 gate (turn 8f1ed224): four parallel reads each
 * issued their own `claim_agentic_chat_turn` within one millisecond. Every
 * claim takes the same exclusive turn-row lock, so the burst queued behind the
 * detached prompt-snapshot write and behind itself, and all four hit the
 * executor's overhead deadline before any tool ran.
 *
 * This shares one in-flight ownership check across a burst of identical
 * callers. It is single-flight, not a cache:
 *
 * - identity: only callers with the same turn, queue job, and processing token
 *   join; each still validates the receipt against its own expected claim.
 * - freshness: a settled check is never reused, a check that started more than
 *   the share window ago is never joined, and a check any subscriber has already
 *   abandoned (its deadline or parent cancellation fired first) is never joined,
 *   so a shared receipt is at most the window older than a private one would
 *   have been and never inherits a wait someone else has given up on. The window
 *   is shorter than the cancellation poll interval that already bounds
 *   silent-phase cancel latency, and the executor re-checks its own abort
 *   signal after the receipt.
 * - cancellation: a caller whose signal aborts rejects at once and never sees a
 *   later receipt. The shared request is aborted only when its last subscriber
 *   leaves, so one caller's deadline cannot cancel, or grant stale authority
 *   to, another caller.
 */
export const AGENTIC_CHAT_READ_TOOL_FENCE_SHARE_WINDOW_MS = 1_000;

export class AgenticChatReadToolFenceTimeoutError extends Error {
	readonly code = 'read_tool_fence_timeout';
	readonly failureClass = 'transient_infra' as const;

	constructor(timeoutMs: number) {
		super(`Agentic Chat read-tool fence claim exceeded its ${timeoutMs}ms overhead deadline`);
		this.name = 'AgenticChatReadToolFenceTimeoutError';
	}
}

export type AgenticChatReadToolFenceClaimPortV1 = {
	claim(
		input: AgenticChatExecutionIdentityV1,
		signal?: AbortSignal
	): Promise<AgenticChatTurnClaimResultV1>;
};

type InFlightClaim = {
	readonly key: string;
	readonly startedAtMs: number;
	readonly controller: AbortController;
	promise: Promise<AgenticChatTurnClaimResultV1>;
	subscribers: number;
	settled: boolean;
	/** A subscriber left before the check settled; later callers start their own. */
	abandoned: boolean;
};

export class AgenticChatSharedReadToolFenceV1 {
	private readonly inFlight = new Map<string, InFlightClaim>();
	private readonly shareWindowMs: number;
	private readonly now: () => number;

	constructor(
		private readonly port: AgenticChatReadToolFenceClaimPortV1,
		options: { shareWindowMs?: number; now?: () => number } = {}
	) {
		this.shareWindowMs = options.shareWindowMs ?? AGENTIC_CHAT_READ_TOOL_FENCE_SHARE_WINDOW_MS;
		if (!Number.isSafeInteger(this.shareWindowMs) || this.shareWindowMs < 0) {
			throw new Error(
				'Agentic Chat read-tool fence share window must be a non-negative integer'
			);
		}
		this.now = options.now ?? Date.now;
	}

	/** Checks currently in flight; exposed for tests and diagnostics only. */
	get inFlightCount(): number {
		return this.inFlight.size;
	}

	async claim(
		input: AgenticChatExecutionIdentityV1,
		signal: AbortSignal
	): Promise<AgenticChatTurnClaimResultV1> {
		throwIfAborted(signal);
		const entry = this.joinOrStart(input);
		entry.subscribers += 1;
		let released = false;
		const release = (reason: unknown) => {
			if (released) return;
			released = true;
			entry.subscribers -= 1;
			if (!entry.settled) entry.abandoned = true;
			if (entry.subscribers === 0 && !entry.settled && !entry.controller.signal.aborted) {
				entry.controller.abort(
					reason instanceof Error
						? reason
						: new Error('Agentic Chat read-tool fence claim lost its last subscriber')
				);
			}
		};
		const onAbort = () => release(signal.reason);
		signal.addEventListener('abort', onAbort, { once: true });
		try {
			const receipt = await abortable(entry.promise, signal);
			throwIfAborted(signal);
			return receipt;
		} finally {
			signal.removeEventListener('abort', onAbort);
			release(signal.reason);
		}
	}

	private joinOrStart(input: AgenticChatExecutionIdentityV1): InFlightClaim {
		const key = `${input.turnRunId}:${input.queueJobId}:${input.processingToken}`;
		const now = this.now();
		const existing = this.inFlight.get(key);
		if (
			existing &&
			!existing.settled &&
			!existing.abandoned &&
			!existing.controller.signal.aborted &&
			now - existing.startedAtMs <= this.shareWindowMs
		) {
			return existing;
		}

		const controller = new AbortController();
		let request: Promise<AgenticChatTurnClaimResultV1>;
		try {
			request = Promise.resolve(this.port.claim(input, controller.signal));
		} catch (error) {
			request = Promise.reject(error);
		}
		const entry: InFlightClaim = {
			key,
			startedAtMs: now,
			controller,
			promise: request,
			subscribers: 0,
			settled: false,
			abandoned: false
		};
		entry.promise = request.finally(() => {
			entry.settled = true;
			if (this.inFlight.get(key) === entry) this.inFlight.delete(key);
		});
		// Subscribers observe rejections through `abortable`; this only keeps an
		// abandoned request from surfacing as an unhandled rejection.
		void entry.promise.catch(() => undefined);
		this.inFlight.set(key, entry);
		return entry;
	}
}
