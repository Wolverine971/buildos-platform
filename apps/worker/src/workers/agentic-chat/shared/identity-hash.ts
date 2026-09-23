// apps/worker/src/workers/agentic-chat/shared/identity-hash.ts
import { createHash } from 'node:crypto';

/**
 * Deterministic name-based UUID for a versioned identity seed: the first 16
 * bytes of sha256(seed) with the version nibble set to 5 and the RFC 4122
 * variant bits set. Persisted ids and idempotency keys depend on these exact
 * bytes, so seeds carry their own version prefix and this derivation never
 * changes.
 */
export function stableUuidFromSeed(seed: string): string {
	const bytes = createHash('sha256').update(seed, 'utf8').digest().subarray(0, 16);
	bytes[6] = (bytes[6]! & 0x0f) | 0x50;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Lowercase hex sha256 of a UTF-8 string. */
export function sha256Hex(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}
