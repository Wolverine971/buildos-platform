// apps/web/src/lib/utils/markdown.test.ts
import { describe, expect, it } from 'vitest';
import {
	hasMarkdownFormatting,
	normalizeMarkdownTables,
	renderBlogMarkdown,
	renderMarkdown
} from './markdown';

describe('markdown utils', () => {
	it('normalizes LLM-style tables with blank lines between rows', () => {
		const source = `| Metric | Count |

|---|---:|

| Active Tasks | 24 |

| Overdue Tasks | 2 |`;

		expect(normalizeMarkdownTables(source)).toBe(`| Metric | Count |
|---|---:|
| Active Tasks | 24 |
| Overdue Tasks | 2 |`);
	});

	it('renders normalized GFM tables as sanitized table HTML', () => {
		const html = renderMarkdown(`| Metric | Count |

|---|---:|

| Active Tasks | 24 |`);

		expect(html).toContain('<table>');
		expect(html).toContain('<th>Metric</th>');
		expect(html).toContain('<th align="right">Count</th>');
		expect(html).toContain('<td align="right">24</td>');
	});

	it('detects table-only markdown content', () => {
		expect(
			hasMarkdownFormatting(`Metric | Count

--- | ---:

Active Tasks | 24`)
		).toBe(true);
	});

	it('does not rewrite table-like text inside fenced code blocks', () => {
		const source = `\`\`\`
| Metric | Count |

|---|---:|
\`\`\``;

		expect(normalizeMarkdownTables(source)).toBe(source);
	});
});

describe('renderBlogMarkdown (first-party rich HTML)', () => {
	it('preserves layout blocks with classes and inline styles', () => {
		const html = renderBlogMarkdown(
			`<div class="callout tx-bloom" style="padding:1rem">Hello</div>`
		);

		expect(html).toContain('<div class="callout tx-bloom" style="padding:1rem">');
		expect(html).toContain('Hello');
	});

	it('keeps figure/figcaption and data attributes', () => {
		const html = renderBlogMarkdown(
			`<figure data-variant="wide"><img src="https://example.com/a.png" alt="A" /><figcaption>Cap</figcaption></figure>`
		);

		expect(html).toContain('<figure data-variant="wide">');
		expect(html).toContain('<figcaption>Cap</figcaption>');
	});

	it('allows iframe embeds from trusted hostnames', () => {
		const html = renderBlogMarkdown(
			`<iframe src="https://www.youtube-nocookie.com/embed/abc123" allowfullscreen></iframe>`
		);

		expect(html).toContain('<iframe');
		expect(html).toContain('youtube-nocookie.com/embed/abc123');
	});

	it('strips iframes from untrusted hostnames', () => {
		const html = renderBlogMarkdown(`<iframe src="https://evil.example.com/x"></iframe>`);

		expect(html).not.toContain('evil.example.com');
	});

	it('still removes script and event-handler attributes', () => {
		const html = renderBlogMarkdown(`<div onclick="steal()">hi</div><script>alert(1)</script>`);

		expect(html).not.toContain('<script');
		expect(html).not.toContain('onclick');
		expect(html).toContain('hi');
	});

	it('renders ordinary markdown the same as before', () => {
		const html = renderBlogMarkdown(`# Title\n\nSome **bold** text.`);

		expect(html).toContain('<strong>bold</strong>');
	});
});
