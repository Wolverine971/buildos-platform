// apps/web/src/lib/utils/document-diff.test.ts
import { describe, it, expect } from 'vitest';
import {
	createDocumentFieldDiff,
	createDocumentDiff,
	type DocumentDiffLine,
	type DiffStats
} from './document-diff';

describe('createDocumentFieldDiff', () => {
	it('returns no changes for identical text', () => {
		const result = createDocumentFieldDiff('content', 'Content', 'hello world', 'hello world');
		expect(result.hasChanges).toBe(false);
		expect(result.unifiedLines).toHaveLength(0);
		expect(result.stats).toEqual({ added: 0, removed: 0, modified: 0 });
	});

	it('returns no changes for empty strings', () => {
		const result = createDocumentFieldDiff('content', 'Content', '', '');
		expect(result.hasChanges).toBe(false);
	});

	it('detects simple line addition', () => {
		// Use trailing newlines for consistent jsdiff behavior
		const result = createDocumentFieldDiff(
			'content',
			'Content',
			'line1\nline2\n',
			'line1\nline2\nline3\n'
		);
		expect(result.hasChanges).toBe(true);
		expect(result.stats.added).toBe(1);
		expect(result.stats.removed).toBe(0);
		expect(result.stats.modified).toBe(0);

		const addedLines = result.unifiedLines.filter((l) => l.type === 'added');
		expect(addedLines).toHaveLength(1);
		expect(addedLines[0].content).toBe('line3');
	});

	it('detects simple line removal', () => {
		const result = createDocumentFieldDiff(
			'content',
			'Content',
			'line1\nline2\nline3',
			'line1\nline3'
		);
		expect(result.hasChanges).toBe(true);
		expect(result.stats.removed).toBeGreaterThanOrEqual(1);
	});

	it('detects modified lines with word-level spans', () => {
		const result = createDocumentFieldDiff(
			'content',
			'Content',
			'The quick brown fox',
			'The fast brown fox'
		);
		expect(result.hasChanges).toBe(true);
		expect(result.stats.modified).toBe(1);
		expect(result.stats.added).toBe(0);
		expect(result.stats.removed).toBe(0);

		// Should have paired removed+added lines with word spans
		const removedLines = result.unifiedLines.filter((l) => l.type === 'removed');
		const addedLines = result.unifiedLines.filter((l) => l.type === 'added');

		expect(removedLines).toHaveLength(1);
		expect(addedLines).toHaveLength(1);

		// Word spans should exist on the modified lines
		expect(removedLines[0].wordSpans).toBeDefined();
		expect(addedLines[0].wordSpans).toBeDefined();

		// The removed line should have a 'removed' span for 'quick'
		const removedSpans = removedLines[0].wordSpans!;
		const removedWords = removedSpans.filter((s) => s.type === 'removed');
		expect(removedWords.length).toBeGreaterThan(0);
		expect(removedWords.some((s) => s.text.includes('quick'))).toBe(true);

		// The added line should have an 'added' span for 'fast'
		const addedSpans = addedLines[0].wordSpans!;
		const addedWords = addedSpans.filter((s) => s.type === 'added');
		expect(addedWords.length).toBeGreaterThan(0);
		expect(addedWords.some((s) => s.text.includes('fast'))).toBe(true);
	});

	it('handles duplicate lines correctly', () => {
		// The old Set-based algorithm would fail here
		const result = createDocumentFieldDiff(
			'content',
			'Content',
			'line A\nline B\nline A',
			'line A\nline C\nline A'
		);
		expect(result.hasChanges).toBe(true);

		// Should detect that line B was replaced with line C
		const removedLines = result.unifiedLines.filter((l) => l.type === 'removed');
		const addedLines = result.unifiedLines.filter((l) => l.type === 'added');

		expect(removedLines.some((l) => l.content === 'line B')).toBe(true);
		expect(addedLines.some((l) => l.content === 'line C')).toBe(true);
	});

	it('handles reordered content', () => {
		const result = createDocumentFieldDiff(
			'content',
			'Content',
			'first\nsecond\nthird',
			'third\nfirst\nsecond'
		);
		expect(result.hasChanges).toBe(true);
		// Should show the reorder as additions/removals
		expect(result.unifiedLines.some((l) => l.type === 'added' || l.type === 'removed')).toBe(
			true
		);
	});

	it('handles version 1 (null/empty baseline) as all-added', () => {
		const result = createDocumentFieldDiff(
			'content',
			'Content',
			'', // null baseline
			'Hello World\nThis is new content'
		);
		expect(result.hasChanges).toBe(true);
		expect(result.stats.added).toBe(2);
		expect(result.stats.removed).toBe(0);
		expect(result.stats.modified).toBe(0);

		const addedLines = result.unifiedLines.filter((l) => l.type === 'added');
		expect(addedLines).toHaveLength(2);
	});

	it('applies context collapsing for long documents', () => {
		// Create a document with 50 unchanged lines and 1 change in the middle
		const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);
		const oldText = lines.join('\n');
		const newLines = [...lines];
		newLines[25] = 'MODIFIED Line 26';
		const newText = newLines.join('\n');

		const result = createDocumentFieldDiff('content', 'Content', oldText, newText);
		expect(result.hasChanges).toBe(true);

		// Should have separators for collapsed context
		const separators = result.unifiedLines.filter((l) => l.type === 'separator');
		expect(separators.length).toBeGreaterThan(0);

		// Should have fewer lines than the original 50+ due to collapsing
		const totalVisibleLines = result.unifiedLines.filter((l) => l.type !== 'separator').length;
		expect(totalVisibleLines).toBeLessThan(50);
	});

	it('shows no context collapsing for short documents', () => {
		const result = createDocumentFieldDiff(
			'content',
			'Content',
			'line1\nline2\nline3',
			'line1\nMODIFIED\nline3'
		);
		// Short enough that context should not collapse
		const separators = result.unifiedLines.filter((l) => l.type === 'separator');
		expect(separators).toHaveLength(0);
	});

	it('modified line count uses min(removed, added) per block', () => {
		// 2 removed, 3 added → modified=2, added=1
		const result = createDocumentFieldDiff(
			'content',
			'Content',
			'old line 1\nold line 2',
			'new line 1\nnew line 2\nnew line 3'
		);
		expect(result.stats.modified).toBe(2);
		expect(result.stats.added).toBe(1);
		expect(result.stats.removed).toBe(0);
	});

	it('handles word-level changes on long lines', () => {
		const oldLine =
			'This is a very long line of text that contains many words and only one small change in the middle of it';
		const newLine =
			'This is a very long line of text that contains many words and only one tiny change in the middle of it';

		const result = createDocumentFieldDiff('content', 'Content', oldLine, newLine);
		expect(result.hasChanges).toBe(true);

		const removedLines = result.unifiedLines.filter((l) => l.type === 'removed');
		expect(removedLines[0].wordSpans).toBeDefined();

		// Most spans should be unchanged, with only the changed word highlighted
		const unchangedSpans = removedLines[0].wordSpans!.filter((s) => s.type === 'unchanged');
		const changedSpans = removedLines[0].wordSpans!.filter((s) => s.type === 'removed');
		expect(unchangedSpans.length).toBeGreaterThan(changedSpans.length);
		expect(changedSpans.some((s) => s.text.includes('small'))).toBe(true);
	});
});

describe('createDocumentDiff', () => {
	it('returns empty fields when snapshots are identical', () => {
		const snapshot = {
			title: 'Test',
			description: 'Desc',
			content: 'Body',
			state_key: 'draft'
		};
		const result = createDocumentDiff(snapshot, snapshot);
		expect(result.fields).toHaveLength(0);
		expect(result.totalStats).toEqual({ added: 0, removed: 0, modified: 0 });
	});

	it('returns only changed fields', () => {
		const oldSnapshot = {
			title: 'Test',
			description: 'Desc',
			content: 'Body',
			state_key: 'draft'
		};
		const newSnapshot = {
			title: 'Test',
			description: 'Desc',
			content: 'Updated Body',
			state_key: 'published'
		};

		const result = createDocumentDiff(oldSnapshot, newSnapshot);
		expect(result.fields.length).toBe(2); // content + state_key

		const fieldNames = result.fields.map((f) => f.field);
		expect(fieldNames).toContain('content');
		expect(fieldNames).toContain('state_key');
		expect(fieldNames).not.toContain('title');
		expect(fieldNames).not.toContain('description');
	});

	it('handles null snapshot (version 1 baseline)', () => {
		const newSnapshot = {
			title: 'New Doc',
			description: 'A description',
			content: 'Some content',
			state_key: 'draft'
		};

		const result = createDocumentDiff(null, newSnapshot);
		expect(result.fields.length).toBeGreaterThan(0);
		expect(result.totalStats.added).toBeGreaterThan(0);
		expect(result.totalStats.removed).toBe(0);
	});

	it('aggregates totalStats from all fields', () => {
		const oldSnapshot = {
			title: 'Old Title',
			description: null,
			content: 'Old content\nLine 2',
			state_key: 'draft'
		};
		const newSnapshot = {
			title: 'New Title',
			description: 'Added desc',
			content: 'New content\nLine 2\nLine 3',
			state_key: 'published'
		};

		const result = createDocumentDiff(oldSnapshot, newSnapshot);
		// totalStats should be the sum of all field stats
		const summedStats = result.fields.reduce(
			(acc, f) => ({
				added: acc.added + f.stats.added,
				removed: acc.removed + f.stats.removed,
				modified: acc.modified + f.stats.modified
			}),
			{ added: 0, removed: 0, modified: 0 } as DiffStats
		);

		expect(result.totalStats).toEqual(summedStats);
	});

	it('content field appears first when changed', () => {
		const result = createDocumentDiff(
			{ title: 'Old', content: 'Old body', state_key: 'draft' },
			{ title: 'New', content: 'New body', state_key: 'published' }
		);

		expect(result.fields[0].field).toBe('content');
	});
});
