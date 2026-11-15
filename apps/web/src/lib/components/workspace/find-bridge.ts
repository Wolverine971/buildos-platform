// apps/web/src/lib/components/workspace/find-bridge.ts
//
// ⌘K and the /projects page (tasker 159). While /projects is mounted it registers how to open
// a result in place (its desktop card and reader) and how to focus its own always-visible
// search box. ⌘K uses those when present; anywhere else it opens the palette and navigates
// to /projects?open=kind:id.
import type { FindItem } from './find-model';

type Opener = (item: FindItem) => boolean;
type Focuser = () => boolean;

let opener: Opener | null = null;
let focuser: Focuser | null = null;

export function registerFindHost(host: { open: Opener; focus: Focuser }): () => void {
	opener = host.open;
	focuser = host.focus;
	return () => {
		if (opener === host.open) opener = null;
		if (focuser === host.focus) focuser = null;
	};
}

/** Open a result where the person already is. False: navigate instead. */
export function openFoundInPlace(item: FindItem): boolean {
	return opener ? opener(item) : false;
}

/** Focus the page's own search box. False: open the palette instead. */
export function focusPageSearch(): boolean {
	return focuser ? focuser() : false;
}

// ---------- The palette itself (root layout) ----------

let paletteOpener: (() => void) | null = null;

export function registerFindPalette(open: () => void): () => void {
	paletteOpener = open;
	return () => {
		if (paletteOpener === open) paletteOpener = null;
	};
}

/** The nav's search button and ⌘K: the page's own box when it has one, else the palette. */
export function requestFind(): void {
	if (focusPageSearch()) return;
	paletteOpener?.();
}
