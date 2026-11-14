// packages/agentic-chat-runtime/src/context-finder/card.ts
//
// Document cards for agents (tasker 152). When Jev picks a document, the agent gets what it
// is (description, or the AI summary), every heading with its anchor, and the sections Jev
// flagged for this question, but not its text. The agent reads what it needs with
// read_document_section. A document short enough to read at a glance comes whole.
//
// A card always says which of the two it is: "Whole document" when the text is all there,
// "Text not shown" (with the size when known, and the tool to read it) when it is a card.
import { DOCUMENT_CARD_TEXT_MAX_CHARS } from '@buildos/shared-agent-ops/utils/document-card';
import { clipContextText, matchSectionIndex, type ContextFinderEntity } from './packets';
import type { ContextPlanSectionV1 } from './select';

export type ContextCardSectionV1 = { heading: string; anchor: string | null };

/** A picked document at a glance: what it is, its sections by anchor, and Jev's flags. */
export type ContextDocumentCardV1 = {
	/** The person's or agent's description, else the AI summary. */
	description: string | null;
	sections: ContextCardSectionV1[];
	/** Headings left off the card. */
	more: number;
	/** The sections Jev flagged as relevant to this question, in its order. */
	flagged?: ContextCardSectionV1[];
	/** The whole text, when it is short enough to be the card. */
	text?: string;
	/** Size of the document's text when the outline gives it; the card carries none of it. */
	chars?: number;
	/** A table document: its shape, never its rows. */
	table?: { rows: number; columns: string[] };
	/**
	 * Text of this document already in the prompt, carried from the last turn: those sections,
	 * or the whole document. Set by `markCarriedDocuments` (evidence.ts).
	 */
	loaded?: ContextCardSectionV1[] | 'whole';
};

/** Tools a card tells the agent to read with; the host pins the ones a block mentions. */
export const CARD_READ_TOOLS = Object.freeze({
	document: ['get_document_outline', 'read_document_section'],
	table: ['get_onto_table_details', 'read_table_rows']
} as const);

/** Headings on a document card; the rest are counted. */
const CARD_SECTIONS = 12;
const CARD_HEADING_CHARS = 60;
const CARD_DESCRIPTION_CHARS = 300;

function cardSection(section: { heading: string; anchor?: string | null }): ContextCardSectionV1 {
	return {
		heading: clipContextText(section.heading, CARD_HEADING_CHARS),
		anchor: section.anchor ?? null
	};
}

/** The entity's sections Jev named: by anchor, else the first unused heading match. */
function flaggedSections(
	entity: ContextFinderEntity,
	wanted: readonly ContextPlanSectionV1[]
): ContextCardSectionV1[] {
	const used = new Set<number>();
	const out: ContextCardSectionV1[] = [];
	for (const section of wanted) {
		const index = matchSectionIndex(entity.sections, section, used);
		if (index < 0) continue;
		used.add(index);
		out.push(cardSection(entity.sections[index]!));
	}
	return out;
}

function tableShape(value: unknown): { rows: number; columns: string[] } | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const table = value as { rows?: unknown; columns?: unknown };
	return {
		rows: typeof table.rows === 'number' && table.rows >= 0 ? table.rows : 0,
		columns: Array.isArray(table.columns)
			? table.columns.filter((name): name is string => typeof name === 'string')
			: []
	};
}

export function documentCard(
	entity: ContextFinderEntity,
	flagged: readonly ContextPlanSectionV1[] = [],
	options: { shortText?: boolean } = {}
): ContextDocumentCardV1 {
	const headings = entity.packetHeadings;
	const description =
		entity.summary ??
		(typeof entity.packet.description === 'string' && entity.packet.description
			? entity.packet.description
			: null);
	const table = tableShape(entity.packet.table);
	// A table's text is its generated row projection: never shown as the card.
	const text = options.shortText && entity.textLoaded && !table ? entity.fullText.trim() : '';
	const whole = text && text.length <= DOCUMENT_CARD_TEXT_MAX_CHARS ? text : '';
	const flags = flaggedSections(entity, flagged);
	return {
		description: description ? clipContextText(description, CARD_DESCRIPTION_CHARS) : null,
		sections: headings.slice(0, CARD_SECTIONS).map(cardSection),
		more: Math.max(0, headings.length - CARD_SECTIONS),
		...(flags.length ? { flagged: flags } : {}),
		...(whole ? { text: whole } : {}),
		...(!whole && !table && typeof entity.textChars === 'number' && entity.textChars > 0
			? { chars: entity.textChars }
			: {}),
		...(table ? { table } : {})
	};
}

const withAnchor = (section: ContextCardSectionV1) =>
	section.anchor ? `${section.heading} (${section.anchor})` : section.heading;

const count = (n: number) => n.toLocaleString('en-US');

/**
 * The card as the agent reads it (renderContextEvidenceBlock). `cardOnly` is false when the
 * document's text follows the card (hosts that load sections up front), so the card then says
 * nothing about text that is missing.
 */
export function documentCardLines(
	card: ContextDocumentCardV1,
	options: { cardOnly?: boolean } = { cardOnly: true }
): string[] {
	if (card.text) return [`Whole document (${count(card.text.length)} chars):`, card.text];
	const lines: string[] = [];
	if (card.description) lines.push(`Summary: ${card.description}`);
	if (card.table) {
		const columns = card.table.columns.length
			? ` · columns: ${card.table.columns.join(', ')}`
			: '';
		lines.push(`Table: ${count(card.table.rows)} rows${columns}`);
		if (options.cardOnly)
			lines.push(
				'Rows not shown. Read them with read_table_rows, or get_onto_table_details for the columns and first rows (table_id is this document id).'
			);
		return lines;
	}
	if (card.flagged?.length)
		lines.push(`Flagged for this question: ${card.flagged.map(withAnchor).join(' · ')}`);
	if (card.sections.length)
		lines.push(
			`Sections (anchor): ${card.sections.map(withAnchor).join(' · ')}${
				card.more ? ` · +${card.more} more` : ''
			}`
		);
	if (card.loaded === 'whole') {
		lines.push('Its whole text is already loaded above (carried from last turn).');
		return lines;
	}
	if (card.loaded?.length)
		lines.push(
			`Already loaded above (carried from last turn): ${card.loaded.map(withAnchor).join(' · ')}`
		);
	if (!options.cardOnly) return lines;
	const size = card.chars ? ` (about ${count(card.chars)} chars)` : '';
	if (card.sections.length)
		lines.push(
			`Text not shown${size}. Read sections with read_document_section and their anchors.`
		);
	else
		lines.push(
			`${
				card.description
					? `Text not shown${size}; this document has no headings.`
					: 'No summary or headings yet.'
			} Read it with read_document_section (offset 0, no anchors).`
		);
	return lines;
}

/** Characters a card adds to the prompt, for the plan budget. */
export function documentCardChars(card: ContextDocumentCardV1): number {
	return documentCardLines(card).join('\n').length;
}

/** Which picked documents still need their text: only ones with no headings and no summary
 * (mostly short notes, shown whole). Everything else is a card from the outline and summary;
 * a table is a card from its columns and row count. */
export function cardNeedsText(entity: ContextFinderEntity): boolean {
	return (
		entity.kind === 'document' &&
		!entity.textLoaded &&
		entity.sections.length === 0 &&
		!entity.summary &&
		!entity.packet.table
	);
}
