// apps/web/src/lib/services/agentic-chat-v2/worker-turn-adoption.ts
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgenticChatWorkerTurnDescriptorV1,
	type ChatTurnStatusV1,
	type TurnHandleV1
} from '@buildos/shared-types';
import type { AgenticChatWorkerApplicationObserver } from './worker-realtime-coordinator';

type WorkerTurnHandle = Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>;

export type AgenticChatWorkerTurnRegistrationRuntime = {
	registerTurn(input: {
		handle: WorkerTurnHandle;
		observer: AgenticChatWorkerApplicationObserver;
		executionGeneration?: number;
		lastAppliedSequence?: number;
	}): () => void;
};

export type AgenticChatWorkerTurnAdoptionSource =
	| 'admission'
	| 'matching_duplicate'
	| 'owned_lookup';

export type AgenticChatWorkerTurnAdoptionOptions = {
	runtime: AgenticChatWorkerTurnRegistrationRuntime;
	fetchImpl?: typeof fetch;
	createObserver(input: {
		handle: WorkerTurnHandle;
		onTerminal(status: Extract<ChatTurnStatusV1, 'completed' | 'failed' | 'cancelled'>): void;
	}): AgenticChatWorkerApplicationObserver;
	onAdopted?(input: {
		descriptor: AgenticChatWorkerTurnDescriptorV1;
		source: AgenticChatWorkerTurnAdoptionSource;
	}): void;
	onReleased?(input: {
		handle: WorkerTurnHandle;
		reason: 'terminal' | 'session_changed' | 'auth_changed' | 'teardown' | 'not_active';
		status?: ChatTurnStatusV1;
	}): void;
	onError?(error: unknown): void;
};

type Registration = {
	descriptor: AgenticChatWorkerTurnDescriptorV1;
	unregister: () => void;
};

export class AgenticChatWorkerTurnAdoption {
	readonly #runtime: AgenticChatWorkerTurnRegistrationRuntime;
	readonly #fetch: typeof fetch;
	readonly #createObserver: AgenticChatWorkerTurnAdoptionOptions['createObserver'];
	readonly #onAdopted?: AgenticChatWorkerTurnAdoptionOptions['onAdopted'];
	readonly #onReleased?: AgenticChatWorkerTurnAdoptionOptions['onReleased'];
	readonly #onError?: AgenticChatWorkerTurnAdoptionOptions['onError'];
	readonly #registrations = new Map<string, Registration>();
	readonly #discoveryEpochs = new Map<string, number>();
	#epoch = 0;

	constructor(options: AgenticChatWorkerTurnAdoptionOptions) {
		this.#runtime = options.runtime;
		this.#fetch = options.fetchImpl ?? fetch;
		this.#createObserver = options.createObserver;
		this.#onAdopted = options.onAdopted;
		this.#onReleased = options.onReleased;
		this.#onError = options.onError;
	}

	get trackedTurnCount(): number {
		return this.#registrations.size;
	}

	getTrackedHandles(): WorkerTurnHandle[] {
		return [...this.#registrations.values()].map(({ descriptor }) => descriptor.handle);
	}

	adoptAdmissionResponse(value: unknown): AgenticChatWorkerTurnDescriptorV1 {
		const parsed = parseAdmissionResponse(value);
		return this.#adopt(parsed.descriptor, parsed.source);
	}

	adoptOwnedDescriptor(value: unknown): AgenticChatWorkerTurnDescriptorV1 {
		return this.#adopt(parseWorkerTurnDescriptor(value, false), 'owned_lookup');
	}

	async discoverSession(
		sessionId: string,
		options: { signal?: AbortSignal } = {}
	): Promise<AgenticChatWorkerTurnDescriptorV1[]> {
		if (!isCanonicalUuid(sessionId))
			throw new Error('Worker turn discovery requires a session UUID');
		const rootEpoch = this.#epoch;
		const discoveryEpoch = (this.#discoveryEpochs.get(sessionId) ?? 0) + 1;
		this.#discoveryEpochs.set(sessionId, discoveryEpoch);

		const response = await this.#fetch(
			`/api/agent/v2/turns?session_id=${encodeURIComponent(sessionId)}`,
			{
				method: 'GET',
				headers: { Accept: 'application/json' },
				credentials: 'same-origin',
				cache: 'no-store',
				signal: options.signal
			}
		);
		if (!response.ok) throw new AgenticChatWorkerDiscoveryHttpError(response.status);
		const value: unknown = await response.json();
		const descriptors = parseDiscoveryResponse(value, sessionId);
		if (
			rootEpoch !== this.#epoch ||
			this.#discoveryEpochs.get(sessionId) !== discoveryEpoch ||
			options.signal?.aborted
		) {
			return [];
		}

		const activeIds = new Set(descriptors.map(({ handle }) => handle.turnRunId));
		for (const descriptor of descriptors) this.#adopt(descriptor, 'owned_lookup');
		for (const [turnRunId, registration] of this.#registrations) {
			if (
				registration.descriptor.handle.sessionId === sessionId &&
				!activeIds.has(turnRunId)
			) {
				this.#release(turnRunId, 'not_active');
			}
		}
		return descriptors;
	}

	releaseSession(sessionId: string): void {
		this.#discoveryEpochs.set(sessionId, (this.#discoveryEpochs.get(sessionId) ?? 0) + 1);
		for (const [turnRunId, registration] of this.#registrations) {
			if (registration.descriptor.handle.sessionId === sessionId) {
				this.#release(turnRunId, 'session_changed');
			}
		}
	}

	clear(reason: 'auth_changed' | 'teardown' = 'teardown'): void {
		this.#epoch += 1;
		this.#discoveryEpochs.clear();
		for (const turnRunId of [...this.#registrations.keys()]) {
			this.#release(turnRunId, reason);
		}
	}

	#adopt(
		descriptor: AgenticChatWorkerTurnDescriptorV1,
		source: AgenticChatWorkerTurnAdoptionSource
	): AgenticChatWorkerTurnDescriptorV1 {
		const turnRunId = descriptor.handle.turnRunId;
		const existing = this.#registrations.get(turnRunId);
		if (existing) {
			if (!sameWorkerHandle(existing.descriptor.handle, descriptor.handle)) {
				throw new Error('Authoritative worker handle changed after registration');
			}
			existing.descriptor = descriptor;
			this.#notifyAdopted(descriptor, source);
			return descriptor;
		}

		const observer = this.#createObserver({
			handle: descriptor.handle,
			onTerminal: (status) => {
				queueMicrotask(() => this.#release(turnRunId, 'terminal', status));
			}
		});
		const unregister = this.#runtime.registerTurn({
			handle: descriptor.handle,
			observer,
			executionGeneration: descriptor.executionGeneration,
			lastAppliedSequence: 0
		});
		this.#registrations.set(turnRunId, { descriptor, unregister });
		this.#notifyAdopted(descriptor, source);
		return descriptor;
	}

	#release(
		turnRunId: string,
		reason: Parameters<
			NonNullable<AgenticChatWorkerTurnAdoptionOptions['onReleased']>
		>[0]['reason'],
		status?: ChatTurnStatusV1
	): void {
		const registration = this.#registrations.get(turnRunId);
		if (!registration) return;
		this.#registrations.delete(turnRunId);
		try {
			registration.unregister();
		} catch (error) {
			this.#reportError(error);
		}
		try {
			this.#onReleased?.({ handle: registration.descriptor.handle, reason, status });
		} catch (error) {
			this.#reportError(error);
		}
	}

	#notifyAdopted(
		descriptor: AgenticChatWorkerTurnDescriptorV1,
		source: AgenticChatWorkerTurnAdoptionSource
	): void {
		try {
			this.#onAdopted?.({ descriptor, source });
		} catch (error) {
			this.#reportError(error);
		}
	}

	#reportError(error: unknown): void {
		try {
			this.#onError?.(error);
		} catch {
			// Observability cannot own authoritative registration cleanup.
		}
	}
}

export class AgenticChatWorkerDiscoveryHttpError extends Error {
	constructor(readonly status: number) {
		super(`Worker turn discovery failed with HTTP ${status}`);
		this.name = 'AgenticChatWorkerDiscoveryHttpError';
	}
}

function parseAdmissionResponse(value: unknown): {
	descriptor: AgenticChatWorkerTurnDescriptorV1;
	source: 'admission' | 'matching_duplicate';
} {
	const root = requireRecord(value, 'worker admission response');
	if (root.success !== true) throw new Error('Worker admission was not successful');
	const data = requireRecord(root.data, 'worker admission data');
	if (data.outcome !== 'newly_admitted' && data.outcome !== 'matching_duplicate') {
		throw new Error('Worker admission response is not adoptable');
	}
	const status = parseStatus(data.status);
	if (data.outcome === 'newly_admitted' && status !== 'queued') {
		throw new Error('New worker admission must be queued');
	}
	return {
		descriptor: {
			handle: parseWorkerHandle(data.handle),
			status,
			executionGeneration: 0,
			terminalEventId: null,
			updatedAt: new Date(0).toISOString()
		},
		source: data.outcome === 'newly_admitted' ? 'admission' : 'matching_duplicate'
	};
}

function parseDiscoveryResponse(
	value: unknown,
	sessionId: string
): AgenticChatWorkerTurnDescriptorV1[] {
	const root = requireRecord(value, 'worker discovery response');
	if (root.success !== true) throw new Error('Worker discovery was not successful');
	const data = requireRecord(root.data, 'worker discovery data');
	if (!Array.isArray(data.turns) || data.turns.length > 8) {
		throw new Error('Worker discovery result is invalid');
	}
	const descriptors = data.turns.map((item) => parseWorkerTurnDescriptor(item, true));
	if (descriptors.some(({ handle }) => handle.sessionId !== sessionId.toLowerCase())) {
		throw new Error('Worker discovery escaped the requested session');
	}
	return descriptors;
}

function parseWorkerTurnDescriptor(
	value: unknown,
	activeOnly: boolean
): AgenticChatWorkerTurnDescriptorV1 {
	const record = requireRecord(value, 'worker turn descriptor');
	const status = parseStatus(record.status);
	if (activeOnly && status !== 'queued' && status !== 'running') {
		throw new Error('Active worker discovery returned a terminal turn');
	}
	const executionGeneration = parseNonnegativeInteger(
		record.executionGeneration,
		'executionGeneration'
	);
	if (status === 'running' && executionGeneration < 1) {
		throw new Error('Running worker turn has no execution generation');
	}
	const terminal = status === 'completed' || status === 'failed' || status === 'cancelled';
	const terminalEventId = record.terminalEventId;
	if (
		(terminalEventId !== null && typeof terminalEventId !== 'string') ||
		terminal !== (typeof terminalEventId === 'string')
	) {
		throw new Error('Worker turn terminal identity is invalid');
	}
	if (typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt))) {
		throw new Error('Worker turn timestamp is invalid');
	}
	return {
		handle: parseWorkerHandle(record.handle),
		status,
		executionGeneration,
		terminalEventId: terminalEventId as string | null,
		updatedAt: record.updatedAt
	};
}

function parseWorkerHandle(value: unknown): WorkerTurnHandle {
	const handle = requireRecord(value, 'worker handle');
	if (
		handle.contractVersion !== AGENTIC_CHAT_WORKER_CONTRACT_VERSION ||
		handle.executionMode !== 'worker_realtime' ||
		!isCanonicalUuid(handle.turnRunId) ||
		!isCanonicalUuid(handle.sessionId) ||
		!canonicalText(handle.streamRunId, 256) ||
		!canonicalText(handle.clientTurnId, 256)
	) {
		throw new Error('Worker handle is invalid');
	}
	return {
		contractVersion: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
		executionMode: 'worker_realtime',
		turnRunId: handle.turnRunId.toLowerCase(),
		sessionId: handle.sessionId.toLowerCase(),
		streamRunId: handle.streamRunId,
		clientTurnId: handle.clientTurnId
	};
}

function sameWorkerHandle(left: WorkerTurnHandle, right: WorkerTurnHandle): boolean {
	return (
		left.contractVersion === right.contractVersion &&
		left.executionMode === right.executionMode &&
		left.turnRunId === right.turnRunId &&
		left.sessionId === right.sessionId &&
		left.streamRunId === right.streamRunId &&
		left.clientTurnId === right.clientTurnId
	);
}

function parseStatus(value: unknown): ChatTurnStatusV1 {
	if (
		value !== 'queued' &&
		value !== 'running' &&
		value !== 'completed' &&
		value !== 'failed' &&
		value !== 'cancelled'
	) {
		throw new Error('Worker turn status is invalid');
	}
	return value;
}

function parseNonnegativeInteger(value: unknown, label: string): number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw new Error(`${label} must be a nonnegative integer`);
	}
	return value as number;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function canonicalText(value: unknown, maximum: number): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= maximum &&
		value === value.trim()
	);
}

function isCanonicalUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
