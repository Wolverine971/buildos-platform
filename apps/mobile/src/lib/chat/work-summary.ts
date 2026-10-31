// apps/mobile/src/lib/chat/work-summary.ts
// The words on a work row, matching the website's thinking block: one live status line while
// the agent works, then "Worked for 54s · 12 steps" folded up when it is done.
import { WORKER_STOPPING_STATUS } from '@buildos/agentic-chat-client';

import type { WorkRow } from './session-store';

export function formatSeconds(ms: number): string {
	const total = Math.max(0, Math.round(ms / 1000));
	if (total < 60) return `${total}s`;
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function withEllipsis(text: string): string {
	const trimmed = text.trim().replace(/[.…]+$/, '');
	return trimmed ? `${trimmed}…` : '';
}

/** The headline: the live status while active, the verdict once finished. */
export function workHeadline(row: WorkRow): string {
	if (row.status === 'active') {
		if (row.stopRequested) return WORKER_STOPPING_STATUS;
		if (row.connectionLost) return 'Reconnecting…';
		if (row.waiting) return 'Waiting on your direction';
		for (let index = row.steps.length - 1; index >= 0; index -= 1) {
			const step = row.steps[index]!;
			if (step.status === 'pending') return withEllipsis(step.verb);
		}
		return (row.activity && withEllipsis(row.activity)) || 'Thinking…';
	}
	if (row.status === 'error') return 'Hit an issue';
	if (row.status === 'cancelled') return 'Stopped';
	const duration = row.endedAt !== null ? formatSeconds(row.endedAt - row.startedAt) : null;
	if (row.steps.length > 0) return duration ? `Worked for ${duration}` : 'Work log';
	return duration ? `Thought for ${duration}` : 'Done';
}

/** The aside after the headline: elapsed time while active (after 2 s), the step count after. */
export function workAside(row: WorkRow, now: number): string | null {
	if (row.status === 'active') {
		const elapsed = now - row.startedAt;
		return elapsed >= 2000 ? formatSeconds(elapsed) : null;
	}
	const count = row.steps.length;
	return count > 0 ? `${count} ${count === 1 ? 'step' : 'steps'}` : null;
}
