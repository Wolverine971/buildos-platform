// apps/web/src/lib/server/chat-share-snapshot.test.ts
import { assert, describe, expect, it } from 'vitest';
import {
	buildChatShareCandidates,
	buildSharedChatSnapshot,
	CHAT_SHARE_MAX_BYTES,
	cleanSharedLabel,
	cleanSharedMarkdown,
	removeShareIds,
	sharedMarkdownScanViews,
	type ChatShareSource
} from './chat-share-snapshot';
import { renderSharedChatMarkdown } from '$lib/components/agent/shared-chat-markdown';
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
	it.each([
		'hello &lt;img src="/auth/logout"&gt; world',
		'&lt;a href="/projects/x"&gt;open&lt;/a&gt;',
		'&lt;iframe src="https://evil.example"&gt;&lt;/iframe&gt;',
		'&lt;script&gt;alert(1)&lt;/script&gt;',
		'&#60;img src=/auth/logout&#62;',
		'> &lt;img src="/auth/logout"&gt; in a quote'
	])('never stores raw HTML from entity-encoded markup: %s', (content) => {
		const { markdown } = cleanSharedMarkdown(content);
		expect(markdown).not.toMatch(/<\s*(img|a|iframe|script)\b/i);
		const html = renderSharedChatMarkdown(markdown);
		expect(html).not.toMatch(/<(img|iframe|script)\b/i);
		expect(html).not.toContain('<a ');
		// The reader still sees the text the author typed.
		expect(html).toMatch(/&lt;(img|a|iframe|script)/);
	});
	it('keeps code spans and fences literal while escaping prose', () => {
		const { markdown } = cleanSharedMarkdown('Use `<b>` and 1 < 2\n\n```\n<img src=x>\n```');
		expect(markdown).toContain('`<b>`');
		expect(markdown).toContain('```\n<img src=x>\n```');
		expect(markdown).toContain('1 &lt; 2');
		const html = renderSharedChatMarkdown(markdown);
		expect(html).not.toMatch(/<img/i);
		expect(html).toContain('&lt;img src=x&gt;');
	});
	it('turns bare workspace URLs into plain labels so they can never autolink', () => {
		const { markdown } = cleanSharedMarkdown(
			'See www.build-os.com/projects/x and http://build-os.com/a and [rel](/projects/y) and http://example.com/plain'
		);
		expect(markdown).not.toContain('build-os.com');
		expect(markdown).toContain('Workspace link');
		expect(markdown).toContain('rel');
		expect(markdown).not.toContain('/projects/y');
		const html = renderSharedChatMarkdown(markdown);
		expect(html).not.toContain('<a ');
	});
	it('keeps bare public https URLs clickable after cleaning', () => {
		const { markdown } = cleanSharedMarkdown('Read https://example.com/a today');
		expect(renderSharedChatMarkdown(markdown)).toContain('<a href="https://example.com/a"');
	});
	it("keeps the author's line breaks", () => {
		expect(cleanSharedMarkdown('line one\nline two').markdown).toMatch(
			/line one\s*\n\s*line two/
		);
	});
	it('labels are decoded plain text with markup and IDs removed', () => {
		expect(cleanSharedLabel('Q&A plan')).toBe('Q&A plan');
		expect(cleanSharedLabel('my_project_plan')).toBe('my_project_plan');
		expect(cleanSharedLabel('Launch *v2*')).toBe('Launch v2');
		expect(cleanSharedLabel('Ship <b>it</b> ![x](https://e.com/i.png)')).toBe('Ship it');
		expect(cleanSharedLabel(`Task task_${id}`)).toBe('Task task_[identifier removed]');
		expect(cleanSharedLabel('   ')).toBe('Shared chat');
		const output = buildChatShareCandidates(
			source({
				title: 'Q&A for my_project *v2*',
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
							{ kind: 'task', id: other, operation: 'created', title: 'R&D my_task' }
						]
					}
				]
			})
		);
		expect(output.title).toBe('Q&A for my_project v2');
		expect(output.messages[0]?.made).toEqual([{ kind: 'task', label: 'R&D my_task' }]);
	});
	it('removes IDs next to underscores, escapes, letters, and hyphenless or uppercase forms', () => {
		const real = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
		const real2 = '9b2e4c1a-7d3f-4e8b-a1c2-3d4e5f6a7b8c';
		const hyphenless = real.replace(/-/g, '');
		const text = [
			`task_${real}`,
			`task\\_${real2}`,
			`x${real}y`,
			`doc_${hyphenless}`,
			real.toUpperCase(),
			hyphenless.toUpperCase()
		].join(' ');
		const cleaned = removeShareIds(text);
		expect(cleaned).not.toMatch(/[0-9a-f]{8}-?[0-9a-f]{4}/i);
		expect(cleaned.match(/\[identifier removed\]/g)).toHaveLength(6);
		const { markdown } = cleanSharedMarkdown(text);
		expect(markdown).not.toContain(hyphenless);
		expect(markdown).not.toContain(real);
		// Long plain numbers are not identifiers.
		expect(removeShareIds('12345678901234567890123456789012345')).toBe(
			'12345678901234567890123456789012345'
		);
	});
	it('exposes unescaped and plain-text views of cleaned markdown for the secret scan', () => {
		const { markdown } = cleanSharedMarkdown(
			'a sk_live_**abcd**efgh\n[x](https://e.com/?k=v_1)'
		);
		const views = sharedMarkdownScanViews(markdown);
		expect(views.unescaped).toContain('sk_live_');
		expect(views.unescaped).not.toContain('\\_');
		expect(views.plain).toContain('sk_live_abcdefgh');
		expect(views.plain).toContain('https://e.com/?k=v_1');
	});
});
