import type { LibriWorkerConfig } from '../../config/libriWorkerProfile';
import type { LibriMaintenanceConsumerHealth } from './maintenanceConsumer';

export const LIBRI_QUEUE_TYPES = [
	'libri_ingest',
	'libri_research',
	'libri_derive',
	'libri_maintenance'
] as const;

export type LibriQueueType = (typeof LIBRI_QUEUE_TYPES)[number];

export type LibriDatabaseProbePort = {
	probe: () => Promise<void>;
	close?: () => Promise<void>;
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
		enabled: boolean;
		registeredJobTypes: readonly LibriQueueType[];
		activeJobs: number;
		availableConcurrency: number;
		concurrency: number;
		consumerHealthy: boolean | null;
		lastSuccessfulClaimAt: string | null;
		consecutiveClaimFailures: number;
	};
};

export type LibriMaintenanceConsumerPort = {
	start: () => Promise<void>;
	stop: () => Promise<void>;
	getHealth: () => LibriMaintenanceConsumerHealth;
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
		private readonly config: LibriWorkerConfig,
		private readonly consumer?: LibriMaintenanceConsumerPort
	) {
		if (config.queueEnabled && !consumer) {
			throw new Error('Enabled Libri bootstrap requires the isolated maintenance consumer');
		}
	}

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
		const consumerHealth = this.safeConsumerHealth();
		const consumerHealthy = this.config.queueEnabled ? consumerHealth?.healthy === true : true;
		const healthy = this.state === 'running' && connected && consumerHealthy;
		const reason = healthy
			? undefined
			: this.state === 'running'
				? (this.lastError ?? consumerHealth?.reason ?? 'database_probe_pending')
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
				activeJobs: consumerHealth?.activeJobs ?? 0,
				availableConcurrency:
					consumerHealth?.availableConcurrency ?? this.config.concurrency,
				concurrency: consumerHealth?.concurrency ?? this.config.concurrency,
				consumerHealthy: this.config.queueEnabled
					? (consumerHealth?.healthy ?? false)
					: null,
				lastSuccessfulClaimAt: consumerHealth?.lastSuccessfulClaimAt ?? null,
				consecutiveClaimFailures: consumerHealth?.consecutiveClaimFailures ?? 0
			}
		};
	}

	private async startRuntime(): Promise<void> {
		try {
			this.startedAtMs = Date.now();
			await this.probeNow();
			if (this.state !== 'starting') return;
			if (this.config.queueEnabled) await this.consumer?.start();
			this.startProbeInterval();
			this.state = 'running';
		} catch (error) {
			if (this.state !== 'starting') return;
			if (this.config.queueEnabled) {
				this.state = 'failed';
				throw error;
			}
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
		const results = await Promise.allSettled([
			this.consumer?.stop(),
			this.probePromise?.catch(() => undefined)
		]);
		await this.database.close?.();
		this.state = 'stopped';
		const errors = results.flatMap((result) =>
			result.status === 'rejected' ? [result.reason] : []
		);
		if (errors.length > 0) {
			this.state = 'failed';
			throw new AggregateError(errors, 'Libri bootstrap shutdown was incomplete');
		}
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

	private safeConsumerHealth(): LibriMaintenanceConsumerHealth | null {
		if (!this.config.queueEnabled || !this.consumer) return null;
		try {
			return this.consumer.getHealth();
		} catch {
			return null;
		}
	}
}
