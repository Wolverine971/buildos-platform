import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
	loadLibriWorkerConfig,
	requireDedicatedLibriWorkerProductionProfile
} from '../src/config/libriWorkerProfile';
import {
	closeLibriWorkerHttpServer,
	createLibriWorkerService,
	type LibriWorkerBootstrapPort
} from '../src/lib/libriWorkerService';
import {
	LIBRI_QUEUE_TYPES,
	LibriWorkerBootstrap,
	type LibriWorkerBootstrapHealth
} from '../src/workers/libri/bootstrap';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const WORKER_DIRECTORY = resolve(TEST_DIRECTORY, '..');
const REPOSITORY_ROOT = resolve(WORKER_DIRECTORY, '../..');

describe('dedicated Libri worker bootstrap', () => {
	it('reports a healthy database while keeping queue claims disabled', async () => {
		const database = { probe: vi.fn(async () => undefined) };
		const bootstrap = new LibriWorkerBootstrap(database, loadLibriWorkerConfig({}));

		await bootstrap.start();

		expect(database.probe).toHaveBeenCalledOnce();
		expect(bootstrap.getHealth()).toMatchObject({
			healthy: true,
			state: 'running',
			database: { connected: true, consecutiveProbeFailures: 0 },
			queue: {
				enabled: false,
				registeredJobTypes: LIBRI_QUEUE_TYPES,
				activeJobs: 0,
				availableConcurrency: 2,
				concurrency: 2
			}
		});

		await bootstrap.stop();
		expect(bootstrap.getHealth()).toMatchObject({ state: 'stopped', healthy: false });
	});

	it('fails health on a database error and recovers on a later probe', async () => {
		const database = { probe: vi.fn().mockRejectedValueOnce(new Error('offline')) };
		const bootstrap = new LibriWorkerBootstrap(database, loadLibriWorkerConfig({}));

		await bootstrap.start();
		expect(bootstrap.getHealth()).toMatchObject({
			healthy: false,
			reason: 'database_probe_failed',
			database: { connected: false, consecutiveProbeFailures: 1 }
		});

		database.probe.mockResolvedValueOnce(undefined);
		await bootstrap.probeNow();
		expect(bootstrap.getHealth()).toMatchObject({
			healthy: true,
			database: { connected: true, consecutiveProbeFailures: 0 }
		});
		await bootstrap.stop();
	});

	it('degrades health without leaking a rejected scheduled probe', async () => {
		vi.useFakeTimers();
		try {
			const database = {
				probe: vi
					.fn<() => Promise<void>>()
					.mockResolvedValueOnce(undefined)
					.mockRejectedValueOnce(new Error('offline'))
			};
			const bootstrap = new LibriWorkerBootstrap(database, loadLibriWorkerConfig({}));

			await bootstrap.start();
			await vi.advanceTimersByTimeAsync(15_000);

			expect(database.probe).toHaveBeenCalledTimes(2);
			expect(bootstrap.getHealth()).toMatchObject({
				healthy: false,
				reason: 'database_probe_failed',
				database: { connected: false, consecutiveProbeFailures: 1 }
			});
			await bootstrap.stop();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('dedicated Libri worker service', () => {
	it('starts and drains only its Libri bootstrap once', async () => {
		const owned = fakeBootstrap();
		const monitor = {
			getSnapshot: vi.fn(() => ({ meanMs: 1, p99Ms: 2, maxMs: 3 })),
			stop: vi.fn()
		};
		const server = fakeServer();
		const service = createLibriWorkerService({
			bootstrap: owned,
			eventLoopLagMonitor: monitor,
			port: 0,
			serviceName: 'libri-worker',
			release: 'phase-3a-test',
			listen: vi.fn(async () => server)
		});

		await Promise.all([service.start(), service.start()]);
		expect(owned.start).toHaveBeenCalledOnce();
		expect(service.getHealth()).toMatchObject({
			healthy: true,
			state: 'running',
			service: 'libri-worker',
			release: 'phase-3a-test',
			libri: { queue: { enabled: false, registeredJobTypes: LIBRI_QUEUE_TYPES } }
		});
		expect(service.getAddress()).toMatchObject({ port: 4313 });

		await Promise.all([service.stop(), service.stop()]);
		expect(owned.stop).toHaveBeenCalledOnce();
		expect(monitor.stop).toHaveBeenCalledOnce();
	});

	it('bounds an HTTP close that never calls back', async () => {
		const server = { closeIdleConnections: vi.fn(), close: vi.fn() };
		const startedAt = Date.now();

		await closeLibriWorkerHttpServer(server, 10);

		expect(Date.now() - startedAt).toBeLessThan(250);
		expect(server.closeIdleConnections).toHaveBeenCalledOnce();
		expect(server.close).toHaveBeenCalledOnce();
	});

	it('cannot import the general worker, scheduler, chat worker, or non-Libri processors', () => {
		const entrypoint = readFileSync(join(WORKER_DIRECTORY, 'src/libri-worker.ts'), 'utf8');
		const service = readFileSync(
			join(WORKER_DIRECTORY, 'src/lib/libriWorkerService.ts'),
			'utf8'
		);
		const source = `${entrypoint}\n${service}`;

		for (const forbidden of [
			"from './index'",
			"from './worker'",
			"from './scheduler'",
			"from './chat-worker'",
			"from '../worker'",
			"from '../scheduler'"
		]) {
			expect(source).not.toContain(forbidden);
		}
		const workerImports = source.matchAll(/from ['"](?:\.\.\/|\.\/)workers\/([^'"]+)/g);
		for (const [, importedPath] of workerImports) {
			expect(importedPath).toMatch(/^libri\//);
		}
		expect(entrypoint).toContain("from './workers/libri/bootstrap'");
		expect(entrypoint).not.toContain('startScheduler(');
		expect(entrypoint).not.toContain('startWorker(');
	});

	it('ships a dedicated Railway config with the safe disabled profile', () => {
		const config = readFileSync(join(REPOSITORY_ROOT, 'railway.libri.toml'), 'utf8');
		expect(config).toContain('node apps/worker/dist/libri-worker.js');
		expect(config).toContain('healthcheckPath = "/health"');
		expect(config).toContain('LIBRI_WORKER_PROFILE = "production"');
		expect(config).toContain('LIBRI_WORKER_ENABLED = "false"');
	});

	it('requires the strict disabled profile for hosted production', () => {
		expect(() =>
			requireDedicatedLibriWorkerProductionProfile({ RAILWAY_SERVICE_ID: 'service-id' })
		).toThrow(
			'LIBRI_WORKER_PROFILE=production is required for a hosted dedicated Libri worker'
		);
		expect(() =>
			requireDedicatedLibriWorkerProductionProfile({
				NODE_ENV: 'production',
				LIBRI_WORKER_PROFILE: 'production',
				LIBRI_WORKER_ENABLED: 'true'
			})
		).toThrow('LIBRI_WORKER_ENABLED must remain false');
		expect(() =>
			requireDedicatedLibriWorkerProductionProfile({
				NODE_ENV: 'production',
				LIBRI_WORKER_PROFILE: 'production',
				LIBRI_WORKER_ENABLED: 'false'
			})
		).not.toThrow();
	});
});

function fakeBootstrap(): LibriWorkerBootstrapPort & {
	start: ReturnType<typeof vi.fn>;
	stop: ReturnType<typeof vi.fn>;
} {
	return {
		start: vi.fn(async () => undefined),
		stop: vi.fn(async () => undefined),
		getHealth: vi.fn(() => healthyBootstrap())
	};
}

function healthyBootstrap(): LibriWorkerBootstrapHealth {
	return {
		healthy: true,
		state: 'running',
		startedAt: '2026-08-29T12:00:00.000Z',
		database: {
			connected: true,
			lastSuccessfulProbeAt: '2026-08-29T12:00:00.000Z',
			consecutiveProbeFailures: 0
		},
		queue: {
			enabled: false,
			registeredJobTypes: LIBRI_QUEUE_TYPES,
			activeJobs: 0,
			availableConcurrency: 2,
			concurrency: 2
		}
	};
}

function fakeServer() {
	const server = {
		address: vi.fn(() => ({ address: '127.0.0.1', family: 'IPv4', port: 4313 })),
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
