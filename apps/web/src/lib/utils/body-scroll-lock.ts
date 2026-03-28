// apps/web/src/lib/utils/body-scroll-lock.ts
//
// Uses position:fixed on body to prevent background scrolling when modals are open.
// On iOS, position:fixed on body conflicts with the virtual keyboard — iOS Safari
// can't properly reposition the viewport to keep the focused input visible.
// To fix this, we listen for focus/blur on inputs and temporarily switch to
// overflow:hidden (which allows iOS to handle the keyboard normally) while an
// input is focused.
let lockCount = 0;
let lockedScrollY = 0;
let inputFocused = false;

function isInputElement(el: EventTarget | null): boolean {
	return (
		el instanceof HTMLInputElement ||
		el instanceof HTMLTextAreaElement ||
		(el instanceof HTMLElement && el.isContentEditable)
	);
}

function handleFocusIn(e: FocusEvent) {
	if (!isInputElement(e.target) || lockCount === 0) return;
	inputFocused = true;
	// Switch from position:fixed to overflow:hidden so iOS keyboard
	// can properly adjust the viewport
	document.body.style.position = '';
	document.body.style.top = '';
	document.body.style.width = '';
	document.body.style.overflow = 'hidden';
	document.documentElement.style.overflow = 'hidden';
}

function handleFocusOut(e: FocusEvent) {
	if (!inputFocused || lockCount === 0) return;
	// Check if focus is moving to another input (don't re-lock in that case)
	// Use setTimeout to let the new focusin fire first
	setTimeout(() => {
		if (document.activeElement && isInputElement(document.activeElement)) return;
		inputFocused = false;
		if (lockCount > 0) {
			// Restore position:fixed scroll lock
			document.documentElement.style.overflow = '';
			document.body.style.position = 'fixed';
			document.body.style.top = `-${lockedScrollY}px`;
			document.body.style.width = '100%';
			document.body.style.overflow = 'hidden';
		}
	}, 0);
}

export const lockBodyScroll = (): void => {
	if (typeof document === 'undefined') return;

	if (lockCount === 0) {
		lockedScrollY = window.scrollY;
		document.body.style.position = 'fixed';
		document.body.style.top = `-${lockedScrollY}px`;
		document.body.style.width = '100%';
		document.body.style.overflow = 'hidden';

		// Listen for input focus to handle iOS keyboard
		document.addEventListener('focusin', handleFocusIn, true);
		document.addEventListener('focusout', handleFocusOut, true);
	}

	lockCount += 1;
};

export const unlockBodyScroll = (): void => {
	if (typeof document === 'undefined') return;
	if (lockCount === 0) return;

	lockCount = Math.max(0, lockCount - 1);

	if (lockCount === 0) {
		inputFocused = false;
		document.body.style.position = '';
		document.body.style.top = '';
		document.body.style.width = '';
		document.body.style.overflow = '';
		document.documentElement.style.overflow = '';
		window.scrollTo(0, lockedScrollY);

		document.removeEventListener('focusin', handleFocusIn, true);
		document.removeEventListener('focusout', handleFocusOut, true);
	}
};
