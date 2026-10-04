// packages/shared-agent-ops/src/consolidation/ledger.test.ts
// Facts from DJ's real Rod Chamberlin docs (docs/research/doc-task-consolidation-2026-10-03/rod-ledger.json).
import { describe, expect, it } from 'vitest';
import {
	OTHER_NOTES_SECTION,
	checkLedger,
	fateCounts,
	quoteFound,
	repairLedger,
	safeEdits,
	sectionFacts,
	type LedgerFact,
	type LedgerFate,
	type MergeLedger
} from './ledger';

const fact = (id: string, text: string, kind: LedgerFact['kind'] = 'durable'): LedgerFact => ({
	id,
	source_id: 'doc',
	kind,
	text,
	quote: text,
	as_of: null
});
const fate = (
	fact_id: string,
	value: LedgerFate['fate'],
	extra: Partial<LedgerFate> = {}
): LedgerFate => ({
	fact_id,
	fate: value,
	with: null,
	reason: null,
	section: null,
	...extra
});

const rod: MergeLedger = {
	facts: [
		fact('F1', 'Rod is a referral from Phil Velayo.'),
		fact('F2', 'Intake referral source: Phil Velayo.'),
		fact(
			'F3',
			'All website work ON HOLD pending compliance review; check-in Monday, February 2.',
			'status'
		),
		fact(
			'F4',
			'Sep 25: shortened preview email sent; Rod asked DJ to lead distribution.',
			'status'
		),
		fact('F5', 'Folder note listing the other Rod docs.', 'reference'),
		fact(
			'F6',
			'Intake claims team bios and a website audit; only this summary is left.',
			'reference'
		)
	],
	fates: [
		fate('F1', 'keep', { section: 'Who Rod is' }),
		fate('F2', 'merged', { with: 'F1' }),
		fate('F3', 'history', { section: 'Website project history' }),
		fate('F4', 'keep', { section: 'Where things stand' }),
		fate('F5', 'dropped', { reason: 'The new doc replaces it.' }),
		fate('F6', 'missing', { reason: 'Content gone before May 22.' })
	],
	sections: ['Where things stand', 'Who Rod is', 'Website project history'],
	flags: [],
	unverified: []
};

describe('fact ledger', () => {
	it('accepts a complete ledger', () => {
		expect(checkLedger(rod)).toEqual([]);
		expect(fateCounts(rod)).toMatchObject({
			keep: 2,
			merged: 1,
			history: 1,
			dropped: 1,
			missing: 1
		});
		expect(
			sectionFacts(rod).map((section) => [section.heading, section.facts.map((f) => f.id)])
		).toEqual([
			['Where things stand', ['F4']],
			['Who Rod is', ['F1']],
			['Website project history', ['F3']]
		]);
	});

	it('names every gap: a fact with no fate, a dangling link, a silent drop, a missing section', () => {
		const broken: MergeLedger = {
			...rod,
			fates: [
				fate('F1', 'keep', { section: 'Nowhere' }),
				fate('F2', 'merged', { with: 'F9' }),
				fate('F3', 'history', { section: 'Website project history' }),
				fate('F3', 'keep', { section: 'Who Rod is' }),
				fate('F5', 'dropped')
			]
		};
		expect(
			checkLedger(broken).map((problem) => `${problem.fact_id}: ${problem.problem}`)
		).toEqual([
			'F3: more than one fate',
			'F4: no fate',
			'F6: no fate',
			'F1: placed fact needs one of the sections',
			'F2: merged needs another fact in "with"',
			'F5: dropped needs a reason'
		]);
	});

	it('repairs by keeping, never by dropping', () => {
		const repaired = repairLedger({
			...rod,
			fates: [
				fate('F1', 'dropped', { reason: 'model thought it was junk' }),
				fate('F2', 'merged', { with: 'F1' }),
				fate('F5', 'dropped')
			]
		});
		expect(checkLedger(repaired)).toEqual([]);
		const byId = new Map(repaired.fates.map((item) => [item.fact_id, item]));
		// F2 pointed at a dropped fact, F5 dropped without a reason, F3/F4/F6 had no fate.
		for (const id of ['F2', 'F3', 'F4', 'F5', 'F6'])
			expect(byId.get(id)).toMatchObject({ fate: 'keep', section: OTHER_NOTES_SECTION });
		// A dropped fact with a reason stays dropped: the owner sees it in the review.
		expect(byId.get('F1')).toMatchObject({ fate: 'dropped' });
		expect(repaired.sections.at(-1)).toBe(OTHER_NOTES_SECTION);
	});

	it('never lets a replaced fact vanish: cycles and replacements the doc does not show are kept', () => {
		const cycle = repairLedger({
			...rod,
			fates: [
				...rod.fates.filter((item) => item.fact_id !== 'F3' && item.fact_id !== 'F4'),
				fate('F3', 'superseded', { with: 'F4' }),
				fate('F4', 'superseded', { with: 'F3' })
			]
		});
		expect(checkLedger(cycle)).toEqual([]);
		const byId = new Map(cycle.fates.map((item) => [item.fact_id, item]));
		// Neither side of the cycle silently wins: both stay, as history.
		expect(byId.get('F3')).toMatchObject({ fate: 'history', section: OTHER_NOTES_SECTION });
		expect(byId.get('F4')).toMatchObject({ fate: 'history', section: OTHER_NOTES_SECTION });

		const intoDropped = {
			...rod,
			fates: rod.fates.map((item) =>
				item.fact_id === 'F3' ? fate('F3', 'superseded', { with: 'F5' }) : item
			)
		};
		expect(checkLedger(intoDropped).map((problem) => problem.fact_id)).toEqual(['F3']);
		expect(repairLedger(intoDropped).fates.find((item) => item.fact_id === 'F3')).toMatchObject(
			{ fate: 'history', section: OTHER_NOTES_SECTION }
		);

		// A chain that ends at a fact the doc shows is fine.
		const chain = {
			...rod,
			fates: rod.fates.map((item) =>
				item.fact_id === 'F3' ? fate('F3', 'superseded', { with: 'F2' }) : item
			)
		};
		expect(checkLedger(chain)).toEqual([]);
	});

	it('treats only edits that keep a fact’s words visible as safe to apply unasked', () => {
		expect(
			safeEdits([fate('F1', 'keep', { section: 'Who Rod is' }), fate('F6', 'missing')])
		).toBe(true);
		expect(safeEdits([fate('F2', 'merged', { with: 'F1' })])).toBe(false);
		expect(safeEdits([fate('F3', 'superseded', { with: 'F4' })])).toBe(false);
		expect(safeEdits([fate('F5', 'dropped', { reason: 'junk' })])).toBe(false);
	});

	it('finds quotes regardless of whitespace and case', () => {
		expect(
			quoteFound(
				'- Domains: Ionos (magnumwealthmanagement.com,\n  beyondexitplanning.com).',
				'domains: ionos (magnumwealthmanagement.com, beyondexitplanning.com)'
			)
		).toBe(true);
		expect(quoteFound('Demo Jan 20', 'Demo Jan 21')).toBe(false);
		// Markdown and typography the model drops when it quotes what it read.
		expect(
			quoteFound(
				'- **Commercial priority:** Ian’s offer — a | **$1,200** | pilot',
				"Commercial priority: Ian's offer - a $1,200 pilot"
			)
		).toBe(true);
		expect(quoteFound('**Offer:** $1,200 pilot', 'Offer: $2,400 pilot')).toBe(false);
		expect(quoteFound('anything', 'an')).toBe(false);
		// Short quotes count when they stand on their own.
		expect(quoteFound('Retainer: $40 per hour.', '$40')).toBe(true);
		expect(quoteFound('Owner: Ana.', 'Ana')).toBe(true);
		expect(quoteFound('Banana bread.', 'ana')).toBe(false);
		expect(quoteFound('anything', '')).toBe(false);
	});
});
