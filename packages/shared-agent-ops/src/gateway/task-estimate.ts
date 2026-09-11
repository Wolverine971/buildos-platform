// packages/shared-agent-ops/src/gateway/task-estimate.ts
/** Reconcile the old generated estimate prefix, using the canonical old value.
 * Never infer an estimate from arbitrary prose or rewrite a caller's new text.
 */
export function reconcileLegacyTaskEstimate(
	existing: { description?: unknown; props?: unknown },
	updates: Record<string, unknown>
): boolean {
	const oldProps = existing.props as Record<string, unknown> | null;
	const nextProps = updates.props as Record<string, unknown> | undefined;
	const previous = oldProps?.duration_minutes;
	const next = nextProps?.duration_minutes;
	if (
		typeof previous !== 'number' ||
		!Number.isFinite(previous) ||
		typeof next !== 'number' ||
		!Number.isFinite(next) ||
		next < 0 ||
		previous === next
	)
		return false;
	const prefix = `Allow ${previous} minutes.`;
	const replace = (text: unknown) =>
		typeof text === 'string' &&
		(text === prefix || text.startsWith(`${prefix} `) || text.startsWith(`${prefix}\n`))
			? `Allow ${next} minutes.${text.slice(prefix.length)}`
			: text;
	let descriptionChanged = false;
	if (!Object.prototype.hasOwnProperty.call(updates, 'description')) {
		const corrected = replace(existing.description);
		if (corrected !== existing.description) {
			updates.description = corrected;
			descriptionChanged = true;
		}
	}
	// Only repair an unchanged legacy mirror. Caller-supplied replacements win.
	if (nextProps && oldProps && nextProps.description === oldProps.description) {
		nextProps.description =
			oldProps.description === existing.description &&
			Object.prototype.hasOwnProperty.call(updates, 'description')
				? updates.description
				: replace(oldProps.description);
		if (nextProps.description === undefined) delete nextProps.description;
	}
	return descriptionChanged;
}
