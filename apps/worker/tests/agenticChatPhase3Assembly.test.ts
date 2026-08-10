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

	it('fails closed when the provider mutation surface is enabled without its adapter', () => {
		expect(() =>
			createAgenticChatPhase3Assembly({
				client: supabaseClient() as never,
				providerClient: { stream: vi.fn() } as never,
				providerConfigured: true,
				internalUserIds: [INTERNAL_USER_ID],
				mutationProviderCapabilities: { updateOntoTask: true }
			})
		).toThrow('update_onto_task provider capability requires its mutation adapter');
	});

	it('fails closed when create_onto_task is advertised without its adapter', () => {
		expect(() =>
			createAgenticChatPhase3Assembly({
				client: supabaseClient() as never,
				providerClient: { stream: vi.fn() } as never,
				providerConfigured: true,
				internalUserIds: [INTERNAL_USER_ID],
				mutationProviderCapabilities: { createOntoTask: true }
			})
		).toThrow('create_onto_task provider capability requires its mutation adapter');
	});

	it('fails closed when create_onto_document is advertised without its adapter', () => {
		expect(() =>
			createAgenticChatPhase3Assembly({
				client: supabaseClient() as never,
				providerClient: { stream: vi.fn() } as never,
				providerConfigured: true,
				internalUserIds: [INTERNAL_USER_ID],
				mutationProviderCapabilities: { createOntoDocument: true }
			})
		).toThrow('create_onto_document provider capability requires its mutation adapter');
	});

	it('can compose the adapter while keeping provider advertisement separately disabled', () => {
		const assembly = createAgenticChatPhase3Assembly({
			client: supabaseClient() as never,
			providerClient: { stream: vi.fn() } as never,
			providerConfigured: true,
			internalUserIds: [INTERNAL_USER_ID],
			mutationAdapterCapabilities: { updateOntoTask: true }
		});

		expect(assembly.runtime.getHealth()).toMatchObject({ state: 'idle' });
	});

	it('requires both explicit gates before composing the advertised mutation path', () => {
		const assembly = createAgenticChatPhase3Assembly({
			client: supabaseClient() as never,
			providerClient: { stream: vi.fn() } as never,
			providerConfigured: true,
			internalUserIds: [INTERNAL_USER_ID],
			mutationProviderCapabilities: { updateOntoTask: true },
			mutationAdapterCapabilities: { updateOntoTask: true }
		});

		expect(assembly.runtime.getHealth()).toMatchObject({ state: 'idle' });
	});

	it('composes independently gated task and document adapters behind the router', () => {
		const assembly = createAgenticChatPhase3Assembly({
			client: supabaseClient() as never,
			providerClient: { stream: vi.fn() } as never,
			providerConfigured: true,
			internalUserIds: [INTERNAL_USER_ID],
			mutationProviderCapabilities: {
				createOntoDocument: true,
				createOntoTask: true,
				updateOntoTask: true
			},
			mutationAdapterCapabilities: {
				createOntoDocument: true,
				createOntoTask: true,
				updateOntoTask: true
			}
		});

		expect(assembly.runtime.getHealth()).toMatchObject({ state: 'idle' });
	});
});
