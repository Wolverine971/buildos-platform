// apps/web/src/lib/server/thread-chat/thread-chat-budget.ts
//
// What keeps a project thread going, and what stops it (tasker 152).
//
// Budgets: a thread starts with a small reading allowance and earns more by finding new
// material. Nobody upstream has to guess how much a project needs. Hard ceilings per thread,
// and a pool shared by every thread in the turn, keep one greedy thread from starving the rest
// or running up the bill. When anything runs out, the thread gets one "decide now" round, so it
// always reports.
//
// Model calls: one retry when a call fails or stalls before it produced anything, and a
// watchdog that ends a call that goes quiet. A call that fails after it started writing is not
// retried (its decisions are already in); the caller keeps what arrived.
//
// Pure apart from timers. No I/O.

export const THREAD_BUDGET = Object.freeze({
	/** Read rounds granted up front (the old fixed limit). */
	startReadRounds: 2,
	startReads: 4,
	/** Granted each time the last read round found something new. */
	extendReadRounds: 2,
	extendReads: 3,
	/** Hard ceilings for one thread. */
	maxReadRounds: 6,
	maxReads: 12,
	maxReadChars: 60_000,
	/** After this, the thread is told to decide with what it has. */
	softMs: 40_000,
	/** After this, the thread's model call is cut; decisions already made are kept. */
	hardMs: 75_000,
	/** A model call that sends nothing for this long is treated as stalled. */
	idleMs: 20_000
});

export const TURN_BUDGET = Object.freeze({
	/** Threads one message may start; the rest wait for the next message. */
	maxThreads: 5,
	/** Read rounds and read characters shared by every thread in the turn. */
	readRounds: 20,
	readChars: 160_000
});

/**
 * At most `max` threads per message: the projects with the most pieces first (ties keep message
 * order). The rest come back as `deferred`, for the reply to name.
 */
export function capThreads<T>(
	grouped: ReadonlyMap<string, T[]>,
	max: number = TURN_BUDGET.maxThreads
): { kept: Map<string, T[]>; deferred: [string, T[]][] } {
	const ranked = [...grouped].sort((a, b) => b[1].length - a[1].length);
	return { kept: new Map(ranked.slice(0, max)), deferred: ranked.slice(max) };
}

/** What is left for the whole turn. Threads draw from it as they read. */
export type TurnPool = { readRounds: number; readChars: number };

export function createTurnPool(): TurnPool {
	return { readRounds: TURN_BUDGET.readRounds, readChars: TURN_BUDGET.readChars };
}

export type ThreadBudget = {
	readRounds: number;
	allowedReadRounds: number;
	reads: number;
	allowedReads: number;
	readChars: number;
	extensions: number;
};

export function createThreadBudget(): ThreadBudget {
	return {
		readRounds: 0,
		allowedReadRounds: THREAD_BUDGET.startReadRounds,
		reads: 0,
		allowedReads: THREAD_BUDGET.startReads,
		readChars: 0,
		extensions: 0
	};
}

/** What the last read round brought in: reads that returned text the thread didn't have. */
export type RoundYield = { fresh: number; freshChars: number };

export type WrapReason = 'time' | 'budget' | 'pool' | 'size';

export type BudgetVerdict =
	| { action: 'read' }
	| { action: 'extend' }
	| { action: 'wrap'; reason: WrapReason };

/**
 * Before each model round after the first: may the thread keep reading?
 * Extending is earned: the last read round must have found something new.
 */
export function nextBudget(
	budget: ThreadBudget,
	last: RoundYield | null,
	pool: TurnPool,
	elapsedMs: number
): BudgetVerdict {
	if (elapsedMs >= THREAD_BUDGET.softMs) return { action: 'wrap', reason: 'time' };
	if (pool.readRounds <= 0 || pool.readChars <= 0) return { action: 'wrap', reason: 'pool' };
	if (budget.readChars >= THREAD_BUDGET.maxReadChars) return { action: 'wrap', reason: 'size' };
	if (budget.readRounds < budget.allowedReadRounds && budget.reads < budget.allowedReads)
		return { action: 'read' };
	const room =
		budget.allowedReadRounds < THREAD_BUDGET.maxReadRounds &&
		budget.allowedReads < THREAD_BUDGET.maxReads;
	if (room && last && last.fresh > 0) return { action: 'extend' };
	return { action: 'wrap', reason: 'budget' };
}

export function extendBudget(budget: ThreadBudget): void {
	budget.allowedReadRounds = Math.min(
		THREAD_BUDGET.maxReadRounds,
		Math.max(budget.allowedReadRounds, budget.readRounds) + THREAD_BUDGET.extendReadRounds
	);
	budget.allowedReads = Math.min(
		THREAD_BUDGET.maxReads,
		Math.max(budget.allowedReads, budget.reads) + THREAD_BUDGET.extendReads
	);
	budget.extensions += 1;
}

/** Whether one more read fits this thread and the turn. */
export function readFits(budget: ThreadBudget, pool: TurnPool): boolean {
	return (
		budget.reads < budget.allowedReads &&
		budget.readChars < THREAD_BUDGET.maxReadChars &&
		pool.readChars > 0
	);
}

const WRAP_WHY: Record<WrapReason, string> = {
	time: 'Time is up for reading.',
	budget: "That's the reading budget for this project.",
	pool: 'The other projects in this message need the rest of the reading budget.',
	size: "That's as much text as one project may read in a message."
};

/** The "decide now" message. It asks in words: some fast hosts reject tool_choice "none". */
export function wrapMessage(reason: WrapReason): string {
	return `${WRAP_WHY[reason]} No more reads. Write one decision line per piece now with what you have. For anything you couldn't check, use "sure":false and ask. Then the keep line.`;
}

export function wrapLabel(reason: WrapReason): string {
	return reason === 'time'
		? 'Out of time for reading; deciding now'
		: reason === 'budget'
			? 'Enough reading; deciding now'
			: reason === 'pool'
				? 'Sharing the budget with the other projects; deciding now'
				: 'Read the most text allowed; deciding now';
}

// ---------------------------------------------------------------------------
// Model calls: watchdog and one retry
// ---------------------------------------------------------------------------

export class ModelCallError extends Error {
	constructor(
		message: string,
		/** The call had already produced text or tool calls when it failed. */
		readonly produced: boolean,
		readonly stalled: boolean
	) {
		super(message);
	}
}

/**
 * Runs one streamed model call. A call that fails or goes quiet before producing anything is
 * tried once more. `onEvent` sees every event of the attempt that counts.
 */
export async function runModelCall<E>(input: {
	open: (signal: AbortSignal) => AsyncIterable<E>;
	onEvent: (event: E) => void;
	/** The event carries model output (text or a tool call). */
	isOutput: (event: E) => boolean;
	/** The event reports a failure; returns its message. */
	errorOf: (event: E) => string | null;
	signal?: AbortSignal;
	idleMs?: number;
	retries?: number;
	onRetry?: (reason: string) => void;
}): Promise<{ attempts: number }> {
	const retries = input.retries ?? 1;
	const idleMs = input.idleMs ?? THREAD_BUDGET.idleMs;
	for (let attempt = 0; ; attempt += 1) {
		const controller = new AbortController();
		const stop = () => controller.abort();
		input.signal?.addEventListener('abort', stop, { once: true });
		let stalled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const arm = () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				stalled = true;
				controller.abort();
			}, idleMs);
		};
		let produced = false;
		// Each next() races the abort: a stream stuck on something that ignores the signal
		// still ends when the watchdog or the deadline fires.
		const aborted = new Promise<never>((_, reject) => {
			const fail = () => reject(new Error('aborted'));
			if (controller.signal.aborted) fail();
			else controller.signal.addEventListener('abort', fail, { once: true });
		});
		aborted.catch(() => undefined);
		const iterator = input.open(controller.signal)[Symbol.asyncIterator]();
		try {
			arm();
			for (;;) {
				const next = await Promise.race([iterator.next(), aborted]);
				if (next.done) break;
				const event = next.value;
				arm();
				const failure = input.errorOf(event);
				if (failure) throw new Error(failure);
				if (input.isOutput(event)) produced = true;
				input.onEvent(event);
			}
			// Some streams end quietly when aborted (smart-llm returns on AbortError), so an
			// abort that ended the stream is a failure, never a success.
			if (stalled) throw new Error('The model stopped responding');
			if (controller.signal.aborted) throw new Error('aborted');
			return { attempts: attempt + 1 };
		} catch (error) {
			if (input.signal?.aborted) throw error;
			const message = stalled
				? 'The model stopped responding'
				: error instanceof Error
					? error.message
					: 'Model call failed';
			if (produced || attempt >= retries)
				throw new ModelCallError(message, produced, stalled);
			input.onRetry?.(message);
			await new Promise((resolve) => setTimeout(resolve, 300));
		} finally {
			if (timer) clearTimeout(timer);
			input.signal?.removeEventListener('abort', stop);
			// Let a stuck generator go; don't wait for it.
			void Promise.resolve(iterator.return?.()).catch(() => undefined);
		}
	}
}

/** An AbortSignal that fires when the parent does or after `ms`, and says which. */
export function deadlineSignal(
	parent: AbortSignal | undefined,
	ms: number
): { signal: AbortSignal; timedOut: () => boolean; clear: () => void } {
	const controller = new AbortController();
	let expired = false;
	const stop = () => controller.abort();
	if (parent?.aborted) controller.abort();
	parent?.addEventListener('abort', stop, { once: true });
	const timer = setTimeout(() => {
		expired = true;
		controller.abort();
	}, ms);
	return {
		signal: controller.signal,
		timedOut: () => expired,
		clear: () => {
			clearTimeout(timer);
			parent?.removeEventListener('abort', stop);
		}
	};
}
