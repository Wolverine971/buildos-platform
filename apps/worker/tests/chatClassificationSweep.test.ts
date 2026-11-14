// apps/worker/tests/chatClassificationSweep.test.ts
//
// The server-side sweep that queues 'classify_chat_session' for idle chats: which
// sessions it selects, its per-tick cap, and when it leaves a session alone. A small
// in-memory fake applies the same filters PostgREST would: no database, no model.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	CLASSIFICATION_SWEEP_MAX_PER_TICK,
	type ClassificationSweepSession,
	chatClassificationSweepEnabled,
	classificationDue,
	classificationHandledByJob,
	classifySessionDedupKey,
	enqueueChatSessionClassification,
	sweepChatClassifications
} from '../src/workers/chat/classificationSweep';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const daysAgo = (days: number) => minutesAgo(days * 24 * 60);

type SessionRow = ClassificationSweepSession & {
	context_type: string;
	message_count: number | null;
};

type JobRow = {
	job_type: string;
	dedup_key: string | null;
	status: string;
	started_at: string | null;
	updated_at: string | null;
	created_at: string;
};

function session(over: Partial<SessionRow> & { id: string }): SessionRow {
	return {
		user_id: 'user-1',
		context_type: 'global',
		message_count: 2,
		last_message_at: minutesAgo(30),
		last_classified_at: null,
		...over
	};
}

function job(sessionId: string, over: Partial<JobRow> = {}): JobRow {
	return {
		job_type: 'classify_chat_session',
		dedup_key: classifySessionDedupKey(sessionId),
		status: 'pending',
		started_at: null,
		updated_at: NOW.toISOString(),
		created_at: NOW.toISOString(),
		...over
	};
}

type Filter = { method: string; args: unknown[] };
type Row = Record<string, unknown>;

/** Numbers compare as numbers, everything else as timestamps (the only two kinds filtered here). */
function compare(left: unknown, right: unknown): number {
	if (typeof left === 'number' && typeof right === 'number') return left - right;
	return Date.parse(String(left)) - Date.parse(String(right));
}

function applyFilters(rows: Row[], filters: Filter[]): Row[] {
	let out = [...rows];
	for (const { method, args } of filters) {
		const column = args[0] as string;
		if (method === 'eq') out = out.filter((row) => row[column] === args[1]);
		else if (method === 'gt')
			out = out.filter(
				(row) =>
					row[column] !== null &&
					row[column] !== undefined &&
					compare(row[column], args[1]) > 0
			);
		else if (method === 'gte')
			out = out.filter(
				(row) =>
					row[column] !== null &&
					row[column] !== undefined &&
					compare(row[column], args[1]) >= 0
			);
		else if (method === 'lte')
			out = out.filter(
				(row) =>
					row[column] !== null &&
					row[column] !== undefined &&
					compare(row[column], args[1]) <= 0
			);
		else if (method === 'is') out = out.filter((row) => row[column] === args[1]);
		else if (method === 'not') out = out.filter((row) => row[column] !== args[2]);
		else if (method === 'in')
			out = out.filter((row) => (args[1] as unknown[]).includes(row[column]));
		else if (method === 'order') {
			const ascending = (args[1] as { ascending?: boolean } | undefined)?.ascending !== false;
			out.sort((a, b) => compare(a[column], b[column]) * (ascending ? 1 : -1));
		} else if (method === 'limit') out = out.slice(0, args[0] as number);
		else if (method !== 'select') throw new Error(`Unexpected query method: ${method}`);
	}
	return out;
}

function fakeDb(tables: { chat_sessions: SessionRow[]; queue_jobs: JobRow[] }) {
	const queries: Array<{ table: string; filters: Filter[] }> = [];
	const db = {
		from(table: keyof typeof tables) {
			const filters: Filter[] = [];
			queries.push({ table, filters });
			const builder: Record<string, unknown> = {};
			for (const method of [
				'select',
				'eq',
				'gt',
				'gte',
				'lte',
				'is',
				'not',
				'in',
				'order',
				'limit'
			]) {
				builder[method] = (...args: unknown[]) => {
					filters.push({ method, args });
					return builder;
				};
			}
			builder.then = (
				resolve: (value: unknown) => unknown,
				reject?: (reason: unknown) => unknown
			) =>
				Promise.resolve({
					data: applyFilters(tables[table] as Row[], filters),
					error: null
				}).then(resolve, reject);
			return builder;
		}
	};
	return { db: db as never, queries };
}

/** Runs one tick. Queued sessions get a pending job, as add_queue_job would leave behind. */
async function tick(tables: { chat_sessions: SessionRow[]; queue_jobs: JobRow[] }) {
	const { db, queries } = fakeDb(tables);
	const queued: string[] = [];
	const result = await sweepChatClassifications({
		db,
		now: NOW,
		enqueue: ({ sessionId }) => {
			queued.push(sessionId);
			tables.queue_jobs.push(job(sessionId));
			return Promise.resolve();
		}
	});
	return { result, queued, queries };
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('classificationDue', () => {
	it('needs ten quiet minutes, inside the 30-day lookback', () => {
		expect(classificationDue(session({ id: 's', last_message_at: minutesAgo(10) }), NOW)).toBe(
			true
		);
		expect(classificationDue(session({ id: 's', last_message_at: minutesAgo(9) }), NOW)).toBe(
			false
		);
		expect(classificationDue(session({ id: 's', last_message_at: daysAgo(29) }), NOW)).toBe(
			true
		);
		expect(classificationDue(session({ id: 's', last_message_at: daysAgo(31) }), NOW)).toBe(
			false
		);
		expect(classificationDue(session({ id: 's', last_message_at: null }), NOW)).toBe(false);
	});

	it('is due when never classified or when messages arrived after the last classification', () => {
		const at = minutesAgo(30);
		expect(
			classificationDue(
				session({ id: 's', last_message_at: at, last_classified_at: null }),
				NOW
			)
		).toBe(true);
		expect(
			classificationDue(
				session({ id: 's', last_message_at: at, last_classified_at: minutesAgo(90) }),
				NOW
			)
		).toBe(true);
		// Classified through its last message: nothing new. Postgres and JS print the same
		// instant differently, so this must not be a string comparison.
		expect(
			classificationDue(
				session({
					id: 's',
					last_message_at: '2026-11-14T11:30:00+00:00',
					last_classified_at: '2026-11-14T11:30:00.000Z'
				}),
				NOW
			)
		).toBe(false);
		expect(
			classificationDue(
				session({ id: 's', last_message_at: at, last_classified_at: minutesAgo(20) }),
				NOW
			)
		).toBe(false);
	});
});

describe('classificationHandledByJob', () => {
	const quiet = session({ id: 's', last_message_at: minutesAgo(60) });

	it('waits for a queued or running job', () => {
		for (const status of ['pending', 'processing', 'retrying']) {
			expect(classificationHandledByJob(quiet, [job('s', { status })])).toBe(true);
		}
	});

	it('stays away after a job that started since the last message finished, either way', () => {
		for (const status of ['failed', 'completed']) {
			expect(
				classificationHandledByJob(quiet, [
					job('s', { status, started_at: minutesAgo(50) })
				])
			).toBe(true);
			// That job ran before the newest message, so it never saw it.
			expect(
				classificationHandledByJob(quiet, [
					job('s', { status, started_at: minutesAgo(70) })
				])
			).toBe(false);
		}
	});

	it('ignores cancelled jobs and sessions with no job', () => {
		expect(classificationHandledByJob(quiet, [])).toBe(false);
		expect(
			classificationHandledByJob(quiet, [
				job('s', { status: 'cancelled', started_at: minutesAgo(50) })
			])
		).toBe(false);
	});
});

describe('sweepChatClassifications', () => {
	it('queues idle chats of any context type that are untitled or have new messages', async () => {
		const tables = {
			chat_sessions: [
				session({ id: 'global-new', last_message_at: minutesAgo(15) }),
				session({
					id: 'project-new-messages',
					context_type: 'project',
					last_message_at: minutesAgo(20),
					last_classified_at: minutesAgo(180)
				}),
				session({
					id: 'daily-brief-old',
					context_type: 'daily_brief',
					last_message_at: daysAgo(12)
				}),
				session({
					id: 'already-classified',
					last_message_at: minutesAgo(30),
					last_classified_at: minutesAgo(30)
				}),
				session({ id: 'still-active', last_message_at: minutesAgo(5) }),
				session({ id: 'no-messages', message_count: 0, last_message_at: minutesAgo(60) }),
				session({ id: 'null-count', message_count: null, last_message_at: minutesAgo(60) }),
				session({ id: 'too-old', last_message_at: daysAgo(31) }),
				session({ id: 'never-messaged', last_message_at: null })
			],
			queue_jobs: [] as JobRow[]
		};

		const { result, queued, queries } = await tick(tables);

		// Newest first.
		expect(queued).toEqual(['global-new', 'project-new-messages', 'daily-brief-old']);
		expect(result).toEqual({ due: 3, enqueued: 3 });
		// Any context type: the session queries never filter on it.
		const sessionFilters = queries
			.filter((query) => query.table === 'chat_sessions')
			.flatMap((query) => query.filters);
		expect(sessionFilters.some((filter) => filter.args[0] === 'context_type')).toBe(false);
	});

	it('queues at most five per tick, newest first, and drains the rest on later ticks', async () => {
		const tables = {
			chat_sessions: Array.from({ length: 8 }, (_, index) =>
				session({ id: `s${index}`, last_message_at: daysAgo(index + 1) })
			),
			queue_jobs: [] as JobRow[]
		};

		const first = await tick(tables);
		expect(first.queued).toEqual(['s0', 's1', 's2', 's3', 's4']);
		expect(first.queued).toHaveLength(CLASSIFICATION_SWEEP_MAX_PER_TICK);
		expect(first.result).toEqual({ due: 8, enqueued: 5 });

		// The first five are still queued: the next tick takes the rest, not the same five.
		const second = await tick(tables);
		expect(second.queued).toEqual(['s5', 's6', 's7']);

		const third = await tick(tables);
		expect(third.queued).toEqual([]);
		expect(third.result).toEqual({ due: 8, enqueued: 0 });
	});

	it('does not queue a failed session again until a new message arrives', async () => {
		const stuck = session({ id: 'stuck', last_message_at: minutesAgo(60) });
		const tables = {
			chat_sessions: [stuck],
			queue_jobs: [job('stuck', { status: 'failed', started_at: minutesAgo(50) })]
		};

		expect((await tick(tables)).queued).toEqual([]);
		expect((await tick(tables)).queued).toEqual([]);

		stuck.last_message_at = minutesAgo(20);
		expect((await tick(tables)).queued).toEqual(['stuck']);
	});

	it('does not loop on a session whose timestamps still look stale after a completed job', async () => {
		const tables = {
			chat_sessions: [
				session({
					id: 'drifted',
					last_message_at: minutesAgo(60),
					last_classified_at: minutesAgo(61)
				})
			],
			queue_jobs: [job('drifted', { status: 'completed', started_at: minutesAgo(45) })]
		};

		expect((await tick(tables)).queued).toEqual([]);
	});

	it('looks past a page of handled sessions to find ones it can queue', async () => {
		const handled = Array.from({ length: 55 }, (_, index) =>
			session({ id: `failed-${index}`, last_message_at: minutesAgo(60 + index) })
		);
		const waiting = Array.from({ length: 3 }, (_, index) =>
			session({ id: `waiting-${index}`, last_message_at: daysAgo(2 + index) })
		);
		const tables = {
			chat_sessions: [...handled, ...waiting],
			queue_jobs: handled.map((row) =>
				job(row.id, { status: 'failed', started_at: minutesAgo(30) })
			)
		};

		const { queued, queries } = await tick(tables);

		expect(queued).toEqual(['waiting-0', 'waiting-1', 'waiting-2']);
		expect(queries.filter((query) => query.table === 'queue_jobs')).toHaveLength(2);
	});

	it('keeps going when one enqueue fails', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const { db } = fakeDb({
			chat_sessions: [
				session({ id: 'a', last_message_at: minutesAgo(15) }),
				session({ id: 'b', last_message_at: minutesAgo(20) })
			],
			queue_jobs: []
		});
		const enqueue = vi
			.fn<(params: { sessionId: string; userId: string }) => Promise<unknown>>()
			.mockRejectedValueOnce(new Error('queue unavailable'))
			.mockResolvedValue(undefined);

		const result = await sweepChatClassifications({ db, now: NOW, enqueue });

		expect(enqueue).toHaveBeenCalledTimes(2);
		expect(enqueue).toHaveBeenLastCalledWith({ sessionId: 'b', userId: 'user-1' });
		expect(result).toEqual({ due: 2, enqueued: 1 });
		warn.mockRestore();
	});
});

describe('classification enqueue contract', () => {
	it('uses the same job, priority and per-session dedup key as the browser close', async () => {
		const add = vi.fn().mockResolvedValue({ queue_job_id: 'job-1' });

		await enqueueChatSessionClassification({ add } as never, {
			sessionId: 'session-1',
			userId: 'user-1'
		});

		expect(add).toHaveBeenCalledWith(
			'classify_chat_session',
			'user-1',
			{ sessionId: 'session-1', userId: 'user-1' },
			{ priority: 8, dedupKey: 'classify-session-session-1' }
		);
	});

	it('is on unless CHAT_CLASSIFICATION_SWEEP_ENABLED=false', () => {
		vi.stubEnv('CHAT_CLASSIFICATION_SWEEP_ENABLED', '');
		expect(chatClassificationSweepEnabled()).toBe(true);
		vi.stubEnv('CHAT_CLASSIFICATION_SWEEP_ENABLED', 'true');
		expect(chatClassificationSweepEnabled()).toBe(true);
		vi.stubEnv('CHAT_CLASSIFICATION_SWEEP_ENABLED', 'false');
		expect(chatClassificationSweepEnabled()).toBe(false);
	});
});
