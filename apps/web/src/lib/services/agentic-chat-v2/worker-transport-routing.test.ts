// apps/web/src/lib/services/agentic-chat-v2/worker-transport-routing.test.ts
import { describe, expect, it } from 'vitest';
import { selectAgenticChatNewTransport } from './worker-transport-routing.server';

const WORKER = { mode: 'worker_realtime', contractVersion: 'agentic_chat_worker_v1' };

describe('Agentic Chat new-turn worker routing', () => {
	it('selects worker transport for every compatible new turn', async () => {
		await expect(
			selectAgenticChatNewTransport({
				supportedModes: ['legacy_sse', 'worker_realtime'],
				supportedContractVersions: ['legacy_internal_v1', 'agentic_chat_worker_v1']
			})
		).resolves.toEqual(WORKER);
	});

	it('never downgrades a legacy-only client to the legacy engine (B1: force worker)', async () => {
		// The transport route rejects the mismatch; selection itself no longer
		// has a legacy branch, so an outdated client fails loudly instead of
		// landing on the engine being retired.
		for (const capabilities of [
			{
				supportedModes: ['legacy_sse'] as const,
				supportedContractVersions: ['legacy_internal_v1', 'agentic_chat_worker_v1'] as const
			},
			{
				supportedModes: ['legacy_sse', 'worker_realtime'] as const,
				supportedContractVersions: ['legacy_internal_v1'] as const
			}
		]) {
			await expect(selectAgenticChatNewTransport(capabilities)).resolves.toEqual(WORKER);
		}
	});
});
