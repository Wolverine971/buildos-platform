// apps/worker/src/config/scheduledWork.ts

/**
 * Scheduled work runs only on a deployed worker. That covers the cron
 * scheduler (daily briefs, SMS, project loops and audits, Operatives, cycles,
 * sweeps, retention and privacy purges), its startup kicks, the startup queue
 * cleanup, and the queue alert monitor.
 *
 * apps/worker/.env points at the production database, so a laptop running
 * `pnpm dev` with the scheduler on would queue real briefs, loops, and purges
 * for real users, in parallel with Railway.
 *
 * Resolution:
 * - WORKER_SCHEDULER_ENABLED=true|1: on (explicit opt-in, e.g. against a local database)
 * - WORKER_SCHEDULER_ENABLED=false|0: off, even on Railway (kill switch)
 * - unset or unrecognized: on only when Railway injected its runtime
 *   environment (RAILWAY_ENVIRONMENT_ID / RAILWAY_ENVIRONMENT / RAILWAY_SERVICE_ID).
 *
 * NODE_ENV is deliberately not a signal: `NODE_ENV=production node dist/index.js`
 * on a laptop is still a laptop.
 *
 * Queue consumers are not gated here: a local worker still claims queue_jobs.
 */
export const SCHEDULED_WORK_ENV = 'WORKER_SCHEDULER_ENABLED';

export interface ScheduledWorkGate {
	enabled: boolean;
	reason: string;
}

const RAILWAY_RUNTIME_KEYS = [
	'RAILWAY_ENVIRONMENT_ID',
	'RAILWAY_ENVIRONMENT',
	'RAILWAY_SERVICE_ID'
] as const;

export function resolveScheduledWorkGate(env: NodeJS.ProcessEnv): ScheduledWorkGate {
	const explicit = env[SCHEDULED_WORK_ENV]?.trim().toLowerCase();
	if (explicit === 'true' || explicit === '1') {
		return { enabled: true, reason: `${SCHEDULED_WORK_ENV}=${explicit}` };
	}
	if (explicit === 'false' || explicit === '0') {
		return { enabled: false, reason: `${SCHEDULED_WORK_ENV}=${explicit}` };
	}

	const railwayKey = RAILWAY_RUNTIME_KEYS.find((key) => env[key]?.trim());
	if (railwayKey) {
		const environmentName =
			env.RAILWAY_ENVIRONMENT_NAME?.trim() || env.RAILWAY_ENVIRONMENT?.trim();
		return {
			enabled: true,
			reason: environmentName
				? `Railway environment "${environmentName}"`
				: `Railway runtime (${railwayKey})`
		};
	}

	const ignored = explicit ? ` (ignored ${SCHEDULED_WORK_ENV}="${explicit}")` : '';
	return { enabled: false, reason: `not a Railway deployment${ignored}` };
}

export function describeScheduledWorkGate(gate: ScheduledWorkGate): string {
	if (gate.enabled) {
		return `⏰ Scheduled work ON (${gate.reason}): crons, startup brief scheduling, retention purges, and queue alerts will run.`;
	}
	return `⏸️ Scheduled work OFF (${gate.reason}): no crons, startup brief scheduling, retention purges, or queue alerts. Queue jobs are still claimed. Set ${SCHEDULED_WORK_ENV}=true to opt in.`;
}
