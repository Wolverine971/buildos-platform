// apps/worker/src/workers/agentic-chat/turn/executor-helpers.ts
//
// Pure helpers shared by the turn executor and its collaborators: canonical
// value checks, envelope and finish validation, the overhead deadline, abort
// and provider-stream plumbing, and never-fatal publisher and timing reads.
import type {
	AgenticChatTurnClaimResultV1,
	AgenticChatTurnJobV1,
	ChatTurnTerminalStatusV1,
	ContextShiftPayload,
	JsonObject
} from '@buildos/shared-types';
import type { ProcessingJob } from '../../../lib/supabaseQueue';
import type { AgenticChatExecutionIdentityV1 } from './execution-control';
import { AgenticChatPublisherOverloadError } from '../stream/stream-publisher';
import type {
	AgenticChatProviderFailedToolSynthesisInputV1,
	AgenticChatProviderStepV1,
	AgenticChatProviderToolSynthesisInputV1
} from '../provider/contracts';
import type { AgenticChatRuntimeTimingTracker } from '../stream/runtime-timing';
import { abortable, runWithAbortableDeadline } from '../shared/abortable-deadline';
import type {
	AgenticChatTurnExecutionOutcomeV1,
	AgenticChatTurnExecutionResultV1,
	AgenticChatTurnUsageV1,
	PublisherPort
} from './executor-contracts';
import type { AgenticChatExecutableToolStepV1 } from './turn-run';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * The bound on one control-plane step outside the provider budget. Terminal
 * steps run on a fresh signal so a spent turn signal can never skip them.
 */
export class AgenticChatOverheadDeadline {
	constructor(readonly timeoutMs: number) {}

	awaitOverhead<T>(
		parentSignal: AbortSignal,
		label: string,
		run: (signal: AbortSignal) => PromiseLike<T>,
		createTimeoutError: () => Error = () =>
			new Error(`Agentic Chat ${label} exceeded its ${this.timeoutMs}ms overhead deadline`)
	): Promise<T> {
		return runWithAbortableDeadline({
			parentSignal,
			timeoutMs: this.timeoutMs,
			createTimeoutError,
			run
		});
	}

	awaitTerminal<T>(label: string, run: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
		return this.awaitOverhead(new AbortController().signal, label, run);
	}
}

export function validateJobEnvelope(
	job: ProcessingJob<AgenticChatTurnJobV1>
): AgenticChatExecutionIdentityV1 {
	canonicalUuid(job.queueRowId, 'queueRowId');
	canonicalUuid(job.processingToken, 'processingToken');
	canonicalUuid(job.data?.turnRunId, 'turnRunId');
	canonicalUuid(job.data?.correlationId, 'correlationId');
	canonicalUuid(job.userId, 'userId');
	return {
		turnRunId: job.data.turnRunId,
		queueJobId: job.queueRowId,
		processingToken: job.processingToken
	};
}

export function validateClaimEnvelope(
	claim: AgenticChatTurnClaimResultV1,
	job: ProcessingJob<AgenticChatTurnJobV1>
): void {
	if (
		claim.turnRunId !== job.data.turnRunId ||
		claim.queueJobId !== job.queueRowId ||
		claim.userId !== job.userId ||
		claim.correlationId !== job.data.correlationId
	) {
		throw new Error('Claim receipt does not match the claimed queue envelope');
	}
}

export function validateFinish(reason: string, usage: AgenticChatTurnUsageV1 | null): void {
	if (!canonicalText(reason, 256)) throw new Error('Fixture finished reason is invalid');
	if (!usage) return;
	for (const value of [usage.promptTokens, usage.completionTokens, usage.totalTokens]) {
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new Error('Fixture usage is invalid');
		}
	}
	if (usage.totalTokens !== usage.promptTokens + usage.completionTokens) {
		throw new Error('Fixture total token usage is inconsistent');
	}
}

export function extractContextShift(payload: JsonObject): ContextShiftPayload | null {
	if (payload.type !== 'context_shift') return null;
	const value = payload.context_shift;
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const shift = value as Record<string, unknown>;
	const entityTypes = new Set([
		'workspace',
		'project',
		'task',
		'plan',
		'goal',
		'document',
		'milestone',
		'risk',
		'requirement'
	]);
	if (
		typeof shift.new_context !== 'string' ||
		typeof shift.entity_type !== 'string' ||
		!entityTypes.has(shift.entity_type) ||
		!(shift.entity_id === null || typeof shift.entity_id === 'string') ||
		!(shift.entity_name === null || typeof shift.entity_name === 'string') ||
		!(shift.message === undefined || typeof shift.message === 'string')
	) {
		return null;
	}
	return shift as unknown as ContextShiftPayload;
}

export function isSemanticReviewStart(
	step: Extract<AgenticChatProviderStepV1, { type: 'semantic' }>
): boolean {
	const review = step.eventPayload.semantic_review;
	return typeof review === 'object' && review !== null && !Array.isArray(review);
}

export function providerSchedulingArguments(step: AgenticChatExecutableToolStepV1): JsonObject {
	if (!step.scheduling) return step.arguments;
	return {
		...step.arguments,
		...(step.scheduling.callRef !== null ? { call_ref: step.scheduling.callRef } : {}),
		after: [...step.scheduling.after]
	};
}

export function isFailedToolSynthesisInput(
	input: AgenticChatProviderToolSynthesisInputV1
): input is AgenticChatProviderFailedToolSynthesisInputV1 {
	return 'failure' in input;
}

export function canonicalUuid(value: unknown, label: string): asserts value is string {
	if (typeof value !== 'string' || !UUID_PATTERN.test(value) || value !== value.toLowerCase()) {
		throw new Error(`${label} must be a canonical UUID`);
	}
}

export function canonicalText(value: unknown, maximum: number): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= maximum &&
		value === value.trim()
	);
}

export function elapsedMs(startedAt: number): number {
	return Math.min(2_147_483_647, Math.max(0, Date.now() - startedAt));
}

/**
 * Queue provider text without serializing generation on durable delivery.
 * The publisher's soft limits provide bounded backpressure, while flushTurn
 * remains the single durability/acknowledgement fence before finalization.
 */
export async function enqueueAssistantText(
	publisher: Pick<PublisherPort, 'appendText'>,
	turnRunId: string,
	text: string,
	signal: AbortSignal
): Promise<void> {
	const queued = publisher.appendText(turnRunId, text);
	// A blocked publisher is synchronously visible to a later append or flush.
	// Handle both detached halves immediately so an early rejection cannot
	// surface as an unhandled rejection before that authoritative boundary.
	void queued.accepted.catch(() => undefined);
	void queued.delivery.catch(() => undefined);
	if (queued.pressureRelieved) {
		await abortable(queued.pressureRelieved, signal);
	}
}

export function safeAssistantText(
	publisher: Pick<PublisherPort, 'getSnapshot'>,
	turnRunId: string,
	publisherRegistered: boolean,
	error?: unknown
): string | null {
	if (error instanceof AgenticChatPublisherOverloadError) return error.assistantText;
	if (!publisherRegistered) return null;
	try {
		return publisher.getSnapshot(turnRunId).assistantText;
	} catch {
		return null;
	}
}

export function captureRuntimeTiming(
	tracker: AgenticChatRuntimeTimingTracker | null,
	capture: (tracker: AgenticChatRuntimeTimingTracker) => void
): void {
	if (!tracker) return;
	try {
		capture(tracker);
	} catch {
		// Timing capture must never overturn the provider or terminal result.
	}
}

type PrimedProviderStream<T> = {
	created: { ok: true } | { ok: false; error: unknown };
	stream: AsyncIterable<T>;
	cancel(): void;
};

/**
 * Create a provider stream and request its first step immediately, so the
 * provider's network work overlaps whatever the caller still has to finish.
 * Nothing the stream yields is observed until the caller iterates `stream`.
 * A failure creating the stream is reported through `created`; a failure
 * starting iteration surfaces on the first read, where the unprimed stream
 * would have raised it.
 */
export function primeProviderStream<T>(create: () => AsyncIterable<T>): PrimedProviderStream<T> {
	let source: AsyncIterable<T>;
	try {
		source = create();
	} catch (error) {
		const empty: AsyncIterable<T> = {
			[Symbol.asyncIterator]: () => ({
				next: () => Promise.reject(error)
			})
		};
		return { created: { ok: false, error }, stream: empty, cancel: () => undefined };
	}
	let iterator: AsyncIterator<T> | null = null;
	let first: Promise<IteratorResult<T>>;
	try {
		iterator = source[Symbol.asyncIterator]();
		first = iterator.next();
	} catch (error) {
		first = Promise.reject(error);
	}
	void first.catch(() => undefined);
	let firstConsumed = false;
	const primed = iterator;
	return {
		created: { ok: true },
		stream: {
			[Symbol.asyncIterator]: () => ({
				next: () => {
					if (!firstConsumed) {
						firstConsumed = true;
						return first;
					}
					return primed
						? primed.next()
						: Promise.resolve({ done: true, value: undefined } as IteratorResult<T>);
				},
				...(primed?.return
					? { return: (value?: unknown) => primed.return!(value as never) }
					: {})
			})
		},
		cancel: () => {
			if (!primed?.return) return;
			void Promise.resolve()
				.then(() => primed.return!())
				.catch(() => undefined);
		}
	};
}

export async function* iterateWithAbort<T>(
	source: AsyncIterable<T>,
	signal: AbortSignal
): AsyncGenerator<T> {
	const iterator = source[Symbol.asyncIterator]();
	try {
		while (true) {
			const next = await abortable(iterator.next(), signal);
			if (next.done) return;
			yield next.value;
		}
	} finally {
		if (iterator.return) void Promise.resolve(iterator.return()).catch(() => undefined);
	}
}

/**
 * Deliberately not `AbortSignal.any`: `dispose()` detaches from every source
 * when the turn ends, so a late job or cancellation abort never reaches the
 * signals detached effects still hold, and the combined signal aborts from
 * inside each source's listener order rather than at a different point.
 */
export function combineAbortSignals(signals: AbortSignal[]): {
	signal: AbortSignal;
	dispose(): void;
} {
	const controller = new AbortController();
	const listeners = new Map<AbortSignal, () => void>();
	for (const signal of signals) {
		const listener = () => {
			if (!controller.signal.aborted) controller.abort(signal.reason);
		};
		listeners.set(signal, listener);
		if (signal.aborted) listener();
		else signal.addEventListener('abort', listener, { once: true });
	}
	return {
		signal: controller.signal,
		dispose() {
			for (const [signal, listener] of listeners) {
				signal.removeEventListener('abort', listener);
			}
		}
	};
}

export function result(
	outcome: AgenticChatTurnExecutionOutcomeV1,
	turnRunId: string,
	executionGeneration: number | null,
	terminalStatus: ChatTurnTerminalStatusV1 | null = null,
	queueReconciled = false
): AgenticChatTurnExecutionResultV1 {
	return { outcome, turnRunId, executionGeneration, terminalStatus, queueReconciled };
}
