// apps/web/src/lib/components/agent/phrase-flight.ts
//
// Watch it sort, in chat (tasker 155): the words a change came from lift out of the user's
// message and fly to the step row that saved them, then the row glows. Same arc as the homepage
// demo (BrainDumpDemo `flight`). Decoration only: skipped for reduced motion, when either end is
// off screen, or when the browser has no Web Animations.

const FLIGHT_MS = 820;
const GLOW_MS = 1500;

export type FlightTone = 'created' | 'updated' | 'archived' | 'deleted' | 'moved' | 'linked';

const TONE_CLASS: Record<FlightTone, string> = {
	created: 'border-info/50 bg-info/15',
	updated: 'border-accent/50 bg-accent/15',
	archived: 'border-border bg-muted',
	deleted: 'border-border bg-muted',
	moved: 'border-accent/50 bg-accent/15',
	linked: 'border-accent/50 bg-accent/15'
};

function reducedMotion(): boolean {
	return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

function onScreen(rect: DOMRect): boolean {
	return (
		rect.width > 0 &&
		rect.height > 0 &&
		rect.bottom > 0 &&
		rect.right > 0 &&
		rect.top < window.innerHeight &&
		rect.left < window.innerWidth
	);
}

/** A short accent glow on the row the phrase landed on. */
export function glowLanded(target: Element | null | undefined): void {
	if (!target || typeof (target as HTMLElement).animate !== 'function') return;
	if (typeof window !== 'undefined' && reducedMotion()) return;
	(target as HTMLElement).animate(
		[
			{ backgroundColor: 'hsl(var(--accent) / 0.22)', borderRadius: '0.3rem' },
			{ backgroundColor: 'hsl(var(--accent) / 0)', borderRadius: '0.3rem' }
		],
		{ duration: GLOW_MS, easing: 'ease-out' }
	);
}

/** Flies `text` from the source phrase to the target row. Resolves when it lands (or is skipped). */
export function flyPhrase(
	source: Element | null | undefined,
	target: Element | null | undefined,
	options: { text: string; label: string; tone: FlightTone }
): Promise<void> {
	if (!target || typeof window === 'undefined' || typeof document === 'undefined') {
		return Promise.resolve();
	}
	// The phrase isn't on the page (its message scrolled out of the loaded window): the row
	// that saved it still glows.
	if (!source) {
		glowLanded(target);
		return Promise.resolve();
	}
	const from = source.getClientRects()[0] ?? source.getBoundingClientRect();
	const to = target.getBoundingClientRect();
	if (reducedMotion() || !onScreen(from) || !onScreen(to)) {
		glowLanded(target);
		return Promise.resolve();
	}

	const ghost = document.createElement('div');
	ghost.setAttribute('aria-hidden', 'true');
	ghost.className = `modal-root pointer-events-none fixed z-[10003] flex max-w-[18rem] items-baseline gap-1.5 truncate rounded-md border px-2 py-0.5 text-xs text-foreground shadow-ink-strong ${TONE_CLASS[options.tone]}`;
	const label = document.createElement('span');
	label.className = 'shrink-0 text-[0.58rem] font-bold uppercase text-muted-foreground';
	label.textContent = options.label;
	const words = document.createElement('span');
	words.className = 'truncate';
	words.textContent = options.text;
	ghost.append(label, words);
	Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px` });
	document.body.appendChild(ghost);
	if (typeof ghost.animate !== 'function') {
		ghost.remove();
		glowLanded(target);
		return Promise.resolve();
	}

	const origin = ghost.getBoundingClientRect();
	const dx = to.left + 14 - origin.left;
	const dy = to.top + Math.min(to.height, 22) / 2 - (origin.top + origin.height / 2);
	const lift = Math.min(90, Math.abs(dx) * 0.15 + 30);
	const scale = 0.9;
	const animation = ghost.animate(
		[
			{ transform: 'translate(0px, 0px) scale(1)', opacity: 1, offset: 0 },
			{ transform: 'translate(0px, -6px) scale(1.06)', opacity: 1, offset: 0.12 },
			{
				transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(${(1 + scale) / 2})`,
				opacity: 1,
				offset: 0.55
			},
			{ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 1, offset: 0.88 },
			{ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0, offset: 1 }
		],
		{ duration: FLIGHT_MS, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' }
	);
	return new Promise((resolve) => {
		const done = () => {
			ghost.remove();
			glowLanded(target);
			resolve();
		};
		animation.onfinish = done;
		animation.oncancel = () => {
			ghost.remove();
			resolve();
		};
	});
}
