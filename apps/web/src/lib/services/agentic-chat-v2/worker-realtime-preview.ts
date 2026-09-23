// apps/web/src/lib/services/agentic-chat-v2/worker-realtime-preview.ts
//
// Display-only live answer preview (agentic_chat_preview). The worker streams a
// pass's cumulative text on the user channel while the durable path still
// buffers the pass. None of this is durable: it never enters the sequenced
// inbox, is never persisted, and durable truth always wins.
//
// Rendering model: the bubble shows `durableText + previewSuffix(...)`.
// - Live: the suffix is the pass text, joined the way the worker joins passes.
// - Settling: once durable text above the preview's floor starts arriving, the
//   on-screen text is frozen and only its not-yet-durable remainder is shown,
//   so a pass released in several durable chunks never shrinks or duplicates.
//   Durable text that catches up, or diverges, ends the preview.
import {
	AGENTIC_CHAT_LIVE_TEXT_PREVIEW_MAX_BYTES,
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgenticChatLiveTextPreviewV1
} from '@buildos/shared-types';

/** A preview with no update for this long is dropped (the worker went quiet). */
export const LIVE_TEXT_PREVIEW_STALE_MS = 15_000;

const MAX_PASS_KEY_CHARS = 256;
/** UTF-16 units can never exceed UTF-8 bytes, so this bounds any honest payload. */
const MAX_TEXT_CHARS = AGENTIC_CHAT_LIVE_TEXT_PREVIEW_MAX_BYTES;

export type LiveTextPreviewActive = {
	passKey: string;
	text: string;
	floor: number;
	receivedAt: number;
	/** On-screen text frozen when durable text above the floor began to arrive. */
	settleTarget: string | null;
};

export type LiveTextPreviewState = {
	lastSeq: number;
	/** Highest durable sequence applied to the UI in the current generation. */
	appliedSequence: number;
	active: LiveTextPreviewActive | null;
};

export function createLiveTextPreviewState(appliedSequence = 0): LiveTextPreviewState {
	return { lastSeq: 0, appliedSequence, active: null };
}

export function parseAgenticChatLiveTextPreview(
	value: unknown
): AgenticChatLiveTextPreviewV1 | null {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (
		record.contract_version !== AGENTIC_CHAT_WORKER_CONTRACT_VERSION ||
		!nonemptyString(record.turn_run_id) ||
		!nonemptyString(record.session_id) ||
		!positiveSafeInteger(record.execution_generation) ||
		!nonemptyString(record.pass_key) ||
		record.pass_key.length > MAX_PASS_KEY_CHARS ||
		!positiveSafeInteger(record.seq) ||
		typeof record.text !== 'string' ||
		record.text.length > MAX_TEXT_CHARS ||
		(record.state !== 'streaming' && record.state !== 'discard') ||
		!nonnegativeSafeInteger(record.durable_sequence_floor)
	) {
		return null;
	}
	return record as AgenticChatLiveTextPreviewV1;
}

/**
 * Apply one preview update. Stale updates (not newer by `seq`, or whose floor
 * durable truth has already passed) change nothing. A discard only retracts
 * its own pass; a newer pass replaces whatever was shown.
 */
export function receiveLiveTextPreview(
	state: LiveTextPreviewState,
	preview: AgenticChatLiveTextPreviewV1,
	now: number
): LiveTextPreviewState {
	if (preview.seq <= state.lastSeq) return state;
	const next: LiveTextPreviewState = { ...state, lastSeq: preview.seq };
	if (preview.durable_sequence_floor < state.appliedSequence) return next;
	if (preview.state === 'discard') {
		return next.active?.passKey === preview.pass_key ? { ...next, active: null } : next;
	}
	if (!preview.text) return { ...next, active: null };
	return {
		...next,
		active: {
			passKey: preview.pass_key,
			text: preview.text,
			floor: preview.durable_sequence_floor,
			receivedAt: now,
			settleTarget: null
		}
	};
}

/**
 * A durable live event was applied. Anything above the floor is newer truth: a
 * non-text event ends the preview (the pass's prose was withheld or superseded);
 * text starts settling against the frozen on-screen text.
 */
export function observeDurableLiveEvent(
	state: LiveTextPreviewState,
	input: { sequence: number; isText: boolean; durableTextBefore: string }
): LiveTextPreviewState {
	const appliedSequence = Math.max(state.appliedSequence, input.sequence);
	const active = state.active;
	if (!active || input.sequence <= active.floor) return { ...state, appliedSequence };
	if (!input.isText) return { ...state, appliedSequence, active: null };
	if (active.settleTarget !== null) return { ...state, appliedSequence };
	return {
		...state,
		appliedSequence,
		active: { ...active, settleTarget: liveDisplayText(input.durableTextBefore, active.text) }
	};
}

/**
 * A reconciliation snapshot was applied. Its watermark is durable truth; the
 * preview survives only as a settling remainder when every new durable event
 * above its floor is listed in the receipt and is text.
 */
export function observeDurableReconciliation(
	state: LiveTextPreviewState,
	input: {
		watermark: number;
		/** Listed durable events with a sequence above `after`: how many, and whether all are text. */
		eventsAbove: (after: number) => { count: number; allText: boolean };
		durableTextBefore: string;
	}
): LiveTextPreviewState {
	const appliedSequence = Math.max(state.appliedSequence, input.watermark);
	const active = state.active;
	const from = active ? Math.max(active.floor, state.appliedSequence) : 0;
	if (!active || input.watermark <= from) return { ...state, appliedSequence };
	const above = input.eventsAbove(from);
	if (!above.allText || above.count !== input.watermark - from) {
		return { ...state, appliedSequence, active: null };
	}
	if (active.settleTarget !== null) return { ...state, appliedSequence };
	return {
		...state,
		appliedSequence,
		active: { ...active, settleTarget: liveDisplayText(input.durableTextBefore, active.text) }
	};
}

export function clearLiveTextPreview(state: LiveTextPreviewState): LiveTextPreviewState {
	return state.active ? { ...state, active: null } : state;
}

export function expireLiveTextPreview(
	state: LiveTextPreviewState,
	now: number
): LiveTextPreviewState {
	const active = state.active;
	if (!active || now - active.receivedAt < LIVE_TEXT_PREVIEW_STALE_MS) return state;
	return { ...state, active: null };
}

/**
 * What to render after the durable text. Empty means no preview: nothing is
 * active, or a settling preview was caught up by (or diverged from) durable text.
 */
export function liveTextPreviewSuffix(state: LiveTextPreviewState, durableText: string): string {
	const active = state.active;
	if (!active) return '';
	if (active.settleTarget === null) {
		return liveDisplayText(durableText, active.text).slice(durableText.length);
	}
	const target = active.settleTarget;
	return target.length > durableText.length && target.startsWith(durableText)
		? target.slice(durableText.length)
		: '';
}

/**
 * The worker separates one pass's text from earlier turn text with a blank line
 * when neither side already has whitespace at the join (ProviderTurnState.textDelta).
 * Structural formatting only; no language is interpreted.
 */
function liveDisplayText(durableText: string, passText: string): string {
	const owesSeparator = durableText.length > 0 && !/\s$/.test(durableText);
	return owesSeparator && !/^\s/.test(passText)
		? `${durableText}\n\n${passText}`
		: `${durableText}${passText}`;
}

function nonemptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function positiveSafeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 1;
}

function nonnegativeSafeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}
