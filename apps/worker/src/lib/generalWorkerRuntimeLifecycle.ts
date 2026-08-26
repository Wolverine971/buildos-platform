// apps/worker/src/lib/generalWorkerRuntimeLifecycle.ts

import type { SupabaseQueue } from './supabaseQueue';

export type GeneralWorkerRuntimeLifecycleState =
	| 'idle'
	| 'starting'
	| 'running'
	| 'stopping'
	| 'stopped'
	| 'failed';

export type GeneralWorkerRuntimeLifecycleHealth = {
	healthy: boolean;
	state: GeneralWorkerRuntimeLifecycleState;
	reason?: string;
	queue: ReturnType<SupabaseQueue['getHealth']>;
};

export type GeneralWorkerRuntimeLifecyclePort = {
	start(): Promise<void>;
	stop(): Promise<void>;
	getHealth(): ReturnType<SupabaseQueue['getHealth']>;
};

/**
 * Owns the general queue process lifecycle. Agentic Chat intentionally has a
 * separate entrypoint and lifecycle, so this boundary cannot start, report,
 * or drain the chat consumer.
 */
export class GeneralWorkerRuntimeLifecycle {
	private state: GeneralWorkerRuntimeLifecycleState = 'idle';
	private startPromise: Promise<void> | null = null;
	private stopPromise: Promise<void> | null = null;
	private lastError: string | null = null;

	constructor(private readonly queue: GeneralWorkerRuntimeLifecyclePort) {}

	start(): Promise<void> {
		if ((this.state === 'starting' || this.state === 'running') && this.startPromise) {
			return this.startPromise;
		}
		if (this.state !== 'idle') {
			return Promise.reject(new Error(`General worker cannot start from ${this.state}`));
		}
		this.state = 'starting';
		this.startPromise = this.startOwnedQueue();
		return this.startPromise;
	}

	stop(): Promise<void> {
		if (this.stopPromise) return this.stopPromise;
		if (this.state === 'stopped') return Promise.resolve();
		this.stopPromise = this.stopOwnedQueue();
		return this.stopPromise;
	}

	getHealth(): GeneralWorkerRuntimeLifecycleHealth {
		const queue = this.queue.getHealth();
		if (this.state === 'running' && queue.healthy) {
			return { healthy: true, state: this.state, queue };
		}
		if (this.state === 'running') {
			return {
				healthy: false,
				state: this.state,
				reason: queue.reason ?? 'queue_unhealthy',
				queue
			};
		}
		return {
			healthy: false,
			state: this.state,
			reason:
				this.state === 'failed' ? (this.lastError ?? 'general_worker_failed') : this.state,
			queue
		};
	}

	private async startOwnedQueue(): Promise<void> {
		try {
			await this.queue.start();
			this.state = 'running';
		} catch (error) {
			this.lastError = canonicalError(error);
			this.state = 'stopping';
			try {
				await this.queue.stop();
			} catch (stopError) {
				this.state = 'failed';
				throw new AggregateError(
					[error, stopError],
					'General worker startup failed and queue rollback was incomplete'
				);
			}
			this.state = 'failed';
			throw error;
		}
	}

	private async stopOwnedQueue(): Promise<void> {
		if (this.state === 'starting' && this.startPromise) {
			await this.startPromise.catch(() => undefined);
		}
		this.state = 'stopping';
		try {
			await this.queue.stop();
			this.state = 'stopped';
		} catch (error) {
			this.lastError = canonicalError(error);
			this.state = 'failed';
			throw error;
		}
	}
}

function canonicalError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error ?? '');
	return message.trim().slice(0, 1_000) || 'General worker failed';
}
