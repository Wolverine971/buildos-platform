// packages/shared-agent-ops/src/utils/markdown-normalization.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeMarkdownInput } from './markdown-normalization';

describe('normalizeMarkdownInput', () => {
	it('returns null for non-string values and preserves empty strings', () => {
		expect(normalizeMarkdownInput(null)).toBeNull();
		expect(normalizeMarkdownInput({ text: 'hello' })).toBeNull();
		expect(normalizeMarkdownInput('')).toBe('');
	});

	it('normalizes escaped markdown line breaks and quotes', () => {
		expect(normalizeMarkdownInput('Title\\n\\"quoted\\"')).toBe('Title\n"quoted"');
		expect(normalizeMarkdownInput('Title /n Body')).toBe('Title \n Body');
	});

	it('preserves escaped sequences inside fenced code blocks', () => {
		const markdown = [
			'Intro\\nline',
			'```ts',
			'const value = "keep\\\\nescaped";',
			'```',
			'Outro\\nline'
		].join('\n');

		expect(normalizeMarkdownInput(markdown)).toBe(
			[
				'Intro\nline',
				'```ts',
				'const value = "keep\\\\nescaped";',
				'```',
				'Outro\nline'
			].join('\n')
		);
	});
});
