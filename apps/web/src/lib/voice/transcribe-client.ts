// apps/web/src/lib/voice/transcribe-client.ts
//
// One POST to /api/transcribe for one audio segment, with a client-side
// ceiling and errors classified so the queue knows what is worth retrying.

export class TranscriptionRequestError extends Error {
	readonly status?: number;
	readonly retryable: boolean;
	readonly retryAfterMs?: number;

	constructor(
		message: string,
		options: { status?: number; retryable: boolean; retryAfterMs?: number }
	) {
		super(message);
		this.name = 'TranscriptionRequestError';
		this.status = options.status;
		this.retryable = options.retryable;
		this.retryAfterMs = options.retryAfterMs;
	}
}

export interface TranscriptResult {
	text: string;
	model: string | null;
}

export interface RequestTranscriptOptions {
	endpoint?: string;
	vocabulary?: string;
	/** Text spoken just before this audio, so the model keeps names and style. */
	context?: string;
	signal?: AbortSignal;
	timeoutMs: number;
	fetchImpl?: typeof fetch;
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const MIME_EXTENSIONS: Record<string, string> = {
	'audio/webm': 'webm',
	'audio/ogg': 'ogg',
	'audio/mp4': 'm4a',
	'audio/aac': 'm4a',
	'audio/wav': 'wav',
	'audio/mpeg': 'mp3'
};

export function extensionForMimeType(mimeType: string): string {
	const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
	return MIME_EXTENSIONS[base] ?? 'webm';
}

function combineSignals(signals: AbortSignal[]): { signal: AbortSignal; dispose: () => void } {
	const controller = new AbortController();
	const listeners: Array<() => void> = [];
	for (const signal of signals) {
		if (signal.aborted) {
			controller.abort(signal.reason);
			break;
		}
		const onAbort = () => controller.abort(signal.reason);
		signal.addEventListener('abort', onAbort, { once: true });
		listeners.push(() => signal.removeEventListener('abort', onAbort));
	}
	return { signal: controller.signal, dispose: () => listeners.forEach((fn) => fn()) };
}

function parseRetryAfterMs(response: Response, payload: unknown): number | undefined {
	const header = response.headers.get('retry-after');
	const headerSeconds = header ? Number(header) : NaN;
	if (Number.isFinite(headerSeconds) && headerSeconds > 0) return headerSeconds * 1000;
	const details = (payload as { details?: { retryAfter?: unknown } } | null)?.details;
	const bodySeconds = Number(details?.retryAfter);
	return Number.isFinite(bodySeconds) && bodySeconds > 0 ? bodySeconds * 1000 : undefined;
}

export async function requestTranscript(
	audio: Blob,
	options: RequestTranscriptOptions
): Promise<TranscriptResult> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const mimeType = audio.type || 'audio/webm';
	const formData = new FormData();
	formData.append(
		'audio',
		new File([audio], `segment.${extensionForMimeType(mimeType)}`, { type: mimeType })
	);
	if (options.vocabulary?.trim()) formData.append('vocabularyTerms', options.vocabulary.trim());
	if (options.context?.trim()) formData.append('context', options.context.trim());
	formData.append('allowEmpty', 'true');

	const timeout = new AbortController();
	const timer = setTimeout(
		() => timeout.abort(new DOMException('Transcription timed out', 'TimeoutError')),
		options.timeoutMs
	);
	const combined = combineSignals(
		options.signal ? [options.signal, timeout.signal] : [timeout.signal]
	);

	let response: Response;
	try {
		response = await fetchImpl(options.endpoint ?? '/api/transcribe', {
			method: 'POST',
			body: formData,
			signal: combined.signal
		});
	} catch (error) {
		if (options.signal?.aborted) throw error;
		const timedOut = timeout.signal.aborted;
		throw new TranscriptionRequestError(
			timedOut ? 'Transcription timed out' : 'Network error while transcribing',
			{ retryable: true }
		);
	} finally {
		clearTimeout(timer);
		combined.dispose();
	}

	let payload: any = null;
	try {
		payload = await response.json();
	} catch {
		payload = null;
	}

	if (!response.ok) {
		const message =
			(typeof payload?.error === 'string' && payload.error) ||
			`Transcription failed (${response.status})`;
		throw new TranscriptionRequestError(message, {
			status: response.status,
			retryable: RETRYABLE_STATUSES.has(response.status),
			retryAfterMs: parseRetryAfterMs(response, payload)
		});
	}

	const data = payload?.success && payload?.data ? payload.data : payload;
	const text = typeof data?.transcript === 'string' ? data.transcript.trim() : '';
	return {
		text,
		model: typeof data?.transcription_model === 'string' ? data.transcription_model : null
	};
}
