// apps/web/src/lib/utils/document-diff.ts
//
// Document-version-specific diff utilities using jsdiff (Myers algorithm).
// Produces line-level diffs with word-level highlighting and context collapsing.
// Keeps existing diff.ts stable for non-document consumers.

import { diffLines, diffWords } from 'diff';

// ============================================================
// TYPES
// ============================================================

export interface DiffWordSpan {
	type: 'added' | 'removed' | 'unchanged';
	text: string;
}

export interface DocumentDiffLine {
	type: 'added' | 'removed' | 'unchanged' | 'separator';
	content: string;
	lineNumber?: number;
	/** Word-level diff spans within the line (only for added/removed lines that are part of a modification pair) */
	wordSpans?: DiffWordSpan[];
	/** Number of hidden lines (only for separator lines) */
	hiddenLineCount?: number;
}

export interface DocumentFieldDiff {
	field: string;
	label: string;
	hasChanges: boolean;
	/** Unified diff lines (interleaved removed/added with context) */
	unifiedLines: DocumentDiffLine[];
	/** Stats for this field */
	stats: DiffStats;
}

export interface DiffStats {
	added: number;
	removed: number;
	modified: number;
}

// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_CONTEXT_LINES = 3;

// ============================================================
// CORE DIFF FUNCTIONS
// ============================================================

/**
 * Create a unified diff for a single text field with word-level highlighting
 * and context collapsing.
 */
export function createDocumentFieldDiff(
	field: string,
	label: string,
	oldText: string,
	newText: string,
	contextLines: number = DEFAULT_CONTEXT_LINES
): DocumentFieldDiff {
	const oldNormalized = oldText ?? '';
	const newNormalized = newText ?? '';

	if (oldNormalized === newNormalized) {
		return {
			field,
			label,
			hasChanges: false,
			unifiedLines: [],
			stats: { added: 0, removed: 0, modified: 0 }
		};
	}

	const rawLines = buildRawUnifiedLines(oldNormalized, newNormalized);
	const withWordDiffs = addWordLevelHighlighting(rawLines);
	const stats = computeStats(withWordDiffs);
	const collapsed = collapseContext(withWordDiffs, contextLines);

	return {
		field,
		label,
		hasChanges: true,
		unifiedLines: collapsed,
		stats
	};
}

/**
 * Create diffs for all document fields at once.
 * Returns only fields that have changes, plus overall stats.
 */
export function createDocumentDiff(
	oldSnapshot: {
		title?: string | null;
		description?: string | null;
		content?: string | null;
		state_key?: string | null;
	} | null,
	newSnapshot: {
		title?: string | null;
		description?: string | null;
		content?: string | null;
		state_key?: string | null;
	} | null,
	contextLines: number = DEFAULT_CONTEXT_LINES
): { fields: DocumentFieldDiff[]; totalStats: DiffStats } {
	const fields: DocumentFieldDiff[] = [];
	const totalStats: DiffStats = { added: 0, removed: 0, modified: 0 };

	const fieldConfigs = [
		{
			field: 'content',
			label: 'Content',
			old: oldSnapshot?.content,
			new: newSnapshot?.content
		},
		{ field: 'title', label: 'Title', old: oldSnapshot?.title, new: newSnapshot?.title },
		{
			field: 'description',
			label: 'Description',
			old: oldSnapshot?.description,
			new: newSnapshot?.description
		},
		{
			field: 'state_key',
			label: 'State',
			old: oldSnapshot?.state_key,
			new: newSnapshot?.state_key
		}
	];

	for (const config of fieldConfigs) {
		const diff = createDocumentFieldDiff(
			config.field,
			config.label,
			config.old ?? '',
			config.new ?? '',
			contextLines
		);

		if (diff.hasChanges) {
			fields.push(diff);
			totalStats.added += diff.stats.added;
			totalStats.removed += diff.stats.removed;
			totalStats.modified += diff.stats.modified;
		}
	}

	return { fields, totalStats };
}

// ============================================================
// INTERNAL: Build raw unified lines from jsdiff output
// ============================================================

interface RawDiffLine {
	type: 'added' | 'removed' | 'unchanged';
	content: string;
	oldLineNumber?: number;
	newLineNumber?: number;
}

function buildRawUnifiedLines(oldText: string, newText: string): RawDiffLine[] {
	const changes = diffLines(oldText, newText);
	const lines: RawDiffLine[] = [];
	let oldLineNum = 1;
	let newLineNum = 1;

	for (const change of changes) {
		// Split the change value into individual lines
		// diffLines includes trailing newlines, so we need to handle that
		const changeLines = splitChangeIntoLines(change.value);

		if (change.added) {
			for (const line of changeLines) {
				lines.push({
					type: 'added',
					content: line,
					newLineNumber: newLineNum++
				});
			}
		} else if (change.removed) {
			for (const line of changeLines) {
				lines.push({
					type: 'removed',
					content: line,
					oldLineNumber: oldLineNum++
				});
			}
		} else {
			for (const line of changeLines) {
				lines.push({
					type: 'unchanged',
					content: line,
					oldLineNumber: oldLineNum++,
					newLineNumber: newLineNum++
				});
			}
		}
	}

	return lines;
}

/**
 * Split a change's value into individual lines.
 * diffLines returns values that may contain multiple lines with \n.
 * We split on \n but avoid creating a trailing empty line from a terminal \n.
 */
function splitChangeIntoLines(value: string): string[] {
	if (!value) return [];
	// Remove trailing newline to avoid phantom empty line
	const trimmed = value.endsWith('\n') ? value.slice(0, -1) : value;
	if (trimmed === '') return [''];
	return trimmed.split('\n');
}

// ============================================================
// INTERNAL: Add word-level highlighting to modification pairs
// ============================================================

/**
 * Walk through the raw lines and pair adjacent removed+added blocks.
 * For each pair, compute word-level diffs and attach wordSpans.
 */
function addWordLevelHighlighting(lines: RawDiffLine[]): DocumentDiffLine[] {
	const result: DocumentDiffLine[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i]!;

		if (line.type === 'unchanged') {
			result.push({
				type: 'unchanged',
				content: line.content,
				lineNumber: line.newLineNumber
			});
			i++;
			continue;
		}

		// Collect a contiguous block of removed lines
		const removedBlock: RawDiffLine[] = [];
		while (i < lines.length && lines[i]!.type === 'removed') {
			removedBlock.push(lines[i]!);
			i++;
		}

		// Collect a contiguous block of added lines that follow
		const addedBlock: RawDiffLine[] = [];
		while (i < lines.length && lines[i]!.type === 'added') {
			addedBlock.push(lines[i]!);
			i++;
		}

		// If we have both removed and added, pair them for word-level diff
		const pairCount = Math.min(removedBlock.length, addedBlock.length);

		for (let j = 0; j < pairCount; j++) {
			const removedLine = removedBlock[j]!;
			const addedLine = addedBlock[j]!;
			const { removedSpans, addedSpans } = computeWordSpans(
				removedLine.content,
				addedLine.content
			);

			result.push({
				type: 'removed',
				content: removedLine.content,
				lineNumber: removedLine.oldLineNumber,
				wordSpans: removedSpans
			});
			result.push({
				type: 'added',
				content: addedLine.content,
				lineNumber: addedLine.newLineNumber,
				wordSpans: addedSpans
			});
		}

		// Remaining unmatched removed lines (pure deletions)
		for (let j = pairCount; j < removedBlock.length; j++) {
			const rl = removedBlock[j]!;
			result.push({
				type: 'removed',
				content: rl.content,
				lineNumber: rl.oldLineNumber
			});
		}

		// Remaining unmatched added lines (pure additions)
		for (let j = pairCount; j < addedBlock.length; j++) {
			const al = addedBlock[j]!;
			result.push({
				type: 'added',
				content: al.content,
				lineNumber: al.newLineNumber
			});
		}
	}

	return result;
}

/**
 * Compute word-level diff spans for a removed/added line pair.
 */
function computeWordSpans(
	oldContent: string,
	newContent: string
): { removedSpans: DiffWordSpan[]; addedSpans: DiffWordSpan[] } {
	const wordChanges = diffWords(oldContent, newContent);

	const removedSpans: DiffWordSpan[] = [];
	const addedSpans: DiffWordSpan[] = [];

	for (const change of wordChanges) {
		if (change.added) {
			addedSpans.push({ type: 'added', text: change.value });
		} else if (change.removed) {
			removedSpans.push({ type: 'removed', text: change.value });
		} else {
			// Unchanged text appears in both
			removedSpans.push({ type: 'unchanged', text: change.value });
			addedSpans.push({ type: 'unchanged', text: change.value });
		}
	}

	return { removedSpans, addedSpans };
}

// ============================================================
// INTERNAL: Compute stats
// ============================================================

function computeStats(lines: DocumentDiffLine[]): DiffStats {
	let added = 0;
	let removed = 0;
	let modified = 0;

	// Walk through and pair adjacent removed/added blocks to count modifications
	let i = 0;
	while (i < lines.length) {
		if (lines[i]!.type === 'unchanged') {
			i++;
			continue;
		}

		// Count contiguous removed
		let blockRemoved = 0;
		while (i < lines.length && lines[i]!.type === 'removed') {
			blockRemoved++;
			i++;
		}

		// Count contiguous added
		let blockAdded = 0;
		while (i < lines.length && lines[i]!.type === 'added') {
			blockAdded++;
			i++;
		}

		// modified = min(removed, added) per block
		const blockModified = Math.min(blockRemoved, blockAdded);
		modified += blockModified;
		removed += blockRemoved - blockModified;
		added += blockAdded - blockModified;
	}

	return { added, removed, modified };
}

// ============================================================
// INTERNAL: Context collapsing
// ============================================================

/**
 * Collapse long runs of unchanged lines, keeping `contextLines` lines
 * above and below each change hunk. Insert separator lines for hidden sections.
 */
function collapseContext(lines: DocumentDiffLine[], contextLines: number): DocumentDiffLine[] {
	if (lines.length === 0) return [];

	// Find indices of all changed lines
	const changedIndices: number[] = [];
	for (let i = 0; i < lines.length; i++) {
		const lineType = lines[i]!.type;
		if (lineType === 'added' || lineType === 'removed') {
			changedIndices.push(i);
		}
	}

	// If no changes (shouldn't happen since we filter upstream), return as-is
	if (changedIndices.length === 0) return lines;

	// Build a set of line indices to keep (within context range of a change)
	const keepSet = new Set<number>();
	for (const idx of changedIndices) {
		for (let offset = -contextLines; offset <= contextLines; offset++) {
			const target = idx + offset;
			if (target >= 0 && target < lines.length) {
				keepSet.add(target);
			}
		}
	}

	// Build output with separators for hidden regions
	const result: DocumentDiffLine[] = [];
	let lastKeptIndex = -1;

	for (let i = 0; i < lines.length; i++) {
		if (keepSet.has(i)) {
			// Check if there's a gap since the last kept line
			if (lastKeptIndex >= 0 && i - lastKeptIndex > 1) {
				const hiddenCount = i - lastKeptIndex - 1;
				result.push({
					type: 'separator',
					content: '',
					hiddenLineCount: hiddenCount
				});
			}
			result.push(lines[i]!);
			lastKeptIndex = i;
		}
	}

	// Handle leading hidden lines (before first change context)
	if (changedIndices.length > 0) {
		const firstKeptIndex = Math.max(0, changedIndices[0]! - contextLines);
		if (firstKeptIndex > 0) {
			result.unshift({
				type: 'separator',
				content: '',
				hiddenLineCount: firstKeptIndex
			});
		}
	}

	// Handle trailing hidden lines (after last change context)
	if (changedIndices.length > 0) {
		const lastChangeIndex = changedIndices[changedIndices.length - 1]!;
		const lastContextIndex = Math.min(lines.length - 1, lastChangeIndex + contextLines);
		if (lastContextIndex < lines.length - 1) {
			const hiddenCount = lines.length - 1 - lastContextIndex;
			result.push({
				type: 'separator',
				content: '',
				hiddenLineCount: hiddenCount
			});
		}
	}

	return result;
}
