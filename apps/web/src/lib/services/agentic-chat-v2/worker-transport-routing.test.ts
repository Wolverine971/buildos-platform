// apps/web/src/lib/services/agentic-chat-v2/worker-transport-routing.test.ts
import { describe, expect, it } from 'vitest';
import { selectAgenticChatNewTransport } from './worker-transport-routing.server';

const CAPABILITIES = {
	supportedModes: ['legacy_sse', 'worker_realtime'] as const,
	supportedContractVersions: ['legacy_internal_v1', 'agentic_chat_worker_v1'] as const
};
const LEGACY = { mode: 'legacy_sse', contractVersion: 'legacy_internal_v1' };

function environment(overrides: Record<string, string | undefined> = {}) {
	return {
		AGENTIC_CHAT_WORKER_ROUTING_ENABLED: 'true',
		...overrides
	};
}

describe('Agentic Chat new-turn worker routing', () => {
	it('defaults to legacy when the emergency switch is not exactly enabled', async () => {
		for (const env of [
			{},
			environment({ AGENTIC_CHAT_WORKER_ROUTING_ENABLED: 'false' }),
			environment({ AGENTIC_CHAT_WORKER_ROUTING_ENABLED: ' true ' })
		]) {
			await expect(
				selectAgenticChatNewTransport({
					...CAPABILITIES,
					environment: env
				})
			).resolves.toEqual(LEGACY);
		}
	});

	it('requires explicit worker mode and contract support', async () => {
		for (const capabilities of [
			{
				supportedModes: ['legacy_sse'] as const,
				supportedContractVersions: CAPABILITIES.supportedContractVersions
			},
			{
				supportedModes: CAPABILITIES.supportedModes,
				supportedContractVersions: ['legacy_internal_v1'] as const
			}
		]) {
			await expect(
				selectAgenticChatNewTransport({
					...capabilities,
					environment: environment()
				})
			).resolves.toEqual(LEGACY);
		}
	});

	it('selects worker transport for every compatible new turn without a pressure round trip', async () => {
		await expect(
			selectAgenticChatNewTransport({
				...CAPABILITIES,
				environment: environment()
			})
		).resolves.toEqual({
			mode: 'worker_realtime',
			contractVersion: 'agentic_chat_worker_v1'
		});
	});
});
