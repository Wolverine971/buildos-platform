import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createLibriUploadMaintenanceTransport,
	type LibriUploadMaintenanceReceipt
} from '../src/workers/libri/uploadMaintenanceTransport';
import { LibriUploadMaintenanceConsumer } from '../src/workers/libri/uploadMaintenanceConsumer';
import {
	loadLibriWorkerConfig,
	requireDedicatedLibriWorkerProductionProfile
} from '../src/config/libriWorkerProfile';
import { LibriWorkerBootstrap } from '../src/workers/libri/bootstrap';

const scope = {
	libraryId: 'f09948c4-e4e0-581c-8689-7258bea2f501',
	uploadId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
	leaseToken: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
};
const targetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const secondTarget = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const endpointUrl = 'https://build-os.com/api/internal/libri/uploads/maintain';
const bearerToken = 'synthetic-machine-token-abcdefghijklmnopqrstuvwxyz';
const command = { action: 'retire' as const, libraryId: scope.libraryId, uploadId: scope.uploadId };
const signal = () => new AbortController().signal;
function transportFixture() {
	const fetchImpl = vi.fn<typeof fetch>(async () =>
		Response.json({ action: 'retire', uploadId: scope.uploadId, status: 'ineligible' })
	);
	const transport = createLibriUploadMaintenanceTransport({
		endpointUrl,
		bearerToken,
		fetchImpl
	});
	return { fetchImpl, transport };
}
function consumerFixture() {
	const request = vi.fn<ReturnType<typeof createLibriUploadMaintenanceTransport>['request']>(
		async (input): Promise<LibriUploadMaintenanceReceipt> => {
			const base = { uploadId: input.uploadId };
			if (input.action === 'retire')
				return { ...base, action: 'retire', status: 'retired', outcome: 'expired' };
			if (input.action === 'release_unissued')
				return { ...base, action: 'release_unissued', status: 'released' };
			if (input.action === 'targets')
				return { ...base, action: 'targets', targetIds: [targetId, secondTarget] };
			if (input.action !== 'cleanup') throw new Error('Unexpected action');
			return {
				...base,
				action: 'cleanup',
				targetId: input.targetId,
				status: input.targetId === targetId ? 'absent' : 'unclaimed',
				mayHaveDeletedObject: false
			};
		}
	);
	const transport = { request, isBusy: vi.fn(() => false) };
	const options = { scope: { ...scope }, expiresAtMs: Date.now() + 120_000, transport };
	const consumer = new LibriUploadMaintenanceConsumer(options);
	return { consumer, transport, options, request };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});
describe('maintenance machine transport', () => {
	it('sends one exact command without forwarding database or Storage authority', async () => {
		const f = transportFixture();
		expect(await f.transport.request(command, signal())).toEqual({
			action: 'retire',
			uploadId: scope.uploadId,
			status: 'ineligible'
		});
		expect(f.fetchImpl).toHaveBeenCalledOnce();
		const [url, init] = f.fetchImpl.mock.calls[0];
		expect(url).toBe(endpointUrl);
		expect(JSON.parse(String(init?.body))).toEqual(command);
		expect(init).toMatchObject({
			method: 'POST',
			redirect: 'error',
			credentials: 'omit',
			cache: 'no-store'
		});
		expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${bearerToken}`);
	});
	it.each([
		'http://build-os.com/api/internal/libri/uploads/maintain',
		endpointUrl + '?path=anything',
		endpointUrl + '#other',
		endpointUrl + '/',
		'https://user:password@build-os.com/api/internal/libri/uploads/maintain'
	])('rejects endpoint %s', (url) => {
		expect(() =>
			createLibriUploadMaintenanceTransport({ endpointUrl: url, bearerToken })
		).toThrow();
	});
	it('rejects extra command authority and aborted work before fetching', async () => {
		const f = transportFixture();
		await expect(
			f.transport.request({ ...command, objectPath: 'anything' } as never, signal())
		).rejects.toThrow('outcome unknown');
		await expect(f.transport.request(command, AbortSignal.abort())).rejects.toThrow(
			'outcome unknown'
		);
		expect(f.fetchImpl).not.toHaveBeenCalled();
	});
	it.each([
		{ action: 'retire', uploadId: targetId, status: 'ineligible' },
		{ action: 'retire', uploadId: scope.uploadId, status: 'retired', outcome: 'unknown' },
		{
			action: 'retire',
			uploadId: scope.uploadId,
			status: 'ineligible',
			secret: 'must-not-pass'
		}
	])('rejects invalid receipt without retry: %j', async (receipt) => {
		const f = transportFixture();
		f.fetchImpl.mockResolvedValueOnce(Response.json(receipt));
		await expect(f.transport.request(command, signal())).rejects.toThrow('outcome unknown');
		expect(f.fetchImpl).toHaveBeenCalledOnce();
	});
	it.each([[targetId, targetId], Array.from({ length: 5 }, () => targetId), ['invalid']])(
		'rejects unsafe target sets %j',
		async (...targets) => {
			const f = transportFixture();
			f.fetchImpl.mockResolvedValueOnce(
				Response.json({ action: 'targets', uploadId: scope.uploadId, targetIds: targets })
			);
			await expect(
				f.transport.request({ ...command, action: 'targets' }, signal())
			).rejects.toThrow();
		}
	);
	it('keeps capacity occupied after abort until the native request settles', async () => {
		const f = transportFixture();
		let settle!: (response: Response) => void;
		f.fetchImpl.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					settle = resolve;
				})
		);
		const pending = f.transport.request(command, signal());
		const rejected = expect(pending).rejects.toThrow('outcome unknown');
		await vi.advanceTimersByTimeAsync(25_000);
		await rejected;
		expect(f.transport.isBusy()).toBe(true);
		await expect(f.transport.request(command, signal())).rejects.toThrow();
		expect(f.fetchImpl).toHaveBeenCalledOnce();
		settle(Response.json(null));
		await vi.advanceTimersByTimeAsync(1);
		expect(f.transport.isBusy()).toBe(false);
	});
	it('rejects oversized streamed receipts', async () => {
		const f = transportFixture();
		f.fetchImpl.mockResolvedValueOnce(Response.json('x'.repeat(2000)));
		await expect(f.transport.request(command, signal())).rejects.toThrow();
		expect(f.fetchImpl).toHaveBeenCalledOnce();
	});
});
describe('bounded maintenance consumer', () => {
	it('runs one retirement, settlement, and exact target pass, preserving the stable token', async () => {
		const f = consumerFixture();
		await f.consumer.start();
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(f.request.mock.calls.map(([c]) => c.action)).toEqual([
			'retire',
			'release_unissued',
			'targets',
			'cleanup',
			'cleanup'
		]);
		expect(f.request.mock.calls.slice(3).map(([c]) => c)).toEqual(
			[targetId, secondTarget].map((id) => ({ ...scope, action: 'cleanup', targetId: id }))
		);
		expect(f.consumer.getHealth()).toMatchObject({
			healthy: true,
			completedJobs: 1,
			activeJobs: 0,
			maintenance: {
				retired: true,
				unissuedSlotReleased: true,
				targetsObservedAbsent: 1,
				targetsDeferred: 1
			}
		});
		await f.consumer.stop();
	});
	it('ends known ineligibility without settlement or cleanup', async () => {
		const f = consumerFixture();
		f.request.mockResolvedValueOnce({
			action: 'retire',
			uploadId: scope.uploadId,
			status: 'ineligible'
		});
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(1);
		expect(f.request).toHaveBeenCalledOnce();
		expect(f.consumer.getHealth()).toMatchObject({
			healthy: true,
			completedJobs: 1,
			maintenance: { retired: false }
		});
		await f.consumer.stop();
	});
	it.each(['retire', 'release_unissued', 'targets', 'cleanup'])(
		'halts after uncertain %s without retries or later operations',
		async (failAt) => {
			const f = consumerFixture();
			const original = f.request.getMockImplementation()!;
			f.request.mockImplementation(async (...args) => {
				if (args[0].action === failAt) throw new Error('lost reply');
				return original(...args);
			});
			await f.consumer.start();
			await vi.advanceTimersByTimeAsync(10_000);
			expect(f.request.mock.calls.at(-1)![0].action).toBe(failAt);
			expect(f.request.mock.calls.filter(([c]) => c.action === failAt)).toHaveLength(1);
			expect(f.consumer.getHealth()).toMatchObject({
				healthy: false,
				completedJobs: 0,
				quarantinedJobs: 1,
				reason: 'maintenance_reconciliation_required'
			});
			await f.consumer.stop();
		}
	);
	it('halts on unavailable cleanup instead of moving to the next target', async () => {
		const f = consumerFixture();
		const original = f.request.getMockImplementation()!;
		f.request.mockImplementation(async (...args) =>
			args[0].action === 'cleanup'
				? {
						action: 'cleanup',
						uploadId: scope.uploadId,
						targetId,
						status: 'unavailable',
						mayHaveDeletedObject: true
					}
				: original(...args)
		);
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(10);
		expect(f.request).toHaveBeenCalledTimes(4);
		expect(f.consumer.getHealth().quarantinedJobs).toBe(1);
		await f.consumer.stop();
	});
	it('freezes its scope and expiry and prevents work after expiry', async () => {
		const f = consumerFixture();
		let settle!: (r: LibriUploadMaintenanceReceipt) => void;
		f.request.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					settle = resolve;
				})
		);
		f.options.scope.uploadId = targetId;
		f.options.expiresAtMs += 500_000;
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(120_001);
		expect(f.request.mock.calls[0][0]).toEqual(command);
		expect(f.request.mock.calls[0][1].aborted).toBe(true);
		settle({
			action: 'retire',
			uploadId: scope.uploadId,
			status: 'retired',
			outcome: 'expired'
		});
		await vi.advanceTimersByTimeAsync(1);
		expect(f.request).toHaveBeenCalledOnce();
		expect(f.consumer.getHealth().reason).toBe('maintenance_canary_expired');
		await f.consumer.stop();
	});
	it('shutdown drains actual transport capacity and fails if it remains occupied', async () => {
		const f = consumerFixture();
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(1);
		f.transport.isBusy.mockReturnValue(true);
		const stopped = f.consumer.stop();
		const rejected = expect(stopped).rejects.toThrow('drain incomplete');
		await vi.advanceTimersByTimeAsync(20_000);
		await rejected;
		expect(f.consumer.getHealth()).toMatchObject({
			state: 'failed',
			activeJobs: 1,
			reason: 'maintenance_drain_timeout'
		});
	});
});
function environment(): NodeJS.ProcessEnv {
	return {
		NODE_ENV: 'production',
		LIBRI_WORKER_PROFILE: 'production',
		LIBRI_WORKER_ENABLED: 'true',
		LIBRI_WORKER_ACTIVATION_MODE: 'upload_maintenance_canary',
		LIBRI_WORKER_CONCURRENCY: '1',
		LIBRI_WORKER_CANARY_LIBRARY_ID: scope.libraryId,
		LIBRI_WORKER_CANARY_UPLOAD_ID: scope.uploadId,
		LIBRI_WORKER_CANARY_UPLOAD_LEASE_TOKEN: scope.leaseToken,
		LIBRI_WORKER_CANARY_EXPIRES_AT: new Date(Date.now() + 120_000).toISOString(),
		LIBRI_UPLOAD_MAINTENANCE_BROKER_URL: endpointUrl,
		PRIVATE_LIBRI_ASSET_BROKER_TOKEN: bearerToken
	};
}
describe('maintenance activation and service health', () => {
	it('is disabled by default and needs no OCR, download, or publication credentials', () => {
		expect(loadLibriWorkerConfig({}).uploadMaintenance).toBeUndefined();
		const config = loadLibriWorkerConfig(environment());
		expect(config.uploadMaintenance).toMatchObject(scope);
		expect(config.upload).toBeUndefined();
		expect(() => requireDedicatedLibriWorkerProductionProfile(environment())).not.toThrow();
	});
	it.each([
		['LIBRI_WORKER_CONCURRENCY', '2'],
		['LIBRI_WORKER_ADMISSION_DISPATCH_ENABLED', 'true'],
		['LIBRI_WORKER_CANARY_UPLOAD_ID', ''],
		['LIBRI_WORKER_CANARY_UPLOAD_LEASE_TOKEN', ''],
		['LIBRI_WORKER_CANARY_LIBRARY_ID', ''],
		['LIBRI_WORKER_CANARY_EXPIRES_AT', '2020-01-01'],
		['LIBRI_UPLOAD_MAINTENANCE_BROKER_URL', endpointUrl + '/wrong'],
		['PRIVATE_LIBRI_ASSET_BROKER_TOKEN', '']
	])('rejects invalid %s before connecting', (key, value) =>
		expect(() => loadLibriWorkerConfig({ ...environment(), [key]: value })).toThrow()
	);
	it('reports maintenance separately and keeps queue and OCR consumption off', async () => {
		const f = consumerFixture();
		f.request.mockRejectedValueOnce(new Error('unknown'));
		const database = {
			probe: vi.fn(async () => undefined),
			close: vi.fn(async () => undefined)
		};
		const bootstrap = new LibriWorkerBootstrap(
			database,
			loadLibriWorkerConfig(environment()),
			f.consumer
		);
		await bootstrap.start();
		await vi.advanceTimersByTimeAsync(1);
		expect(bootstrap.getHealth()).toMatchObject({
			healthy: false,
			uploadMaintenance: { quarantinedJobs: 1 },
			queue: { enabled: false, registeredJobTypes: [], concurrency: 0 }
		});
		expect(bootstrap.getHealth().upload).toBeUndefined();
		await bootstrap.stop();
		expect(database.close).toHaveBeenCalledOnce();
	});
});
