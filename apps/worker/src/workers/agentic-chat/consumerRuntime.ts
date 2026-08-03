// apps/worker/src/workers/agentic-chat/consumerRuntime.ts

import type { SupabaseQueue } from '../../lib/supabaseQueue';

type StartStopService = {
	start(): void | Promise<void>;
	stop(): Promise<unknown>;
};

export type AgenticChatConsumerRuntimeServices = {
	publisher: StartStopService;
	cancellation: StartStopService;
	recovery: StartStopService;
};

export type AgenticChatConsumerRuntimeState =
	| 'idle'
	| 'starting'
	| 'running'
	| 'stopping'
	| 'stopped';

export type AgenticChatConsumerRuntimeHealth = {
	healthy: boolean;
	reason?: string;
	state: AgenticChatConsumerRuntimeState;
	queue: ReturnType<SupabaseQueue['getHealth']>;
};

/**
 * Own the chat-only queue and its worker-level publisher/cancel/recovery loops.
 * The object is intentionally single-use because the underlying queue and
 * bounded services cannot safely restart after a drain.
 */
export class AgenticChatConsumerRuntime {
	private state: AgenticChatConsumerRuntimeState = 'idle';
	private startPromise: Promise<void> | null = null;
	private stopPromise: Promise<void> | null = null;

	constructor(
		private readonly queue: SupabaseQueue,
		private readonly services: AgenticChatConsumerRuntimeServices
	) {
		const registered = queue.getRegisteredJobTypes();
		if (registered.length !== 1 || registered[0] !== 'agentic_chat_turn') {
			throw new Error('Agentic Chat runtime requires one isolated agentic_chat_turn queue');
		}
	}

	start(): Promise<void> {
		if ((this.state === 'starting' || this.state === 'running') && this.startPromise) {
			return this.startPromise;
		}
		if (this.state !== 'idle') {
			return Promise.reject(new Error(`Agentic Chat runtime cannot start from ${this.state}`));
		}
		this.state = 'starting';
		this.startPromise = this.startOwnedServices();
		return this.startPromise;
	}

	wake(): Promise<void> {
		if (this.state !== 'running') return Promise.resolve();
		return this.queue.wake();
	}

	stop(): Promise<void> {
		if (this.stopPromise) return this.stopPromise;
		this.stopPromise = this.stopOwnedServices();
		return this.stopPromise;
	}

	getHealth(): AgenticChatConsumerRuntimeHealth {
		const queue = this.queue.getHealth();
		if (this.state === 'running') {
			return queue.healthy
				? { healthy: true, state: this.state, queue }
				: { healthy: false, reason: queue.reason ?? 'queue_unhealthy', state: this.state, queue };
		}
		if (this.state === 'stopping' || this.state === 'stopped') {
			return { healthy: true, reason: this.state, state: this.state, queue };
		}
		return { healthy: false, reason: `runtime_${this.state}`, state: this.state, queue };
	}

	private async startOwnedServices(): Promise<void> {
		let publisherStarted = false;
		let cancellationStarted = false;
		let recoveryStarted = false;
		try {
			await this.services.publisher.start();
			publisherStarted = true;
			await this.services.cancellation.start();
			cancellationStarted = true;
			await this.services.recovery.start();
			recoveryStarted = true;
			await this.queue.start();
			this.state = 'running';
		} catch (error) {
			this.state = 'stopping';
			if (recoveryStarted) await this.ignoreStopError(this.services.recovery);
			await this.ignoreQueueStopError();
			if (cancellationStarted) await this.ignoreStopError(this.services.cancellation);
			if (publisherStarted) await this.ignoreStopError(this.services.publisher);
			this.state = 'stopped';
			throw error;
		}
	}

	private async stopOwnedServices(): Promise<void> {
		if (this.state === 'stopped') return;
		if (this.state === 'idle') {
			this.state = 'stopped';
			return;
		}
		if (this.state === 'starting' && this.startPromise) {
			await this.startPromise.catch(() => undefined);
			if (this.currentState() === 'stopped') return;
		}
		this.state = 'stopping';

		// Stop recovery from acquiring new ownership first. Cancellation and the
		// publisher stay alive while the queue drains its current executor.
		const errors: unknown[] = [];
		await this.captureStopError(() => this.services.recovery.stop(), errors);
		await this.captureStopError(() => this.queue.stop(), errors);
		await this.captureStopError(() => this.services.cancellation.stop(), errors);
		await this.captureStopError(() => this.services.publisher.stop(), errors);
		this.state = 'stopped';
		if (errors.length > 0) {
			throw new AggregateError(errors, 'Agentic Chat runtime shutdown was incomplete');
		}
	}

	private currentState(): AgenticChatConsumerRuntimeState {
		return this.state;
	}

	private async ignoreStopError(service: StartStopService): Promise<void> {
		await service.stop().catch(() => undefined);
	}

	private async ignoreQueueStopError(): Promise<void> {
		await this.queue.stop().catch(() => undefined);
	}

	private async captureStopError(
		stop: () => Promise<unknown>,
		errors: unknown[]
	): Promise<void> {
		try {
			await stop();
		} catch (error) {
			errors.push(error);
		}
	}
}
