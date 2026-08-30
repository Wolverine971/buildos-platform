import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import type { WorkerEventLoopLagMonitor } from './workerOperationalHealth';
import type { LibriWorkerBootstrapHealth } from '../workers/libri/bootstrap';

const DEFAULT_HTTP_CLOSE_TIMEOUT_MS = 2_000;

export type LibriWorkerBootstrapPort = {
	start: () => Promise<void>;
	stop: () => Promise<void>;
	getHealth: () => LibriWorkerBootstrapHealth;
};

export type LibriWorkerServiceState =
	| 'idle'
	| 'starting'
	| 'running'
	| 'draining'
	| 'stopped'
	| 'failed';

export type LibriWorkerServiceHealth = {
	healthy: boolean;
	state: LibriWorkerServiceState;
	reason?: string;
	service: string;
	release: string;
	uptimeSeconds: number;
	eventLoopLag: ReturnType<WorkerEventLoopLagMonitor['getSnapshot']>;
	libri: LibriWorkerBootstrapHealth;
};

type LibriWorkerHttpServer = Pick<
	Server,
	'address' | 'close' | 'closeIdleConnections' | 'once' | 'off' | 'listen'
>;
type ClosableHttpServer = Pick<LibriWorkerHttpServer, 'close' | 'closeIdleConnections'>;
type LibriWorkerListen = (
	app: Express,
	port: number,
	host: string
) => Promise<LibriWorkerHttpServer>;

export type LibriWorkerServiceOptions = {
	bootstrap: LibriWorkerBootstrapPort;
	eventLoopLagMonitor: Pick<WorkerEventLoopLagMonitor, 'getSnapshot' | 'stop'>;
	port: number;
	host?: string;
	serviceName: string;
	release: string;
	httpCloseTimeoutMs?: number;
	listen?: LibriWorkerListen;
};

export function createLibriWorkerService(options: LibriWorkerServiceOptions): LibriWorkerService {
	return new LibriWorkerService(options);
}

export class LibriWorkerService {
	private readonly app: Express;
	private readonly createdAtMs = Date.now();
	private state: LibriWorkerServiceState = 'idle';
	private server: LibriWorkerHttpServer | null = null;
	private startPromise: Promise<void> | null = null;
	private stopPromise: Promise<void> | null = null;
	private bootstrapStopPromise: Promise<void> | null = null;
	private lastError: string | null = null;

	constructor(private readonly options: LibriWorkerServiceOptions) {
		assertPort(options.port);
		this.app = this.createApp();
	}

	start(): Promise<void> {
		if (this.startPromise) return this.startPromise;
		if (this.state !== 'idle') {
			return Promise.reject(
				new Error(`Libri worker service cannot start from ${this.state}`)
			);
		}
		this.state = 'starting';
		this.startPromise = this.startOwnedRuntime();
		return this.startPromise;
	}

	stop(): Promise<void> {
		if (this.stopPromise) return this.stopPromise;
		if (this.state === 'stopped') return Promise.resolve();
		this.state = 'draining';
		this.stopPromise = this.stopOwnedRuntime();
		return this.stopPromise;
	}

	getHealth(): LibriWorkerServiceHealth {
		const libri = this.safeBootstrapHealth();
		const healthy = this.state === 'running' && libri.healthy;
		const reason = healthy
			? undefined
			: this.state === 'running'
				? (libri.reason ?? 'libri_runtime_unhealthy')
				: this.state === 'failed'
					? (this.lastError ?? 'failed')
					: this.state;

		return {
			healthy,
			state: this.state,
			...(reason ? { reason } : {}),
			service: this.options.serviceName,
			release: this.options.release,
			uptimeSeconds: Math.max(0, Math.floor((Date.now() - this.createdAtMs) / 1_000)),
			eventLoopLag: this.options.eventLoopLagMonitor.getSnapshot(),
			libri
		};
	}

	getAddress(): AddressInfo | null {
		const address = this.server?.address();
		return address && typeof address !== 'string' ? address : null;
	}

	private createApp(): Express {
		const app = express();
		app.disable('x-powered-by');
		app.get('/health', (_request, response) => {
			const health = this.getHealth();
			response.status(health.healthy ? 200 : 503).json({
				status: health.healthy ? 'healthy' : 'unhealthy',
				timestamp: new Date().toISOString(),
				service: health.service,
				release: health.release,
				uptimeSeconds: health.uptimeSeconds,
				runtimeState: health.state,
				...(health.reason ? { reason: health.reason } : {}),
				eventLoopLag: health.eventLoopLag,
				libri: health.libri
			});
		});
		return app;
	}

	private async startOwnedRuntime(): Promise<void> {
		try {
			await this.options.bootstrap.start();
			if (this.state !== 'starting') {
				await this.stopBootstrapOnce();
				return;
			}
			this.server = await (this.options.listen ?? listen)(
				this.app,
				this.options.port,
				this.options.host ?? '0.0.0.0'
			);
			if (this.state !== 'starting') {
				await closeLibriWorkerHttpServer(
					this.server,
					this.options.httpCloseTimeoutMs ?? DEFAULT_HTTP_CLOSE_TIMEOUT_MS
				);
				await this.stopBootstrapOnce();
				return;
			}
			this.state = 'running';
		} catch (error) {
			this.lastError = canonicalError(error);
			this.state = 'failed';
			await this.stopBootstrapOnce();
			throw error;
		}
	}

	private async stopOwnedRuntime(): Promise<void> {
		const closePromise = this.server
			? closeLibriWorkerHttpServer(
					this.server,
					this.options.httpCloseTimeoutMs ?? DEFAULT_HTTP_CLOSE_TIMEOUT_MS
				)
			: Promise.resolve();
		const results = await Promise.allSettled([this.stopBootstrapOnce(), closePromise]);
		this.options.eventLoopLagMonitor.stop();
		const errors = results.flatMap((result) =>
			result.status === 'rejected' ? [result.reason] : []
		);
		if (errors.length > 0) {
			this.lastError = canonicalError(errors[0]);
			this.state = 'failed';
			throw new AggregateError(errors, 'Libri worker shutdown was incomplete');
		}
		this.state = 'stopped';
	}

	private stopBootstrapOnce(): Promise<void> {
		if (!this.bootstrapStopPromise) {
			this.bootstrapStopPromise = Promise.resolve(this.options.bootstrap.stop());
		}
		return this.bootstrapStopPromise;
	}

	private safeBootstrapHealth(): LibriWorkerBootstrapHealth {
		try {
			return this.options.bootstrap.getHealth();
		} catch {
			return unavailableBootstrapHealth();
		}
	}
}

export async function closeLibriWorkerHttpServer(
	server: ClosableHttpServer,
	timeoutMs: number = DEFAULT_HTTP_CLOSE_TIMEOUT_MS
): Promise<void> {
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
		throw new Error('Libri worker HTTP close timeout must be a positive integer');
	}
	server.closeIdleConnections();
	await new Promise<void>((resolve) => {
		const timeout = setTimeout(resolve, timeoutMs);
		timeout.unref();
		server.close(() => {
			clearTimeout(timeout);
			resolve();
		});
	});
}

function listen(app: Express, port: number, host: string): Promise<LibriWorkerHttpServer> {
	return new Promise<LibriWorkerHttpServer>((resolve, reject) => {
		const server = createServer(app);
		const onError = (error: Error) => {
			server.off('listening', onListening);
			reject(error);
		};
		const onListening = () => {
			server.off('error', onError);
			resolve(server);
		};
		server.once('error', onError);
		server.once('listening', onListening);
		server.listen(port, host);
	});
}

function unavailableBootstrapHealth(): LibriWorkerBootstrapHealth {
	return {
		healthy: false,
		state: 'failed',
		reason: 'bootstrap_health_unavailable',
		startedAt: null,
		database: {
			connected: false,
			lastSuccessfulProbeAt: null,
			consecutiveProbeFailures: 0
		},
		queue: {
			enabled: false,
			registeredJobTypes: [],
			activeJobs: 0,
			availableConcurrency: 0,
			concurrency: 0,
			consumerHealthy: null,
			lastSuccessfulClaimAt: null,
			consecutiveClaimFailures: 0
		}
	};
}

function assertPort(port: number): void {
	if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
		throw new Error('Libri worker port must be an integer between 0 and 65535');
	}
}

function canonicalError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
