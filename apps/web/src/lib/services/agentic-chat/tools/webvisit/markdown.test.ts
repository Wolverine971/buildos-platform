// apps/web/src/lib/services/agentic-chat/tools/webvisit/markdown.test.ts
import { describe, expect, it } from 'vitest';
import { convertHtmlToMarkdown } from './markdown';

describe('convertHtmlToMarkdown', () => {
	it('converts headings, lists, links, and emphasis', () => {
		const { markdown } = convertHtmlToMarkdown(`
			<h1>Pricing Guide</h1>
			<p>Compare <strong>plans</strong> and <em>features</em>.</p>
			<h2>Plans</h2>
			<ul>
				<li>Free tier</li>
				<li><a href="https://example.com/pro">Pro plan</a></li>
			</ul>
		`);

		expect(markdown).toContain('# Pricing Guide');
		expect(markdown).toContain('## Plans');
		expect(markdown).toContain('**plans**');
		expect(markdown).toContain('- Free tier');
		expect(markdown).toContain('[Pro plan](https://example.com/pro)');
	});

	it('converts GFM tables', () => {
		const { markdown } = convertHtmlToMarkdown(`
			<table>
				<thead><tr><th>Tool</th><th>Price</th></tr></thead>
				<tbody>
					<tr><td>Motion</td><td>$19/mo</td></tr>
					<tr><td>Reclaim</td><td>$15/mo</td></tr>
				</tbody>
			</table>
		`);

		expect(markdown).toContain('| Tool | Price |');
		expect(markdown).toContain('| Motion | $19/mo |');
		expect(markdown).toContain('| Reclaim | $15/mo |');
	});

	it('converts fenced code blocks', () => {
		const { markdown } = convertHtmlToMarkdown(
			'<pre><code>pnpm install\npnpm dev</code></pre>'
		);

		expect(markdown).toContain('```');
		expect(markdown).toContain('pnpm install');
	});

	it('returns empty markdown for empty input', () => {
		expect(convertHtmlToMarkdown('').markdown).toBe('');
		expect(convertHtmlToMarkdown('   ').markdown).toBe('');
	});

	it('collapses excess blank lines', () => {
		const { markdown } = convertHtmlToMarkdown(
			'<p>one</p><br><br><br><p>two</p><br><br><p>three</p>'
		);

		expect(markdown).not.toMatch(/\n{3,}/);
	});

	it('survives truncated (mid-tag) HTML input', () => {
		const truncated = '<h2>Features</h2><p>Auto-scheduling and <a href="https://exa';
		const { markdown } = convertHtmlToMarkdown(truncated);

		expect(markdown).toContain('## Features');
	});

	it('leaves fenced code-block content byte-identical (diff markers, alignment, trailing spaces)', () => {
		const { markdown } = convertHtmlToMarkdown(
			'<pre><code>git diff output:\n-   const oldValue = 1;\n+   const newValue = 2;\nkey:   \n  -   name: alpha\n</code></pre>'
		);

		expect(markdown).toContain('-   const oldValue = 1;');
		expect(markdown).toContain('+   const newValue = 2;');
		expect(markdown).toContain('  -   name: alpha');
	});

	it('does not splice a lone dash line with the following indented line', () => {
		const { markdown } = convertHtmlToMarkdown('<p>para</p><p>-</p><p>   indented start</p>');

		expect(markdown).not.toContain('-  indented');
	});

	it('strips images to alt text (no remote-image markdown from untrusted pages)', () => {
		const { markdown } = convertHtmlToMarkdown(`
			<p>Intro</p>
			<img src="https://attacker.example/leak?d=secret" alt="Product screenshot">
			<img src="https://attacker.example/pixel.gif">
		`);

		expect(markdown).not.toContain('![');
		expect(markdown).not.toContain('attacker.example');
		expect(markdown).toContain('[image: Product screenshot]');
	});
});
