// apps/web/src/lib/utils/markdown.test.ts
import { describe, expect, it } from 'vitest';
import { hasMarkdownFormatting, normalizeMarkdownTables, renderMarkdown } from './markdown';

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
