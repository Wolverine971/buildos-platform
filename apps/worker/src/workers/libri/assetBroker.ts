const BROKER_PATH = '/api/internal/libri/ocr-assets/redeem';
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 250;
const MAX_TIMEOUT_MS = 10_000;
const GRANT_EXPIRY_MARGIN_MS = 2_000;
const MAX_GRANT_TTL_MS = 65_000;
const MAX_RESPONSE_BYTES = 8 * 1024;
const MAX_SIGNED_URL_LENGTH = 4_096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type LibriAssetMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export type RedeemLibriOcrAssetGrantInput = {
	grantId: string;
	expiresAt: string;
	signal: AbortSignal;
};

export type RedeemLibriOcrAssetGrantReceipt = {
	signedUrl: string;
	mimeType: LibriAssetMimeType;
};

export type LibriAssetBrokerPort = {
	redeemOcrAssetGrant(
		input: RedeemLibriOcrAssetGrantInput
	): Promise<RedeemLibriOcrAssetGrantReceipt>;
};

export type LibriAssetBrokerOptions = {
	endpointUrl: string;
	bearerToken: string;
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
	now?: () => number;
};

export class LibriAssetBrokerError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly retryable: boolean,
		readonly requiresFreshGrant: boolean,
		readonly httpStatus?: number
	) {
		super(message);
		this.name = 'LibriAssetBrokerError';
	}
}

export function createLibriAssetBroker(options: LibriAssetBrokerOptions): LibriAssetBrokerPort {
	const endpointUrl = normalizeEndpointUrl(options.endpointUrl);
	const bearerToken = normalizeBearerToken(options.bearerToken);
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	assertBoundedInteger(timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, 'timeoutMs');
	const fetchImpl = options.fetchImpl ?? fetch;
	const now = options.now ?? Date.now;

	return {
		async redeemOcrAssetGrant(input) {
			validateInput(input);
			const remainingMs = Date.parse(input.expiresAt) - now();
			if (
				!Number.isFinite(remainingMs) ||
				remainingMs <= GRANT_EXPIRY_MARGIN_MS ||
				remainingMs > MAX_GRANT_TTL_MS
			) {
				throw new LibriAssetBrokerError(
					'broker_grant_expired',
					'Libri OCR asset grant is outside its redemption window',
					true,
					true
				);
			}

			const attemptTimeoutMs = Math.max(
				1,
				Math.min(timeoutMs, remainingMs - GRANT_EXPIRY_MARGIN_MS)
			);
			const attempt = createAttemptSignal(input.signal, attemptTimeoutMs);
			if (attempt.signal.aborted) {
				attempt.cleanup();
				throw new LibriAssetBrokerError(
					'broker_aborted',
					'Libri OCR asset broker request was aborted',
					true,
					false
				);
			}

			try {
				const response = await fetchImpl(endpointUrl, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${bearerToken}`,
						Accept: 'application/json',
						'Content-Type': 'application/json',
						'Cache-Control': 'no-store'
					},
					body: JSON.stringify({ grantId: input.grantId }),
					signal: attempt.signal
				});

				if (!response.ok) {
					await response.body?.cancel().catch(() => undefined);
					throw classifyHttpFailure(response.status);
				}

				const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim();
				if (contentType !== 'application/json') {
					await response.body?.cancel().catch(() => undefined);
					throw invalidResponse('Libri OCR asset broker did not return JSON');
				}
				const declaredLength = response.headers.get('content-length');
				if (
					declaredLength !== null &&
					(!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_RESPONSE_BYTES)
				) {
					await response.body?.cancel().catch(() => undefined);
					throw invalidResponse(
						'Libri OCR asset broker response exceeded its size limit'
					);
				}

				const body = await readBoundedResponseText(response, MAX_RESPONSE_BYTES);
				if (body.truncated) {
					throw invalidResponse(
						'Libri OCR asset broker response exceeded its size limit'
					);
				}
				let payload: unknown;
				try {
					payload = JSON.parse(body.text);
				} catch {
					throw invalidResponse('Libri OCR asset broker returned invalid JSON');
				}
				return parseReceipt(payload);
			} catch (error) {
				if (error instanceof LibriAssetBrokerError) throw error;
				throw transportFailure(input.signal, attempt.timedOut());
			} finally {
				attempt.cleanup();
			}
		}
	};
}

function normalizeEndpointUrl(value: string): string {
	if (typeof value !== 'string' || value.length > 2_048) {
		throw new Error('LIBRI_ASSET_BROKER_URL must contain 1 to 2048 characters');
	}
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		throw new Error('LIBRI_ASSET_BROKER_URL must be a valid URL');
	}
	const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
	if (
		(url.protocol !== 'https:' && !(isLoopback && url.protocol === 'http:')) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.pathname !== BROKER_PATH
	) {
		throw new Error(
			`LIBRI_ASSET_BROKER_URL must be credential-free HTTPS with path ${BROKER_PATH}`
		);
	}
	return url.toString();
}

function normalizeBearerToken(value: string): string {
	if (typeof value !== 'string') {
		throw new Error('PRIVATE_LIBRI_ASSET_BROKER_TOKEN must contain 32 to 512 characters');
	}
	const normalized = value.trim();
	if (normalized.length < 32 || normalized.length > 512 || /[\r\n]/.test(normalized)) {
		throw new Error(
			'PRIVATE_LIBRI_ASSET_BROKER_TOKEN must contain 32 to 512 header-safe characters'
		);
	}
	return normalized;
}

function validateInput(input: RedeemLibriOcrAssetGrantInput): void {
	if (!UUID_PATTERN.test(input.grantId)) {
		throw new Error('Libri OCR asset grantId must be a UUID');
	}
	if (typeof input.expiresAt !== 'string' || input.expiresAt.length > 64) {
		throw new Error('Libri OCR asset expiresAt must be a bounded timestamp');
	}
	if (!(input.signal instanceof AbortSignal)) {
		throw new Error('Libri OCR asset signal must be an AbortSignal');
	}
}

function parseReceipt(value: unknown): RedeemLibriOcrAssetGrantReceipt {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw invalidResponse('Libri OCR asset broker response must be an object');
	}
	const row = value as Record<string, unknown>;
	if (
		Object.keys(row).length !== 2 ||
		!Object.prototype.hasOwnProperty.call(row, 'signedUrl') ||
		!Object.prototype.hasOwnProperty.call(row, 'mimeType')
	) {
		throw invalidResponse('Libri OCR asset broker response contained unsupported fields');
	}
	const signedUrl = readSignedUrl(row.signedUrl);
	if (typeof row.mimeType !== 'string' || !ALLOWED_MIME_TYPES.has(row.mimeType)) {
		throw invalidResponse('Libri OCR asset broker returned an unsupported MIME type');
	}
	return { signedUrl, mimeType: row.mimeType as LibriAssetMimeType };
}

function readSignedUrl(value: unknown): string {
	if (typeof value !== 'string' || value.length < 1 || value.length > MAX_SIGNED_URL_LENGTH) {
		throw invalidResponse('Libri OCR asset broker returned an invalid signed URL');
	}
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw invalidResponse('Libri OCR asset broker returned an invalid signed URL');
	}
	if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || url.hash) {
		throw invalidResponse('Libri OCR asset broker returned an unsafe signed URL');
	}
	return value;
}

function classifyHttpFailure(status: number): LibriAssetBrokerError {
	if (status === 401) {
		return new LibriAssetBrokerError(
			'broker_http_401',
			'Libri OCR asset broker rejected its dedicated credential',
			false,
			false,
			status
		);
	}
	if (status === 400) {
		return new LibriAssetBrokerError(
			'broker_http_400',
			'Libri OCR asset broker rejected the request contract',
			false,
			false,
			status
		);
	}
	return new LibriAssetBrokerError(
		`broker_http_${status}`,
		`Libri OCR asset broker returned HTTP ${status}`,
		status === 404 || status === 408 || status === 425 || status === 429 || status >= 500,
		true,
		status
	);
}

function invalidResponse(message: string): LibriAssetBrokerError {
	return new LibriAssetBrokerError('broker_response_invalid', message, true, true);
}

function transportFailure(external: AbortSignal, timedOut: boolean): LibriAssetBrokerError {
	if (timedOut) {
		return new LibriAssetBrokerError(
			'broker_timeout',
			'Libri OCR asset broker request timed out',
			true,
			true
		);
	}
	if (external.aborted) {
		return new LibriAssetBrokerError(
			'broker_aborted',
			'Libri OCR asset broker request was aborted',
			true,
			true
		);
	}
	return new LibriAssetBrokerError(
		'broker_network_error',
		'Libri OCR asset broker request failed before a complete response',
		true,
		true
	);
}

function createAttemptSignal(
	external: AbortSignal,
	timeoutMs: number
): { signal: AbortSignal; cleanup(): void; timedOut(): boolean } {
	const controller = new AbortController();
	let didTimeout = false;
	const onAbort = () => controller.abort(external.reason);
	if (external.aborted) controller.abort(external.reason);
	else external.addEventListener('abort', onAbort, { once: true });
	const timer = setTimeout(() => {
		didTimeout = true;
		controller.abort(new Error('Libri OCR asset broker request timed out'));
	}, timeoutMs);
	timer.unref?.();
	return {
		signal: controller.signal,
		cleanup: () => {
			clearTimeout(timer);
			external.removeEventListener('abort', onAbort);
		},
		timedOut: () => didTimeout
	};
}

async function readBoundedResponseText(
	response: Response,
	maximumBytes: number
): Promise<{ text: string; truncated: boolean }> {
	const reader = response.body?.getReader();
	if (!reader) return { text: '', truncated: false };
	const decoder = new TextDecoder();
	let text = '';
	let remaining = maximumBytes;
	let truncated = false;
	try {
		while (remaining > 0) {
			const chunk = await reader.read();
			if (chunk.done) break;
			const accepted = chunk.value.subarray(0, remaining);
			remaining -= accepted.byteLength;
			text += decoder.decode(accepted, { stream: true });
			if (accepted.byteLength < chunk.value.byteLength) {
				truncated = true;
				break;
			}
		}
		if (remaining === 0) {
			const extra = await reader.read();
			truncated = !extra.done;
		}
		text += decoder.decode();
		return { text, truncated };
	} finally {
		await reader.cancel().catch(() => undefined);
	}
}

function assertBoundedInteger(value: number, minimum: number, maximum: number, name: string): void {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new Error(
			`Libri asset broker ${name} must be an integer between ${minimum} and ${maximum}`
		);
	}
}
