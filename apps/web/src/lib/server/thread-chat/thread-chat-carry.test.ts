// apps/web/src/lib/server/thread-chat/thread-chat-carry.test.ts
// Tasker 151: carrying a turn's context forward. Free: pure functions plus replay threads.
import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { buildContextFinderEntities } from '@buildos/agentic-chat-runtime/context-finder';
import { REPLAY_RECORDS } from '../dump-sort/dump-sort-replay';
import type { DumpItem } from '../dump-sort/dump-sort-core';
import {
	CARRY_IDLE_TURNS,
	CARRY_MAX_CHARS,
	buildWorkingSet,
	planRehydrate,
	readContFlag,
	readKeepLine,
	type CarryItem,
	type ReadTrace,
	type WorkingSet
} from './thread-chat-carry';
import { replayReadPort } from './thread-chat-reads';
import { runChatThread, type ChatThreadEvent, type ChatThreadReplay } from './thread-chat-thread';
import { streamChatTurn, type ChatTurnEvent } from './thread-chat.service';
import type { ChatHistoryTurn } from './thread-chat-core';

const youtube = buildContextFinderEntities(REPLAY_RECORDS['replay-yt']!);
const byId = new Map(youtube.map((entity) => [entity.id, entity]));
const plan = byId.get('yt-d0')!;

const item = (over: Partial<CarryItem> = {}): CarryItem => ({
	id: 'yt-d0',
	kind: 'document',
	title: 'Channel plan',
	anchors: ['schedule'],
	headings: ['Schedule'],
	version: plan.version,
	chars: 60,
	idle: 0,
	...over
});
const trace = (over: Partial<ReadTrace> = {}): ReadTrace => ({
	...item(),
	whole: false,
	docChars: 120,
	...over
});

describe('keep and cont lines', () => {
	it('reads the keep line the thread writes last', () => {
		expect(
			readKeepLine('{"op":"keep","items":[{"ref":"d1","sections":["Group 1"]},{"ref":"p0"}]}')
		).toEqual({
			items: [
				{ ref: 'd1', sections: ['Group 1'] },
				{ ref: 'p0', sections: [] }
			]
		});
		expect(readKeepLine('{"op":"keep","items":[]}')).toEqual({ items: [] });
		expect(readKeepLine('{"piece":1,"op":"answer","text":"keep it"}')).toBeNull();
	});

	it("reads the planner's cont flag only when it is true", () => {
		expect(readContFlag('{"s":1,"q":"yes","kind":"update","to":"P1","cont":true}')).toBe(true);
		expect(readContFlag('{"s":1,"q":"yes","kind":"update","to":"P1"}')).toBe(false);
		expect(readContFlag('{"s":1,"cont":"true"}')).toBe(false);
	});
});

describe('what carries forward', () => {
	it('carries what the decisions used and notes the rest as scanned', () => {
		const set = buildWorkingSet({
			carriedIn: [],
			reads: [
				trace(),
				trace({ id: 'yt-t2', kind: 'task', title: 'Outline', anchors: [], headings: [] })
			],
			used: new Set(['yt-d0']),
			keep: null,
			related: [{ id: 'yt-t0', kind: 'task', title: 'Edit the sampler video' }],
			previousScanned: []
		});
		expect(set.carry.map((entry) => entry.id)).toEqual(['yt-d0']);
		expect(set.scanned.map((entry) => entry.id)).toEqual(['yt-t2', 'yt-t0']);
	});

	it("doesn't carry a long document read whole; its sections carry once named", () => {
		const whole = trace({
			anchors: [],
			headings: [],
			whole: true,
			chars: 9_000,
			docChars: 50_500
		});
		const unnamed = buildWorkingSet({
			carriedIn: [],
			reads: [whole],
			used: new Set(['yt-d0']),
			keep: null,
			related: [],
			previousScanned: []
		});
		expect(unnamed.carry).toEqual([]);
		expect(unnamed.scanned.map((entry) => entry.id)).toEqual(['yt-d0']);

		const named = buildWorkingSet({
			carriedIn: [],
			reads: [whole],
			used: new Set(),
			keep: [{ ...item(), chars: 4_800 }],
			related: [],
			previousScanned: []
		});
		expect(named.carry).toMatchObject([{ id: 'yt-d0', anchors: ['schedule'], chars: 4_800 }]);
	});

	it('lets the keep line decide, and fades unused items after two turns', () => {
		let set: WorkingSet = buildWorkingSet({
			carriedIn: [],
			reads: [trace()],
			used: new Set(),
			keep: [{ ...item(), chars: 60 }],
			related: [],
			previousScanned: []
		});
		for (let turn = 1; turn <= CARRY_IDLE_TURNS; turn += 1) {
			expect(set.carry.map((entry) => entry.id)).toEqual(['yt-d0']);
			set = buildWorkingSet({
				carriedIn: set.carry,
				reads: [],
				used: new Set(),
				keep: [],
				related: [],
				previousScanned: set.scanned
			});
		}
		expect(set.carry).toEqual([]);
		expect(set.scanned.map((entry) => entry.id)).toEqual(['yt-d0']);
	});

	it('keeps carried text under the budget; the overflow becomes a note', () => {
		const set = buildWorkingSet({
			carriedIn: [],
			reads: [],
			used: new Set(),
			keep: [
				{ ...item({ id: 'a', chars: 7_000 }), chars: 7_000 },
				{ ...item({ id: 'b', chars: 6_000 }), chars: 6_000 }
			],
			related: [],
			previousScanned: []
		});
		expect(set.carry.map((entry) => entry.id)).toEqual(['a']);
		expect(set.carry.reduce((total, entry) => total + entry.chars, 0)).toBeLessThanOrEqual(
			CARRY_MAX_CHARS
		);
		expect(set.scanned.map((entry) => entry.id)).toEqual(['b']);
	});
});

describe('loading the carry next turn', () => {
	it('loads unchanged items by id, flags edited ones, and drops unknown ids', () => {
		const result = planRehydrate(
			[
				item(),
				item({ id: 'yt-t0', kind: 'task', anchors: [], headings: [], version: 'old' }),
				item({ id: 'someone-elses-doc' })
			],
			byId
		);
		expect(result.load.map(({ entity }) => entity.id)).toEqual(['yt-d0']);
		expect(result.changed.map(({ entity }) => entity.id)).toEqual(['yt-t0']);
		expect(result.gone.map((entry) => entry.id)).toEqual(['someone-elses-doc']);
	});

	it('maps carried ids to whatever refs the records have now', () => {
		const reordered = buildContextFinderEntities({
			...REPLAY_RECORDS['replay-yt']!,
			documents: [
				{ ...REPLAY_RECORDS['replay-yt']!.documents[0]!, id: 'yt-d9', title: 'New doc' },
				...REPLAY_RECORDS['replay-yt']!.documents
			]
		});
		const result = planRehydrate([item()], new Map(reordered.map((e) => [e.id, e])));
		expect(result.load[0]!.entity.id).toBe('yt-d0');
		expect(result.load[0]!.entity.ref).not.toBe(plan.ref);
	});
});

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

async function thread(input: {
	replay: ChatThreadReplay;
	carry?: WorkingSet | null;
	continues?: boolean;
}) {
	const events: ChatThreadEvent[] = [];
	const rows = REPLAY_RECORDS['replay-yt']!;
	const report = await runChatThread({
		alias: 'P2',
		projectId: 'replay-yt',
		load: Promise.resolve({
			project: rows,
			stats: {
				counts: { tasks: 3, goals: 0, milestones: 0, docs: 1, plans: 0, risks: 0 },
				outlined: 1,
				fallback: 0,
				fallbackChars: 0,
				ms: 1
			}
		}),
		pieces: pieces('When do we upload?'),
		today: 'Thursday 2026-11-05',
		userId: 'user-1',
		history: '',
		nextQuestion: () => 1,
		decider: null,
		llm: null,
		reads: replayReadPort(),
		carry: input.carry,
		continues: input.continues,
		replay: input.replay,
		send: (event) => events.push(event),
		t: () => 0
	});
	const done = events.find((event) => event.type === 'thread_done');
	return { report, events, stats: done?.type === 'thread_done' ? done.stats : null };
}

const answer = (refs: string[]) =>
	JSON.stringify({ piece: 1, op: 'answer', text: 'Every other Tuesday.', refs });

describe('a follow-up turn on the same project', () => {
	const carry: WorkingSet = { carry: [item()], scanned: [], scannedCount: 0 };

	it('starts with the carried section, skips the search, and skips the reread', async () => {
		const { stats, events, report } = await thread({
			carry,
			continues: true,
			replay: {
				pick: [{ id: 'yt-t0', p: 0.9 }],
				findMs: 0,
				rounds: [
					{
						reads: [
							{ tool: 'read_doc', args: { ref: plan.ref, sections: ['Schedule'] } }
						]
					},
					{ answer: answer([plan.ref]) }
				]
			}
		});
		expect(stats).toMatchObject({ finder: 'skipped', carried: 1, rereadsSkipped: 1, reads: 0 });
		expect(stats!.carriedChars).toBeGreaterThan(0);
		const carryStep = events.find(
			(event) =>
				event.type === 'thread_step' &&
				event.step.id === 'carry' &&
				event.step.state === 'done'
		);
		expect(carryStep?.type === 'thread_step' && carryStep.step.label).toBe(
			'Carried 1 from last turn'
		);
		// Used again, so it stays carried.
		expect(report.carry).toMatchObject([{ id: 'yt-d0', idle: 0 }]);
	});

	it('runs the search when a piece is new, and reads only the sections not carried', async () => {
		const { stats, report } = await thread({
			carry,
			continues: false,
			replay: {
				pick: [{ id: 'yt-t0', p: 0.9 }],
				findMs: 0,
				rounds: [
					{
						reads: [
							{
								tool: 'read_doc',
								args: { ref: plan.ref, sections: ['Schedule', 'Formats'] }
							}
						]
					},
					{ answer: answer([plan.ref]) }
				]
			}
		});
		expect(stats).toMatchObject({ finder: 'ran', reads: 1, rereadsSkipped: 0 });
		expect(report.read[0]).toContain('Channel plan › Formats');
		expect(report.read[0]).not.toContain('Schedule');
		expect(report.carry[0]!.anchors).toHaveLength(2);
	});

	it('reads a carried doc again when it changed since last turn', async () => {
		const { stats } = await thread({
			carry: { carry: [item({ version: 'yesterday' })], scanned: [], scannedCount: 0 },
			continues: true,
			replay: {
				pick: [],
				findMs: 0,
				rounds: [
					{
						reads: [
							{ tool: 'read_doc', args: { ref: plan.ref, sections: ['Schedule'] } }
						]
					},
					{ answer: answer([plan.ref]) }
				]
			}
		});
		// Nothing loaded, so nothing to continue from: the search runs and the read happens.
		expect(stats).toMatchObject({
			carried: 0,
			changed: 1,
			reads: 1,
			rereadsSkipped: 0,
			finder: 'ran'
		});
	});

	it('runs one read when the same record is asked for twice in a round', async () => {
		const { stats } = await thread({
			replay: {
				pick: [],
				findMs: 0,
				rounds: [
					{
						reads: [
							{ tool: 'read_record', args: { ref: 't0' } },
							{ tool: 'read_record', args: { ref: 't0' } }
						]
					},
					{ answer: answer(['t0']) }
				]
			}
		});
		expect(stats).toMatchObject({ reads: 1, rereadsSkipped: 1 });
	});
});

describe('replay conversation carry', () => {
	it('carries turn 1’s Schedule section into turn 2 and reads only Formats', async () => {
		const history: ChatHistoryTurn[] = [];
		const turns: ChatTurnEvent[][] = [];
		for (let turn = 0; turn < 2; turn += 1) {
			const stream = streamChatTurn({
				session: {} as never,
				admin: {} as never,
				userId: 'user-1',
				message: '',
				history,
				projectId: null,
				mode: 'replay'
			});
			const events = (await new Response(stream).text())
				.trim()
				.split('\n')
				.map((line) => JSON.parse(line) as ChatTurnEvent);
			turns.push(events);
			const start = events.find((event) => event.type === 'start')!;
			const answerDone = events.find((event) => event.type === 'answer_done')!;
			history.push({
				user: start.type === 'start' ? start.message : '',
				answer: answerDone.type === 'answer_done' ? answerDone.text : '',
				threads: events.flatMap((event) =>
					event.type === 'thread_done' ? [event.report] : []
				)
			});
		}
		const turnOne = history[0]!.threads.find((report) => report.projectId === 'replay-yt')!;
		expect(turnOne.carry).toMatchObject([{ id: 'yt-d0', headings: ['Schedule'] }]);

		const done = turns[1]!.find((event) => event.type === 'done');
		expect(done?.type === 'done' && done.totals.carriedChars).toBeGreaterThan(0);
		const turnTwo = history[1]!.threads[0]!;
		expect(turnTwo.read.find((line) => line.startsWith('Channel plan'))).toContain(
			'Channel plan › Formats'
		);
		expect(turnTwo.read.join(' ')).not.toContain('Schedule');
		expect(turnTwo.carry.map((entry) => entry.id).sort()).toEqual(['yt-d0', 'yt-t2']);
	}, 30_000);
});

describe('the last round', () => {
	type Out = { read?: string; text?: string };
	function fakeLlm(outputs: Out[]) {
		const calls: { tool_choice: unknown; last: unknown }[] = [];
		const llm = {
			async *streamText(options: {
				tool_choice?: unknown;
				messages: { content: unknown }[];
			}) {
				calls.push({
					tool_choice: options.tool_choice,
					last: options.messages.at(-1)?.content
				});
				const out = outputs[calls.length - 1] ?? {};
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
				yield { type: 'done', usage: { prompt_tokens: 100 }, provider: 'Relace' };
			}
		};
		return { llm, calls };
	}

	async function run(outputs: Out[]) {
		const { llm, calls } = fakeLlm(outputs);
		const rows = REPLAY_RECORDS['replay-yt']!;
		await runChatThread({
			alias: 'P2',
			projectId: 'replay-yt',
			load: Promise.resolve({
				project: rows,
				stats: {
					counts: { tasks: 3, goals: 0, milestones: 0, docs: 1, plans: 0, risks: 0 },
					outlined: 1,
					fallback: 0,
					fallbackChars: 0,
					ms: 1
				}
			}),
			pieces: pieces('When do we upload?'),
			today: 'Thursday 2026-11-05',
			userId: 'user-1',
			history: '',
			nextQuestion: () => 1,
			decider: null,
			llm: llm as never,
			reads: replayReadPort(),
			send: () => undefined,
			t: () => 0
		});
		return calls;
	}

	it('asks for decisions in words once reads stop finding anything new', async () => {
		// Round 2 rereads t0: nothing new, so no extension; round 3 is told to decide, in words.
		const calls = await run([{ read: 't0' }, { read: 't0' }, { text: answer(['t0']) }]);
		expect(calls.map((call) => call.tool_choice)).toEqual(['auto', 'auto', 'auto']);
		expect(calls[2]!.last).toContain('No more reads');
	});

	it('forces "none" only when the model still asks to read', async () => {
		const calls = await run([
			{ read: 't0' },
			{ read: 't0' },
			{ read: 't1' },
			{ text: answer(['t0']) }
		]);
		expect(calls.map((call) => call.tool_choice)).toEqual(['auto', 'auto', 'auto', 'none']);
	});

	it('keeps reading while reads keep finding new records (tasker 152)', async () => {
		const calls = await run([
			{ read: 't0' },
			{ read: 't1' },
			{ read: 't2' },
			{ text: answer(['t0']) }
		]);
		// The old fixed limit would have stopped after two read rounds.
		expect(calls.map((call) => call.tool_choice)).toEqual(['auto', 'auto', 'auto', 'auto']);
		expect(String(calls[3]!.last)).not.toContain('No more reads');
	});
});

describe('one project replies with its own words', () => {
	it('shows the whole answer, then the changes, then the numbered questions', async () => {
		const { composeThreadReply } = await import('./thread-chat-core');
		const record = {
			ref: 't0',
			id: 'yt-t0',
			kind: 'task' as const,
			title: 'Edit the sampler video',
			state: 'in_progress',
			due: null,
			description: null,
			p: null,
			tier: 'summary' as const
		};
		const long = 'Every other Tuesday at 9 AM. '.repeat(40).trim();
		const reply = composeThreadReply({
			project: 'YouTube channel',
			failed: null,
			changes: [
				{ piece: 1, op: 'answer', text: long, records: [], status: 'info', question: null },
				{
					piece: 2,
					op: 'update',
					record,
					fields: [{ field: 'state', before: 'in_progress', after: 'done' }],
					why: '',
					status: 'applied',
					question: null
				},
				{
					piece: 3,
					op: 'archive',
					record,
					why: '',
					status: 'ask',
					question: 'Archive "Edit the sampler video"?',
					qn: 1
				}
			]
		});
		expect(reply).toBe(
			`${long}\n\nYouTube channel: marked "Edit the sampler video" done.\n\n1. Archive "Edit the sampler video"?`
		);
	});

	it('skips the reply call whenever threads ran', async () => {
		const history: ChatHistoryTurn[] = [];
		const answers: { model: string | null; calls: number }[] = [];
		for (let turn = 0; turn < 2; turn += 1) {
			const stream = streamChatTurn({
				session: {} as never,
				admin: {} as never,
				userId: 'user-1',
				message: '',
				history,
				projectId: null,
				mode: 'replay'
			});
			const events = (await new Response(stream).text())
				.trim()
				.split('\n')
				.map((line) => JSON.parse(line) as ChatTurnEvent);
			const done = events.find((event) => event.type === 'answer_done');
			const totals = events.find((event) => event.type === 'done');
			answers.push({
				model: done?.type === 'answer_done' ? done.model : null,
				calls: totals?.type === 'done' ? totals.totals.calls : 0
			});
			history.push({
				user: '',
				answer: done?.type === 'answer_done' ? done.text : '',
				threads: events.flatMap((event) =>
					event.type === 'thread_done' ? [event.report] : []
				)
			});
		}
		// Threads ran: the reply is composed from their own lines, no reply call (2026-11-05).
		expect(answers[0]!.model).toBe('composed');
		expect(answers[1]!.model).toBe('composed');
		expect(history[1]!.answer).toContain('archived "Design new channel banner"');
	}, 30_000);
});
