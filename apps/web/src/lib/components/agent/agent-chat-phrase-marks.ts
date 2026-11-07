// apps/web/src/lib/components/agent/agent-chat-phrase-marks.ts
//
// Which words of the user's message each change came from (tasker 155). A write's `from_quote`
// is found in the message by string match (shared `locateSourceQuote`); a quote that isn't
// there gets no mark. The state follows the step: live while it runs, landed once saved.

import { type SourceQuoteSpan, locateSourceQuote } from '@buildos/shared-types';
import type { ActivityEntry } from './agent-chat.types';
import { buildStepDetails, type StepAction } from './agent-chat-step-details';

export type PhraseMarkState = 'live' | 'landed' | 'failed';

export type PhraseMark = {
	/** The step's tool-call id; the row carries the same `data-step-slot`. */
	id: string;
	start: number;
	end: number;
	action: StepAction;
	/** Short record kind for the flying chip ("task", "document"). */
	label: string;
	state: PhraseMarkState;
};

export type PhrasePiece = { text: string; mark: PhraseMark | null };

// Tool names are structured identifiers (create_onto_task), not prose.
const TOOL_KIND = /_onto_([a-z]+)$/;

function pendingAction(toolName: string): StepAction {
	if (toolName.startsWith('create_')) return 'created';
	if (toolName.startsWith('delete_')) return 'deleted';
	if (toolName.startsWith('move_')) return 'moved';
	if (toolName.startsWith('link_')) return 'linked';
	return 'updated';
}

export function derivePhraseMarks(
	content: string,
	activities: readonly ActivityEntry[]
): PhraseMark[] {
	if (!content) return [];
	const used: SourceQuoteSpan[] = [];
	const marks: PhraseMark[] = [];
	for (const activity of activities) {
		if (activity.activityType !== 'tool_call') continue;
		const quote = activity.metadata?.sourceQuote;
		if (typeof quote !== 'string' || !quote.trim()) continue;
		const span = locateSourceQuote(content, quote, used);
		if (!span) continue;
		used.push(span);
		const toolName = String(activity.metadata?.toolName ?? '');
		const details = activity.status === 'completed' ? buildStepDetails(activity) : null;
		marks.push({
			id: activity.toolCallId ?? activity.id,
			start: span.start,
			end: span.end,
			action: details?.action ?? pendingAction(toolName),
			label: details?.entities[0]?.kind ?? TOOL_KIND.exec(toolName)?.[1] ?? 'change',
			state:
				activity.status === 'completed'
					? 'landed'
					: activity.status === 'failed'
						? 'failed'
						: 'live'
		});
	}
	return marks.sort((left, right) => left.start - right.start);
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
