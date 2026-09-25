// packages/shared-agent-ops/src/ontology/document-edits.test.ts

import { describe, expect, it } from 'vitest';
import {
	createDocumentRevertPatch,
	DOCUMENT_REPLACE_ALL_MAX,
	findInDocument,
	formatDocumentEditFailures,
	largeDeletionRefusal,
	resolveDocumentEdits,
	summarizeDocumentChange,
	type DocumentSectionEditV1,
	type DocumentTextEditV1
} from './document-edits';
import { resolveDocumentPatch } from './document-patch';

const IDS = { project_id: 'project-1', document_id: 'document-1' };

// Same shape as the book-loop p02 document: an em-dash contract line, repeated
// card labels, and nested headings with subsections.
const CONTRACT = [
	'## Phase 1: The Book Contract',
	'',
	'**Target Reader:** People who feel stuck and want leverage.',
	'',
	'**Scope Cap:** ~60,000 words.',
	'',
	'**Exclusions:** [To be defined — what does this book deliberately NOT cover?]',
	'',
	'## Phase 2: Chapter Blueprint',
	'',
	'Map the frameworks before drafting.',
	'',
	'### Part I — Seeing the Picture',
	'',
	'**Card 1 · The Hacks**',
	'- **Reader promise:** You will see leverage points.',
	'',
	'**Card 2 · The Game**',
	'- **Reader promise:** You will read intent.',
	'',
	'### Part II — Tactics',
	'',
	'**Card 3 · Turn Outward**',
	'- **Reader promise:** A tactic that flips any conversation.',
	'',
	'## Open Items',
	'',
	'- One big reveal: undecided.'
].join('\n');

const EXCLUSIONS_LINE =
	'**Exclusions:** [To be defined — what does this book deliberately NOT cover?]';

function resolve(
	content: string,
	edits: DocumentTextEditV1[] = [],
	section_edits: DocumentSectionEditV1[] = []
) {
	return resolveDocumentEdits({ ...IDS, content, edits, section_edits });
}

function resolved(result: ReturnType<typeof resolve>): string {
	if (result.status !== 'resolved') {
		throw new Error(`Expected resolved edits, got ${JSON.stringify(result.failures)}`);
	}
	return result.next_content;
}

describe('resolveDocumentEdits: text edits', () => {
	it('deletes one whole line and its separating blank line, nothing else', () => {
		const result = resolve(CONTRACT, [{ old_text: EXCLUSIONS_LINE, new_text: '' }]);
		const next = resolved(result);
		expect(next).toBe(CONTRACT.replace(`${EXCLUSIONS_LINE}\n\n`, ''));
		expect(next).toContain('**Scope Cap:** ~60,000 words.\n\n## Phase 2');
		expect(result.status === 'resolved' && result.applied).toEqual([
			{ edit: 'edits[0]', match: 'exact', lines: [7] }
		]);
	});

	it('matches through typographic drift: a hyphen typed for the em dash', () => {
		const result = resolve(CONTRACT, [
			{
				old_text:
					'**Exclusions:** [To be defined - what does this book deliberately NOT cover?]',
				new_text: ''
			}
		]);
		expect(resolved(result)).not.toContain('Exclusions');
		expect(result.status === 'resolved' && result.applied[0]?.match).toBe('normalized');
	});

	it('matches through curly quotes, double hyphens, and padding whitespace', () => {
		const doc = 'Intro\n\nShe said “ship it” — twice.\n\nEnd';
		const next = resolved(
			resolve(doc, [{ old_text: '  She said "ship it" -- twice.\n', new_text: 'Shipped.\n' }])
		);
		expect(next).toBe('Intro\n\nShipped.\n\nEnd');
	});

	it('strips copied line-number prefixes', () => {
		const next = resolved(
			resolve(CONTRACT, [{ old_text: `7: ${EXCLUSIONS_LINE}`, new_text: '' }])
		);
		expect(next).not.toContain('Exclusions');
	});

	it('rejects a non-unique anchor with every matching line, and replace_all applies to all', () => {
		const ambiguous = resolve(CONTRACT, [
			{ old_text: '**Reader promise:**', new_text: '**Promise:**' }
		]);
		expect(ambiguous).toMatchObject({
			status: 'rejected',
			failures: [{ edit: 'edits[0]', code: 'ANCHOR_AMBIGUOUS', match_lines: [16, 19, 24] }]
		});

		const all = resolved(
			resolve(CONTRACT, [
				{ old_text: '**Reader promise:**', new_text: '**Promise:**', replace_all: true }
			])
		);
		expect(all.match(/\*\*Promise:\*\*/g)).toHaveLength(3);
		expect(all).not.toContain('Reader promise');
	});

	it('suggests the closest real line when old_text was paraphrased', () => {
		const result = resolve(CONTRACT, [
			{
				old_text: '**Exclusions:** [To be defined, what this book does NOT cover]',
				new_text: ''
			}
		]);
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.failures[0]).toMatchObject({ code: 'ANCHOR_NOT_FOUND' });
		expect(result.failures[0]?.suggestions?.[0]).toEqual({ line: 7, text: EXCLUSIONS_LINE });
		expect(formatDocumentEditFailures(result.failures)).toContain('Did you mean line 7?');
	});

	it('names the line a copied block left out, and which edits already matched', () => {
		const card = [
			'**Card 9 · The Ledger**',
			'- **Reader promise:** You will see leverage points.',
			'- **Example / evidence:** **[GAP]**',
			'- **Takeaway:** Look twice.'
		].join('\n');
		const doc = `${CONTRACT}\n\n${card}`;
		const result = resolveDocumentEdits({
			...IDS,
			content: doc,
			edits: [
				{
					old_text: [
						'**Card 9 · The Ledger**',
						'- **Reader promise:** You will see leverage points.',
						'- **Takeaway:** Look twice.'
					].join('\n'),
					new_text: 'rewritten card'
				},
				{ old_text: '~60,000 words', new_text: '~55,000 words' }
			]
		});
		expect(result).toMatchObject({
			status: 'rejected',
			matched_edits: ['edits[1]'],
			failures: [
				{
					edit: 'edits[0]',
					code: 'ANCHOR_NOT_FOUND',
					suggestions: [{ line: 32, text: '- **Example / evidence:** **[GAP]**' }]
				}
			]
		});
		if (result.status !== 'rejected') return;
		expect(result.failures[0]?.message).toContain('leaves out document line 32');
		expect(formatDocumentEditFailures(result.failures, result.matched_edits)).toContain(
			'edits[1] matched and will apply once the failed edit is fixed'
		);
	});

	it('names the first differing line of a reworded block', () => {
		const result = resolve(CONTRACT, [
			{
				old_text: '**Scope Cap:** ~60,000 words.\n\n**Exclusions:** none',
				new_text: ''
			}
		]);
		expect(result).toMatchObject({ status: 'rejected' });
		if (result.status !== 'rejected') return;
		expect(result.failures[0]?.message).toContain(
			'old_text line 2 differs from document line 7'
		);
	});

	it('is all-or-nothing and reports every failing edit', () => {
		const result = resolve(CONTRACT, [
			{
				old_text: '**Scope Cap:** ~60,000 words.',
				new_text: '**Scope Cap:** ~55,000 words.'
			},
			{ old_text: 'not in the document at all', new_text: '' },
			{ old_text: '', new_text: 'x' },
			{ old_text: 'Open Items', new_text: 'Open Items' }
		]);
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.failures.map((failure) => [failure.edit, failure.code])).toEqual([
			['edits[1]', 'ANCHOR_NOT_FOUND'],
			['edits[2]', 'INVALID_EDIT'],
			['edits[3]', 'INVALID_EDIT']
		]);
		expect(formatDocumentEditFailures(result.failures)).toMatch(/^No edits were applied/);
	});

	it('applies several edits against the same base', () => {
		const next = resolved(
			resolve(CONTRACT, [
				{ old_text: '~60,000 words', new_text: '~55,000 words' },
				{ old_text: EXCLUSIONS_LINE, new_text: '' }
			])
		);
		expect(next).toContain('**Scope Cap:** ~55,000 words.\n\n## Phase 2');
	});

	it('rejects overlapping edits', () => {
		const result = resolve(CONTRACT, [
			{ old_text: '**Scope Cap:** ~60,000 words.', new_text: 'a' },
			{ old_text: '~60,000 words', new_text: 'b' }
		]);
		expect(result).toMatchObject({
			status: 'rejected',
			failures: [{ edit: 'edits[1]', code: 'OVERLAPPING_EDITS' }]
		});
	});

	it('refuses edits inside START HERE managed regions but allows authored text', () => {
		const startHere = [
			'# START HERE',
			'',
			'<!-- managed:status v=1 -->',
			'**Now:** 7 open tasks · 0 overdue',
			'<!-- /managed:status -->',
			'',
			'## Decisions',
			'',
			'- Exclusions dropped.'
		].join('\n');
		expect(
			resolve(startHere, [{ old_text: '7 open tasks', new_text: '8 open tasks' }])
		).toMatchObject({
			status: 'rejected',
			failures: [{ code: 'MANAGED_REGION_BOUNDARY' }]
		});
		expect(
			resolved(resolve(startHere, [{ old_text: '- Exclusions dropped.', new_text: '' }]))
		).toBe(startHere.replace(/\n+- Exclusions dropped\.$/, ''));
	});
});

describe('resolveDocumentEdits: section edits', () => {
	it('replaces a section body, keeping its heading and subsections', () => {
		const next = resolved(
			resolve(
				CONTRACT,
				[],
				[
					{
						action: 'replace',
						section: 'phase-2-chapter-blueprint',
						content: '## Phase 2: Chapter Blueprint\n\nDraft the frameworks first.'
					}
				]
			)
		);
		expect(next).toContain(
			'## Phase 2: Chapter Blueprint\n\nDraft the frameworks first.\n\n### Part I'
		);
		expect(next).not.toContain('Map the frameworks');
		expect(next.match(/## Phase 2/g)).toHaveLength(1);
	});

	it('deletes a whole section including its subsections', () => {
		const next = resolved(
			resolve(CONTRACT, [], [{ action: 'delete', section: 'Phase 2: Chapter Blueprint' }])
		);
		expect(next).toContain('?]\n\n## Open Items');
		expect(next).not.toContain('Card 1');
	});

	it('deletes the last section without leaving trailing blank lines', () => {
		const next = resolved(resolve(CONTRACT, [], [{ action: 'delete', section: 'open-items' }]));
		expect(next.endsWith('conversation.\n')).toBe(true);
	});

	it('appends to the section’s own text, before its subsections', () => {
		const next = resolved(
			resolve(
				CONTRACT,
				[],
				[
					{
						action: 'append',
						section: 'phase-2-chapter-blueprint',
						content: 'Keep cards short.'
					}
				]
			)
		);
		expect(next).toContain(
			'Map the frameworks before drafting.\n\nKeep cards short.\n\n### Part I'
		);
	});

	it('prepends right under the heading', () => {
		const next = resolved(
			resolve(
				CONTRACT,
				[],
				[{ action: 'prepend', section: 'open-items', content: 'Resolve by Friday.' }]
			)
		);
		expect(next).toContain('## Open Items\n\nResolve by Friday.\n\n- One big reveal');
	});

	it('moves a section after another one', () => {
		const next = resolved(
			resolve(
				CONTRACT,
				[],
				[
					{
						action: 'move',
						section: 'open-items',
						after_section: 'phase-1-the-book-contract'
					}
				]
			)
		);
		const order = ['## Phase 1', '## Open Items', '## Phase 2'].map((heading) =>
			next.indexOf(heading)
		);
		expect(order).toEqual([...order].sort((left, right) => left - right));
		expect(next).toContain('?]\n\n## Open Items\n\n- One big reveal: undecided.\n\n## Phase 2');
		expect(next.match(/## Open Items/g)).toHaveLength(1);
	});

	it('moves a section before another one and refuses moving into itself', () => {
		const next = resolved(
			resolve(
				CONTRACT,
				[],
				[
					{
						action: 'move',
						section: 'part-ii--tactics',
						before_section: 'part-i--seeing-the-picture'
					}
				]
			)
		);
		expect(next.indexOf('### Part II')).toBeLessThan(next.indexOf('### Part I —'));

		expect(
			resolve(
				CONTRACT,
				[],
				[
					{
						action: 'move',
						section: 'phase-2-chapter-blueprint',
						after_section: 'part-i--seeing-the-picture'
					}
				]
			)
		).toMatchObject({ status: 'rejected', failures: [{ code: 'INVALID_EDIT' }] });
	});

	it('lists anchors when a section is unknown', () => {
		const result = resolve(CONTRACT, [], [{ action: 'delete', section: 'Exclusions' }]);
		expect(result).toMatchObject({
			status: 'rejected',
			failures: [{ code: 'SECTION_NOT_FOUND' }]
		});
		if (result.status !== 'rejected') return;
		expect(result.failures[0]?.available_sections).toContain('phase-1-the-book-contract');
	});
});

describe('findInDocument', () => {
	it('returns exact lines with their section and context', () => {
		const result = findInDocument(CONTRACT, 'exclusion');
		expect(result.total_matches).toBe(1);
		expect(result.matches[0]).toEqual({
			line: 7,
			text: EXCLUSIONS_LINE,
			section: 'phase-1-the-book-contract',
			before: [''],
			after: ['']
		});
	});

	it('falls back to lines holding every word', () => {
		const result = findInDocument(CONTRACT, 'promise conversation', { context_lines: 0 });
		expect(result.matches).toEqual([
			{
				line: 24,
				text: '- **Reader promise:** A tactic that flips any conversation.',
				section: 'part-ii--tactics'
			}
		]);
	});
});

describe('summarizeDocumentChange + revert patch', () => {
	const after = CONTRACT.replace(`${EXCLUSIONS_LINE}\n\n`, '');

	it('reports GitHub-style stats and bounded hunks', () => {
		const summary = summarizeDocumentChange({
			...IDS,
			title: 'Book Contract',
			before: CONTRACT,
			after
		});
		expect(summary).toMatchObject({
			lines_added: 0,
			lines_removed: 2,
			hunks_truncated: false,
			title: 'Book Contract'
		});
		expect(summary?.hunks[0]?.lines.filter((line) => line.kind === 'remove')).toEqual([
			{ kind: 'remove', text: EXCLUSIONS_LINE },
			{ kind: 'remove', text: '' }
		]);
		expect(summarizeDocumentChange({ ...IDS, before: CONTRACT, after: CONTRACT })).toBeNull();
	});

	it('undoes the change, even after a later unrelated edit', () => {
		const summary = summarizeDocumentChange({ ...IDS, before: CONTRACT, after });
		const patch = summary?.revert_patch;
		expect(patch).toBeTruthy();
		if (!patch) return;

		const undone = resolveDocumentPatch(patch, after);
		expect(undone).toMatchObject({ status: 'resolved', next_content: CONTRACT });

		const laterEdit = after.replace(
			'One big reveal: undecided.',
			'One big reveal: the ending.'
		);
		const reanchored = resolveDocumentPatch(patch, laterEdit);
		expect(reanchored.status).toBe('resolved');
		if (reanchored.status !== 'resolved') return;
		expect(reanchored.next_content).toContain(EXCLUSIONS_LINE);
		expect(reanchored.next_content).toContain('the ending.');
	});

	it('refuses to undo when the changed text was edited again', () => {
		const renamed = CONTRACT.replace('~60,000 words', '~55,000 words');
		const summary = summarizeDocumentChange({ ...IDS, before: CONTRACT, after: renamed });
		const patch = summary?.revert_patch;
		if (!patch) throw new Error('expected revert patch');
		const overwritten = renamed.replace('~55,000 words', '~50,000 words');
		expect(resolveDocumentPatch(patch, overwritten).status).toBe('conflict');
	});
});

describe('largeDeletionRefusal', () => {
	it('refuses a replace that drops most of a long document, allows small trims', () => {
		const long = 'x'.repeat(11_000);
		expect(largeDeletionRefusal(long, 'x'.repeat(2_000))).toMatch(/82% removed/);
		expect(largeDeletionRefusal(long, 'x'.repeat(9_000))).toBeNull();
		expect(largeDeletionRefusal('short doc', '')).toBeNull();
	});
});

describe('tasker 98 review fixes', () => {
	function checklistDocument(sections: number): string {
		const lines: string[] = [];
		for (let section = 0; section < sections; section += 1) {
			lines.push(`## Section ${section}`, '');
			for (let item = 0; item < 25; item += 1) {
				lines.push(`- item ${section}.${item} with some words to pad the line out a bit more`);
			}
			lines.push('');
		}
		return `${lines.join('\n')}\n`;
	}

	it('prepend leaves a blank line before the text that follows', () => {
		const next = resolved(
			resolve(
				'# A\n## H\nexisting para\n\n## I\ni\n',
				[],
				[{ action: 'prepend', section: 'h', content: 'NEW LINE' }]
			)
		);
		expect(next).toBe('# A\n## H\n\nNEW LINE\n\nexisting para\n\n## I\ni\n');
	});

	it('section edits on a CRLF document change the named section only', () => {
		const crlf =
			'# Title\r\nIntro line\r\n\r\n## Alpha\r\nalpha body\r\nmore alpha\r\n\r\n## Beta\r\nbeta body\r\n';
		expect(resolved(resolve(crlf, [], [{ action: 'delete', section: 'alpha' }]))).toBe(
			'# Title\r\nIntro line\r\n\r\n## Beta\r\nbeta body\r\n'
		);
		const replaced = resolved(
			resolve(crlf, [], [{ action: 'replace', section: 'beta', content: 'NEW BETA' }])
		);
		expect(replaced).toContain(
			'## Alpha\r\nalpha body\r\nmore alpha\r\n\r\n## Beta\r\n'
		);
		expect(replaced).toContain('NEW BETA');
		expect(replaced).not.toContain('beta body');
	});

	it('refuses section edits when heading offsets cannot be trusted', () => {
		const defs =
			'# Doc\n\n[a]: http://x\n\n[a]: http://y\n\n## Alpha\nalpha body\n\n## Beta\nbeta body\n';
		expect(
			resolve(defs, [], [{ action: 'replace', section: 'beta', content: 'NEW' }])
		).toMatchObject({ status: 'rejected', failures: [{ code: 'SECTION_NOT_FOUND' }] });
		// Text edits still work, and Alpha's body is untouched.
		expect(resolved(resolve(defs, [{ old_text: 'beta body', new_text: 'NEW' }]))).toBe(
			defs.replace('beta body', 'NEW')
		);
	});

	it('caps replace_all with an error the model can act on', () => {
		const items = (count: number) =>
			Array.from({ length: count }, (_, index) => `- item ${index} todo`).join('\n');
		const edit = { old_text: 'todo', new_text: 'done', replace_all: true };
		const over = resolve(items(DOCUMENT_REPLACE_ALL_MAX + 1), [edit]);
		expect(over).toMatchObject({ status: 'rejected', failures: [{ code: 'INVALID_EDIT' }] });
		expect(over.status === 'rejected' ? over.failures[0]!.message : '').toMatch(
			/matches 201 places, more than the 200/
		);
		expect(resolved(resolve(items(DOCUMENT_REPLACE_ALL_MAX), [edit]))).not.toContain('todo');
	});

	it('summarizes a 180KB rewrite quickly and drops an Undo patch over the cap', () => {
		const before = checklistDocument(120);
		const after = before
			.split('\n')
			.map((line, index) => (index % 2 === 0 && line.startsWith('- ') ? `${line} (edited)` : line))
			.join('\n');
		expect(before.length).toBeGreaterThan(180_000);

		// Before the fix this took ~25s: one full Markdown parse per changed run. Coverage
		// instrumentation slows this ~9x (18s in CI), so the budget scales but still fails
		// the old quadratic path (~225s instrumented).
		const budgetMs = process.env.VITEST_COVERAGE ? 60_000 : 2_000;
		let started = performance.now();
		const summary = summarizeDocumentChange({ ...IDS, before, after });
		expect(performance.now() - started).toBeLessThan(budgetMs);
		expect(summary?.lines_added).toBeGreaterThan(1_000);
		expect(summary?.revert_patch).toBeNull();

		started = performance.now();
		expect(createDocumentRevertPatch({ ...IDS, before, after })).toBeNull();
		expect(performance.now() - started).toBeLessThan(budgetMs);
	});

	it('still carries a working Undo patch for a small edit in a long document', () => {
		const before = checklistDocument(40);
		const after = before.replace('- item 20.3 with', '- item 20.3 (moved up) with');
		const summary = summarizeDocumentChange({ ...IDS, before, after });
		expect(summary?.revert_patch).toBeTruthy();
		expect(resolveDocumentPatch(summary!.revert_patch!, after)).toMatchObject({
			status: 'resolved',
			next_content: before
		});
		expect(
			summarizeDocumentChange({ ...IDS, before, after, include_revert_patch: false })
				?.revert_patch
		).toBeNull();
	});

	it('a second Undo refuses to delete the user’s identical line once the body moved on', () => {
		const original =
			'# Plan\n\n## Tasks\n- [ ] Call Sam\n- [ ] Draft deck\n- [ ] Book venue\n\n## Notes\nnotes here\n';
		const edited = resolved(
			resolve(original, [
				{ old_text: '- [ ] Book venue', new_text: '- [ ] Book venue\n- [ ] Call Sam' }
			])
		);
		const patch = summarizeDocumentChange({ ...IDS, before: original, after: edited })
			?.revert_patch;
		if (!patch) throw new Error('expected revert patch');
		expect(resolveDocumentPatch(patch, edited, { strict_context: true })).toMatchObject({
			status: 'resolved',
			next_content: original
		});
		// Undo already ran, then the user edited Notes: the only "- [ ] Call Sam" left
		// is the user's own line, between different neighbours.
		const laterBody = original.replace('notes here', 'notes here, updated');
		expect(resolveDocumentPatch(patch, laterBody, { strict_context: true })).toEqual({
			status: 'conflict',
			reason: 'BASE_TEXT_CHANGED'
		});
		// With the agent's line still present, strict Undo re-anchors past other edits.
		const editedLater = edited.replace('notes here', 'notes here, updated');
		expect(resolveDocumentPatch(patch, editedLater, { strict_context: true })).toMatchObject({
			status: 'resolved',
			strategy: 'reanchored',
			next_content: laterBody
		});
	});
});
