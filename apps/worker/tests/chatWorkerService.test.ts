import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
	closeChatWorkerHttpServer,
	createChatWorkerService,
	type ChatWorkerBootstrapPort
} from '../src/lib/chatWorkerService';
import type { AgenticChatBootstrapHealth } from '../src/workers/agentic-chat/bootstrap';
import { requireDedicatedChatWorkerProductionProfile } from '../src/config/chatWorkerProfile';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const CLAIM_AT = '2026-08-20T12:00:00.000Z';

describe('dedicated Agentic Chat worker composition', () => {
	it('starts and stops only the chat bootstrap once and becomes unhealthy before drain completes', async () => {
		let releaseDrain!: () => void;
		const drain = new Promise<void>((resolve) => (releaseDrain = resolve));
		const owned = bootstrap();
		owned.stop.mockImplementation(() => drain);
		const monitor = {
			getSnapshot: vi.fn(() => ({ meanMs: 1, p99Ms: 2, maxMs: 3 })),
			stop: vi.fn()
		};
		const server = fakeServer();
		const service = createChatWorkerService({
			bootstrap: owned,
			eventLoopLagMonitor: monitor,
			port: 0,
			serviceName: 'agentic-chat-worker',
			release: 'phase-6-test',
			isAuthorized: (authorization) => authorization === 'Bearer test-token',
			listen: vi.fn(async () => server)
		});

		await Promise.all([service.start(), service.start()]);
		expect(owned.start).toHaveBeenCalledOnce();
		expect(service.getHealth()).toMatchObject({
			healthy: true,
			state: 'running',
			service: 'agentic-chat-worker',
			release: 'phase-6-test'
		});

		expect(service.getAddress()).toMatchObject({ port: 4312 });
		expect(service.getHealth()).toMatchObject({
			checks: {
				lastSuccessfulClaimAt: CLAIM_AT,
				database: { connected: true, consecutiveClaimFailures: 0 },
				activeTurns: 1
			}
		});
		expect(service.getHealth().agenticChat.mutationCapabilities).toEqual({
			provider: { count: 2, names: ['moveDocumentInTree', 'updateOntoTask'] },
			adapter: { count: 2, names: ['moveDocumentInTree', 'updateOntoTask'] },
			advertisedMutationToolNames: ['move_document_in_tree', 'update_onto_task']
		});

		const unauthorized = responseHarness();
		await service.respondWithCapacity({ headers: {} }, unauthorized.response);
		expect(unauthorized.result().status).toBe(401);
		const capacity = responseHarness();
		await service.respondWithCapacity(
			{ headers: { authorization: 'Bearer test-token' } },
			capacity.response
		);
		expect(capacity.result()).toMatchObject({
			status: 200,
			body: {
				observedAtMs: 10_000,
				queue: { oldestReadyJobAgeMs: 20 },
				provider: { available: true },
				publisher: { healthy: true, pendingBytes: 0 }
			}
		});

		const stopping = Promise.all([service.stop(), service.stop()]);
		expect(service.getHealth()).toMatchObject({
			healthy: false,
			state: 'draining',
			reason: 'draining'
		});
		expect(owned.stop).toHaveBeenCalledOnce();
		releaseDrain();
		await stopping;
		expect(owned.stop).toHaveBeenCalledOnce();
		expect(monitor.stop).toHaveBeenCalledOnce();
	});

	it('bounds an HTTP close that never calls back', async () => {
		const server = {
			closeIdleConnections: vi.fn(),
			close: vi.fn()
		};
		const startedAt = Date.now();

		await closeChatWorkerHttpServer(server, 10);

		expect(Date.now() - startedAt).toBeLessThan(250);
		expect(server.closeIdleConnections).toHaveBeenCalledOnce();
		expect(server.close).toHaveBeenCalledOnce();
	});

	it('cannot import the combined entrypoint, general queue, scheduler, or processor tree', () => {
		const entrypoint = readFileSync(join(SRC, 'chat-worker.ts'), 'utf8');
		const service = readFileSync(join(SRC, 'lib', 'chatWorkerService.ts'), 'utf8');
		const source = `${entrypoint}\n${service}`;

		for (const forbidden of [
			"from './index'",
			"from './worker'",
			"from './scheduler'",
			"from '../worker'",
			"from '../scheduler'"
		]) {
			expect(source).not.toContain(forbidden);
		}
		const workerImports = source.matchAll(/from ['"](?:\.\.\/|\.\/)workers\/([^'"]+)/g);
		for (const [, importedPath] of workerImports) {
			expect(importedPath).toMatch(/^agentic-chat\//);
		}
		expect(entrypoint).toContain("from './workers/agentic-chat/bootstrap'");
		expect(entrypoint).not.toContain('startScheduler(');
		expect(entrypoint).not.toContain('startWorker(');
	});

	it('requires the strict configuration profile for a hosted production process', () => {
		expect(() =>
			requireDedicatedChatWorkerProductionProfile({
				RAILWAY_SERVICE_ID: 'service-id'
			})
		).toThrow(
			'AGENTIC_CHAT_WORKER_PROFILE=production is required for a hosted dedicated chat worker'
		);
		expect(() =>
			requireDedicatedChatWorkerProductionProfile({
				NODE_ENV: 'production',
				AGENTIC_CHAT_WORKER_PROFILE: 'production'
			})
		).not.toThrow();
		expect(() => requireDedicatedChatWorkerProductionProfile({})).not.toThrow();
	});
});

function bootstrap(): ChatWorkerBootstrapPort & {
	start: ReturnType<typeof vi.fn>;
	stop: ReturnType<typeof vi.fn>;
	getHealth: ReturnType<typeof vi.fn>;
	collectCapacityEvidence: ReturnType<typeof vi.fn>;
} {
	return {
		start: vi.fn(async () => 'started' as const),
		stop: vi.fn(async () => undefined),
		getHealth: vi.fn(() => chatHealth()),
		collectCapacityEvidence: vi.fn(async () => ({
			observedAtMs: 10_000,
			queue: { oldestReadyJobAgeMs: 20 },
			provider: { available: true },
			publisher: { healthy: true, pendingBytes: 0 }
		}))
	};
}

function fakeServer() {
	const server = {
		address: vi.fn(() => ({ address: '127.0.0.1', family: 'IPv4', port: 4312 })),
		closeIdleConnections: vi.fn(),
		close: vi.fn((callback?: () => void) => {
			callback?.();
			return server;
		}),
		once: vi.fn(),
		off: vi.fn(),
		listen: vi.fn()
	};
	return server;
}

function responseHarness() {
	let status = 0;
	let body: unknown;
	const response = {
		setHeader: vi.fn(),
		status(code: number) {
			status = code;
			return response;
		},
		json(value: unknown) {
			body = value;
			return response;
		}
	};
	return { response, result: () => ({ status, body }) };
}

function chatHealth(): AgenticChatBootstrapHealth {
	return {
		enabled: true,
		healthy: true,
		state: 'running',
		mutationCapabilities: {
			provider: { count: 2, names: ['moveDocumentInTree', 'updateOntoTask'] },
			adapter: { count: 2, names: ['moveDocumentInTree', 'updateOntoTask'] },
			advertisedMutationToolNames: ['move_document_in_tree', 'update_onto_task']
		},
		runtime: {
			healthy: true,
			state: 'running',
			activeTurns: 1,
			realtime: {
				healthy: true,
				status: 'connected',
				activeChannels: 1,
				lastTransitionAt: CLAIM_AT,
				consecutiveFailures: 0
			},
			recovery: {
				healthy: true,
				state: 'running',
				lastSweepStartedAt: CLAIM_AT,
				lastSweepFinishedAt: CLAIM_AT,
				lastSuccessfulSweepAt: CLAIM_AT,
				consecutiveSweepFailures: 0,
				lastError: null,
				lastCandidateCount: 0,
				lastAttentionRequiredCount: 0
			},
			queue: {
				healthy: true,
				startedAt: CLAIM_AT,
				lastSuccessfulClaimAt: CLAIM_AT,
				lastPollSuccessAt: CLAIM_AT,
				consecutiveClaimFailures: 0,
				processingBatch: false,
				draining: false
			}
		}
	};
}
