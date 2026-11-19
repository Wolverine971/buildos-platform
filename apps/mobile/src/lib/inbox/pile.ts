// apps/mobile/src/lib/inbox/pile.ts
//
// The cleared pile (the web's inbox-cleared-pile store): an answer leaves its card at once and
// waits here for HOLD_MS with Undo. Undo while it waits sends nothing. When the hold runs out
// it saves in the background:
//   - cleanup answers for one project merge into one POST (≤ 40 decisions, whole answers),
//   - check-in answers merge into one POST (≤ 60 answers),
//   - anything else (decide, snooze, email updates) runs on its own.
// One project's saves run one at a time, in order. A failed save hands the caller the reason so
// the item can come back on its card. Pure TypeScript with injectable timers, so it is tested
// without React; the module-level instance outlives the inbox screen.
import type {
	CheckInAnswer,
	CheckInAnswerResult,
	CleanupDecideResponse,
	CleanupDecisionRequest,
	CleanupOutcomeResponse,
	CheckInAnswersResponse
} from '@buildos/api-client';

export const PILE_HOLD_MS = 5000;
/** A settled entry leaves the pile this long after it lands. */
export const PILE_LINGER_MS = 4000;
export const MAX_CLEANUP_DECISIONS = 40;
export const MAX_CHECK_IN_ANSWERS = 60;

export type PileJob =
	| { kind: 'cleanup'; projectId: string; decisions: CleanupDecisionRequest[] }
	| { kind: 'check_in'; answers: CheckInAnswer[] }
	| { kind: 'call'; run: () => Promise<void> };

export type PileOutcome =
	| { ok: true; cleanup?: CleanupOutcomeResponse[]; checkIns?: CheckInAnswerResult[] }
	| { ok: false; error: string };

export type PileStatus = 'holding' | 'queued' | 'saving' | 'done' | 'failed';

export type PileEntry = {
	id: string;
	/** What was answered, e.g. the item's title. */
	title: string;
	/** The answer, e.g. "Applied", "Not needed". */
	label: string;
	status: PileStatus;
	heldUntil: number;
	message: string | null;
};

export type PileInput = {
	title: string;
	label: string;
	job: PileJob;
	/** Called once with what the save did (not called after Undo). */
	onResult?: (outcome: PileOutcome) => void;
	/** Called when Undo takes the answer back before it saved. */
	onUndo?: () => void;
};

export type PileDeps = {
	sendCleanup: (
		projectId: string,
		decisions: CleanupDecisionRequest[]
	) => Promise<CleanupDecideResponse>;
	sendCheckIns: (answers: CheckInAnswer[]) => Promise<CheckInAnswersResponse>;
	holdMs?: number;
	lingerMs?: number;
	now?: () => number;
	setTimer?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (handle: unknown) => void;
};

type Internal = PileEntry & {
	job: PileJob;
	onResult?: (outcome: PileOutcome) => void;
	onUndo?: () => void;
	timer: unknown;
};

export type Pile = ReturnType<typeof createPile>;

function laneOf(job: PileJob, id: string): string {
	if (job.kind === 'cleanup') return `cleanup:${job.projectId}`;
	if (job.kind === 'check_in') return 'check_in';
	return `call:${id}`;
}

function sizeOf(job: PileJob): number {
	if (job.kind === 'cleanup') return job.decisions.length;
	if (job.kind === 'check_in') return job.answers.length;
	return 1;
}

/** Whole entries per request, in order, so one answer's rows never split across two saves. */
export function chunkEntries<T>(entries: T[], size: (entry: T) => number, max: number): T[][] {
	const chunks: T[][] = [];
	let current: T[] = [];
	let count = 0;
	for (const entry of entries) {
		const n = size(entry);
		if (current.length && count + n > max) {
			chunks.push(current);
			current = [];
			count = 0;
		}
		current.push(entry);
		count += n;
	}
	if (current.length) chunks.push(current);
	return chunks;
}

function errorText(error: unknown): string {
	if (error instanceof Error && error.message.trim()) return error.message.trim();
	return 'Could not save this.';
}

export function createPile(deps: PileDeps) {
	const holdMs = deps.holdMs ?? PILE_HOLD_MS;
	const lingerMs = deps.lingerMs ?? PILE_LINGER_MS;
	const now = deps.now ?? Date.now;
	const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
	const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle as never));

	let entries: Internal[] = [];
	let snapshot: PileEntry[] = [];
	let counter = 0;
	const busy = new Set<string>();
	const listeners = new Set<() => void>();

	function emit() {
		snapshot = entries.map(({ id, title, label, status, heldUntil, message }) => ({
			id,
			title,
			label,
			status,
			heldUntil,
			message
		}));
		for (const listener of listeners) listener();
	}

	function settle(entry: Internal, outcome: PileOutcome) {
		entry.status = outcome.ok ? 'done' : 'failed';
		entry.message = outcome.ok ? null : outcome.error;
		entry.onResult?.(outcome);
		entry.timer = setTimer(() => {
			entries = entries.filter((candidate) => candidate !== entry);
			emit();
		}, lingerMs);
	}

	async function runChunk(chunk: Internal[]) {
		const head = chunk[0]!.job;
		try {
			if (head.kind === 'cleanup') {
				const decisions = chunk.flatMap((entry) =>
					entry.job.kind === 'cleanup' ? entry.job.decisions : []
				);
				const response = await deps.sendCleanup(head.projectId, decisions);
				for (const entry of chunk) {
					const mine = new Set(
						entry.job.kind === 'cleanup'
							? entry.job.decisions.map((decision) => decision.suggestion_id)
							: []
					);
					settle(entry, {
						ok: true,
						cleanup: (response.outcomes ?? []).filter((outcome) =>
							mine.has(outcome.suggestion_id)
						)
					});
				}
			} else if (head.kind === 'check_in') {
				const answers = chunk.flatMap((entry) =>
					entry.job.kind === 'check_in' ? entry.job.answers : []
				);
				const response = await deps.sendCheckIns(answers);
				let offset = 0;
				for (const entry of chunk) {
					const n = sizeOf(entry.job);
					// The route answers in request order.
					const results = (response.results ?? []).slice(offset, offset + n);
					offset += n;
					const failed = results.find((result) => !result.ok);
					settle(
						entry,
						failed && !failed.ok
							? { ok: false, error: failed.error || 'Could not save this.' }
							: { ok: true, checkIns: results }
					);
				}
			} else {
				await head.run();
				settle(chunk[0]!, { ok: true });
			}
		} catch (error) {
			for (const entry of chunk) settle(entry, { ok: false, error: errorText(error) });
		}
	}

	async function drain(lane: string) {
		if (busy.has(lane)) return;
		busy.add(lane);
		try {
			// Answers released in the same tick (Apply all, flushAll) go out as one request.
			await Promise.resolve();
			for (;;) {
				const queued = entries.filter(
					(entry) => entry.status === 'queued' && laneOf(entry.job, entry.id) === lane
				);
				if (!queued.length) break;
				const max =
					queued[0]!.job.kind === 'cleanup'
						? MAX_CLEANUP_DECISIONS
						: queued[0]!.job.kind === 'check_in'
							? MAX_CHECK_IN_ANSWERS
							: 1;
				const chunk = chunkEntries(queued, (entry) => sizeOf(entry.job), max)[0]!;
				for (const entry of chunk) entry.status = 'saving';
				emit();
				await runChunk(chunk);
				emit();
			}
		} finally {
			busy.delete(lane);
		}
	}

	function release(entry: Internal) {
		if (entry.status !== 'holding') return;
		clearTimer(entry.timer);
		entry.timer = null;
		entry.status = 'queued';
		void drain(laneOf(entry.job, entry.id));
	}

	return {
		add(input: PileInput): string {
			counter += 1;
			const id = `pile-${counter}`;
			const entry: Internal = {
				id,
				title: input.title,
				label: input.label,
				status: 'holding',
				heldUntil: now() + holdMs,
				message: null,
				job: input.job,
				onResult: input.onResult,
				onUndo: input.onUndo,
				timer: null
			};
			entry.timer = setTimer(() => {
				release(entry);
				emit();
			}, holdMs);
			entries = [...entries, entry];
			emit();
			return id;
		},

		/** Takes an answer back while it waits. False once it has started saving. */
		undo(id: string): boolean {
			const entry = entries.find((candidate) => candidate.id === id);
			if (!entry || entry.status !== 'holding') return false;
			clearTimer(entry.timer);
			entries = entries.filter((candidate) => candidate !== entry);
			entry.onUndo?.();
			emit();
			return true;
		},

		/** Undo the newest answer still waiting; returns its id. */
		undoLatest(): string | null {
			const latest = [...entries].reverse().find((entry) => entry.status === 'holding');
			return latest && this.undo(latest.id) ? latest.id : null;
		},

		/** Save everything still waiting now (the app went to the background). */
		flushAll() {
			const holding = entries.filter((entry) => entry.status === 'holding');
			for (const entry of holding) release(entry);
			if (holding.length) emit();
		},

		snapshot: () => snapshot,

		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}
	};
}
