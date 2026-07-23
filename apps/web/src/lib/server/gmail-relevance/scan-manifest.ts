// apps/web/src/lib/server/gmail-relevance/scan-manifest.ts
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PROJECT_EMAIL_PROFILE_COMPILER_VERSION } from './project-email-profile';
import {
	EMAIL_RELEVANCE_SCAN_BUDGET_POLICY,
	EMAIL_RELEVANCE_SCAN_QUOTA_POLICY_VERSION
} from './scan-budget';

export const EMAIL_RELEVANCE_SCAN_CONTROL_PLANE_VERSION = 'email-relevance-scan-control-plane-v1';
export const EMAIL_RELEVANCE_SCAN_MANIFEST_SCHEMA_VERSION = 'email-relevance-scan-manifest-v1';
export const EMAIL_RELEVANCE_SCAN_SERIALIZER_VERSION = 'email-relevance-scan-serializer-v1';
export const EMAIL_RELEVANCE_QUERY_POLICY_VERSION = 'inbox-sent-exclude-spam-trash-drafts-v1';

export const EMAIL_RELEVANCE_SCAN_LIMITS = {
	window_days: 30,
	max_connections: 3,
	max_projects: 25,
	max_lifetime_ms: 24 * 60 * 60 * 1_000,
	max_manifest_bytes: 16_384
} as const;

const UUID_SCHEMA = z.string().uuid();
const SHA256_SCHEMA = z.string().regex(/^[a-f0-9]{64}$/);
const ISO_TIMESTAMP_SCHEMA = z.string().datetime({ offset: true });

const PROJECT_SELECTION_SCHEMA = z
	.object({
		project_id: UUID_SCHEMA,
		profile_id: UUID_SCHEMA,
		profile_version: z.number().int().positive(),
		profile_hash: SHA256_SCHEMA
	})
	.strict();

const CREATE_SCAN_MANIFEST_SCHEMA = z
	.object({
		user_id: UUID_SCHEMA,
		idempotency_key: z.string().min(16).max(200),
		connection_ids: z
			.array(UUID_SCHEMA)
			.min(1)
			.max(EMAIL_RELEVANCE_SCAN_LIMITS.max_connections),
		projects: z
			.array(PROJECT_SELECTION_SCHEMA)
			.min(1)
			.max(EMAIL_RELEVANCE_SCAN_LIMITS.max_projects),
		window_start: ISO_TIMESTAMP_SCHEMA,
		window_end: ISO_TIMESTAMP_SCHEMA,
		expires_at: ISO_TIMESTAMP_SCHEMA
	})
	.strict();

export type EmailRelevanceScanProjectSelection = z.infer<typeof PROJECT_SELECTION_SCHEMA>;

export type CreateEmailRelevanceScanManifestInput = z.input<typeof CREATE_SCAN_MANIFEST_SCHEMA>;

export type EmailRelevanceScanManifestConfiguration = {
	manifest_schema_version: typeof EMAIL_RELEVANCE_SCAN_MANIFEST_SCHEMA_VERSION;
	control_plane_version: typeof EMAIL_RELEVANCE_SCAN_CONTROL_PLANE_VERSION;
	serializer_version: typeof EMAIL_RELEVANCE_SCAN_SERIALIZER_VERSION;
	profile_compiler_version: typeof PROJECT_EMAIL_PROFILE_COMPILER_VERSION;
	quota_policy_version: typeof EMAIL_RELEVANCE_SCAN_QUOTA_POLICY_VERSION;
	query_policy_version: typeof EMAIL_RELEVANCE_QUERY_POLICY_VERSION;
	start_mode: 'manual';
	user_id: string;
	connection_ids: string[];
	projects: EmailRelevanceScanProjectSelection[];
	window_start: string;
	window_end: string;
	expires_at: string;
	message_cap_per_connection: 1_000;
	metadata_batch_ceiling: 50;
	per_connection_budgets: {
		gmail_quota_units: 20_050;
		runtime_ms: 1_200_000;
		raw_content_bytes: 0;
		model_tokens: 0;
		model_cost_micros: 0;
	};
	global_budgets: {
		gmail_quota_units: number;
		runtime_ms: number;
		raw_content_bytes: 0;
		model_tokens: 0;
		model_cost_micros: 0;
	};
};

export type EmailRelevanceScanManifest = {
	idempotency_key_hash: string;
	manifest_hash: string;
	configuration: EmailRelevanceScanManifestConfiguration;
};

export type EmailRelevanceScanManifestErrorCode =
	| 'invalid_input'
	| 'duplicate_connection'
	| 'duplicate_project'
	| 'duplicate_profile'
	| 'invalid_window'
	| 'invalid_expiration'
	| 'manifest_too_large';

export class EmailRelevanceScanManifestError extends Error {
	constructor(public readonly code: EmailRelevanceScanManifestErrorCode) {
		super(`Email relevance scan manifest rejected: ${code}`);
		this.name = 'EmailRelevanceScanManifestError';
	}
}

type CanonicalJson =
	| null
	| boolean
	| number
	| string
	| CanonicalJson[]
	| { [key: string]: CanonicalJson };

function canonicalJson(value: CanonicalJson): string {
	if (value === null || typeof value === 'boolean' || typeof value === 'string') {
		return JSON.stringify(value);
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new EmailRelevanceScanManifestError('invalid_input');
		}
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(',')}]`;
	}

	return `{${Object.keys(value)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
		.join(',')}}`;
}

function sha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

function compareAscii(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function assertUnique(values: string[], code: EmailRelevanceScanManifestErrorCode): void {
	if (new Set(values).size !== values.length) {
		throw new EmailRelevanceScanManifestError(code);
	}
}

function normalizeTimestamp(value: string): string {
	return new Date(value).toISOString();
}

function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		for (const nested of Object.values(value)) deepFreeze(nested);
		Object.freeze(value);
	}
	return value;
}

export function buildEmailRelevanceScanManifest(
	rawInput: CreateEmailRelevanceScanManifestInput,
	referenceTime: string | Date
): EmailRelevanceScanManifest {
	const parsed = CREATE_SCAN_MANIFEST_SCHEMA.safeParse(rawInput);
	if (!parsed.success) {
		throw new EmailRelevanceScanManifestError('invalid_input');
	}

	const referenceTimeMs =
		referenceTime instanceof Date ? referenceTime.getTime() : Date.parse(referenceTime);
	if (!Number.isFinite(referenceTimeMs)) {
		throw new EmailRelevanceScanManifestError('invalid_input');
	}

	assertUnique(parsed.data.connection_ids, 'duplicate_connection');
	assertUnique(
		parsed.data.projects.map((project) => project.project_id),
		'duplicate_project'
	);
	assertUnique(
		parsed.data.projects.map((project) => project.profile_id),
		'duplicate_profile'
	);

	const windowStartMs = Date.parse(parsed.data.window_start);
	const windowEndMs = Date.parse(parsed.data.window_end);
	const expiresAtMs = Date.parse(parsed.data.expires_at);
	const exactWindowMs = EMAIL_RELEVANCE_SCAN_LIMITS.window_days * 24 * 60 * 60 * 1_000;

	if (windowEndMs - windowStartMs !== exactWindowMs || windowEndMs > referenceTimeMs) {
		throw new EmailRelevanceScanManifestError('invalid_window');
	}
	if (
		expiresAtMs <= referenceTimeMs ||
		expiresAtMs - referenceTimeMs > EMAIL_RELEVANCE_SCAN_LIMITS.max_lifetime_ms
	) {
		throw new EmailRelevanceScanManifestError('invalid_expiration');
	}

	const connectionIds = [...parsed.data.connection_ids].sort(compareAscii);
	const projects = parsed.data.projects
		.map((project) => ({ ...project }))
		.sort(
			(left, right) =>
				compareAscii(left.project_id, right.project_id) ||
				compareAscii(left.profile_id, right.profile_id)
		);
	const accountCount = connectionIds.length;
	const configuration: EmailRelevanceScanManifestConfiguration = {
		manifest_schema_version: EMAIL_RELEVANCE_SCAN_MANIFEST_SCHEMA_VERSION,
		control_plane_version: EMAIL_RELEVANCE_SCAN_CONTROL_PLANE_VERSION,
		serializer_version: EMAIL_RELEVANCE_SCAN_SERIALIZER_VERSION,
		profile_compiler_version: PROJECT_EMAIL_PROFILE_COMPILER_VERSION,
		quota_policy_version: EMAIL_RELEVANCE_SCAN_QUOTA_POLICY_VERSION,
		query_policy_version: EMAIL_RELEVANCE_QUERY_POLICY_VERSION,
		start_mode: 'manual',
		user_id: parsed.data.user_id,
		connection_ids: connectionIds,
		projects,
		window_start: normalizeTimestamp(parsed.data.window_start),
		window_end: normalizeTimestamp(parsed.data.window_end),
		expires_at: normalizeTimestamp(parsed.data.expires_at),
		message_cap_per_connection: EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.message_cap_per_connection,
		metadata_batch_ceiling: EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.metadata_batch_ceiling,
		per_connection_budgets: {
			gmail_quota_units: EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.gmail_quota_units_per_connection,
			runtime_ms: EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.runtime_ms_per_connection,
			raw_content_bytes: EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.raw_content_bytes_per_connection,
			model_tokens: EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.model_tokens_per_connection,
			model_cost_micros: EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.model_cost_micros_per_connection
		},
		global_budgets: {
			gmail_quota_units:
				accountCount * EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.gmail_quota_units_per_connection,
			runtime_ms: accountCount * EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.runtime_ms_per_connection,
			raw_content_bytes: 0,
			model_tokens: 0,
			model_cost_micros: 0
		}
	};

	const canonicalConfiguration = canonicalJson(configuration as unknown as CanonicalJson);
	if (
		Buffer.byteLength(canonicalConfiguration, 'utf8') >
		EMAIL_RELEVANCE_SCAN_LIMITS.max_manifest_bytes
	) {
		throw new EmailRelevanceScanManifestError('manifest_too_large');
	}

	return deepFreeze({
		idempotency_key_hash: sha256(
			`email-relevance-scan-idempotency-v1\u0000${parsed.data.user_id}\u0000${parsed.data.idempotency_key}`
		),
		manifest_hash: sha256(canonicalConfiguration),
		configuration
	});
}
