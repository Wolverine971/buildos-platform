// apps/web/src/lib/server/knowledge/tag-widening.server.test.ts
import { describe, expect, it } from 'vitest';
import { nameCoversTag } from './tag-widening.server';

describe('nameCoversTag', () => {
	const tag = (prefix: string, text: string, suffix: string) => ({ prefix, text, suffix });

	it('finds the new name written around the tag', () => {
		expect(
			nameCoversTag(
				tag('DJ selected **Wayne ', 'Strategies', '** and reports'),
				'Wayne Strategies'
			)
		).toBe(true);
		expect(
			nameCoversTag(tag('# Wayne ', 'Strategies', ' — current identity'), 'wayne strategies')
		).toBe(true);
	});

	it('skips tags the new name is not written around', () => {
		expect(nameCoversTag(tag('Offer ', 'Strategies', ' for Q4'), 'Wayne Strategies')).toBe(
			false
		);
		// Same length or shorter: nothing to grow.
		expect(nameCoversTag(tag('Ask ', 'Wayne Strategies', '.'), 'Wayne Strategies')).toBe(false);
		// The name must cover the tag, not sit next to it.
		expect(
			nameCoversTag(tag('Wayne Strategies and ', 'Strategies', ' Inc'), 'Wayne Strategies')
		).toBe(false);
	});
});
