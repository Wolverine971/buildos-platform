import { randomUUID } from 'node:crypto';
import type {
	LibriUploadQueueRuntimeConfig,
	LibriUploadRuntimeConfig
} from '../../config/libriWorkerProfile';
import type { LibriMaintenanceConsumerPort } from './bootstrap';
import type { LibriMaintenanceConsumerHealth } from './maintenanceConsumer';
import { createLibriUploadConsumer } from './uploadRuntime';
import type { createLibriUploadProcessing } from './uploadProcessing';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type QueueConsumer = LibriMaintenanceConsumerPort & { getSettledFailure?: () => boolean };
type Options = {
	config: LibriUploadQueueRuntimeConfig;
	listCandidates: (libraryId: string) => Promise<string[]>;
	createConsumer: (config: LibriUploadRuntimeConfig) => QueueConsumer;
};

/** Sequential sustained intake using the existing fenced exact-upload consumer.
 * One stable token owns each bounded attempt. Unknown outcomes halt the runtime;
 * restarting re-inspects durable publication state before any download or write.
 * No provider, OCR dispatch, deletion, quota release or cross-library authority.
 */
export class LibriUploadQueueRuntime implements LibriMaintenanceConsumerPort {
	private state: LibriMaintenanceConsumerHealth['state'] = 'idle';
	private timer?: NodeJS.Timeout;
	private tickPromise?: Promise<void>;
	private stopPromise?: Promise<void>;
	private child?: QueueConsumer;
	private currentUpload?: string;
	private lastCompletedUpload?: string;
	private reason?: string;
	private completed = 0;
	private failed = 0;
	private quarantined = 0;
	private pollFailures = 0;
	private lastClaim: string | null = null;

	constructor(private readonly options: Options) {
		if (
			!UUID.test(options.config.libraryId) ||
			!Number.isInteger(options.config.pollIntervalMs) ||
			options.config.pollIntervalMs < 1000 ||
			options.config.pollIntervalMs > 60000
		)
			throw new Error('Invalid upload queue configuration');
	}
	start(): Promise<void> {
		if (this.state !== 'idle') return Promise.reject(new Error('Upload queue cannot restart'));
		this.state = 'running';
		this.schedule(0);
		return Promise.resolve();
	}
	wake(): Promise<void> {
		if (this.state !== 'running') return Promise.resolve();
		if (this.tickPromise) return this.tickPromise;
		clearTimeout(this.timer);
		this.tickPromise = this.tick()
			.catch(async () => {
				if (this.state !== 'running') return;
				this.reason = 'upload_queue_reconciliation_required';
				this.state = 'failed';
				this.quarantined++;
				await this.child?.stop();
			})
			.finally(() => {
				this.tickPromise = undefined;
				if (this.state === 'running')
					this.schedule(this.child ? 1000 : this.options.config.pollIntervalMs);
			});
		// Drain errors remain observable to stop() and health; avoid an unhandled timer rejection.
		void this.tickPromise.catch(() => undefined);
		return this.tickPromise;
	}
	stop(): Promise<void> {
		if (this.stopPromise) return this.stopPromise;
		this.state = 'stopping';
		clearTimeout(this.timer);
		this.stopPromise = Promise.allSettled([this.tickPromise, this.child?.stop()]).then(
			(results) => {
				const failure = results.find((result) => result.status === 'rejected');
				this.state = failure ? 'failed' : 'stopped';
				if (failure?.status === 'rejected') {
					this.reason = 'upload_queue_drain_failed';
					throw failure.reason;
				}
			}
		);
		return this.stopPromise;
	}
	getHealth(): LibriMaintenanceConsumerHealth {
		const child = this.child?.getHealth();
		return {
			healthy:
				this.state === 'running' && this.pollFailures === 0 && (!child || child.healthy),
			state: this.state,
			...(this.reason || child?.reason ? { reason: this.reason ?? child?.reason } : {}),
			activeJobs: child?.activeJobs ?? 0,
			availableConcurrency:
				this.state === 'running' && !this.child && !this.tickPromise ? 1 : 0,
			concurrency: 1,
			lastSuccessfulClaimAt: child?.lastSuccessfulClaimAt ?? this.lastClaim,
			consecutiveClaimFailures: this.pollFailures + (child?.consecutiveClaimFailures ?? 0),
			completedJobs: this.completed + (child?.completedJobs ?? 0),
			failedJobs: this.failed + (child?.failedJobs ?? 0),
			quarantinedJobs: this.quarantined + (child?.quarantinedJobs ?? 0),
			staleOwnershipJobs: child?.staleOwnershipJobs ?? 0
		};
	}
	private async tick(): Promise<void> {
		if (this.child) {
			const health = this.child.getHealth();
			const failureSettled =
				health.state === 'failed' && this.child.getSettledFailure?.() === true;
			if (health.state === 'failed' && !failureSettled) {
				this.reason = health.reason ?? 'upload_queue_reconciliation_required';
				this.state = 'failed';
				await this.child.stop();
				return;
			}
			if (!health.completedJobs && !failureSettled) return;
			// Drain before releasing the one slot; a completed receipt is not proof
			// that every in-flight dependency has already released its resources.
			await this.child.stop();
			this.completed += health.completedJobs;
			this.failed += health.failedJobs;
			this.quarantined += health.quarantinedJobs;
			this.lastClaim = health.lastSuccessfulClaimAt ?? this.lastClaim;
			if (health.completedJobs) this.lastCompletedUpload = this.currentUpload;
			this.child = undefined;
			this.currentUpload = undefined;
			return;
		}
		let candidates: string[];
		try {
			candidates = await this.options.listCandidates(this.options.config.libraryId);
		} catch {
			if (this.state !== 'running') return;
			this.pollFailures++;
			this.reason = 'upload_queue_candidates_unavailable';
			if (this.pollFailures >= 3) this.state = 'failed';
			return;
		}
		if (this.state !== 'running') return;
		if (
			!Array.isArray(candidates) ||
			candidates.length > 10 ||
			candidates.some((id) => typeof id !== 'string' || !UUID.test(id)) ||
			new Set(candidates).size !== candidates.length
		)
			throw new Error('Invalid upload candidates');
		this.pollFailures = 0;
		this.reason = undefined;
		if (!candidates.length) return;
		if (candidates[0] === this.lastCompletedUpload)
			throw new Error('Completed upload still offered');
		this.currentUpload = candidates[0];
		this.child = this.options.createConsumer({
			libraryId: this.options.config.libraryId,
			uploadId: this.currentUpload,
			leaseToken: randomUUID(),
			expiresAtMs: Date.now() + 120_000,
			downloadBrokerUrl: this.options.config.downloadBrokerUrl,
			publicationBrokerUrl: this.options.config.publicationBrokerUrl,
			brokerToken: this.options.config.brokerToken
		});
		await this.child.start();
	}
	private schedule(delay: number): void {
		this.timer = setTimeout(() => void this.wake(), delay);
		this.timer.unref();
	}
}
export function createLibriUploadQueueRuntime(
	config: LibriUploadQueueRuntimeConfig,
	processing: ReturnType<typeof createLibriUploadProcessing>
) {
	return new LibriUploadQueueRuntime({
		config,
		listCandidates: (id) => processing.listCandidates(id),
		createConsumer: (input) => createLibriUploadConsumer(input, processing)
	});
}
