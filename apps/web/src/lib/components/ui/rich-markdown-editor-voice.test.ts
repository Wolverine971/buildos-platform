// apps/web/src/lib/components/ui/rich-markdown-editor-voice.test.ts
import { describe, expect, it } from 'vitest';
import { spliceDictationIntoMarkdown } from './rich-markdown-editor-voice';

describe('spliceDictationIntoMarkdown', () => {
	it('inserts at the remembered point with natural spacing', () => {
		expect(spliceDictationIntoMarkdown('Alpha omega', { from: 5, to: 5 }, 'bravo')).toBe(
			'Alpha bravo omega'
		);
	});

	it('replaces the dictated-over selection', () => {
		expect(spliceDictationIntoMarkdown('Alpha beta omega', { from: 6, to: 10 }, 'gamma')).toBe(
			'Alpha gamma omega'
		);
	});

	it('clamps a stale range instead of throwing, and appends with no range', () => {
		expect(spliceDictationIntoMarkdown('Short', { from: 40, to: 50 }, 'tail')).toBe(
			'Short tail'
		);
		expect(spliceDictationIntoMarkdown('Body', null, 'more')).toBe('Body more');
	});

	it('leaves the markdown untouched when nothing was transcribed', () => {
		expect(spliceDictationIntoMarkdown('Body', null, '   ')).toBe('Body');
	});
});
