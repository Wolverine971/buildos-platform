// packages/shared-agent-ops/src/gateway/field-changes.ts
//
// What an update changed, as before → after values a person can read ("due Nov 4 → Nov 9").
// The gateway already loads the row before it writes; this compares that row with the saved
// one on the fields a chat card shows (tasker 155). Display only: never read back as input.

export type FieldChange = {
	field: string;
	before: string | number | boolean | null;
	after: string | number | boolean | null;
	/** True when a long text value was shortened for display. */
	clipped?: true;
};

/**
 * Fields worth showing; ids, props and bookkeeping columns stay out. A field is compared only
 * when both rows carry it, so a column one select left out never reads as a change.
 */
const SHOWN_FIELDS = [
	'title',
	'name',
	'state_key',
	'priority',
	'start_at',
	'due_at',
	'target_date',
	'end_at',
	'description',
	// The body text of a goal, plan, milestone and risk.
	'goal',
	'plan',
	'milestone',
	'content',
	'impact',
	'probability',
	'type_key',
	'facet_context',
	'facet_scale',
	'facet_stage',
	'archived_at'
] as const;

const MAX_TEXT = 160;
/** Characters kept before the first difference when a long text is shown from the middle. */
const LEAD_TEXT = 40;

type Shown = { value: FieldChange['before']; clipped: boolean };

function displayValue(value: unknown, start = 0): Shown {
	if (value === undefined || value === null || value === '')
		return { value: null, clipped: false };
	if (typeof value === 'number' || typeof value === 'boolean') return { value, clipped: false };
	if (typeof value !== 'string') return { value: null, clipped: false };
	if (start === 0 && value.length <= MAX_TEXT) return { value, clipped: false };
	const window = value.slice(start, start + MAX_TEXT);
	const more = start + MAX_TEXT < value.length;
	return {
		value: `${start > 0 ? '…' : ''}${more ? window.trimEnd() : window}${more ? '…' : ''}`,
		clipped: true
	};
}

/**
 * Where to start showing two long texts so the part that changed is visible. An edit past
 * the first 160 characters used to show the same clipped opening on both sides.
 */
function windowStart(was: unknown, now: unknown): number {
	if (typeof was !== 'string' || typeof now !== 'string') return 0;
	if (was.length <= MAX_TEXT && now.length <= MAX_TEXT) return 0;
	let first = 0;
	const shared = Math.min(was.length, now.length);
	while (first < shared && was[first] === now[first]) first += 1;
	return first < MAX_TEXT - LEAD_TEXT ? 0 : first - LEAD_TEXT;
}

/** The shown fields whose value differs between the row before and the saved row. */
export function buildFieldChanges(
	before: Record<string, unknown> | null | undefined,
	after: Record<string, unknown> | null | undefined,
	/** Fields this caller reports another way (a document's body is its `document_change`). */
	options: { skip?: readonly string[] } = {}
): FieldChange[] {
	if (!before || !after) return [];
	const changes: FieldChange[] = [];
	for (const field of SHOWN_FIELDS) {
		if (!(field in after) || !(field in before) || options.skip?.includes(field)) continue;
		const was = before[field];
		const now = after[field];
		if ((was ?? null) === (now ?? null)) continue;
		const start = windowStart(was, now);
		const left = displayValue(was, start);
		const right = displayValue(now, start);
		// Never a pair that reads the same on both sides.
		if (left.value === right.value) continue;
		changes.push({
			field,
			before: left.value,
			after: right.value,
			...(left.clipped || right.clipped ? { clipped: true as const } : {})
		});
	}
	return changes;
}
