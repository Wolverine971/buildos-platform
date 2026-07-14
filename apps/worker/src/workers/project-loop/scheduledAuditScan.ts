// apps/worker/src/workers/project-loop/scheduledAuditScan.ts
export interface ScheduledAuditProjectRow {
	id: string;
	created_by: string | null;
}

export interface ScheduledAuditPageResult {
	data: ScheduledAuditProjectRow[];
	error: { message: string } | null;
}

/**
 * Walk every eligible project with an id cursor. The cursor remains stable when
 * processing a page changes project metadata, unlike a fixed top-N or offset scan.
 */
export async function scanScheduledAuditProjectPages(params: {
	pageSize: number;
	fetchPage: (
		afterProjectId: string | null,
		pageSize: number
	) => Promise<ScheduledAuditPageResult>;
	processPage: (projects: ScheduledAuditProjectRow[]) => Promise<void>;
	onError?: (error: { message: string }) => void;
}): Promise<{ scanned: number; scanFailed: boolean }> {
	let afterProjectId: string | null = null;
	let scanned = 0;

	while (true) {
		const { data, error } = await params.fetchPage(afterProjectId, params.pageSize);
		if (error) {
			params.onError?.(error);
			return { scanned, scanFailed: true };
		}
		if (data.length === 0) {
			return { scanned, scanFailed: false };
		}

		await params.processPage(data);
		scanned += data.length;

		if (data.length < params.pageSize) {
			return { scanned, scanFailed: false };
		}

		const nextCursor = data.at(-1)?.id ?? null;
		if (!nextCursor || nextCursor === afterProjectId) {
			const cursorError = {
				message: 'Scheduled audit scan did not advance its project cursor'
			};
			params.onError?.(cursorError);
			return { scanned, scanFailed: true };
		}
		afterProjectId = nextCursor;
	}
}
