// apps/web/src/lib/components/inbox/pile-fly.ts
//
// The "it's off your list" moment (tasker 149): a small chip with the answer's title lifts off
// the card and drops into the Cleared pile in the bottom-right corner. Decoration only; skipped
// for reduced motion or when the source is gone.

export const CLEARED_PILE_ANCHOR_ID = 'inbox-cleared-pile-anchor';

const FLY_MS = 480;

export function flyToPile(from: Element | null | undefined, text: string): void {
	if (!from || typeof window === 'undefined' || typeof document === 'undefined') return;
	if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
	const start = from.getBoundingClientRect();
	if (!start.width || !start.height) return;

	const ghost = document.createElement('div');
	ghost.setAttribute('aria-hidden', 'true');
	ghost.className =
		'modal-root pointer-events-none fixed z-[10003] truncate rounded-md border border-success/40 bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-ink-strong';
	ghost.textContent = text;
	const width = Math.min(start.width, 320);
	Object.assign(ghost.style, {
		left: `${start.left}px`,
		top: `${start.top + Math.max(0, start.height / 2 - 18)}px`,
		width: `${width}px`
	});
	document.body.appendChild(ghost);

	// The pile may mount this frame (first answer), so aim after it lays out.
	requestAnimationFrame(() => {
		if (typeof ghost.animate !== 'function') {
			ghost.remove();
			return;
		}
		const anchor = document.getElementById(CLEARED_PILE_ANCHOR_ID)?.getBoundingClientRect();
		const endX = anchor ? anchor.left + 12 : window.innerWidth - 72;
		const endY = anchor ? anchor.top + 8 : window.innerHeight - 72;
		const origin = ghost.getBoundingClientRect();
		const dx = endX - origin.left;
		const dy = endY - origin.top;
		const animation = ghost.animate(
			[
				{ transform: 'translate(0, 0) scale(1)', opacity: 1 },
				{
					transform: `translate(${dx * 0.35}px, ${dy * 0.1 - 24}px) scale(0.85)`,
					opacity: 1,
					offset: 0.3
				},
				{ transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0.1 }
			],
			{ duration: FLY_MS, easing: 'cubic-bezier(0.55, 0, 0.7, 0.35)', fill: 'forwards' }
		);
		const done = () => ghost.remove();
		animation.onfinish = done;
		animation.oncancel = done;
	});
}
