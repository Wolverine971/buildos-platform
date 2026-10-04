import { LibriUploadConsumer } from '../src/workers/libri/uploadConsumer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibriUploadQueueRuntime } from '../src/workers/libri/uploadQueueRuntime';
import type { LibriMaintenanceConsumerHealth } from '../src/workers/libri/maintenanceConsumer';
import {
	loadLibriWorkerConfig,
	requireDedicatedLibriWorkerProductionProfile,
	type LibriUploadRuntimeConfig
} from '../src/config/libriWorkerProfile';
import { LibriWorkerBootstrap } from '../src/workers/libri/bootstrap';
const libraryId = 'f09948c4-e4e0-581c-8689-7258bea2f501';
const upload1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
	upload2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const config = {
	libraryId,
	brokerToken: 'local-only-token-abcdefghijklmnopqrstuvwxyz',
	downloadBrokerUrl: 'https://build-os.com/api/internal/libri/uploads/download',
	publicationBrokerUrl: 'https://build-os.com/api/internal/libri/uploads/publish',
	pollIntervalMs: 1000
};
function health(): LibriMaintenanceConsumerHealth {
	return {
		healthy: true,
		state: 'running',
		activeJobs: 1,
		availableConcurrency: 0,
		concurrency: 1,
		lastSuccessfulClaimAt: null,
		consecutiveClaimFailures: 0,
		completedJobs: 0,
		failedJobs: 0,
		staleOwnershipJobs: 0,
		quarantinedJobs: 0
	};
}
function fixture() {
	const children: {
		health: LibriMaintenanceConsumerHealth;
		start: ReturnType<typeof vi.fn>;
		stop: ReturnType<typeof vi.fn>;
		getHealth: () => LibriMaintenanceConsumerHealth;
	}[] = [];
	const scopes: LibriUploadRuntimeConfig[] = [];
	const list = vi.fn(async (_: string) => [upload1]);
	const create = vi.fn((scope: LibriUploadRuntimeConfig) => {
		scopes.push(scope);
		const h = health();
		const child = {
			health: h,
			start: vi.fn(async () => {}),
			stop: vi.fn(async () => {
				h.state = 'stopped';
				h.healthy = false;
				h.activeJobs = 0;
			}),
			getHealth: () => h
		};
		children.push(child);
		return child;
	});
	const runtime = new LibriUploadQueueRuntime({
		config,
		listCandidates: list,
		createConsumer: create
	});
	return { runtime, list, create, scopes, children };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});
describe('sustained upload runtime', () => {
	it('serializes successive uploads, preserves each scope, drains before opening the next slot', async () => {
		const f = fixture();
		await f.runtime.start();
		await f.runtime.wake();
		expect(f.list).toHaveBeenCalledWith(libraryId);
		expect(f.children).toHaveLength(1);
		expect(f.scopes[0]).toMatchObject({
			libraryId,
			uploadId: upload1,
			downloadBrokerUrl: config.downloadBrokerUrl,
			expiresAtMs: Date.now() + 120000
		});
		await f.runtime.wake();
		expect(f.list).toHaveBeenCalledTimes(1);
		expect(f.children).toHaveLength(1);
		let drained!: () => void;
		f.children[0].stop.mockImplementationOnce(
			() =>
				new Promise<void>((r) => {
					drained = r;
				})
		);
		f.children[0].health.completedJobs = 1;
		const retiring = f.runtime.wake();
		const duplicate = f.runtime.wake();
		expect(duplicate).toBe(retiring);
		expect(f.create).toHaveBeenCalledTimes(1);
		drained();
		await retiring;
		f.list.mockResolvedValue([upload2]);
		await f.runtime.wake();
		expect(f.scopes[1].uploadId).toBe(upload2);
		expect(f.scopes[0].leaseToken).not.toBe(f.scopes[1].leaseToken);
		expect(f.runtime.getHealth()).toMatchObject({
			completedJobs: 1,
			concurrency: 1,
			activeJobs: 1
		});
		await f.runtime.stop();
	});
	it('never admits another upload after an uncertain publication outcome', async () => {
		const f = fixture();
		await f.runtime.start();
		await f.runtime.wake();
		Object.assign(f.children[0].health, {
			state: 'failed',
			healthy: false,
			reason: 'upload_reconciliation_required',
			quarantinedJobs: 1
		});
		await f.runtime.wake();
		await vi.advanceTimersByTimeAsync(60000);
		await f.runtime.wake();
		expect(f.list).toHaveBeenCalledTimes(1);
		expect(f.children[0].stop).toHaveBeenCalledOnce();
		expect(f.runtime.getHealth()).toMatchObject({
			healthy: false,
			state: 'failed',
			reason: 'upload_reconciliation_required'
		});
		await f.runtime.stop();
	});
	it('does not create work when stopped while a candidate read is pending', async () => {
		const f = fixture();
		let finish!: (ids: string[]) => void;
		f.list.mockImplementation(
			() =>
				new Promise((r) => {
					finish = r;
				})
		);
		await f.runtime.start();
		const tick = f.runtime.wake();
		const stopped = f.runtime.stop();
		finish([upload1]);
		await tick;
		await stopped;
		expect(f.create).not.toHaveBeenCalled();
		expect(f.runtime.getHealth().state).toBe('stopped');
	});
	it('bounds candidate failures, retries reads only, and recovers a transient listing failure', async () => {
		const f = fixture();
		f.list.mockRejectedValueOnce(new Error('private failure')).mockResolvedValue([]);
		await f.runtime.start();
		await f.runtime.wake();
		expect(f.runtime.getHealth()).toMatchObject({
			healthy: false,
			consecutiveClaimFailures: 1
		});
		await f.runtime.wake();
		expect(f.runtime.getHealth()).toMatchObject({ healthy: true, consecutiveClaimFailures: 0 });
		f.list.mockRejectedValue(new Error('private failure'));
		await f.runtime.wake();
		await f.runtime.wake();
		await f.runtime.wake();
		await vi.advanceTimersByTimeAsync(60000);
		expect(f.list).toHaveBeenCalledTimes(5);
		expect(f.create).not.toHaveBeenCalled();
		expect(JSON.stringify(f.runtime.getHealth())).not.toContain('private failure');
		await f.runtime.stop();
	});
	it.each([[upload1, upload1], ['invalid'], Array(11).fill(upload1)].map((ids) => [ids]))(
		'rejects malformed or oversized candidates',
		async (ids) => {
			const f = fixture();
			f.list.mockResolvedValue(ids);
			await f.runtime.start();
			await f.runtime.wake();
			expect(f.create).not.toHaveBeenCalled();
			expect(f.runtime.getHealth().state).toBe('failed');
			await f.runtime.stop();
		}
	);
	it('refuses a just-completed upload offered again and keeps the runtime unhealthy on drain failure', async () => {
		const f = fixture();
		await f.runtime.start();
		await f.runtime.wake();
		f.children[0].health.completedJobs = 1;
		await f.runtime.wake();
		await f.runtime.wake();
		expect(f.create).toHaveBeenCalledTimes(1);
		expect(f.runtime.getHealth().state).toBe('failed');
		await f.runtime.stop();
		const g = fixture();
		await g.runtime.start();
		await g.runtime.wake();
		g.children[0].stop.mockRejectedValue(new Error('drain'));
		await expect(g.runtime.stop()).rejects.toThrow('drain');
		expect(g.runtime.getHealth()).toMatchObject({
			healthy: false,
			reason: 'upload_queue_drain_failed'
		});
	});
});
function environment(): NodeJS.ProcessEnv {
	return {
		NODE_ENV: 'production',
		LIBRI_WORKER_PROFILE: 'production',
		LIBRI_WORKER_ENABLED: 'true',
		LIBRI_WORKER_ACTIVATION_MODE: 'uploads',
		LIBRI_WORKER_CONCURRENCY: '1',
		LIBRI_UPLOAD_LIBRARY_ID: libraryId,
		LIBRI_UPLOAD_DOWNLOAD_BROKER_URL: config.downloadBrokerUrl,
		LIBRI_UPLOAD_PUBLICATION_BROKER_URL: config.publicationBrokerUrl,
		PRIVATE_LIBRI_ASSET_BROKER_TOKEN: config.brokerToken
	};
}
it('requires explicit one-slot library-scoped production configuration without canary or dispatch overrides', () => {
	expect(() => requireDedicatedLibriWorkerProductionProfile(environment())).not.toThrow();
	expect(loadLibriWorkerConfig(environment()).uploadQueue).toMatchObject({
		...config,
		pollIntervalMs: 3000
	});
	for (const overrides of [
		{ LIBRI_WORKER_CONCURRENCY: '2' },
		{ LIBRI_WORKER_ADMISSION_DISPATCH_ENABLED: 'true' },
		{ LIBRI_UPLOAD_LIBRARY_ID: upload1 },
		{ LIBRI_WORKER_CANARY_EXPIRES_AT: new Date(Date.now() + 120000).toISOString() },
		{ LIBRI_WORKER_CANARY_UPLOAD_ID: upload1 },
		{
			LIBRI_UPLOAD_DOWNLOAD_BROKER_URL:
				'https://other.invalid/api/internal/libri/uploads/download'
		},
		{ PRIVATE_LIBRI_ASSET_BROKER_TOKEN: 'short' },
		{ LIBRI_UPLOAD_POLL_INTERVAL_MS: '0' }
	])
		expect(() => loadLibriWorkerConfig({ ...environment(), ...overrides })).toThrow();
	expect(
		loadLibriWorkerConfig({ ...environment(), LIBRI_WORKER_ENABLED: 'false' }).uploadQueue
	).toBeUndefined();
});
it('bootstrap reports upload health without advertising a research or OCR queue', async () => {
	const f = fixture();
	const db = { probe: vi.fn(async () => {}), close: vi.fn(async () => {}) };
	const bootstrap = new LibriWorkerBootstrap(db, loadLibriWorkerConfig(environment()), f.runtime);
	await bootstrap.start();
	expect(bootstrap.getHealth()).toMatchObject({
		healthy: true,
		upload: { concurrency: 1 },
		queue: { enabled: false, registeredJobTypes: [] }
	});
	await bootstrap.stop();
	expect(db.close).toHaveBeenCalledOnce();
});

it('composes real exact consumers for two sequential publications without OCR, retries or overlapping slots', async () => {
	const remaining = [upload1, upload2];
	const scopes: LibriUploadRuntimeConfig[] = [];
	let active = 0,
		maximum = 0;
	const publish = vi.fn(async () => {
		active++;
		maximum = Math.max(active, maximum);
		await Promise.resolve();
		remaining.shift();
		active--;
		return {
			publicationId: upload1,
			imageId: upload1,
			sourceId: upload1,
			alreadyPublished: false
		};
	});
	const runtime = new LibriUploadQueueRuntime({
		config,
		listCandidates: async () => [...remaining],
		createConsumer: (scope) => {
			scopes.push(scope);
			return new LibriUploadConsumer({
				scope: {
					libraryId: scope.libraryId,
					uploadId: scope.uploadId,
					leaseToken: scope.leaseToken
				},
				expiresAtMs: scope.expiresAtMs,
				processing: {
					claim: async () => ({
						libraryId: scope.libraryId,
						uploadId: scope.uploadId,
						leaseToken: scope.leaseToken,
						bookId: upload1,
						objectPath: 'fixture',
						declaration: { mimeType: 'image/png', byteSize: 1, sha256: 'a'.repeat(64) },
						attempt: 1,
						leaseExpiresAt: new Date(Date.now() + 90000).toISOString()
					}),
					fail: async () => {
						throw new Error('Unexpected failure');
					}
				},
				downloader: {
					isBusy: () => false,
					downloadAndVerify: async () => ({
						bytes: Buffer.from('a'),
						byteSize: 1,
						mimeType: 'image/png',
						sha256: 'a'.repeat(64),
						width: 1,
						height: 1,
						channels: 4
					})
				},
				verifier: { isBusy: () => false },
				publisher: {
					inspect: async () => 'fresh',
					publish,
					reconcile: async () => {
						throw new Error('Unexpected reconciliation');
					},
					isBusy: () => false
				}
			});
		}
	});
	await runtime.start();
	await vi.advanceTimersByTimeAsync(5000);
	expect(publish).toHaveBeenCalledTimes(2);
	expect(maximum).toBe(1);
	expect(scopes.map((scope) => scope.uploadId)).toEqual([upload1, upload2]);
	expect(runtime.getHealth()).toMatchObject({ healthy: true, completedJobs: 2, activeJobs: 0 });
	await runtime.stop();
	await vi.advanceTimersByTimeAsync(60000);
	expect(publish).toHaveBeenCalledTimes(2);
});

it('continues after an acknowledged verification failure, leaving retry eligibility to the database', async () => {
	const f = fixture();
	await f.runtime.start();
	await f.runtime.wake();
	Object.assign(f.children[0], { getSettledFailure: () => true });
	Object.assign(f.children[0].health, {
		state: 'failed',
		healthy: false,
		failedJobs: 1,
		reason: 'upload_verification_failed'
	});
	await f.runtime.wake();
	f.list.mockResolvedValue([upload2]);
	await f.runtime.wake();
	expect(f.scopes.map((scope) => scope.uploadId)).toEqual([upload1, upload2]);
	expect(f.runtime.getHealth()).toMatchObject({ healthy: true, failedJobs: 1, activeJobs: 1 });
	await f.runtime.stop();
});
