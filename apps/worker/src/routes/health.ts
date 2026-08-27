// apps/worker/src/routes/health.ts
import type { Application } from 'express';

import { CYCLE_COORDINATOR_ENABLED, CYCLE_DAILY_BRIEF_SHADOW_ENABLED } from '../config/cycles';
import {
	WorkerEventLoopLagMonitor,
	buildWorkerOperationalHealthChecks
} from '../lib/workerOperationalHealth';
import { getWorkerHealth as getDefaultWorkerHealth } from '../worker';
import { getCycleCoordinatorHealthSnapshot } from '../workers/cycle/cycleObservability';
import { getDailyBriefCycleShadowHealthSnapshot } from '../workers/cycle/dailyBriefCycleShadow';

type HealthRouteDependencies = {
	eventLoopLagMonitor: Pick<WorkerEventLoopLagMonitor, 'getSnapshot'>;
	getWorkerHealth?: typeof getDefaultWorkerHealth;
};

/** Railway health contract for the general queue process. */
export function registerHealthRoute(
	app: Application,
	{ eventLoopLagMonitor, getWorkerHealth = getDefaultWorkerHealth }: HealthRouteDependencies
): void {
	app.get('/health', (_req, res) => {
		const workerHealth = getWorkerHealth();
		const checks = buildWorkerOperationalHealthChecks(
			workerHealth,
			eventLoopLagMonitor.getSnapshot()
		);
		res.status(workerHealth.healthy ? 200 : 503).json({
			status: workerHealth.healthy ? 'healthy' : 'unhealthy',
			timestamp: new Date().toISOString(),
			service: 'daily-brief-worker',
			runtimeState: workerHealth.state,
			checks,
			queue: workerHealth.queue,
			cycles: {
				coordinator: getCycleCoordinatorHealthSnapshot(CYCLE_COORDINATOR_ENABLED),
				dailyBriefShadow: getDailyBriefCycleShadowHealthSnapshot(
					CYCLE_DAILY_BRIEF_SHADOW_ENABLED
				)
			}
		});
	});
}
