// apps/web/src/lib/components/agent/shared-chat-markdown.test.ts
import { describe, expect, it } from 'vitest';
import { isPublicExternalLink, renderSharedChatMarkdown } from './shared-chat-markdown';

describe('shared chat renderer', () => {
	it.each([
		'<img src="/auth/logout">',
		'<img src="data:image/png;base64,AAAA">',
		'![x](/auth/logout)',
		'![x](https://tracker.example/pixel.png)',
		'<iframe src="https://evil.example"></iframe>',
		'<video src="https://evil.example/v.mp4"></video>',
		'<svg><image href="/auth/logout"/></svg>',
		'<script>alert(1)</script>'
	])('never renders media or scripts: %s', (markdown) => {
		const html = renderSharedChatMarkdown(markdown);
		expect(html).not.toMatch(/<(img|iframe|video|svg|image|script)\b/i);
		expect(html).not.toContain('/auth/logout');
	});
	it.each([
		['[rel](/projects/x)', 'rel'],
		['[app](https://build-os.com/projects/x)', 'app'],
		['[sub](https://app.build-os.com/x)', 'sub'],
		['[plain http](http://example.com/a)', 'plain http'],
		['[local](https://localhost:5173/x)', 'local'],
		['[mail](mailto:a@b.com)', 'mail'],
		['[js](javascript:alert(1))', 'js'],
		['www.build-os.com/projects/x', 'www.build-os.com/projects/x'],
		['https://build-os.com/projects/x', 'https://build-os.com/projects/x'],
		['<https://build-os.com/projects/x>', 'https://build-os.com/projects/x']
	])('unwraps a non-public link to text: %s', (markdown, text) => {
		const html = renderSharedChatMarkdown(markdown);
		expect(html).not.toContain('<a');
		expect(html).toContain(text);
	});
	it('keeps absolute https external links, opened safely in a new tab', () => {
		const html = renderSharedChatMarkdown('Read [the docs](https://example.com/docs).');
		expect(html).toContain(
			'<a href="https://example.com/docs" rel="noopener noreferrer nofollow ugc" target="_blank">the docs</a>'
		);
		expect(isPublicExternalLink('https://example.com/docs')).toBe(true);
		expect(isPublicExternalLink('https://user:pw@example.com')).toBe(false);
		expect(isPublicExternalLink('//example.com')).toBe(false);
	});
	it('still renders tables, code, lists and line breaks', () => {
		const html = renderSharedChatMarkdown(
			'line one\nline two\n\n| Task | Owner |\n| --- | --- |\n| ~~Old~~ Draft | You |\n\n- a\n- b\n\n```\ncode\n```'
		);
		expect(html).toContain('<br');
		expect(html).toContain('agent-markdown-table-scroll');
		expect(html).toContain('<th>Task</th>');
		expect(html).toContain('<del>Old</del>');
		expect(html).toContain('<li>a</li>');
		expect(html).toContain('<pre><code>code');
	});
	it('closes a real link correctly after an unlinked one', () => {
		const html = renderSharedChatMarkdown(
			'[Workspace](/projects/x) then [External](https://example.com/read) after'
		);
		expect(html).toContain('<span>Workspace</span>');
		expect(html).toMatch(/<a [^>]+>External<\/a> after/);
		expect(html).not.toContain('</span> after');
	});
});
