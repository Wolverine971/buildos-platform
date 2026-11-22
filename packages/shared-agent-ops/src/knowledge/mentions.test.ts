// packages/shared-agent-ops/src/knowledge/mentions.test.ts
import { describe, expect, it } from 'vitest';
import {
	anchorAt,
	anchorFromQuote,
	applyMentionRenames,
	findNameSpans,
	jaroWinkler,
	nameRelation,
	planRecordMentions,
	reanchorMentions,
	type StoredMention
} from './mentions';

const DOC_BEFORE =
	'## Vision & Summary\n\nWeb development project for a pistol shooting client, referred by Phil Valeo from thecadretraining.com. Key decisions include domain name.';
const DOC_FIXED = DOC_BEFORE.replace('Phil Valeo', 'Phillip Velayo');

function stored(
	text: string,
	name: string,
	entityId: string,
	extra: Partial<StoredMention> = {}
): StoredMention {
	const span = findNameSpans(text, name)[0]!;
	const anchor = anchorAt(text, span, 'content');
	return {
		id: `m-${entityId}-${span.start}`,
		entity_id: entityId,
		field: 'content',
		start_offset: anchor.start,
		end_offset: anchor.end,
		text: anchor.text,
		prefix: anchor.prefix,
		suffix: anchor.suffix,
		made_by: 'reader',
		status: 'active',
		...extra
	};
}

describe('findNameSpans', () => {
	it('matches whole words, any case, possessives and brackets', () => {
		const text = 'Phil’s OK (phil) — Philip and PHIL.';
		expect(findNameSpans(text, 'Phil').map((s) => text.slice(s.start, s.end))).toEqual([
			'Phil',
			'phil',
			'PHIL'
		]);
	});
	it('ignores one-letter names', () => {
		expect(findNameSpans('a b c', 'a')).toEqual([]);
	});
});

describe('reanchorMentions', () => {
	const anchor = (text: string, name: string, nth = 0) =>
		anchorAt(text, findNameSpans(text, name)[nth]!, 'content');

	it('keeps an untouched mention in place', () => {
		const a = anchor(DOC_BEFORE, 'Phil Valeo');
		const out = reanchorMentions({ content: DOC_BEFORE }, [{ id: 'a', anchor: a }]);
		expect(out.get('a')).toMatchObject({ status: 'same' });
	});

	it('follows a mention that moved', () => {
		const a = anchor(DOC_BEFORE, 'Phil Valeo');
		const moved = `Intro paragraph added on top.\n\n${DOC_BEFORE}`;
		const out = reanchorMentions({ content: moved }, [{ id: 'a', anchor: a }]);
		const result = out.get('a')!;
		expect(result.status).toBe('moved');
		if (result.status === 'moved')
			expect(moved.slice(result.anchor.start, result.anchor.end)).toBe('Phil Valeo');
	});

	it('sees a spelling fix as an edit in place', () => {
		const a = anchor(DOC_BEFORE, 'Phil Valeo');
		const out = reanchorMentions({ content: DOC_FIXED }, [{ id: 'a', anchor: a }]);
		expect(out.get('a')).toMatchObject({
			status: 'edited',
			from: 'Phil Valeo',
			anchor: { text: 'Phillip Velayo' }
		});
	});

	it('survives markdown around the new name', () => {
		const a = anchor(DOC_BEFORE, 'Phil Valeo');
		const bold = DOC_BEFORE.replace('Phil Valeo', '**Phillip Velayo**');
		const out = reanchorMentions({ content: bold }, [{ id: 'a', anchor: a }]);
		expect(out.get('a')).toMatchObject({
			status: 'edited',
			anchor: { text: 'Phillip Velayo' }
		});
	});

	it('sees a removed name as deleted', () => {
		const a = anchor(DOC_BEFORE, 'Phil Valeo');
		const cut = DOC_BEFORE.replace(', referred by Phil Valeo from thecadretraining.com', '');
		const out = reanchorMentions({ content: cut }, [{ id: 'a', anchor: a }]);
		expect(out.get('a')).toEqual({ status: 'deleted' });
		const gone = DOC_BEFORE.replace('Phil Valeo ', '');
		expect(reanchorMentions({ content: gone }, [{ id: 'a', anchor: a }]).get('a')).toEqual({
			status: 'deleted'
		});
	});

	it('fixing one of two identical names leaves the other in place', () => {
		const text =
			'Call Phil Valeo about the range.\n\nThen email Phil Valeo the photos tonight.';
		const first = anchor(text, 'Phil Valeo', 0);
		const second = anchor(text, 'Phil Valeo', 1);
		const fixed = text.replace('email Phil Valeo', 'email Phillip Velayo');
		const out = reanchorMentions({ content: fixed }, [
			{ id: 'first', anchor: first },
			{ id: 'second', anchor: second }
		]);
		expect(out.get('first')).toMatchObject({ status: 'same' });
		expect(out.get('second')).toMatchObject({
			status: 'edited',
			anchor: { text: 'Phillip Velayo' }
		});
	});

	it('re-anchors a quote from an earlier read (no offsets) against markdown text', () => {
		const quote =
			'…ion & Summary Web development project for a pistol shooting client, referred by Phil Valeo from thecadretraining.com. Key decisions include…';
		const seed = anchorFromQuote(quote, 'Phil Valeo', 'content')!;
		expect(seed.start).toBe(-1);
		const out = reanchorMentions({ content: DOC_FIXED }, [{ id: 's', anchor: seed }]);
		expect(out.get('s')).toMatchObject({
			status: 'edited',
			anchor: { text: 'Phillip Velayo' }
		});
	});

	it('handles a name at the very start with only a suffix', () => {
		const text = 'Phil Valeo referred the pistol client to us.';
		const a = anchor(text, 'Phil Valeo');
		const out = reanchorMentions({ content: text.replace('Phil Valeo', 'Phillip Velayo') }, [
			{ id: 'a', anchor: a }
		]);
		expect(out.get('a')).toMatchObject({
			status: 'edited',
			anchor: { text: 'Phillip Velayo' }
		});
	});
});

describe('nameRelation', () => {
	it('tells spelling variants from different people', () => {
		expect(nameRelation('person', 'Phil Valeo', 'Phillip Velayo').relation).toBe('spelling');
		expect(nameRelation('person', 'Phil Velayo', 'Phillip Velayo').relation).toBe('spelling');
		expect(nameRelation('person', 'Phil Vallejo', 'Phil Velayo').relation).toBe('possible');
		expect(nameRelation('person', 'Phil', 'Phillip Velayo').relation).toBe('short');
		expect(nameRelation('person', 'John Smith', 'Jane Smith').relation).toBe('none');
		expect(nameRelation('person', 'Rod Chamberlin', 'Logan Valcarce').relation).toBe('none');
		expect(nameRelation('person', 'José Núñez', 'Jose Nunez').relation).toBe('same');
	});
	it('compares organizations by their letters', () => {
		expect(nameRelation('org', 'Magnum-LPL', 'Magnum/LPL').relation).toBe('same');
		expect(nameRelation('org', 'Anduril', 'Palantir').relation).toBe('none');
	});
	it('jaroWinkler is symmetric and bounded', () => {
		expect(jaroWinkler('valeo', 'velayo')).toBeCloseTo(jaroWinkler('velayo', 'valeo'));
		expect(jaroWinkler('abc', 'abc')).toBe(1);
		expect(jaroWinkler('abc', 'xyz')).toBe(0);
	});
});

describe('planRecordMentions', () => {
	const kinds = new Map([
		['valeo', 'person'],
		['velayo', 'person'],
		['rod', 'person'],
		['phil', 'person']
	]);

	it('a spelling fix becomes a correction carrying the new name', () => {
		const plan = planRecordMentions({
			fields: { content: DOC_FIXED },
			existing: [stored(DOC_BEFORE, 'Phil Valeo', 'valeo')],
			reader: [],
			kinds
		});
		expect(plan.corrections).toEqual([
			expect.objectContaining({
				oldEntityId: 'valeo',
				from: 'Phil Valeo',
				to: 'Phillip Velayo',
				newEntityId: null,
				relation: 'spelling'
			})
		]);
		expect(plan.mentions).toEqual([
			expect.objectContaining({
				entity_id: null,
				pending_name: 'Phillip Velayo',
				text: 'Phillip Velayo'
			})
		]);
		expect(plan.deleted).toEqual([]);
	});

	it('uses the reader’s entry for the new name when it reports one', () => {
		const plan = planRecordMentions({
			fields: { content: DOC_FIXED },
			existing: [stored(DOC_BEFORE, 'Phil Valeo', 'valeo')],
			reader: [{ entityId: 'velayo', kind: 'person', names: ['Phillip Velayo'] }],
			kinds
		});
		expect(plan.corrections[0]).toMatchObject({ newEntityId: 'velayo' });
		expect(plan.mentions).toHaveLength(1);
		expect(plan.mentions[0]).toMatchObject({ entity_id: 'velayo', text: 'Phillip Velayo' });
		expect(plan.present).toEqual(new Set(['velayo']));
	});

	it('a name replaced by ordinary words is a deletion', () => {
		const plan = planRecordMentions({
			fields: { content: DOC_BEFORE.replace('Phil Valeo', 'a friend') },
			existing: [stored(DOC_BEFORE, 'Phil Valeo', 'valeo')],
			reader: [],
			kinds
		});
		expect(plan.corrections).toEqual([]);
		expect(plan.deleted).toEqual([
			expect.objectContaining({ entityId: 'valeo', text: 'Phil Valeo' })
		]);
		expect(plan.present.size).toBe(0);
	});

	it('a different person in the same place: old tag deleted, new one added', () => {
		const text = DOC_BEFORE.replace('Phil Valeo', 'Rod Chamberlin');
		const plan = planRecordMentions({
			fields: { content: text },
			existing: [stored(DOC_BEFORE, 'Phil Valeo', 'valeo')],
			reader: [{ entityId: 'rod', kind: 'person', names: ['Rod Chamberlin'] }],
			kinds
		});
		expect(plan.corrections).toEqual([]);
		expect(plan.deleted.map((d) => d.entityId)).toEqual(['valeo']);
		expect(plan.mentions).toEqual([
			expect.objectContaining({ entity_id: 'rod', text: 'Rod Chamberlin' })
		]);
		expect(plan.counts.added).toBe(1);
	});

	it('a tag the user removed stays removed when the reader finds the name again', () => {
		const text = 'Ask Phil about the range. Phil said yes.';
		const removed = stored(text, 'Phil', 'phil', { made_by: 'user', status: 'removed' });
		const plan = planRecordMentions({
			fields: { content: `Note first. ${text}` },
			existing: [removed],
			reader: [{ entityId: 'phil', kind: 'person', names: ['Phil'] }],
			kinds
		});
		const tags = plan.mentions.map((m) => [m.text, m.status, m.made_by]);
		expect(tags).toEqual([
			['Phil', 'removed', 'user'],
			['Phil', 'active', 'reader']
		]);
		expect(plan.present).toEqual(new Set(['phil']));
	});

	it('tags every place a linked name appears, longest name first', () => {
		const text = 'Phillip Velayo builds rifles. Ask Phil Velayo or Phil about it.';
		const plan = planRecordMentions({
			fields: { content: text },
			existing: [],
			reader: [],
			linked: [
				{ entityId: 'velayo', kind: 'person', names: ['Phillip Velayo', 'Phil Velayo'] },
				{ entityId: 'phil', kind: 'person', names: ['Phil'] }
			],
			kinds
		});
		expect(plan.mentions.map((m) => [m.text, m.entity_id])).toEqual([
			['Phillip Velayo', 'velayo'],
			['Phil Velayo', 'velayo'],
			['Phil', 'phil']
		]);
	});

	it('seeds from old link quotes when a record has no mentions yet', () => {
		const quote = '…referred by Phil Valeo from thecadretraining.com. Key decisions include…';
		const plan = planRecordMentions({
			fields: { content: DOC_FIXED },
			existing: [],
			seeds: [
				{ entityId: 'valeo', anchor: anchorFromQuote(quote, 'Phil Valeo', 'content')! }
			],
			reader: [],
			kinds
		});
		expect(plan.corrections).toEqual([
			expect.objectContaining({
				oldEntityId: 'valeo',
				to: 'Phillip Velayo',
				relation: 'spelling'
			})
		]);
	});
});

describe('applyMentionRenames', () => {
	it('replaces exactly the spans that still match, right to left', () => {
		const text = 'Phil Velayo met Phil Velayo’s friend.';
		const spans = findNameSpans(text, 'Phil Velayo');
		const out = applyMentionRenames(text, [
			{ ...spans[0]!, expect: 'Phil Velayo', to: 'Phillip Velayo' },
			{ ...spans[1]!, expect: 'Phil Velayo', to: 'Phillip Velayo' },
			{ start: 0, end: 4, expect: 'Nope', to: 'X' }
		]);
		expect(out.text).toBe('Phillip Velayo met Phillip Velayo’s friend.');
		expect(out.applied).toHaveLength(2);
		expect(out.skipped).toHaveLength(1);
		expect([...out.shifted.values()].map((s) => out.text.slice(s.start, s.end))).toEqual([
			'Phillip Velayo',
			'Phillip Velayo'
		]);
	});
});

describe('one-word names', () => {
	it('are tagged only as written, so an ordinary word is never a tag', () => {
		const plan = planRecordMentions({
			fields: { content: 'Pistol Range LLC sells pistol targets. Ask Pistol about it.' },
			existing: [],
			reader: [],
			linked: [{ entityId: 'pistol', kind: 'org', names: ['Pistol'] }],
			kinds: new Map([['pistol', 'org']])
		});
		expect(plan.mentions.map((m) => [m.text, m.start_offset])).toEqual([
			['Pistol', 0],
			['Pistol', 43]
		]);
	});

	describe('fuller names', () => {
		const text = 'DJ selected Wayne Strategies. Wayne Strategies is his firm.';
		const at = (word: string, nth = 0) => {
			let i = -1;
			for (let n = 0; n <= nth; n++) i = text.indexOf(word, i + 1);
			return i;
		};
		const tag = (word: string, entity: string, nth = 0, extra: Partial<StoredMention> = {}) => {
			const start = at(word, nth);
			return {
				id: `${entity}-${nth}-${word}`,
				entity_id: entity,
				field: 'content' as const,
				start_offset: start,
				end_offset: start + word.length,
				text: word,
				prefix: text.slice(Math.max(0, start - 32), start),
				suffix: text.slice(start + word.length, start + word.length + 32),
				made_by: 'reader' as const,
				status: 'active' as const,
				...extra
			};
		};
		const fuller = [{ entityId: 'ws', kind: 'org', names: ['Wayne Strategies'] }];
		const kinds = new Map([
			['ws', 'org'],
			['strat', 'org'],
			['wayne', 'person']
		]);

		it('grows a cut-short tag and folds the other piece into it', () => {
			const plan = planRecordMentions({
				fields: { content: text },
				existing: [tag('Wayne', 'wayne'), tag('Strategies', 'strat')],
				reader: [],
				fuller,
				kinds
			});
			expect(plan.mentions.map((m) => [m.entity_id, m.text])).toEqual([
				['ws', 'Wayne Strategies']
			]);
			expect(plan.counts.widened).toBe(1);
			expect(plan.absorbed).toEqual(new Set(['wayne', 'strat']));
			expect(plan.present).toEqual(new Set(['ws']));
		});

		it('never moves the user’s own tag or a spot they removed a tag from', () => {
			const plan = planRecordMentions({
				fields: { content: text },
				existing: [
					tag('Strategies', 'strat', 0, { made_by: 'user' }),
					tag('Strategies', 'strat', 1, { made_by: 'user', status: 'removed' })
				],
				reader: [],
				fuller,
				kinds
			});
			expect(plan.mentions.map((m) => [m.entity_id, m.text, m.status])).toEqual([
				['strat', 'Strategies', 'active'],
				['strat', 'Strategies', 'removed']
			]);
			expect(plan.counts.widened).toBe(0);
			expect(plan.absorbed.size).toBe(0);
		});

		it('does not grow over a possessive or punctuation alone', () => {
			const said = "Cindy's van broke down. Martin Luther King Jr. spoke.";
			const plan = planRecordMentions({
				fields: { content: said },
				existing: [],
				reader: [
					{ entityId: 'cindy', kind: 'person', names: ['Cindy'] },
					{ entityId: 'mlk', kind: 'person', names: ['Martin Luther King Jr'] }
				],
				fuller: [
					{ entityId: 'shop', kind: 'org', names: ["Cindy's"] },
					{ entityId: 'mlk2', kind: 'person', names: ['Martin Luther King Jr.'] }
				],
				kinds
			});
			expect(plan.mentions.map((m) => [m.entity_id, m.text])).toEqual([
				['cindy', 'Cindy'],
				['mlk', 'Martin Luther King Jr']
			]);
			expect(plan.counts.widened).toBe(0);
		});

		it('keeps the shorter entry when it still has a tag of its own elsewhere', () => {
			const plan = planRecordMentions({
				fields: { content: `${text} Strategies alone.` },
				existing: [],
				reader: [{ entityId: 'strat', kind: 'org', names: ['Strategies'] }],
				fuller,
				kinds
			});
			expect(plan.mentions.map((m) => [m.entity_id, m.text])).toEqual([
				['ws', 'Wayne Strategies'],
				['ws', 'Wayne Strategies'],
				['strat', 'Strategies']
			]);
			expect(plan.absorbed.size).toBe(0);
		});
	});
});
