// apps/web/src/lib/services/agentic-chat-v2/worker-transport-routing.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatWorkerUnavailableError,
	selectAgenticChatNewTransport
} from './worker-transport-routing.server';

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
	it('defaults to legacy without consulting capacity when the emergency switch is not exactly enabled', async () => {
		for (const env of [
			{},
			environment({ AGENTIC_CHAT_WORKER_ROUTING_ENABLED: 'false' }),
			environment({ AGENTIC_CHAT_WORKER_ROUTING_ENABLED: ' true ' })
		]) {
			const observeCapacity = vi.fn();
			await expect(
				selectAgenticChatNewTransport({
					...CAPABILITIES,
					environment: env,
					observeCapacity
				})
			).resolves.toEqual(LEGACY);
			expect(observeCapacity).not.toHaveBeenCalled();
		}
	});

	it('requires explicit worker mode and contract support before observing capacity', async () => {
		const observeCapacity = vi.fn();
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
					environment: environment(),
					observeCapacity
				})
			).resolves.toEqual(LEGACY);
		}
		expect(observeCapacity).not.toHaveBeenCalled();
	});

	it('selects worker transport for every compatible new turn with an exactly open observation', async () => {
		const observeCapacity = vi.fn(async () => ({
			available: true as const,
			retryAfterSeconds: 2,
			reason: 'open' as const
		}));
		await expect(
			selectAgenticChatNewTransport({
				...CAPABILITIES,
				environment: environment(),
				observeCapacity
			})
		).resolves.toEqual({
			mode: 'worker_realtime',
			contractVersion: 'agentic_chat_worker_v1'
		});
		expect(observeCapacity).toHaveBeenCalledOnce();
	});

	it('returns retryable worker-unavailable for closed, malformed, or failed capacity observations', async () => {
		for (const observeCapacity of [
			vi.fn(async () => ({
				available: false as const,
				retryAfterSeconds: 2,
				reason: 'queue_pressure' as const
			})),
			vi.fn(async () => ({
				available: true as const,
				retryAfterSeconds: 2,
				reason: 'open' as const,
				extra: true
			})),
			vi.fn(async () => {
				throw new Error('capacity transport failed');
			})
		]) {
			await expect(
				selectAgenticChatNewTransport({
					...CAPABILITIES,
					environment: environment(),
					observeCapacity
				})
			).rejects.toBeInstanceOf(AgenticChatWorkerUnavailableError);
		}
	});
});
