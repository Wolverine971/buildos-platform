// apps/worker/src/workers/agentic-chat/host/delivery-health.ts

import type {
	AgenticChatExecutionObservationInputV1,
	AgenticChatExecutionObservationPortV1
} from '../effects/execution-observation';
import type {
	AgenticChatPublisherDeliveryV1,
	AgenticChatPublisherTurnProgressObservationV1
} from '../stream/stream-publisher';

export const AGENTIC_CHAT_TURN_PROGRESS_HEALTH_VERSION =
	'agentic_chat_turn_progress_health_v1' as const;

/** Live delivery this far behind durable acceptance is reported as delayed. */
export const DEFAULT_AGENTIC_CHAT_DELIVERY_DELAYED_AFTER_MS = 5_000;
export const MAX_AGENTIC_CHAT_PROGRESS_HEALTH_TURNS = 64;

export type AgenticChatTurnTransportStatusV1 =
	| 'queued'
	| 'running'
	| 'completed'
	| 'failed'
	| 'cancelled';

export type AgenticChatTurnExecutionPhaseV1 =
	| 'queued'
	| 'preparing'
	| 'assessing'
	| 'executing'
	| 'synthesizing'
	| 'finalizing'
	| 'finished';

export type AgenticChatProviderActivityStateV1 = 'not_started' | 'waiting' | 'active' | 'finished';

export type AgenticChatTurnDeliveryStateV1 =
	| 'not_started'
	| 'connected'
	| 'uncertain'
	| 'disconnected'
	| 'blocked'
	| 'finished';

export type AgenticChatTurnProgressHealthInputV1 = {
	turnRunId: string;
	executionGeneration: number | null;
	transportStatus: AgenticChatTurnTransportStatusV1;
	executionPhase: AgenticChatTurnExecutionPhaseV1;
	acceptedAt: string;
	lastDurableProgressAt: string | null;
	/** Stream event type only (for example `tool_call`); never content. */
	lastDurableEventType?: string | null;
	providerActivity: {
		state: AgenticChatProviderActivityStateV1;
		lastObservedAt: string | null;
	};
	delivery: {
		state: AgenticChatTurnDeliveryStateV1;
		lastObservedAt: string | null;
		pendingEvents?: number;
		/** Age of the oldest durably accepted event not yet delivered live. */
		oldestPendingAgeMs?: number | null;
	};
	now: string;
	providerActiveTimeoutMs: number;
	stallTimeoutMs: number;
	deliveryDelayedAfterMs?: number;
};

/**
 * Privacy-safe, bounded projection for operators and the chat UI. Durable
 * progress comes from database commit receipts. Provider and delivery
 * observations are explicitly process-local hints and are never recovery
 * authority. Delivery state never changes whether computation is stalled.
 */
export type AgenticChatTurnProgressHealthV1 = {
	contractVersion: typeof AGENTIC_CHAT_TURN_PROGRESS_HEALTH_VERSION;
	turnRunId: string;
	executionGeneration: number | null;
	transportStatus: AgenticChatTurnTransportStatusV1;
	executionPhase: AgenticChatTurnExecutionPhaseV1;
	executionState: 'queued' | 'active' | 'provider_active' | 'stalled' | 'terminal';
	queueAgeMs: number | null;
	durableProgress: {
		lastObservedAt: string | null;
		ageMs: number | null;
		lastEventType: string | null;
		source: 'database';
	};
	providerActivity: {
		state: AgenticChatProviderActivityStateV1;
		lastObservedAt: string | null;
		ageMs: number | null;
		source: 'worker_memory';
	};
	delivery: {
		state: AgenticChatTurnDeliveryStateV1;
		lastObservedAt: string | null;
		ageMs: number | null;
		disconnected: boolean;
		pendingEvents: number;
		oldestPendingAgeMs: number | null;
		delayed: boolean;
		source: 'worker_memory';
	};
	stall: {
		stalled: boolean;
		reason: 'durable_progress_overdue' | null;
		thresholdMs: number;
	};
};

export function projectAgenticChatTurnProgressHealthV1(
	input: AgenticChatTurnProgressHealthInputV1
): AgenticChatTurnProgressHealthV1 {
	validateInput(input);
	const nowMs = Date.parse(input.now);
	// Database and worker clocks can disagree by a few milliseconds. Clamp
	// observations into [acceptedAt, now] instead of failing a health read.
	const acceptedAtMs = Math.min(Date.parse(input.acceptedAt), nowMs);
	const observedAt = (value: string | null) =>
		value === null ? null : Math.min(Math.max(Date.parse(value), acceptedAtMs), nowMs);
	const lastDurableProgressAtMs = observedAt(input.lastDurableProgressAt);
	const providerObservedAtMs = observedAt(input.providerActivity.lastObservedAt);
	const deliveryObservedAtMs = observedAt(input.delivery.lastObservedAt);
	const terminal = isTerminal(input.transportStatus);
	const queued = input.transportStatus === 'queued';
	const durableReferenceAtMs = lastDurableProgressAtMs ?? acceptedAtMs;
	const age = (observed: number | null) => (observed === null ? null : nowMs - observed);
	const providerActivityAgeMs = age(providerObservedAtMs);
	const providerActivelyBounded =
		input.providerActivity.state === 'active' &&
		providerActivityAgeMs !== null &&
		providerActivityAgeMs <= input.providerActiveTimeoutMs;
	const stalled =
		!terminal &&
		!queued &&
		!providerActivelyBounded &&
		nowMs - durableReferenceAtMs >= input.stallTimeoutMs;
	const oldestPendingAgeMs = input.delivery.oldestPendingAgeMs ?? null;
	const deliveryDelayedAfterMs =
		input.deliveryDelayedAfterMs ?? DEFAULT_AGENTIC_CHAT_DELIVERY_DELAYED_AFTER_MS;

	return {
		contractVersion: AGENTIC_CHAT_TURN_PROGRESS_HEALTH_VERSION,
		turnRunId: input.turnRunId,
		executionGeneration: input.executionGeneration,
		transportStatus: input.transportStatus,
		executionPhase: input.executionPhase,
		executionState: terminal
			? 'terminal'
			: queued
				? 'queued'
				: providerActivelyBounded
					? 'provider_active'
					: stalled
						? 'stalled'
						: 'active',
		queueAgeMs: queued ? nowMs - acceptedAtMs : null,
		durableProgress: {
			lastObservedAt: input.lastDurableProgressAt,
			ageMs: age(lastDurableProgressAtMs),
			lastEventType: eventTypeOrNull(input.lastDurableEventType),
			source: 'database'
		},
		providerActivity: {
			state: input.providerActivity.state,
			lastObservedAt: input.providerActivity.lastObservedAt,
			ageMs: providerActivityAgeMs,
			source: 'worker_memory'
		},
		delivery: {
			state: input.delivery.state,
			lastObservedAt: input.delivery.lastObservedAt,
			ageMs: age(deliveryObservedAtMs),
			disconnected: input.delivery.state === 'disconnected',
			pendingEvents: input.delivery.pendingEvents ?? 0,
			oldestPendingAgeMs,
			delayed: oldestPendingAgeMs !== null && oldestPendingAgeMs >= deliveryDelayedAfterMs,
			source: 'worker_memory'
		},
		stall: {
			stalled,
			reason: stalled ? 'durable_progress_overdue' : null,
			thresholdMs: input.stallTimeoutMs
		}
	};
}

export function agenticChatDeliveryStateFromPublisherV1(
	delivery: AgenticChatPublisherDeliveryV1
): AgenticChatTurnDeliveryStateV1 {
	switch (delivery) {
		case 'broadcast_acknowledged':
			return 'connected';
		case 'broadcast_sent_reconcile_pending':
		case 'already_persisted':
			return 'uncertain';
		case 'reconcile_only':
			return 'disconnected';
		case 'blocked':
			return 'blocked';
	}
}

/**
 * Stream-level delivery state for a worker-held turn. An acknowledgement
 * superseded by the turn's own later write is covered by a later exact ACK,
 * so only sticky reconciliation or a blocked writer reports degradation.
 */
export function agenticChatDeliveryStateFromPublisherObservationV1(
	observation: Pick<
		AgenticChatPublisherTurnProgressObservationV1,
		'blockedReason' | 'reconcileOnly' | 'lastDelivery' | 'lastDeliveryAt'
	>
): AgenticChatTurnDeliveryStateV1 {
	if (observation.blockedReason) return 'blocked';
	if (observation.lastDelivery === null || observation.lastDeliveryAt === null) {
		return observation.reconcileOnly ? 'uncertain' : 'not_started';
	}
	if (!observation.reconcileOnly) return 'connected';
	return observation.lastDelivery === 'reconcile_only' ? 'disconnected' : 'uncertain';
}

type ProviderActivityEntry = {
	executionGeneration: number;
	openAttempts: number;
	lastObservedAtMs: number;
};

/**
 * Process-local provider activity per turn, fed before each durable execution
 * observation write. It is an operator hint, not recovery authority: a lost
 * observation row must not make a live provider call look finished or stalled.
 */
export class AgenticChatTurnActivityRegistry {
	private readonly turns = new Map<string, ProviderActivityEntry>();
	private readonly now: () => number;
	private readonly maxTurns: number;

	constructor(options: { now?: () => number; maxTurns?: number } = {}) {
		this.now = options.now ?? Date.now;
		this.maxTurns = options.maxTurns ?? 256;
		if (!Number.isSafeInteger(this.maxTurns) || this.maxTurns < 1) {
			throw new Error('maxTurns must be a positive safe integer');
		}
	}

	observe(
		input: Pick<
			AgenticChatExecutionObservationInputV1,
			'turnRunId' | 'executionGeneration' | 'eventType'
		>
	): void {
		if (
			input.eventType !== 'provider_attempt_started' &&
			input.eventType !== 'provider_attempt_ended'
		) {
			return;
		}
		const nowMs = this.now();
		let entry = this.turns.get(input.turnRunId);
		if (!entry || entry.executionGeneration !== input.executionGeneration) {
			if (!entry && this.turns.size >= this.maxTurns) {
				const oldest = this.turns.keys().next().value;
				if (oldest !== undefined) this.turns.delete(oldest);
			}
			entry = {
				executionGeneration: input.executionGeneration,
				openAttempts: 0,
				lastObservedAtMs: nowMs
			};
			this.turns.set(input.turnRunId, entry);
		}
		entry.openAttempts =
			input.eventType === 'provider_attempt_started'
				? entry.openAttempts + 1
				: Math.max(0, entry.openAttempts - 1);
		entry.lastObservedAtMs = nowMs;
	}

	snapshot(
		turnRunId: string,
		executionGeneration: number
	): { state: AgenticChatProviderActivityStateV1; lastObservedAt: string | null } {
		const entry = this.turns.get(turnRunId);
		if (!entry || entry.executionGeneration !== executionGeneration) {
			return { state: 'not_started', lastObservedAt: null };
		}
		return {
			state: entry.openAttempts > 0 ? 'active' : 'waiting',
			lastObservedAt: new Date(entry.lastObservedAtMs).toISOString()
		};
	}

	/** Forget turns this worker no longer holds. */
	prune(activeTurnRunIds: Iterable<string>): void {
		const active = new Set(activeTurnRunIds);
		for (const turnRunId of this.turns.keys()) {
			if (!active.has(turnRunId)) this.turns.delete(turnRunId);
		}
	}
}

/** Record provider activity in memory, then perform the unchanged durable write. */
export function withAgenticChatTurnActivityV1(
	port: AgenticChatExecutionObservationPortV1,
	registry: AgenticChatTurnActivityRegistry
): AgenticChatExecutionObservationPortV1 {
	return {
		observe(input, signal) {
			try {
				registry.observe(input);
			} catch {
				// Observability can never become part of the provider call boundary.
			}
			return port.observe(input, signal);
		}
	};
}

export type AgenticChatWorkerProgressHealthV1 = {
	contractVersion: typeof AGENTIC_CHAT_TURN_PROGRESS_HEALTH_VERSION;
	turns: AgenticChatTurnProgressHealthV1[];
	stalledTurns: number;
	delayedDeliveryTurns: number;
	omittedTurns: number;
};

/**
 * Per-turn progress for the worker health surface. It never throws and never
 * marks the worker unhealthy: restarting a process cannot repair a stalled turn
 * and would interrupt healthy long provider calls on the same worker.
 */
export function projectAgenticChatWorkerProgressHealthV1(input: {
	publisher: AgenticChatPublisherTurnProgressObservationV1[];
	activity: AgenticChatTurnActivityRegistry;
	now: string;
	providerActiveTimeoutMs: number;
	stallTimeoutMs: number;
	deliveryDelayedAfterMs?: number;
	maxTurns?: number;
}): AgenticChatWorkerProgressHealthV1 {
	const maxTurns = input.maxTurns ?? MAX_AGENTIC_CHAT_PROGRESS_HEALTH_TURNS;
	const turns: AgenticChatTurnProgressHealthV1[] = [];
	let omittedTurns = 0;
	try {
		input.activity.prune(input.publisher.map((observation) => observation.turnRunId));
	} catch {
		// A failed prune only leaves bounded stale memory behind.
	}
	for (const observation of input.publisher) {
		if (turns.length >= maxTurns) {
			omittedTurns += 1;
			continue;
		}
		try {
			const provider = input.activity.snapshot(
				observation.turnRunId,
				observation.executionGeneration
			);
			turns.push(
				projectAgenticChatTurnProgressHealthV1({
					turnRunId: observation.turnRunId,
					executionGeneration: observation.executionGeneration,
					transportStatus: 'running',
					executionPhase: provider.state === 'not_started' ? 'preparing' : 'executing',
					acceptedAt: observation.acceptedAt ?? observation.registeredAt,
					lastDurableProgressAt: observation.lastDurableProgressAt,
					lastDurableEventType: observation.lastDurableEventType,
					providerActivity: provider,
					delivery: {
						state: agenticChatDeliveryStateFromPublisherObservationV1(observation),
						lastObservedAt: observation.lastDeliveryAt,
						pendingEvents:
							observation.pendingPersistenceEvents +
							observation.pendingDeliveryEvents,
						oldestPendingAgeMs: observation.oldestPendingDeliveryAgeMs
					},
					now: input.now,
					providerActiveTimeoutMs: input.providerActiveTimeoutMs,
					stallTimeoutMs: input.stallTimeoutMs,
					deliveryDelayedAfterMs: input.deliveryDelayedAfterMs
				})
			);
		} catch {
			omittedTurns += 1;
		}
	}
	return {
		contractVersion: AGENTIC_CHAT_TURN_PROGRESS_HEALTH_VERSION,
		turns,
		stalledTurns: turns.filter((turn) => turn.stall.stalled).length,
		delayedDeliveryTurns: turns.filter((turn) => turn.delivery.delayed).length,
		omittedTurns
	};
}

function validateInput(input: AgenticChatTurnProgressHealthInputV1): void {
	if (!input.turnRunId || input.turnRunId.length > 128) {
		throw new Error('turnRunId must be a bounded nonempty identifier');
	}
	if (
		input.executionGeneration !== null &&
		(!Number.isSafeInteger(input.executionGeneration) || input.executionGeneration < 1)
	) {
		throw new Error('executionGeneration must be null or a positive safe integer');
	}
	timestamp(input.now, 'now');
	timestamp(input.acceptedAt, 'acceptedAt');
	const providerAtMs = nullableTimestamp(input.providerActivity.lastObservedAt);
	const deliveryAtMs = nullableTimestamp(input.delivery.lastObservedAt);
	nullableTimestamp(input.lastDurableProgressAt);
	if (
		!Number.isSafeInteger(input.providerActiveTimeoutMs) ||
		input.providerActiveTimeoutMs < 1 ||
		!Number.isSafeInteger(input.stallTimeoutMs) ||
		input.stallTimeoutMs <= input.providerActiveTimeoutMs
	) {
		throw new Error('stall timeout must exceed the positive provider activity timeout');
	}
	if (
		input.deliveryDelayedAfterMs !== undefined &&
		(!Number.isSafeInteger(input.deliveryDelayedAfterMs) || input.deliveryDelayedAfterMs < 1)
	) {
		throw new Error('deliveryDelayedAfterMs must be a positive safe integer');
	}
	if (
		input.delivery.pendingEvents !== undefined &&
		(!Number.isSafeInteger(input.delivery.pendingEvents) || input.delivery.pendingEvents < 0)
	) {
		throw new Error('pendingEvents must be a nonnegative safe integer');
	}
	const oldestPendingAgeMs = input.delivery.oldestPendingAgeMs;
	if (
		oldestPendingAgeMs !== undefined &&
		oldestPendingAgeMs !== null &&
		(!Number.isFinite(oldestPendingAgeMs) || oldestPendingAgeMs < 0)
	) {
		throw new Error('oldestPendingAgeMs must be null or a nonnegative duration');
	}
	if (input.transportStatus === 'queued' && input.executionPhase !== 'queued') {
		throw new Error('queued transport requires the queued execution phase');
	}
	if (isTerminal(input.transportStatus) && input.executionPhase !== 'finished') {
		throw new Error('terminal transport requires the finished execution phase');
	}
	if (input.providerActivity.state === 'active' && providerAtMs === null) {
		throw new Error('active provider state requires a process-local observation');
	}
	if (input.delivery.state === 'disconnected' && deliveryAtMs === null) {
		throw new Error('disconnected delivery requires a process-local observation');
	}
}

function eventTypeOrNull(value: string | null | undefined): string | null {
	return typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : null;
}

function isTerminal(status: AgenticChatTurnTransportStatusV1): boolean {
	return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function nullableTimestamp(value: string | null): number | null {
	return value === null ? null : timestamp(value, 'observation');
}

function timestamp(value: string, name: string): number {
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) throw new Error(`${name} must be an ISO timestamp`);
	return parsed;
}
