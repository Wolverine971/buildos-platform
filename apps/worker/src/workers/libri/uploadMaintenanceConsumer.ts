import type { LibriMaintenanceConsumerHealth } from './maintenanceConsumer';
import type {
	LibriUploadMaintenanceCommand,
	createLibriUploadMaintenanceTransport
} from './uploadMaintenanceTransport';

/** One exact upload, at most four retained targets, no polling or automatic retry.
 * A missing object is an observation; the durable target remains for later checks.
 */
export class LibriUploadMaintenanceConsumer {
	private state: LibriMaintenanceConsumerHealth['state'] = 'idle';
	private reason?: string;
	private readonly abort = new AbortController();
	private readonly deadline: number;
	private readonly scope: Readonly<{ libraryId: string; uploadId: string; leaseToken: string }>;
	private expiry?: ReturnType<typeof setTimeout>;
	private work?: Promise<void>;
	private stopPromise?: Promise<void>;
	private completed = false;
	private retired = false;
	private slotReleased = false;
	private absent = 0;
	private deferred = 0;

	constructor(
		private readonly options: {
			scope: { libraryId: string; uploadId: string; leaseToken: string };
			expiresAtMs: number;
			transport: ReturnType<typeof createLibriUploadMaintenanceTransport>;
		}
	) {
		const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
		if (
			Object.keys(options.scope).length !== 3 ||
			![options.scope.libraryId, options.scope.uploadId, options.scope.leaseToken].every(
				(v) => typeof v === 'string' && uuid.test(v)
			)
		)
			throw new Error('Exact maintenance scope and stable token required');
		const remaining = options.expiresAtMs - Date.now();
		if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 30 * 60_000)
			throw new Error('Maintenance expiry must be within 30 minutes');
		this.scope = Object.freeze({ ...options.scope });
		this.options = Object.freeze({ ...options, scope: this.scope });
		this.deadline = performance.now() + remaining;
	}
	start(): Promise<void> {
		if (this.state === 'running') return Promise.resolve();
		if (this.state !== 'idle')
			return Promise.reject(new Error('Maintenance consumer cannot restart'));
		this.state = 'running';
		if (!this.authorized()) return Promise.resolve();
		this.expiry = setTimeout(
			() => this.fail('maintenance_canary_expired'),
			Math.max(1, this.options.expiresAtMs - Date.now())
		);
		this.expiry.unref();
		this.work = this.run()
			.catch(() => this.fail('maintenance_reconciliation_required'))
			.finally(() => {
				this.work = undefined;
			});
		return Promise.resolve();
	}
	stop(): Promise<void> {
		if (this.stopPromise) return this.stopPromise;
		this.state = 'stopping';
		clearTimeout(this.expiry);
		this.abort.abort();
		this.stopPromise = (async () => {
			const deadline = performance.now() + 20_000;
			while (this.work || this.options.transport.isBusy()) {
				if (performance.now() >= deadline) {
					this.state = 'failed';
					this.reason = 'maintenance_drain_timeout';
					throw new Error('Libri maintenance drain incomplete');
				}
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			this.state = 'stopped';
		})();
		return this.stopPromise;
	}
	getHealth() {
		if (this.state === 'running' && !this.completed) this.authorized();
		return {
			healthy: this.state === 'running' && !this.reason,
			state: this.state,
			...(this.reason ? { reason: this.reason } : {}),
			activeJobs: this.work || this.options.transport.isBusy() ? 1 : 0,
			availableConcurrency: 0,
			concurrency: 1,
			lastSuccessfulClaimAt: null,
			consecutiveClaimFailures: 0,
			completedJobs: this.completed ? 1 : 0,
			failedJobs: this.reason ? 1 : 0,
			staleOwnershipJobs: 0,
			quarantinedJobs: this.reason === 'maintenance_reconciliation_required' ? 1 : 0,
			maintenance: {
				retired: this.retired,
				unissuedSlotReleased: this.slotReleased,
				targetsObservedAbsent: this.absent,
				targetsDeferred: this.deferred
			}
		};
	}
	private async run(): Promise<void> {
		const scope = { libraryId: this.scope.libraryId, uploadId: this.scope.uploadId };
		const call = async (command: LibriUploadMaintenanceCommand) => {
			if (!this.authorized()) throw new Error('Maintenance expired');
			const receipt = await this.options.transport.request(command, this.abort.signal);
			if (!this.authorized()) throw new Error('Maintenance interrupted');
			return receipt;
		};
		const retired = await call({ ...scope, action: 'retire' });
		if (retired.action !== 'retire') throw new Error('Invalid retirement receipt');
		if (retired.status === 'retired') {
			this.retired = true;
			const released = await call({ ...scope, action: 'release_unissued' });
			if (released.action !== 'release_unissued')
				throw new Error('Invalid settlement receipt');
			this.slotReleased = released.status === 'released';
			const targets = await call({ ...scope, action: 'targets' });
			if (targets.action !== 'targets') throw new Error('Invalid target receipt');
			for (const targetId of targets.targetIds) {
				const result = await call({
					...scope,
					action: 'cleanup',
					targetId,
					leaseToken: this.scope.leaseToken
				});
				if (result.action !== 'cleanup' || result.status === 'unavailable')
					throw new Error('Cleanup requires reconciliation');
				if (result.status === 'absent') this.absent++;
				else this.deferred++;
			}
		}
		this.completed = true;
		clearTimeout(this.expiry);
	}
	private authorized(): boolean {
		if (this.state !== 'running' || this.abort.signal.aborted) return false;
		if (Date.now() >= this.options.expiresAtMs || performance.now() >= this.deadline) {
			this.fail('maintenance_canary_expired');
			return false;
		}
		return true;
	}
	private fail(reason: string): void {
		if (this.state === 'stopping' || this.state === 'stopped') return;
		this.state = 'failed';
		this.reason ??= reason;
		clearTimeout(this.expiry);
		this.abort.abort();
	}
}
