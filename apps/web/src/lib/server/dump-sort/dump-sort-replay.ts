// apps/web/src/lib/server/dump-sort/dump-sort-replay.ts
//
// A free replay for the "watch it sort" prototype: a fixed dump, fixed projects with a few
// existing records, and scripted model answers streamed in small chunks at a realistic pace.
// Both stages run through the same line readers, quote finder, and record builder as a live
// run, so the page can be checked without spending.
import type { ContextFinderProjectV1 } from '@buildos/agentic-chat-runtime/context-finder';
import type { DumpProject } from './dump-sort-core';
import type { ThreadReplay } from './dump-sort-thread';

export const REPLAY_TEXT = `ok the novel, Fading Crown. I really need to finish the draft before the holidays and get it to beta readers next month. Act II still sags in the middle.
I should email Priya about the cover sketches this week. also the magic rules keep changing, I need to write them down somewhere so I stop contradicting myself.
for the channel, the sampler video is done finally. next one should be a behind the scenes on how I outline chapters. wait what did we decide about the upload schedule?
and random but I want to start fixing up the kitchen, get three quotes for new counters by the end of the month.`;

export const REPLAY_PROJECTS: DumpProject[] = [
	{
		alias: 'P1',
		id: 'replay-fc',
		name: 'Fading Crown',
		description: 'Fantasy novel. Queen Isolde is losing her magic as the wards fail.'
	},
	{
		alias: 'P2',
		id: 'replay-yt',
		name: 'YouTube channel',
		description: 'Writing-process videos for the novel audience.'
	},
	{
		alias: 'P3',
		id: 'replay-bakery',
		name: 'Bakery launch',
		description: 'Weekend sourdough stand at the farmers market.'
	},
	{ alias: 'W', id: null, name: 'Workspace', description: 'Loose notes and tasks' }
];

export const REPLAY_ANSWER = [
	'{"focus":["P1","P2"],"new":[{"id":"N1","name":"Kitchen refresh"}]}',
	'{"s":1,"q":"Fading Crown","kind":"context","to":"P1","title":"Fantasy novel in progress"}',
	'{"s":2,"q":"finish the draft before the holidays","kind":"goal","to":"P1","title":"Finish the draft before the holidays","due":"2026-12-20"}',
	'{"s":2,"q":"get it to beta readers next month","kind":"milestone","to":"P1","title":"Draft to beta readers","due":"2026-12-01"}',
	'{"s":3,"q":"Act II still sags in the middle","kind":"risk","to":"P1","title":"Act II sags in the middle"}',
	'{"s":4,"q":"email Priya about the cover sketches","kind":"task","to":"P1","title":"Email Priya about the cover sketches"}',
	'{"s":5,"q":"the magic rules keep changing","kind":"doc","to":"P1","title":"Magic rules"}',
	'{"s":6,"q":"the sampler video is done","kind":"update","to":"P2","title":"Sampler video finished"}',
	'{"s":7,"q":"behind the scenes on how I outline chapters","kind":"task","to":"P2","title":"Make a behind-the-scenes video on outlining chapters"}',
	'{"s":8,"q":"what did we decide about the upload schedule","kind":"ask","to":"P2","title":"What is the upload schedule?"}',
	'{"s":9,"q":"start fixing up the kitchen","kind":"project","to":"N1","title":"Kitchen refresh"}',
	'{"s":9,"q":"get three quotes for new counters","kind":"task","to":"N1","title":"Get three quotes for new counters","due":"2026-11-30"}'
].join('\n');

const at = (days: number) => new Date(Date.UTC(2026, 10, 4 - days)).toISOString();

/** What each replay project already holds, in the shape the context finder loads. */
export const REPLAY_RECORDS: Record<string, ContextFinderProjectV1> = {
	'replay-fc': {
		project: {
			id: 'replay-fc',
			name: 'Fading Crown',
			description: REPLAY_PROJECTS[0]!.description
		},
		documents: [
			{
				id: 'fc-d0',
				title: 'Magic system notes',
				description: 'How magic and the wards work',
				type_key: 'document.notes',
				content:
					'## Rules\nMagic is drawn from the wards. Only the crown can renew them.\n## Open questions\nCan Isolde borrow magic from the river spirits?',
				updated_at: at(9)
			},
			{
				id: 'fc-d1',
				title: 'Act II outline',
				description: 'Chapter beats for Act II',
				type_key: 'document.outline',
				content: '## Ch. 9 to 16\nThe siege, the bargain, the fall of the east ward.',
				updated_at: at(4)
			}
		],
		tasks: [
			{
				id: 'fc-t0',
				title: 'Revise chapter 13 beats',
				state_key: 'in_progress',
				updated_at: at(1)
			},
			{
				id: 'fc-t1',
				title: 'Email Priya about cover sketches',
				state_key: 'todo',
				due_at: '2026-11-14T17:00:00Z',
				description: 'Ask for two cover directions.',
				updated_at: at(6)
			},
			{ id: 'fc-t2', title: 'Line edit Act I', state_key: 'done', updated_at: at(12) }
		],
		goals: [
			{
				id: 'fc-g0',
				name: 'Complete first draft',
				state_key: 'active',
				target_date: '2027-01-31',
				updated_at: at(20)
			}
		],
		plans: [],
		milestones: [
			{ id: 'fc-m0', title: 'Act I locked', state_key: 'completed', updated_at: at(15) },
			{
				id: 'fc-m1',
				title: 'Full draft to beta readers',
				state_key: 'pending',
				updated_at: at(15)
			}
		],
		risks: []
	},
	'replay-yt': {
		project: {
			id: 'replay-yt',
			name: 'YouTube channel',
			description: REPLAY_PROJECTS[1]!.description
		},
		documents: [
			{
				id: 'yt-d0',
				title: 'Channel plan',
				description: 'Schedule and formats',
				type_key: 'document.plan',
				content:
					'## Schedule\nUpload every other Tuesday at 9 AM. Shorts on Fridays.\n## Formats\nWriting-process videos and chapter breakdowns.',
				updated_at: at(10)
			}
		],
		tasks: [
			{
				id: 'yt-t0',
				title: 'Edit the sampler video',
				state_key: 'in_progress',
				updated_at: at(2)
			},
			{
				id: 'yt-t1',
				title: 'Design new channel banner',
				state_key: 'todo',
				updated_at: at(8)
			},
			{
				id: 'yt-t2',
				title: 'Film a behind-the-scenes video on outlining',
				state_key: 'todo',
				updated_at: at(3)
			}
		],
		goals: [],
		plans: [],
		milestones: [],
		risks: []
	}
};

/** Scripted Jev picks and decisions per replay project (refs follow the finder's order). */
export const REPLAY_THREADS: Record<string, ThreadReplay> = {
	'replay-fc': {
		findMs: 650,
		firstTokenMs: 700,
		pick: [
			{ id: 'fc-t1', p: 0.91 },
			{ id: 'fc-d0', p: 0.82 },
			{ id: 'fc-g0', p: 0.77 },
			{ id: 'fc-m1', p: 0.74 },
			{ id: 'fc-d1', p: 0.41 }
		],
		answer: [
			'{"piece":2,"op":"update","ref":"g0","set":{"due":"2026-12-20"},"why":"same goal, earlier target"}',
			'{"piece":3,"op":"update","ref":"m1","set":{"due":"2026-12-01"},"why":"the beta read gets a date"}',
			'{"piece":4,"op":"create","kind":"risk","title":"Act II sags in the middle","description":"","due":null,"why":"no risk tracked for this yet"}',
			'{"piece":5,"op":"update","ref":"t1","set":{"due":"2026-11-07"},"why":"same task, moved to this week"}',
			'{"piece":6,"op":"update","ref":"d0","set":{"add":"The rules keep changing. Pin them down so the draft stops contradicting itself."},"why":"belongs in the magic notes"}'
		].join('\n')
	},
	'replay-yt': {
		findMs: 520,
		firstTokenMs: 600,
		pick: [
			{ id: 'yt-t0', p: 0.93 },
			{ id: 'yt-t2', p: 0.88 },
			{ id: 'yt-d0', p: 0.85 },
			{ id: 'yt-t1', p: 0.22 }
		],
		answer: [
			'{"piece":7,"op":"update","ref":"t0","set":{"state":"done"},"why":"you finished it"}',
			'{"piece":8,"op":"covered","ref":"t2","why":"already on your list"}',
			'{"piece":9,"op":"answer","text":"Every other Tuesday at 9 AM, with Shorts on Fridays.","refs":["d0"]}'
		].join('\n')
	}
};

/** Pace roughly like a fast model: ~900 ms to first token, then ~120 tokens a second. */
export async function* replayChunks(signal?: AbortSignal): AsyncGenerator<string> {
	await wait(900, signal);
	for (let index = 0; index < REPLAY_ANSWER.length; index += 12) {
		if (signal?.aborted) return;
		yield REPLAY_ANSWER.slice(index, index + 12);
		await wait(28, signal);
	}
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener('abort', () => {
			clearTimeout(timer);
			resolve();
		});
	});
}
