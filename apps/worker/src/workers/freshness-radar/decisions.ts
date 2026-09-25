// apps/worker/src/workers/freshness-radar/decisions.ts
//
// Recorded decisions as news (tasker 106). Capture keeps a `Decisions` section
// in the project's START HERE doc, one bullet per decision, each ending in a
// code-owned `_(YYYY-MM-DD)_` stamp (start-here.ts normalizeStartHereDateStamps).
// A record last changed before a decision may now contradict it, even when no
// recent chat mentions it: the AI Pillar working doc kept "Name of the move —
// not settled" for days after the decision was recorded.
//
// Only structure is parsed here (a markdown section, its bullets, a date stamp
// in a fixed format). What a decision means is left to Jev.

import {
	readStartHereAuthoredSections,
	splitStartHereSectionBlocks
} from '@buildos/shared-agent-ops/ontology/start-here';

export type RecordedDecision = {
	/** Stable within one scan: d1 is the newest. */
	id: string;
	text: string;
	/** Civil date from the stamp, or null for an unstamped (legacy) decision. */
	recorded: string | null;
};

// The code-owned stamp, as written by restampBlock: " _(2026-09-23)_".
const DECISION_STAMP = /[ \t]*[_*]\(\s*(\d{4}-\d{2}-\d{2})\s*\)[_*][ \t]*$/;

function clip(value: string, max: number): string {
	const text = value.replace(/\s+/g, ' ').trim();
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Decisions from a START HERE body, newest first (stamped before unstamped,
 * document order breaking ties), capped at `max`.
 */
export function recordedDecisionsFromStartHere(
	content: string | null | undefined,
	options: { max: number; textChars: number }
): RecordedDecision[] {
	if (!content) return [];
	const body = readStartHereAuthoredSections(content).Decisions;
	if (!body) return [];
	const parsed = splitStartHereSectionBlocks(body)
		.map((block, order) => {
			const trimmed = block.trim();
			if (!/^[-*+]\s+/.test(trimmed)) return null; // bullets only
			const lines = trimmed.split('\n');
			const last = lines.length - 1;
			const stamp = DECISION_STAMP.exec(lines[last] ?? '');
			if (stamp) lines[last] = (lines[last] ?? '').replace(DECISION_STAMP, '');
			const text = lines
				.join(' ')
				.replace(/^[-*+]\s+/, '')
				.trim();
			if (!text) return null;
			return { order, text, recorded: stamp?.[1] ?? null };
		})
		.filter((entry): entry is { order: number; text: string; recorded: string | null } =>
			Boolean(entry)
		);
	return parsed
		.sort((a, b) => {
			if (a.recorded && b.recorded && a.recorded !== b.recorded)
				return b.recorded.localeCompare(a.recorded);
			if (a.recorded && !b.recorded) return -1;
			if (!a.recorded && b.recorded) return 1;
			return b.order - a.order; // later in the section = newer
		})
		.slice(0, options.max)
		.map((entry, index) => ({
			id: `d${index + 1}`,
			text: clip(entry.text, options.textChars),
			recorded: entry.recorded
		}));
}

/**
 * Decisions recorded on or after the record's last change (civil dates; a
 * same-day decision may postdate the edit, so it counts). Unstamped decisions
 * are never "newer" than anything.
 */
export function decisionsSince(
	decisions: readonly RecordedDecision[],
	changedCivil: string | null
): RecordedDecision[] {
	if (!changedCivil) return decisions.filter((decision) => decision.recorded !== null);
	return decisions.filter(
		(decision) => decision.recorded !== null && decision.recorded >= changedCivil
	);
}
