// packages/shared-agent-ops/src/ontology/document-edits.ts
//
// Surgical edits for long Markdown documents (tasker 98). An agent names the text
// or the heading section it wants to change instead of resending the whole body.
// This module resolves those names to exact ranges and applies them through the
// DocumentPatchV1 kernel, so START HERE managed regions and overlap rules are
// enforced in one place. It also summarizes any content change as line stats,
// bounded diff hunks, and an inverse patch that powers one-click Undo.
//
// Pure and browser-safe: the gateway, the worker, and the web UI share it.

import { diffLines, structuredPatch } from 'diff';
import {
	extractOutline,
	hashDocumentContent,
	type DocOutlineNode
} from '../utils/document-outline';
import {
	createDocumentPatchV1,
	resolveDocumentPatch,
	type DocumentPatchSelection,
	type DocumentPatchV1
} from './document-patch';
import { findStartHereManagedRegionRanges } from './start-here';

export type DocumentTextEditV1 = {
	old_text: string;
	new_text: string;
	replace_all?: boolean;
};

export type DocumentSectionEditActionV1 = 'replace' | 'delete' | 'append' | 'prepend' | 'move';

export type DocumentSectionEditV1 = {
	action: DocumentSectionEditActionV1;
	/** Heading anchor from get_document_outline, or the exact heading text. */
	section: string;
	/** New Markdown for replace/append/prepend. */
	content?: string;
	/** move: place the whole section after this section (anchor or heading text). */
	after_section?: string;
	/** move: place the whole section before this section (anchor or heading text). */
	before_section?: string;
};

export type DocumentEditFailureCode =
	| 'INVALID_EDIT'
	| 'ANCHOR_NOT_FOUND'
	| 'ANCHOR_AMBIGUOUS'
	| 'SECTION_NOT_FOUND'
	| 'SECTION_AMBIGUOUS'
	| 'OVERLAPPING_EDITS'
	| 'MANAGED_REGION_BOUNDARY';

export type DocumentEditFailure = {
	/** Which input failed, e.g. "edits[0]" or "section_edits[1]". */
	edit: string;
	code: DocumentEditFailureCode;
	message: string;
	match_lines?: number[];
	/** Closest existing lines for a text that was not found. A hint, never applied. */
	suggestions?: Array<{ line: number; text: string }>;
	available_sections?: string[];
};

export type AppliedDocumentEdit = {
	edit: string;
	match: 'exact' | 'normalized' | 'section';
	/** 1-based line numbers (in the original document) where the edit landed. */
	lines: number[];
};

export type ResolveDocumentEditsResult =
	| { status: 'resolved'; next_content: string; applied: AppliedDocumentEdit[] }
	| { status: 'rejected'; failures: DocumentEditFailure[] };

export type ResolveDocumentEditsInput = {
	project_id: string;
	document_id: string;
	content: string | null | undefined;
	edits?: DocumentTextEditV1[] | null;
	section_edits?: DocumentSectionEditV1[] | null;
};

export const DOCUMENT_EDITS_MAX = 50;
const SUGGESTION_MIN_SCORE = 0.5;
const SUGGESTION_LIMIT = 2;
const SECTION_LIST_LIMIT = 40;
const SNIPPET_MAX_CHARS = 300;

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

type Range = { from: number; to: number };

/**
 * Fold the typographic drift a model introduces when it copies text: curly
 * quotes, en/em dashes, ellipses, non-breaking and zero-width spaces, runs of
 * spaces, trailing spaces, and CRLF. Each output character maps back to the
 * source offset it came from, so a folded match applies to the original text.
 */
export function foldForMatch(text: string): { text: string; map: number[] } {
	let out = '';
	const map: number[] = [];
	const push = (chunk: string, index: number) => {
		for (const ch of chunk) {
			out += ch;
			map.push(index);
		}
	};
	for (let index = 0; index < text.length; index += 1) {
		const ch = text[index]!;
		if (ch === '\r' || ch === '\u200B' || ch === '\u200C' || ch === '\u200D' || ch === '\uFEFF')
			continue;
		if (ch === '\n') {
			while (out.endsWith(' ')) {
				out = out.slice(0, -1);
				map.pop();
			}
			push('\n', index);
			continue;
		}
		let folded = ch;
		if ('\u2018\u2019\u201A\u201B\u2032'.includes(ch)) folded = "'";
		else if ('\u201C\u201D\u201E\u2033'.includes(ch)) folded = '"';
		else if ('\u2012\u2013\u2014\u2015\u2212'.includes(ch)) folded = '-';
		else if (ch === '\u2026') folded = '...';
		else if (ch === '\t' || ch === '\u00A0' || ch === '\u2007' || ch === '\u202F') folded = ' ';
		if (folded === ' ' && out.endsWith(' ')) continue;
		if (folded === '-' && out.endsWith('-')) continue;
		push(folded, index);
	}
	while (out.endsWith(' ')) {
		out = out.slice(0, -1);
		map.pop();
	}
	return { text: out, map };
}

function exactRanges(content: string, needle: string): Range[] {
	const ranges: Range[] = [];
	if (!needle) return ranges;
	for (
		let at = content.indexOf(needle);
		at >= 0;
		at = content.indexOf(needle, at + Math.max(1, needle.length))
	) {
		ranges.push({ from: at, to: at + needle.length });
	}
	return ranges;
}

function foldedRanges(
	content: string,
	folded: { text: string; map: number[] },
	needle: string
): Range[] {
	const target = foldForMatch(needle).text;
	if (!target) return [];
	return exactRanges(folded.text, target).map(({ from, to }) => ({
		from: folded.map[from]!,
		to: to - 1 < folded.map.length ? folded.map[to - 1]! + 1 : content.length
	}));
}

// Line-number prefixes a model sometimes copies from numbered read output
// ("15: text", "L15 | text"). Structured-format stripping, not language parsing.
const LINE_PREFIX = /^\s*L?\d+\s*[:|\u2502]\s?/;

function stripLinePrefixes(text: string): string | null {
	const lines = text.split('\n');
	const nonEmpty = lines.filter((line) => line.trim());
	if (nonEmpty.length === 0 || !nonEmpty.every((line) => LINE_PREFIX.test(line))) return null;
	return lines.map((line) => line.replace(LINE_PREFIX, '')).join('\n');
}

function lineNumberAt(content: string, offset: number): number {
	let line = 1;
	for (let index = 0; index < offset && index < content.length; index += 1) {
		if (content[index] === '\n') line += 1;
	}
	return line;
}

function snippet(text: string): string {
	return text.length > SNIPPET_MAX_CHARS ? `${text.slice(0, SNIPPET_MAX_CHARS)}\u2026` : text;
}

function bigrams(text: string): Map<string, number> {
	const grams = new Map<string, number>();
	for (let index = 0; index < text.length - 1; index += 1) {
		const gram = text.slice(index, index + 2);
		grams.set(gram, (grams.get(gram) ?? 0) + 1);
	}
	return grams;
}

function diceSimilarity(left: string, right: string): number {
	if (!left || !right) return 0;
	if (left === right) return 1;
	const a = bigrams(left);
	const b = bigrams(right);
	let overlap = 0;
	let total = 0;
	for (const [gram, count] of a) {
		overlap += Math.min(count, b.get(gram) ?? 0);
		total += count;
	}
	for (const count of b.values()) total += count;
	return total === 0 ? 0 : (2 * overlap) / total;
}

/**
 * Closest existing lines to a text that matched nowhere, so the model can copy
 * the real line on retry. String similarity is only a hint here: it is shown to
 * the model and never used to apply an edit, so a poor suggestion is harmless.
 */
function suggestLines(content: string, needle: string): Array<{ line: number; text: string }> {
	const probe = needle
		.split('\n')
		.map((line) => line.trim())
		.find(Boolean);
	if (!probe) return [];
	const target = foldForMatch(probe).text.toLowerCase();
	return content
		.split('\n')
		.map((text, index) => ({
			line: index + 1,
			text,
			score: diceSimilarity(target, foldForMatch(text.trim()).text.toLowerCase())
		}))
		.filter((candidate) => candidate.text.trim() && candidate.score >= SUGGESTION_MIN_SCORE)
		.sort((left, right) => right.score - left.score || left.line - right.line)
		.slice(0, SUGGESTION_LIMIT)
		.map(({ line, text }) => ({ line, text: snippet(text) }));
}

/**
 * Deleting whole lines should not leave a hole: take the line's own newline and
 * one separating blank line, or the preceding newlines when it was the last line.
 */
function widenWholeLineDeletion(content: string, range: Range): Range {
	const { from, to } = range;
	const startsLine = from === 0 || content[from - 1] === '\n';
	const endsLine = to === content.length || content[to] === '\n';
	if (!startsLine || !endsLine) return range;
	if (to === content.length) {
		let start = from;
		while (start > 0 && content[start - 1] === '\n') start -= 1;
		return { from: start, to };
	}
	let end = to + 1;
	const precededByBlank = from === 0 || content.slice(Math.max(0, from - 2), from) === '\n\n';
	if (content[end] === '\n' && precededByBlank) end += 1;
	return { from, to: end };
}

/** When the match ignored surrounding whitespace, drop the same padding from new_text. */
function alignReplacementPadding(oldText: string, newText: string): string {
	const leading = oldText.match(/^\s*/)?.[0] ?? '';
	const trailing = oldText.match(/\s*$/)?.[0] ?? '';
	let next = newText;
	if (leading && next.startsWith(leading)) next = next.slice(leading.length);
	if (trailing && next.endsWith(trailing)) next = next.slice(0, next.length - trailing.length);
	return next;
}

type PlannedOperation = {
	edit: string;
	range: Range;
	replacement: string;
	match: AppliedDocumentEdit['match'];
};

function planTextEdit(
	content: string,
	folded: { text: string; map: number[] },
	edit: DocumentTextEditV1,
	label: string
): PlannedOperation[] | DocumentEditFailure {
	const oldText = typeof edit.old_text === 'string' ? edit.old_text : '';
	const newText = typeof edit.new_text === 'string' ? edit.new_text : '';
	if (!oldText.trim()) {
		return {
			edit: label,
			code: 'INVALID_EDIT',
			message:
				'old_text is empty. Copy the exact existing text to change. To add new text, put a neighbouring line in old_text and repeat it in new_text, or use section_edits append/prepend.'
		};
	}
	if (oldText === newText) {
		return {
			edit: label,
			code: 'INVALID_EDIT',
			message: 'new_text is identical to old_text, so nothing would change.'
		};
	}

	let ranges = exactRanges(content, oldText);
	let match: AppliedDocumentEdit['match'] = 'exact';
	let replacement = newText;
	if (ranges.length === 0) {
		match = 'normalized';
		const trimmed = oldText.trim();
		ranges = foldedRanges(content, folded, trimmed);
		replacement = trimmed === oldText ? newText : alignReplacementPadding(oldText, newText);
		if (ranges.length === 0) {
			const unprefixed = stripLinePrefixes(trimmed);
			if (unprefixed) {
				ranges = foldedRanges(content, folded, unprefixed.trim());
				replacement = stripLinePrefixes(replacement) ?? replacement;
			}
		}
	}

	if (ranges.length === 0) {
		const suggestions = suggestLines(content, oldText);
		return {
			edit: label,
			code: 'ANCHOR_NOT_FOUND',
			message:
				suggestions.length > 0
					? `old_text was not found. Did you mean line ${suggestions[0]!.line}? Copy the existing text exactly (get_document_outline with find returns exact lines).`
					: 'old_text was not found in the document. Copy the existing text exactly (get_document_outline with find returns exact lines).',
			...(suggestions.length > 0 ? { suggestions } : {})
		};
	}
	if (ranges.length > 1 && edit.replace_all !== true) {
		const lines = ranges.map((range) => lineNumberAt(content, range.from));
		return {
			edit: label,
			code: 'ANCHOR_AMBIGUOUS',
			message: `old_text matches ${ranges.length} places (lines ${lines.join(', ')}). Include more surrounding text so it matches exactly once, or set replace_all: true to change every occurrence.`,
			match_lines: lines
		};
	}

	return ranges.map((range) => ({
		edit: label,
		range: replacement === '' ? widenWholeLineDeletion(content, range) : range,
		replacement,
		match
	}));
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

type FlatSection = DocOutlineNode & { own_end: number; heading_end: number };

function flattenSections(content: string): FlatSection[] {
	const flat: FlatSection[] = [];
	const visit = (nodes: DocOutlineNode[]) => {
		for (const node of nodes) {
			const newline = content.indexOf('\n', node.char_start);
			const headingEnd =
				newline < 0 || newline >= node.char_end ? node.char_end : newline + 1;
			const firstChild = node.children?.[0];
			flat.push({
				...node,
				heading_end: headingEnd,
				own_end: firstChild ? firstChild.char_start : node.char_end
			});
			if (node.children?.length) visit(node.children);
		}
	};
	visit(extractOutline(content).nodes);
	return flat;
}

function normalizeSectionRef(value: string): string {
	return foldForMatch(value.replace(/^\s*#{1,6}\s+/, '').trim())
		.text.replace(/^#/, '')
		.toLowerCase();
}

function findSection(
	sections: FlatSection[],
	reference: unknown,
	label: string
): FlatSection | DocumentEditFailure {
	const available = sections.slice(0, SECTION_LIST_LIMIT).map((section) => section.anchor);
	if (typeof reference !== 'string' || !reference.trim()) {
		return {
			edit: label,
			code: 'INVALID_EDIT',
			message: 'section is required: pass a heading anchor from get_document_outline.',
			available_sections: available
		};
	}
	// Anchors are literal slugs ("part-ii--tactics"); only heading text is folded.
	const anchor = reference.trim().replace(/^#/, '').toLowerCase();
	const byAnchor = sections.filter((section) => section.anchor.toLowerCase() === anchor);
	const wanted = normalizeSectionRef(reference);
	const matches =
		byAnchor.length > 0
			? byAnchor
			: sections.filter((section) => normalizeSectionRef(section.text) === wanted);
	if (matches.length === 1) return matches[0]!;
	if (matches.length > 1) {
		return {
			edit: label,
			code: 'SECTION_AMBIGUOUS',
			message: `"${reference}" names ${matches.length} headings. Use one of these anchors: ${matches.map((section) => section.anchor).join(', ')}.`,
			available_sections: matches.map((section) => section.anchor)
		};
	}
	return {
		edit: label,
		code: 'SECTION_NOT_FOUND',
		message:
			sections.length === 0
				? 'This document has no headings. Use edits with old_text/new_text instead.'
				: `No heading matches "${reference}". Use an anchor from get_document_outline.`,
		available_sections: available
	};
}

/** Drop a leading heading line when the model repeated the section's own heading. */
function stripRepeatedHeading(section: FlatSection, text: string): string {
	const lines = text.replace(/^\s*\n/, '').split('\n');
	const first = lines[0] ?? '';
	const heading = first.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
	if (heading && normalizeSectionRef(heading[2] ?? '') === normalizeSectionRef(section.text)) {
		return lines.slice(1).join('\n');
	}
	return text;
}

function blockSeparatorBefore(content: string, offset: number): string {
	if (offset === 0) return '';
	const before = content.slice(0, offset);
	if (before.endsWith('\n\n')) return '';
	return before.endsWith('\n') ? '\n' : '\n\n';
}

function blockTerminator(content: string, offset: number): string {
	return offset >= content.length ? '\n' : '\n\n';
}

function planSectionEdit(
	content: string,
	sections: FlatSection[],
	edit: DocumentSectionEditV1,
	label: string
): PlannedOperation[] | DocumentEditFailure {
	const section = findSection(sections, edit.section, label);
	if ('code' in section) return section;
	const body =
		typeof edit.content === 'string' ? stripRepeatedHeading(section, edit.content) : '';
	const needsContent =
		edit.action === 'replace' || edit.action === 'append' || edit.action === 'prepend';
	if (needsContent && edit.action !== 'replace' && !body.trim()) {
		return {
			edit: label,
			code: 'INVALID_EDIT',
			message: `section_edits ${edit.action} requires non-empty content.`
		};
	}

	switch (edit.action) {
		case 'replace': {
			// The section's own text, up to its first subsection: subsections stay.
			const range = { from: section.heading_end, to: section.own_end };
			const trimmed = body.trim();
			const replacement = trimmed
				? `\n${trimmed}${blockTerminator(content, range.to)}`
				: range.to >= content.length
					? ''
					: '\n';
			return [{ edit: label, range, replacement, match: 'section' }];
		}
		case 'append': {
			const at = section.own_end;
			return [
				{
					edit: label,
					range: { from: at, to: at },
					replacement: `${blockSeparatorBefore(content, at)}${body.trim()}${blockTerminator(content, at)}`,
					match: 'section'
				}
			];
		}
		case 'prepend': {
			const at = section.heading_end;
			const lead = content[at - 1] === '\n' ? '\n' : '\n\n';
			return [
				{
					edit: label,
					range: { from: at, to: at },
					replacement: `${lead}${body.trim()}\n`,
					match: 'section'
				}
			];
		}
		case 'delete': {
			const range = { from: section.char_start, to: section.char_end };
			if (range.to >= content.length) {
				while (range.from > 0 && content[range.from - 1] === '\n') range.from -= 1;
				if (range.from > 0) range.from += 1; // keep one newline at the end of the file
			}
			return [{ edit: label, range, replacement: '', match: 'section' }];
		}
		case 'move': {
			const hasAfter = typeof edit.after_section === 'string' && edit.after_section.trim();
			const hasBefore = typeof edit.before_section === 'string' && edit.before_section.trim();
			if (Boolean(hasAfter) === Boolean(hasBefore)) {
				return {
					edit: label,
					code: 'INVALID_EDIT',
					message:
						'section_edits move needs exactly one of after_section or before_section.'
				};
			}
			const target = findSection(
				sections,
				hasAfter ? edit.after_section : edit.before_section,
				label
			);
			if ('code' in target) return target;
			const at = hasAfter ? target.char_end : target.char_start;
			if (target === section || (at > section.char_start && at < section.char_end)) {
				return {
					edit: label,
					code: 'INVALID_EDIT',
					message: 'A section cannot be moved inside itself.'
				};
			}
			const moved = content.slice(section.char_start, section.char_end).replace(/\n+$/, '');
			return [
				{
					edit: label,
					range: { from: section.char_start, to: section.char_end },
					replacement: '',
					match: 'section'
				},
				{
					edit: label,
					range: { from: at, to: at },
					replacement: `${blockSeparatorBefore(content, at)}${moved}${blockTerminator(content, at)}`,
					match: 'section'
				}
			];
		}
		default:
			return {
				edit: label,
				code: 'INVALID_EDIT',
				message:
					'section_edits action must be one of: replace, delete, append, prepend, move.'
			};
	}
}

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------

function rangesOverlap(left: Range, right: Range): boolean {
	if (left.from === left.to && right.from === right.to) return left.from === right.from;
	if (left.from === left.to) return left.from > right.from && left.from < right.to;
	if (right.from === right.to) return right.from > left.from && right.from < left.to;
	return left.from < right.to && right.from < left.to;
}

function touchesManaged(regions: Range[], range: Range): boolean {
	return regions.some((region) =>
		range.from === range.to
			? range.from > region.from && range.from < region.to
			: range.from < region.to && range.to > region.from
	);
}

export function hasDocumentEdits(input: { edits?: unknown; section_edits?: unknown }): boolean {
	return (
		(Array.isArray(input.edits) && input.edits.length > 0) ||
		(Array.isArray(input.section_edits) && input.section_edits.length > 0)
	);
}

/**
 * Resolve text and section edits against the current body. All-or-nothing:
 * any failure rejects the whole batch and reports every failing edit, so the
 * model can fix them in one retry.
 */
export function resolveDocumentEdits(input: ResolveDocumentEditsInput): ResolveDocumentEditsResult {
	const content = input.content ?? '';
	const edits = input.edits ?? [];
	const sectionEdits = input.section_edits ?? [];
	if (edits.length + sectionEdits.length === 0) {
		return {
			status: 'rejected',
			failures: [{ edit: 'edits', code: 'INVALID_EDIT', message: 'No edits were provided.' }]
		};
	}
	if (edits.length + sectionEdits.length > DOCUMENT_EDITS_MAX) {
		return {
			status: 'rejected',
			failures: [
				{
					edit: 'edits',
					code: 'INVALID_EDIT',
					message: `At most ${DOCUMENT_EDITS_MAX} edits per call.`
				}
			]
		};
	}

	const folded = foldForMatch(content);
	const sections = sectionEdits.length > 0 ? flattenSections(content) : [];
	const failures: DocumentEditFailure[] = [];
	const planned: PlannedOperation[] = [];

	edits.forEach((edit, index) => {
		const result = planTextEdit(content, folded, edit, `edits[${index}]`);
		if (Array.isArray(result)) planned.push(...result);
		else failures.push(result);
	});
	sectionEdits.forEach((edit, index) => {
		const result = planSectionEdit(content, sections, edit, `section_edits[${index}]`);
		if (Array.isArray(result)) planned.push(...result);
		else failures.push(result);
	});

	const managed = findStartHereManagedRegionRanges(content);
	for (const operation of planned) {
		if (touchesManaged(managed, operation.range)) {
			failures.push({
				edit: operation.edit,
				code: 'MANAGED_REGION_BOUNDARY',
				message:
					'This text is inside an automatically maintained START HERE region (status or map). It updates itself; edit the authored text outside it.'
			});
		}
	}
	for (let left = 0; left < planned.length; left += 1) {
		for (let right = left + 1; right < planned.length; right += 1) {
			const a = planned[left]!;
			const b = planned[right]!;
			if (a.edit !== b.edit && rangesOverlap(a.range, b.range)) {
				failures.push({
					edit: b.edit,
					code: 'OVERLAPPING_EDITS',
					message: `${b.edit} overlaps ${a.edit}. Combine them into one edit.`
				});
			}
		}
	}
	if (failures.length > 0) return { status: 'rejected', failures: dedupeFailures(failures) };

	const selections: DocumentPatchSelection[] = planned.map((operation, index) => ({
		op_id: `${operation.edit}#${index}`,
		from: operation.range.from,
		to: operation.range.to,
		replacement_markdown: operation.replacement
	}));
	const patch = createDocumentPatchV1({
		project_id: input.project_id,
		document_id: input.document_id,
		base_content: content,
		selections
	});
	const resolved = resolveDocumentPatch(patch, content);
	if (resolved.status === 'conflict') {
		return {
			status: 'rejected',
			failures: [
				{
					edit: 'edits',
					code:
						resolved.reason === 'MANAGED_REGION_BOUNDARY'
							? 'MANAGED_REGION_BOUNDARY'
							: 'OVERLAPPING_EDITS',
					message: `The edits could not be applied together (${resolved.reason}).`
				}
			]
		};
	}

	const applied = new Map<string, AppliedDocumentEdit>();
	for (const operation of planned) {
		const entry = applied.get(operation.edit) ?? {
			edit: operation.edit,
			match: operation.match,
			lines: []
		};
		const line = lineNumberAt(content, operation.range.from);
		if (!entry.lines.includes(line)) entry.lines.push(line);
		if (operation.match === 'normalized') entry.match = 'normalized';
		applied.set(operation.edit, entry);
	}
	return {
		status: 'resolved',
		next_content: resolved.next_content,
		applied: [...applied.values()]
	};
}

function dedupeFailures(failures: DocumentEditFailure[]): DocumentEditFailure[] {
	const seen = new Set<string>();
	return failures.filter((failure) => {
		const key = `${failure.edit}\u0000${failure.code}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** One model-actionable message covering every failed edit. */
export function formatDocumentEditFailures(failures: DocumentEditFailure[]): string {
	const lines = failures.map((failure) => {
		const parts = [`${failure.edit}: ${failure.code} \u2014 ${failure.message}`];
		for (const suggestion of failure.suggestions ?? []) {
			parts.push(`  line ${suggestion.line}: ${suggestion.text}`);
		}
		if (
			failure.available_sections?.length &&
			(failure.code === 'SECTION_NOT_FOUND' || failure.code === 'INVALID_EDIT')
		) {
			parts.push(`  anchors: ${failure.available_sections.join(', ')}`);
		}
		return parts.join('\n');
	});
	return `No edits were applied; the document is unchanged.\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Find
// ---------------------------------------------------------------------------

export type DocumentFindMatch = {
	line: number;
	text: string;
	section: string | null;
	before?: string[];
	after?: string[];
};

export type DocumentFindResult = {
	query: string;
	total_matches: number;
	matches: DocumentFindMatch[];
	truncated: boolean;
	total_lines: number;
};

/**
 * Literal, case-insensitive line search inside one document. Returns exact
 * line text so a model can copy it into an edit's old_text. When no line holds
 * the whole query, lines holding every query word are returned instead.
 */
export function findInDocument(
	content: string | null | undefined,
	query: string,
	options: { max_matches?: number; context_lines?: number } = {}
): DocumentFindResult {
	const text = content ?? '';
	const lines = text.split('\n');
	const maxMatches = Math.max(1, Math.min(options.max_matches ?? 20, 50));
	const contextLines = Math.max(0, Math.min(options.context_lines ?? 1, 3));
	const needle = foldForMatch(query.trim()).text.toLowerCase();
	const foldedLines = lines.map((line) => foldForMatch(line).text.toLowerCase());

	let hits = needle
		? foldedLines.flatMap((line, index) => (line.includes(needle) ? [index] : []))
		: [];
	if (hits.length === 0 && needle.includes(' ')) {
		const words = needle.split(' ').filter(Boolean);
		hits = foldedLines.flatMap((line, index) =>
			words.every((word) => line.includes(word)) ? [index] : []
		);
	}

	const sections = flattenSections(text);
	const sectionAt = (offset: number): string | null => {
		let owner: FlatSection | null = null;
		for (const section of sections) {
			if (offset >= section.char_start && offset < section.char_end) owner = section;
		}
		return owner?.anchor ?? null;
	};
	const lineOffsets: number[] = [];
	let offset = 0;
	for (const line of lines) {
		lineOffsets.push(offset);
		offset += line.length + 1;
	}

	return {
		query,
		total_matches: hits.length,
		truncated: hits.length > maxMatches,
		total_lines: lines.length,
		matches: hits.slice(0, maxMatches).map((index) => ({
			line: index + 1,
			text: lines[index]!,
			section: sectionAt(lineOffsets[index]!),
			...(contextLines > 0
				? {
						before: lines.slice(Math.max(0, index - contextLines), index),
						after: lines.slice(index + 1, index + 1 + contextLines)
					}
				: {})
		}))
	};
}

// ---------------------------------------------------------------------------
// Change summary + Undo
// ---------------------------------------------------------------------------

export type DocumentChangeLineV1 = {
	kind: 'add' | 'remove' | 'context';
	text: string;
};

export type DocumentChangeHunkV1 = {
	old_start: number;
	new_start: number;
	lines: DocumentChangeLineV1[];
};

export type DocumentChangeSummaryV1 = {
	version: 1;
	document_id: string;
	project_id: string;
	title: string | null;
	lines_added: number;
	lines_removed: number;
	chars_before: number;
	chars_after: number;
	before_hash: string;
	after_hash: string;
	hunks: DocumentChangeHunkV1[];
	hunks_truncated: boolean;
	/** Inverse patch for one-click Undo; null when the change is too large to carry. */
	revert_patch: DocumentPatchV1 | null;
};

export const DOCUMENT_CHANGE_MAX_HUNK_LINES = 80;
export const DOCUMENT_CHANGE_MAX_LINE_CHARS = 400;
export const DOCUMENT_CHANGE_MAX_REVERT_CHARS = 40_000;

function clipLine(text: string): string {
	return text.length > DOCUMENT_CHANGE_MAX_LINE_CHARS
		? `${text.slice(0, DOCUMENT_CHANGE_MAX_LINE_CHARS)}\u2026`
		: text;
}

/** Selections on `after` that restore `before`, one per changed run of lines. */
function revertSelections(before: string, after: string): DocumentPatchSelection[] {
	const selections: DocumentPatchSelection[] = [];
	let position = 0;
	let pending: { from: number; added: number; removed: string } | null = null;
	const flush = () => {
		if (!pending) return;
		selections.push({
			op_id: `revert_${selections.length}`,
			from: pending.from,
			to: pending.from + pending.added,
			replacement_markdown: pending.removed
		});
		pending = null;
	};
	for (const part of diffLines(before, after)) {
		if (!part.added && !part.removed) {
			flush();
			position += part.value.length;
			continue;
		}
		pending ??= { from: position, added: 0, removed: '' };
		if (part.added) {
			pending.added += part.value.length;
			position += part.value.length;
		} else {
			pending.removed += part.value;
		}
	}
	flush();
	return selections;
}

export function createDocumentRevertPatch(input: {
	project_id: string;
	document_id: string;
	before: string;
	after: string;
}): DocumentPatchV1 | null {
	if (input.before === input.after) return null;
	const selections = revertSelections(input.before, input.after);
	if (selections.length === 0) return null;
	const patch = createDocumentPatchV1({
		project_id: input.project_id,
		document_id: input.document_id,
		base_content: input.after,
		selections
	});
	return JSON.stringify(patch).length > DOCUMENT_CHANGE_MAX_REVERT_CHARS ? null : patch;
}

/**
 * GitHub-style summary of a document body change: +/- line counts, bounded
 * hunks for display, and an inverse patch for Undo. Null when the body is unchanged.
 */
export function summarizeDocumentChange(input: {
	project_id: string;
	document_id: string;
	title?: string | null;
	before: string | null | undefined;
	after: string | null | undefined;
	context_lines?: number;
}): DocumentChangeSummaryV1 | null {
	const before = input.before ?? '';
	const after = input.after ?? '';
	if (before === after) return null;

	const patch = structuredPatch('before', 'after', before, after, '', '', {
		context: input.context_lines ?? 2
	});
	let linesAdded = 0;
	let linesRemoved = 0;
	let budget = DOCUMENT_CHANGE_MAX_HUNK_LINES;
	let truncated = false;
	const hunks: DocumentChangeHunkV1[] = [];
	for (const hunk of patch.hunks) {
		const lines: DocumentChangeLineV1[] = [];
		for (const raw of hunk.lines) {
			const marker = raw[0];
			if (marker === '\\') continue;
			const kind = marker === '+' ? 'add' : marker === '-' ? 'remove' : 'context';
			if (kind === 'add') linesAdded += 1;
			if (kind === 'remove') linesRemoved += 1;
			if (budget > 0) {
				lines.push({ kind, text: clipLine(raw.slice(1)) });
				budget -= 1;
			} else {
				truncated = true;
			}
		}
		if (lines.length > 0) {
			hunks.push({ old_start: hunk.oldStart, new_start: hunk.newStart, lines });
		}
	}

	return {
		version: 1,
		document_id: input.document_id,
		project_id: input.project_id,
		title: input.title ?? null,
		lines_added: linesAdded,
		lines_removed: linesRemoved,
		chars_before: before.length,
		chars_after: after.length,
		before_hash: hashDocumentContent(before),
		after_hash: hashDocumentContent(after),
		hunks,
		hunks_truncated: truncated,
		revert_patch: createDocumentRevertPatch({
			project_id: input.project_id,
			document_id: input.document_id,
			before,
			after
		})
	};
}

// ---------------------------------------------------------------------------
// Whole-body replace guard
// ---------------------------------------------------------------------------

export const LARGE_DELETION_MIN_CHARS = 1_500;
export const LARGE_DELETION_MAX_SHRINK = 0.3;

/**
 * A whole-body replace that drops a large share of a long document is almost
 * always a model resending a fragment. Returns a model-actionable message when
 * the replace should be refused, or null when it is fine.
 */
export function largeDeletionRefusal(before: string, after: string): string | null {
	if (before.length < LARGE_DELETION_MIN_CHARS) return null;
	const removed = before.length - after.length;
	if (removed <= before.length * LARGE_DELETION_MAX_SHRINK) return null;
	const percent = Math.round((removed / before.length) * 100);
	return `This replace would shrink the document from ${before.length} to ${after.length} characters (${percent}% removed). To change part of a document, use edits (old_text/new_text) or section_edits instead of content. If the user asked to cut the document down, resend with allow_large_deletion: true.`;
}
