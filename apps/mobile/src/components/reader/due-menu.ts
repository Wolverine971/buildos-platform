// apps/mobile/src/components/reader/due-menu.ts
import { civilDay, duePicks, endOfDay } from '@/lib/due-date';

/** One row of the due-date menu. `value` is what to send as `due_at`. */
export type DueChoice =
	| {
			kind: 'set';
			key: 'today' | 'tomorrow' | 'weekend' | 'next_week';
			label: string;
			/** The civil day (`YYYY-MM-DD`) this pick lands on. */
			day: string;
			value: string;
	  }
	| { kind: 'pick'; label: string }
	| { kind: 'clear'; label: string };

/**
 * Saturday of this week, offered Monday to Thursday only: on Friday Saturday is already
 * Tomorrow, and over the weekend it would mean a week away.
 */
export function weekendChoice(now: Date): DueChoice | null {
	const day = now.getDay(); // 0 Sunday … 6 Saturday
	if (day < 1 || day > 4) return null;
	const saturday = new Date(now);
	saturday.setDate(saturday.getDate() + (6 - day));
	return {
		kind: 'set',
		key: 'weekend',
		label: 'This weekend',
		day: civilDay(saturday),
		value: endOfDay(saturday)
	};
}

/** Today, Tomorrow, This weekend, Next week, Pick a date…, and Clear when a date is set. */
export function dueChoices(now: Date, hasDue: boolean): DueChoice[] {
	const out: DueChoice[] = [];
	for (const pick of duePicks(now)) {
		if (pick.key === 'next_week') {
			const weekend = weekendChoice(now);
			if (weekend) out.push(weekend);
		}
		out.push({ kind: 'set', key: pick.key, label: pick.label, day: pick.day, value: pick.value });
	}
	out.push({ kind: 'pick', label: 'Pick a date…' });
	if (hasDue) out.push({ kind: 'clear', label: 'Clear' });
	return out;
}
