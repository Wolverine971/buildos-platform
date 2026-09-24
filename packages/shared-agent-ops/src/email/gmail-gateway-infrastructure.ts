// packages/shared-agent-ops/src/email/gmail-gateway-infrastructure.ts
export type BoundedJsonReadPolicy = Readonly<{
	emptyBody: () => unknown;
	responseTooLargeError: () => Error;
	invalidJsonError: () => Error;
}>;

/** Reads a response body as UTF-8 text, refusing anything over `maxBytes`. */
export async function readTextBounded(
	response: Response,
	maxBytes: number,
	responseTooLargeError: () => Error
): Promise<string> {
	const contentLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > maxBytes) {
		throw responseTooLargeError();
	}
	if (!response.body) return '';
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		received += value.byteLength;
		if (received > maxBytes) {
			await reader.cancel();
			throw responseTooLargeError();
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

export type MultipartHttpPart = {
	/** Content-ID of the part with the `response-` prefix and angle brackets removed. */
	contentId: string | null;
	/** Status code of the embedded HTTP response, or null when the part is malformed. */
	status: number | null;
	body: string;
};

/**
 * Splits a `multipart/mixed` batch response (Google's batch HTTP format) into
 * its embedded HTTP responses. Each part is a MIME header block, a blank line,
 * then an HTTP status line, headers, a blank line, and the body.
 */
export function parseMultipartHttpResponse(body: string, boundary: string): MultipartHttpPart[] {
	const delimiter = `--${boundary}`;
	const parts: MultipartHttpPart[] = [];
	for (const rawPart of body.split(delimiter).slice(1)) {
		if (rawPart.startsWith('--')) break; // closing delimiter
		const part = rawPart.replace(/^\r?\n/, '');
		const mimeEnd = part.search(/\r?\n\r?\n/);
		if (mimeEnd === -1) continue;
		const mimeHeaders = part.slice(0, mimeEnd);
		const contentIdMatch = /^content-id:\s*<?([^>\r\n]*)>?\s*$/im.exec(mimeHeaders);
		const contentId = contentIdMatch?.[1]?.trim().replace(/^response-/, '') ?? null;
		const httpPart = part.slice(mimeEnd).replace(/^(\r?\n)+/, '');
		const statusMatch = /^HTTP\/[\d.]+\s+(\d{3})/.exec(httpPart);
		const headersEnd = httpPart.search(/\r?\n\r?\n/);
		parts.push({
			contentId,
			status: statusMatch ? Number(statusMatch[1]) : null,
			body:
				headersEnd === -1
					? ''
					: httpPart
							.slice(headersEnd)
							.replace(/^(\r?\n)+/, '')
							.trimEnd()
		});
	}
	return parts;
}

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
