// apps/web/src/lib/services/admin/model-incidents/overview.ts
//
// What is going on across a window of incidents, in plain language plus the
// counts behind it: which failures repeat, which providers they land on, which
// jobs they hit, and how stalled calls ended when left running. Built from
// structured fields only.
import { incidentHeadline, incidentSource, seconds } from './story';
import type { IncidentJson, ModelIncidentRow } from './types';

export type IncidentTally = { key: string; label: string; count: number };

export type IncidentOverview = {
	total: number;
	stalls: number;
	errors: number;
	/** Stalled calls left running that finished on their own. */
	finishedLate: number;
	/** Median total time of those late finishes. */
	finishedLateMedianMs: number | null;
	/** Stalled calls left running that never finished inside the limit. */
	neverFinished: number;
	sentences: string[];
	byReason: IncidentTally[];
	byProvider: IncidentTally[];
	bySource: IncidentTally[];
	byDay: Array<{ day: string; stalls: number; errors: number }>;
};

const record = (value: unknown): IncidentJson =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as IncidentJson) : {};

function tally(
	rows: ModelIncidentRow[],
	key: (row: ModelIncidentRow) => string,
	label: (row: ModelIncidentRow) => string
): IncidentTally[] {
	const counts = new Map<string, IncidentTally>();
	for (const row of rows) {
		const id = key(row);
		const entry = counts.get(id) ?? { key: id, label: label(row), count: 0 };
		entry.count += 1;
		counts.set(id, entry);
	}
	return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function median(values: number[]): number | null {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const share = (count: number, total: number) => `${count} of ${total}`;

/**
 * Every UTC day the window touches, oldest first, so empty days still show. The
 * window starts mid-day `days` ago, so it spans `days + 1` calendar days.
 */
function dayAxis(days: number, now: Date): string[] {
	const axis: string[] = [];
	for (let offset = days; offset >= 0; offset -= 1) {
		axis.push(new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10));
	}
	return axis;
}

export function summarizeIncidents(
	rows: ModelIncidentRow[],
	window: { days: number; now?: Date }
): IncidentOverview {
	const now = window.now ?? new Date();
	const stalls = rows.filter((row) => row.kind === 'stall').length;
	const errors = rows.length - stalls;
	const late = rows.filter((row) => {
		const eventual = record(row.eventual);
		return eventual.completed === true && typeof eventual.total_ms === 'number';
	});
	const lateTimes = late.map((row) => record(row.eventual).total_ms as number);
	const neverFinished = rows.filter((row) => record(row.eventual).ended_by === 'deadline').length;
	const byReason = tally(
		rows,
		(row) => row.reason,
		(row) => incidentHeadline(row)
	);
	const byProvider = tally(
		rows,
		(row) => row.provider ?? '',
		(row) => row.provider ?? 'No provider (failed before a response)'
	);
	const bySource = tally(rows, incidentSource, incidentSource);

	const counts = new Map<string, { stalls: number; errors: number }>();
	for (const row of rows) {
		const day = row.created_at.slice(0, 10);
		const entry = counts.get(day) ?? { stalls: 0, errors: 0 };
		if (row.kind === 'stall') entry.stalls += 1;
		else entry.errors += 1;
		counts.set(day, entry);
	}
	const byDay = dayAxis(window.days, now).map((day) => ({
		day,
		...(counts.get(day) ?? { stalls: 0, errors: 0 })
	}));

	const sentences: string[] = [];
	const span = window.days === 1 ? 'In the last day' : `In the last ${window.days} days`;
	if (!rows.length) {
		sentences.push(`${span}, no model call stalled or failed.`);
	} else {
		sentences.push(
			`${span}, ${rows.length === 1 ? '1 model call' : `${rows.length} model calls`} stalled or failed: ${stalls} ${stalls === 1 ? 'stall' : 'stalls'} and ${errors} ${errors === 1 ? 'error' : 'errors'}.`
		);
		const topReason = byReason[0]!;
		if (topReason.count > 1) {
			sentences.push(
				`The most common was “${topReason.label}” (${share(topReason.count, rows.length)}).`
			);
		}
		const topProvider = byProvider[0]!;
		if (topProvider.key && topProvider.count > 1 && topProvider.count / rows.length >= 0.4) {
			sentences.push(
				`${topProvider.label} served ${share(topProvider.count, rows.length)}, so look there first.`
			);
		}
		const topSource = bySource[0]!;
		if (bySource.length > 1 && topSource.count / rows.length >= 0.5) {
			sentences.push(`Most hit ${topSource.label} (${share(topSource.count, rows.length)}).`);
		}
		if (late.length) {
			sentences.push(
				`${late.length === 1 ? '1 stalled call' : `${late.length} stalled calls`} finished on ${late.length === 1 ? 'its' : 'their'} own when left running (median ${seconds(median(lateTimes))}): slow, not dead.`
			);
		}
		if (neverFinished) {
			sentences.push(
				`${neverFinished === 1 ? '1 call' : `${neverFinished} calls`} never finished even with 2 minutes.`
			);
		}
		const rateLimited = rows.filter((row) => row.http_status === 429).length;
		if (rateLimited) {
			sentences.push(
				`${rateLimited === 1 ? '1 was' : `${rateLimited} were`} rate limited (HTTP 429).`
			);
		}
	}

	return {
		total: rows.length,
		stalls,
		errors,
		finishedLate: late.length,
		finishedLateMedianMs: median(lateTimes),
		neverFinished,
		sentences,
		byReason,
		byProvider,
		bySource,
		byDay
	};
}
