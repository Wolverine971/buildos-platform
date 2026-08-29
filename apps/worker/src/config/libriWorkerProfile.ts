export type LibriWorkerConfig = {
	concurrency: number;
	databaseProbeIntervalMs: number;
	queueEnabled: false;
};

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_DATABASE_PROBE_INTERVAL_MS = 15_000;

/**
 * The first Railway slice is intentionally health-only. A hosted process must
 * opt into the strict profile and must not enable claims before the domain
 * step schema and least-privilege database credential are deployed.
 */
export function requireDedicatedLibriWorkerProductionProfile(environment: NodeJS.ProcessEnv): void {
	if (!isHostedProduction(environment)) return;
	if (environment.LIBRI_WORKER_PROFILE !== 'production') {
		throw new Error(
			'LIBRI_WORKER_PROFILE=production is required for a hosted dedicated Libri worker'
		);
	}
	if (environment.LIBRI_WORKER_ENABLED === 'true') {
		throw new Error(
			'LIBRI_WORKER_ENABLED must remain false until the domain-step and least-privilege queue gates pass'
		);
	}
}

export function loadLibriWorkerConfig(environment: NodeJS.ProcessEnv): LibriWorkerConfig {
	const enabled = parseBoolean(environment.LIBRI_WORKER_ENABLED, false);
	if (enabled) {
		throw new Error('The Phase 3A Libri worker bootstrap cannot claim queue jobs');
	}

	return {
		concurrency: parseInteger(
			environment.LIBRI_WORKER_CONCURRENCY,
			DEFAULT_CONCURRENCY,
			1,
			8,
			'LIBRI_WORKER_CONCURRENCY'
		),
		databaseProbeIntervalMs: parseInteger(
			environment.LIBRI_WORKER_DATABASE_PROBE_INTERVAL_MS,
			DEFAULT_DATABASE_PROBE_INTERVAL_MS,
			5_000,
			300_000,
			'LIBRI_WORKER_DATABASE_PROBE_INTERVAL_MS'
		),
		queueEnabled: false
	};
}

function isHostedProduction(environment: NodeJS.ProcessEnv): boolean {
	return Boolean(
		environment.NODE_ENV === 'production' ||
			environment.RAILWAY_ENVIRONMENT_ID ||
			environment.RAILWAY_ENVIRONMENT_NAME ||
			environment.RAILWAY_SERVICE_ID
	);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined || value.trim() === '') return fallback;
	if (value === 'true') return true;
	if (value === 'false') return false;
	throw new Error('LIBRI_WORKER_ENABLED must be true or false');
}

function parseInteger(
	value: string | undefined,
	fallback: number,
	minimum: number,
	maximum: number,
	name: string
): number {
	if (value === undefined || value.trim() === '') return fallback;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
	}
	return parsed;
}
