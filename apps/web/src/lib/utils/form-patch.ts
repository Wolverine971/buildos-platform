// apps/web/src/lib/utils/form-patch.ts
// Diff normalized form snapshots, not database rows: a datetime-local input can
// omit seconds or use a different timezone representation without being edited.
// Snapshots must contain scalars or copied, consistently ordered scalar arrays.
export function changedFormFields<T extends Record<string, unknown>>(
	initial: T,
	current: T
): Partial<T> {
	const patch: Partial<T> = {};
	for (const key of Object.keys(current) as Array<keyof T>) {
		if (JSON.stringify(initial[key]) !== JSON.stringify(current[key])) {
			patch[key] = current[key];
		}
	}
	return patch;
}
