export type LibriWorkerConfig = {
	concurrency: number;
	databaseProbeIntervalMs: number;
	queueEnabled: boolean;
	activationMode: 'disabled' | 'synthetic_canary' | 'ocr_canary';
	canaryStepId: string | null;
	canaryExpiresAtMs: number | null;
};

export type LibriOcrRuntimeConfig = {
	assetBrokerUrl: string;
	assetBrokerToken: string;
	assetBrokerTimeoutMs: number;
	openRouterApiKey: string;
	model: string;
	maxOutputTokens: number;
	reservedMicrousd: bigint;
};

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_DATABASE_PROBE_INTERVAL_MS = 15_000;
const MAX_CANARY_WINDOW_MS = 30 * 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Hosted production can consume only through the short-lived, exact-step
 * synthetic canary profile. Local tests may enable the consumer without the
 * hosted activation envelope to prove the owned start/drain path.
 */
export function requireDedicatedLibriWorkerProductionProfile(environment: NodeJS.ProcessEnv): void {
	if (!isHostedProduction(environment)) return;
	if (environment.LIBRI_WORKER_PROFILE !== 'production') {
		throw new Error(
			'LIBRI_WORKER_PROFILE=production is required for a hosted dedicated Libri worker'
		);
	}
	const config = loadLibriWorkerConfig(environment);
	if (!config.queueEnabled) return;
	if (!['synthetic_canary', 'ocr_canary'].includes(config.activationMode)) {
		throw new Error(
			'Enabled production Libri worker requires an exact synthetic_canary or ocr_canary activation mode'
		);
	}
	if (config.concurrency !== 1) {
		throw new Error('Enabled production Libri canary requires concurrency 1');
	}
	if (!config.canaryStepId) {
		throw new Error('Enabled production Libri canary requires one canary step UUID');
	}
	const nowMs = Date.now();
	if (
		config.canaryExpiresAtMs === null ||
		config.canaryExpiresAtMs <= nowMs ||
		config.canaryExpiresAtMs > nowMs + MAX_CANARY_WINDOW_MS
	) {
		throw new Error('Enabled production Libri canary expiry must be 1 to 30 minutes ahead');
	}
	if (config.activationMode === 'ocr_canary') loadLibriOcrRuntimeConfig(environment);
}

export function loadLibriOcrRuntimeConfig(environment: NodeJS.ProcessEnv): LibriOcrRuntimeConfig {
	const reservedMicrousd = parsePositiveBigint(
		requireValue(environment.LIBRI_OCR_RESERVED_MICROUSD, 'LIBRI_OCR_RESERVED_MICROUSD'),
		1_000_000n,
		'LIBRI_OCR_RESERVED_MICROUSD'
	);
	return {
		assetBrokerUrl: requireValue(environment.LIBRI_ASSET_BROKER_URL, 'LIBRI_ASSET_BROKER_URL'),
		assetBrokerToken: requireValue(
			environment.PRIVATE_LIBRI_ASSET_BROKER_TOKEN,
			'PRIVATE_LIBRI_ASSET_BROKER_TOKEN'
		),
		assetBrokerTimeoutMs: parseInteger(
			environment.LIBRI_ASSET_BROKER_TIMEOUT_MS,
			5_000,
			250,
			10_000,
			'LIBRI_ASSET_BROKER_TIMEOUT_MS'
		),
		openRouterApiKey: requireValue(
			environment.PRIVATE_OPENROUTER_API_KEY,
			'PRIVATE_OPENROUTER_API_KEY'
		),
		model: requireValue(environment.LIBRI_OCR_MODEL, 'LIBRI_OCR_MODEL'),
		maxOutputTokens: parseInteger(
			environment.LIBRI_OCR_MAX_OUTPUT_TOKENS,
			2_048,
			1,
			4_096,
			'LIBRI_OCR_MAX_OUTPUT_TOKENS'
		),
		reservedMicrousd
	};
}

export function loadLibriWorkerConfig(environment: NodeJS.ProcessEnv): LibriWorkerConfig {
	const enabled = parseBoolean(environment.LIBRI_WORKER_ENABLED, false);
	const activationMode = parseActivationMode(environment.LIBRI_WORKER_ACTIVATION_MODE);

	return {
		concurrency: parseInteger(
			environment.LIBRI_WORKER_CONCURRENCY,
			DEFAULT_CONCURRENCY,
			1,
			2,
			'LIBRI_WORKER_CONCURRENCY'
		),
		databaseProbeIntervalMs: parseInteger(
			environment.LIBRI_WORKER_DATABASE_PROBE_INTERVAL_MS,
			DEFAULT_DATABASE_PROBE_INTERVAL_MS,
			5_000,
			300_000,
			'LIBRI_WORKER_DATABASE_PROBE_INTERVAL_MS'
		),
		queueEnabled: enabled,
		activationMode,
		canaryStepId: parseOptionalUuid(environment.LIBRI_WORKER_CANARY_STEP_ID),
		canaryExpiresAtMs: parseOptionalTimestamp(environment.LIBRI_WORKER_CANARY_EXPIRES_AT)
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

function parseActivationMode(value: string | undefined): LibriWorkerConfig['activationMode'] {
	if (value === undefined || value.trim() === '' || value === 'disabled') return 'disabled';
	if (value === 'synthetic_canary' || value === 'ocr_canary') return value;
	throw new Error(
		'LIBRI_WORKER_ACTIVATION_MODE must be disabled, synthetic_canary, or ocr_canary'
	);
}

function parseOptionalUuid(value: string | undefined): string | null {
	if (value === undefined || value.trim() === '') return null;
	if (!UUID_PATTERN.test(value)) throw new Error('LIBRI_WORKER_CANARY_STEP_ID must be a UUID');
	return value;
}

function parseOptionalTimestamp(value: string | undefined): number | null {
	if (value === undefined || value.trim() === '') return null;
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) {
		throw new Error('LIBRI_WORKER_CANARY_EXPIRES_AT must be an ISO timestamp');
	}
	return parsed;
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

function requireValue(value: string | undefined, name: string): string {
	const normalized = value?.trim();
	if (!normalized) throw new Error(`${name} is required for Libri OCR activation`);
	return normalized;
}

function parsePositiveBigint(value: string, maximum: bigint, name: string): bigint {
	if (!/^\d+$/.test(value)) throw new Error(`${name} must be a positive integer`);
	const parsed = BigInt(value);
	if (parsed < 1n || parsed > maximum) {
		throw new Error(`${name} must be between 1 and ${maximum.toString()}`);
	}
	return parsed;
}
