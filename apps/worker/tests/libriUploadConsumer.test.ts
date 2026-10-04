import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	LibriUploadConsumer,
	type LibriUploadConsumerOptions
} from '../src/workers/libri/uploadConsumer';
import { LibriUploadVerificationError } from '../src/workers/libri/uploadImageVerifier';
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
const imageId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const receipt = { publicationId: imageId, imageId, sourceId: imageId, alreadyPublished: false };
const verified = {
	bytes: Buffer.from('image'),
	byteSize: 5,
	mimeType: 'image/png' as const,
	sha256: 'a'.repeat(64),
	width: 1,
	height: 1,
	channels: 4
};
function fixture() {
	const claim = {
		...scope,
		bookId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
		objectPath: `${scope.libraryId}/uploads/${scope.uploadId}/original.png`,
		declaration: {
			mimeType: verified.mimeType,
			byteSize: verified.byteSize,
			sha256: verified.sha256
		},
		attempt: 1,
		leaseExpiresAt: new Date(Date.now() + 90_000).toISOString()
	};
	const processing = {
		claim: vi.fn<LibriUploadConsumerOptions['processing']['claim']>(async () => claim),
		fail: vi.fn<LibriUploadConsumerOptions['processing']['fail']>(async () => true)
	};
	const downloader = {
		downloadAndVerify: vi.fn<LibriUploadConsumerOptions['downloader']['downloadAndVerify']>(
			async () => verified
		),
		isBusy: vi.fn(() => false)
	};
	const publisher = {
		inspect: vi.fn<LibriUploadConsumerOptions['publisher']['inspect']>(async () => 'fresh'),
		publish: vi.fn(async () => receipt),
		reconcile: vi.fn(async () => receipt as typeof receipt | null),
		isBusy: vi.fn(() => false)
	};
	const verifier = { isBusy: vi.fn(() => false) };
	const options: LibriUploadConsumerOptions = {
		scope,
		expiresAtMs: Date.now() + 120_000,
		processing,
		downloader,
		publisher,
		verifier
	};
	const consumer = new LibriUploadConsumer(options);
	return { claim, processing, downloader, publisher, verifier, options, consumer };
}
function environment(): NodeJS.ProcessEnv {
	return {
		NODE_ENV: 'production',
		LIBRI_WORKER_PROFILE: 'production',
		LIBRI_WORKER_ENABLED: 'true',
		LIBRI_WORKER_ACTIVATION_MODE: 'upload_canary',
		LIBRI_WORKER_CONCURRENCY: '1',
		LIBRI_WORKER_CANARY_LIBRARY_ID: scope.libraryId,
		LIBRI_WORKER_CANARY_UPLOAD_ID: scope.uploadId,
		LIBRI_WORKER_CANARY_UPLOAD_LEASE_TOKEN: scope.leaseToken,
		LIBRI_WORKER_CANARY_EXPIRES_AT: new Date(Date.now() + 120_000).toISOString(),
		LIBRI_UPLOAD_DOWNLOAD_BROKER_URL:
			'https://build-os.com/api/internal/libri/uploads/download',
		LIBRI_UPLOAD_PUBLICATION_BROKER_URL:
			'https://build-os.com/api/internal/libri/uploads/publish',
		PRIVATE_LIBRI_ASSET_BROKER_TOKEN: 'synthetic-broker-credential-abcdefghijklmnopqrstuvwxyz'
	};
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe('exact upload consumer', () => {
	it('rechecks publications after taking over a lease from another process', async () => {
		const f = fixture();
		f.publisher.inspect
			.mockResolvedValueOnce('fresh')
			.mockResolvedValueOnce('recovery_required');
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(10);
		expect(f.processing.claim).toHaveBeenCalledOnce();
		expect(f.downloader.downloadAndVerify).not.toHaveBeenCalled();
		expect(f.publisher.publish).not.toHaveBeenCalled();
		expect(f.consumer.getHealth()).toMatchObject({ reason: 'upload_reconciliation_required' });
		await f.consumer.stop();
	});
	it.each(['published', 'recovery_required'] as const)(
		'restarts against existing %s state without a claim or write',
		async (state) => {
			const f = fixture();
			f.publisher.inspect.mockResolvedValue(state);
			await f.consumer.start();
			await vi.advanceTimersByTimeAsync(10_000);
			expect(f.processing.claim).not.toHaveBeenCalled();
			expect(f.publisher.publish).not.toHaveBeenCalled();
			expect(f.consumer.getHealth()).toMatchObject({
				healthy: state === 'published',
				completedJobs: state === 'published' ? 1 : 0
			});
			await f.consumer.stop();
		}
	);

	it('owns one claim/download/publication and stops polling after success', async () => {
		const f = fixture();
		await f.consumer.start();
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(f.processing.claim).toHaveBeenCalledExactlyOnceWith(scope);
		expect(f.downloader.downloadAndVerify).toHaveBeenCalledOnce();
		expect(f.publisher.publish).toHaveBeenCalledOnce();
		expect(f.publisher.reconcile).not.toHaveBeenCalled();
		expect(f.processing.fail).not.toHaveBeenCalled();
		expect(f.consumer.getHealth()).toMatchObject({
			healthy: true,
			activeJobs: 0,
			completedJobs: 1,
			availableConcurrency: 0
		});
		await f.consumer.stop();
	});
	it('replays an ambiguous claim with the same token without minting a new attempt', async () => {
		const f = fixture();
		f.processing.claim.mockRejectedValueOnce(new Error('lost reply'));
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(1_001);
		expect(f.processing.claim.mock.calls).toEqual([[scope], [scope]]);
		expect(f.publisher.publish).toHaveBeenCalledOnce();
		await f.consumer.stop();
	});
	it('stops after three ambiguous claims', async () => {
		const f = fixture();
		f.processing.claim.mockRejectedValue(new Error('lost reply'));
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(f.processing.claim).toHaveBeenCalledTimes(3);
		expect(f.consumer.getHealth()).toMatchObject({
			healthy: false,
			reason: 'upload_claim_outcome_unknown'
		});
		await f.consumer.stop();
	});
	it('does not treat an ambiguous claim followed by null as success', async () => {
		const f = fixture();
		f.processing.claim
			.mockRejectedValueOnce(new Error('lost reply'))
			.mockResolvedValueOnce(null);
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(3_000);
		expect(f.consumer.getHealth()).toMatchObject({ healthy: false, completedJobs: 0 });
		expect(f.downloader.downloadAndVerify).not.toHaveBeenCalled();
		await f.consumer.stop();
	});
	it('recovers a lost publication reply by finalize-only reconciliation', async () => {
		const f = fixture();
		f.publisher.publish.mockRejectedValueOnce(new Error('lost reply'));
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(f.publisher.publish).toHaveBeenCalledOnce();
		expect(f.publisher.reconcile).toHaveBeenCalledOnce();
		expect(f.processing.fail).not.toHaveBeenCalled();
		expect(f.consumer.getHealth()).toMatchObject({ healthy: true, completedJobs: 1 });
		await f.consumer.stop();
	});
	it('quarantines an uncertain publication without failing or retrying it', async () => {
		const f = fixture();
		f.publisher.publish.mockRejectedValueOnce(new Error('lost reply'));
		f.publisher.reconcile.mockResolvedValue(null);
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(f.consumer.getHealth()).toMatchObject({
			healthy: false,
			quarantinedJobs: 1,
			reason: 'upload_reconciliation_required'
		});
		expect(f.processing.fail).not.toHaveBeenCalled();
		expect(f.processing.claim).toHaveBeenCalledOnce();
		await f.consumer.stop();
	});
	it('records an invalid image under its claim and never publishes it', async () => {
		const f = fixture();
		f.downloader.downloadAndVerify.mockRejectedValueOnce(
			new LibriUploadVerificationError('invalid_image', false)
		);
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(10);
		expect(f.processing.fail).toHaveBeenCalledExactlyOnceWith({
			...scope,
			attempt: 1,
			failureCode: 'invalid_image'
		});
		expect(f.publisher.publish).not.toHaveBeenCalled();
		await f.consumer.stop();
	});
	it('rejects cross-library claim receipts before downloading', async () => {
		const f = fixture();
		f.claim.libraryId = imageId;
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(10);
		expect(f.consumer.getHealth()).toMatchObject({ reason: 'upload_invalid_claim' });
		expect(f.downloader.downloadAndVerify).not.toHaveBeenCalled();
		await f.consumer.stop();
	});
	it('expires while waiting for an upload without doing later work', async () => {
		const f = fixture();
		f.processing.claim.mockResolvedValue(null);
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(120_001);
		const count = f.processing.claim.mock.calls.length;
		await vi.advanceTimersByTimeAsync(10_000);
		expect(f.processing.claim).toHaveBeenCalledTimes(count);
		expect(f.consumer.getHealth()).toMatchObject({
			healthy: false,
			reason: 'upload_canary_expired'
		});
		await f.consumer.stop();
	});
	it('cancels a pending download and drains without publishing late bytes', async () => {
		const f = fixture();
		let release!: (value: typeof verified) => void;
		f.downloader.downloadAndVerify.mockImplementation(
			() =>
				new Promise((resolve) => {
					release = resolve;
				})
		);
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(1);
		const stopped = f.consumer.stop();
		expect(f.downloader.downloadAndVerify.mock.calls[0][0].signal.aborted).toBe(true);
		release(verified);
		await vi.advanceTimersByTimeAsync(25);
		await stopped;
		expect(f.publisher.publish).not.toHaveBeenCalled();
		expect(f.consumer.getHealth()).toMatchObject({
			healthy: false,
			state: 'stopped',
			activeJobs: 0
		});
	});
	it('retains occupied native capacity and reports incomplete drain truthfully', async () => {
		const f = fixture();
		f.verifier.isBusy.mockReturnValue(true);
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(1);
		const stopped = f.consumer.stop();
		const rejection = expect(stopped).rejects.toThrow('drain incomplete');
		await vi.advanceTimersByTimeAsync(20_000);
		await rejection;
		expect(f.consumer.getHealth()).toMatchObject({
			healthy: false,
			activeJobs: 1,
			reason: 'upload_drain_timeout'
		});
	});
	it('does not reuse capacity while publication transport still owns work', async () => {
		const f = fixture();
		f.publisher.publish.mockImplementation(async () => {
			f.publisher.isBusy.mockReturnValue(true);
			throw new Error('timeout');
		});
		await f.consumer.start();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(f.publisher.reconcile).not.toHaveBeenCalled();
		expect(f.consumer.getHealth()).toMatchObject({ activeJobs: 1, quarantinedJobs: 1 });
		f.publisher.isBusy.mockReturnValue(false);
		await f.consumer.stop();
	});
});

describe('upload activation and health', () => {
	it('keeps uploads off by default without reading credentials', () => {
		expect(loadLibriWorkerConfig({})).toMatchObject({
			queueEnabled: false,
			activationMode: 'disabled'
		});
		expect(loadLibriWorkerConfig({}).upload).toBeUndefined();
	});
	it('accepts only the exact, expiring single-upload profile', () => {
		expect(() => requireDedicatedLibriWorkerProductionProfile(environment())).not.toThrow();
		expect(loadLibriWorkerConfig(environment()).upload).toMatchObject(scope);
	});
	for (const [key, value] of Object.entries({
		LIBRI_WORKER_CANARY_UPLOAD_ID: '',
		LIBRI_WORKER_CANARY_LIBRARY_ID: '',
		LIBRI_WORKER_CANARY_UPLOAD_LEASE_TOKEN: '',
		LIBRI_WORKER_CONCURRENCY: '2',
		LIBRI_WORKER_ADMISSION_DISPATCH_ENABLED: 'true',
		LIBRI_WORKER_CANARY_EXPIRES_AT: '2020-01-01',
		LIBRI_UPLOAD_DOWNLOAD_BROKER_URL: 'http://build-os.com/api/internal/libri/uploads/download',
		PRIVATE_LIBRI_ASSET_BROKER_TOKEN: ''
	})) {
		it(`refuses invalid ${key} before connecting`, () =>
			expect(() => loadLibriWorkerConfig({ ...environment(), [key]: value })).toThrow());
	}
	it('includes upload failures in service health and reports no queue consumption', async () => {
		const f = fixture();
		f.publisher.publish.mockRejectedValue(new Error('unknown'));
		f.publisher.reconcile.mockResolvedValue(null);
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
		await vi.advanceTimersByTimeAsync(10);
		expect(bootstrap.getHealth()).toMatchObject({
			healthy: false,
			upload: { quarantinedJobs: 1 },
			queue: { enabled: false, registeredJobTypes: [] }
		});
		await bootstrap.stop();
		expect(database.close).toHaveBeenCalledOnce();
	});
});

it('does not classify a refused failure receipt as a settled verification failure', async () => {
	const f = fixture();
	f.downloader.downloadAndVerify.mockRejectedValue(
		new LibriUploadVerificationError('invalid_image', false)
	);
	f.processing.fail.mockResolvedValue(false);
	await f.consumer.start();
	await vi.advanceTimersByTimeAsync(1000);
	expect(f.consumer.getSettledFailure()).toBe(false);
	expect(f.consumer.getHealth()).toMatchObject({
		state: 'failed',
		reason: 'upload_failure_outcome_unknown'
	});
	await f.consumer.stop();
});
