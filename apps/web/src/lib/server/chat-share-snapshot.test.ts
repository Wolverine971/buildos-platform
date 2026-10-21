import { assert, describe, expect, it } from 'vitest';
import {
	buildChatShareCandidates,
	buildSharedChatSnapshot,
	CHAT_SHARE_MAX_BYTES,
	cleanSharedMarkdown,
	type ChatShareSource
} from './chat-share-snapshot';
const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const source = (overrides: Record<string, unknown> = {}): ChatShareSource =>
	({
		title: 'Test',
		messages: [{ id, role: 'user', content: 'Hello', created_at: '2026-10-18T00:00:00Z' }],
		toolExecutions: [],
		turnRuns: [],
		turnEvents: [],
		workflows: [],
		truncated: false,
		historyWindow: {},
		...overrides
	}) as unknown as ChatShareSource;

describe('shared chat privacy', () => {
	it('preserves readable tables and strikethrough after cleaning', () => {
		const { markdown } = cleanSharedMarkdown(
			'| Task | Owner |\n| --- | --- |\n| ~~Old~~ Draft | You |'
		);
		expect(markdown).toContain('| Task | Owner |\n| --- | --- |');
		expect(markdown).toContain('| ~~Old~~ Draft | You |');
	});
	it('exports created entity labels without their IDs, URLs, or private tool payloads', () => {
		const input = source({
			messages: [
				{ id, role: 'assistant', content: 'Done', created_at: '2026-10-18T00:00:54Z' }
			],
			toolExecutions: [
				{
					id: other,
					message_id: id,
					created_at: '2026-10-18T00:00:53Z',
					tool_name: 'create_onto_task',
					success: true,
					affected_entities: [
						{
							kind: 'task',
							id: other,
							operation: 'created',
							title: 'Draft pitch deck',
							project_id: other
						}
					],
					arguments: { secret: 'PRIVATE' },
					result: { private: 'PRIVATE' }
				}
			]
		});
		const output = buildSharedChatSnapshot(input, [id]);
		assert.isDefined(output.messages[0]);
		expect(output.messages[0].made).toEqual([{ kind: 'task', label: 'Draft pitch deck' }]);
		expect(JSON.stringify(output)).not.toContain(other);
		expect(JSON.stringify(output)).not.toContain('PRIVATE');
	});
	it('whitelists fields and removes IDs even from text and code', () => {
		const input = source({
			title: `Title ${id}`,
			messages: [
				{
					id,
					role: 'assistant',
					content: `ID ${id}\n\n\`${other}\``,
					created_at: '2026-10-18T00:00:00Z',
					metadata: { secret: 'PRIVATE' },
					tool_calls: [{ name: 'PRIVATE' }],
					reasoning: 'PRIVATE',
					unknown: 'PRIVATE'
				},
				{ id: other, role: 'tool', content: 'PRIVATE' }
			],
			unknown: 'PRIVATE'
		});
		const output = buildSharedChatSnapshot(input, [id, other]);
		expect(output.messages).toHaveLength(1);
		expect(JSON.stringify(output)).not.toContain(id);
		expect(JSON.stringify(output)).not.toContain(other);
		expect(JSON.stringify(output)).not.toContain('PRIVATE');
		assert.isDefined(output.messages[0]);
		expect(Object.keys(output.messages[0])).toEqual(['role', 'markdown', 'at']);
	});
	it('unlinks workspace and unsafe links while retaining external HTTPS', () => {
		const { markdown } = cleanSharedMarkdown(
			'[Task](/projects/x) [App](https://app.build-os.com/x) [Trailing](https://build-os.com./x) [External](https://example.com/read) [Bad](javascript:alert) <https://build-os.com/projects/x>'
		);
		expect(markdown).toContain('Task');
		expect(markdown).toContain('App');
		expect(markdown).toContain('[External](https://example.com/read)');
		expect(markdown).not.toContain('build-os.com');
		expect(markdown).not.toContain('javascript:');
		expect(markdown).not.toContain('/projects/x');
	});
	it('handles reference links structurally without preserving unused definitions', () => {
		const { markdown } = cleanSharedMarkdown(
			'[Task][t] and [Docs][d]\n\n[t]: /projects/private\n[d]: https://example.com/docs'
		);
		expect(markdown).toContain('Task');
		expect(markdown).not.toContain('/projects/private');
		expect(markdown).toContain('https://example.com/docs');
	});
	it('counts media without retaining URLs, HTML or attachment metadata', () => {
		const input = source({
			messages: [
				{
					id,
					role: 'user',
					content:
						'![private](https://private.example/img.png)\n\n<img src="https://private.example/other.png">',
					created_at: '2026-10-18T00:00:00Z',
					metadata: { voice_note_group_id: other },
					attachments: [
						{ media_type: 'image', private: 'PRIVATE' },
						{ media_type: 'file', url: 'PRIVATE' }
					]
				}
			]
		});
		const output = buildSharedChatSnapshot(input, [id]);
		assert.isDefined(output.messages[0]);
		expect(output.messages[0].withheld).toEqual({ images: 2, files: 1, voice: 1 });
		expect(JSON.stringify(output)).not.toContain('private.example');
		expect(JSON.stringify(output)).not.toContain('PRIVATE');
	});
	it('selects only requested messages and leaves original data unchanged', () => {
		const input = source({
			messages: [
				{ id, role: 'user', content: 'Keep', created_at: '2026-10-18T00:00:00Z' },
				{
					id: other,
					role: 'assistant',
					content: 'Do not publish',
					created_at: '2026-10-18T00:00:01Z'
				}
			]
		});
		const before = JSON.stringify(input);
		expect(buildSharedChatSnapshot(input, [id]).messages).toHaveLength(1);
		expect(JSON.stringify(input)).toBe(before);
	});
	it('keeps a contiguous newest message window and reports omitted messages', () => {
		const input = source({
			messages: [
				{
					id,
					role: 'user',
					content: 'x'.repeat(CHAT_SHARE_MAX_BYTES),
					created_at: '2026-10-18T00:00:00Z'
				},
				{
					id: other,
					role: 'assistant',
					content: 'Most recent',
					created_at: '2026-10-18T00:00:01Z'
				}
			]
		});
		const result = buildChatShareCandidates(input);
		expect(result.messages.map((m) => m.id)).toEqual([other]);
		expect(result.truncated).toEqual({ omittedMessages: 1 });
	});
	it('exports work timing and counts, but no tool arguments or results', () => {
		const input = source({
			messages: [
				{ id, role: 'assistant', content: 'Done', created_at: '2026-10-18T00:00:54Z' }
			],
			turnRuns: [
				{
					id: other,
					assistant_message_id: id,
					started_at: '2026-10-18T00:00:00Z',
					finished_at: '2026-10-18T00:00:54Z'
				}
			],
			toolExecutions: [
				{
					id: 't',
					turn_run_id: other,
					tool_name: 'list_onto_tasks',
					arguments: { password: 'PRIVATE' },
					result: { private: 'PRIVATE' }
				}
			]
		});
		const output = buildSharedChatSnapshot(input, [id]);
		assert.isDefined(output.messages[0]);
		expect(output.messages[0].work).toEqual({ seconds: 54, steps: 1 });
		expect(JSON.stringify(output)).not.toContain('PRIVATE');
	});
});
