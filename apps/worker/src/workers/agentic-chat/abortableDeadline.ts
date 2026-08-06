// apps/worker/src/workers/agentic-chat/abortableDeadline.ts
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

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	throwIfAborted(signal);
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(abortReason(signal, 'Execution aborted'));
		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
	});
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) throw abortReason(signal, 'Execution aborted');
}

function abortReason(signal: AbortSignal, fallback: string): Error {
	return signal.reason instanceof Error ? signal.reason : new Error(fallback);
}
