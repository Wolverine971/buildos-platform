import type { LibriMaintenanceConsumerHealth } from './maintenanceConsumer';
import type {
	LibriUploadClaim,
	LibriUploadClaimInput,
	createLibriUploadProcessing
} from './uploadProcessing';
import type { LibriVerifiedUploadImage } from './uploadImageVerifier';
import { LibriUploadVerificationError } from './uploadImageVerifier';
import { type LibriPublicationReceipt, LibriUploadPublicationError } from './uploadPublication';

type Processing = Pick<ReturnType<typeof createLibriUploadProcessing>, 'claim' | 'fail'>;
type UploadInput = {
	claim: LibriUploadClaim;
	verified: LibriVerifiedUploadImage;
	signal: AbortSignal;
};
export type LibriUploadConsumerOptions = {
	scope: LibriUploadClaimInput;
	expiresAtMs: number;
	processing: Processing;
	downloader: {
		downloadAndVerify(input: {
			claim: LibriUploadClaim;
			signal: AbortSignal;
		}): Promise<LibriVerifiedUploadImage>;
		isBusy(): boolean;
	};
	publisher: {
		inspect(
			input: LibriUploadClaimInput & { signal: AbortSignal }
		): Promise<'fresh' | 'published' | 'recovery_required'>;
		publish(input: UploadInput): Promise<LibriPublicationReceipt>;
		reconcile(input: UploadInput): Promise<LibriPublicationReceipt | null>;
		isBusy(): boolean;
	};
	verifier: { isBusy(): boolean };
};

/** One exact upload and one stable operator-supplied token, including across restarts.
 * Claims may be replayed after a lost reply; publication is never replayed. A single
 * finalize-only reconciliation can recover a lost completion, otherwise we stop.
 * This consumer has no queue dispatch, paid OCR, cleanup or quota-release authority.
 */
export class LibriUploadConsumer {
	private state: LibriMaintenanceConsumerHealth['state'] = 'idle';
	private readonly abort = new AbortController();
	private timer?: ReturnType<typeof setTimeout>;
	private expiry?: ReturnType<typeof setTimeout>;
	private work?: Promise<void>;
	private stopPromise?: Promise<void>;
	private reason?: string;
	private completed = 0;
	private inspected = false;
	private failures = 0;
	private claimFailures = 0;
	private lastClaim: string | null = null;
	private readonly scope: Readonly<LibriUploadClaimInput>;
	private readonly deadline: number;

	constructor(private readonly options: LibriUploadConsumerOptions) {
		const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
		if (
			!Object.values(options.scope).every((v) => typeof v === 'string' && uuid.test(v)) ||
			Object.keys(options.scope).length !== 3
		)
			throw new Error('An exact upload, library and stable lease token are required');
		const remaining = options.expiresAtMs - Date.now();
		if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 30 * 60_000)
			throw new Error('Upload canary expiry must be within 30 minutes');
		this.scope = Object.freeze({ ...options.scope });
		this.deadline = performance.now() + remaining;
	}

	start(): Promise<void> {
		if (this.state === 'running') return Promise.resolve();
		if (this.state !== 'idle')
			return Promise.reject(new Error('Upload consumer cannot restart'));
		this.state = 'running';
		if (!this.authorized()) return Promise.resolve();
		this.expiry = setTimeout(
			() => this.halt('upload_canary_expired'),
			Math.max(1, this.options.expiresAtMs - Date.now())
		);
		this.expiry.unref();
		this.schedule(0);
		return Promise.resolve();
	}

	stop(): Promise<void> {
		if (this.stopPromise) return this.stopPromise;
		this.state = 'stopping';
		this.clearTimers();
		this.abort.abort();
		this.stopPromise = this.drain();
		return this.stopPromise;
	}

	getHealth(): LibriMaintenanceConsumerHealth {
		if (this.state === 'running' && !this.completed) this.authorized();
		const active = this.work !== undefined || this.dependenciesBusy();
		return {
			healthy: this.state === 'running' && !this.reason,
			state: this.state,
			...(this.reason ? { reason: this.reason } : {}),
			activeJobs: active ? 1 : 0,
			availableConcurrency: this.state === 'running' && !active && !this.completed ? 1 : 0,
			concurrency: 1,
			lastSuccessfulClaimAt: this.lastClaim,
			consecutiveClaimFailures: this.claimFailures,
			completedJobs: this.completed,
			failedJobs: this.failures,
			staleOwnershipJobs: 0,
			quarantinedJobs: this.reason === 'upload_reconciliation_required' ? 1 : 0
		};
	}

	private schedule(delay: number): void {
		if (!this.authorized() || this.completed) return;
		this.timer = setTimeout(() => {
			if (!this.authorized() || this.work || this.dependenciesBusy()) return;
			this.work = this.run()
				.catch(() => this.halt('upload_reconciliation_required'))
				.finally(() => {
					this.work = undefined;
					this.schedule(1_000);
				});
		}, delay);
		this.timer.unref();
	}

	private async run(): Promise<void> {
		if (!this.inspected) {
			const state = await this.options.publisher.inspect({
				...this.scope,
				signal: this.abort.signal
			});
			if (!this.authorized()) return;
			if (state === 'published') {
				this.completed = 1;
				this.clearTimers();
				return;
			}
			if (state !== 'fresh') return this.halt('upload_reconciliation_required');
			this.inspected = true;
		}

		let claim: LibriUploadClaim | null;
		try {
			claim = await this.options.processing.claim(this.scope);
		} catch {
			if (++this.claimFailures >= 3) this.halt('upload_claim_outcome_unknown');
			return; // Only the same token is retried. Never consume a fresh attempt.
		}
		if (!this.authorized()) return;
		if (!claim) {
			if (this.claimFailures) this.halt('upload_claim_outcome_unknown');
			return;
		}
		this.claimFailures = 0;
		if (
			claim.libraryId !== this.scope.libraryId ||
			claim.uploadId !== this.scope.uploadId ||
			claim.leaseToken !== this.scope.leaseToken
		)
			return this.halt('upload_invalid_claim');
		this.lastClaim = new Date().toISOString();
		const leaseRemaining = Date.parse(claim.leaseExpiresAt) - Date.now() - 2_000;
		if (!Number.isFinite(leaseRemaining) || leaseRemaining <= 0 || leaseRemaining > 90_000)
			return this.halt('upload_lease_expired');
		const lease = new AbortController();
		const leaseTimer = setTimeout(() => lease.abort(), leaseRemaining);
		const signal = AbortSignal.any([this.abort.signal, lease.signal]);
		try {
			let verified: LibriVerifiedUploadImage;
			try {
				verified = await this.options.downloader.downloadAndVerify({ claim, signal });
			} catch (cause) {
				if (signal.aborted || !this.authorized()) return this.halt('upload_interrupted');
				const failureCode =
					cause instanceof LibriUploadVerificationError && !cause.retryable
						? 'invalid_image'
						: 'verification_unavailable';
				await this.options.processing.fail({
					...this.scope,
					attempt: claim.attempt,
					failureCode
				});
				this.failures++;
				return this.halt('upload_verification_failed');
			}
			if (signal.aborted || !this.authorized()) return this.halt('upload_interrupted');
			const input = { claim, verified, signal };
			try {
				await this.options.publisher.publish(input);
			} catch (cause) {
				if (cause instanceof LibriUploadPublicationError && !cause.mayHaveWrittenObject)
					return this.halt('upload_publication_failed');
				// Publication may already be committed. Never fail the lease, re-upload,
				// release quota, or start another attempt after an uncertain reply.
				if (signal.aborted || !this.authorized() || this.options.publisher.isBusy())
					return this.halt('upload_reconciliation_required');
				const receipt = await this.options.publisher.reconcile(input);
				if (!receipt) return this.halt('upload_reconciliation_required');
			}
			if (signal.aborted || !this.authorized())
				return this.halt('upload_reconciliation_required');
			this.completed = 1;
			this.clearTimers();
		} finally {
			clearTimeout(leaseTimer);
		}
	}

	private authorized(): boolean {
		if (this.state !== 'running' || this.abort.signal.aborted) return false;
		if (Date.now() >= this.options.expiresAtMs || performance.now() >= this.deadline) {
			this.halt('upload_canary_expired');
			return false;
		}
		return true;
	}
	private halt(reason: string): void {
		if (this.state === 'stopping' || this.state === 'stopped') return;
		this.reason ??= reason;
		this.state = 'failed';
		this.clearTimers();
		this.abort.abort();
	}
	private clearTimers(): void {
		clearTimeout(this.timer);
		clearTimeout(this.expiry);
	}
	private dependenciesBusy(): boolean {
		return (
			this.options.downloader.isBusy() ||
			this.options.publisher.isBusy() ||
			this.options.verifier.isBusy()
		);
	}
	private async drain(): Promise<void> {
		const deadline = performance.now() + 20_000;
		while (this.work || this.dependenciesBusy()) {
			if (performance.now() >= deadline) {
				this.state = 'failed';
				this.reason = 'upload_drain_timeout';
				throw new Error('Libri upload drain incomplete');
			}
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		this.state = 'stopped';
	}
}
