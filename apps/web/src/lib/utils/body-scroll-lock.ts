// apps/web/src/lib/utils/body-scroll-lock.ts
let lockCount = 0;
let lockedScrollY = 0;

export const lockBodyScroll = (): void => {
	if (typeof document === 'undefined') return;

	if (lockCount === 0) {
		lockedScrollY = window.scrollY;
		document.body.style.position = 'fixed';
		document.body.style.top = `-${lockedScrollY}px`;
		document.body.style.width = '100%';
		document.body.style.overflow = 'hidden';
	}

	lockCount += 1;
};

export const unlockBodyScroll = (): void => {
	if (typeof document === 'undefined') return;
	if (lockCount === 0) return;

	lockCount = Math.max(0, lockCount - 1);

	if (lockCount === 0) {
		document.body.style.position = '';
		document.body.style.top = '';
		document.body.style.width = '';
		document.body.style.overflow = '';
		window.scrollTo(0, lockedScrollY);
	}
};
