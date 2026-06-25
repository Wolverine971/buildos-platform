// apps/web/src/lib/server/project-loop-burst.service.ts
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { createLogger } from '$lib/utils/logger';
import { queueProjectLoop } from '$lib/server/project-loops.service';

const logger = createLogger('ProjectLoopBurst');

export function queueProjectLoopBurstAsync(params: {
	projectId: string | null | undefined;
	userId: string | null | undefined;
	source: string;
}): void {
	if (!PROJECT_LOOPS_ENABLED || !params.projectId || !params.userId) return;

	void queueProjectLoop({
		projectId: params.projectId,
		userId: params.userId,
		triggerReason: 'burst'
	}).catch((error) => {
		logger.warn('Failed to queue project review burst', {
			projectId: params.projectId,
			userId: params.userId,
			source: params.source,
			error: error instanceof Error ? error.message : String(error)
		});
	});
}

export function shouldSkipProjectLoopBurst(request: Request): boolean {
	return request.headers.get('X-Skip-Project-Loop-Burst') === 'true';
}
