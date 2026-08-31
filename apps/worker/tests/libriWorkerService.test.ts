import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
	loadLibriWorkerConfig,
	loadLibriOcrRuntimeConfig,
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

describe('dedicated Libri worker bootstrap', () => {
	it('reports a healthy database while keeping queue claims disabled', async () => {
		const database = {
			probe: vi.fn(async () => undefined),
			close: vi.fn(async () => undefined)
		};
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
		expect(database.close).toHaveBeenCalledOnce();
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

	it('starts and drains the isolated maintenance consumer only when locally enabled', async () => {
		const database = {
			probe: vi.fn(async () => undefined),
			close: vi.fn(async () => undefined)
		};
		const consumer = {
			start: vi.fn(async () => undefined),
			stop: vi.fn(async () => undefined),
			getHealth: vi.fn(() => ({
				healthy: true,
				state: 'running' as const,
				activeJobs: 1,
				availableConcurrency: 1,
				concurrency: 2,
				lastSuccessfulClaimAt: '2026-08-30T20:00:00.000Z',
				consecutiveClaimFailures: 0,
				completedJobs: 1,
				failedJobs: 0,
				staleOwnershipJobs: 0,
				quarantinedJobs: 0
			}))
		};
		const bootstrap = new LibriWorkerBootstrap(
			database,
			loadLibriWorkerConfig({ LIBRI_WORKER_ENABLED: 'true' }),
			consumer
		);

		await bootstrap.start();
		expect(consumer.start).toHaveBeenCalledOnce();
		expect(bootstrap.getHealth()).toMatchObject({
			healthy: true,
			queue: {
				enabled: true,
				consumerHealthy: true,
				activeJobs: 1,
				availableConcurrency: 1
			}
		});

		await bootstrap.stop();
		expect(consumer.stop).toHaveBeenCalledOnce();
		expect(database.close).toHaveBeenCalledOnce();
	});

	it('fails closed before queue startup when an enabled initial database probe fails', async () => {
		const database = {
			probe: vi.fn(async () => {
				throw new Error('offline');
			}),
			close: vi.fn(async () => undefined)
		};
		const consumer = {
			start: vi.fn(async () => undefined),
			stop: vi.fn(async () => undefined),
			getHealth: vi.fn(() => ({
				healthy: false,
				state: 'idle' as const,
				reason: 'consumer_idle',
				activeJobs: 0,
				availableConcurrency: 1,
				concurrency: 1,
				lastSuccessfulClaimAt: null,
				consecutiveClaimFailures: 0,
				completedJobs: 0,
				failedJobs: 0,
				staleOwnershipJobs: 0,
				quarantinedJobs: 0
			}))
		};
		const bootstrap = new LibriWorkerBootstrap(
			database,
			loadLibriWorkerConfig({ LIBRI_WORKER_ENABLED: 'true' }),
			consumer
		);

		await expect(bootstrap.start()).rejects.toThrow('offline');
		expect(consumer.start).not.toHaveBeenCalled();
		expect(bootstrap.getHealth()).toMatchObject({ state: 'failed', healthy: false });
		await bootstrap.stop();
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
		expect(entrypoint).toContain("from './workers/libri/database'");
		expect(entrypoint).not.toContain("from './lib/supabase'");
		expect(entrypoint).toContain("requireEnvironment(process.env, 'LIBRI_DATABASE_URL')");
		expect(entrypoint).toContain("requireEnvironment(process.env, 'LIBRI_DATABASE_CA_CERT')");
		expect(entrypoint).not.toContain('startScheduler(');
		expect(entrypoint).not.toContain('startWorker(');
	});

	it('exposes the exact isolated entrypoint used by Railway service settings', () => {
		const packageJson = JSON.parse(
			readFileSync(join(WORKER_DIRECTORY, 'package.json'), 'utf8')
		) as { scripts: Record<string, string> };
		expect(packageJson.scripts['start:libri']).toBe('node dist/libri-worker.js');
	});

	it('allows hosted activation only for one exact, expiring synthetic canary step', () => {
		const canaryStepId = '30000000-0000-4000-8000-000000000001';
		const canaryExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
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
		).toThrow('exact synthetic_canary or ocr_canary');
		expect(() =>
			requireDedicatedLibriWorkerProductionProfile({
				NODE_ENV: 'production',
				LIBRI_WORKER_PROFILE: 'production',
				LIBRI_WORKER_ENABLED: 'true',
				LIBRI_WORKER_ACTIVATION_MODE: 'synthetic_canary',
				LIBRI_WORKER_CANARY_STEP_ID: canaryStepId,
				LIBRI_WORKER_CANARY_EXPIRES_AT: canaryExpiresAt
			})
		).toThrow('requires concurrency 1');
		expect(() =>
			requireDedicatedLibriWorkerProductionProfile({
				NODE_ENV: 'production',
				LIBRI_WORKER_PROFILE: 'production',
				LIBRI_WORKER_ENABLED: 'true',
				LIBRI_WORKER_ACTIVATION_MODE: 'synthetic_canary',
				LIBRI_WORKER_CONCURRENCY: '1',
				LIBRI_WORKER_CANARY_STEP_ID: canaryStepId,
				LIBRI_WORKER_CANARY_EXPIRES_AT: canaryExpiresAt
			})
		).not.toThrow();
		expect(
			loadLibriWorkerConfig({
				LIBRI_WORKER_ENABLED: 'true',
				LIBRI_WORKER_ACTIVATION_MODE: 'synthetic_canary',
				LIBRI_WORKER_CONCURRENCY: '1',
				LIBRI_WORKER_CANARY_STEP_ID: canaryStepId,
				LIBRI_WORKER_CANARY_EXPIRES_AT: canaryExpiresAt
			})
		).toMatchObject({
			queueEnabled: true,
			activationMode: 'synthetic_canary',
			concurrency: 1,
			canaryStepId,
			canaryExpiresAtMs: Date.parse(canaryExpiresAt)
		});
		expect(() =>
			requireDedicatedLibriWorkerProductionProfile({
				NODE_ENV: 'production',
				LIBRI_WORKER_PROFILE: 'production',
				LIBRI_WORKER_ENABLED: 'true',
				LIBRI_WORKER_ACTIVATION_MODE: 'synthetic_canary',
				LIBRI_WORKER_CONCURRENCY: '1',
				LIBRI_WORKER_CANARY_EXPIRES_AT: canaryExpiresAt
			})
		).toThrow('requires one canary step UUID');
		expect(() =>
			requireDedicatedLibriWorkerProductionProfile({
				NODE_ENV: 'production',
				LIBRI_WORKER_PROFILE: 'production',
				LIBRI_WORKER_ENABLED: 'true',
				LIBRI_WORKER_ACTIVATION_MODE: 'synthetic_canary',
				LIBRI_WORKER_CONCURRENCY: '1',
				LIBRI_WORKER_CANARY_STEP_ID: canaryStepId,
				LIBRI_WORKER_CANARY_EXPIRES_AT: new Date(Date.now() - 1).toISOString()
			})
		).toThrow('expiry must be 1 to 30 minutes ahead');
		expect(() =>
			requireDedicatedLibriWorkerProductionProfile({
				NODE_ENV: 'production',
				LIBRI_WORKER_PROFILE: 'production',
				LIBRI_WORKER_ENABLED: 'true',
				LIBRI_WORKER_ACTIVATION_MODE: 'synthetic_canary',
				LIBRI_WORKER_CONCURRENCY: '1',
				LIBRI_WORKER_CANARY_STEP_ID: canaryStepId,
				LIBRI_WORKER_CANARY_EXPIRES_AT: new Date(Date.now() + 31 * 60_000).toISOString()
			})
		).toThrow('expiry must be 1 to 30 minutes ahead');
		expect(() =>
			requireDedicatedLibriWorkerProductionProfile({
				NODE_ENV: 'production',
				LIBRI_WORKER_PROFILE: 'production',
				LIBRI_WORKER_ENABLED: 'false'
			})
		).not.toThrow();
		expect(() => loadLibriWorkerConfig({ LIBRI_WORKER_ACTIVATION_MODE: 'unbounded' })).toThrow(
			'LIBRI_WORKER_ACTIVATION_MODE'
		);
		expect(() => loadLibriWorkerConfig({ LIBRI_WORKER_CANARY_STEP_ID: 'not-a-uuid' })).toThrow(
			'LIBRI_WORKER_CANARY_STEP_ID'
		);
		expect(() =>
			loadLibriWorkerConfig({ LIBRI_WORKER_CANARY_EXPIRES_AT: 'not-a-timestamp' })
		).toThrow('LIBRI_WORKER_CANARY_EXPIRES_AT');
	});

	it('requires bounded paid and broker settings only for the exact OCR canary', () => {
		const canaryStepId = '30000000-0000-4000-8000-000000000001';
		const canaryExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
		const base = {
			NODE_ENV: 'production',
			LIBRI_WORKER_PROFILE: 'production',
			LIBRI_WORKER_ENABLED: 'true',
			LIBRI_WORKER_ACTIVATION_MODE: 'ocr_canary',
			LIBRI_WORKER_CONCURRENCY: '1',
			LIBRI_WORKER_CANARY_STEP_ID: canaryStepId,
			LIBRI_WORKER_CANARY_EXPIRES_AT: canaryExpiresAt
		};
		expect(() => requireDedicatedLibriWorkerProductionProfile(base)).toThrow(
			'LIBRI_OCR_RESERVED_MICROUSD'
		);

		const ocrEnvironment = {
			...base,
			LIBRI_OCR_RESERVED_MICROUSD: '50000',
			LIBRI_ASSET_BROKER_URL: 'https://build-os.com/api/internal/libri/ocr-assets/redeem',
			PRIVATE_LIBRI_ASSET_BROKER_TOKEN: 'x'.repeat(64),
			PRIVATE_OPENROUTER_API_KEY: 'openrouter-key',
			LIBRI_OCR_MODEL: 'openai/gpt-4.1-mini',
			LIBRI_OCR_MAX_OUTPUT_TOKENS: '2048'
		};
		expect(() => requireDedicatedLibriWorkerProductionProfile(ocrEnvironment)).not.toThrow();
		expect(loadLibriOcrRuntimeConfig(ocrEnvironment)).toEqual({
			assetBrokerUrl: 'https://build-os.com/api/internal/libri/ocr-assets/redeem',
			assetBrokerToken: 'x'.repeat(64),
			assetBrokerTimeoutMs: 5_000,
			openRouterApiKey: 'openrouter-key',
			model: 'openai/gpt-4.1-mini',
			maxOutputTokens: 2_048,
			reservedMicrousd: 50_000n
		});
		expect(() =>
			loadLibriOcrRuntimeConfig({
				...ocrEnvironment,
				LIBRI_OCR_RESERVED_MICROUSD: '1000001'
			})
		).toThrow('between 1 and 1000000');
		expect(() =>
			loadLibriOcrRuntimeConfig({
				...ocrEnvironment,
				LIBRI_OCR_MAX_OUTPUT_TOKENS: '4097'
			})
		).toThrow('LIBRI_OCR_MAX_OUTPUT_TOKENS');
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
			concurrency: 2,
			consumerHealthy: null,
			lastSuccessfulClaimAt: null,
			consecutiveClaimFailures: 0
		}
	};
}

function fakeServer() {
	const server = createServer();
	vi.spyOn(server, 'address').mockReturnValue({
		address: '127.0.0.1',
		family: 'IPv4',
		port: 4313
	});
	vi.spyOn(server, 'closeIdleConnections').mockImplementation(() => undefined);
	vi.spyOn(server, 'close').mockImplementation((callback) => {
		callback?.();
		return server;
	});
	return server;
}
