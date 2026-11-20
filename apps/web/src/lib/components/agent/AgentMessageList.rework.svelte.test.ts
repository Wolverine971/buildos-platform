// apps/web/src/lib/components/agent/AgentMessageList.rework.svelte.test.ts
// @vitest-environment jsdom
//
// Work per streamed update must not grow with the length of the conversation. These count the
// work finished turns redo when only the live turn changed: a preview tick (about 10 a second)
// and a new step in the running turn. The expected count is zero in both.
//
// Mounted with `$state.raw` props, as the chat window holds them: Testing Library's render
// deep-proxies its props, which gives every row a new identity on each update and would hide
// exactly what is measured here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AgentMessageList from './AgentMessageList.svelte';
import type { ActivityEntry, ThinkingBlockMessage, UIMessage } from './agent-chat.types';

const counts = vi.hoisted(() => ({
	mentionAttachments: 0,
	turnCardsByActivities: new Map<unknown, number>()
}));

vi.mock('$lib/components/task-entities/entity-mentions', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('$lib/components/task-entities/entity-mentions')>();
	return {
		...actual,
		entityMentions: (...args: Parameters<typeof actual.entityMentions>) => {
			counts.mentionAttachments += 1;
			return actual.entityMentions(...args);
		}
	};
});

vi.mock('./agent-chat-turn-cards', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./agent-chat-turn-cards')>();
	return {
		...actual,
		deriveTurnCards: (...args: Parameters<typeof actual.deriveTurnCards>) => {
			const key = args[0].activities;
			counts.turnCardsByActivities.set(key, (counts.turnCardsByActivities.get(key) ?? 0) + 1);
			return actual.deriveTurnCards(...args);
		}
	};
});

const at = new Date('2026-11-19T12:00:00Z');
const DOC = '44444444-4444-4444-8444-444444444444';
const PROJECT = '11111111-1111-4111-8111-111111111111';

function documentEdit(id: string, status: ActivityEntry['status'] = 'completed'): ActivityEntry {
	return {
		id,
		content: '',
		timestamp: at,
		activityType: 'tool_call',
		status,
		toolCallId: id,
		metadata: {
			toolName: 'update_onto_document',
			result: {
				document_change: {
					version: 1,
					document_id: DOC,
					project_id: PROJECT,
					before_hash: 'a',
					after_hash: 'b',
					lines_added: 2,
					lines_removed: 1,
					hunks: []
				}
			}
		}
	};
}

function block(
	id: string,
	activities: ActivityEntry[],
	status: ThinkingBlockMessage['status'] = 'completed'
): ThinkingBlockMessage {
	return {
		id,
		type: 'thinking_block',
		content: '',
		timestamp: at,
		activities,
		status,
		isCollapsed: status === 'completed'
	} as ThinkingBlockMessage;
}

const user = (id: string): UIMessage => ({ id, type: 'user', content: 'Change it', timestamp: at });
const reply = (id: string, content: string, turnRunId?: string): UIMessage => ({
	id,
	type: 'assistant',
	content,
	timestamp: at,
	...(turnRunId ? { metadata: { turn_run_id: turnRunId } } : {})
});

type Preview = { turnRunId: string; text: string } | null;

const mounted: (() => void)[] = [];

function mountList(initial: UIMessage[], extra: Record<string, unknown> = {}) {
	let messages = $state.raw(initial);
	let livePreview = $state.raw<Preview>(null);
	const target = document.createElement('div');
	document.body.append(target);
	const component = mount(AgentMessageList, {
		target,
		props: {
			get messages() {
				return messages;
			},
			get livePreview() {
				return livePreview;
			},
			onToggleThinkingBlock: vi.fn(),
			onScroll: vi.fn(),
			displayContextLabel: 'Global',
			...extra
		}
	});
	flushSync();
	mounted.push(() => {
		unmount(component);
		target.remove();
	});
	return {
		setMessages(next: UIMessage[]) {
			messages = next;
			flushSync();
		},
		setPreview(next: Preview) {
			livePreview = next;
			flushSync();
		}
	};
}

describe('AgentMessageList: finished turns stay untouched while the live turn changes', () => {
	beforeEach(() => {
		counts.mentionAttachments = 0;
		counts.turnCardsByActivities.clear();
	});
	afterEach(() => {
		for (const stop of mounted.splice(0)) stop();
	});

	it('a live preview tick does not rebuild the name links of finished replies', () => {
		const list = mountList(
			[
				user('u1'),
				reply('a1', '**Ada Lovelace** signed off on the plan.'),
				user('u2'),
				reply('a2', '**Ada Lovelace** also asked for a second review.'),
				user('u3'),
				reply('a3', 'Working on it', 'turn-live')
			],
			{
				streamingMessageId: 'a3',
				knowledgeTargets: [{ id: 'e1', words: ['Ada Lovelace'], label: 'Ada Lovelace' }],
				onOpenKnowledge: vi.fn()
			}
		);
		list.setPreview({ turnRunId: 'turn-live', text: ' and' });
		// Both finished replies were linked once on mount.
		expect(counts.mentionAttachments).toBe(2);

		for (const text of [' and here', ' and here is', ' and here is more']) {
			list.setPreview({ turnRunId: 'turn-live', text });
		}

		expect(counts.mentionAttachments).toBe(2);
	});

	it('a new step in the running turn does not rework a finished turn that has a settled step', () => {
		// Turn 1 is finished and its document edit was undone, so its block has a settlement.
		const finished = block('b1', [documentEdit('s1')]);
		const history: UIMessage[] = [
			user('u1'),
			finished,
			{
				id: 'c1',
				type: 'document_changes',
				content: '',
				timestamp: at,
				data: {
					changes: [{ id: `${DOC}:b`, documentId: DOC, projectId: PROJECT, undone: true }]
				}
			},
			reply('a1', 'Done.'),
			user('u2')
		];
		const live = block('b2', [documentEdit('s2', 'pending')], 'active');
		const list = mountList([...history, live]);
		const before = counts.turnCardsByActivities.get(finished.activities);
		expect(before).toBeGreaterThan(0);

		// Copy-on-write, as the stream does it: a new list and a new live block; every
		// finished row is the same object.
		for (const id of ['s3', 's4', 's5']) {
			const next = block('b2', [...live.activities, documentEdit(id, 'pending')], 'active');
			list.setMessages([...history, next]);
		}

		expect(counts.turnCardsByActivities.get(finished.activities)).toBe(before);
	});
});
