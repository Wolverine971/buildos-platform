// apps/web/src/lib/components/knowledge/research-dock-flag.svelte.ts
//
// Whether the app-wide research dock should load (tasker 160 follow-up). The root layout reads
// this tiny module so it never pulls the knowledge client into every page: the dock loads only
// after research starts somewhere in this tab (a task card, /knowledge), or on a fresh page load
// within 30 minutes of research having been live, so a reload mid-research still gets its ping.

const LIVE_KEY = 'buildos:knowledge-research-live-at';
const RECENT_MS = 30 * 60_000;

export const researchDock = $state({ wanted: false });

/** Research just started (or is running): load the dock and remember it across reloads. */
export function wantResearchDock(now = Date.now()): void {
	researchDock.wanted = true;
	try {
		localStorage.setItem(LIVE_KEY, String(now));
	} catch {
		// private mode: this tab still gets the dock
	}
}

/** Research went quiet: a reload no longer needs to look. */
export function forgetResearchDock(): void {
	try {
		localStorage.removeItem(LIVE_KEY);
	} catch {
		// nothing stored
	}
}

/** Research was live in this browser recently (checked once at startup). */
export function researchWasRecentlyLive(now = Date.now()): boolean {
	try {
		const at = Number(localStorage.getItem(LIVE_KEY) ?? 0);
		return at > 0 && now - at < RECENT_MS;
	} catch {
		return false;
	}
}
