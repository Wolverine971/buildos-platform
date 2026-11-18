// apps/web/src/lib/components/knowledge/record-knowledge-mentions.test.ts
import { describe, expect, it } from 'vitest';
import { mentionTargets } from './record-knowledge-mentions.svelte';

describe('mentionTargets', () => {
	it('links a doc name by its entry name, plus a short quote, longest first', () => {
		expect(
			mentionTargets([
				{ entity_id: 'a', kind: 'person', name: 'Kyle Kulinski', quote: 'Kyle' },
				{
					entity_id: 'b',
					kind: 'org',
					name: 'The Real News Network',
					quote: 'TRNN reporting on one continuing issue, with a way for people to follow'
				}
			])
		).toEqual([
			{ id: 'a', words: ['Kyle Kulinski', 'Kyle'], label: 'Kyle Kulinski' },
			// A sentence-long quote would underline the whole sentence: name only.
			{ id: 'b', words: ['The Real News Network'], label: 'The Real News Network' }
		]);
	});
});
