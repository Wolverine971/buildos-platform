// apps/web/src/lib/services/agentic-chat-v2/worker-turn-capacity.test.ts
import { describe, expect, it } from 'vitest';
import {
	evaluateAgenticChatWorkerCapacity,
	observeAgenticChatWorkerCapacity,
	type AgenticChatWorkerCapacityEvidenceV1
} from './worker-turn-capacity.server';

const NOW = 10_000_000;

function evidence(
	overrides: Partial<AgenticChatWorkerCapacityEvidenceV1> = {}
): AgenticChatWorkerCapacityEvidenceV1 {
	return {
		observedAtMs: NOW - 100,
		queue: { oldestReadyJobAgeMs: 100 },
		provider: { available: true },
		publisher: { healthy: true, pendingBytes: 0 },
		...overrides
	};
}

describe('Agentic Chat worker capacity boundary', () => {
	it('defaults closed until complete live evidence is supplied', async () => {
		expect(evaluateAgenticChatWorkerCapacity(null, NOW)).toMatchObject({
			available: false,
			reason: 'missing_evidence',
			retryAfterSeconds: 2
		});
		expect(await observeAgenticChatWorkerCapacity()).toMatchObject({
			available: false,
			reason: 'missing_evidence'
		});
	});

	it('opens only for fresh queue, provider, and publisher evidence', () => {
		expect(evaluateAgenticChatWorkerCapacity(evidence(), NOW)).toEqual({
			available: true,
			retryAfterSeconds: 2,
			reason: 'open'
		});
	});

	it('closes independently for stale and pressured evidence', () => {
		expect(
			evaluateAgenticChatWorkerCapacity(evidence({ observedAtMs: NOW - 20_000 }), NOW)
		).toMatchObject({ reason: 'stale_evidence' });
		expect(
			evaluateAgenticChatWorkerCapacity(
				evidence({ queue: { oldestReadyJobAgeMs: 30_001 } }),
				NOW
			)
		).toMatchObject({ reason: 'queue_pressure' });
		expect(
			evaluateAgenticChatWorkerCapacity(evidence({ provider: { available: false } }), NOW)
		).toMatchObject({ reason: 'provider_pressure' });
		expect(
			evaluateAgenticChatWorkerCapacity(
				evidence({ publisher: { healthy: false, pendingBytes: 0 } }),
				NOW
			)
		).toMatchObject({ reason: 'publisher_pressure' });
	});
});
