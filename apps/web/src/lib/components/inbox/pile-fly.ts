// apps/web/src/lib/components/inbox/pile-fly.ts
//
// The "it's off your list" moment (tasker 149): a small chip with the answer's title lifts off
// the card and drops into the Cleared pile in the bottom-right corner. Decoration only; skipped
// for reduced motion or when the source is gone.

import { glowLanded } from '$lib/components/agent/phrase-flight';

export const CLEARED_PILE_ANCHOR_ID = 'inbox-cleared-pile-anchor';
/** On the inbox's project tab, so an answer can land on its project first (tasker 156). */
export const PROJECT_TAB_ATTRIBUTE = 'data-inbox-project-tab';

const FLY_MS = 480;
const TO_PROJECT_MS = 420;
const REST_MS = 160;

function projectTab(projectId: string | null | undefined): Element | null {
	if (!projectId) return null;
	for (const tab of document.querySelectorAll(`[${PROJECT_TAB_ATTRIBUTE}]`)) {
		if (tab.getAttribute(PROJECT_TAB_ATTRIBUTE) !== projectId) continue;
		const rect = tab.getBoundingClientRect();
		const visible =
			rect.width > 0 &&
			rect.height > 0 &&
			rect.bottom > 0 &&
			rect.right > 0 &&
			rect.top < window.innerHeight &&
			rect.left < window.innerWidth;
		if (visible) return tab;
	}
	return null;
}

/**
 * Flies a chip with the answer's title from the card to the Cleared pile. With `projectId`,
 * and that project's tab on screen, it lands on the tab first (the tab glows: this is where
 * the change went) and then drops into the pile.
 */
export function flyToPile(
	from: Element | null | undefined,
	text: string,
	projectId?: string | null
): void {
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
		const origin = ghost.getBoundingClientRect();
		const done = () => ghost.remove();
		const toPile = (fromX: number, fromY: number, fromScale: number) => {
			const anchor = document.getElementById(CLEARED_PILE_ANCHOR_ID)?.getBoundingClientRect();
			const dx = (anchor ? anchor.left + 12 : window.innerWidth - 72) - origin.left;
			const dy = (anchor ? anchor.top + 8 : window.innerHeight - 72) - origin.top;
			const animation = ghost.animate(
				[
					{
						transform: `translate(${fromX}px, ${fromY}px) scale(${fromScale})`,
						opacity: 1
					},
					{
						transform: `translate(${fromX + (dx - fromX) * 0.35}px, ${fromY + (dy - fromY) * 0.1 - 24}px) scale(${fromScale * 0.85})`,
						opacity: 1,
						offset: 0.3
					},
					{ transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0.1 }
				],
				{ duration: FLY_MS, easing: 'cubic-bezier(0.55, 0, 0.7, 0.35)', fill: 'forwards' }
			);
			animation.onfinish = done;
			animation.oncancel = done;
		};

		const tab = projectTab(projectId);
		if (!tab) {
			toPile(0, 0, 1);
			return;
		}
		const target = tab.getBoundingClientRect();
		const tx = target.left + 8 - origin.left;
		const ty = target.top + target.height / 2 - origin.height / 2 - origin.top;
		ghost.style.transformOrigin = 'left center';
		const first = ghost.animate(
			[
				{ transform: 'translate(0, 0) scale(1)', opacity: 1 },
				{ transform: `translate(${tx}px, ${ty}px) scale(0.6)`, opacity: 1 }
			],
			{ duration: TO_PROJECT_MS, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'forwards' }
		);
		first.oncancel = done;
		first.onfinish = () => {
			glowLanded(tab);
			window.setTimeout(() => toPile(tx, ty, 0.6), REST_MS);
		};
	});
}
