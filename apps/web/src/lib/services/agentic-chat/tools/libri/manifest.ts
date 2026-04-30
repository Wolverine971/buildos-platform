// apps/web/src/lib/services/agentic-chat/tools/libri/manifest.ts
import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { ChatToolDefinition } from '@buildos/shared-types';
import { isLibriIntegrationEnabled } from './config';
import type {
	LibriGetCapabilitySchemaArgs,
	LibriManifestDomain,
	LibriManifestOperation,
	LibriOverviewArgs,
	LibriSearchCapabilitiesArgs,
	ValidatedLibriManifest
} from './types';

const DEFAULT_TIMEOUT_MS = 10000;
const MANIFEST_PATH = '/api/v1/schema';
const MANIFEST_TTL_MS = 10 * 60 * 1000;
const MANIFEST_STALE_MS = 60 * 60 * 1000;
const MAX_DESCRIPTION_CHARS = 1200;
const MAX_SCHEMA_CHARS = 40000;
const ALLOWED_METHODS = new Set(['GET', 'POST']);
const SENSITIVE_PATH_PATTERNS = [/\/auth\/token-exchange\b/i, /\/admin\b/i, /\/keys?\b/i];
const SENSITIVE_OP_PATTERNS = [/\bauth\b/i, /\btoken\b/i, /\badmin\b/i, /\bkey\b/i];

type EnvLike = Record<string, string | undefined>;

type ManifestCacheEntry = {
	manifest: ValidatedLibriManifest;
	fetchedAtMs: number;
};

type ManifestOptions = {
	fetchFn?: typeof fetch;
	env?: EnvLike;
	timeoutMs?: number;
	now?: () => Date;
	refresh?: boolean;
};

type ToolParameterSchema = ChatToolDefinition['function']['parameters'];

let cachedManifest: ManifestCacheEntry | null = null;

function normalizeOptionalString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function readConfig(source: EnvLike = env): { apiBaseUrl?: string; apiKey?: string } {
	return {
		apiBaseUrl: normalizeOptionalString(source.LIBRI_API_BASE_URL),
		apiKey: normalizeOptionalString(source.LIBRI_API_KEY)
	};
}

function buildApiUrl(baseUrl: string, endpointPath: string): string | null {
	try {
		const normalized = baseUrl.replace(/\/+$/, '');
		const url = new URL(normalized);
		const pathname = url.pathname.replace(/\/+$/, '');
		const cleanEndpoint = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
		const endpointWithoutApiPrefix = cleanEndpoint.replace(/^\/api\/v1/, '');
		url.pathname = pathname.endsWith('/api/v1')
			? `${pathname}${endpointWithoutApiPrefix}`
			: cleanEndpoint;
		url.search = '';
		url.hash = '';
		return url.toString();
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function readStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return Array.from(
		new Set(
			value
				.map((item) => readString(item))
				.filter((item): item is string => Boolean(item))
		)
	);
}

function schemaSize(schema: unknown): number {
	try {
		return JSON.stringify(schema ?? {}).length;
	} catch {
		return MAX_SCHEMA_CHARS + 1;
	}
}

function toToolParameterSchema(schema: Record<string, any>): ToolParameterSchema {
	const properties = isRecord(schema.properties) ? (schema.properties as Record<string, any>) : {};
	const required = readStringArray(schema.required);
	const parameters = {
		...schema,
		type: 'object' as const,
		properties
	} as ToolParameterSchema & Record<string, any>;

	if (required.length > 0) {
		parameters.required = required;
	} else {
		delete parameters.required;
	}

	return parameters;
}

function redactSecret(text: string, apiKey?: string): string {
	let redacted = text;
	if (apiKey) {
		redacted = redacted.split(apiKey).join('[redacted]');
	}
	return redacted.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]');
}

async function parseJsonResponse(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

function configurationResult(code: string, message: string): Record<string, unknown> {
	return {
		status: 'configuration_error',
		code,
		message
	};
}

function errorResult(params: {
	code: string;
	message: string;
	httpStatus?: number;
	op?: string;
	toolName?: string;
	manifestVersion?: string;
}): Record<string, unknown> {
	return {
		status: 'error',
		code: params.code,
		message: params.message,
		http_status: params.httpStatus,
		op: params.op,
		tool_name: params.toolName,
		manifestVersion: params.manifestVersion
	};
}

function validateOperation(
	raw: unknown,
	domainId: string,
	operationOps: Set<string>,
	toolNames: Set<string>,
	warnings: string[]
): LibriManifestOperation | null {
	if (!isRecord(raw)) {
		warnings.push(`Skipped non-object operation in domain ${domainId}.`);
		return null;
	}

	const op = readString(raw.op);
	const toolName = readString(raw.toolName);
	const rawDomain = readString(raw.domain) ?? domainId;
	const method = readString(raw.method)?.toUpperCase();
	const path = readString(raw.path);
	const kind = readString(raw.kind);
	const description = readString(raw.description);
	const inputSchema = isRecord(raw.inputSchema) ? raw.inputSchema : null;
	const requiredScopes = readStringArray(raw.requiredScopes);
	const safety = isRecord(raw.safety) ? raw.safety : {};
	const resource = readString(raw.resource) ?? undefined;

	const prefix = op ?? toolName ?? `${domainId}.unknown`;
	const fail = (message: string): null => {
		warnings.push(`Skipped ${prefix}: ${message}`);
		return null;
	};

	if (!op || !op.startsWith('libri.')) return fail('op must start with libri.');
	if (operationOps.has(op)) return fail('duplicate op in manifest.');
	if (!toolName || !/^libri_[a-z0-9_]+$/.test(toolName)) {
		return fail('toolName must start with libri_ and use lowercase snake case.');
	}
	if (toolNames.has(toolName)) return fail('duplicate toolName in manifest.');
	if (rawDomain !== domainId) return fail('operation domain must match containing domain.');
	if (!method || !ALLOWED_METHODS.has(method)) return fail('method is not allowlisted.');
	if (!path || !path.startsWith('/api/v1/')) return fail('path must be relative /api/v1/.');
	if (SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(path))) {
		return fail('sensitive path is not model-visible.');
	}
	if (SENSITIVE_OP_PATTERNS.some((pattern) => pattern.test(op))) {
		return fail('sensitive op is not model-visible.');
	}
	if (kind !== 'read' && kind !== 'write') return fail('kind must be read or write.');
	if (!description) return fail('description is required.');
	if (description.length > MAX_DESCRIPTION_CHARS) return fail('description exceeds size limit.');
	if (requiredScopes.length === 0) return fail('requiredScopes is required.');
	if (!inputSchema) return fail('inputSchema is required.');
	if (inputSchema.type !== 'object') return fail('inputSchema root type must be object.');
	if (schemaSize(inputSchema) > MAX_SCHEMA_CHARS) return fail('inputSchema exceeds size limit.');
	if (safety.modelVisible !== true) return fail('safety.modelVisible must be true.');
	if (safety.adminOnly === true) return fail('adminOnly operations are not exposed.');
	if (safety.allowDirectToolMaterialization !== true) {
		return fail('safety.allowDirectToolMaterialization must be true.');
	}

	const outputSchema = isRecord(raw.outputSchema) ? raw.outputSchema : undefined;
	if (outputSchema && schemaSize(outputSchema) > MAX_SCHEMA_CHARS) {
		return fail('outputSchema exceeds size limit.');
	}

	const idempotency = isRecord(raw.idempotency)
		? {
				header: readString(raw.idempotency.header) ?? undefined,
				recommendedKeyFields: readStringArray(raw.idempotency.recommendedKeyFields)
			}
		: undefined;

	const operation: LibriManifestOperation = {
		op,
		toolName,
		domain: domainId,
		resource,
		kind,
		method: method as 'GET' | 'POST',
		path,
		description,
		requiredScopes,
		requiresIdempotencyKey: raw.requiresIdempotencyKey === true,
		idempotency,
		inputSchema,
		outputSchema,
		examples: Array.isArray(raw.examples) ? raw.examples : [],
		safety: {
			modelVisible: safety.modelVisible === true,
			adminOnly: safety.adminOnly === true,
			allowDirectToolMaterialization: safety.allowDirectToolMaterialization === true,
			allowGenericBridgeExecution: safety.allowGenericBridgeExecution === true
		}
	};

	operationOps.add(op);
	toolNames.add(toolName);
	return operation;
}

function validateManifestPayload(
	payload: unknown,
	now: Date,
	stale = false
): ValidatedLibriManifest {
	const warnings: string[] = [];
	if (!isRecord(payload)) {
		return {
			version: 'unknown',
			manifestVersion: 'libri-capabilities/invalid',
			fetchedAt: now.toISOString(),
			stale,
			domains: {},
			operations: {},
			byToolName: {},
			warnings: ['Manifest payload was not an object.']
		};
	}

	const version = readString(payload.version) ?? 'unknown';
	const manifestVersion =
		readString(payload.manifestVersion) ?? `libri-capabilities/${hashPayload(payload)}`;
	const generatedAt = readString(payload.generatedAt) ?? undefined;
	const domainsPayload = isRecord(payload.domains) ? payload.domains : {};
	if (version !== 'v1') {
		warnings.push(`Unsupported Libri manifest version "${version}".`);
	}
	if (!isRecord(payload.domains)) {
		warnings.push('Manifest did not include top-level domains.');
	}

	const domains: Record<string, LibriManifestDomain> = {};
	const operations: Record<string, LibriManifestOperation> = {};
	const byToolName: Record<string, LibriManifestOperation> = {};
	const allToolNames = new Set<string>();
	const allOps = new Set<string>();

	for (const [domainId, rawDomain] of Object.entries(domainsPayload)) {
		if (!/^[a-z][a-z0-9_]*$/.test(domainId) || !isRecord(rawDomain)) {
			warnings.push(`Skipped invalid domain ${domainId}.`);
			continue;
		}
		const label = readString(rawDomain.label) ?? domainId;
		const description = readString(rawDomain.description) ?? '';
		const operationsPayload = Array.isArray(rawDomain.operations) ? rawDomain.operations : [];
		const validatedOperations: LibriManifestOperation[] = [];

		for (const rawOperation of operationsPayload) {
			const operation = validateOperation(
				rawOperation,
				domainId,
				allOps,
				allToolNames,
				warnings
			);
			if (!operation) continue;
			validatedOperations.push(operation);
			operations[operation.op] = operation;
			byToolName[operation.toolName] = operation;
			allOps.add(operation.op);
		}

		const sequences = isRecord(rawDomain.sequences)
			? (rawDomain.sequences as LibriManifestDomain['sequences'])
			: undefined;

		domains[domainId] = {
			id: domainId,
			label,
			description,
			resources: isRecord(rawDomain.resources)
				? (rawDomain.resources as Record<string, unknown>)
				: {},
			operations: validatedOperations,
			sequences
		};
	}

	return {
		version,
		manifestVersion,
		generatedAt,
		fetchedAt: now.toISOString(),
		stale,
		domains,
		operations,
		byToolName,
		warnings
	};
}

function hashPayload(payload: unknown): string {
	return createHash('sha256')
		.update(JSON.stringify(payload ?? null))
		.digest('hex')
		.slice(0, 16);
}

export function resetLibriManifestCache(): void {
	cachedManifest = null;
}

export function getCachedLibriManifest(): ValidatedLibriManifest | null {
	return cachedManifest?.manifest ?? null;
}

export async function getValidatedLibriManifest(
	options: ManifestOptions = {}
): Promise<ValidatedLibriManifest | Record<string, unknown>> {
	const now = options.now?.() ?? new Date();
	const nowMs = now.getTime();
	if (!options.refresh && cachedManifest && nowMs - cachedManifest.fetchedAtMs <= MANIFEST_TTL_MS) {
		return cachedManifest.manifest;
	}

	if (!isLibriIntegrationEnabled(options.env)) {
		return configurationResult(
			'LIBRI_DISABLED',
			'Libri integration is disabled for this BuildOS environment.'
		);
	}

	const config = readConfig(options.env);
	if (!config.apiBaseUrl || !config.apiKey) {
		return configurationResult(
			'LIBRI_NOT_CONFIGURED',
			'Libri is not configured for this BuildOS environment.'
		);
	}

	const url = buildApiUrl(config.apiBaseUrl, MANIFEST_PATH);
	if (!url) {
		return configurationResult('LIBRI_INVALID_BASE_URL', 'Libri API base URL is invalid.');
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	const fetcher = options.fetchFn ?? fetch;

	try {
		const response = await fetcher(url, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${config.apiKey}`
			},
			signal: controller.signal
		});

		const payload = await parseJsonResponse(response);
		if (!response.ok) {
			const message = `Libri manifest request failed with HTTP ${response.status}.`;
			if (cachedManifest && nowMs - cachedManifest.fetchedAtMs <= MANIFEST_STALE_MS) {
				return { ...cachedManifest.manifest, stale: true };
			}
			return errorResult({
				code: response.status === 401 || response.status === 403 ? 'LIBRI_AUTH_FAILED' : 'LIBRI_SCHEMA_FAILED',
				message,
				httpStatus: response.status
			});
		}

		const manifest = validateManifestPayload(payload, now);
		cachedManifest = { manifest, fetchedAtMs: nowMs };
		return manifest;
	} catch (error) {
		const isAbort =
			error instanceof Error && (error.name === 'AbortError' || error.message === 'AbortError');
		if (cachedManifest && nowMs - cachedManifest.fetchedAtMs <= MANIFEST_STALE_MS) {
			return { ...cachedManifest.manifest, stale: true };
		}
		return errorResult({
			code: isAbort ? 'LIBRI_TIMEOUT' : 'LIBRI_NETWORK_ERROR',
			message: isAbort
				? 'Libri manifest request timed out.'
				: redactSecret(error instanceof Error ? error.message : String(error), config.apiKey)
		});
	} finally {
		clearTimeout(timeout);
	}
}

function isValidatedManifest(value: unknown): value is ValidatedLibriManifest {
	return isRecord(value) && isRecord(value.operations) && isRecord(value.byToolName);
}

function compactDomain(domain: LibriManifestDomain): Record<string, unknown> {
	return {
		id: domain.id,
		label: domain.label,
		description: domain.description,
		operation_count: domain.operations.length,
		resources: Object.keys(domain.resources ?? {}),
		sequences: domain.sequences ? Object.keys(domain.sequences) : []
	};
}

export async function libriOverview(
	args: LibriOverviewArgs = {},
	options: ManifestOptions = {}
): Promise<Record<string, unknown>> {
	const manifest = await getValidatedLibriManifest({ ...options, refresh: args.refresh });
	if (!isValidatedManifest(manifest)) return manifest;
	return {
		type: 'libri_overview',
		status: 'ok',
		manifestVersion: manifest.manifestVersion,
		fetchedAt: manifest.fetchedAt,
		stale: manifest.stale,
		domains:
			args.includeDomains === false
				? undefined
				: Object.values(manifest.domains).map(compactDomain),
		warnings: manifest.warnings
	};
}

function scoreOperation(operation: LibriManifestOperation, query: string): number {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return 1;
	const tokens = normalized.split(/\s+/).filter(Boolean);
	const haystack = [
		operation.op,
		operation.toolName,
		operation.domain,
		operation.resource,
		operation.kind,
		operation.description
	]
		.filter((value): value is string => typeof value === 'string' && value.length > 0)
		.join(' ')
		.toLowerCase();
	let score = 0;
	if (operation.op.toLowerCase() === normalized) score += 200;
	if (operation.toolName.toLowerCase() === normalized) score += 200;
	if (haystack.includes(normalized)) score += 80;
	for (const token of tokens) {
		if (haystack.includes(token)) score += 20;
	}
	return score;
}

function operationSummary(operation: LibriManifestOperation): Record<string, unknown> {
	const schema = operation.inputSchema;
	return {
		op: operation.op,
		tool_name: operation.toolName,
		domain: operation.domain,
		resource: operation.resource ?? null,
		kind: operation.kind,
		description: operation.description,
		required: Array.isArray(schema.required) ? schema.required : [],
		schema_available: true
	};
}

function collectSequenceToolNames(
	manifest: ValidatedLibriManifest,
	domainId: string | undefined,
	matches: LibriManifestOperation[]
): string[] {
	const matchedOps = new Set(matches.map((operation) => operation.op));
	const toolNames = new Set<string>();
	const domains = domainId
		? [manifest.domains[domainId]].filter((domain): domain is LibriManifestDomain => Boolean(domain))
		: Object.values(manifest.domains);
	for (const domain of domains) {
		const sequences = domain.sequences ?? {};
		for (const sequence of Object.values(sequences)) {
			const steps = Array.isArray(sequence?.steps) ? sequence.steps : [];
			const sequenceOps = steps
				.map((step) => (isRecord(step) ? readString(step.op) : null))
				.filter((op): op is string => Boolean(op));
			if (!sequenceOps.some((op) => matchedOps.has(op))) continue;
			for (const op of sequenceOps) {
				const operation = manifest.operations[op];
				if (operation) toolNames.add(operation.toolName);
			}
		}
	}
	for (const operation of matches) {
		toolNames.add(operation.toolName);
	}
	return Array.from(toolNames);
}

export async function libriSearchCapabilities(
	args: LibriSearchCapabilitiesArgs = {},
	options: ManifestOptions = {}
): Promise<Record<string, unknown>> {
	const manifest = await getValidatedLibriManifest({ ...options, refresh: args.refresh });
	if (!isValidatedManifest(manifest)) return manifest;

	const query = normalizeOptionalString(args.query) ?? '';
	const domain = normalizeOptionalString(args.domain);
	const resource = normalizeOptionalString(args.resource);
	const limit = Math.max(1, Math.min(25, Math.floor(args.limit ?? 5)));

	const matches = Object.values(manifest.operations)
		.filter((operation) => {
			if (domain && operation.domain !== domain) return false;
			if (resource && operation.resource !== resource) return false;
			if (args.kind && operation.kind !== args.kind) return false;
			return true;
		})
		.map((operation) => ({ operation, score: scoreOperation(operation, query) }))
		.filter(({ score }) => score > 0)
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			return a.operation.op.localeCompare(b.operation.op);
		})
		.slice(0, limit)
		.map(({ operation }) => operation);

	const materializedTools = collectSequenceToolNames(manifest, domain, matches);
	return {
		type: 'libri_capability_search_results',
		status: 'ok',
		domain: domain ?? null,
		query: query || null,
		manifestVersion: manifest.manifestVersion,
		fetchedAt: manifest.fetchedAt,
		stale: manifest.stale,
		total_matches: matches.length,
		matches: matches.map(operationSummary),
		materialized_tools: materializedTools,
		next_step:
			'Use the direct Libri tool after it is loaded in the next model pass. For writes, preview before create/import.'
	};
}

export async function libriGetCapabilitySchema(
	args: LibriGetCapabilitySchemaArgs,
	options: ManifestOptions = {}
): Promise<Record<string, unknown>> {
	const op = normalizeOptionalString(args.op);
	if (!op) {
		return {
			type: 'not_found',
			status: 'needs_input',
			message: 'A Libri op is required.'
		};
	}
	const manifest = await getValidatedLibriManifest({ ...options, refresh: args.refresh });
	if (!isValidatedManifest(manifest)) return manifest;
	const operation = manifest.operations[op] ?? manifest.byToolName[op];
	if (!operation) {
		return {
			type: 'not_found',
			status: 'not_found',
			op,
			message: 'No Libri operation schema found for this op.'
		};
	}
	return {
		type: 'libri_capability_schema',
		status: 'ok',
		op: operation.op,
		tool_name: operation.toolName,
		callable_tool: operation.toolName,
		domain: operation.domain,
		resource: operation.resource ?? null,
		kind: operation.kind,
		description: operation.description,
		schema: operation.inputSchema,
		output_schema: operation.outputSchema,
		examples: args.includeExamples === false ? undefined : operation.examples,
		manifestVersion: manifest.manifestVersion,
		materialized_tools: [operation.toolName]
	};
}

export function resolveDynamicLibriToolDefinition(toolName: string): ChatToolDefinition | undefined {
	const operation = cachedManifest?.manifest.byToolName[toolName];
	if (!operation) return undefined;
	return {
		type: 'function',
		function: {
			name: operation.toolName,
			description: operation.description,
			parameters: toToolParameterSchema(operation.inputSchema)
		}
	};
}

export function getCachedLibriOperationByToolName(
	toolName: string
): LibriManifestOperation | undefined {
	return cachedManifest?.manifest.byToolName[toolName];
}

export function getCachedLibriOperation(reference: string): LibriManifestOperation | undefined {
	return cachedManifest?.manifest.operations[reference] ?? cachedManifest?.manifest.byToolName[reference];
}

function validateDirectArgs(
	operation: LibriManifestOperation,
	args: Record<string, any>
): string[] {
	const errors: string[] = [];
	const schema = operation.inputSchema;
	const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
	for (const key of required) {
		const value = args[key];
		if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
			errors.push(`Missing required parameter: ${key}`);
		}
	}

	const properties = isRecord(schema.properties) ? schema.properties : {};
	if (schema.additionalProperties === false) {
		for (const key of Object.keys(args)) {
			if (!(key in properties)) errors.push(`Unsupported parameter: ${key}`);
		}
	}

	for (const [key, value] of Object.entries(args)) {
		const property = properties[key];
		if (!isRecord(property) || value === undefined || value === null) continue;
		const expectedType = readString(property.type);
		if (!expectedType) continue;
		const actualType = Array.isArray(value) ? 'array' : typeof value;
		if (expectedType !== actualType) {
			errors.push(`Invalid type for parameter ${key}: expected ${expectedType}, got ${actualType}`);
		}
	}

	if (operation.resource === 'video.import' || operation.op.startsWith('libri.video.import.')) {
		const transcript = typeof args.transcriptText === 'string' ? args.transcriptText.trim() : '';
		const url = typeof args.url === 'string' ? args.url.trim() : '';
		const youtubeVideoId =
			typeof args.youtubeVideoId === 'string' ? args.youtubeVideoId.trim() : '';
		if (!transcript) {
			errors.push('Missing required parameter: transcriptText');
		}
		if (!url && !youtubeVideoId) {
			errors.push('YouTube import requires either url or youtubeVideoId.');
		}
	}

	return Array.from(new Set(errors));
}

function appendGetParams(url: URL, args: Record<string, any>): void {
	for (const [key, value] of Object.entries(args)) {
		if (value === undefined || value === null) continue;
		if (typeof value === 'object') {
			url.searchParams.set(key, JSON.stringify(value));
		} else {
			url.searchParams.set(key, String(value));
		}
	}
}

function buildIdempotencyKey(operation: LibriManifestOperation, args: Record<string, any>): string {
	const fields = operation.idempotency?.recommendedKeyFields ?? [];
	const payload =
		fields.length > 0
			? fields.reduce<Record<string, unknown>>((acc, field) => {
					if (args[field] !== undefined) acc[field] = args[field];
					return acc;
				}, {})
			: args;
	const hash = createHash('sha256')
		.update(JSON.stringify({ op: operation.op, payload }))
		.digest('hex')
		.slice(0, 32);
	return `buildos-${operation.toolName}-${hash}`;
}

export async function executeDynamicLibriTool(
	toolName: string,
	args: Record<string, any>,
	options: ManifestOptions = {}
): Promise<Record<string, unknown>> {
	const manifest = await getValidatedLibriManifest(options);
	if (!isValidatedManifest(manifest)) return manifest;
	const operation = manifest.byToolName[toolName];
	if (!operation) {
		return errorResult({
			code: 'LIBRI_TOOL_NOT_FOUND',
			message: `No validated Libri operation found for tool ${toolName}.`,
			toolName,
			manifestVersion: manifest.manifestVersion
		});
	}

	const validationErrors = validateDirectArgs(operation, args);
	if (validationErrors.length > 0) {
		return {
			status: 'validation_error',
			code: 'LIBRI_ARGUMENT_VALIDATION_FAILED',
			message: validationErrors.join(' '),
			op: operation.op,
			tool_name: operation.toolName,
			manifestVersion: manifest.manifestVersion,
			errors: validationErrors
		};
	}

	if (!isLibriIntegrationEnabled(options.env)) {
		return configurationResult(
			'LIBRI_DISABLED',
			'Libri integration is disabled for this BuildOS environment.'
		);
	}
	const config = readConfig(options.env);
	if (!config.apiBaseUrl || !config.apiKey) {
		return configurationResult(
			'LIBRI_NOT_CONFIGURED',
			'Libri is not configured for this BuildOS environment.'
		);
	}
	const rawUrl = buildApiUrl(config.apiBaseUrl, operation.path);
	if (!rawUrl) {
		return configurationResult('LIBRI_INVALID_BASE_URL', 'Libri API base URL is invalid.');
	}

	const headers: Record<string, string> = {
		Accept: 'application/json',
		Authorization: `Bearer ${config.apiKey}`
	};
	const init: RequestInit = {
		method: operation.method,
		headers
	};
	const url = new URL(rawUrl);
	if (operation.method === 'GET') {
		appendGetParams(url, args);
	} else {
		headers['Content-Type'] = 'application/json';
		if (operation.requiresIdempotencyKey) {
			headers[operation.idempotency?.header ?? 'Idempotency-Key'] = buildIdempotencyKey(
				operation,
				args
			);
		}
		init.body = JSON.stringify(args);
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	init.signal = controller.signal;
	const fetcher = options.fetchFn ?? fetch;

	try {
		const response = await fetcher(url.toString(), init);
		const payload = await parseJsonResponse(response);
		if (!response.ok) {
			const maybeMessage =
				isRecord(payload) && typeof payload.message === 'string' ? payload.message : null;
			return errorResult({
				code:
					response.status === 401 || response.status === 403
						? 'LIBRI_AUTH_FAILED'
						: 'LIBRI_OPERATION_FAILED',
				message: maybeMessage
					? redactSecret(maybeMessage, config.apiKey)
					: `Libri operation failed with HTTP ${response.status}.`,
				httpStatus: response.status,
				op: operation.op,
				toolName: operation.toolName,
				manifestVersion: manifest.manifestVersion
			});
		}
		return {
			status: 'ok',
			op: operation.op,
			tool_name: operation.toolName,
			manifestVersion: manifest.manifestVersion,
			http_status: response.status,
			response: payload
		};
	} catch (error) {
		const isAbort =
			error instanceof Error && (error.name === 'AbortError' || error.message === 'AbortError');
		return errorResult({
			code: isAbort ? 'LIBRI_TIMEOUT' : 'LIBRI_NETWORK_ERROR',
			message: isAbort
				? 'Libri operation timed out.'
				: redactSecret(error instanceof Error ? error.message : String(error), config.apiKey),
			op: operation.op,
			toolName: operation.toolName,
			manifestVersion: manifest.manifestVersion
		});
	} finally {
		clearTimeout(timeout);
	}
}
