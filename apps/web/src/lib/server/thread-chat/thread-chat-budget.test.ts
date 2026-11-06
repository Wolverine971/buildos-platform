// apps/web/src/lib/server/thread-chat/thread-chat-budget.test.ts
//
// Tasker 152: what keeps a project thread going and what stops it. Free: fake model, replay rows.
import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { REPLAY_RECORDS } from '../dump-sort/dump-sort-replay';
import type { DumpItem } from '../dump-sort/dump-sort-core';
import {
	THREAD_BUDGET,
	ModelCallError,
	capThreads,
	createThreadBudget,
	createTurnPool,
	deadlineSignal,
	extendBudget,
	nextBudget,
	runModelCall
} from './thread-chat-budget';
import { replayReadPort } from './thread-chat-reads';
import { runChatThread, type ChatThreadEvent } from './thread-chat-thread';
import { composeThreadReply, historyBlock, type ThreadReport } from './thread-chat-core';

describe('the reading budget', () => {
	it('reads within the starting allowance', () => {
		const budget = createThreadBudget();
		budget.readRounds = 1;
		budget.reads = 2;
		expect(nextBudget(budget, { fresh: 2, freshChars: 900 }, createTurnPool(), 1_000)).toEqual({
			action: 'read'
		});
	});

	it('extends only when the last round found something new', () => {
		const budget = createThreadBudget();
		budget.readRounds = 2;
		budget.reads = 3;
		const pool = createTurnPool();
		expect(nextBudget(budget, { fresh: 1, freshChars: 400 }, pool, 1_000)).toEqual({
			action: 'extend'
		});
		expect(nextBudget(budget, { fresh: 0, freshChars: 0 }, pool, 1_000)).toEqual({
			action: 'wrap',
			reason: 'budget'
		});
		extendBudget(budget);
		expect(budget.allowedReadRounds).toBe(4);
		expect(budget.allowedReads).toBe(7);
	});

	it('never passes the hard ceilings', () => {
		const budget = createThreadBudget();
		for (let i = 0; i < 10; i += 1) extendBudget(budget);
		expect(budget.allowedReadRounds).toBe(THREAD_BUDGET.maxReadRounds);
		expect(budget.allowedReads).toBe(THREAD_BUDGET.maxReads);
		budget.readRounds = budget.allowedReadRounds;
		expect(nextBudget(budget, { fresh: 3, freshChars: 900 }, createTurnPool(), 0)).toEqual({
			action: 'wrap',
			reason: 'budget'
		});
	});

	it('wraps up on time, on a spent turn pool, and on too much text', () => {
		const pool = createTurnPool();
		expect(nextBudget(createThreadBudget(), null, pool, THREAD_BUDGET.softMs)).toEqual({
			action: 'wrap',
			reason: 'time'
		});
		expect(
			nextBudget(createThreadBudget(), null, { readRounds: 0, readChars: 9_000 }, 0)
		).toEqual({ action: 'wrap', reason: 'pool' });
		const big = createThreadBudget();
		big.readChars = THREAD_BUDGET.maxReadChars;
		expect(nextBudget(big, null, pool, 0)).toEqual({ action: 'wrap', reason: 'size' });
	});
});

describe('threads per message', () => {
	it('keeps the five projects with the most pieces and defers the rest, in order', () => {
		const grouped = new Map(
			['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'].map((alias, index) => [
				alias,
				Array.from({ length: alias === 'P7' ? 3 : 1 }, () => index)
			])
		);
		const { kept, deferred } = capThreads(grouped);
		expect([...kept.keys()]).toEqual(['P7', 'P1', 'P2', 'P3', 'P4']);
		expect(deferred.map(([alias]) => alias)).toEqual(['P5', 'P6']);
	});
});

describe('one model call', () => {
	type E = { type: 'text' | 'error' | 'done'; content?: string };
	const shape = {
		isOutput: (event: E) => event.type === 'text',
		errorOf: (event: E) => (event.type === 'error' ? (event.content ?? 'boom') : null)
	};

	it('is retried once when it fails before producing anything', async () => {
		let opened = 0;
		const seen: string[] = [];
		const retried: string[] = [];
		const result = await runModelCall<E>({
			...shape,
			open: async function* () {
				opened += 1;
				if (opened === 1) yield { type: 'error', content: 'upstream 502' };
				else yield { type: 'text', content: 'ok' };
			},
			onEvent: (event) => seen.push(event.content ?? event.type),
			onRetry: (reason) => retried.push(reason)
		});
		expect(result.attempts).toBe(2);
		expect(retried).toEqual(['upstream 502']);
		expect(seen).toEqual(['ok']);
	});

	it('is not retried after it started writing; the caller keeps what arrived', async () => {
		let opened = 0;
		const seen: string[] = [];
		const call = runModelCall<E>({
			...shape,
			open: async function* () {
				opened += 1;
				yield { type: 'text', content: 'half a decision' };
				yield { type: 'error', content: 'connection reset' };
			},
			onEvent: (event) => seen.push(event.content ?? '')
		});
		await expect(call).rejects.toBeInstanceOf(ModelCallError);
		await expect(call).rejects.toMatchObject({ produced: true });
		expect(opened).toBe(1);
		expect(seen).toEqual(['half a decision']);
	});

	it('treats a call that goes quiet as stalled and tries once more', async () => {
		let opened = 0;
		const result = await runModelCall<E>({
			...shape,
			idleMs: 30,
			open: async function* (signal) {
				opened += 1;
				if (opened === 1) {
					await new Promise((resolve) => signal.addEventListener('abort', resolve));
					return;
				}
				yield { type: 'text', content: 'back' };
			},
			onEvent: () => undefined
		});
		expect(opened).toBe(2);
		expect(result.attempts).toBe(2);
	});

	it('gives up after the retry', async () => {
		const call = runModelCall<E>({
			...shape,
			open: async function* () {
				yield { type: 'error', content: 'down' };
			},
			onEvent: () => undefined
		});
		await expect(call).rejects.toMatchObject({ message: 'down', produced: false });
	});
});

describe('the thread deadline', () => {
	it('fires after its time and says it timed out', async () => {
		const deadline = deadlineSignal(undefined, 20);
		await new Promise((resolve) => setTimeout(resolve, 40));
		expect(deadline.signal.aborted).toBe(true);
		expect(deadline.timedOut()).toBe(true);
		deadline.clear();
	});

	it('follows the turn: Stop aborts it without counting as a timeout', () => {
		const turn = new AbortController();
		const deadline = deadlineSignal(turn.signal, 10_000);
		turn.abort();
		expect(deadline.signal.aborted).toBe(true);
		expect(deadline.timedOut()).toBe(false);
		deadline.clear();
	});
});

// ---------------------------------------------------------------------------
// A whole thread, with a fake model
// ---------------------------------------------------------------------------

function pieces(...titles: string[]): DumpItem[] {
	return titles.map((title, index) => ({
		n: index + 1,
		sentence: 1,
		kind: 'ask',
		to: 'P2',
		title,
		quote: title,
		due: null,
		start: 0,
		end: 0,
		match: 'none'
	}));
}

type Out = { read?: string; text?: string; fail?: string; textThenFail?: string };

function fakeLlm(outputs: Out[]) {
	const calls: { last: unknown }[] = [];
	const llm = {
		async *streamText(options: { messages: { content: unknown }[] }) {
			calls.push({ last: options.messages.at(-1)?.content });
			const out = outputs[calls.length - 1] ?? {};
			if (out.fail) {
				yield { type: 'error', error: out.fail };
				return;
			}
			if (out.textThenFail) {
				yield { type: 'text', content: out.textThenFail };
				yield { type: 'error', error: 'connection reset' };
				return;
			}
			if (out.text) yield { type: 'text', content: out.text };
			if (out.read)
				yield {
					type: 'tool_call',
					tool_call: {
						id: `c${calls.length}`,
						function: {
							name: 'read_record',
							arguments: JSON.stringify({ ref: out.read })
						}
					}
				};
			yield { type: 'done', usage: { prompt_tokens: 100, cost: 0.0001 }, provider: 'Relace' };
		}
	};
	return { llm, calls };
}

async function runThread(outputs: Out[], titles = ['When do we upload?']) {
	const { llm, calls } = fakeLlm(outputs);
	const events: ChatThreadEvent[] = [];
	const report = await runChatThread({
		alias: 'P2',
		projectId: 'replay-yt',
		load: Promise.resolve({
			project: REPLAY_RECORDS['replay-yt']!,
			stats: {
				counts: { tasks: 3, goals: 0, milestones: 0, docs: 1, plans: 0, risks: 0 },
				outlined: 1,
				fallback: 0,
				fallbackChars: 0,
				ms: 1
			}
		}),
		pieces: pieces(...titles),
		today: 'Thursday 2026-11-05',
		userId: 'user-1',
		history: '',
		nextQuestion: (() => {
			let n = 0;
			return () => (n += 1);
		})(),
		decider: null,
		llm: llm as never,
		reads: replayReadPort(),
		send: (event) => events.push(event),
		t: () => 0
	});
	const steps = events.flatMap((event) => (event.type === 'thread_step' ? [event.step] : []));
	const done = events.filter((event) => event.type === 'thread_done');
	return { report, calls, steps, done };
}

const answerLine = (piece: number, text: string) =>
	JSON.stringify({ piece, op: 'answer', text, refs: ['t0'] });

describe('a project thread', () => {
	it('shows when it earns more reading', async () => {
		const { steps } = await runThread([
			{ read: 't0' },
			{ read: 't1' },
			{ read: 't2' },
			{ text: answerLine(1, 'Tuesdays.') }
		]);
		expect(
			steps.some((step) => step.kind === 'budget' && /reading further/.test(step.label))
		).toBe(true);
	});

	it('reruns once when it fails before deciding anything, and reports once', async () => {
		// Attempt 1: the call fails, and fails again on its retry. Attempt 2 answers.
		const { report, steps, done } = await runThread([
			{ fail: 'upstream 502' },
			{ fail: 'upstream 502' },
			{ text: answerLine(1, 'Tuesdays.') }
		]);
		expect(report.failed).toBeNull();
		expect(report.answers).toEqual(['Tuesdays.']);
		expect(
			steps.some(
				(step) => step.kind === 'retry' && /trying this project again/.test(step.label)
			)
		).toBe(true);
		// The second try's steps don't overwrite the first's.
		expect(steps.some((step) => step.id.startsWith('a2-'))).toBe(true);
		expect(done).toHaveLength(1);
	});

	it('fails cleanly after two tries, keeping last turn intact', async () => {
		const { report, done } = await runThread([
			{ fail: 'down' },
			{ fail: 'down' },
			{ fail: 'down' },
			{ fail: 'down' }
		]);
		expect(report.failed).toBe('down');
		expect(done).toHaveLength(1);
	});

	it('keeps the decisions it made when the call breaks mid-answer', async () => {
		const { report, steps } = await runThread(
			[{ textThenFail: `${answerLine(1, 'Tuesdays.')}\n` }],
			['When do we upload?', 'Who edits?']
		);
		expect(report.failed).toBeNull();
		expect(report.answers).toEqual(['Tuesdays.']);
		expect(report.unfinished).toEqual(['Who edits?']);
		expect(steps.find((step) => step.kind === 'unfinished')?.detail).toContain(
			'connection reset'
		);
	});

	it('asks once about a piece it skipped', async () => {
		const { report, calls } = await runThread(
			[{ text: answerLine(1, 'Tuesdays.') }, { text: answerLine(2, 'You do.') }],
			['When do we upload?', 'Who edits?']
		);
		expect(String(calls[1]!.last)).toContain('piece 2');
		expect(report.answers).toEqual(['Tuesdays.', 'You do.']);
		expect(report.unfinished).toEqual([]);
	});

	it('reports a piece it still skipped after the repair round', async () => {
		const { report } = await runThread(
			[{ text: answerLine(1, 'Tuesdays.') }, { text: '' }],
			['When do we upload?', 'Who edits?']
		);
		expect(report.unfinished).toEqual(['Who edits?']);
	});
});

describe('unfinished pieces reach the person', () => {
	const report: ThreadReport = {
		alias: 'P2',
		projectId: 'replay-yt',
		project: 'YouTube channel',
		read: [],
		saved: [],
		asked: [],
		answers: ['Tuesdays.'],
		covered: [],
		failed: null,
		unfinished: ['Who edits?'],
		carry: [],
		scanned: [],
		scannedCount: 0
	};

	it('in the one-project reply', () => {
		const text = composeThreadReply({
			project: 'YouTube channel',
			changes: [],
			failed: null,
			unfinished: report.unfinished
		});
		expect(text).toContain(`Didn't get to: "Who edits?"`);
	});

	it('in the planner history, so "try again" lands on the right project', () => {
		expect(historyBlock([{ user: 'x', answer: 'y', threads: [report] }])).toContain(
			"didn't get to: Who edits?"
		);
	});
});

// ---------------------------------------------------------------------------
// Adversarial-review fixes (2026-11-05)
// ---------------------------------------------------------------------------

describe('review fixes: model calls', () => {
	type E = { type: 'text' | 'error' | 'done'; content?: string };
	const shape = {
		isOutput: (event: E) => event.type === 'text',
		errorOf: (event: E) => (event.type === 'error' ? (event.content ?? 'boom') : null)
	};

	it('a deadline that ends a quietly-returning stream is a failure, not a success', async () => {
		// smart-llm's streamText returns without an error when its signal aborts.
		const deadline = deadlineSignal(undefined, 30);
		const call = runModelCall<E>({
			...shape,
			signal: deadline.signal,
			open: async function* (signal) {
				yield { type: 'text', content: '{"piece":1' };
				await new Promise((resolve) => signal.addEventListener('abort', resolve));
			},
			onEvent: () => undefined
		});
		await expect(call).rejects.toThrow();
		expect(deadline.timedOut()).toBe(true);
		deadline.clear();
	});

	it('the watchdog ends a stream stuck on something that ignores abort', async () => {
		let opened = 0;
		const started = Date.now();
		const result = await runModelCall<E>({
			...shape,
			idleMs: 30,
			open: async function* () {
				opened += 1;
				if (opened === 1) await new Promise(() => undefined); // never settles, never aborts
				yield { type: 'text', content: 'back' };
			},
			onEvent: () => undefined
		});
		expect(result.attempts).toBe(2);
		expect(Date.now() - started).toBeLessThan(2_000);
	});
});

describe('review fixes: a project thread', () => {
	it('drops lines for already-decided pieces in the repair round (no duplicates, no lost question numbers)', async () => {
		const ask = (piece: number) =>
			JSON.stringify({
				piece,
				op: 'archive',
				ref: 't1',
				why: 'dead',
				sure: true
			});
		const { report } = await runThread(
			[
				{ text: ask(1) },
				// The repair round rewrites piece 1 and adds piece 2.
				{ text: `${ask(1)}\n${answerLine(2, 'You do.')}` }
			],
			['Kill the banner', 'Who edits?']
		);
		expect(report.asked).toHaveLength(1);
		expect(report.asked[0]).toMatch(/^1\. /);
		expect(report.answers).toEqual(['You do.']);
	});

	it("doesn't retry a project whose index failed to load", async () => {
		const events: ChatThreadEvent[] = [];
		const failing = Promise.reject(new Error('Could not read the project'));
		failing.catch(() => undefined);
		const report = await runChatThread({
			alias: 'P2',
			projectId: 'replay-yt',
			load: failing,
			pieces: pieces('When do we upload?'),
			today: 'Thursday 2026-11-05',
			userId: 'user-1',
			history: '',
			nextQuestion: () => 1,
			decider: null,
			llm: null,
			reads: replayReadPort(),
			send: (event) => events.push(event),
			t: () => 0
		});
		expect(report.failed).toBe('Could not read the project');
		expect(
			events.some((event) => event.type === 'thread_step' && event.step.kind === 'retry')
		).toBe(false);
	});

	it('reserves read size up front, so parallel reads cannot overshoot the turn pool', async () => {
		const reads: string[] = [];
		const port = replayReadPort();
		const counting = {
			search: port.search,
			readDoc: port.readDoc,
			readRecord: async (...args: Parameters<typeof port.readRecord>) => {
				reads.push(args[0].ref);
				return port.readRecord(...args);
			}
		};
		const { llm } = fakeLlm([{ text: '' }]);
		// One response asks for three records at once; the pool only has room for one read.
		let round = 0;
		llm.streamText = async function* () {
			round += 1;
			if (round > 1) {
				yield { type: 'text', content: answerLine(1, 'Done.') };
				yield { type: 'done', usage: {}, provider: 'Relace' };
				return;
			}
			yield {
				type: 'tool_call',
				tool_call: { id: 'a', function: { name: 'read_record', arguments: '{"ref":"t0"}' } }
			};
			yield {
				type: 'tool_call',
				tool_call: { id: 'b', function: { name: 'read_record', arguments: '{"ref":"t1"}' } }
			};
			yield {
				type: 'tool_call',
				tool_call: { id: 'c', function: { name: 'read_record', arguments: '{"ref":"t2"}' } }
			};
			yield { type: 'done', usage: {}, provider: 'Relace' };
		} as never;
		await runChatThread({
			alias: 'P2',
			projectId: 'replay-yt',
			load: Promise.resolve({
				project: REPLAY_RECORDS['replay-yt']!,
				stats: {
					counts: { tasks: 3, goals: 0, milestones: 0, docs: 1, plans: 0, risks: 0 },
					outlined: 1,
					fallback: 0,
					fallbackChars: 0,
					ms: 1
				}
			}),
			pieces: pieces('Status?'),
			today: 'Thursday 2026-11-05',
			userId: 'user-1',
			history: '',
			nextQuestion: () => 1,
			decider: null,
			llm: llm as never,
			reads: counting,
			pool: { readRounds: 20, readChars: 9_000 },
			send: () => undefined,
			t: () => 0
		});
		expect(reads).toEqual(['t0']);
	});
});

// ---------------------------------------------------------------------------
// Live-run fixes (complicated 5-project message, 2026-11-05)
// ---------------------------------------------------------------------------

describe('live-run fixes', () => {
	it('a decision written again later replaces the first instead of repeating it', async () => {
		const archive = JSON.stringify({
			piece: 1,
			op: 'archive',
			ref: 't1',
			why: 'dead',
			sure: true,
			confirmed: true
		});
		// Round 1 writes the decision while also asking to read; round 2 writes it again.
		const { report, calls } = await runThread([
			{ text: `${archive}\n`, read: 't0' },
			{ text: archive }
		]);
		expect(calls).toHaveLength(2);
		expect(report.saved).toEqual(['archive task "Design new channel banner"']);
	});

	it('the composed reply labels answers by project and asks only what threads asked', async () => {
		const { composeTurnReply } = await import('./thread-chat-core');
		const record = {
			ref: 't0',
			id: 'x',
			kind: 'task' as const,
			title: 'Review Vercel Speed Insights',
			state: 'todo',
			due: null,
			description: null,
			p: null,
			tier: 'summary' as const
		};
		const text = composeTurnReply({
			threads: [
				{
					project: 'Radar',
					changes: [
						{
							piece: 1,
							op: 'answer',
							text: 'Radar has nothing on that.',
							records: [],
							status: 'info',
							question: null
						}
					],
					failed: null
				},
				{
					project: 'BuildOS',
					changes: [
						{
							piece: 2,
							op: 'update',
							record,
							fields: [{ field: 'state', before: 'todo', after: 'done' }],
							why: 'done',
							status: 'applied',
							question: null
						}
					],
					failed: null
				}
			]
		});
		expect(text).toContain('Radar: Radar has nothing on that.');
		expect(text).toContain('BuildOS: marked "Review Vercel Speed Insights" done.');
		expect(text).not.toMatch(/^\d+\. /m);
	});
});

// ---------------------------------------------------------------------------
// Re-routing pieces a thread hands back (2026-11-05)
// ---------------------------------------------------------------------------

describe('handing a piece back', () => {
	it('reads a structured elsewhere line, and only for pieces it was given', async () => {
		const { readElsewhereLine } = await import('./thread-chat-core');
		const line = JSON.stringify({
			piece: 2,
			op: 'elsewhere',
			look_for: 'AI Founders Club brief',
			why: 'nothing here mentions it'
		});
		expect(readElsewhereLine(line, new Set([1, 2]))).toEqual({
			piece: 2,
			lookFor: 'AI Founders Club brief',
			why: 'nothing here mentions it'
		});
		expect(readElsewhereLine(line, new Set([1]))).toBeNull();
		expect(readElsewhereLine('{"piece":2,"op":"elsewhere"}', new Set([2]))).toBeNull();
	});

	it('a handed-back piece is not "skipped": no repair round, nothing unfinished', async () => {
		const away = JSON.stringify({
			piece: 1,
			op: 'elsewhere',
			look_for: 'Cutlass',
			why: 'no Cutlass here'
		});
		const { report, calls } = await runThread([{ text: away }]);
		expect(calls).toHaveLength(1);
		expect(report.elsewhere).toEqual([
			{ piece: 1, lookFor: 'Cutlass', why: 'no Cutlass here' }
		]);
		expect(report.unfinished).toEqual([]);
	});

	it('the turn finds where it lives and answers there (replay turn 4)', async () => {
		const { streamChatTurn } = await import('./thread-chat.service');
		const stream = streamChatTurn({
			session: {} as never,
			admin: {} as never,
			userId: 'user-1',
			message: '',
			history: [0, 1, 2].map(() => ({ user: '', answer: '', threads: [] })),
			projectId: null,
			mode: 'replay'
		});
		const events = (await new Response(stream).text())
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		const rerouted = events.find((event) => event.type === 'rerouted');
		expect(rerouted.moves).toEqual([
			{
				piece: 1,
				from: 'P2',
				to: 'P1',
				toName: 'Fading Crown',
				lookFor: 'Act II outline',
				found: 'Act II outline'
			}
		]);
		const reports = events.filter((event) => event.type === 'thread_done').map((e) => e.report);
		expect(reports.map((report) => report.project)).toEqual([
			'YouTube channel',
			'Fading Crown'
		]);
		const answer = events.find((event) => event.type === 'answer_done').text;
		expect(answer).toContain(
			'Fading Crown: Chapters 9 to 16 are the siege, the bargain, and the fall of the east ward.'
		);
		const done = events.find((event) => event.type === 'done');
		expect(done.totals.rerouted).toBe(1);
		expect(done.totals.threads).toBe(2);
	}, 20_000);
});
