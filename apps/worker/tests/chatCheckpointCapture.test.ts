// apps/worker/tests/chatCheckpointCapture.test.ts
//
// Chat checkpoint capture (tasker/95) over the frozen book-loop fixture, with
// canned model replies and in-memory ports: no database and no model calls.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	type CheckpointCapturePorts,
	findLoggedThinkingEntry,
	runChatCheckpointCapture
} from '../src/workers/chat/checkpoint/checkpointCapture';
import {
	type SectionEdit,
	START_HERE_SYNTHESIS_SYSTEM_PROMPT,
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
import { buildThinkingLogEntry } from '../../../packages/shared-agent-ops/src/ontology/thinking-log';

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

const t04 = raw.sessions[1]!.messages.find((message) => message.id === T04)!.content;
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
				// The user's own messages: T04 drops Exclusions, T05 states the thesis.
				evidence: [T04, T05],
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
				evidence: [T05],
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
						evidence: [T05],
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

	// A hard-deleted project left its id on the session; writing it into the checkpoint
	// row broke the project foreign key (23503) and failed the job on every retry.
	it('records no project when the project is gone, and still advances the watermark', async () => {
		const completeJson = canned(themeReplies);
		const { ports, state } = createMemoryCheckpointPorts(fixture(), completeJson);
		const messages = raw.sessions.find((session) => session.id === THEME_SESSION)!.messages;

		const outcome = await runChatCheckpointCapture(
			{ ...ports, loadProject: () => Promise.resolve(null) },
			{ sessionId: THEME_SESSION, userId: USER_ID, trigger: 'idle', now: NOW }
		);

		expect(outcome.status).toBe('noop');
		expect(completeJson.calls).toEqual([]);
		expect(state.writes).toBe(0);
		expect(state.records).toHaveLength(1);
		expect(state.records[0]!.projectId).toBeNull();
		expect(state.records[0]!.userMessageCount).toBeGreaterThan(0);
		expect(state.watermarks.get(THEME_SESSION)).toBe(messages[messages.length - 1]!.id);
	});

	it("shows the synthesis model the chat's write receipts, or says it saved none", async () => {
		// Tasker 96 Finding 10: a read-only status chat's "Blueprint: not started"
		// overwrote a correct Current state. Receipts are the evidence of work done.
		const prompts = new Map<string, string>();
		const completeJson = (async ({ operation, userPrompt }) => {
			prompts.set(operation, userPrompt);
			return operation === 'thinking_log' ? { passages: [] } : { edits: [] };
		}) as CheckpointCapturePorts['completeJson'];
		const base = fixture();
		const themeMessages = raw.sessions[1]!.messages;
		const outline = {
			tool: 'update_onto_document',
			kind: 'document',
			title: 'Book Contract & Chapter Blueprint Template'
		};
		base.sessions = base.sessions.map((session) =>
			session.id === THEME_SESSION
				? {
						...session,
						savedChanges: [
							// Before the first message: an earlier stretch of the chat, not this one.
							{ ...outline, title: 'Old write', at: '2026-01-01T00:00:00.000Z' },
							{ ...outline, at: themeMessages[themeMessages.length - 1]!.created_at }
						]
					}
				: session
		);
		const { ports, state } = createMemoryCheckpointPorts(base, completeJson);

		state.watermarks.set(THEME_SESSION, themeMessages[0]!.id);
		await runChatCheckpointCapture(ports, {
			sessionId: THEME_SESSION,
			userId: USER_ID,
			trigger: 'idle',
			now: NOW
		});
		const withWrite = prompts.get('start_here_synthesis')!;
		expect(withWrite).toContain(
			'- [c1] update_onto_document: document "Book Contract & Chapter Blueprint Template"'
		);
		expect(withWrite).not.toContain('Old write');

		await runChatCheckpointCapture(ports, {
			sessionId: raw.sessions[0]!.id,
			userId: USER_ID,
			trigger: 'idle',
			now: NOW
		});
		expect(prompts.get('start_here_synthesis')).toContain(
			'Changes this chat saved: none. These messages changed no project records.'
		);
	});

	it('rewrites Current state only when the edit cites a user message or a saved change', async () => {
		const snapshot = (evidence: string[]) => ({
			log: { passages: [] },
			synthesis: {
				edits: [
					{
						heading: 'Current state',
						rewrite: '- **Blueprint:** not started.',
						evidence,
						rationale: 'Status from the chat.'
					}
				]
			}
		});
		const run = async (evidence: string[], savedChanges = false) => {
			const base = fixture();
			const messages = raw.sessions[1]!.messages;
			base.sessions[1] = {
				...base.sessions[1]!,
				savedChanges: savedChanges
					? [
							{
								tool: 'update_onto_document',
								kind: 'document',
								title: 'Blueprint',
								at: messages[messages.length - 1]!.created_at
							}
						]
					: []
			};
			const { ports, state } = createMemoryCheckpointPorts(base, canned(snapshot(evidence)));
			const outcome = await runChatCheckpointCapture(ports, {
				sessionId: THEME_SESSION,
				userId: USER_ID,
				trigger: 'idle',
				now: NOW
			});
			return {
				currentState: section(state.startHere.content, 'Current state'),
				skipped: 'record' in outcome ? outcome.record.skipped : []
			};
		};

		// Nothing cited, or an id that is not a user message or saved change here.
		for (const evidence of [[], ['assistant-reply'], ['c1']]) {
			const result = await run(evidence);
			expect(result.currentState).toBe(section(raw.startHere.content, 'Current state'));
			expect(result.skipped).toContainEqual({
				heading: 'Current state',
				reason: 'no_evidence'
			});
		}
		expect((await run([T05])).currentState).toBe('- **Blueprint:** not started.');
		expect((await run(['c1'], true)).currentState).toBe('- **Blueprint:** not started.');
	});

	// Decisions save without review and are never removed, so a decision needs the
	// user's own word. A model that reads an assistant suggestion as accepted cites
	// nothing a user said.
	describe('Decisions need a cited user message', () => {
		const withDecisionsEdit = async (edit: Record<string, unknown>) => {
			const base = fixture();
			const messages = raw.sessions[1]!.messages;
			// The chat did save something; that is still not evidence of a decision.
			base.sessions[1] = {
				...base.sessions[1]!,
				savedChanges: [
					{
						tool: 'update_onto_document',
						kind: 'document',
						title: 'Blueprint',
						at: messages[messages.length - 1]!.created_at
					}
				]
			};
			const { ports, state } = createMemoryCheckpointPorts(
				base,
				canned({
					log: { passages: [] },
					synthesis: {
						edits: [{ heading: 'Decisions', rationale: 'From the chat.', ...edit }]
					}
				})
			);
			const outcome = await runChatCheckpointCapture(ports, {
				sessionId: THEME_SESSION,
				userId: USER_ID,
				trigger: 'idle',
				now: NOW
			});
			return {
				decisions: section(state.startHere.content, 'Decisions'),
				reviews: state.reviews,
				skipped: 'record' in outcome ? outcome.record.skipped : []
			};
		};
		const hardcover = { add: [{ markdown: '- **Hardcover first** — Print before ebook.' }] };

		it('drops an added decision that cites nothing, an assistant, or only a saved change', async () => {
			for (const evidence of [[], ['assistant-reply'], ['c1']]) {
				const result = await withDecisionsEdit({ ...hardcover, evidence });
				expect(result.decisions).toBe(decisions);
				expect(result.skipped).toContainEqual({
					heading: 'Decisions',
					reason: 'no_evidence'
				});
			}
		});

		it('saves the decision when the edit cites a user message from this stretch of chat', async () => {
			const result = await withDecisionsEdit({ ...hardcover, evidence: ['c1', T05] });

			expect(result.decisions).toBe(
				`${decisions}\n- **Hardcover first** — Print before ebook. _(2026-09-22)_`
			);
			expect(result.skipped).not.toContainEqual({
				heading: 'Decisions',
				reason: 'no_evidence'
			});
		});

		it('does not propose removing a decision without the user reversing it', async () => {
			const removal = { remove: [blockIds(raw.startHere.content, 'Decisions')[0]] };

			const uncited = await withDecisionsEdit({ ...removal, evidence: [] });
			expect(uncited.decisions).toBe(decisions);
			expect(uncited.reviews).toHaveLength(0);

			// Cited, it still only reaches the user as a review, never an automatic removal.
			const cited = await withDecisionsEdit({ ...removal, evidence: [T05] });
			expect(cited.decisions).toBe(decisions);
			expect(cited.reviews).toHaveLength(1);
		});

		it('tells the model so', () => {
			expect(START_HERE_SYNTHESIS_SYSTEM_PROMPT).toContain(
				'list in "evidence" the id of the user message that makes, accepts or reverses the decision'
			);
			expect(START_HERE_SYNTHESIS_SYSTEM_PROMPT).toContain(
				'a Decisions edit that cites no user message is dropped'
			);
		});
	});

	// The watermark moves only when a checkpoint finishes. A capture that saved the
	// thinking log and then failed (a START HERE conflict, say) is retried over the same
	// messages, and used to prepend the same entry a second time.
	describe('a retried checkpoint', () => {
		const input = {
			sessionId: THEME_SESSION,
			userId: USER_ID,
			trigger: 'idle' as const,
			now: NOW
		};
		/** Ports whose first START HERE save fails, after the thinking log is saved. */
		function failingOnce(replies: Replies) {
			const completeJson = canned(replies);
			const { ports, state } = createMemoryCheckpointPorts(fixture(), completeJson);
			let failed = false;
			const flaky: CheckpointCapturePorts = {
				...ports,
				saveStartHere: async (params) => {
					if (!failed) {
						failed = true;
						throw new Error('Document changed during checkpoint capture');
					}
					return ports.saveStartHere(params);
				}
			};
			return { ports: flaky, state, completeJson };
		}
		const entryCount = (content: string) => content.match(/^## /gm)?.length ?? 0;

		it('does not add the thinking log entry twice', async () => {
			const { ports, state } = failingOnce(themeReplies);

			await expect(runChatCheckpointCapture(ports, input)).rejects.toThrow(
				'Document changed during checkpoint capture'
			);
			// The log was saved, the checkpoint was not: no record, no watermark.
			expect(entryCount(state.thinkingLog!.content)).toBe(1);
			expect(state.records).toHaveLength(0);
			expect(state.watermarks.has(THEME_SESSION)).toBe(false);
			const logAfterFailure = state.thinkingLog!.content;

			const outcome = await runChatCheckpointCapture(ports, input);

			expect(outcome.status).toBe('captured');
			expect(state.thinkingLog!.content).toBe(logAfterFailure);
			expect(entryCount(state.thinkingLog!.content)).toBe(1);
			// START HERE is saved by the retry, and the receipt still names the log entry
			// verbatim, so Undo can remove it.
			expect(section(state.startHere.content, 'Decisions')).toContain('**Dual thesis**');
			const record = state.records[0]!;
			expect(record.thinkingLog?.passageCount).toBe(1);
			expect(state.thinkingLog!.content).toContain(record.thinkingLog!.entry);
		});

		it('recognises its entry when the model words the retry differently', async () => {
			const { ports, state, completeJson } = failingOnce(themeReplies);
			await expect(runChatCheckpointCapture(ports, input)).rejects.toThrow();
			const logAfterFailure = state.thinkingLog!.content;

			// A new topic, and the whole message back instead of the cleaned passage.
			completeJson.replies = {
				...themeReplies,
				log: {
					topic: 'Bridges instead of defenses',
					passages: [{ message_id: T05, text: t05 }]
				}
			};
			const outcome = await runChatCheckpointCapture(ports, input);

			expect(outcome.status).toBe('captured');
			expect(state.thinkingLog!.content).toBe(logAfterFailure);
			expect(entryCount(state.thinkingLog!.content)).toBe(1);
		});

		it('still logs new words in a later checkpoint', async () => {
			const completeJson = canned(themeReplies);
			const { ports, state } = createMemoryCheckpointPorts(fixture(), completeJson);
			// First checkpoint: the first exchange only (T04 and its reply).
			state.visibleThrough.set(THEME_SESSION, raw.sessions[1]!.messages[1]!.id);
			completeJson.replies = {
				log: { topic: 'Exclusions', passages: [{ message_id: T04, text: t04 }] },
				synthesis: { edits: [] }
			};
			await runChatCheckpointCapture(ports, input);
			expect(entryCount(state.thinkingLog!.content)).toBe(1);

			state.visibleThrough.delete(THEME_SESSION);
			completeJson.replies = {
				log: { topic: 'Theme', passages: [{ message_id: T05, text: t05Cleaned }] },
				synthesis: { edits: [] }
			};
			await runChatCheckpointCapture(ports, input);

			expect(entryCount(state.thinkingLog!.content)).toBe(2);
			expect(state.thinkingLog!.content).toContain('build bridges rather than defenses');
		});
	});

	it('names the chat and the project on both model calls, for their cost logs', async () => {
		const calls: Array<{ operation: string; sessionId?: string; projectId?: string }> = [];
		const completeJson = (async ({ operation, sessionId, projectId }) => {
			calls.push({ operation, sessionId, projectId });
			return operation === 'thinking_log' ? { passages: [] } : { edits: [] };
		}) as CheckpointCapturePorts['completeJson'];
		const { ports } = createMemoryCheckpointPorts(fixture(), completeJson);

		await runChatCheckpointCapture(ports, {
			sessionId: THEME_SESSION,
			userId: USER_ID,
			trigger: 'idle',
			now: NOW
		});

		expect(calls).toHaveLength(2);
		for (const call of calls) {
			expect(call.sessionId).toBe(THEME_SESSION);
			expect(call.projectId).toBe(raw.project.id);
		}
		expect(calls.map((call) => call.operation).sort()).toEqual([
			'start_here_synthesis',
			'thinking_log'
		]);
	});
});

describe('findLoggedThinkingEntry', () => {
	const passage =
		'I think the book is about stability, and anti-fragility is how you get there. The reader should build bridges, not defenses.';
	const stamp = { date: '2026-09-22', time: '3:50 PM' };
	const entryFor = (
		text: string,
		overrides: { date?: string; time?: string; topic?: string } = {}
	) =>
		buildThinkingLogEntry({
			date: overrides.date ?? stamp.date,
			time: overrides.time ?? stamp.time,
			topic: overrides.topic ?? 'Stability and anti-fragility',
			chatTitle: 'Shaping the theme',
			passages: [text]
		});
	const older = buildThinkingLogEntry({
		date: '2026-09-20',
		time: '9:02 AM',
		topic: 'Contract',
		chatTitle: null,
		passages: ['I do not need the exclusions section in the contract at all.']
	});
	const logWith = (entry: string) =>
		`# Thinking log — Book\n\n_Your own words from project chats, newest first._\n\n${entry}\n\n${older}\n`;

	it('returns the saved entry verbatim when the same passages are already logged', () => {
		const entry = entryFor(passage);

		expect(findLoggedThinkingEntry({ content: logWith(entry), entry, ...stamp })).toBe(entry);
	});

	it('still finds it under a different topic and a lightly different cleanup', () => {
		const saved = entryFor(passage);
		const retried = entryFor(passage.replace('build bridges, not', 'build bridges and not'), {
			topic: 'Bridges'
		});

		expect(retried).not.toBe(saved);
		expect(findLoggedThinkingEntry({ content: logWith(saved), entry: retried, ...stamp })).toBe(
			saved
		);
	});

	it('finds nothing when the words are new, even at the same date and time', () => {
		const saved = entryFor(passage);
		const other = entryFor(
			'Separately, the launch plan needs a newsletter list before the cover is designed.'
		);

		expect(
			findLoggedThinkingEntry({ content: logWith(saved), entry: other, ...stamp })
		).toBeNull();
	});

	it('finds nothing when the stamp differs, so a repeated thought later is logged again', () => {
		const saved = entryFor(passage);

		expect(
			findLoggedThinkingEntry({
				content: logWith(saved),
				entry: entryFor(passage, { time: '4:15 PM' }),
				date: stamp.date,
				time: '4:15 PM'
			})
		).toBeNull();
		expect(
			findLoggedThinkingEntry({
				content: logWith(saved),
				entry: entryFor(passage, { date: '2026-09-23' }),
				date: '2026-09-23',
				time: stamp.time
			})
		).toBeNull();
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
		evidence: [],
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
				evidence: [],
				rationale: 'Captured from chat.'
			}
		]);
	});
});

describe('global chats feed projects (JEV_GLOBAL_CONTEXT_2026-09-23)', () => {
	/** The same chat, but as a global session whose turns Jev attributed (or not). */
	function globalPorts(attributed: string | null) {
		const memory = createMemoryCheckpointPorts(fixture(), canned(themeReplies));
		const seen: string[][] = [];
		const ports: CheckpointCapturePorts = {
			...memory.ports,
			loadSession: async (params) => {
				const session = await memory.ports.loadSession(params);
				return session ? { ...session, projectId: null } : null;
			},
			attributeProject: async (_session, userMessages) => {
				seen.push(userMessages.map((message) => message.id));
				return attributed;
			}
		};
		return { ports, state: memory.state, seen };
	}

	it('captures into the project its turns were clearly about', async () => {
		const projectId = fixture().project.id;
		const { ports, state, seen } = globalPorts(projectId);
		const outcome = await runChatCheckpointCapture(ports, {
			sessionId: THEME_SESSION,
			userId: USER_ID,
			trigger: 'threshold',
			now: NOW
		});
		expect(outcome.status).toBe('captured');
		expect(seen).toHaveLength(1);
		expect(state.records.at(-1)!.projectId).toBe(projectId);
		expect(state.thinkingLog!.content).toContain('build bridges rather than defenses');
	});

	it('skips, as before, when the turns were mixed or unattributed', async () => {
		const { ports, state } = globalPorts(null);
		const outcome = await runChatCheckpointCapture(ports, {
			sessionId: THEME_SESSION,
			userId: USER_ID,
			trigger: 'threshold',
			now: NOW
		});
		expect(outcome.status).toBe('noop');
		expect(state.writes).toBe(0);
		expect(state.records.at(-1)!.projectId).toBeNull();
	});
});
