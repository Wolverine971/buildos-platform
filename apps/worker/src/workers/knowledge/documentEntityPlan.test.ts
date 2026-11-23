// apps/worker/src/workers/knowledge/documentEntityPlan.test.ts
import { describe, expect, it } from 'vitest';
import { documentNerText } from './documentEntityText';
import { spansFromTokenLabels, type NerSpan, type TokenLabel } from './documentNer';
import {
	completeKnownNames,
	joinSplitNames,
	pickDocumentEntities,
	planDocumentEntityKnowledge,
	tidyEntityName,
	type DocumentEntityContext
} from './documentEntityPlan';

describe('documentNerText', () => {
	it('keeps words and drops code, links, images and markdown markers', () => {
		const text = documentNerText(
			'Call notes',
			[
				'# Redline Training',
				'Met **Rod Chamberlin** at [the range](https://example.com/x).',
				'```ts\nconst Fake = "Not A Person";\n```',
				'![logo](https://img/x.png) see https://example.com/page',
				'| Name | Company |',
				'| --- | --- |',
				'| Larry Fox | Bid Desk |',
				'- [ ] Email Casey Fenske'
			].join('\n')
		);
		expect(text.headings).toEqual(['Call notes', 'Redline Training']);
		const all = text.chunks.join('\n');
		expect(all).toContain('Met Rod Chamberlin at the range.');
		expect(all).toContain('Larry Fox ; Bid Desk');
		expect(all).toContain('Email Casey Fenske');
		expect(all).not.toContain('Not A Person');
		expect(all).not.toContain('https');
		expect(all).not.toContain('**');
	});

	it('chunks long text under the limit without splitting words', () => {
		const words = Array.from({ length: 600 }, (_, i) => `word${i}`).join(' ');
		const text = documentNerText('', words, { chunkChars: 500 });
		expect(text.chunks.length).toBeGreaterThan(5);
		for (const chunk of text.chunks) expect(chunk.length).toBeLessThanOrEqual(500);
		expect(text.chunks.join(' ').split(' ')).toHaveLength(600);
	});
});

describe('spansFromTokenLabels', () => {
	const t = (token: string, label = 'O', prob = 0.99): TokenLabel => ({ token, label, prob });

	it('joins word pieces and I- tags into spans with offsets', () => {
		const chunk = 'Ask Casey Fenske at Dauntless Dogs.';
		const spans = spansFromTokenLabels(chunk, [
			t('[CLS]'),
			t('Ask'),
			t('Casey', 'B-PER'),
			t('Fen', 'I-PER'),
			t('##ske', 'I-PER'),
			t('at'),
			t('Da', 'B-ORG', 0.9),
			t('##unt', 'B-ORG'),
			t('##less', 'B-ORG'),
			t('Dogs', 'I-ORG', 0.8),
			t('.'),
			t('[SEP]')
		]);
		expect(spans.map((s) => [s.type, s.text])).toEqual([
			['PER', 'Casey Fenske'],
			['ORG', 'Dauntless Dogs']
		]);
		expect(spans[1]!.score).toBeCloseTo(0.85);
		expect(chunk.slice(spans[0]!.start, spans[0]!.end)).toBe('Casey Fenske');
	});

	it('never runs a name across a line break or a separator', () => {
		const spans = spansFromTokenLabels('Phil Velayo\nLogan / Redline', [
			t('Phil', 'B-PER'),
			t('Ve', 'I-PER'),
			t('##layo', 'I-PER'),
			t('Logan', 'I-PER'),
			t('/', 'I-ORG'),
			t('Red', 'I-ORG'),
			t('##line', 'I-ORG')
		]);
		expect(spans.map((s) => s.text)).toEqual(['Phil Velayo', 'Logan', 'Redline']);
	});
});

describe('pickDocumentEntities', () => {
	const chunks = [
		'John Coogan and Jordi Hays host TBPN. Coogan said OpenAI was late. DJ Wayne notes BuildOS.',
		'Louis called. John Coogan again. OpenAI again. Acme Corp once. Phil said hi. Phil twice.'
	];
	const span = (chunk: number, text: string, type: NerSpan['type'], score = 0.99): NerSpan => {
		const start = chunks[chunk]!.indexOf(text);
		return { type, text, score, chunk, start, end: start + text.length };
	};
	const spans: NerSpan[] = [
		span(0, 'John Coogan', 'PER'),
		span(0, 'Jordi Hays', 'PER'),
		span(0, 'TBPN', 'ORG', 0.6),
		span(0, 'Coogan', 'PER'),
		span(0, 'OpenAI', 'ORG'),
		span(0, 'DJ Wayne', 'PER'),
		span(0, 'BuildOS', 'ORG'),
		span(1, 'Louis', 'PER'),
		span(1, 'John Coogan', 'PER'),
		span(1, 'OpenAI', 'ORG'),
		span(1, 'Acme Corp', 'ORG'),
		span(1, 'Phil', 'PER'),
		span(1, 'Phil', 'PER')
	];
	const context: DocumentEntityContext = {
		selfNames: ['DJ Wayne'],
		projectNames: ['BuildOS'],
		hiddenNames: [],
		knownPeople: new Set(['phil'])
	};

	it('keeps confident names seen twice or in a heading, and says why the rest went', () => {
		const pick = pickDocumentEntities(spans, chunks, ['Acme Corp kickoff'], context);
		expect(pick.kept.map((c) => [c.kind, c.name, c.mentions])).toEqual([
			['person', 'John Coogan', 3],
			['org', 'OpenAI', 2],
			['person', 'Phil', 2],
			['org', 'Acme Corp', 1]
		]);
		expect(pick.kept.find((c) => c.name === 'Acme Corp')!.inHeading).toBe(true);
		expect(pick.kept[0]!.quote).toContain('John Coogan and Jordi Hays');
		const reasons = Object.fromEntries(pick.dropped.map((d) => [d.name, d.reason]));
		expect(reasons).toEqual({
			'Jordi Hays': 'one_mention',
			TBPN: 'low_confidence',
			'DJ Wayne': 'self',
			BuildOS: 'project',
			Louis: 'first_name_only'
		});
	});

	it('in link-only documents keeps only names already in the graph, never first names', () => {
		const pick = pickDocumentEntities(spans, chunks, [], context, {
			onlyExisting: new Set(['org|openai', 'person|phil'])
		});
		expect(pick.kept.map((c) => c.name)).toEqual(['OpenAI']);
		expect(pick.dropped.find((d) => d.name === 'John Coogan')!.reason).toBe('not_in_graph');
		expect(pick.dropped.find((d) => d.name === 'Phil')!.reason).toBe('first_name_only');
	});

	it('drops names the user hid', () => {
		const pick = pickDocumentEntities(spans, chunks, [], {
			...context,
			hiddenNames: ['openai']
		});
		expect(pick.dropped.find((d) => d.name === 'OpenAI')!.reason).toBe('hidden');
	});
});

describe('tidyEntityName / planDocumentEntityKnowledge', () => {
	it('trims edge punctuation and possessives', () => {
		expect(tidyEntityName('. Wallach')).toBe('Wallach');
		expect(tidyEntityName("Google's")).toBe('Google');
		expect(tidyEntityName('Acme, Inc.')).toBe('Acme, Inc.');
		expect(tidyEntityName('Richard Avedon.')).toBe('Richard Avedon');
	});

	it('writes entries and document links, no facts or sources', () => {
		const batch = planDocumentEntityKnowledge({ id: 'doc-1' }, [
			{ kind: 'org', name: 'OpenAI', mentions: 2, inHeading: false, score: 0.99, quote: 'q' }
		]);
		expect(batch).toEqual({
			entities: [{ ref: 'd0', kind: 'org', name: 'OpenAI' }],
			facts: [],
			links: [{ entity: 'd0', record_kind: 'document', record_id: 'doc-1', quote: 'q' }]
		});
	});
});

// What the real model (Xenova/bert-base-NER, q8) returned for DJ's "Wayne Strategies Context"
// doc on 2026-11-22: the firm's name read whole, split, or as a person depending on the sentence.
describe('cut-short names (Wayne Strategies)', () => {
	const chunks = [
		'Wayne Strategies — current identity',
		'DJ selected Wayne Strategies and reports purchasing the domain.',
		'Should Wayne Strategies become a government vendor?',
		'Referrals come from the Wayne Strategies site.',
		'Murtech and Fortress Training are low priority. Fortress said no.'
	];
	const at = (chunk: number, text: string, type: NerSpan['type'], score: number): NerSpan => {
		const start = chunks[chunk]!.indexOf(text);
		return { type, text, score, chunk, start, end: start + text.length };
	};
	const modelSpans: NerSpan[] = [
		at(0, 'Wayne Strategies', 'PER', 0.99),
		at(1, 'Wayne', 'PER', 0.93),
		at(1, 'Strategies', 'ORG', 0.48),
		at(2, 'Wayne', 'PER', 0.78),
		at(2, 'Strategies', 'ORG', 0.78),
		at(3, 'Wayne Strategies', 'ORG', 1)
	];
	const base: DocumentEntityContext = {
		selfNames: ['DJ Wayne'],
		projectNames: ['Wayne Strategies'],
		hiddenNames: [],
		knownPeople: new Set()
	};

	it('joins a name the model split with only a space between the pieces', () => {
		const joined = joinSplitNames(modelSpans, chunks);
		expect(joined.map((s) => [s.chunk, s.type, s.text])).toEqual([
			[0, 'PER', 'Wayne Strategies'],
			[1, 'ORG', 'Wayne Strategies'],
			[2, 'ORG', 'Wayne Strategies'],
			[3, 'ORG', 'Wayne Strategies']
		]);
		// Not across other words.
		const apart = joinSplitNames(
			[at(4, 'Murtech', 'ORG', 0.9), at(4, 'Fortress Training', 'ORG', 0.9)],
			chunks
		);
		expect(apart).toHaveLength(2);
	});

	it('links the whole name to the entry the user already has, never the fragment', () => {
		const pick = pickDocumentEntities(modelSpans, chunks, [chunks[0]!], {
			...base,
			knownNames: [{ kind: 'org', name: 'Wayne Strategies' }],
			existing: new Set(['org|wayne strategies'])
		});
		expect(pick.kept).toEqual([
			expect.objectContaining({ kind: 'org', name: 'Wayne Strategies', mentions: 4 })
		]);
		expect(pick.dropped.map((d) => d.name)).not.toContain('Strategies');
	});

	it('with no entry yet, the fragment is never filed on its own', () => {
		const pick = pickDocumentEntities(modelSpans, chunks, [chunks[0]!], base);
		const names = [...pick.kept, ...pick.dropped].map((x) => x.name);
		expect(names).not.toContain('Strategies');
		expect(names).not.toContain('Wayne');
		expect(pick.kept).toEqual([]);
	});

	it('grows a MISC or short span to the known name around it, taking its kind', () => {
		const grown = completeKnownNames(
			[
				at(4, 'Fortress', 'MISC', 0.55),
				{ ...at(4, 'Fortress', 'MISC', 0.6), start: 48, end: 56 }
			],
			chunks,
			[{ kind: 'org', name: 'Fortress Training' }]
		);
		expect(grown.map((s) => [s.type, s.text, s.known ?? false])).toEqual([
			['ORG', 'Fortress Training', true],
			['MISC', 'Fortress', false]
		]);
	});

	it('a place grows into a longer known name but is never retyped as a same-name entry', () => {
		const text = ['A trip to Jordan in May.', 'Tickets for the Baltimore Ravens game.'];
		const place = (chunk: number, word: string): NerSpan => {
			const start = text[chunk]!.indexOf(word);
			return { type: 'LOC', text: word, score: 0.95, chunk, start, end: start + word.length };
		};
		const grown = completeKnownNames([place(0, 'Jordan'), place(1, 'Baltimore')], text, [
			{ kind: 'person', name: 'Jordan' },
			{ kind: 'org', name: 'Baltimore Ravens' }
		]);
		expect(grown.map((s) => [s.type, s.text])).toEqual([
			['LOC', 'Jordan'],
			['ORG', 'Baltimore Ravens']
		]);
	});
});
