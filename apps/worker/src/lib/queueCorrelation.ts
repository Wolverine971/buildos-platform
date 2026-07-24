// apps/worker/src/lib/queueCorrelation.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Json } from '@buildos/shared-types';

const UUID_CORRELATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requestCorrelation = new AsyncLocalStorage<string>();

export function normalizeQueueCorrelationId(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	return UUID_CORRELATION_ID.test(normalized) ? normalized : null;
}

export function getQueueCorrelationId(metadata: unknown): string | null {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
	return normalizeQueueCorrelationId((metadata as Record<string, unknown>).correlationId);
}

export function currentRequestCorrelationId(): string | null {
	return requestCorrelation.getStore() ?? null;
}

export function runWithRequestCorrelation<T>(correlationId: string, callback: () => T): T {
	return requestCorrelation.run(correlationId, callback);
}

export function createRequestCorrelationId(incoming: unknown): string {
	return normalizeQueueCorrelationId(incoming) ?? randomUUID();
}

export function ensureQueueCorrelationMetadata(
	metadata: Record<string, Json | undefined>,
	preferredCorrelationId?: string | null
): { metadata: Record<string, Json | undefined>; correlationId: string } {
	const correlationId =
		getQueueCorrelationId(metadata) ??
		normalizeQueueCorrelationId(preferredCorrelationId) ??
		currentRequestCorrelationId() ??
		randomUUID();

	return {
		metadata: { ...metadata, correlationId },
		correlationId
	};
}
