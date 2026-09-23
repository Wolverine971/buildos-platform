// apps/web/src/lib/voice/transcription-queue.ts
//
// Transcribes recorded segments while the user keeps talking. Segments run
// with bounded concurrency, retry transient failures, and report outcomes by
// index so the session can assemble text in spoken order.

import { TranscriptionRequestError, type TranscriptResult } from './transcribe-client';

export interface QueuedSegment {
	index: number;
	blob: Blob;
	durationMs: number;
	/** Segments with no detectable speech are skipped (no request, no hallucinated text). */
	hasSpeech: boolean;
}

export type SegmentOutcome =
	| { index: number; status: 'done'; text: string; model: string | null }
	| { index: number; status: 'empty' }
	| { index: number; status: 'failed'; error: TranscriptionRequestError };

export interface TranscriptionQueueOptions {
	transcribe: (
		segment: QueuedSegment,
		options: { context: string; signal: AbortSignal }
	) => Promise<TranscriptResult>;
	/** Text to hand the model as context for this segment (usually the previous segment). */
	contextFor: (index: number) => string;
	onStart?: (index: number) => void;
	onOutcome: (outcome: SegmentOutcome) => void;
	concurrency?: number;
	maxAttempts?: number;
	backoffMs?: number[];
	sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

const DEFAULT_BACKOFF_MS = [700, 2_000];
const MAX_RETRY_AFTER_MS = 8_000;

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true }
		);
	});
}

export class TranscriptionQueue {
	#options: TranscriptionQueueOptions;
	#waiting: QueuedSegment[] = [];
	#active = 0;
	#unsettled = 0;
	#idleWaiters: Array<() => void> = [];
	#controller = new AbortController();

	constructor(options: TranscriptionQueueOptions) {
		this.#options = options;
	}

	get pending(): number {
		return this.#unsettled;
	}

	push(segment: QueuedSegment): void {
		if (this.#controller.signal.aborted) return;
		if (!segment.hasSpeech || segment.blob.size === 0) {
			this.#options.onOutcome({ index: segment.index, status: 'empty' });
			return;
		}
		this.#unsettled += 1;
		this.#waiting.push(segment);
		this.#pump();
	}

	/** Resolves once every pushed segment has an outcome. */
	settled(): Promise<void> {
		if (this.#unsettled === 0) return Promise.resolve();
		return new Promise((resolve) => this.#idleWaiters.push(resolve));
	}

	abort(): void {
		this.#controller.abort();
		this.#waiting = [];
		this.#unsettled = 0;
		this.#flushIdle();
	}

	#flushIdle() {
		if (this.#unsettled !== 0) return;
		const waiters = this.#idleWaiters;
		this.#idleWaiters = [];
		waiters.forEach((resolve) => resolve());
	}

	#pump() {
		const concurrency = this.#options.concurrency ?? 2;
		while (this.#active < concurrency && this.#waiting.length > 0) {
			// Lowest index first so earlier speech settles first.
			this.#waiting.sort((a, b) => a.index - b.index);
			const next = this.#waiting.shift();
			if (!next) return;
			this.#active += 1;
			void this.#run(next).finally(() => {
				this.#active -= 1;
				if (this.#controller.signal.aborted) return;
				this.#unsettled -= 1;
				this.#flushIdle();
				this.#pump();
			});
		}
	}

	async #run(segment: QueuedSegment): Promise<void> {
		const { signal } = this.#controller;
		const maxAttempts = this.#options.maxAttempts ?? 3;
		const backoff = this.#options.backoffMs ?? DEFAULT_BACKOFF_MS;
		const sleep = this.#options.sleep ?? defaultSleep;
		let lastError: TranscriptionRequestError | null = null;

		this.#options.onStart?.(segment.index);
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			if (signal.aborted) return;
			if (attempt > 0) {
				const base = backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 1_000;
				const wait = Math.min(
					MAX_RETRY_AFTER_MS,
					Math.max(base, lastError?.retryAfterMs ?? 0)
				);
				await sleep(wait, signal);
				if (signal.aborted) return;
			}
			try {
				const result = await this.#options.transcribe(segment, {
					context: this.#options.contextFor(segment.index),
					signal
				});
				if (signal.aborted) return;
				this.#options.onOutcome(
					result.text
						? {
								index: segment.index,
								status: 'done',
								text: result.text,
								model: result.model
							}
						: { index: segment.index, status: 'empty' }
				);
				return;
			} catch (error) {
				if (signal.aborted) return;
				lastError =
					error instanceof TranscriptionRequestError
						? error
						: new TranscriptionRequestError(
								error instanceof Error ? error.message : 'Transcription failed',
								{ retryable: true }
							);
				if (!lastError.retryable) break;
			}
		}
		if (signal.aborted || !lastError) return;
		this.#options.onOutcome({ index: segment.index, status: 'failed', error: lastError });
	}
}
