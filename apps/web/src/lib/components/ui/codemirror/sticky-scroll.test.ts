// apps/web/src/lib/components/ui/codemirror/sticky-scroll.test.ts
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	buildHeadingIndex,
	findActiveHeadingIndex,
	getActivePath,
	type StickyHeading,
	type StickyHeadingIndex
} from './sticky-scroll';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = { maxLines: 5, minLevel: 1 as const, maxLevel: 6 as const };

/** Create an EditorState with markdown language and force a full parse. */
function createParsedState(doc: string): EditorState {
	const state = EditorState.create({
		doc,
		extensions: [markdown()]
	});
	// Force the parser to process the entire document
	ensureSyntaxTree(state, state.doc.length, 5000);
	return state;
}

/** Build a heading index from a markdown string. */
function indexFromMarkdown(doc: string, config = DEFAULT_CONFIG): StickyHeadingIndex {
	const state = createParsedState(doc);
	return buildHeadingIndex(state, config);
}

// ---------------------------------------------------------------------------
// findActiveHeadingIndex (binary search)
// ---------------------------------------------------------------------------

describe('findActiveHeadingIndex', () => {
	it('returns -1 for empty positions array', () => {
		expect(findActiveHeadingIndex([], 100)).toBe(-1);
	});

	it('returns -1 when topPos is before all headings', () => {
		expect(findActiveHeadingIndex([10, 20, 30], 5)).toBe(-1);
	});

	it('returns the index of the exact match', () => {
		expect(findActiveHeadingIndex([10, 20, 30], 20)).toBe(1);
	});

	it('returns the last heading at or before topPos', () => {
		expect(findActiveHeadingIndex([10, 20, 30], 25)).toBe(1);
	});

	it('returns last index when topPos is past all headings', () => {
		expect(findActiveHeadingIndex([10, 20, 30], 100)).toBe(2);
	});

	it('returns first index when topPos equals first position', () => {
		expect(findActiveHeadingIndex([10, 20, 30], 10)).toBe(0);
	});

	it('handles single-element array', () => {
		expect(findActiveHeadingIndex([10], 10)).toBe(0);
		expect(findActiveHeadingIndex([10], 5)).toBe(-1);
		expect(findActiveHeadingIndex([10], 15)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// getActivePath (path computation from pre-built index)
// ---------------------------------------------------------------------------

describe('getActivePath', () => {
	/** Helper to build a minimal StickyHeadingIndex from heading descriptors. */
	function buildIndex(
		descriptors: Array<{ level: number; from: number; parentIndex: number | null }>
	): StickyHeadingIndex {
		const headings: StickyHeading[] = descriptors.map((d, i) => ({
			level: d.level as StickyHeading['level'],
			from: d.from,
			to: d.from + 10,
			text: `Heading ${i}`,
			line: i + 1,
			parentIndex: d.parentIndex,
			sectionEnd: descriptors[i + 1]?.from ?? 999
		}));

		return {
			headings,
			positions: headings.map((h) => h.from),
			version: 0
		};
	}

	it('returns empty path when topPos is before all headings', () => {
		const index = buildIndex([
			{ level: 1, from: 10, parentIndex: null },
			{ level: 2, from: 20, parentIndex: 0 }
		]);
		expect(getActivePath(index, 5, 5)).toEqual([]);
	});

	it('returns single heading when inside H1 body', () => {
		const index = buildIndex([{ level: 1, from: 0, parentIndex: null }]);
		const path = getActivePath(index, 5, 5);
		expect(path).toHaveLength(1);
		expect(path[0].level).toBe(1);
	});

	it('returns nested path H1 > H2 > H3', () => {
		const index = buildIndex([
			{ level: 1, from: 0, parentIndex: null },
			{ level: 2, from: 20, parentIndex: 0 },
			{ level: 3, from: 40, parentIndex: 1 }
		]);
		const path = getActivePath(index, 45, 5);
		expect(path).toHaveLength(3);
		expect(path.map((h) => h.level)).toEqual([1, 2, 3]);
	});

	it('pops deeper headings when entering sibling section', () => {
		// # A (0), ## A1 (20), ### A1a (40), ## A2 (60)
		const index = buildIndex([
			{ level: 1, from: 0, parentIndex: null },
			{ level: 2, from: 20, parentIndex: 0 },
			{ level: 3, from: 40, parentIndex: 1 },
			{ level: 2, from: 60, parentIndex: 0 }
		]);
		// Position in ## A2 body
		const path = getActivePath(index, 65, 5);
		expect(path).toHaveLength(2);
		expect(path.map((h) => h.level)).toEqual([1, 2]);
		expect(path[1].text).toBe('Heading 3'); // ## A2 is index 3
	});

	it('resets to new H1 section', () => {
		// # A (0), ## A1 (20), # B (40)
		const index = buildIndex([
			{ level: 1, from: 0, parentIndex: null },
			{ level: 2, from: 20, parentIndex: 0 },
			{ level: 1, from: 40, parentIndex: null }
		]);
		const path = getActivePath(index, 45, 5);
		expect(path).toHaveLength(1);
		expect(path[0].text).toBe('Heading 2'); // # B
	});

	it('respects maxLines limit, keeping deepest entries', () => {
		const index = buildIndex([
			{ level: 1, from: 0, parentIndex: null },
			{ level: 2, from: 20, parentIndex: 0 },
			{ level: 3, from: 40, parentIndex: 1 },
			{ level: 4, from: 60, parentIndex: 2 }
		]);
		const path = getActivePath(index, 65, 2);
		expect(path).toHaveLength(2);
		expect(path.map((h) => h.level)).toEqual([3, 4]);
	});

	it('returns empty for index with no headings', () => {
		const index: StickyHeadingIndex = { headings: [], positions: [], version: 0 };
		expect(getActivePath(index, 100, 5)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// buildHeadingIndex (integration with real CodeMirror state)
// ---------------------------------------------------------------------------

describe('buildHeadingIndex', () => {
	it('extracts ATX headings', () => {
		const index = indexFromMarkdown('# Title\n\nSome text\n\n## Section\n\nMore text');
		expect(index.headings).toHaveLength(2);
		expect(index.headings[0].level).toBe(1);
		expect(index.headings[0].text).toBe('Title');
		expect(index.headings[1].level).toBe(2);
		expect(index.headings[1].text).toBe('Section');
	});

	it('extracts multiple heading levels', () => {
		const doc = '# H1\n## H2\n### H3\n#### H4';
		const index = indexFromMarkdown(doc);
		expect(index.headings).toHaveLength(4);
		expect(index.headings.map((h) => h.level)).toEqual([1, 2, 3, 4]);
	});

	it('handles empty document', () => {
		const index = indexFromMarkdown('');
		expect(index.headings).toHaveLength(0);
		expect(index.positions).toHaveLength(0);
	});

	it('handles document with no headings', () => {
		const index = indexFromMarkdown('Just some text\nwith multiple lines\nand no headings.');
		expect(index.headings).toHaveLength(0);
	});

	it('ignores headings inside fenced code blocks', () => {
		const doc = '# Real Heading\n\n```\n# Not a heading\n## Also not\n```\n\n## Another Real';
		const index = indexFromMarkdown(doc);
		const realHeadings = index.headings.filter((h) => !h.text.includes('Not'));
		expect(realHeadings).toHaveLength(index.headings.length);
		// Should have exactly 2 real headings
		expect(index.headings.length).toBe(2);
	});

	it('computes parent chain correctly', () => {
		const doc = '# A\n## B\n### C\n## D';
		const index = indexFromMarkdown(doc);
		expect(index.headings).toHaveLength(4);

		// # A has no parent
		expect(index.headings[0].parentIndex).toBeNull();
		// ## B parent is # A
		expect(index.headings[1].parentIndex).toBe(0);
		// ### C parent is ## B
		expect(index.headings[2].parentIndex).toBe(1);
		// ## D parent is # A (not ## B or ### C)
		expect(index.headings[3].parentIndex).toBe(0);
	});

	it('handles skipped levels (H1 -> H3)', () => {
		const doc = '# Top\n### Deep';
		const index = indexFromMarkdown(doc);
		expect(index.headings).toHaveLength(2);
		// H3 parent should be H1 (skipping H2)
		expect(index.headings[1].parentIndex).toBe(0);
	});

	it('computes section boundaries correctly', () => {
		const doc = '# A\ntext\n## B\ntext\n# C\ntext';
		const index = indexFromMarkdown(doc);
		expect(index.headings).toHaveLength(3);

		// # A section ends where # C starts
		expect(index.headings[0].sectionEnd).toBe(index.headings[2].from);
		// ## B section ends where # C starts (because # C level <= ## B level)
		expect(index.headings[1].sectionEnd).toBe(index.headings[2].from);
		// # C section extends to end of doc
		expect(index.headings[2].sectionEnd).toBe(doc.length);
	});

	it('respects minLevel and maxLevel config', () => {
		const doc = '# H1\n## H2\n### H3\n#### H4';
		const index = indexFromMarkdown(doc, {
			maxLines: 5,
			minLevel: 2 as const,
			maxLevel: 3 as const
		});
		expect(index.headings.map((h) => h.level)).toEqual([2, 3]);
	});

	it('positions array matches heading from values', () => {
		const doc = '# A\n\n## B\n\n### C';
		const index = indexFromMarkdown(doc);
		expect(index.positions).toEqual(index.headings.map((h) => h.from));
	});
});

// ---------------------------------------------------------------------------
// End-to-end path computation from markdown text
// ---------------------------------------------------------------------------

describe('end-to-end path from markdown', () => {
	const doc = [
		'# A',
		'intro',
		'',
		'## A1',
		'text',
		'',
		'### A1a',
		'text',
		'',
		'## A2',
		'text',
		'',
		'# B',
		'text'
	].join('\n');

	let index: StickyHeadingIndex;

	it('builds the heading index', () => {
		index = indexFromMarkdown(doc);
		expect(index.headings).toHaveLength(5);
		expect(index.headings.map((h) => h.text)).toEqual(['A', 'A1', 'A1a', 'A2', 'B']);
	});

	it('shows A when in intro section', () => {
		index = indexFromMarkdown(doc);
		// Position right after "# A\n" (inside "intro")
		const introStart = doc.indexOf('intro');
		const path = getActivePath(index, introStart, 5);
		expect(path.map((h) => h.text)).toEqual(['A']);
	});

	it('shows A > A1 when in A1 body', () => {
		index = indexFromMarkdown(doc);
		const a1Body = doc.indexOf('## A1') + '## A1\n'.length;
		const path = getActivePath(index, a1Body, 5);
		expect(path.map((h) => h.text)).toEqual(['A', 'A1']);
	});

	it('shows A > A1 > A1a when in A1a body', () => {
		index = indexFromMarkdown(doc);
		const a1aBody = doc.indexOf('### A1a') + '### A1a\n'.length;
		const path = getActivePath(index, a1aBody, 5);
		expect(path.map((h) => h.text)).toEqual(['A', 'A1', 'A1a']);
	});

	it('shows A > A2 when in A2 body', () => {
		index = indexFromMarkdown(doc);
		const a2Body = doc.indexOf('## A2') + '## A2\n'.length;
		const path = getActivePath(index, a2Body, 5);
		expect(path.map((h) => h.text)).toEqual(['A', 'A2']);
	});

	it('shows B when in B body', () => {
		index = indexFromMarkdown(doc);
		const bBody = doc.indexOf('# B') + '# B\n'.length;
		const path = getActivePath(index, bBody, 5);
		expect(path.map((h) => h.text)).toEqual(['B']);
	});
});

// ---------------------------------------------------------------------------
// Edge cases: back-to-back headings and deep nesting behavior
// ---------------------------------------------------------------------------

describe('edge-case heading structures', () => {
	it('handles back-to-back sibling headings without leaking prior sibling context', () => {
		const doc = ['# Root', '## A', '## B', 'Body'].join('\n');
		const index = indexFromMarkdown(doc);

		const posInA = doc.indexOf('## A') + '## A'.length;
		const posInB = doc.indexOf('## B') + '## B'.length;
		const posInBody = doc.indexOf('Body');

		expect(getActivePath(index, posInA, 5).map((h) => h.text)).toEqual(['Root', 'A']);
		expect(getActivePath(index, posInB, 5).map((h) => h.text)).toEqual(['Root', 'B']);
		expect(getActivePath(index, posInBody, 5).map((h) => h.text)).toEqual(['Root', 'B']);
	});

	it('supports deep nested paths through H1 -> H4', () => {
		const doc = ['# H1', '## H2', '### H3', '#### H4', 'Deep body'].join('\n');
		const index = indexFromMarkdown(doc);
		const deepBodyPos = doc.indexOf('Deep body');

		const path = getActivePath(index, deepBodyPos, 5);
		expect(path.map((h) => h.level)).toEqual([1, 2, 3, 4]);
		expect(path.map((h) => h.text)).toEqual(['H1', 'H2', 'H3', 'H4']);
	});

	it('extracts complete ATX heading text when inline markdown tokens are present', () => {
		const doc = '# Alpha **Beta** `Gamma` [Link](https://example.com)';
		const index = indexFromMarkdown(doc);

		expect(index.headings).toHaveLength(1);
		expect(index.headings[0]?.text).toContain('Alpha');
		expect(index.headings[0]?.text).toContain('Beta');
		expect(index.headings[0]?.text).toContain('Gamma');
		expect(index.headings[0]?.text).toContain('Link');
	});
});

describe('regression: long document heading coverage', () => {
	it('indexes headings beyond mid-document sections (test.md fixture)', () => {
		const fixturePath = join(process.cwd(), '../../docs/specs/sticky-scroll/test.md');
		const doc = readFileSync(fixturePath, 'utf8');
		const state = EditorState.create({
			doc,
			extensions: [markdown()]
		});

		// Intentionally do NOT call ensureSyntaxTree here. buildHeadingIndex must
		// handle partial parse availability on its own.
		const index = buildHeadingIndex(state, DEFAULT_CONFIG);
		const headingTexts = index.headings.map((h) => h.text);

		expect(headingTexts).toContain('MATT SOLOWYNSKY');
		expect(headingTexts).toContain('JOHN BUMPUS');
		expect(headingTexts).toContain('IAN MINER');
		expect(headingTexts).toContain('Priority Order');
	});
});
