// apps/worker/src/config/libriWorkerProfile.ts
export type LibriWorkerConfig = {
	concurrency: number;
	databaseProbeIntervalMs: number;
	queueEnabled: boolean;
	admissionDispatchEnabled: boolean;
	activationMode:
		| 'disabled'
		| 'research'
		| 'synthetic_canary'
		| 'ocr_canary'
		| 'upload_canary'
		| 'upload_maintenance_canary';
	canaryStepId: string | null;
	canaryAdmissionId: string | null;
	canaryExpiresAtMs: number | null;
	upload?: LibriUploadRuntimeConfig;
	uploadMaintenance?: LibriUploadMaintenanceRuntimeConfig;
};

export type LibriUploadRuntimeConfig = {
	libraryId: string;
	uploadId: string;
	leaseToken: string;
	expiresAtMs: number;
	downloadBrokerUrl: string;
	publicationBrokerUrl: string;
	brokerToken: string;
};

export type LibriUploadMaintenanceRuntimeConfig = Omit<
	LibriUploadRuntimeConfig,
	'downloadBrokerUrl' | 'publicationBrokerUrl'
> & { endpointUrl: string };

export type LibriResearchRuntimeConfig = {
	chapter?: { tavilyApiKey: string; creditMicrousd: bigint };
	openRouterApiKey: string;
	model: string;
	reservedMicrousd: bigint;
	maintenanceIntervalMs: number;
	consumer: {
		workerTimeoutMs: number;
		leaseDurationMs: number;
		heartbeatIntervalMs: number;
	};
};

export type LibriOcrRuntimeConfig = {
	assetBrokerUrl: string;
	assetBrokerToken: string;
	assetBrokerTimeoutMs: number;
	openRouterApiKey: string;
	model: string;
	maxOutputTokens: number;
	reservedMicrousd: bigint;
	/** Consumer timing for OCR steps; the maintenance defaults abort dense pages. */
	consumer: {
		workerTimeoutMs: number;
		leaseDurationMs: number;
		heartbeatIntervalMs: number;
	};
};

const DEFAULT_CONCURRENCY = 2;
// A dense page's vision call can run well past the 20s maintenance timeout, and
// aborting it after the provider has billed wastes the spend. The lease must
// outlive the timeout, with heartbeats well inside it.
const DEFAULT_OCR_WORKER_TIMEOUT_MS = 110_000;
const DEFAULT_OCR_LEASE_DURATION_MS = 120_000;
const DEFAULT_OCR_HEARTBEAT_INTERVAL_MS = 20_000;
const DEFAULT_DATABASE_PROBE_INTERVAL_MS = 15_000;
const MIN_CANARY_WINDOW_MS = 60_000;
const MAX_CANARY_WINDOW_MS = 30 * 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Hosted consumption requires an explicit canary or sustained research profile.
 * Research still requires separate database dispatch controls and bounded budgets.
 */
export function requireDedicatedLibriWorkerProductionProfile(environment: NodeJS.ProcessEnv): void {
	if (!isHostedProduction(environment)) return;
	if (environment.LIBRI_WORKER_PROFILE !== 'production') {
		throw new Error(
			'LIBRI_WORKER_PROFILE=production is required for a hosted dedicated Libri worker'
		);
	}
	const config = loadLibriWorkerConfig(environment);
	if (!config.queueEnabled && !config.admissionDispatchEnabled) return;
	if (config.activationMode === 'research') return; // validated in all environments
	if (config.admissionDispatchEnabled) {
		if (config.queueEnabled || config.activationMode !== 'disabled') {
			throw new Error(
				'Hosted Libri admission dispatch must run with queue consumption disabled'
			);
		}
		if (!config.canaryAdmissionId) {
			throw new Error(
				'Enabled production Libri admission dispatch requires one admission UUID'
			);
		}
		assertCanaryExpiry(config.canaryExpiresAtMs);
		return;
	}
	if (
		config.activationMode === 'upload_canary' ||
		config.activationMode === 'upload_maintenance_canary'
	)
		return; // validated in every environment below
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
	assertCanaryExpiry(config.canaryExpiresAtMs);
	if (config.activationMode === 'ocr_canary') loadLibriOcrRuntimeConfig(environment);
}

export function loadLibriResearchRuntimeConfig(
	environment: NodeJS.ProcessEnv
): LibriResearchRuntimeConfig {
	if (
		parseBoolean(
			environment.LIBRI_WORKER_ADMISSION_DISPATCH_ENABLED,
			false,
			'LIBRI_WORKER_ADMISSION_DISPATCH_ENABLED'
		) ||
		[
			environment.LIBRI_WORKER_CANARY_STEP_ID,
			environment.LIBRI_WORKER_CANARY_ADMISSION_ID,
			environment.LIBRI_WORKER_CANARY_EXPIRES_AT
		].some((value) => value?.trim())
	) {
		throw new Error('Libri research cannot use admission or canary overrides');
	}
	const model = requireValue(environment.LIBRI_RESEARCH_MODEL, 'LIBRI_RESEARCH_MODEL');
	if (!/^[a-z0-9._-]+\/[a-z0-9._:-]+$/i.test(model))
		throw new Error('Invalid Libri research model');
	const chapterEnabled = parseBoolean(
		environment.LIBRI_CHAPTER_RESEARCH_ENABLED,
		false,
		'LIBRI_CHAPTER_RESEARCH_ENABLED'
	);
	return {
		...(chapterEnabled
			? {
					chapter: {
						tavilyApiKey: requireValue(
							environment.PRIVATE_TAVILY_API_KEY,
							'PRIVATE_TAVILY_API_KEY'
						),
						creditMicrousd: parsePositiveBigint(
							requireValue(
								environment.LIBRI_TAVILY_CREDIT_MICROUSD,
								'LIBRI_TAVILY_CREDIT_MICROUSD'
							),
							1000000n,
							'LIBRI_TAVILY_CREDIT_MICROUSD'
						)
					}
				}
			: {}),
		openRouterApiKey: requireValue(
			environment.PRIVATE_OPENROUTER_API_KEY,
			'PRIVATE_OPENROUTER_API_KEY'
		),
		model,
		reservedMicrousd: parsePositiveBigint(
			requireValue(
				environment.LIBRI_RESEARCH_RESERVED_MICROUSD,
				'LIBRI_RESEARCH_RESERVED_MICROUSD'
			),
			10_000_000n,
			'LIBRI_RESEARCH_RESERVED_MICROUSD'
		),
		maintenanceIntervalMs: parseInteger(
			environment.LIBRI_RESEARCH_MAINTENANCE_INTERVAL_MS,
			5000,
			1000,
			60000,
			'LIBRI_RESEARCH_MAINTENANCE_INTERVAL_MS'
		),
		consumer: { workerTimeoutMs: 110000, leaseDurationMs: 120000, heartbeatIntervalMs: 20000 }
	};
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
		reservedMicrousd,
		consumer: {
			workerTimeoutMs: parseInteger(
				environment.LIBRI_OCR_WORKER_TIMEOUT_MS,
				DEFAULT_OCR_WORKER_TIMEOUT_MS,
				5_000,
				15 * 60_000,
				'LIBRI_OCR_WORKER_TIMEOUT_MS'
			),
			leaseDurationMs: parseInteger(
				environment.LIBRI_OCR_LEASE_DURATION_MS,
				DEFAULT_OCR_LEASE_DURATION_MS,
				5_000,
				15 * 60_000,
				'LIBRI_OCR_LEASE_DURATION_MS'
			),
			heartbeatIntervalMs: parseInteger(
				environment.LIBRI_OCR_HEARTBEAT_INTERVAL_MS,
				DEFAULT_OCR_HEARTBEAT_INTERVAL_MS,
				1_000,
				5 * 60_000,
				'LIBRI_OCR_HEARTBEAT_INTERVAL_MS'
			)
		}
	};
}

export function loadLibriWorkerConfig(environment: NodeJS.ProcessEnv): LibriWorkerConfig {
	const enabled = parseBoolean(environment.LIBRI_WORKER_ENABLED, false, 'LIBRI_WORKER_ENABLED');
	const admissionDispatchEnabled = parseBoolean(
		environment.LIBRI_WORKER_ADMISSION_DISPATCH_ENABLED,
		false,
		'LIBRI_WORKER_ADMISSION_DISPATCH_ENABLED'
	);
	const activationMode = parseActivationMode(environment.LIBRI_WORKER_ACTIVATION_MODE);
	if (enabled && activationMode === 'research') loadLibriResearchRuntimeConfig(environment);
	const upload =
		enabled && activationMode === 'upload_canary'
			? loadLibriUploadRuntimeConfig(environment)
			: undefined;

	const uploadMaintenance =
		enabled && activationMode === 'upload_maintenance_canary'
			? loadLibriUploadMaintenanceRuntimeConfig(environment)
			: undefined;

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
		...(upload ? { upload } : {}),
		...(uploadMaintenance ? { uploadMaintenance } : {}),
		admissionDispatchEnabled,
		activationMode,
		canaryStepId: parseOptionalUuid(environment.LIBRI_WORKER_CANARY_STEP_ID),
		canaryAdmissionId: parseOptionalUuid(
			environment.LIBRI_WORKER_CANARY_ADMISSION_ID,
			'LIBRI_WORKER_CANARY_ADMISSION_ID'
		),
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

function parseBoolean(value: string | undefined, fallback: boolean, name: string): boolean {
	if (value === undefined || value.trim() === '') return fallback;
	if (value === 'true') return true;
	if (value === 'false') return false;
	throw new Error(`${name} must be true or false`);
}

function parseActivationMode(value: string | undefined): LibriWorkerConfig['activationMode'] {
	if (value === undefined || value.trim() === '' || value === 'disabled') return 'disabled';
	if (
		value === 'research' ||
		value === 'synthetic_canary' ||
		value === 'ocr_canary' ||
		value === 'upload_canary' ||
		value === 'upload_maintenance_canary'
	)
		return value;
	throw new Error(
		'LIBRI_WORKER_ACTIVATION_MODE must be disabled, research, synthetic_canary, ocr_canary, upload_canary, or upload_maintenance_canary'
	);
}

function parseOptionalUuid(
	value: string | undefined,
	name = 'LIBRI_WORKER_CANARY_STEP_ID'
): string | null {
	if (value === undefined || value.trim() === '') return null;
	if (!UUID_PATTERN.test(value)) throw new Error(`${name} must be a UUID`);
	return value;
}

function assertCanaryExpiry(expiresAtMs: number | null): void {
	const nowMs = Date.now();
	if (
		expiresAtMs === null ||
		expiresAtMs < nowMs + MIN_CANARY_WINDOW_MS ||
		expiresAtMs > nowMs + MAX_CANARY_WINDOW_MS
	) {
		throw new Error('Enabled production Libri canary expiry must be 1 to 30 minutes ahead');
	}
}

export function requireActiveLibriCanaryExpiry(expiresAtMs: number | null): number {
	if (expiresAtMs === null || expiresAtMs <= Date.now()) {
		throw new Error('Enabled Libri canary expired before activation');
	}
	return expiresAtMs;
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
	if (!normalized) throw new Error(`${name} is required for Libri activation`);
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

function loadLibriUploadScope(environment: NodeJS.ProcessEnv) {
	if (
		environment.LIBRI_WORKER_CONCURRENCY !== '1' ||
		parseBoolean(
			environment.LIBRI_WORKER_ADMISSION_DISPATCH_ENABLED,
			false,
			'LIBRI_WORKER_ADMISSION_DISPATCH_ENABLED'
		)
	)
		throw new Error('Upload canary requires concurrency 1 and admission dispatch disabled');
	const exact = (key: string) => {
		const value = parseOptionalUuid(environment[key], key);
		if (!value) throw new Error(`${key} is required for the exact upload canary`);
		return value.toLowerCase();
	};
	const expiresAtMs = parseOptionalTimestamp(environment.LIBRI_WORKER_CANARY_EXPIRES_AT);
	assertCanaryExpiry(expiresAtMs);
	const endpoint = (key: string, path: string) => {
		const raw = environment[key];
		if (!raw) throw new Error(`${key} is required for the upload canary`);
		const url = new URL(raw);
		if (
			url.protocol !== 'https:' ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			url.pathname !== path ||
			url.href !== raw
		)
			throw new Error(`Invalid ${key}`);
		return raw;
	};
	const brokerToken = environment.PRIVATE_LIBRI_ASSET_BROKER_TOKEN?.trim() ?? '';
	if (!/^[A-Za-z0-9._~+/-]{32,512}={0,2}$/.test(brokerToken) || brokerToken.length > 512)
		throw new Error('Invalid upload broker credential');
	return {
		libraryId: exact('LIBRI_WORKER_CANARY_LIBRARY_ID'),
		uploadId: exact('LIBRI_WORKER_CANARY_UPLOAD_ID'),
		leaseToken: exact('LIBRI_WORKER_CANARY_UPLOAD_LEASE_TOKEN'),
		expiresAtMs: expiresAtMs!,
		brokerToken,
		endpoint
	};
}

export function loadLibriUploadRuntimeConfig(
	environment: NodeJS.ProcessEnv
): LibriUploadRuntimeConfig {
	const { endpoint, ...scope } = loadLibriUploadScope(environment);
	return {
		...scope,
		downloadBrokerUrl: endpoint(
			'LIBRI_UPLOAD_DOWNLOAD_BROKER_URL',
			'/api/internal/libri/uploads/download'
		),
		publicationBrokerUrl: endpoint(
			'LIBRI_UPLOAD_PUBLICATION_BROKER_URL',
			'/api/internal/libri/uploads/publish'
		)
	};
}

export function loadLibriUploadMaintenanceRuntimeConfig(
	environment: NodeJS.ProcessEnv
): LibriUploadMaintenanceRuntimeConfig {
	const { endpoint, ...scope } = loadLibriUploadScope(environment);
	return {
		...scope,
		endpointUrl: endpoint(
			'LIBRI_UPLOAD_MAINTENANCE_BROKER_URL',
			'/api/internal/libri/uploads/maintain'
		)
	};
}
