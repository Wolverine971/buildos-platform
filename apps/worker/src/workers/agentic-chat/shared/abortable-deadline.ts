// apps/worker/src/workers/agentic-chat/shared/abortable-deadline.ts
export type AbortableDeadlineInput<T> = {
	parentSignal: AbortSignal;
	timeoutMs: number;
	createTimeoutError(): Error;
	run(signal: AbortSignal): PromiseLike<T>;
};

/**
 * Bound one network operation and propagate both the parent cancellation and
 * the local deadline to clients that support AbortSignal.
 */
export async function runWithAbortableDeadline<T>(input: AbortableDeadlineInput<T>): Promise<T> {
	if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1) {
		throw new Error('Abortable deadline timeoutMs must be a positive integer');
	}
	throwIfAborted(input.parentSignal);

	const controller = new AbortController();
	const onParentAbort = () =>
		controller.abort(abortReason(input.parentSignal, 'Parent execution aborted'));
	input.parentSignal.addEventListener('abort', onParentAbort, { once: true });
	const timer = setTimeout(() => controller.abort(input.createTimeoutError()), input.timeoutMs);

	try {
		return await abortable(Promise.resolve(input.run(controller.signal)), controller.signal);
	} finally {
		clearTimeout(timer);
		input.parentSignal.removeEventListener('abort', onParentAbort);
	}
}

/**
 * Reject as soon as `signal` aborts, with the signal's own reason when it has
 * one. Shared by the executor and its effect facade so both observe the same
 * cancellation value.
 */
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	throwIfAborted(signal);
	return new Promise<T>((resolve, reject) => {
		const cleanup = () => signal.removeEventListener('abort', onAbort);
		const onAbort = () => {
			cleanup();
			reject(signal.reason ?? new Error('Execution aborted'));
		};
		signal.addEventListener('abort', onAbort, { once: true });
		void promise.then(
			(value) => {
				cleanup();
				resolve(value);
			},
			(error) => {
				cleanup();
				reject(error);
			}
		);
	});
}

/**
 * Wait for `promise` to settle or for `timeoutMs` to pass, whichever comes
 * first, and never reject. Resolves true when the promise settled in time. The
 * timer is unref'd so a pending wait never holds the process open.
 */
export async function settleWithin(
	promise: PromiseLike<unknown>,
	timeoutMs: number
): Promise<boolean> {
	let timer: NodeJS.Timeout | null = null;
	const deadline = new Promise<false>((resolve) => {
		timer = setTimeout(() => resolve(false), timeoutMs);
		timer.unref?.();
	});
	try {
		return await Promise.race([
			Promise.resolve(promise).then(
				() => true,
				() => true
			),
			deadline
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

/** Throw the signal's own Error reason, or a generic one, once it has aborted. */
export function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) throw abortReason(signal, 'Execution aborted');
}

function abortReason(signal: AbortSignal, fallback: string): Error {
	return signal.reason instanceof Error ? signal.reason : new Error(fallback);
}
