// apps/worker/tests/chatCheckpointCapture.test.ts
//
// Chat checkpoint capture (tasker/95) over the frozen book-loop fixture, with
// canned model replies and in-memory ports: no database and no model calls.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	type CheckpointCapturePorts,
	runChatCheckpointCapture
} from '../src/workers/chat/checkpoint/checkpointCapture';
import {
	type SectionEdit,
	applySectionEdit,
	normalizeSynthesisReply,
	normalizeThinkingLogReply,
	restatedAdditions
} from '../src/workers/chat/checkpoint/capturePrompts';
import {
	type MemoryCheckpointFixture,
	approveMemoryReview,
	createMemoryCheckpointPorts
} from '../src/workers/chat/checkpoint/memoryPorts';
import {
	findStartHereManagedRegionRanges,
	readStartHereDocumentSections,
	splitStartHereSectionBlocks
} from '../../../packages/shared-agent-ops/src/ontology/start-here';

type RawFixture = {
	timezone: string;
	project: { id: string; name: string; created_at: string; created_by: string };
	startHere: { id: string; content: string };
	documents: Array<{ id: string; title: string; type_key: string }>;
	entityIds: Record<string, string[]>;
	sessions: Array<{
		id: string;
		title: string | null;
		messages: Array<{ id: string; role: string; content: string; created_at: string }>;
	}>;
};

const raw = JSON.parse(
	readFileSync(
		new URL('../../../scripts/book-loop/capture-eval/fixtures/book-loop.json', import.meta.url),
		'utf8'
	)
) as RawFixture;
const USER_ID = 'user-1';
const THEME_SESSION = '0c16b8c9-380f-40bb-9c7c-6456b326803c';
const T04 = '6b78b479-28fa-4a77-ada1-cf17cf43ee30';
const T05 = '8fa99c9d-4f22-4447-9410-485b7e913edc';
const NOW = new Date('2026-09-22T20:05:00.000Z');

function fixture(): MemoryCheckpointFixture {
	return {
		timezone: raw.timezone,
		project: raw.project,
		startHere: raw.startHere,
		thinkingLog: null,
		entities: raw.documents.map((doc) => ({ type: 'document', id: doc.id, title: doc.title })),
		sessions: raw.sessions.map((session) => ({ ...session, userId: USER_ID }))
	};
}

const t05 = raw.sessions[1]!.messages.find((message) => message.id === T05)!.content;
const t05Cleaned = t05.replace(/\n\nThat's where my head is at\..*$/s, '');

function section(content: string, heading: string): string {
	return (
		readStartHereDocumentSections(content).find((candidate) => candidate.heading === heading)
			?.body ?? ''
	);
}

function fences(content: string): string[] {
	return findStartHereManagedRegionRanges(content).map((range) =>
		content.slice(range.from, range.to)
	);
}

type Replies = { log: unknown; synthesis: unknown };

/** Canned model: replies are read at call time, so a test can swap them between checkpoints. */
function canned(initial: Replies): CheckpointCapturePorts['completeJson'] & {
	calls: string[];
	replies: Replies;
} {
	const fn = (async ({ operation }) => {
		fn.calls.push(operation);
		return operation === 'thinking_log' ? fn.replies.log : fn.replies.synthesis;
	}) as CheckpointCapturePorts['completeJson'] & { calls: string[]; replies: Replies };
	fn.calls = [];
	fn.replies = initial;
	return fn;
}

const decisions = section(raw.startHere.content, 'Decisions');
const openQuestions = section(raw.startHere.content, 'Open questions');

/** Block ids as the engine numbers them: b1… across the document's sections, in order. */
function blockIds(content: string, heading: string): string[] {
	let next = 1;
	for (const candidate of readStartHereDocumentSections(content)) {
		const ids = splitStartHereSectionBlocks(candidate.body).map(() => `b${next++}`);
		if (candidate.heading === heading) return ids;
	}
	return [];
}

const themeReplies = {
	log: {
		topic: 'Stability and anti-fragility; bridges, not defenses',
		passages: [{ message_id: T05, text: t05Cleaned }]
	},
	synthesis: {
		edits: [
			{
				heading: 'Decisions',
				// The model dates a new bullet itself; code must replace that date.
				add: [
					{
						markdown:
							'- **Exclusions dropped** — Not needed in the contract. _(2025-06-01)_'
					},
					{
						after: blockIds(raw.startHere.content, 'Decisions').at(-1),
						markdown:
							'- **Dual thesis** — Anti-fragility is the method; stability is the felt result.'
					}
				],
				rationale: 'Two new decisions.'
			},
			{
				heading: 'What this is',
				rewrite: 'A practical playbook. Stability through anti-fragility.',
				rationale: 'Twin of the custom heading.'
			},
			{
				heading: 'Open questions',
				remove: [blockIds(raw.startHere.content, 'Open questions')[0]],
				add: [
					{
						markdown:
							'- **Theme sharpening** — Which frameworks carry social anti-fragility? See [[document:story-blueprint-template|Story Blueprint Template]].'
					}
				],
				rationale: 'Exclusions answered; theme question opened.'
			},
			{
				heading: 'Current state',
				rewrite:
					'- **Contract:** locked; Exclusions dropped.\n- **Theme:** social anti-fragility, bridges not defenses.',
				rationale: 'Snapshot.'
			}
		]
	}
};

describe('chat checkpoint capture (tasker/95)', () => {
	it('logs the user in their own words and applies only safe START HERE changes', async () => {
		const { ports, state } = createMemoryCheckpointPorts(fixture(), canned(themeReplies));
		const outcome = await runChatCheckpointCapture(ports, {
			sessionId: THEME_SESSION,
			userId: USER_ID,
			trigger: 'threshold',
			now: NOW
		});

		expect(outcome.status).toBe('captured');
		const log = state.thinkingLog!.content;
		expect(log).toMatch(/^# Thinking log — 100-Day Nonfiction Book Project\n/);
		expect(log).toContain(
			'## 2026-09-22 · Stability and anti-fragility; bridges, not defenses\n\n_From chat "Shaping nonfiction book theme: stability throug..." · 3:50 PM_'
		);
		expect(log).toContain('build bridges rather than defenses — connect with people');
		expect(log).not.toContain('Help me shape this');

		const doc = state.startHere.content;
		expect(fences(doc)).toEqual(fences(raw.startHere.content));
		expect(doc).not.toMatch(/^## What this is$/m);
		expect(section(doc, 'Decisions')).toBe(
			[
				decisions,
				'- **Dual thesis** — Anti-fragility is the method; stability is the felt result. _(2026-09-22)_',
				'- **Exclusions dropped** — Not needed in the contract. _(2026-09-22)_'
			].join('\n')
		);
		// Added now, but the answered question stays until the review is approved.
		expect(section(doc, 'Open questions')).toBe(
			`${openQuestions}\n- **Theme sharpening** — Which frameworks carry social anti-fragility? See Story Blueprint Template.`
		);
		expect(section(doc, 'Current state')).toContain('bridges not defenses');
		expect(section(doc, 'Core philosophy')).toBe(
			section(raw.startHere.content, 'Core philosophy')
		);

		const [review] = state.reviews;
		expect(review?.status).toBe('proposal_ready');
		expect(section(review!.content, 'What this is')).toBe(
			'A practical playbook. Stability through anti-fragility.'
		);
		expect(section(review!.content, 'Open questions')).not.toContain('Exclusions field');
		expect(fences(review!.content)).toEqual(fences(raw.startHere.content));
		expect(outcome.status === 'captured' && outcome.record.droppedLinks).toBe(1);
		expect(outcome.status === 'captured' && outcome.record.review?.sections).toEqual([
			'What this is',
			'Open questions'
		]);
	});

	it('dates a backfill to the chat and leaves the current state snapshot alone', async () => {
		const { ports, state } = createMemoryCheckpointPorts(fixture(), canned(themeReplies));
		const outcome = await runChatCheckpointCapture(ports, {
			sessionId: THEME_SESSION,
			userId: USER_ID,
			trigger: 'backfill',
			now: new Date('2026-10-05T15:00:00.000Z')
		});

		expect(outcome.status).toBe('captured');
		expect(state.thinkingLog!.content).toContain(
			'## 2026-09-22 · Stability and anti-fragility'
		);
		expect(section(state.startHere.content, 'Decisions')).toContain(
			'- **Dual thesis** — Anti-fragility is the method; stability is the felt result. _(2026-09-22)_'
		);
		expect(section(state.startHere.content, 'Current state')).toBe(
			section(raw.startHere.content, 'Current state')
		);
		expect(outcome.status === 'captured' && outcome.record.skipped).toContainEqual({
			heading: 'Current state',
			reason: 'locked'
		});
	});

	it('is a no-op when nothing new arrived since the watermark', async () => {
		const completeJson = canned(themeReplies);
		const { ports, state } = createMemoryCheckpointPorts(fixture(), completeJson);
		const input = {
			sessionId: THEME_SESSION,
			userId: USER_ID,
			trigger: 'idle' as const,
			now: NOW
		};
		await runChatCheckpointCapture(ports, input);
		const writes = state.writes;
		const again = await runChatCheckpointCapture(ports, input);

		expect(again).toEqual({ status: 'skipped', reason: 'nothing_new' });
		expect(state.writes).toBe(writes);
		expect(completeJson.calls).toHaveLength(2);
	});

	it('logs the message as written when the model paraphrases it', async () => {
		const { ports, state } = createMemoryCheckpointPorts(
			fixture(),
			canned({
				log: {
					topic: 'Theme',
					passages: [
						{
							message_id: T05,
							text: 'The user believes stability and anti-fragility are identical.'
						},
						{ message_id: 'not-a-user-message', text: 'Invented.' }
					]
				},
				synthesis: { edits: [] }
			})
		);
		await runChatCheckpointCapture(ports, {
			sessionId: THEME_SESSION,
			userId: USER_ID,
			trigger: 'idle',
			now: NOW
		});
		const log = state.thinkingLog!.content;
		expect(log).toContain(t05.trim());
		expect(log).not.toContain('The user believes');
		expect(log).not.toContain('Invented.');
	});

	it('keeps an unreviewed proposal when a later checkpoint changes the doc', async () => {
		const base = fixture();
		const completeJson = canned(themeReplies);
		const { ports, state } = createMemoryCheckpointPorts(base, completeJson);
		state.visibleThrough.set(THEME_SESSION, raw.sessions[1]!.messages[1]!.id);
		await runChatCheckpointCapture(ports, {
			sessionId: THEME_SESSION,
			userId: USER_ID,
			trigger: 'threshold',
			now: NOW
		});
		expect(state.reviews).toHaveLength(1);

		// Next checkpoint: one more decision, nothing to review on its own.
		state.visibleThrough.delete(THEME_SESSION);
		completeJson.replies = {
			log: { topic: 'Bridges', passages: [{ message_id: T05, text: t05Cleaned }] },
			synthesis: {
				edits: [
					{
						heading: 'Decisions',
						add: [{ markdown: '- **Bridges, not defenses** — The social thesis.' }],
						rationale: 'New decision.'
					}
				]
			}
		};
		await runChatCheckpointCapture(ports, {
			sessionId: THEME_SESSION,
			userId: USER_ID,
			trigger: 'threshold',
			now: NOW
		});

		expect(section(state.startHere.content, 'Decisions')).toContain(
			'- **Bridges, not defenses** — The social thesis. _(2026-09-22)_'
		);
		expect(state.reviews.map((review) => review.status)).toEqual([
			'superseded',
			'proposal_ready'
		]);
		expect(approveMemoryReview(state)).toBe(true);
		const approved = state.startHere.content;
		expect(section(approved, 'What this is')).toBe(
			'A practical playbook. Stability through anti-fragility.'
		);
		expect(section(approved, 'Open questions')).not.toContain('Exclusions field');
		expect(section(approved, 'Decisions')).toContain('Bridges, not defenses');
		expect(fences(approved)).toEqual(fences(raw.startHere.content));
		expect(state.records.map((record) => record.throughMessageId)).toEqual([
			raw.sessions[1]!.messages[1]!.id,
			raw.sessions[1]!.messages[3]!.id
		]);
		expect(T04).toBe(raw.sessions[1]!.messages[0]!.id);
	});

	it("applies an old pending proposal's additions and keeps only its removals in review", async () => {
		const { ports, state } = createMemoryCheckpointPorts(
			fixture(),
			canned({ log: { passages: [] }, synthesis: { edits: [] } })
		);
		// An old-style (tasker 93) proposal: one new decision plus a removed question.
		state.reviews.push({
			runId: 'old-run',
			before: raw.startHere.content,
			content: raw.startHere.content
				.replace(
					decisions,
					`${decisions}\n- **Exclusions dropped** — Not needed. _(2026-09-20)_`
				)
				.replace(`${openQuestions.split('\n')[0]}\n`, ''),
			rationale: 'old',
			status: 'proposal_ready'
		});
		const outcome = await runChatCheckpointCapture(ports, {
			sessionId: THEME_SESSION,
			userId: USER_ID,
			trigger: 'idle',
			now: NOW
		});

		expect(outcome.status).toBe('captured');
		expect(section(state.startHere.content, 'Decisions')).toBe(
			`${decisions}\n- **Exclusions dropped** — Not needed. _(2026-09-22)_`
		);
		expect(section(state.startHere.content, 'Open questions')).toBe(openQuestions);
		expect(state.reviews.map((review) => [review.runId, review.status])).toEqual([
			['old-run', 'superseded'],
			['review-2', 'proposal_ready']
		]);
		expect(section(state.reviews[1]!.content, 'Open questions')).toBe(
			openQuestions.split('\n').slice(1).join('\n')
		);
	});

	it('advances the watermark without model calls when only the assistant spoke', async () => {
		const completeJson = canned(themeReplies);
		const { ports, state } = createMemoryCheckpointPorts(fixture(), completeJson);
		state.watermarks.set(THEME_SESSION, T05);
		const outcome = await runChatCheckpointCapture(ports, {
			sessionId: THEME_SESSION,
			userId: USER_ID,
			trigger: 'idle',
			now: NOW
		});
		expect(outcome.status).toBe('noop');
		expect(completeJson.calls).toEqual([]);
		expect(state.watermarks.get(THEME_SESSION)).toBe(raw.sessions[1]!.messages[3]!.id);
	});
});

describe('section edits', () => {
	const blocks = [
		{ id: 'b1', markdown: '- **One** — first.' },
		{ id: 'b2', markdown: '- **Two** — second.' }
	];
	const edit = (patch: Partial<SectionEdit>): SectionEdit => ({
		heading: 'Decisions',
		add: [],
		remove: [],
		replace: [],
		rewrite: null,
		rationale: '',
		...patch
	});

	it('applies add, remove and replace by id and strips echoed ids', () => {
		expect(
			applySectionEdit(
				blocks,
				edit({
					add: [
						{ after: 'b1', restates: null, markdown: '[b3] - **Three** — third.' },
						{
							after: 'b99',
							restates: null,
							markdown: '- **Four** — unknown anchor goes last.'
						}
					],
					remove: ['b2'],
					replace: [{ id: 'b1', markdown: '[b1] - **One** — first, revised.' }]
				})
			)
		).toEqual([
			'- **One** — first, revised.',
			'- **Three** — third.',
			'- **Four** — unknown anchor goes last.'
		]);
	});

	it('drops an addition the model marked as restating a line anywhere in the doc', () => {
		const restating = edit({
			add: [
				{ after: null, restates: 'b7', markdown: '- **One again** — same point.' },
				{
					after: null,
					restates: 'b404',
					markdown: '- **Five** — unknown restates id is kept.'
				}
			]
		});
		const documentIds = new Set(['b1', 'b2', 'b7']);
		expect(applySectionEdit(blocks, restating, documentIds)).toEqual([
			'- **One** — first.',
			'- **Two** — second.',
			'- **Five** — unknown restates id is kept.'
		]);
		expect(restatedAdditions(restating, documentIds)).toBe(1);
		expect(
			normalizeSynthesisReply({
				edits: [{ heading: 'Decisions', add: [{ restates: ' b7 ', markdown: 'x' }] }]
			}).edits[0]?.add
		).toEqual([{ after: null, restates: 'b7', markdown: 'x' }]);
	});

	it('lets a rewrite replace the whole section', () => {
		expect(applySectionEdit(blocks, edit({ rewrite: '[b1] - Snapshot.' }))).toEqual([
			'- Snapshot.'
		]);
	});

	it('does not log passages the model labeled as instructions', () => {
		expect(
			normalizeThinkingLogReply({
				topic: 'Prep',
				passages: [
					{
						message_id: 'm1',
						kind: 'instruction',
						text: 'Can you research the luncheon?'
					},
					{
						message_id: 'm2',
						kind: 'thinking',
						text: 'I think the room is mostly owners.'
					},
					{ message_id: 'm3', text: 'Unlabeled passages are kept.' }
				]
			}).passages.map((passage) => passage.messageId)
		).toEqual(['m2', 'm3']);
	});

	it('drops malformed edits', () => {
		expect(
			normalizeSynthesisReply({
				edits: [
					{ heading: 'Decisions' },
					{ heading: '', add: [{ markdown: 'x' }] },
					{
						heading: 'Decisions',
						add: [{ markdown: '  ' }, { markdown: '- ok' }],
						remove: [1, 'b2']
					}
				]
			}).edits
		).toEqual([
			{
				heading: 'Decisions',
				add: [{ after: null, restates: null, markdown: '- ok' }],
				remove: ['b2'],
				replace: [],
				rewrite: null,
				rationale: 'Captured from chat.'
			}
		]);
	});
});
