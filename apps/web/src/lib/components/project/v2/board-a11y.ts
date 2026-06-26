// apps/web/src/lib/components/project/v2/board-a11y.ts
//
// Shared a11y + motion helpers for the v2 project-page board components.
// Extracted so the Hyperplexed-audit fixes (S3 keyboard operability, S5
// reduced-motion) live as single conventions instead of being re-implemented
// per component.

import { prefersReducedMotion } from 'svelte/motion';

/**
 * WAI-ARIA roving-tabindex keyboard handler for a horizontal tablist.
 *
 * Mirrors the pattern in `$lib/components/ui/TabNav.svelte`: Left/Up and
 * Right/Down move (and wrap) between tabs, Home/End jump to the ends. The
 * caller owns selection + focus so this works regardless of how the tab
 * buttons are stored (array bindings, IDs, etc.).
 *
 * @param event        the keydown event from a tab button
 * @param currentIndex index of the tab the event fired on
 * @param count        total number of tabs
 * @param select       called with the target index to activate it
 * @param focusButton  called with the target index to move DOM focus to it
 */
export function handleRovingTabKeydown(
	event: KeyboardEvent,
	currentIndex: number,
	count: number,
	select: (index: number) => void,
	focusButton: (index: number) => void
): void {
	if (count === 0) return;

	let target: number | null = null;
	switch (event.key) {
		case 'ArrowLeft':
		case 'ArrowUp':
			target = (currentIndex - 1 + count) % count;
			break;
		case 'ArrowRight':
		case 'ArrowDown':
			target = (currentIndex + 1) % count;
			break;
		case 'Home':
			target = 0;
			break;
		case 'End':
			target = count - 1;
			break;
		default:
			return;
	}

	event.preventDefault();
	select(target);
	focusButton(target);
}

/**
 * Reduced-motion-aware params for `transition:slide`.
 *
 * Svelte transitions read their params when the transition starts, so calling
 * this inline (`transition:slide={slideMotion()}`) picks up the live
 * `prefers-reduced-motion` value at intro/outro time and collapses to a
 * zero-duration (instant) slide for users who opted out.
 */
export function slideMotion(duration = 140): { duration: number } {
	return { duration: prefersReducedMotion.current ? 0 : duration };
}

/**
 * Reduced-motion-aware params for `transition:fade`. Same idea as
 * {@link slideMotion} — collapses to an instant fade when the user opted out.
 */
export function fadeMotion(duration = 150): { duration: number } {
	return { duration: prefersReducedMotion.current ? 0 : duration };
}
