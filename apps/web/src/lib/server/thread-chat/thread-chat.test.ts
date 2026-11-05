// apps/web/src/lib/server/thread-chat/thread-chat.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { buildContextFinderEntities } from '@buildos/agentic-chat-runtime/context-finder';
import { REPLAY_RECORDS } from '../dump-sort/dump-sort-replay';
import {
	buildPlanPrompt,
	buildProjectIndex,
	changeStatus,
	historyBlock,
	readChatThreadLine,
	resolveSections,
	type ChatHistoryTurn
} from './thread-chat-core';
import { streamChatTurn, type ChatTurnEvent } from './thread-chat.service';
import type { ThreadRecord } from '../dump-sort/dump-sort-thread-core';

const youtube = buildContextFinderEntities(REPLAY_RECORDS['replay-yt']!);
const known = {
	records: new Map<string, ThreadRecord>(
		youtube.map((entity) => [
			entity.ref,
			{
				ref: entity.ref,
				id: entity.id,
				kind: entity.kind,
				title: entity.title,
				state: null,
				due: null,
				description: null,
				p: null,
				tier: 'summary'
			} as ThreadRecord
		])
	),
	pieces: new Set([1, 2, 3])
};

describe('apply or ask', () => {
	it('saves a sure update and asks about an unsure one', () => {
		const sure = readChatThreadLine(
			'{"piece":1,"op":"update","ref":"t0","set":{"state":"done"},"why":"done","sure":true}',
			known
		);
		expect(sure.type === 'change' && sure.change.status).toBe('applied');
		const unsure = readChatThreadLine(
			'{"piece":1,"op":"update","ref":"t0","set":{"due":"2026-12-01"},"why":"?","sure":false,"ask":"Move it to Dec 1?"}',
			known
		);
		expect(unsure.type === 'change' && unsure.change.status).toBe('ask');
		expect(unsure.type === 'change' && unsure.change.question).toBe('Move it to Dec 1?');
	});

	it('asks before an archive or rename unless the person confirmed it', () => {
		const archive = readChatThreadLine(
			'{"piece":2,"op":"archive","ref":"t1","why":"dead","sure":true}',
			known
		);
		expect(archive.type === 'change' && archive.change.status).toBe('ask');
		expect(archive.type === 'change' && archive.change.question).toBe(
			'Archive "Design new channel banner"?'
		);
		const confirmed = readChatThreadLine(
			'{"piece":2,"op":"archive","ref":"t1","why":"said yes","sure":true,"confirmed":true}',
			known
		);
		expect(confirmed.type === 'change' && confirmed.change.status).toBe('applied');
		const rename = readChatThreadLine(
			'{"piece":2,"op":"update","ref":"t1","set":{"title":"New banner"},"why":"x","sure":true}',
			known
		);
		expect(rename.type === 'change' && rename.change.status).toBe('ask');
	});

	it('treats answers and "already there" as information', () => {
		const answer = readChatThreadLine(
			'{"piece":3,"op":"answer","text":"Tuesdays.","refs":["d0"]}',
			known
		);
		expect(answer.type === 'change' && answer.change.status).toBe('info');
		expect(
			changeStatus({ piece: 1, op: 'covered', record: known.records.get('t2')!, why: '' }, {})
		).toBe('info');
	});

	it('keeps a drafted document body', () => {
		const read = readChatThreadLine(
			'{"piece":3,"op":"create","kind":"doc","title":"Series plan","description":"","body":"## Why\\nBecause.","sure":true}',
			known
		);
		expect(read.type === 'change' && read.change.body).toBe('## Why\nBecause.');
	});
});

describe('project index', () => {
	it('lists documents as cards with headings, never their text', () => {
		const index = buildProjectIndex(youtube, new Map([['yt-d0', 0.9]]));
		expect(index.text.split('\n')[0]).toMatch(/^★ d0 · doc · Channel plan/);
		expect(index.text).toContain('§ Schedule · Formats');
		expect(index.text).not.toContain('Upload every other Tuesday');
	});

	it('resolves headings the model names to section anchors', () => {
		const plan = youtube.find((entity) => entity.ref === 'd0')!;
		const found = resolveSections(plan, ['schedule', 'Nope']);
		expect(found.headings).toEqual(['Schedule']);
		expect(found.anchors).toHaveLength(1);
		expect(found.missing).toEqual(['Nope']);
	});
});

describe('follow-up memory', () => {
	const history: ChatHistoryTurn[] = [
		{
			user: 'the banner redesign is dead',
			answer: '1. Archive "Design new channel banner"?',
			threads: [
				{
					alias: 'P2',
					projectId: 'replay-yt',
					project: 'YouTube channel',
					read: [],
					saved: [],
					asked: ['1. Archive "Design new channel banner"?'],
					answers: [],
					covered: [],
					failed: null
				}
			]
		}
	];
	it('gives the planner the earlier questions so "yes" lands on the right project', () => {
		expect(historyBlock(history)).toContain('P2 YouTube channel: asked: 1. Archive');
		const prompt = buildPlanPrompt({
			message: 'yes',
			sentences: [{ n: 1, start: 0, end: 3 }],
			projects: [
				{ alias: 'P2', id: 'replay-yt', name: 'YouTube channel', description: null }
			],
			today: 'Thursday 2026-11-05',
			history
		});
		expect(prompt).toContain('Earlier in this chat');
		expect(prompt.trim().endsWith('[1] yes')).toBe(true);
	});
});

async function runTurn(history: ChatHistoryTurn[]): Promise<ChatTurnEvent[]> {
	const stream = streamChatTurn({
		session: {} as never,
		admin: {} as never,
		userId: 'user-1',
		message: '',
		history,
		projectId: null,
		mode: 'replay'
	});
	const text = await new Response(stream).text();
	return text
		.trim()
		.split('\n')
		.map((line) => JSON.parse(line) as ChatTurnEvent);
}

describe('replay conversation', () => {
	it('runs three turns: parallel threads, a confirmed follow-up, and a drill-in', async () => {
		const history: ChatHistoryTurn[] = [];
		const turns: ChatTurnEvent[][] = [];
		for (let turn = 0; turn < 3; turn += 1) {
			const events = await runTurn(history);
			turns.push(events);
			const error = events.find((event) => event.type === 'error');
			expect(error).toBeUndefined();
			const start = events.find((event) => event.type === 'start')!;
			const answer = events.find((event) => event.type === 'answer_done')!;
			history.push({
				user: start.type === 'start' ? start.message : '',
				answer: answer.type === 'answer_done' ? answer.text : '',
				threads: events.flatMap((event) =>
					event.type === 'thread_done' ? [event.report] : []
				)
			});
		}

		// Turn 1: two threads; YouTube read the Schedule section and asked before archiving.
		const one = turns[0]!;
		const reports = one.flatMap((event) =>
			event.type === 'thread_done' ? [event.report] : []
		);
		expect(reports.map((report) => report.project).sort()).toEqual([
			'Fading Crown',
			'YouTube channel'
		]);
		const yt = reports.find((report) => report.project === 'YouTube channel')!;
		expect(yt.read[0]).toContain('Channel plan › Schedule');
		expect(yt.saved).toEqual(['task "Edit the sampler video": state in_progress → done']);
		expect(yt.asked[0]).toMatch(/^1\. Archive "Design new channel banner"\?/);
		expect(yt.answers[0]).toContain('every other Tuesday'.replace('every', 'Every'));
		const fc = reports.find((report) => report.project === 'Fading Crown')!;
		expect(fc.saved[0]).toContain('due 2026-11-14 → 2026-11-06');
		const items = one.filter((event) => event.type === 'item');
		expect(items.every((event) => event.type === 'item' && event.item.match === 'exact')).toBe(
			true
		);

		// Turn 2: the "yes" is confirmed, so the archive saves; the work piece drafts a doc.
		const two = turns[1]!.flatMap((event) =>
			event.type === 'thread_done' ? [event.report] : []
		);
		expect(two).toHaveLength(1);
		expect(two[0]!.saved[0]).toBe('archive task "Design new channel banner"');
		expect(two[0]!.saved[1]).toMatch(
			/^new doc "Behind-the-scenes series plan" \(\d+ chars drafted\)$/
		);
		expect(two[0]!.read).toHaveLength(2);

		// Turn 3: one thread reads three records, answers, and asks about a date it is unsure of.
		const three = turns[2]!;
		const steps = three.filter(
			(event) =>
				event.type === 'thread_step' &&
				event.step.kind === 'read' &&
				event.step.state === 'done'
		);
		expect(steps).toHaveLength(3);
		const report = three.flatMap((event) =>
			event.type === 'thread_done' ? [event.report] : []
		)[0]!;
		expect(report.answers[0]).toMatch(/^Mostly\./);
		expect(report.asked[0]).toBe(
			'1. Set the beta-reader milestone to Dec 15? (milestone "Full draft to beta readers": due (none) → 2026-12-15)'
		);
		const done = three.find((event) => event.type === 'done');
		expect(done?.type === 'done' && done.totals.threads).toBe(1);
	}, 30_000);
});
