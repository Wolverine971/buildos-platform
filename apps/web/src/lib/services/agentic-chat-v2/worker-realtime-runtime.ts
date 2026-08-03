// apps/web/src/lib/services/agentic-chat-v2/worker-realtime-runtime.ts
import type { TurnHandleV1 } from '@buildos/shared-types';
import {
	AgenticChatWorkerRealtimeChannel,
	isAgenticChatRealtimeUserId,
	type AgenticChatRealtimeClientLike,
	type AgenticChatWorkerChannelStatus
} from './worker-realtime-channel';
import {
	AgenticChatWorkerRealtimeCoordinator,
	type AgenticChatWorkerApplicationObserver
} from './worker-realtime-coordinator';

type WorkerTurnHandle = Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>;

type AuthUserLike = { id: string };
type AuthSessionLike = { user: AuthUserLike };
type AuthSubscriptionLike = { unsubscribe(): void };

export type AgenticChatRealtimeAuthLike = {
	getUser(): PromiseLike<{
		data: { user: AuthUserLike | null };
		error?: unknown;
	}>;
	onAuthStateChange(callback: (event: string, session: AuthSessionLike | null) => void): {
		data: { subscription: AuthSubscriptionLike };
	};
};

export type AgenticChatWorkerRealtimeRuntimeClient = AgenticChatRealtimeClientLike & {
	auth: AgenticChatRealtimeAuthLike;
};

type EventTargetLike = {
	addEventListener(type: string, listener: EventListener): void;
	removeEventListener(type: string, listener: EventListener): void;
};

type VisibilityTargetLike = EventTargetLike & {
	visibilityState: string;
};

export type AgenticChatWorkerRealtimeRuntimeOptions = {
	client: AgenticChatWorkerRealtimeRuntimeClient;
	coordinator?: AgenticChatWorkerRealtimeCoordinator;
	fetchImpl?: typeof fetch;
	windowTarget?: EventTargetLike | null;
	documentTarget?: VisibilityTargetLike | null;
	onStatus?: (status: AgenticChatWorkerChannelStatus, error?: Error) => void;
	onUserChange?: (userId: string | null) => void;
	onError?: (error: unknown) => void;
};

export class AgenticChatWorkerRealtimeRuntime {
	readonly coordinator: AgenticChatWorkerRealtimeCoordinator;
	readonly channel: AgenticChatWorkerRealtimeChannel;
	readonly #client: AgenticChatWorkerRealtimeRuntimeClient;
	readonly #windowTarget: EventTargetLike | null;
	readonly #documentTarget: VisibilityTargetLike | null;
	readonly #onError?: (error: unknown) => void;
	readonly #onUserChange?: (userId: string | null) => void;
	#status: AgenticChatWorkerChannelStatus = 'idle';
	#started = false;
	#epoch = 0;
	#authRevision = 0;
	#userId: string | null = null;
	#authSubscription: AuthSubscriptionLike | null = null;
	#startOperation: Promise<void> | null = null;
	#authTransition: Promise<void> = Promise.resolve();

	readonly #onlineListener: EventListener = () => {
		this.#wake();
	};

	readonly #visibilityListener: EventListener = () => {
		if (this.#documentTarget?.visibilityState === 'visible') this.#wake();
	};

	constructor(options: AgenticChatWorkerRealtimeRuntimeOptions) {
		this.#client = options.client;
		this.#onError = options.onError;
		this.#onUserChange = options.onUserChange;
		this.#windowTarget =
			options.windowTarget === undefined
				? ((globalThis.window as unknown as EventTargetLike | undefined) ?? null)
				: options.windowTarget;
		this.#documentTarget =
			options.documentTarget === undefined
				? ((globalThis.document as unknown as VisibilityTargetLike | undefined) ?? null)
				: options.documentTarget;
		this.coordinator =
			options.coordinator ??
			new AgenticChatWorkerRealtimeCoordinator({
				fetchImpl: options.fetchImpl,
				onError: options.onError
			});
		this.channel = new AgenticChatWorkerRealtimeChannel(
			options.client,
			this.coordinator.inbox,
			(status, error) => {
				this.#status = status;
				options.onStatus?.(status, error);
			}
		);
	}

	get started(): boolean {
		return this.#started;
	}

	get status(): AgenticChatWorkerChannelStatus {
		return this.#status;
	}

	get userId(): string | null {
		return this.#userId;
	}

	start(): Promise<void> {
		if (this.#started) return this.#startOperation ?? Promise.resolve();
		this.#started = true;
		const epoch = ++this.#epoch;
		this.#windowTarget?.addEventListener('online', this.#onlineListener);
		this.#documentTarget?.addEventListener('visibilitychange', this.#visibilityListener);
		const initialRevision = this.#authRevision;
		try {
			this.#authSubscription = this.#client.auth.onAuthStateChange((_event, session) => {
				const revision = ++this.#authRevision;
				void this.#queueAuthenticatedUser(session?.user ?? null, epoch, revision);
			}).data.subscription;
		} catch (error) {
			this.#reportError(error);
			return this.stop();
		}

		const operation = this.#loadAuthenticatedUser(epoch, initialRevision);
		this.#startOperation = operation;
		void operation.finally(() => {
			if (this.#startOperation === operation) this.#startOperation = null;
		});
		return operation;
	}

	async stop(): Promise<void> {
		if (
			!this.#started &&
			this.#status === 'closed' &&
			this.coordinator.trackedTurnCount === 0
		) {
			return;
		}
		this.#started = false;
		this.#epoch += 1;
		this.#authRevision += 1;
		this.#startOperation = null;
		this.#windowTarget?.removeEventListener('online', this.#onlineListener);
		this.#documentTarget?.removeEventListener('visibilitychange', this.#visibilityListener);
		this.#authSubscription?.unsubscribe();
		this.#authSubscription = null;
		const previousUserId = this.#userId;
		this.#userId = null;
		if (previousUserId !== null) this.#notifyUserChange(null);
		this.coordinator.stop();
		this.coordinator.clearTurns();
		try {
			await this.channel.close();
		} catch (error) {
			this.#reportError(error);
		}
	}

	registerTurn(input: {
		handle: WorkerTurnHandle;
		observer: AgenticChatWorkerApplicationObserver;
		executionGeneration?: number;
		lastAppliedSequence?: number;
	}): () => void {
		return this.coordinator.registerTurn(input);
	}

	async #loadAuthenticatedUser(epoch: number, revision: number): Promise<void> {
		try {
			const result = await this.#client.auth.getUser();
			if (result.error) throw result.error;
			await this.#queueAuthenticatedUser(result.data.user, epoch, revision);
		} catch (error) {
			if (this.#isCurrent(epoch, revision)) this.#reportError(error);
		}
	}

	#queueAuthenticatedUser(
		user: AuthUserLike | null,
		epoch: number,
		revision: number
	): Promise<void> {
		const operation = this.#authTransition
			.catch(() => {
				// One failed transition cannot block a newer authoritative auth state.
			})
			.then(() => this.#adoptAuthenticatedUser(user, epoch, revision));
		this.#authTransition = operation;
		return operation;
	}

	async #adoptAuthenticatedUser(
		user: AuthUserLike | null,
		epoch: number,
		revision: number
	): Promise<void> {
		if (!this.#isCurrent(epoch, revision)) return;
		if (!user?.id || !isAgenticChatRealtimeUserId(user.id)) {
			if (user?.id) this.#reportError(new Error('Invalid authenticated Realtime user id'));
			const previousUserId = this.#userId;
			this.#userId = null;
			if (previousUserId !== null) this.#notifyUserChange(null);
			this.coordinator.stop();
			this.coordinator.clearTurns();
			try {
				await this.channel.close();
			} catch (error) {
				this.#reportError(error);
			}
			return;
		}

		const userId = user.id.toLowerCase();
		const userChanged = this.#userId !== userId;
		if (this.#userId !== null && this.#userId !== userId) {
			this.coordinator.stop();
			this.coordinator.clearTurns();
		}
		this.#userId = userId;
		if (userChanged) this.#notifyUserChange(userId);
		this.coordinator.start();
		try {
			await this.channel.connect(userId);
		} catch (error) {
			if (this.#isCurrent(epoch, revision)) this.#reportError(error);
		}
	}

	#wake(): void {
		if (!this.#started) return;
		this.coordinator.requestAll('watchdog');
		const epoch = this.#epoch;
		const revision = this.#authRevision;
		if (this.#userId) {
			void this.channel.connect(this.#userId).catch((error) => this.#reportError(error));
			return;
		}
		void this.#loadAuthenticatedUser(epoch, revision);
	}

	#isCurrent(epoch: number, revision: number): boolean {
		return this.#started && this.#epoch === epoch && this.#authRevision === revision;
	}

	#reportError(error: unknown): void {
		try {
			this.#onError?.(error);
		} catch {
			// Error reporting cannot own the mounted transport lifecycle.
		}
	}

	#notifyUserChange(userId: string | null): void {
		try {
			this.#onUserChange?.(userId);
		} catch (error) {
			this.#reportError(error);
		}
	}
}

export function createAgenticChatWorkerRealtimeRuntime(
	options: AgenticChatWorkerRealtimeRuntimeOptions
): AgenticChatWorkerRealtimeRuntime {
	return new AgenticChatWorkerRealtimeRuntime(options);
}
