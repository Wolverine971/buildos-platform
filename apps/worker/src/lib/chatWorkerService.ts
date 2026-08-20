import type { AddressInfo } from 'node:net';
import { type Server, createServer } from 'node:http';
import express, { type Express } from 'express';
import {
	AGENTIC_CHAT_CAPACITY_PATH,
	respondWithAgenticChatCapacity
} from '../http/agenticChatCapacity';
import type {
	AgenticChatPhase3Bootstrap,
	AgenticChatPhase3BootstrapHealth,
	AgenticChatPhase3BootstrapStartResult
} from '../workers/agentic-chat/phase3Bootstrap';
import {
	type WorkerEventLoopLagMonitor,
	buildAgenticChatOperationalHealthChecks
} from './workerOperationalHealth';

const DEFAULT_HTTP_CLOSE_TIMEOUT_MS = 2_000;

export type ChatWorkerBootstrapPort = Pick<
	AgenticChatPhase3Bootstrap,
	'start' | 'stop' | 'getHealth' | 'collectCapacityEvidence'
>;

export type ChatWorkerServiceState =
	| 'idle'
	| 'starting'
	| 'running'
	| 'draining'
	| 'stopped'
	| 'failed';

export type ChatWorkerServiceOptions = {
	bootstrap: ChatWorkerBootstrapPort;
	eventLoopLagMonitor: Pick<WorkerEventLoopLagMonitor, 'getSnapshot' | 'stop'>;
	port: number;
	host?: string;
	serviceName: string;
	release: string;
	isAuthorized?: (authorization: string | undefined) => boolean;
	httpCloseTimeoutMs?: number;
	listen?: ChatWorkerListen;
};

export type ChatWorkerServiceHealth = {
	healthy: boolean;
	state: ChatWorkerServiceState;
	reason?: string;
	service: string;
	release: string;
	checks: ReturnType<typeof buildAgenticChatOperationalHealthChecks>;
	agenticChat: AgenticChatPhase3BootstrapHealth;
};

type ChatWorkerHttpServer = Pick<
	Server,
	'address' | 'close' | 'closeIdleConnections' | 'once' | 'off' | 'listen'
>;
type ClosableHttpServer = Pick<ChatWorkerHttpServer, 'close' | 'closeIdleConnections'>;
type ChatWorkerListen = (app: Express, port: number, host: string) => Promise<ChatWorkerHttpServer>;

export function createChatWorkerService(options: ChatWorkerServiceOptions): ChatWorkerService {
	return new ChatWorkerService(options);
}

export class ChatWorkerService {
	private readonly app: Express;
	private state: ChatWorkerServiceState = 'idle';
	private server: ChatWorkerHttpServer | null = null;
	private startPromise: Promise<void> | null = null;
	private stopPromise: Promise<void> | null = null;
	private bootstrapStopPromise: Promise<void> | null = null;
	private lastError: string | null = null;

	constructor(private readonly options: ChatWorkerServiceOptions) {
		assertPort(options.port);
		this.app = this.createApp();
	}

	start(): Promise<void> {
		if (this.startPromise) return this.startPromise;
		if (this.state !== 'idle') {
			return Promise.reject(new Error(`Chat worker service cannot start from ${this.state}`));
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

	getHealth(): ChatWorkerServiceHealth {
		const agenticChat = this.safeBootstrapHealth();
		const healthy =
			this.state === 'running' && agenticChat.enabled === true && agenticChat.healthy;
		const reason = healthy
			? undefined
			: this.state === 'running'
				? (agenticChat.reason ?? 'agentic_chat_unhealthy')
				: this.state === 'failed'
					? (this.lastError ?? 'failed')
					: this.state;

		return {
			healthy,
			state: this.state,
			...(reason ? { reason } : {}),
			service: this.options.serviceName,
			release: this.options.release,
			checks: buildAgenticChatOperationalHealthChecks(
				agenticChat,
				this.options.eventLoopLagMonitor.getSnapshot()
			),
			agenticChat
		};
	}

	getAddress(): AddressInfo | null {
		const address = this.server?.address();
		return address && typeof address !== 'string' ? address : null;
	}

	respondWithCapacity(
		request: Parameters<typeof respondWithAgenticChatCapacity>[0],
		response: Parameters<typeof respondWithAgenticChatCapacity>[1]
	): Promise<void> {
		return respondWithAgenticChatCapacity(request, response, {
			collect: () => this.options.bootstrap.collectCapacityEvidence(),
			...(this.options.isAuthorized ? { isAuthorized: this.options.isAuthorized } : {})
		});
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
				runtimeState: health.state,
				...(health.reason ? { reason: health.reason } : {}),
				checks: health.checks,
				agenticChat: health.agenticChat
			});
		});

		app.get(AGENTIC_CHAT_CAPACITY_PATH, async (request, response) => {
			await this.respondWithCapacity(request, response);
		});

		return app;
	}

	private async startOwnedRuntime(): Promise<void> {
		try {
			const result = await this.options.bootstrap.start();
			assertDedicatedRuntimeStarted(result);
			if (this.currentState() !== 'starting') {
				await this.stopBootstrapOnce();
				return;
			}
			this.server = await (this.options.listen ?? listen)(
				this.app,
				this.options.port,
				this.options.host ?? '0.0.0.0'
			);
			if (this.currentState() !== 'starting') {
				await closeChatWorkerHttpServer(
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
			try {
				await this.stopBootstrapOnce();
			} catch (stopError) {
				throw new AggregateError(
					[error, stopError],
					'Chat worker startup failed and rollback was incomplete'
				);
			}
			throw error;
		}
	}

	private async stopOwnedRuntime(): Promise<void> {
		const closePromise = this.server
			? closeChatWorkerHttpServer(
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
			throw new AggregateError(errors, 'Chat worker shutdown was incomplete');
		}
		this.state = 'stopped';
	}

	private stopBootstrapOnce(): Promise<void> {
		if (!this.bootstrapStopPromise) {
			try {
				this.bootstrapStopPromise = Promise.resolve(this.options.bootstrap.stop());
			} catch (error) {
				this.bootstrapStopPromise = Promise.reject(error);
			}
		}
		return this.bootstrapStopPromise;
	}

	private currentState(): ChatWorkerServiceState {
		return this.state;
	}

	private safeBootstrapHealth(): AgenticChatPhase3BootstrapHealth {
		try {
			return this.options.bootstrap.getHealth();
		} catch {
			return {
				enabled: true,
				healthy: false,
				state: 'failed',
				reason: 'bootstrap_health_unavailable',
				runtime: null
			};
		}
	}
}

export async function closeChatWorkerHttpServer(
	server: ClosableHttpServer,
	timeoutMs: number = DEFAULT_HTTP_CLOSE_TIMEOUT_MS
): Promise<void> {
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
		throw new Error('Chat worker HTTP close timeout must be a positive integer');
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

function listen(app: Express, port: number, host: string): Promise<ChatWorkerHttpServer> {
	return new Promise<ChatWorkerHttpServer>((resolve, reject) => {
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

function assertPort(port: number): void {
	if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
		throw new Error('Chat worker port must be an integer between 0 and 65535');
	}
}

function assertDedicatedRuntimeStarted(result: AgenticChatPhase3BootstrapStartResult): void {
	if (result !== 'started') {
		throw new Error('Dedicated Agentic Chat worker cannot start while the runtime is disabled');
	}
}

function canonicalError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
