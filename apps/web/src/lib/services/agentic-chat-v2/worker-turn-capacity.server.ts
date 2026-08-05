// apps/web/src/lib/services/agentic-chat-v2/worker-turn-capacity.server.ts
import {
	PRIVATE_RAILWAY_WORKER_TOKEN,
	PUBLIC_RAILWAY_WORKER_URL
} from '$lib/server/railway-worker-env';

export const AGENTIC_CHAT_WORKER_CAPACITY_RETRY_AFTER_SECONDS = 2;

const MAX_EVIDENCE_AGE_MS = 15_000;
const MAX_EVIDENCE_FUTURE_SKEW_MS = 1_000;
const MAX_QUEUE_AGE_MS = 30_000;
const MAX_PUBLISHER_PENDING_BYTES = 8 * 1024 * 1024;
const WORKER_CAPACITY_PATH = '/agentic-chat/capacity';
const WORKER_CAPACITY_TIMEOUT_MS = 1_500;
const MAX_WORKER_CAPACITY_BODY_BYTES = 4 * 1024;
const MAX_WORKER_TOKEN_LENGTH = 4 * 1024;

export type AgenticChatWorkerCapacityEvidenceV1 = {
	observedAtMs: number;
	queue: {
		oldestReadyJobAgeMs: number;
	};
	provider: {
		available: boolean;
	};
	publisher: {
		healthy: boolean;
		pendingBytes: number;
	};
};

export type AgenticChatWorkerCapacityDecisionV1 = {
	available: boolean;
	retryAfterSeconds: number;
	reason:
		| 'open'
		| 'missing_evidence'
		| 'stale_evidence'
		| 'queue_pressure'
		| 'provider_pressure'
		| 'publisher_pressure';
};

/**
 * Testable web-side pressure boundary. Every required signal must be present,
 * fresh, finite, and within its bound; missing or malformed evidence closes
 * admission. Database running/queued hard caps remain authoritative in the
 * atomic RPC.
 */
export function evaluateAgenticChatWorkerCapacity(
	evidence: AgenticChatWorkerCapacityEvidenceV1 | null | undefined,
	nowMs = Date.now()
): AgenticChatWorkerCapacityDecisionV1 {
	const closed = (
		reason: Exclude<AgenticChatWorkerCapacityDecisionV1['reason'], 'open'>
	): AgenticChatWorkerCapacityDecisionV1 => ({
		available: false,
		retryAfterSeconds: AGENTIC_CHAT_WORKER_CAPACITY_RETRY_AFTER_SECONDS,
		reason
	});

	if (!isEvidenceShapeValid(evidence) || !Number.isSafeInteger(nowMs) || nowMs < 0) {
		return closed('missing_evidence');
	}
	const evidenceAgeMs = nowMs - evidence.observedAtMs;
	if (evidenceAgeMs < -MAX_EVIDENCE_FUTURE_SKEW_MS || evidenceAgeMs > MAX_EVIDENCE_AGE_MS) {
		return closed('stale_evidence');
	}
	if (evidence.queue.oldestReadyJobAgeMs > MAX_QUEUE_AGE_MS) {
		return closed('queue_pressure');
	}
	if (!evidence.provider.available) return closed('provider_pressure');
	if (
		!evidence.publisher.healthy ||
		evidence.publisher.pendingBytes > MAX_PUBLISHER_PENDING_BYTES
	) {
		return closed('publisher_pressure');
	}
	return {
		available: true,
		retryAfterSeconds: AGENTIC_CHAT_WORKER_CAPACITY_RETRY_AFTER_SECONDS,
		reason: 'open'
	};
}

export type AgenticChatWorkerCapacityObservationOptions = {
	workerUrl?: string | null;
	workerToken?: string | null;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
	now?: () => number;
};

/**
 * Fetches the private worker projection with a short deadline and a bounded,
 * exact JSON contract. Every configuration, transport, authentication, HTTP,
 * parsing, or schema failure is deliberately indistinguishable from missing
 * evidence and therefore closes admission.
 */
export async function observeAgenticChatWorkerCapacity(
	options: AgenticChatWorkerCapacityObservationOptions = {}
): Promise<AgenticChatWorkerCapacityDecisionV1> {
	const workerUrl =
		options.workerUrl === undefined ? PUBLIC_RAILWAY_WORKER_URL : options.workerUrl;
	const workerToken =
		options.workerToken === undefined ? PRIVATE_RAILWAY_WORKER_TOKEN : options.workerToken;
	const capacityUrl = resolveCapacityUrl(workerUrl);
	if (!capacityUrl || !isCanonicalBearerToken(workerToken)) {
		return evaluateAgenticChatWorkerCapacity(null);
	}

	const controller = new AbortController();
	const timeoutMs = resolveTimeoutMs(options.timeoutMs);
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	timer.unref?.();

	try {
		const response = await (options.fetchImpl ?? fetch)(capacityUrl, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${workerToken}`
			},
			cache: 'no-store',
			credentials: 'omit',
			redirect: 'error',
			signal: controller.signal
		});
		if (!response.ok || !isJsonContentType(response.headers.get('content-type'))) {
			return evaluateAgenticChatWorkerCapacity(null);
		}
		const body = await readBoundedResponseBody(response, MAX_WORKER_CAPACITY_BODY_BYTES);
		if (body === null) return evaluateAgenticChatWorkerCapacity(null);
		const parsed: unknown = JSON.parse(body);
		return evaluateAgenticChatWorkerCapacity(
			isEvidenceShapeValid(parsed) ? parsed : null,
			options.now?.() ?? Date.now()
		);
	} catch {
		return evaluateAgenticChatWorkerCapacity(null);
	} finally {
		clearTimeout(timer);
	}
}

function isEvidenceShapeValid(value: unknown): value is AgenticChatWorkerCapacityEvidenceV1 {
	if (
		!isRecord(value) ||
		!hasExactKeys(value, ['observedAtMs', 'queue', 'provider', 'publisher'])
	) {
		return false;
	}
	const { queue, provider, publisher } = value;
	return Boolean(
		isNonnegativeSafeInteger(value.observedAtMs) &&
			isRecord(queue) &&
			hasExactKeys(queue, ['oldestReadyJobAgeMs']) &&
			isNonnegativeFiniteNumber(queue.oldestReadyJobAgeMs) &&
			isRecord(provider) &&
			hasExactKeys(provider, ['available']) &&
			typeof provider.available === 'boolean' &&
			isRecord(publisher) &&
			hasExactKeys(publisher, ['healthy', 'pendingBytes']) &&
			typeof publisher.healthy === 'boolean' &&
			isNonnegativeFiniteNumber(publisher.pendingBytes)
	);
}

function resolveCapacityUrl(value: string | null | undefined): string | null {
	if (!value || value !== value.trim()) return null;
	try {
		const base = new URL(value);
		const isLocalHttp =
			base.protocol === 'http:' &&
			(base.hostname === 'localhost' ||
				base.hostname === '127.0.0.1' ||
				base.hostname === '::1');
		if (
			(base.protocol !== 'https:' && !isLocalHttp) ||
			base.username ||
			base.password ||
			base.search ||
			base.hash ||
			(base.pathname !== '' && base.pathname !== '/')
		) {
			return null;
		}
		return new URL(WORKER_CAPACITY_PATH, base).toString();
	} catch {
		return null;
	}
}

function isCanonicalBearerToken(value: string | null | undefined): value is string {
	return Boolean(
		value &&
			value.length <= MAX_WORKER_TOKEN_LENGTH &&
			value === value.trim() &&
			/^[\x21-\x7e]+$/.test(value)
	);
}

function resolveTimeoutMs(value: number | undefined): number {
	return Number.isSafeInteger(value) && value !== undefined && value > 0 && value <= 10_000
		? value
		: WORKER_CAPACITY_TIMEOUT_MS;
}

function isJsonContentType(value: string | null): boolean {
	const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase();
	return mediaType === 'application/json' || Boolean(mediaType?.endsWith('+json'));
}

async function readBoundedResponseBody(
	response: Response,
	maxBytes: number
): Promise<string | null> {
	const contentLength = response.headers.get('content-length');
	if (contentLength !== null) {
		if (!/^\d+$/.test(contentLength)) return null;
		const declaredBytes = Number(contentLength);
		if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maxBytes) return null;
	}
	if (!response.body) return null;

	const reader = response.body.getReader();
	const decoder = new TextDecoder('utf-8', { fatal: true });
	let bytesRead = 0;
	let body = '';
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytesRead += value.byteLength;
			if (bytesRead > maxBytes) {
				await reader.cancel().catch(() => undefined);
				return null;
			}
			body += decoder.decode(value, { stream: true });
		}
		body += decoder.decode();
		return body;
	} catch {
		return null;
	} finally {
		reader.releaseLock();
	}
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
	const actual = Object.keys(value);
	return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonnegativeSafeInteger(value: unknown): boolean {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isNonnegativeFiniteNumber(value: unknown): boolean {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
