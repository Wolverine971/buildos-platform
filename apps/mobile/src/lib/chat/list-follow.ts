// apps/mobile/src/lib/chat/list-follow.ts
// When the chat list should keep following new text, and when to offer "jump to latest".

/** How far from the newest row (in points) still counts as "at the bottom". */
export const FOLLOW_THRESHOLD = 80;
/** Show the jump key once the person has scrolled this far back. */
export const JUMP_THRESHOLD = 240;

/** The list is inverted, so `offset` is the distance scrolled away from the newest row. */
export function isNearLatest(offset: number, threshold: number = FOLLOW_THRESHOLD): boolean {
	return offset <= threshold;
}

export function showJumpToLatest(offset: number, threshold: number = JUMP_THRESHOLD): boolean {
	return offset > threshold;
}
