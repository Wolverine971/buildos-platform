// apps/web/src/lib/server/thread-chat/thread-chat-carry.ts
//
// Carry a turn's context forward (tasker 151). Each project thread ends its turn with a
// small working set:
//   carry:   the records and document sections the turn used. The next turn on this project
//            starts with their text already loaded, so it doesn't read them again.
//   scanned: everything else it looked at. The next turn sees these as a short note and can
//            read any of them.
// The working set holds pointers (ids, section anchors, the record version), never text.
// The next turn loads the text again as the signed-in person, and only when the record hasn't
// changed. Ids are checked against that turn's project index, so a forged id loads nothing.
//
// What counts as "used" comes from structured fields only: the thread's keep line
// ({"op":"keep",...}) when it writes one, otherwise the refs its decision lines cite.
//
// The working set itself lives in `@buildos/agentic-chat-runtime/working-set` (tasker 153), so
// real chat uses the same code. What stays here is the lab's own line formats.
//
// Pure: no I/O. The thread runs the reads.
export * from '@buildos/agentic-chat-runtime/working-set';

export type KeepLine = { items: { ref: string; sections: string[] }[] };

// ---------------------------------------------------------------------------
// The keep line
// ---------------------------------------------------------------------------

/**
 * {"op":"keep","items":[{"ref":"d1","sections":["Group 1"]},{"ref":"p0"}]}
 * The thread's own call on what the next message about this project will need.
 */
export function readKeepLine(line: string): KeepLine | null {
	const trimmed = line.trim().replace(/,$/, '');
	if (!trimmed.startsWith('{') || !trimmed.includes('"keep"')) return null;
	let raw: Record<string, unknown>;
	try {
		raw = JSON.parse(trimmed) as Record<string, unknown>;
	} catch {
		return null;
	}
	if (raw.op !== 'keep') return null;
	const items = (Array.isArray(raw.items) ? raw.items : []).flatMap((entry) => {
		if (typeof entry === 'string') return [{ ref: entry.trim(), sections: [] }];
		if (!entry || typeof entry !== 'object') return [];
		const value = entry as Record<string, unknown>;
		if (typeof value.ref !== 'string' || !value.ref.trim()) return [];
		const sections = Array.isArray(value.sections)
			? value.sections.filter((s): s is string => typeof s === 'string').slice(0, 8)
			: [];
		return [{ ref: value.ref.trim(), sections }];
	});
	return { items: items.slice(0, 12) };
}

/** The planner's `"cont":true`: this piece continues what the project's thread worked on. */
export function readContFlag(line: string): boolean {
	const trimmed = line.trim().replace(/,$/, '');
	if (!trimmed.startsWith('{') || !trimmed.includes('"cont"')) return false;
	try {
		return (JSON.parse(trimmed) as Record<string, unknown>).cont === true;
	} catch {
		return false;
	}
}
