// apps/mobile/src/lib/keyboard-lift.ts
//
// How far a bar near the bottom of the screen must rise to sit on the iOS keyboard. The
// keyboard's top (`endCoordinates.screenY`) is in window coordinates. Pure, so vitest can
// load it; hooks/use-keyboard-inset.ts does the listening.

/**
 * A bar measured with `measureInWindow`. It may already be drawn lifted, so its resting
 * bottom is lower by that lift. Only valid where `measureInWindow` is window-relative: the
 * tab screens. Inside a native modal (the reader's form sheet) it is measured from the
 * sheet's top instead, and comes out short by the sheet's offset.
 */
export function measuredBarOverlap(
	measuredBottom: number,
	drawnLift: number,
	keyboardTop: number
): number {
	return Math.max(0, measuredBottom + drawnLift - keyboardTop);
}

/**
 * A bar resting on the screen's bottom edge, like the reader's bar in a full-height sheet:
 * the keyboard covers exactly the part of the window below its top. No measuring needed.
 */
export function screenBottomOverlap(windowHeight: number, keyboardTop: number): number {
	return Math.max(0, windowHeight - keyboardTop);
}
