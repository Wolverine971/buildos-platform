// apps/web/src/lib/components/agent/agent-chat-stream-reveal.ts
//
// Streaming text arrives in ~150 ms chunks, so a bubble that paints each chunk
// verbatim grows in visible hops of a line or two. The reveal eases the
// displayed length toward the received length over roughly one chunk interval
// (an EMA of observed gaps), whole words at a time, so text flows instead of
// jumping. It never runs ahead of received text, catches up hard when the
// backlog is large (reconnects, a backgrounded tab), and the list snaps to the
// full text the moment a message stops streaming.

/** Floor so a lone trailing chunk still drains promptly. */
export const REVEAL_MIN_CHARS_PER_SECOND = 60;
/** Anything further behind than this is shown immediately. */
export const REVEAL_MAX_BACKLOG_CHARS = 1200;
export const REVEAL_DEFAULT_WINDOW_MS = 150;
const REVEAL_WINDOW_MIN_MS = 60;
const REVEAL_WINDOW_MAX_MS = 360;
/** How far past the computed length we look for a word end. */
const WORD_SNAP_LOOKAHEAD = 16;

function isBreakChar(code: number): boolean {
	return code === 32 || code === 10 || code === 9 || code === 13;
}

function isHighSurrogate(code: number): boolean {
	return code >= 0xd800 && code <= 0xdbff;
}

/**
 * Next displayed length after `elapsedMs`, draining the backlog over
 * `windowMs`. Returns `text.length` once caught up.
 */
export function nextRevealLength(
	text: string,
	shown: number,
	elapsedMs: number,
	windowMs: number = REVEAL_DEFAULT_WINDOW_MS
): number {
	const total = text.length;
	let base = Math.max(0, Math.min(shown, total));
	if (base >= total) return total;
	if (total - base > REVEAL_MAX_BACKLOG_CHARS) base = total - REVEAL_MAX_BACKLOG_CHARS;

	const backlog = total - base;
	const charsPerMs = Math.max(
		backlog / Math.max(windowMs, 16),
		REVEAL_MIN_CHARS_PER_SECOND / 1000
	);
	let next = Math.min(total, base + Math.max(1, Math.round(charsPerMs * elapsedMs)));

	// Finish the word in progress so a half-word never flashes.
	if (next < total && !isBreakChar(text.charCodeAt(next - 1))) {
		const limit = Math.min(total, next + WORD_SNAP_LOOKAHEAD);
		while (next < limit && !isBreakChar(text.charCodeAt(next))) next += 1;
	}
	// Never split a surrogate pair (emoji).
	if (next < total && isHighSurrogate(text.charCodeAt(next - 1))) next += 1;
	return next;
}

/** Fold a newly observed chunk gap into the reveal window (EMA, clamped). */
export function nextRevealWindow(previousWindowMs: number, chunkGapMs: number): number {
	const gap = Math.min(REVEAL_WINDOW_MAX_MS, Math.max(REVEAL_WINDOW_MIN_MS, chunkGapMs));
	return previousWindowMs * 0.7 + gap * 0.3;
}
