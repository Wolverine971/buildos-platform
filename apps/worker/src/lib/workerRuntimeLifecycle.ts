// apps/worker/src/lib/workerRuntimeLifecycle.ts

import type { SupabaseQueue } from './supabaseQueue';
import type {
	AgenticChatBootstrapHealth,
	AgenticChatBootstrapStartResult
} from '../workers/agentic-chat/bootstrap';

export type WorkerRuntimeLifecycleState =
	| 'idle'
	| 'starting'
	| 'running'
	| 'stopping'
	| 'stopped'
	| 'failed';

export type WorkerRuntimeLifecycleHealth = {
	healthy: boolean;
	state: WorkerRuntimeLifecycleState;
	reason?: string;
	queue: ReturnType<SupabaseQueue['getHealth']>;
	agenticChat: AgenticChatBootstrapHealth;
};

export type WorkerRuntimeLifecyclePorts = {
	queue: {
		start(): Promise<void>;
		stop(): Promise<void>;
		getHealth(): ReturnType<SupabaseQueue['getHealth']>;
	};
	agenticChat: {
		start(): Promise<AgenticChatBootstrapStartResult>;
		stop(): Promise<void>;
		getHealth(): AgenticChatBootstrapHealth;
	};
};

/**
 * Owns production startup/rollback and shutdown for the existing general queue
 * plus the separately isolated Agentic Chat runtime. Stops are concurrent so
 * neither queue's bounded drain consumes the other's process-shutdown budget.
 */
export class WorkerRuntimeLifecycle {
	private state: WorkerRuntimeLifecycleState = 'idle';
	private startPromise: Promise<void> | null = null;
	private stopPromise: Promise<void> | null = null;
	private lastError: string | null = null;

	constructor(private readonly ports: WorkerRuntimeLifecyclePorts) {}

	start(): Promise<void> {
		if ((this.state === 'starting' || this.state === 'running') && this.startPromise) {
			return this.startPromise;
		}
		if (this.state !== 'idle') {
			return Promise.reject(new Error(`Worker runtime cannot start from ${this.state}`));
		}
		this.state = 'starting';
		this.startPromise = this.startOwnedRuntimes();
		return this.startPromise;
	}

	stop(): Promise<void> {
		if (this.stopPromise) return this.stopPromise;
		this.stopPromise = this.stopOwnedRuntimes();
		return this.stopPromise;
	}

	getHealth(): WorkerRuntimeLifecycleHealth {
		const queue = this.ports.queue.getHealth();
		const agenticChat = this.ports.agenticChat.getHealth();
		if (this.state === 'running') {
			if (!queue.healthy) {
				return {
					healthy: false,
					state: this.state,
					reason: queue.reason ?? 'queue_unhealthy',
					queue,
					agenticChat
				};
			}
			if (!agenticChat.healthy) {
				return {
					healthy: false,
					state: this.state,
					reason: agenticChat.reason ?? 'agentic_chat_unhealthy',
					queue,
					agenticChat
				};
			}
			return { healthy: true, state: this.state, queue, agenticChat };
		}
		if (this.state === 'stopping' || this.state === 'stopped') {
			return {
				// Stop advertising readiness before either queue begins its bounded
				// drain. Existing work may finish, but no new work belongs here.
				healthy: false,
				state: this.state,
				reason: this.state,
				queue,
				agenticChat
			};
		}
		return {
			healthy: false,
			state: this.state,
			reason:
				this.state === 'failed' ? (this.lastError ?? 'worker_runtime_failed') : this.state,
			queue,
			agenticChat
		};
	}

	private async startOwnedRuntimes(): Promise<void> {
		try {
			await this.ports.queue.start();
			await this.ports.agenticChat.start();
			this.state = 'running';
		} catch (error) {
			this.lastError = canonicalError(error);
			this.state = 'stopping';
			const rollbackErrors = await this.stopBoth();
			this.state = 'failed';
			if (rollbackErrors.length > 0) {
				throw new AggregateError(
					[error, ...rollbackErrors],
					'Worker runtime startup failed and rollback was incomplete'
				);
			}
			throw error;
		}
	}

	private async stopOwnedRuntimes(): Promise<void> {
		if (this.state === 'stopped') return;
		if (this.state === 'starting' && this.startPromise) {
			await this.startPromise.catch(() => undefined);
		}
		this.state = 'stopping';
		const errors = await this.stopBoth();
		if (errors.length > 0) {
			this.lastError = errors.map(canonicalError).join('; ').slice(0, 1_000);
			this.state = 'failed';
			throw new AggregateError(errors, 'Worker runtime shutdown was incomplete');
		}
		this.state = 'stopped';
	}

	private async stopBoth(): Promise<unknown[]> {
		const results = await Promise.allSettled([
			Promise.resolve().then(() => this.ports.queue.stop()),
			Promise.resolve().then(() => this.ports.agenticChat.stop())
		]);
		return results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
	}
}

function canonicalError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error ?? '');
	return message.trim().slice(0, 1_000) || 'Worker runtime failed';
}
