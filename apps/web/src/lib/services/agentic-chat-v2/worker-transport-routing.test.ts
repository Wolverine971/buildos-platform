// apps/web/src/lib/services/agentic-chat-v2/worker-transport-routing.test.ts
import { describe, expect, it, vi } from 'vitest';
import { selectAgenticChatNewTransport } from './worker-transport-routing.server';

const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = 'd1000000-0000-4000-8000-000000000002';
const CAPABILITIES = {
	supportedModes: ['legacy_sse', 'worker_realtime'] as const,
	supportedContractVersions: ['legacy_internal_v1', 'agentic_chat_worker_v1'] as const
};
const LEGACY = { mode: 'legacy_sse', contractVersion: 'legacy_internal_v1' };

function environment(overrides: Record<string, string | undefined> = {}) {
	return {
		AGENTIC_CHAT_WORKER_ROUTING_ENABLED: 'true',
		AGENTIC_CHAT_WORKER_ROUTING_USER_IDS: USER_ID,
		...overrides
	};
}

describe('Agentic Chat new-turn worker routing', () => {
	it('defaults to legacy without consulting capacity for missing or malformed configuration', async () => {
		for (const env of [
			{},
			environment({ AGENTIC_CHAT_WORKER_ROUTING_ENABLED: 'false' }),
			environment({ AGENTIC_CHAT_WORKER_ROUTING_ENABLED: ' true ' }),
			environment({ AGENTIC_CHAT_WORKER_ROUTING_USER_IDS: ` ${USER_ID}` }),
			environment({ AGENTIC_CHAT_WORKER_ROUTING_USER_IDS: USER_ID.toUpperCase() }),
			environment({ AGENTIC_CHAT_WORKER_ROUTING_USER_IDS: `${USER_ID},${USER_ID}` })
		]) {
			const observeCapacity = vi.fn();
			await expect(
				selectAgenticChatNewTransport({
					userId: USER_ID,
					...CAPABILITIES,
					environment: env,
					observeCapacity
				})
			).resolves.toEqual(LEGACY);
			expect(observeCapacity).not.toHaveBeenCalled();
		}
	});

	it('keeps users outside the exact cohort on legacy without a capacity request', async () => {
		const observeCapacity = vi.fn();
		await expect(
			selectAgenticChatNewTransport({
				userId: OTHER_USER_ID,
				...CAPABILITIES,
				environment: environment(),
				observeCapacity
			})
		).resolves.toEqual(LEGACY);
		expect(observeCapacity).not.toHaveBeenCalled();
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
					userId: USER_ID,
					...capabilities,
					environment: environment(),
					observeCapacity
				})
			).resolves.toEqual(LEGACY);
		}
		expect(observeCapacity).not.toHaveBeenCalled();
	});

	it('selects worker transport only for the exact cohort with an exactly open observation', async () => {
		const observeCapacity = vi.fn(async () => ({
			available: true as const,
			retryAfterSeconds: 2,
			reason: 'open' as const
		}));
		await expect(
			selectAgenticChatNewTransport({
				userId: USER_ID,
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

	it('fails closed for closed, malformed, or failed capacity observations', async () => {
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
					userId: USER_ID,
					...CAPABILITIES,
					environment: environment(),
					observeCapacity
				})
			).resolves.toEqual(LEGACY);
		}
	});
});
