// apps/web/src/lib/server/thread-chat/thread-chat-replay.ts
//
// A free four-message conversation for the chat lab, over the /lab/sort replay projects.
// Scripted: the plan lines, Jev's picks, which reads each thread asks for, its decision
// lines, and the reply. Real: the line readers, the apply-or-ask rule, ref and heading
// resolution, the reads themselves (against the replay rows), reports, follow-up memory, and
// the carried context (turn 2 starts with turn 1's Schedule section and skips rereading it).
import type { ChatThreadReplay } from './thread-chat-thread';

export type ReplayChatTurn = {
	message: string;
	plan: string;
	threads: Record<string, ChatThreadReplay>;
	answer: string;
};

const lines = (...values: unknown[]) => values.map((value) => JSON.stringify(value)).join('\n');

export const REPLAY_CHAT_TURNS: ReplayChatTurn[] = [
	{
		message:
			'Finally finished the sampler video. Can you push the Priya email to Friday? What did we decide about the upload schedule again? Also I think the banner redesign is dead.',
		plan: lines(
			{ focus: ['P2', 'P1'], new: [] },
			{
				s: 1,
				q: 'finished the sampler video',
				kind: 'update',
				to: 'P2',
				title: 'The sampler video is finished'
			},
			{
				s: 2,
				q: 'push the Priya email to Friday',
				kind: 'update',
				to: 'P1',
				title: 'Move the Priya email to Friday',
				due: '2026-11-06'
			},
			{
				s: 3,
				q: 'What did we decide about the upload schedule',
				kind: 'ask',
				to: 'P2',
				title: 'What is the upload schedule?'
			},
			{
				s: 4,
				q: 'the banner redesign is dead',
				kind: 'update',
				to: 'P2',
				title: 'Drop the banner redesign'
			}
		),
		threads: {
			'replay-yt': {
				findMs: 480,
				pick: [
					{ id: 'yt-t0', p: 0.93 },
					{ id: 'yt-d0', p: 0.86 },
					{ id: 'yt-t1', p: 0.71 }
				],
				rounds: [
					{ reads: [{ tool: 'read_doc', args: { ref: 'd0', sections: ['Schedule'] } }] },
					{
						answer: lines(
							{
								piece: 1,
								op: 'update',
								ref: 't0',
								set: { state: 'done' },
								why: 'you finished it',
								sure: true
							},
							{
								piece: 3,
								op: 'answer',
								text: 'Every other Tuesday at 9 AM, with Shorts on Fridays.',
								refs: ['d0']
							},
							{
								piece: 4,
								op: 'archive',
								ref: 't1',
								why: 'you think the redesign is dead',
								sure: true,
								ask: 'Archive "Design new channel banner"?'
							},
							{ op: 'keep', items: [{ ref: 'd0', sections: ['Schedule'] }] }
						)
					}
				]
			},
			'replay-fc': {
				findMs: 420,
				pick: [
					{ id: 'fc-t1', p: 0.94 },
					{ id: 'fc-g0', p: 0.31 }
				],
				rounds: [
					{
						answer: lines(
							{
								piece: 2,
								op: 'update',
								ref: 't1',
								set: { due: '2026-11-06' },
								why: 'same task, moved to Friday',
								sure: true,
								confirmed: true
							},
							{ op: 'keep', items: [] }
						)
					}
				]
			}
		},
		answer: 'The upload schedule is every other Tuesday at 9 AM, with Shorts on Fridays.\n\nYouTube channel: marked "Edit the sampler video" done.\nFading Crown: moved "Email Priya about cover sketches" to Friday, Nov 6.\n\n1. Archive "Design new channel banner"? You said you think the redesign is dead.'
	},
	{
		message:
			'yes archive it. and for the channel, look at what we have and draft a plan for a behind-the-scenes series',
		plan: lines(
			{ focus: ['P2'], new: [] },
			{
				s: 1,
				q: 'yes archive it',
				kind: 'update',
				to: 'P2',
				title: 'Yes: archive Design new channel banner',
				cont: true
			},
			{
				s: 2,
				q: 'draft a plan for a behind-the-scenes series',
				kind: 'work',
				to: 'P2',
				title: 'Draft a plan for a behind-the-scenes video series'
			}
		),
		threads: {
			'replay-yt': {
				findMs: 450,
				pick: [
					{ id: 'yt-t1', p: 0.95 },
					{ id: 'yt-t2', p: 0.9 },
					{ id: 'yt-d0', p: 0.88 }
				],
				rounds: [
					{
						reads: [
							// Schedule came over from turn 1, so only Formats is read.
							{
								tool: 'read_doc',
								args: { ref: 'd0', sections: ['Schedule', 'Formats'] }
							},
							{ tool: 'read_record', args: { ref: 't2' } }
						]
					},
					{
						answer: lines(
							{
								piece: 1,
								op: 'archive',
								ref: 't1',
								why: 'you said yes',
								sure: true,
								confirmed: true
							},
							{
								piece: 2,
								op: 'create',
								kind: 'doc',
								title: 'Behind-the-scenes series plan',
								description: 'Four episodes on how the novel gets made',
								body: '## Why\nThe channel is writing-process videos for people who read the novel. A series gives them a reason to come back every other Tuesday.\n\n## Episodes\n1. How I outline a chapter (the video already on your list)\n2. Building the magic rules so they stop changing\n3. Fixing a sagging middle: Act II, chapters 9 to 16\n4. From draft to beta readers\n\n## Schedule\nOne episode every other Tuesday at 9 AM, with a Short cut from each on the Friday after.',
								due: null,
								why: 'drafted from the channel plan',
								sure: true
							},
							{
								op: 'keep',
								items: [
									{ ref: 'd0', sections: ['Schedule', 'Formats'] },
									{ ref: 't2' }
								]
							}
						)
					}
				]
			}
		},
		answer: 'YouTube channel: archived "Design new channel banner" and drafted "Behind-the-scenes series plan": four episodes, starting with the outlining video already on your list, one every other Tuesday with a Short on the Friday after. Open it to edit.'
	},
	{
		message: 'For Fading Crown, are we on track for the draft goal?',
		plan: lines(
			{ focus: ['P1'], new: [] },
			{
				s: 1,
				q: 'are we on track for the draft goal',
				kind: 'ask',
				to: 'P1',
				title: 'Is the first draft on track?'
			}
		),
		threads: {
			'replay-fc': {
				findMs: 520,
				pick: [
					{ id: 'fc-g0', p: 0.95 },
					{ id: 'fc-m1', p: 0.8 },
					{ id: 'fc-t0', p: 0.7 },
					{ id: 'fc-d1', p: 0.62 }
				],
				rounds: [
					{
						reads: [
							{ tool: 'read_record', args: { ref: 'g0' } },
							{ tool: 'read_record', args: { ref: 'm1' } },
							{ tool: 'read_doc', args: { ref: 'd1', sections: ['Ch. 9 to 16'] } }
						]
					},
					{
						answer: lines(
							{
								piece: 1,
								op: 'answer',
								text: "Mostly. The goal is a full first draft by Jan 31. Act I is locked and you're revising chapter 13, in the middle of Act II (chapters 9 to 16). The beta-reader milestone has no date yet.",
								refs: ['g0', 'm1', 'd1', 't0']
							},
							{
								piece: 1,
								op: 'update',
								ref: 'm1',
								set: { due: '2026-12-15' },
								why: 'a date makes the goal trackable',
								sure: false,
								ask: 'Set the beta-reader milestone to Dec 15?'
							}
						)
					}
				]
			}
		},
		answer: "Mostly on track. The goal is a full first draft by Jan 31. Act I is locked and you're revising chapter 13, in the middle of Act II. The beta-reader milestone has no date yet.\n\n1. Set the beta-reader milestone to Dec 15?"
	},
	{
		// Re-routing (tasker 152): the plan sends this to the channel because of "film"; the
		// channel thread hands it back, a search finds "Act II outline" in Fading Crown, and a
		// second thread answers there.
		message:
			'Before I film the next channel video, what does the Act II outline say about chapters 9 to 16?',
		plan: lines(
			{ focus: ['P2'], new: [] },
			{
				s: 1,
				q: 'what does the Act II outline say about chapters 9 to 16',
				kind: 'ask',
				to: 'P2',
				title: 'What the Act II outline says about chapters 9 to 16'
			}
		),
		threads: {
			'replay-yt': {
				findMs: 300,
				pick: [{ id: 'yt-d0', p: 0.3 }],
				rounds: [
					{
						answer: lines({
							piece: 1,
							op: 'elsewhere',
							look_for: 'Act II outline',
							why: 'the channel has no Act II outline'
						})
					}
				]
			},
			'replay-fc#rerouted': {
				findMs: 350,
				pick: [{ id: 'fc-d1', p: 0.95 }],
				rounds: [
					{
						reads: [
							{ tool: 'read_doc', args: { ref: 'd1', sections: ['Ch. 9 to 16'] } }
						]
					},
					{
						answer: lines({
							piece: 1,
							op: 'answer',
							text: 'Chapters 9 to 16 are the siege, the bargain, and the fall of the east ward.',
							refs: ['d1']
						})
					}
				]
			}
		},
		answer: ''
	}
];

/** The scripted turn for this point in the conversation; it loops after the last one. */
export function replayTurn(turnsSoFar: number): ReplayChatTurn {
	return REPLAY_CHAT_TURNS[turnsSoFar % REPLAY_CHAT_TURNS.length]!;
}
