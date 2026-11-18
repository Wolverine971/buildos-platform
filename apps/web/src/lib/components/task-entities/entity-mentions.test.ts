// apps/web/src/lib/components/task-entities/entity-mentions.test.ts
import { describe, expect, it } from 'vitest';
import { findWord, splitMentions, type MentionTarget } from './entity-mentions';

const CASEY: MentionTarget = { id: 'p1', words: ['Casey Fenske', 'Casey'], label: 'Casey Fenske' };
const DAUNTLESS: MentionTarget = { id: 'o1', words: ['Dauntless Dogs'], label: 'Dauntless Dogs' };
const ROD: MentionTarget = { id: 'p2', words: ['Rod'], label: 'Rod' };

describe('findWord', () => {
	it('matches whole words only, ignoring case', () => {
		expect(findWord('Ask rod about the product', 'Rod')).toBe(4);
		expect(findWord('Rodney and the product', 'Rod')).toBe(-1);
		expect(findWord("Casey Fenske's cell", 'casey fenske')).toBe(0);
		expect(findWord('(410-555-0161)', '410-555-0161')).toBe(1);
	});
});

describe('splitMentions', () => {
	it('links the first mention of each entity and the phone number in a title', () => {
		const segments = splitMentions(
			'Call Dauntless Dogs: ask for Casey Fenske (410-555-0161), then Casey again',
			[CASEY, DAUNTLESS],
			[{ text: '410-555-0161', href: 'tel:+14105550161' }]
		);
		expect(segments).toEqual([
			{ kind: 'text', text: 'Call ' },
			{ kind: 'mention', text: 'Dauntless Dogs', id: 'o1', label: 'Dauntless Dogs' },
			{ kind: 'text', text: ': ask for ' },
			{ kind: 'mention', text: 'Casey Fenske', id: 'p1', label: 'Casey Fenske' },
			{ kind: 'text', text: ' (' },
			{ kind: 'link', text: '410-555-0161', href: 'tel:+14105550161' },
			{ kind: 'text', text: '), then Casey again' }
		]);
	});

	it('leaves text alone when no target is in it', () => {
		expect(splitMentions('Follow up with the product team', [ROD])).toEqual([
			{ kind: 'text', text: 'Follow up with the product team' }
		]);
	});

	it('never overlaps two mentions', () => {
		const org: MentionTarget = { id: 'o2', words: ['Fenske Co'], label: 'Fenske Co' };
		const segments = splitMentions('Casey Fenske Co-op', [CASEY, org]);
		expect(segments.filter((segment) => segment.kind === 'mention')).toHaveLength(1);
	});
});

describe('placeTags', () => {
	it('finds each stored tag in the rendered text by its words and context', async () => {
		const { placeTags } = await import('./entity-mentions');
		// Stored markdown said "**Phil Velayo**"; the page shows plain words.
		const page = 'Phil Velayo builds rifles. Ask Phil Velayo about the 7 Devils match.';
		const placed = placeTags(page, [
			{
				tagId: 't2',
				id: 'e1',
				label: 'Phillip Velayo',
				text: 'Phil Velayo',
				prefix: 'rifles. Ask ',
				suffix: ' about the 7'
			},
			{
				tagId: 't1',
				id: 'e1',
				label: 'Phillip Velayo',
				text: 'Phil Velayo',
				prefix: '',
				suffix: '** builds rifles.'
			},
			{
				tagId: 't3',
				id: 'e2',
				label: 'Rod',
				text: 'Rod Chamberlin',
				prefix: 'x',
				suffix: 'y'
			}
		]);
		expect(placed.map((p) => [p.tag.tagId, page.slice(p.start, p.end), p.start])).toEqual([
			['t1', 'Phil Velayo', 0],
			['t2', 'Phil Velayo', 31]
		]);
	});
});
