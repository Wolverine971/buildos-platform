// apps/web/src/lib/components/projects/desktop/desktop-context.ts
//
// ProjectDesktop computes every tile's look once (pulse color, bar lengths, task
// mix); tiles anywhere under it (desktop, dock, card, Move list) read it here
// instead of having it threaded through each component.
import { getContext, setContext } from 'svelte';
import type { TileLook } from './desktop-signals';

const KEY = Symbol('projects-desktop-looks');
type LookUp = (projectId: string) => TileLook | undefined;

export function setDesktopLooks(lookUp: LookUp): void {
	setContext(KEY, lookUp);
}

export function getDesktopLook(): LookUp {
	return getContext<LookUp | undefined>(KEY) ?? (() => undefined);
}
