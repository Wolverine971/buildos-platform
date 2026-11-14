// apps/web/src/lib/components/agent/agent-chat-phrase-marks.ts
//
// Which words of the user's messages each change came from (tasker 155). A write's `from_quote`
// is found by string match (shared `locateSourceQuote`: the same words, never "similar"); a
// quote that isn't there gets no mark. A mark only ever says what is true of its step:
//   live    the write is running
//   landed  the write was saved (or a held change was approved)
//   held    the change is waiting on the person's choice: nothing was saved
//   failed  the write failed
// A change the person undid or declined gets no mark at all.
//
// The quote is looked for in the message the turn answered, then in a few earlier user
// messages (nearest first): a short reply to a clarifying question ("Leave it in my
// workspace") is answered with a change whose words came from the message before it.

import { type SourceQuoteSpan, locateSourceQuote } from '@buildos/shared-types';
import type { ActivityEntry } from './agent-chat.types';
import { buildStepDetails, type StepAction } from './agent-chat-step-details';
import type { StepSettlement } from './agent-chat-turn-cards';

export type PhraseMarkState = 'live' | 'landed' | 'held' | 'failed';

export type PhraseMark = {
	/** The first step's tool-call id; the row carries the same `data-step-slot`. */
	id: string;
	/** Every step that quoted these words (two changes from one phrase share a mark). */
	ids: string[];
	start: number;
	end: number;
	action: StepAction;
	/** Short record kind for the flying chip ("task", "document"). */
	label: string;
	state: PhraseMarkState;
};

export type PhrasePiece = { text: string; mark: PhraseMark | null };

/** How many earlier user messages a quote is looked for in, after the one the turn answered. */
export const PHRASE_LOOK_BACK = 3;

// Tool names are structured identifiers (create_onto_task), not prose.
const TOOL_KIND = /_onto_([a-z]+)$/;

function pendingAction(toolName: string): StepAction {
	if (toolName.startsWith('create_')) return 'created';
	if (toolName.startsWith('delete_')) return 'deleted';
	if (toolName.startsWith('move_')) return 'moved';
	if (toolName.startsWith('link_')) return 'linked';
	return 'updated';
}

type QuotingStep = {
	id: string;
	state: PhraseMarkState;
	action: StepAction;
	label: string;
};

type Options = {
	/** Changes the person undid, approved or declined, by step activity id. */
	settled?: Readonly<Record<string, StepSettlement>>;
	/** False once the turn ended: a step still pending then never ran to a result. */
	turnActive?: boolean;
};

/** The step's truthful state, or null when its phrase must not be lit. */
function quotingStep(activity: ActivityEntry, options: Options): QuotingStep | null {
	const toolName = String(activity.metadata?.toolName ?? '');
	const settled = options.settled?.[activity.id]?.state;
	if (settled === 'undone' || settled === 'declined') return null;
	const details = activity.status === 'completed' ? buildStepDetails(activity) : null;
	let state: PhraseMarkState;
	if (activity.status === 'failed') state = 'failed';
	else if (activity.status !== 'completed') {
		if (options.turnActive === false) return null;
		state = 'live';
	} else if (settled === 'approved') state = 'landed';
	else state = details?.held ? 'held' : 'landed';
	return {
		id: activity.toolCallId ?? activity.id,
		state,
		action: details?.action ?? details?.intended ?? pendingAction(toolName),
		label: details?.entities[0]?.kind ?? TOOL_KIND.exec(toolName)?.[1] ?? 'change'
	};
}

const STATE_RANK: Record<PhraseMarkState, number> = { live: 3, landed: 2, held: 1, failed: 0 };

const quoteKey = (quote: string) => quote.trim().toLowerCase().replace(/\s+/g, ' ');

const overlaps = (span: SourceQuoteSpan, others: readonly SourceQuoteSpan[]) =>
	others.some((other) => span.start < other.end && other.start < span.end);

/**
 * Marks for one turn, keyed by the id of the user message each phrase was found in.
 * `messages` is the message the turn answered, then earlier user messages, nearest first.
 */
export function derivePhraseMarksForTurn(
	messages: readonly { id: string; content: string }[],
	activities: readonly ActivityEntry[],
	options: Options = {}
): Map<string, PhraseMark[]> {
	// One entry per distinct quote: two changes quoting the same words share one mark.
	const quotes = new Map<string, { quote: string; steps: QuotingStep[] }>();
	for (const activity of activities) {
		if (activity.activityType !== 'tool_call') continue;
		const quote = activity.metadata?.sourceQuote;
		if (typeof quote !== 'string' || !quote.trim()) continue;
		const step = quotingStep(activity, options);
		if (!step) continue;
		const key = quoteKey(quote);
		const entry = quotes.get(key) ?? { quote, steps: [] };
		entry.steps.push(step);
		quotes.set(key, entry);
	}
	if (quotes.size === 0) return new Map();

	// Where each quote sits: the nearest message that has those words.
	const found: {
		messageId: string;
		span: SourceQuoteSpan;
		quote: string;
		steps: QuotingStep[];
	}[] = [];
	for (const entry of quotes.values()) {
		for (const message of messages) {
			if (!message.content) continue;
			const span = locateSourceQuote(message.content, entry.quote);
			if (!span) continue;
			found.push({ messageId: message.id, span, ...entry });
			break;
		}
	}

	// The most specific spans win. A quote of (nearly) the whole message would swallow every
	// other mark; it moves to another occurrence if there is one, and is dropped otherwise.
	found.sort((a, b) => a.span.end - a.span.start - (b.span.end - b.span.start));
	const byMessage = new Map<string, PhraseMark[]>();
	const content = new Map(messages.map((message) => [message.id, message.content]));
	for (const entry of found) {
		const marks = byMessage.get(entry.messageId) ?? [];
		let span: SourceQuoteSpan | null = entry.span;
		if (overlaps(span, marks))
			span = locateSourceQuote(content.get(entry.messageId) ?? '', entry.quote, marks);
		if (!span) continue;
		const lead = [...entry.steps].sort((a, b) => STATE_RANK[b.state] - STATE_RANK[a.state])[0]!;
		marks.push({
			id: entry.steps[0]!.id,
			ids: entry.steps.map((step) => step.id),
			start: span.start,
			end: span.end,
			action: lead.action,
			label: lead.label,
			state: lead.state
		});
		byMessage.set(entry.messageId, marks);
	}
	for (const marks of byMessage.values()) marks.sort((left, right) => left.start - right.start);
	return byMessage;
}

/** Marks for one message from the turn that answered it (no look-back). */
export function derivePhraseMarks(
	content: string,
	activities: readonly ActivityEntry[],
	options: Options = {}
): PhraseMark[] {
	if (!content) return [];
	return derivePhraseMarksForTurn([{ id: '', content }], activities, options).get('') ?? [];
}

/** Adds a later turn's marks to a message that already has some; overlapping ones are dropped. */
export function mergePhraseMarks(
	existing: readonly PhraseMark[],
	added: readonly PhraseMark[]
): PhraseMark[] {
	const out = [...existing];
	for (const mark of added) if (!overlaps(mark, out)) out.push(mark);
	return out.sort((left, right) => left.start - right.start);
}

/** The message split into plain runs and marked runs, in order. */
export function splitByMarks(content: string, marks: readonly PhraseMark[]): PhrasePiece[] {
	const pieces: PhrasePiece[] = [];
	let at = 0;
	for (const mark of marks) {
		if (mark.start < at || mark.end > content.length) continue;
		if (mark.start > at) pieces.push({ text: content.slice(at, mark.start), mark: null });
		pieces.push({ text: content.slice(mark.start, mark.end), mark });
		at = mark.end;
	}
	if (at < content.length) pieces.push({ text: content.slice(at), mark: null });
	return pieces;
}
