// apps/web/src/routes/api/onto/shared/markdown-normalization.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeMarkdownInput } from './markdown-normalization';

describe('normalizeMarkdownInput', () => {
	it('converts escaped line breaks in single-line payloads', () => {
		const input = 'Header\\n\\nBody line';
		const result = normalizeMarkdownInput(input);

		expect(result).toBe('Header\n\nBody line');
	});

	it('converts escaped quotes in single-line payloads', () => {
		const input = 'Hero: \\"No ego, no fluff\\"';
		const result = normalizeMarkdownInput(input);

		expect(result).toBe('Hero: "No ego, no fluff"');
	});

	it('converts escaped line breaks in mixed payloads with real newlines', () => {
		const input =
			'Intro line\n\n## New Family News: Baby Hallie\\n\\nKaitlyn and Nick had a baby.';
		const result = normalizeMarkdownInput(input);

		expect(result).toBe(
			'Intro line\n\n## New Family News: Baby Hallie\n\nKaitlyn and Nick had a baby.'
		);
	});

	it('converts escaped quotes in mixed payloads with real newlines', () => {
		const input = '## Outline\n- CTA: \\"Book Now\\"';
		const result = normalizeMarkdownInput(input);

		expect(result).toBe('## Outline\n- CTA: "Book Now"');
	});

	it('preserves escaped line breaks inside fenced code blocks', () => {
		const input = [
			'Intro\\n',
			'```ts',
			'const text = "line1\\\\nline2";',
			'```',
			'Outro\\n'
		].join('\n');
		const result = normalizeMarkdownInput(input);

		expect(result).toBe(
			['Intro\n', '```ts', 'const text = "line1\\\\nline2";', '```', 'Outro\n'].join('\n')
		);
	});

	it('preserves escaped quotes inside fenced code blocks', () => {
		const input = [
			'Intro: \\"quoted\\"',
			'```js',
			'const text = "\\\"keep escaped\\\"";',
			'```',
			'Outro: \\"quoted\\"'
		].join('\n');
		const result = normalizeMarkdownInput(input);

		expect(result).toBe(
			[
				'Intro: "quoted"',
				'```js',
				'const text = "\\\"keep escaped\\\"";',
				'```',
				'Outro: "quoted"'
			].join('\n')
		);
	});

	it('converts standalone /n markers outside fenced code blocks', () => {
		const input = ['Top /n', '```txt', '/n', '```', 'Bottom /n'].join('\n');
		const result = normalizeMarkdownInput(input);

		expect(result).toBe(['Top \n', '```txt', '/n', '```', 'Bottom \n'].join('\n'));
	});
});
