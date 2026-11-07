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

/** Fields worth showing; ids, props and bookkeeping columns stay out. */
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
	'archived_at'
] as const;

const MAX_TEXT = 160;

function displayValue(value: unknown): { value: FieldChange['before']; clipped: boolean } {
	if (value === undefined || value === null || value === '')
		return { value: null, clipped: false };
	if (typeof value === 'number' || typeof value === 'boolean') return { value, clipped: false };
	if (typeof value !== 'string') return { value: null, clipped: false };
	return value.length > MAX_TEXT
		? { value: `${value.slice(0, MAX_TEXT).trimEnd()}…`, clipped: true }
		: { value, clipped: false };
}

/** The shown fields whose value differs between the row before and the saved row. */
export function buildFieldChanges(
	before: Record<string, unknown> | null | undefined,
	after: Record<string, unknown> | null | undefined
): FieldChange[] {
	if (!before || !after) return [];
	const changes: FieldChange[] = [];
	for (const field of SHOWN_FIELDS) {
		if (!(field in after)) continue;
		const was = before[field];
		const now = after[field];
		if ((was ?? null) === (now ?? null)) continue;
		const left = displayValue(was);
		const right = displayValue(now);
		if (left.value === right.value && !left.clipped && !right.clipped) continue;
		changes.push({
			field,
			before: left.value,
			after: right.value,
			...(left.clipped || right.clipped ? { clipped: true as const } : {})
		});
	}
	return changes;
}
