// apps/mobile/src/lib/capture-queue.ts
import type {
	CaptureSortInput,
	CaptureSortReceipt,
	CaptureSortResult,
	WorkspaceCaptureInput,
	WorkspaceCaptureResponse
} from '@buildos/api-client';
import { isBuildOsApiError } from '@buildos/api-client';

/**
 * Offline-first capture. A typed jot or a voice recording is written to the phone before
 * anything is sent, so a capture is never lost to a bad connection. Each one then walks
 * the same path as the web capture box:
 *
 *   voice:  transcribe ─┐
 *   typed:  ────────────┴─► save to the Workspace (as a note) ─► sort (tasks, notes, project)
 *
 * Progress is persisted after every step, so a retry resumes where it stopped and never
 * pays for a transcription twice. One idempotency key (the item id) covers the item's whole
 * life: the server returns the already-saved note on a retry instead of a second copy, and
 * a repeated sort answers `skipped`.
 *
 * Draining is sequential and stops at the first sign the network or the session is the
 * problem (offline, signed out, server trouble); those items stay `pending`. An item the
 * server refuses outright, or one that keeps failing on the server, becomes `failed` so one
 * bad capture never blocks the rest; it keeps its audio until the person retries or
 * discards it. Sorting is a bonus: once the note is saved, a sort that cannot run is
 * dropped and the note simply stays a note.
 */

/** `task` exists only for items saved by the first build, which had a Note/Task picker. */
export type CaptureKind = 'note' | 'task' | 'voice';

export type CaptureAudio = {
	/** Path under the app's documents folder (absolute `file:` URIs from older items also work). */
	path: string;
	duration_ms: number;
	mime_type: string;
};

export type PendingCapture = {
	/** Local id and the server idempotency key; stable across retries. */
	id: string;
	kind: CaptureKind;
	/** What was typed, or the transcript once a recording has been transcribed. */
	text: string;
	audio: CaptureAudio | null;
	/** Set once the note is saved; the item then only waits to be sorted. */
	document_id: string | null;
	created_at: string;
	attempts: number;
	/** Server failures in a row on the current step; resets when a step succeeds. */
	failures: number;
	last_error: string | null;
	/** `failed` = needs a person (Try again or Discard), not a background retry. */
	state: 'pending' | 'failed';
};

export type CaptureStage = 'transcribe' | 'save' | 'sort';

export type DrainStop = 'offline' | 'unauthorized' | 'server';

/** A sorted capture with something to say, kept in memory for the Undo line. */
export type SortedCapture = {
	id: string;
	kind: CaptureKind;
	lines: string[];
	outcome: CaptureSortResult['outcome'];
	receipt: CaptureSortReceipt | null;
	at: string;
};

export type DrainResult = {
	saved: Array<{ capture: PendingCapture; response: WorkspaceCaptureResponse }>;
	sorted: SortedCapture[];
	failed: PendingCapture[];
	/** Why draining stopped early, or null when every pending item was attempted. */
	stopped: DrainStop | null;
	remaining: number;
};

/** An in-flight drain during a dev update may finish with an earlier result shape. */
export function shouldRefreshToday(result: Partial<DrainResult> | null | undefined): boolean {
	return Boolean(
		result?.sorted?.length || result?.saved?.some((entry) => entry.capture.kind === 'task')
	);
}

/**
 * True only the first time a drain result is seen. Every screen with a capture box drains on
 * mount and on foreground, and they share one drain (and so one result object); the refreshes
 * after it should run once, not once per screen, each cancelling the last.
 */
export function createDrainClaim(): (result: object | null | undefined) => boolean {
	const seen = new WeakSet<object>();
	return (result) => {
		if (!result || seen.has(result)) return false;
		seen.add(result);
		return true;
	};
}

/** What subscribers see. Stable between changes, so it suits `useSyncExternalStore`. */
export type QueueSnapshot = {
	items: readonly PendingCapture[];
	/** Why the last drain stopped; null once one gets through. */
	lastStop: DrainStop | null;
	/** The item being worked on right now and its step. */
	active: { id: string; stage: CaptureStage } | null;
	/** Newest first, at most `MAX_SORTED`. */
	sorted: readonly SortedCapture[];
};

export type KeyStore = {
	getItem: (key: string) => Promise<string | null>;
	setItem: (key: string, value: string) => Promise<void>;
	removeItem: (key: string) => Promise<void>;
};

export type CaptureQueueOptions = {
	store: KeyStore;
	/** Storage key; include the user id so accounts never see each other's captures. */
	key: string;
	/** Returns the transcript; an empty string means no speech was heard. */
	transcribe: (audio: CaptureAudio) => Promise<string>;
	save: (input: WorkspaceCaptureInput) => Promise<WorkspaceCaptureResponse>;
	sort: (input: CaptureSortInput) => Promise<CaptureSortResult>;
	/** Deletes a recording from the phone once its words are saved or it is discarded. */
	discardAudio?: (audio: CaptureAudio) => Promise<void> | void;
	/** Sent as the capture `source` (≤ 40 chars), e.g. `ios`; voice adds `_voice`. */
	source?: string;
	now?: () => Date;
	makeId?: () => string;
};

/** A capture that fails on the server this many times in a row waits for a person. */
export const MAX_SERVER_FAILURES = 3;
export const MAX_SORTED = 3;

type PersistedV1 = {
	v: 1;
	items: Array<
		Pick<PendingCapture, 'id' | 'text' | 'created_at' | 'attempts'> & {
			kind: 'note' | 'task';
			last_error: string | null;
			state: 'pending' | 'failed';
		}
	>;
};
type Persisted = { v: 2; items: PendingCapture[] };

const EMPTY_ITEMS: readonly PendingCapture[] = Object.freeze([]);
const EMPTY_SORTED: readonly SortedCapture[] = Object.freeze([]);

/** `cap_<time36>_<random>`: 8–120 chars as the server requires, unique enough per device. */
export function makeCaptureId(now: number = Date.now()): string {
	const rand = () => Math.random().toString(36).slice(2, 10);
	return `cap_${now.toString(36)}_${rand()}${rand()}`;
}

export function stageOf(item: Pick<PendingCapture, 'kind' | 'text' | 'document_id'>): CaptureStage {
	if (item.document_id) return 'sort';
	if (item.kind === 'voice' && !item.text) return 'transcribe';
	return 'save';
}

/**
 * Thrown for a capture that can never go through as it stands (its recording is gone), so it
 * goes straight to "needs you" instead of holding the queue for three retries.
 */
export class CaptureRejectedError extends Error {
	constructor(message: string) {
		super(message);
		Object.setPrototypeOf(this, new.target.prototype);
		this.name = 'CaptureRejectedError';
	}
}

export function classifyCaptureError(error: unknown): DrainStop | 'rejected' {
	if (error instanceof CaptureRejectedError) return 'rejected';
	if (isBuildOsApiError(error)) {
		if (error.isNetworkError) return 'offline';
		if (error.isUnauthorized()) return 'unauthorized';
		if (error.status >= 500 || error.status === 429 || error.status === 408) return 'server';
		return 'rejected';
	}
	// An unexpected throw (a bug, an aborted request) must never discard a capture.
	return 'server';
}

function describe(error: unknown): string {
	if (isBuildOsApiError(error)) {
		if (error.isNetworkError) return 'No connection';
		if (error.isUnauthorized()) return 'Signed out';
		return error.message;
	}
	return error instanceof Error ? error.message : 'Could not send';
}

function isCapture(item: unknown): item is PendingCapture {
	const candidate = item as Partial<PendingCapture> | null;
	return (
		!!candidate &&
		typeof candidate.id === 'string' &&
		typeof candidate.text === 'string' &&
		(candidate.kind === 'note' || candidate.kind === 'task' || candidate.kind === 'voice') &&
		(candidate.kind !== 'voice' || !!candidate.text || !!candidate.audio?.path)
	);
}

/** Reads what an earlier build wrote; unknown shapes read as empty. */
export function parsePersisted(raw: string | null): PendingCapture[] {
	if (!raw) return [];
	const parsed = JSON.parse(raw) as Partial<Persisted> | Partial<PersistedV1>;
	if (!Array.isArray(parsed?.items)) return [];
	if (parsed.v === 2) {
		return (parsed.items as unknown[]).filter(isCapture).map((item) => ({
			...item,
			audio: item.audio ?? null,
			document_id: item.document_id ?? null,
			attempts: item.attempts ?? 0,
			failures: item.failures ?? 0,
			last_error: item.last_error ?? null,
			state: item.state === 'failed' ? 'failed' : 'pending'
		}));
	}
	if (parsed.v === 1) {
		return (parsed.items as unknown[])
			.map((item) => {
				const old = item as PersistedV1['items'][number];
				return {
					id: old?.id,
					kind: old?.kind,
					text: old?.text,
					audio: null,
					document_id: null,
					created_at: old?.created_at ?? new Date(0).toISOString(),
					attempts: old?.attempts ?? 0,
					failures: 0,
					last_error: old?.last_error ?? null,
					state: old?.state === 'failed' ? 'failed' : 'pending'
				} as PendingCapture;
			})
			.filter(isCapture);
	}
	return [];
}

/** `deferred`: left for a later drain without holding up the captures behind it. */
function fileNameOf(path: string): string {
	return path.split('/').pop() ?? '';
}

type Advance = 'done' | 'failed' | 'deferred' | DrainStop;

export function createCaptureQueue(options: CaptureQueueOptions) {
	const now = options.now ?? (() => new Date());
	const makeId = options.makeId ?? (() => makeCaptureId(now().getTime()));
	const listeners = new Set<(snapshot: QueueSnapshot) => void>();
	const sourceFor = (kind: CaptureKind) =>
		options.source && kind === 'voice'
			? `${options.source}_voice`.slice(0, 40)
			: options.source;

	let items: readonly PendingCapture[] = EMPTY_ITEMS;
	let lastStop: DrainStop | null = null;
	let active: QueueSnapshot['active'] = null;
	let sorted: readonly SortedCapture[] = EMPTY_SORTED;
	let snapshot: QueueSnapshot = { items, lastStop, active, sorted };
	let loaded: Promise<void> | null = null;
	let draining: Promise<DrainResult> | null = null;
	let adopting: Promise<unknown> = Promise.resolve();

	const emit = () => {
		snapshot = { items, lastStop, active, sorted };
		for (const listener of listeners) listener(snapshot);
	};

	const persist = async (next: readonly PendingCapture[]) => {
		items = next;
		const payload: Persisted = { v: 2, items: [...next] };
		if (next.length === 0) await options.store.removeItem(options.key);
		else await options.store.setItem(options.key, JSON.stringify(payload));
		emit();
	};

	const load = (): Promise<void> => {
		if (!loaded) {
			loaded = options.store.getItem(options.key).then(
				(raw) => {
					let parsed: PendingCapture[] = [];
					try {
						parsed = parsePersisted(raw);
					} catch {
						// Garbage (not a read failure): start over; the next write replaces it.
					}
					if (parsed.length) {
						items = parsed;
						emit();
					}
				},
				(error: unknown) => {
					// The keychain could not be read. What is stored may still be fine, so
					// never write over it: fail this call and read again next time.
					loaded = null;
					throw error;
				}
			);
		}
		return loaded;
	};

	const find = (id: string) => items.find((item) => item.id === id);

	const update = async (id: string, patch: Partial<PendingCapture>) => {
		await persist(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
		return find(id);
	};

	const drop = (id: string) => persist(items.filter((item) => item.id !== id));

	const releaseAudio = async (audio: CaptureAudio | null) => {
		if (!audio || !options.discardAudio) return;
		try {
			await options.discardAudio(audio);
		} catch {
			// A leftover file is harmless; never let cleanup fail a capture.
		}
	};

	const setActive = (next: QueueSnapshot['active']) => {
		active = next;
		emit();
	};

	/** Something got through: stop saying "waiting for a connection" while the rest send. */
	const clearStop = () => {
		if (lastStop === null) return;
		lastStop = null;
		emit();
	};

	/** Runs one item through its remaining steps until it is done, needs a person, or must wait. */
	const advance = async (start: PendingCapture, result: DrainResult): Promise<Advance> => {
		let item = start;
		for (;;) {
			const stage = stageOf(item);
			setActive({ id: item.id, stage });
			try {
				if (stage === 'transcribe') {
					if (!item.audio) throw new CaptureRejectedError('The recording is missing.');
					const transcript = (await options.transcribe(item.audio)).trim();
					if (!transcript) {
						const failed = await update(item.id, {
							attempts: item.attempts + 1,
							failures: 0,
							last_error: 'No speech was heard in this recording.',
							state: 'failed'
						});
						if (failed) result.failed.push(failed);
						return 'failed';
					}
					clearStop();
					const next = await update(item.id, {
						text: transcript,
						failures: 0,
						last_error: null
					});
					if (!next) return 'done'; // discarded while it was being transcribed
					item = next;
					continue;
				}

				if (stage === 'save') {
					const response = await options.save({
						kind: item.kind === 'task' ? 'task' : 'note',
						text: item.text,
						source: sourceFor(item.kind),
						idempotency_key: item.id
					});
					result.saved.push({ capture: item, response });
					clearStop();
					// The words are on the server now; the recording has done its job.
					await releaseAudio(item.audio);
					const sortable =
						item.kind !== 'task' &&
						response.item.entity === 'document' &&
						response.item.kind === 'note';
					if (!sortable) {
						await drop(item.id);
						return 'done';
					}
					const next = await update(item.id, {
						document_id: response.item.id,
						audio: null,
						failures: 0,
						last_error: null
					});
					if (!next) return 'done';
					item = next;
					continue;
				}

				const sortResult = await options.sort({
					document_id: item.document_id as string,
					source: sourceFor(item.kind)
				});
				clearStop();
				await drop(item.id);
				if (sortResult.lines.length > 0) {
					const entry: SortedCapture = {
						id: item.id,
						kind: item.kind,
						lines: sortResult.lines,
						outcome: sortResult.outcome,
						receipt: sortResult.receipt,
						at: now().toISOString()
					};
					sorted = [entry, ...sorted.filter((s) => s.id !== entry.id)].slice(
						0,
						MAX_SORTED
					);
					result.sorted.push(entry);
					emit();
				}
				return 'done';
			} catch (error) {
				// Discarded while its request was in flight: nothing left to retry.
				if (!find(item.id)) return 'done';
				const outcome = classifyCaptureError(error);
				const attempts = item.attempts + 1;

				if (stage === 'sort') {
					// The note is saved. Wait for a connection, but never hold a capture for a sort.
					if (outcome === 'offline' || outcome === 'unauthorized') {
						await update(item.id, { attempts, last_error: describe(error) });
						return outcome;
					}
					if (outcome === 'server' && item.failures + 1 < MAX_SERVER_FAILURES) {
						await update(item.id, {
							attempts,
							failures: item.failures + 1,
							last_error: describe(error)
						});
						return 'deferred';
					}
					await drop(item.id);
					return 'done';
				}

				const failures = outcome === 'server' ? item.failures + 1 : item.failures;
				if (outcome === 'rejected' || failures >= MAX_SERVER_FAILURES) {
					const failed = await update(item.id, {
						attempts,
						failures,
						last_error: describe(error),
						state: 'failed'
					});
					if (failed) result.failed.push(failed);
					return 'failed';
				}
				await update(item.id, { attempts, failures, last_error: describe(error) });
				return outcome;
			}
		}
	};

	const drainNow = async (): Promise<DrainResult> => {
		const result: DrainResult = {
			saved: [],
			sorted: [],
			failed: [],
			stopped: null,
			remaining: 0
		};
		try {
			await load();
		} catch {
			// Storage unreadable right now; try again on the next drain.
			result.stopped = 'server';
			lastStop = 'server';
			emit();
			return result;
		}

		// Re-read the list each round so a capture added while this drain runs is sent too.
		const attempted = new Set<string>();
		try {
			for (;;) {
				const item = items.find(
					(candidate) => candidate.state === 'pending' && !attempted.has(candidate.id)
				);
				if (!item) break;
				attempted.add(item.id);
				const outcome = await advance(item, result);
				if (outcome !== 'done' && outcome !== 'failed' && outcome !== 'deferred') {
					result.stopped = outcome;
					break;
				}
			}
		} finally {
			active = null;
			lastStop = result.stopped;
			emit();
		}

		result.remaining = items.filter((item) => item.state === 'pending').length;
		return result;
	};

	const add = async (
		item: Omit<
			PendingCapture,
			'id' | 'created_at' | 'attempts' | 'failures' | 'last_error' | 'state' | 'document_id'
		>
	) => {
		await load();
		const capture: PendingCapture = {
			id: makeId(),
			created_at: now().toISOString(),
			attempts: 0,
			failures: 0,
			last_error: null,
			state: 'pending',
			document_id: null,
			...item
		};
		await persist([...items, capture]);
		return capture;
	};

	return {
		load,
		list: () => items,
		snapshot: () => snapshot,
		subscribe(listener: (snapshot: QueueSnapshot) => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		/** Persists first; call `drain()` after to try sending right away. */
		async enqueueText(text: string): Promise<PendingCapture> {
			const trimmed = text.trim();
			if (!trimmed) throw new Error('Nothing to capture.');
			return add({ kind: 'note', text: trimmed, audio: null });
		},
		/** The recording must already sit in the app's documents folder. */
		async enqueueVoice(audio: CaptureAudio): Promise<PendingCapture> {
			if (!audio.path) throw new Error('The recording is missing.');
			return add({ kind: 'voice', text: '', audio });
		},
		/**
		 * Re-queues recordings found on the phone that no capture points at: the app was closed
		 * between stop and save, or the screen went away mid-recording. Matched by file name, so
		 * the same file is never queued twice. Runs one call at a time.
		 */
		adoptRecordings(found: CaptureAudio[]): Promise<PendingCapture[]> {
			const run = async () => {
				await load();
				const known = new Set(
					items.flatMap((item) => (item.audio ? [fileNameOf(item.audio.path)] : []))
				);
				const adopted: PendingCapture[] = [];
				for (const audio of found) {
					const name = fileNameOf(audio.path);
					if (!name || known.has(name)) continue;
					known.add(name);
					adopted.push(await add({ kind: 'voice', text: '', audio }));
				}
				return adopted;
			};
			const next = adopting.then(run, run);
			adopting = next.catch(() => undefined);
			return next;
		},
		/** One drain at a time; a second call while one runs shares its result. */
		drain(): Promise<DrainResult> {
			if (!draining) {
				draining = drainNow().finally(() => {
					draining = null;
				});
			}
			return draining;
		},
		async retry(id: string) {
			await load();
			await update(id, { state: 'pending', failures: 0, last_error: null });
		},
		async retryAll() {
			await load();
			await persist(
				items.map((item) =>
					item.state === 'failed'
						? { ...item, state: 'pending', failures: 0, last_error: null }
						: item
				)
			);
		},
		/** Lets go of a capture for good, recording included. */
		async remove(id: string) {
			await load();
			const item = find(id);
			await drop(id);
			await releaseAudio(item?.audio ?? null);
		},
		/** Hides a sorted result (after Undo, or when the person dismisses it). */
		dismissSorted(id: string) {
			if (!sorted.some((entry) => entry.id === id)) return;
			sorted = sorted.filter((entry) => entry.id !== id);
			emit();
		}
	};
}

export type CaptureQueue = ReturnType<typeof createCaptureQueue>;
