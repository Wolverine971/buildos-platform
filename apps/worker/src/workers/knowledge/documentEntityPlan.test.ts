// apps/worker/src/workers/knowledge/documentEntityPlan.test.ts
import { describe, expect, it } from 'vitest';
import { documentNerText } from './documentEntityText';
import { spansFromTokenLabels, type NerSpan, type TokenLabel } from './documentNer';
import {
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
