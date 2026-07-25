// apps/web/src/lib/utils/bind-abort-signal.ts
function createAbortError(): Error {
	try {
		return new DOMException('The operation was aborted.', 'AbortError');
	} catch (_error) {
		const error = new Error('The operation was aborted.');
		error.name = 'AbortError';
		return error;
	}
}

/** Reject a promise consumer on abort without cancelling the shared underlying work. */
export function bindAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return promise;
	if (signal.aborted) {
		return Promise.reject(createAbortError());
	}

	return new Promise<T>((resolve, reject) => {
		const onAbort = () => {
			signal.removeEventListener('abort', onAbort);
			reject(createAbortError());
		};

		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener('abort', onAbort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener('abort', onAbort);
				reject(error);
			}
		);
	});
}
