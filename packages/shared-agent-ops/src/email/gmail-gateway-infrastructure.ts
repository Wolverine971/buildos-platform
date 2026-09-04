// packages/shared-agent-ops/src/email/gmail-gateway-infrastructure.ts
export type BoundedJsonReadPolicy = Readonly<{
	emptyBody: () => unknown;
	responseTooLargeError: () => Error;
	invalidJsonError: () => Error;
}>;

export async function readJsonBounded(
	response: Response,
	maxBytes: number,
	policy: BoundedJsonReadPolicy
): Promise<unknown> {
	const contentLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > maxBytes) {
		throw policy.responseTooLargeError();
	}

	if (!response.body) return policy.emptyBody();
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		received += value.byteLength;
		if (received > maxBytes) {
			await reader.cancel();
			throw policy.responseTooLargeError();
		}
		chunks.push(value);
	}

	const bytes = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}

	try {
		return JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw policy.invalidJsonError();
	}
}

export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	concurrency: number,
	mapper: (item: T) => Promise<R>,
	options: { signal?: AbortSignal } = {}
): Promise<R[]> {
	if (!Number.isInteger(concurrency) || concurrency <= 0) {
		throw new RangeError('Concurrency must be a positive integer');
	}

	const results = new Array<R>(items.length);
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(items.length, concurrency) }, async () => {
		while (nextIndex < items.length) {
			if (options.signal?.aborted) break;
			const index = nextIndex++;
			results[index] = await mapper(items[index]!);
		}
	});
	await Promise.all(workers);
	return results;
}
