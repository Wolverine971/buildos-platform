// apps/worker/src/workers/agentic-chat/runtimeTiming.ts
import { performance } from 'node:perf_hooks';
import type { AgenticChatWorkerTimingBaselineV1 } from './executionInput';

export type AgenticChatMonotonicClockV1 = {
	nowMs(): number;
};

export type AgenticChatPreterminalTimingSnapshotV1 = {
	turnRunId: string;
	executionGeneration: number;
	database: Omit<AgenticChatWorkerTimingBaselineV1, 'executionStartedAt'> & {
		executionStartedAt: string;
	};
	preterminal: {
		providerAuthorityObservedAtMs: number;
		firstEventPersistedAt: string | null;
		firstEventPersistenceObservedAtMs: number | null;
		firstResponsePersistedAt: string | null;
		firstResponsePersistenceObservedAtMs: number | null;
		providerFinishedAtMs: number;
		terminalCallStartedAtMs: number;
		durationsMs: {
			authorityToFirstEventPersistence: number | null;
			authorityToFirstResponsePersistence: number | null;
			firstResponsePersistenceToProviderFinish: number | null;
			authorityToProviderFinish: number;
			providerFinishToTerminalCall: number;
		};
	};
};

export type AgenticChatRuntimeTimingSnapshotV1 = AgenticChatPreterminalTimingSnapshotV1 & {
	postcallTelemetry: {
		terminalCallCompletedAtMs: number;
		terminalCall: number;
	};
};

export type AgenticChatRuntimeTimingObserverV1 = (
	snapshot: AgenticChatRuntimeTimingSnapshotV1
) => void;

export const SYSTEM_AGENTIC_CHAT_MONOTONIC_CLOCK: AgenticChatMonotonicClockV1 = {
	nowMs: () => performance.now()
};

export class AgenticChatRuntimeTimingError extends Error {
	constructor(message: string) {
		super(`Invalid Agentic Chat runtime timing: ${message}`);
		this.name = 'AgenticChatRuntimeTimingError';
	}
}

/**
 * Captures process-local elapsed boundaries. Database timestamps remain
 * separate because wall-clock strings and monotonic offsets are not
 * interchangeable sources.
 */
export class AgenticChatRuntimeTimingTracker {
	private readonly database: AgenticChatPreterminalTimingSnapshotV1['database'];
	private readonly providerAuthorityObservedAtMs: number;
	private lastObservedAtMs: number | null = null;
	private firstEventPersistedAt: string | null = null;
	private firstEventPersistenceObservedAtMs: number | null = null;
	private firstResponsePersistedAt: string | null = null;
	private firstResponsePersistenceObservedAtMs: number | null = null;
	private providerFinishedAtMs: number | null = null;
	private terminalCallStartedAtMs: number | null = null;
	private terminalCallCompletedAtMs: number | null = null;
	private healthy = true;

	constructor(
		private readonly input: {
			turnRunId: string;
			executionGeneration: number;
			baseline: AgenticChatWorkerTimingBaselineV1;
			executionStartedAt: string;
			clock: AgenticChatMonotonicClockV1;
		}
	) {
		if (
			!Number.isSafeInteger(input.executionGeneration) ||
			input.executionGeneration < 1 ||
			!isTimestamp(input.executionStartedAt) ||
			Date.parse(input.executionStartedAt) < Date.parse(input.baseline.workerStartedAt) ||
			(input.baseline.executionStartedAt !== null &&
				input.baseline.executionStartedAt !== input.executionStartedAt)
		) {
			throw new AgenticChatRuntimeTimingError(
				'provider authority does not match the claimed database baseline'
			);
		}
		this.database = {
			...input.baseline,
			executionStartedAt: input.executionStartedAt
		};
		this.providerAuthorityObservedAtMs = this.readClock();
	}

	observePersistedEvent(persistedAt: string, eventType: string): void {
		const recordsFirstEvent = this.firstEventPersistenceObservedAtMs === null;
		const recordsFirstResponse =
			eventType === 'text_delta' && this.firstResponsePersistenceObservedAtMs === null;
		if (!recordsFirstEvent && !recordsFirstResponse) return;

		this.validatePersistenceTimestamp(persistedAt, eventType);
		if (recordsFirstResponse) {
			if (
				this.firstEventPersistedAt !== null &&
				Date.parse(persistedAt) < Date.parse(this.firstEventPersistedAt)
			) {
				this.fail('first response persistence predates the first event');
			}
		}
		const observedAtMs = this.readClock();
		if (recordsFirstEvent) {
			this.firstEventPersistedAt = persistedAt;
			this.firstEventPersistenceObservedAtMs = observedAtMs;
		}
		if (recordsFirstResponse) {
			this.firstResponsePersistedAt = persistedAt;
			this.firstResponsePersistenceObservedAtMs = observedAtMs;
		}
	}

	markProviderFinished(): void {
		if (this.providerFinishedAtMs !== null) {
			throw new AgenticChatRuntimeTimingError('provider finish was recorded twice');
		}
		this.providerFinishedAtMs = this.readClock();
	}

	markTerminalCallStarted(): void {
		if (this.providerFinishedAtMs === null) {
			throw new AgenticChatRuntimeTimingError('terminal call started before provider finish');
		}
		if (this.terminalCallStartedAtMs !== null) {
			throw new AgenticChatRuntimeTimingError('terminal call start was recorded twice');
		}
		this.terminalCallStartedAtMs = this.readClock();
	}

	markTerminalCallCompleted(): void {
		if (this.terminalCallStartedAtMs === null) {
			throw new AgenticChatRuntimeTimingError('terminal call completed before it started');
		}
		if (this.terminalCallCompletedAtMs !== null) {
			throw new AgenticChatRuntimeTimingError('terminal call completion was recorded twice');
		}
		this.terminalCallCompletedAtMs = this.readClock();
	}

	preterminalSnapshot(): AgenticChatPreterminalTimingSnapshotV1 {
		if (!this.healthy) {
			throw new AgenticChatRuntimeTimingError(
				'runtime timing source is no longer trustworthy'
			);
		}
		const providerFinishedAtMs = requiredBoundary(this.providerFinishedAtMs, 'provider finish');
		const terminalCallStartedAtMs = requiredBoundary(
			this.terminalCallStartedAtMs,
			'terminal call start'
		);
		return {
			turnRunId: this.input.turnRunId,
			executionGeneration: this.input.executionGeneration,
			database: this.database,
			preterminal: {
				providerAuthorityObservedAtMs: this.providerAuthorityObservedAtMs,
				firstEventPersistedAt: this.firstEventPersistedAt,
				firstEventPersistenceObservedAtMs: this.firstEventPersistenceObservedAtMs,
				firstResponsePersistedAt: this.firstResponsePersistedAt,
				firstResponsePersistenceObservedAtMs: this.firstResponsePersistenceObservedAtMs,
				providerFinishedAtMs,
				terminalCallStartedAtMs,
				durationsMs: {
					authorityToFirstEventPersistence: duration(
						this.providerAuthorityObservedAtMs,
						this.firstEventPersistenceObservedAtMs
					),
					authorityToFirstResponsePersistence: duration(
						this.providerAuthorityObservedAtMs,
						this.firstResponsePersistenceObservedAtMs
					),
					firstResponsePersistenceToProviderFinish: duration(
						this.firstResponsePersistenceObservedAtMs,
						providerFinishedAtMs
					),
					authorityToProviderFinish:
						providerFinishedAtMs - this.providerAuthorityObservedAtMs,
					providerFinishToTerminalCall: terminalCallStartedAtMs - providerFinishedAtMs
				}
			}
		};
	}

	snapshot(): AgenticChatRuntimeTimingSnapshotV1 {
		const preterminal = this.preterminalSnapshot();
		const terminalCallCompletedAtMs = requiredBoundary(
			this.terminalCallCompletedAtMs,
			'terminal call completion'
		);

		return {
			...preterminal,
			postcallTelemetry: {
				terminalCallCompletedAtMs,
				terminalCall:
					terminalCallCompletedAtMs - preterminal.preterminal.terminalCallStartedAtMs
			}
		};
	}

	private readClock(): number {
		if (!this.healthy) {
			throw new AgenticChatRuntimeTimingError(
				'runtime timing source is no longer trustworthy'
			);
		}
		let value: number;
		try {
			value = this.input.clock.nowMs();
		} catch {
			this.healthy = false;
			throw new AgenticChatRuntimeTimingError('monotonic clock threw');
		}
		if (!Number.isFinite(value) || value < 0) {
			this.healthy = false;
			throw new AgenticChatRuntimeTimingError('monotonic clock returned an invalid value');
		}
		if (this.lastObservedAtMs !== null && value < this.lastObservedAtMs) {
			this.healthy = false;
			throw new AgenticChatRuntimeTimingError('monotonic clock moved backwards');
		}
		this.lastObservedAtMs = value;
		return value;
	}

	private validatePersistenceTimestamp(value: string, eventType: string): void {
		if (
			!isTimestamp(value) ||
			Date.parse(value) < Date.parse(this.database.executionStartedAt)
		) {
			this.fail(`${eventType} persistence timestamp is invalid`);
		}
	}

	private fail(message: string): never {
		this.healthy = false;
		throw new AgenticChatRuntimeTimingError(message);
	}
}

function duration(start: number | null, end: number | null): number | null {
	return start === null || end === null ? null : end - start;
}

function requiredBoundary(value: number | null, name: string): number {
	if (value === null) {
		throw new AgenticChatRuntimeTimingError(`${name} is missing`);
	}
	return value;
}

function isTimestamp(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}
