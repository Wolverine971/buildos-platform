// apps/worker/tests/agenticChatPhase3Assembly.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createAgenticChatPhase3Assembly } from '../src/workers/agentic-chat/phase3Assembly';

const INTERNAL_USER_ID = 'd1000000-0000-4000-8000-000000000001';

function supabaseClient() {
	return {
		rpc: vi.fn(),
		from: vi.fn(),
		channel: vi.fn(),
		removeChannel: vi.fn()
	};
}

describe('createAgenticChatPhase3Assembly', () => {
	it('composes the hosted adapters but remains completely inert', async () => {
		const providerClient = { stream: vi.fn() };
		const assembly = createAgenticChatPhase3Assembly({
			client: supabaseClient() as never,
			providerClient: providerClient as never,
			providerConfigured: true,
			internalUserIds: [INTERNAL_USER_ID]
		});

		expect(assembly.consumer.queue.getRegisteredJobTypes()).toEqual(['agentic_chat_turn']);
		expect(assembly.consumer.config.concurrency).toBe(1);
		expect(assembly.runtime.getHealth()).toMatchObject({
			healthy: false,
			state: 'idle'
		});
		await expect(assembly.capacity.collect()).resolves.toBeNull();
		expect(providerClient.stream).not.toHaveBeenCalled();
		expect(assembly.providerCapacity.getSnapshot()).toMatchObject({
			configured: true,
			available: true,
			activeRequests: 0
		});
	});

	it('keeps provider evidence closed when credentials are not configured', () => {
		const assembly = createAgenticChatPhase3Assembly({
			client: supabaseClient() as never,
			providerClient: { stream: vi.fn() } as never,
			providerConfigured: false,
			internalUserIds: [INTERNAL_USER_ID]
		});

		expect(assembly.providerCapacity.getSnapshot()).toMatchObject({
			configured: false,
			available: false
		});
	});

	it('rejects cancellation capacity that diverges from the one-slot consumer', () => {
		expect(() =>
			createAgenticChatPhase3Assembly({
				client: supabaseClient() as never,
				providerClient: { stream: vi.fn() } as never,
				providerConfigured: true,
				internalUserIds: [INTERNAL_USER_ID],
				cancellationConfig: { consumerConcurrency: 2 }
			})
		).toThrow('must match CHAT_CONCURRENCY=1');
	});
});
