// apps/worker/src/http/agenticChatCapacity.ts

import { isWorkerAuthorized } from './auth';
import type { AgenticChatWorkerCapacityEvidenceV1 } from '../workers/agentic-chat/capacity';

export const AGENTIC_CHAT_CAPACITY_PATH = '/agentic-chat/capacity';
export const AGENTIC_CHAT_CAPACITY_TIMEOUT_MS = 1_500;

type AgenticChatCapacityRequest = {
	headers: { authorization?: string };
};

type AgenticChatCapacityResponse = {
	setHeader(name: string, value: string): void;
	status(code: number): AgenticChatCapacityResponse;
	json(body: unknown): unknown;
};

export type AgenticChatCapacityHttpDependencies = {
	collect(): Promise<AgenticChatWorkerCapacityEvidenceV1 | null>;
	isAuthorized?(authorization: string | undefined): boolean;
	timeoutMs?: number;
};

/**
 * Authenticated, no-store HTTP projection of the worker's live capacity
 * evidence. Collection is bounded independently of the underlying database
 * request so a capacity probe cannot tie up an HTTP connection indefinitely.
 */
export async function respondWithAgenticChatCapacity(
	request: AgenticChatCapacityRequest,
	response: AgenticChatCapacityResponse,
	dependencies: AgenticChatCapacityHttpDependencies
): Promise<void> {
	response.setHeader('Cache-Control', 'private, no-store');
	response.setHeader('Pragma', 'no-cache');
	response.setHeader('Vary', 'Authorization');

	const authorized = dependencies.isAuthorized ?? isWorkerAuthorized;
	if (!authorized(request.headers.authorization)) {
		response.status(401).json({ error: 'Unauthorized' });
		return;
	}

	const timeoutMs = resolveTimeoutMs(dependencies.timeoutMs);
	const evidence = await collectWithinDeadline(dependencies.collect, timeoutMs);
	if (!isExactCapacityEvidence(evidence)) {
		response.setHeader('Retry-After', '2');
		response.status(503).json({ error: 'Agentic Chat capacity evidence unavailable' });
		return;
	}

	response.status(200).json(evidence);
}

async function collectWithinDeadline(
	collect: AgenticChatCapacityHttpDependencies['collect'],
	timeoutMs: number
): Promise<AgenticChatWorkerCapacityEvidenceV1 | null> {
	let timer: NodeJS.Timeout | null = null;
	const deadline = new Promise<null>((resolve) => {
		timer = setTimeout(() => resolve(null), timeoutMs);
		timer.unref();
	});
	try {
		return await Promise.race([
			Promise.resolve()
				.then(() => collect())
				.catch(() => null),
			deadline
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

function resolveTimeoutMs(value: number | undefined): number {
	if (value === undefined) return AGENTIC_CHAT_CAPACITY_TIMEOUT_MS;
	if (!Number.isSafeInteger(value) || value <= 0 || value > AGENTIC_CHAT_CAPACITY_TIMEOUT_MS) {
		throw new Error(
			`Agentic Chat capacity timeout must be between 1 and ${AGENTIC_CHAT_CAPACITY_TIMEOUT_MS}ms`
		);
	}
	return value;
}

function isExactCapacityEvidence(
	value: AgenticChatWorkerCapacityEvidenceV1 | null
): value is AgenticChatWorkerCapacityEvidenceV1 {
	return Boolean(
		value &&
			hasExactKeys(value, ['observedAtMs', 'queue', 'provider', 'publisher']) &&
			isNonnegativeSafeInteger(value.observedAtMs) &&
			hasExactKeys(value.queue, ['oldestReadyJobAgeMs']) &&
			isNonnegativeSafeInteger(value.queue.oldestReadyJobAgeMs) &&
			hasExactKeys(value.provider, ['available']) &&
			typeof value.provider.available === 'boolean' &&
			hasExactKeys(value.publisher, ['healthy', 'pendingBytes']) &&
			typeof value.publisher.healthy === 'boolean' &&
			isNonnegativeSafeInteger(value.publisher.pendingBytes)
	);
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
	const actual = Object.keys(value);
	return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function isNonnegativeSafeInteger(value: unknown): boolean {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}
