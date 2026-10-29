// apps/mobile/src/components/reader/task-state.ts
// Task states in the reader: labels, and the colors the website uses for them. Pure, so it can
// be tested without React Native.
import type { ProjectTask } from '@buildos/api-client';

import { bucketOf } from '@/lib/task-buckets';
import type { ThemeColors } from '@/theme';

export type TaskStateKey = 'todo' | 'in_progress' | 'blocked' | 'done';

export const TASK_STATES: ReadonlyArray<{ key: TaskStateKey; label: string }> = [
	{ key: 'todo', label: 'To do' },
	{ key: 'in_progress', label: 'In progress' },
	{ key: 'blocked', label: 'Blocked' },
	{ key: 'done', label: 'Done' }
];

export function isTaskStateKey(value: string): value is TaskStateKey {
	return TASK_STATES.some((state) => state.key === value);
}

/** "In progress" for a known state; any other state key is shown as written, spaced. */
export function taskStateLabel(stateKey: string): string {
	const known = TASK_STATES.find((state) => state.key === stateKey);
	if (known) return known.label;
	const spaced = stateKey.split('_').join(' ').trim();
	return spaced ? spaced[0]!.toUpperCase() + spaced.slice(1) : 'To do';
}

/** The state pill's text color, as on the website (`.state-*` in DesktopReader.svelte). */
export function stateTone(stateKey: string): keyof ThemeColors {
	if (stateKey === 'done' || stateKey === 'in_progress') return 'success';
	if (stateKey === 'blocked') return 'destructive';
	return 'foreground';
}

type GlyphTask = Pick<ProjectTask, 'id' | 'state_key' | 'due_at' | 'start_at'>;

/** The glyph color: the project list's bucket colors (overdue, in progress, scheduled). */
export function glyphTone(task: GlyphTask, asOf: Date): keyof ThemeColors {
	switch (bucketOf(task, asOf)) {
		case 'overdue':
			return 'destructive';
		case 'in_progress':
			return 'success';
		case 'scheduled':
			return 'info';
		default:
			return 'mutedForeground';
	}
}
