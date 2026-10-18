// apps/worker/src/workers/agentic-chat/effects/llm-call-incidents.ts
//
// Background writer for `llm_call_incidents` (provider/openrouter/call-capture.ts).
// Nothing awaits it: each write runs on its own, an update queues behind its row's
// insert, and memory is bounded. A failed or dropped write costs only the
// diagnosis, and its log line carries the error code, never the row's contents.
import type {
	LlmCallIncidentPatchV1,
	LlmCallIncidentRowV1,
	LlmCallIncidentSinkV1
} from '../provider/openrouter/call-capture';

type WriteResult = PromiseLike<{ error: { code?: string; message?: string } | null }>;
/** A PostgREST builder: awaitable, and cancellable through its signal. */
type Cancellable = WriteResult & { abortSignal(signal: AbortSignal): WriteResult };

/** The two table calls this writer makes (the service-role Supabase client). */
export type LlmCallIncidentClient = {
	from(table: 'llm_call_incidents'): {
		insert(row: LlmCallIncidentRowV1): Cancellable;
		update(patch: LlmCallIncidentPatchV1 & { updated_at: string }): {
			eq(column: 'id', value: string): Cancellable;
		};
	};
};

export const LLM_CALL_INCIDENT_WRITE_TIMEOUT_MS = 15_000;
/** Rows waiting to be written, across the process. A burst past it is dropped. */
export const LLM_CALL_INCIDENT_MAX_PENDING_BYTES = 32 * 1024 * 1024;
/** New rows per process per hour: an outage is diagnosed long before this, and the table stays small. */
export const LLM_CALL_INCIDENT_MAX_INSERTS_PER_HOUR = 200;

export class SupabaseLlmCallIncidentSink implements LlmCallIncidentSinkV1 {
	private readonly chains = new Map<string, Promise<void>>();
	private pendingBytes = 0;
	private dropped = 0;
	private readonly insertedAt: number[] = [];
	/** Rows not inserted (rate cap or memory bound); their updates are skipped too. */
	private readonly skipped = new Set<string>();

	constructor(
		private readonly client: LlmCallIncidentClient,
		private readonly options: {
			timeoutMs?: number;
			maxPendingBytes?: number;
			maxInsertsPerHour?: number;
			now?: () => number;
		} = {}
	) {}

	insert(row: LlmCallIncidentRowV1): void {
		const now = (this.options.now ?? Date.now)();
		while (this.insertedAt.length && this.insertedAt[0]! <= now - 3_600_000) {
			this.insertedAt.shift();
		}
		if (
			this.insertedAt.length >=
			(this.options.maxInsertsPerHour ?? LLM_CALL_INCIDENT_MAX_INSERTS_PER_HOUR)
		) {
			this.drop(row.id, 'hourly_cap');
			return;
		}
		if (
			!this.enqueue(row.id, approximateBytes(row), (signal) =>
				this.client.from('llm_call_incidents').insert(row).abortSignal(signal)
			)
		) {
			return;
		}
		this.insertedAt.push(now);
	}

	update(id: string, patch: LlmCallIncidentPatchV1): void {
		if (this.skipped.has(id)) return;
		this.enqueue(id, approximateBytes(patch), (signal) =>
			this.client
				.from('llm_call_incidents')
				.update({ ...patch, updated_at: new Date().toISOString() })
				.eq('id', id)
				.abortSignal(signal)
		);
	}

	/** Settles once every queued write has finished (tests and shutdown). */
	async flush(): Promise<void> {
		while (this.chains.size) await Promise.all([...this.chains.values()]);
	}

	private drop(id: string, why: 'hourly_cap' | 'queue_full'): void {
		this.dropped += 1;
		this.skipped.add(id);
		// Bounded: past this many the oldest skip is forgotten (its late update is a no-op anyway).
		if (this.skipped.size > 1_000) this.skipped.delete(this.skipped.values().next().value!);
		console.warn('[Agentic Chat] LLM call incident write dropped', {
			id,
			why,
			dropped: this.dropped
		});
	}

	/** False when the write was dropped. */
	private enqueue(
		id: string,
		bytes: number,
		write: (signal: AbortSignal) => WriteResult
	): boolean {
		const limit = this.options.maxPendingBytes ?? LLM_CALL_INCIDENT_MAX_PENDING_BYTES;
		if (this.pendingBytes + bytes > limit) {
			this.drop(id, 'queue_full');
			return false;
		}
		this.pendingBytes += bytes;
		const previous = this.chains.get(id) ?? Promise.resolve();
		const next: Promise<void> = previous
			.then(() => this.run(write))
			.catch((error: unknown) => this.report(id, error))
			.finally(() => {
				this.pendingBytes -= bytes;
				if (this.chains.get(id) === next) this.chains.delete(id);
			});
		this.chains.set(id, next);
		return true;
	}

	/**
	 * The deadline cancels the request itself, so a write is never still in flight
	 * when its bytes are released or when the next write for the same row starts.
	 */
	private async run(write: (signal: AbortSignal) => WriteResult): Promise<void> {
		const controller = new AbortController();
		const timer = setTimeout(
			() => controller.abort(),
			this.options.timeoutMs ?? LLM_CALL_INCIDENT_WRITE_TIMEOUT_MS
		);
		timer.unref?.();
		try {
			const { error } = await write(controller.signal);
			// Only the code travels on: a Postgres message can quote the row (the prompt).
			if (error || controller.signal.aborted) {
				throw Object.assign(new Error('LLM call incident write failed'), {
					code: controller.signal.aborted ? 'timeout' : (error?.code ?? 'unknown')
				});
			}
		} finally {
			clearTimeout(timer);
		}
	}

	private report(id: string, error: unknown): void {
		const code =
			error && typeof error === 'object' && 'code' in error
				? String((error as { code?: unknown }).code ?? '')
				: '';
		console.warn('[Agentic Chat] LLM call incident write failed', {
			id,
			code: code || 'unknown'
		});
	}
}

/** Peak memory of one write: the string, its JSON encoding, and the request buffer. */
function approximateBytes(value: object): number {
	let bytes = 0;
	for (const entry of Object.values(value)) {
		if (typeof entry === 'string') bytes += entry.length * 3;
		else if (entry && typeof entry === 'object') bytes += 16_384;
	}
	return bytes;
}
