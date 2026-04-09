// apps/web/src/lib/utils/overdue-triage-selection.ts
import type { OverdueProjectBatch } from '$lib/types/overdue-triage';

export function resolveNextOverdueProjectSelection(
	batches: OverdueProjectBatch[],
	currentProjectId: string | null,
	fallbackProjectId: string | null = null
): string | null {
	if (currentProjectId && batches.some((batch) => batch.project_id === currentProjectId)) {
		return currentProjectId;
	}

	if (fallbackProjectId && batches.some((batch) => batch.project_id === fallbackProjectId)) {
		return fallbackProjectId;
	}

	return batches[0]?.project_id ?? null;
}
