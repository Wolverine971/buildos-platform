// apps/web/src/lib/components/projects/desktop/reader-task-hold.svelte.ts
//
// A task whose state changes while it is open in the reader stays in the list group
// it was in (checked off, or back open) so the row doesn't jump out from under you.
// The host releases the hold when the reader closes or moves off tasks; then the
// row slides to where its state belongs.
import { SvelteMap } from 'svelte/reactivity';
import { groupOf, type TaskGroupKey } from './reader-task-groups';

export class TaskHold {
	readonly held = new SvelteMap<string, TaskGroupKey>();

	/** The reader changed a task's state from `previous`: keep it where it was. */
	change(id: string, previous: string) {
		if (!this.held.has(id)) this.held.set(id, groupOf({ state_key: previous }));
	}

	release() {
		if (this.held.size) this.held.clear();
	}
}
