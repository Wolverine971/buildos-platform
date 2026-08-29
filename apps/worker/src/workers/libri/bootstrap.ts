import type { LibriWorkerConfig } from '../../config/libriWorkerProfile';

export const LIBRI_QUEUE_TYPES = [
	'libri_ingest',
	'libri_research',
	'libri_derive',
	'libri_maintenance'
] as const;

export type LibriQueueType = (typeof LIBRI_QUEUE_TYPES)[number];

export type LibriDatabaseProbePort = {
	probe: () => Promise<void>;
};

export type LibriWorkerBootstrapState =
	| 'ready'
	| 'starting'
	| 'running'
	| 'stopping'
	| 'stopped'
	| 'failed';

export type LibriWorkerBootstrapHealth = {
	healthy: boolean;
	state: LibriWorkerBootstrapState;
	reason?: string;
	startedAt: string | null;
	database: {
		connected: boolean;
		lastSuccessfulProbeAt: string | null;
		consecutiveProbeFailures: number;
	};
	queue: {
		enabled: false;
		registeredJobTypes: readonly LibriQueueType[];
		activeJobs: 0;
		availableConcurrency: number;
		concurrency: number;
	};
};

export class LibriWorkerBootstrap {
	private state: LibriWorkerBootstrapState = 'ready';
	private startPromise: Promise<void> | null = null;
	private stopPromise: Promise<void> | null = null;
	private probeInterval: NodeJS.Timeout | null = null;
	private probePromise: Promise<void> | null = null;
	private startedAtMs: number | null = null;
	private lastSuccessfulProbeAtMs: number | null = null;
	private consecutiveProbeFailures = 0;
	private lastError: string | null = null;

	constructor(
		private readonly database: LibriDatabaseProbePort,
		private readonly config: LibriWorkerConfig
	) {}

	start(): Promise<void> {
		if (this.startPromise) return this.startPromise;
		if (this.state !== 'ready') {
			return Promise.reject(new Error(`Libri bootstrap cannot start from ${this.state}`));
		}
		this.state = 'starting';
		this.startPromise = this.startRuntime();
		return this.startPromise;
	}

	stop(): Promise<void> {
		if (this.stopPromise) return this.stopPromise;
		this.stopPromise = this.stopRuntime();
		return this.stopPromise;
	}

	probeNow(): Promise<void> {
		if (this.probePromise) return this.probePromise;
		const probe = this.runProbe().finally(() => {
			if (this.probePromise === probe) this.probePromise = null;
		});
		this.probePromise = probe;
		return probe;
	}

	getHealth(): LibriWorkerBootstrapHealth {
		const connected =
			this.lastSuccessfulProbeAtMs !== null && this.consecutiveProbeFailures === 0;
		const healthy = this.state === 'running' && connected;
		const reason = healthy
			? undefined
			: this.state === 'running'
				? (this.lastError ?? 'database_probe_pending')
				: this.state;

		return {
			healthy,
			state: this.state,
			...(reason ? { reason } : {}),
			startedAt: this.startedAtMs ? new Date(this.startedAtMs).toISOString() : null,
			database: {
				connected,
				lastSuccessfulProbeAt: this.lastSuccessfulProbeAtMs
					? new Date(this.lastSuccessfulProbeAtMs).toISOString()
					: null,
				consecutiveProbeFailures: this.consecutiveProbeFailures
			},
			queue: {
				enabled: this.config.queueEnabled,
				registeredJobTypes: LIBRI_QUEUE_TYPES,
				activeJobs: 0,
				availableConcurrency: this.config.concurrency,
				concurrency: this.config.concurrency
			}
		};
	}

	private async startRuntime(): Promise<void> {
		try {
			this.startedAtMs = Date.now();
			await this.probeNow();
			if (this.state !== 'starting') return;
			this.startProbeInterval();
			this.state = 'running';
		} catch {
			if (this.state !== 'starting') return;
			this.startProbeInterval();
			this.state = 'running';
		}
	}

	private startProbeInterval(): void {
		this.probeInterval = setInterval(() => {
			void this.probeNow().catch(() => undefined);
		}, this.config.databaseProbeIntervalMs);
		this.probeInterval.unref();
	}

	private async stopRuntime(): Promise<void> {
		if (this.state === 'stopped') return;
		if (this.state === 'starting' && this.startPromise) {
			await this.startPromise.catch(() => undefined);
		}
		this.state = 'stopping';
		if (this.probeInterval) {
			clearInterval(this.probeInterval);
			this.probeInterval = null;
		}
		await this.probePromise?.catch(() => undefined);
		this.state = 'stopped';
	}

	private async runProbe(): Promise<void> {
		try {
			await this.database.probe();
			this.lastSuccessfulProbeAtMs = Date.now();
			this.consecutiveProbeFailures = 0;
			this.lastError = null;
		} catch (error) {
			this.consecutiveProbeFailures += 1;
			this.lastError = 'database_probe_failed';
			throw error;
		}
	}
}
