// packages/shared-agent-ops/src/ontology/document-patch.ts
//
// Pure, browser-safe implementation of the ratified DocumentPatchV1 contract.
// Proposal creation, preview, and server apply all depend on this exact kernel.

import { sha256 } from 'js-sha256';
import {
	extractOutline,
	type DocOutlineNode,
	hashDocumentContent
} from '../utils/document-outline';
import { findStartHereManagedRegionRanges } from './start-here';

export const DOCUMENT_PATCH_SCHEMA_VERSION = 1 as const;
export const DOCUMENT_PATCH_CONTEXT_CHARS = 256;

export type DocumentPatchConflictReason =
	| 'BASE_TEXT_CHANGED'
	| 'ANCHOR_NOT_FOUND'
	| 'ANCHOR_AMBIGUOUS'
	| 'OVERLAPPING_OPERATIONS'
	| 'MANAGED_REGION_BOUNDARY'
	| 'WRITE_RACE';

export type HeadingPathSegmentV1 = {
	level: 1 | 2 | 3 | 4 | 5 | 6;
	text: string;
	slug: string;
	sibling_ordinal: number;
};

export type DocumentPatchAnchorV1 = {
	heading_path: HeadingPathSegmentV1[];
	base_range: { from: number; to: number };
	section_range: { from: number; to: number };
	before_markdown: string;
	before_hash: string;
	prefix: string;
	suffix: string;
};

export type DocumentPatchOperationV1 = {
	op_id: string;
	kind: 'replace_range';
	anchor: DocumentPatchAnchorV1;
	replacement_markdown: string;
};

export type DocumentPatchV1 = {
	schema_version: typeof DOCUMENT_PATCH_SCHEMA_VERSION;
	project_id: string;
	document_id: string;
	base_content_hash: string;
	operations: DocumentPatchOperationV1[];
	patch_hash: string;
};

export type DocumentPatchSelection = {
	op_id: string;
	from: number;
	to: number;
	replacement_markdown: string;
};

export type ResolvedDocumentPatchOperation = {
	op_id: string;
	from: number;
	to: number;
	before_markdown: string;
	replacement_markdown: string;
};

export type ResolveDocumentPatchResult =
	| {
			status: 'resolved';
			strategy: 'fast_path' | 'reanchored';
			operations: ResolvedDocumentPatchOperation[];
			next_content: string;
	  }
	| { status: 'conflict'; reason: Exclude<DocumentPatchConflictReason, 'WRITE_RACE'> };

export class DocumentPatchIntegrityError extends Error {
	readonly code = 'PATCH_HASH_MISMATCH';

	constructor(message = 'The document patch no longer matches the reviewed proposal.') {
		super(message);
		this.name = 'DocumentPatchIntegrityError';
	}
}

type HeadingEntry = {
	node: DocOutlineNode;
	path: HeadingPathSegmentV1[];
};

type SectionRange = { from: number; to: number };

function asHeadingLevel(level: number): HeadingPathSegmentV1['level'] {
	if (level < 1 || level > 6) throw new Error(`Invalid Markdown heading level: ${level}`);
	return level as HeadingPathSegmentV1['level'];
}

function listHeadingEntries(
	nodes: DocOutlineNode[],
	parent: HeadingPathSegmentV1[] = []
): HeadingEntry[] {
	const entries: HeadingEntry[] = [];
	const ordinals = new Map<string, number>();

	for (const node of nodes) {
		const ordinalKey = `${node.level}\u0000${node.text}`;
		const siblingOrdinal = ordinals.get(ordinalKey) ?? 0;
		ordinals.set(ordinalKey, siblingOrdinal + 1);
		const segment: HeadingPathSegmentV1 = {
			level: asHeadingLevel(node.level),
			text: node.text,
			slug: node.anchor,
			sibling_ordinal: siblingOrdinal
		};
		const path = [...parent, segment];
		entries.push({ node, path });
		if (node.children?.length) entries.push(...listHeadingEntries(node.children, path));
	}

	return entries;
}

function selectedHeadingEntry(content: string, from: number, to: number): HeadingEntry | null {
	const entries = listHeadingEntries(extractOutline(content).nodes);
	let selected: HeadingEntry | null = null;
	for (const entry of entries) {
		const containsRange =
			from >= entry.node.char_start &&
			to <= entry.node.char_end &&
			(from < entry.node.char_end || from === content.length);
		if (containsRange && (!selected || entry.path.length > selected.path.length))
			selected = entry;
	}
	return selected;
}

function assertSelectionRange(content: string, selection: DocumentPatchSelection): void {
	if (!selection.op_id.trim())
		throw new Error('Document patch operations require a non-empty op_id.');
	if (
		!Number.isInteger(selection.from) ||
		!Number.isInteger(selection.to) ||
		selection.from < 0 ||
		selection.to < selection.from ||
		selection.to > content.length
	) {
		throw new RangeError('Document patch selection is outside the proposal base.');
	}
}

export function captureDocumentPatchOperation(
	content: string,
	selection: DocumentPatchSelection
): DocumentPatchOperationV1 {
	assertSelectionRange(content, selection);
	const heading = selectedHeadingEntry(content, selection.from, selection.to);
	const sectionStart = heading?.node.char_start ?? 0;
	const beforeMarkdown = content.slice(selection.from, selection.to);

	return {
		op_id: selection.op_id,
		kind: 'replace_range',
		anchor: {
			heading_path: heading?.path ?? [],
			base_range: { from: selection.from, to: selection.to },
			section_range: {
				from: selection.from - sectionStart,
				to: selection.to - sectionStart
			},
			before_markdown: beforeMarkdown,
			before_hash: hashDocumentContent(beforeMarkdown),
			prefix: content.slice(
				Math.max(0, selection.from - DOCUMENT_PATCH_CONTEXT_CHARS),
				selection.from
			),
			suffix: content.slice(selection.to, selection.to + DOCUMENT_PATCH_CONTEXT_CHARS)
		},
		replacement_markdown: selection.replacement_markdown
	};
}

function canonicalize(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
		.join(',')}}`;
}

export function canonicalDocumentPatchJson(
	patch: Omit<DocumentPatchV1, 'patch_hash'> | DocumentPatchV1
): string {
	const { patch_hash: _patchHash, ...hashable } = patch as DocumentPatchV1;
	return canonicalize(hashable);
}

export function hashDocumentPatch(
	patch: Omit<DocumentPatchV1, 'patch_hash'> | DocumentPatchV1
): string {
	return sha256(canonicalDocumentPatchJson(patch));
}

export function createDocumentPatchV1(input: {
	project_id: string;
	document_id: string;
	base_content: string | null | undefined;
	selections: DocumentPatchSelection[];
}): DocumentPatchV1 {
	const content = input.base_content ?? '';
	if (!input.project_id.trim() || !input.document_id.trim()) {
		throw new Error('Document patch requires project_id and document_id.');
	}
	if (input.selections.length === 0)
		throw new Error('Document patch requires at least one operation.');
	const operations = input.selections.map((selection) =>
		captureDocumentPatchOperation(content, selection)
	);
	if (new Set(operations.map((operation) => operation.op_id)).size !== operations.length) {
		throw new Error('Document patch operation ids must be unique.');
	}
	const hashable: Omit<DocumentPatchV1, 'patch_hash'> = {
		schema_version: DOCUMENT_PATCH_SCHEMA_VERSION,
		project_id: input.project_id,
		document_id: input.document_id,
		base_content_hash: hashDocumentContent(content),
		operations
	};
	return { ...hashable, patch_hash: hashDocumentPatch(hashable) };
}

export function assertDocumentPatchIntegrity(patch: DocumentPatchV1): void {
	if (
		patch.schema_version !== DOCUMENT_PATCH_SCHEMA_VERSION ||
		hashDocumentPatch(patch) !== patch.patch_hash
	) {
		throw new DocumentPatchIntegrityError();
	}
}

function resolveHeadingPath(content: string, path: HeadingPathSegmentV1[]): SectionRange | null {
	if (path.length === 0) return { from: 0, to: content.length };
	let siblings = extractOutline(content).nodes;
	let resolved: DocOutlineNode | null = null;

	for (const segment of path) {
		const matchingSiblings = siblings.filter(
			(node) => node.level === segment.level && node.text === segment.text
		);
		resolved = matchingSiblings[segment.sibling_ordinal] ?? null;
		if (!resolved) return null;
		siblings = resolved.children ?? [];
	}

	return resolved ? { from: resolved.char_start, to: resolved.char_end } : null;
}

function contextMatches(
	content: string,
	from: number,
	to: number,
	anchor: DocumentPatchAnchorV1
): boolean {
	if (anchor.prefix && content.slice(from - anchor.prefix.length, from) !== anchor.prefix)
		return false;
	if (anchor.suffix && content.slice(to, to + anchor.suffix.length) !== anchor.suffix)
		return false;
	return true;
}

function exactTargetMatches(
	content: string,
	from: number,
	to: number,
	anchor: DocumentPatchAnchorV1
): boolean {
	return (
		from >= 0 &&
		to >= from &&
		to <= content.length &&
		content.slice(from, to) === anchor.before_markdown &&
		hashDocumentContent(content.slice(from, to)) === anchor.before_hash
	);
}

function exactOccurrences(content: string, target: string, section: SectionRange): number[] {
	const occurrences: number[] = [];
	let cursor = section.from;
	while (cursor <= section.to - target.length) {
		const found = content.indexOf(target, cursor);
		if (found < 0 || found + target.length > section.to) break;
		occurrences.push(found);
		cursor = found + Math.max(1, target.length);
	}
	return occurrences;
}

function insertionBoundaries(
	content: string,
	section: SectionRange,
	anchor: DocumentPatchAnchorV1
): number[] {
	if (!anchor.prefix && !anchor.suffix) return [];
	const boundaries: number[] = [];
	for (let position = section.from; position <= section.to; position += 1) {
		if (contextMatches(content, position, position, anchor)) boundaries.push(position);
	}
	return boundaries;
}

function resolveReanchoredOperation(
	content: string,
	operation: DocumentPatchOperationV1
): ResolvedDocumentPatchOperation | Exclude<DocumentPatchConflictReason, 'WRITE_RACE'> {
	const { anchor } = operation;
	const section = resolveHeadingPath(content, anchor.heading_path);

	if (anchor.before_markdown === '') {
		if (!section) return 'ANCHOR_NOT_FOUND';
		const boundaries = insertionBoundaries(content, section, anchor);
		if (boundaries.length === 0) return 'ANCHOR_NOT_FOUND';
		if (boundaries.length > 1) return 'ANCHOR_AMBIGUOUS';
		return {
			op_id: operation.op_id,
			from: boundaries[0]!,
			to: boundaries[0]!,
			before_markdown: '',
			replacement_markdown: operation.replacement_markdown
		};
	}

	if (section) {
		const hintedRanges = [
			anchor.base_range,
			{
				from: section.from + anchor.section_range.from,
				to: section.from + anchor.section_range.to
			}
		];
		for (const hint of hintedRanges) {
			if (
				hint.from >= section.from &&
				hint.to <= section.to &&
				exactTargetMatches(content, hint.from, hint.to, anchor) &&
				contextMatches(content, hint.from, hint.to, anchor)
			) {
				return {
					op_id: operation.op_id,
					from: hint.from,
					to: hint.to,
					before_markdown: anchor.before_markdown,
					replacement_markdown: operation.replacement_markdown
				};
			}
		}

		const occurrences = exactOccurrences(content, anchor.before_markdown, section);
		const candidates =
			occurrences.length <= 1
				? occurrences
				: occurrences.filter((from) =>
						contextMatches(content, from, from + anchor.before_markdown.length, anchor)
					);
		if (candidates.length === 1) {
			const from = candidates[0]!;
			return {
				op_id: operation.op_id,
				from,
				to: from + anchor.before_markdown.length,
				before_markdown: anchor.before_markdown,
				replacement_markdown: operation.replacement_markdown
			};
		}
		if (candidates.length > 1 || occurrences.length > 1) return 'ANCHOR_AMBIGUOUS';
		return 'BASE_TEXT_CHANGED';
	}

	const wholeDocument = { from: 0, to: content.length };
	const candidates = exactOccurrences(content, anchor.before_markdown, wholeDocument).filter(
		(from) => contextMatches(content, from, from + anchor.before_markdown.length, anchor)
	);
	if (candidates.length === 1) {
		const from = candidates[0]!;
		return {
			op_id: operation.op_id,
			from,
			to: from + anchor.before_markdown.length,
			before_markdown: anchor.before_markdown,
			replacement_markdown: operation.replacement_markdown
		};
	}
	return candidates.length > 1 ? 'ANCHOR_AMBIGUOUS' : 'ANCHOR_NOT_FOUND';
}

function operationsOverlap(
	left: ResolvedDocumentPatchOperation,
	right: ResolvedDocumentPatchOperation
): boolean {
	if (left.from === left.to && right.from === right.to) return left.from === right.from;
	if (left.from === left.to) return left.from > right.from && left.from < right.to;
	if (right.from === right.to) return right.from > left.from && right.from < left.to;
	return left.from < right.to && right.from < left.to;
}

function hasOverlappingOperations(operations: ResolvedDocumentPatchOperation[]): boolean {
	const sorted = [...operations].sort(
		(left, right) => left.from - right.from || left.to - right.to
	);
	for (let index = 1; index < sorted.length; index += 1) {
		if (operationsOverlap(sorted[index - 1]!, sorted[index]!)) return true;
	}
	return false;
}

function touchesManagedRegion(content: string, operation: ResolvedDocumentPatchOperation): boolean {
	return findStartHereManagedRegionRanges(content).some((region) => {
		if (operation.from === operation.to)
			return operation.from > region.from && operation.from < region.to;
		return operation.from < region.to && operation.to > region.from;
	});
}

export function applyResolvedDocumentPatch(
	content: string,
	operations: ResolvedDocumentPatchOperation[]
): string {
	return [...operations]
		.sort((left, right) => right.from - left.from || right.to - left.to)
		.reduce(
			(next, operation) =>
				next.slice(0, operation.from) +
				operation.replacement_markdown +
				next.slice(operation.to),
			content
		);
}

export function resolveDocumentPatch(
	patch: DocumentPatchV1,
	currentContent: string | null | undefined
): ResolveDocumentPatchResult {
	assertDocumentPatchIntegrity(patch);
	const content = currentContent ?? '';
	if (
		new Set(patch.operations.map((operation) => operation.op_id)).size !==
		patch.operations.length
	) {
		return { status: 'conflict', reason: 'OVERLAPPING_OPERATIONS' };
	}

	const fastPath = hashDocumentContent(content) === patch.base_content_hash;
	const resolved: ResolvedDocumentPatchOperation[] = [];

	for (const operation of patch.operations) {
		const { anchor } = operation;
		if (fastPath) {
			if (
				!exactTargetMatches(content, anchor.base_range.from, anchor.base_range.to, anchor)
			) {
				return { status: 'conflict', reason: 'BASE_TEXT_CHANGED' };
			}
			resolved.push({
				op_id: operation.op_id,
				from: anchor.base_range.from,
				to: anchor.base_range.to,
				before_markdown: anchor.before_markdown,
				replacement_markdown: operation.replacement_markdown
			});
			continue;
		}

		const reanchored = resolveReanchoredOperation(content, operation);
		if (typeof reanchored === 'string') return { status: 'conflict', reason: reanchored };
		resolved.push(reanchored);
	}

	if (hasOverlappingOperations(resolved)) {
		return { status: 'conflict', reason: 'OVERLAPPING_OPERATIONS' };
	}
	if (resolved.some((operation) => touchesManagedRegion(content, operation))) {
		return { status: 'conflict', reason: 'MANAGED_REGION_BOUNDARY' };
	}

	return {
		status: 'resolved',
		strategy: fastPath ? 'fast_path' : 'reanchored',
		operations: resolved,
		next_content: applyResolvedDocumentPatch(content, resolved)
	};
}
