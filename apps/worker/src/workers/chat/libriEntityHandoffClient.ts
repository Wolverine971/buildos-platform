// apps/worker/src/workers/chat/libriEntityHandoffClient.ts
// Server-side Libri batch handoff client used by chat session synthesis.

import { createHash } from 'node:crypto';
import {
	type ExtractedLibriEntity,
	type LibriExtractedEntityType,
	type SessionExtractedEntities,
	getEligibleLibriCandidates
} from './libriSessionEntities';

export type LibriHandoffOverallStatus = 'not_configured' | 'sent' | 'partial' | 'failed';
export type LibriHandoffEntityStatus = 'found' | 'queued' | 'pending' | 'needs_input' | 'error';

export interface LibriEntityHandoffResult {
	entity_type: LibriExtractedEntityType;
	canonical_query: string;
	status: LibriHandoffEntityStatus;
	resource_key?: string | null;
	job_id?: string | null;
	message?: string;
}

export interface LibriEntityHandoffStatus {
	status: LibriHandoffOverallStatus;
	attempted_at: string;
	idempotency_key: string;
	results: LibriEntityHandoffResult[];
	message?: string;
	http_status?: number;
}

export interface LibriSessionHandoffInput {
	sessionId: string;
	contextType: string | null | undefined;
	projectId?: string | null;
	extractedEntities: SessionExtractedEntities;
}

export interface LibriEntityHandoffClientOptions {
	env?: Record<string, string | undefined>;
	fetchFn?: typeof fetch;
	now?: () => Date;
	timeoutMs?: number;
}

interface LibriClientConfig {
	enabled: boolean;
	apiBaseUrl?: string;
	apiKey?: string;
}

const ENTITY_HANDOFF_PATH = '/api/v1/entity-handoffs';
const DEFAULT_TIMEOUT_MS = 8000;
const ENTITY_STATUSES = new Set<LibriHandoffEntityStatus>([
	'found',
	'queued',
	'pending',
	'needs_input',
	'error'
]);

function normalizeOptionalString(value: unknown, maxLength = 240): string | undefined {
	if (typeof value !== 'string') return undefined;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return undefined;
	return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isIntegrationEnabled(env: Record<string, string | undefined>): boolean {
	const raw = env.LIBRI_INTEGRATION_ENABLED;
	if (!raw) return false;
	return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function readConfig(env: Record<string, string | undefined> = process.env): LibriClientConfig {
	return {
		enabled: isIntegrationEnabled(env),
		apiBaseUrl: normalizeOptionalString(env.LIBRI_API_BASE_URL, 1000),
		apiKey: normalizeOptionalString(env.LIBRI_API_KEY, 1000)
	};
}

function buildApiUrl(baseUrl: string, endpointPath = ENTITY_HANDOFF_PATH): string | null {
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

function entityHashInput(entity: ExtractedLibriEntity): Record<string, unknown> {
	return {
		entity_type: entity.entity_type,
		canonical_query: entity.canonical_query.toLowerCase().replace(/\s+/g, ' ').trim(),
		url: entity.url?.trim(),
		youtube_video_id: entity.youtube_video_id?.trim(),
		authors: entity.authors?.map((author) => author.toLowerCase().trim()).sort()
	};
}

export function buildStableEntityHash(entities: ExtractedLibriEntity[]): string {
	const stableEntities = entities
		.map(entityHashInput)
		.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
	return createHash('sha256').update(JSON.stringify(stableEntities)).digest('hex').slice(0, 32);
}

export function buildLibriHandoffIdempotencyKey(
	sessionId: string,
	entities: ExtractedLibriEntity[]
): string {
	return `buildos-session-entity-handoff:${sessionId}:${buildStableEntityHash(entities)}`;
}

function toLibriEntityPayload(entity: ExtractedLibriEntity): Record<string, unknown> {
	return {
		entityType: entity.entity_type,
		displayName: entity.display_name,
		canonicalQuery: entity.canonical_query,
		...(entity.url ? { url: entity.url } : {}),
		...(entity.youtube_video_id ? { youtubeVideoId: entity.youtube_video_id } : {}),
		...(entity.authors?.length ? { authors: entity.authors } : {}),
		...(entity.aliases?.length ? { aliases: entity.aliases } : {}),
		confidence: entity.confidence,
		relevance: entity.relevance,
		userRequestedResearch: entity.user_requested_research,
		extractionReason: entity.extraction_reason,
		sourceMessageIds: entity.source_message_ids,
		sourceTurnIndices: entity.source_turn_indices,
		evidenceSnippets: entity.evidence_snippets
	};
}

function buildRequestPayload(input: LibriSessionHandoffInput, entities: ExtractedLibriEntity[]) {
	const contextType = normalizeOptionalString(input.contextType, 80) ?? 'global';
	const projectId = normalizeOptionalString(input.projectId, 120);
	return {
		source: {
			system: 'buildos',
			reason: 'session_close_synthesis',
			sessionId: input.sessionId,
			contextType,
			...(projectId ? { projectId } : {})
		},
		entities: entities.map(toLibriEntityPayload)
	};
}

async function parseJsonResponse(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

function redactSecret(text: string, apiKey?: string): string {
	let redacted = text;
	if (apiKey) redacted = redacted.split(apiKey).join('[redacted]');
	return redacted.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]');
}

function extractErrorPayload(payload: unknown): { code?: string; message?: string } {
	if (!isRecord(payload)) return {};
	const nested = payload.error;
	if (isRecord(nested)) {
		return {
			code: typeof nested.code === 'string' ? nested.code : undefined,
			message: typeof nested.message === 'string' ? nested.message : undefined
		};
	}
	return {
		code: typeof payload.code === 'string' ? payload.code : undefined,
		message: typeof payload.message === 'string' ? payload.message : undefined
	};
}

function getField(record: Record<string, unknown>, snakeCase: string, camelCase?: string): unknown {
	return record[snakeCase] ?? (camelCase ? record[camelCase] : undefined);
}

function normalizeResponseStatus(value: unknown): LibriHandoffEntityStatus {
	return typeof value === 'string' && ENTITY_STATUSES.has(value as LibriHandoffEntityStatus)
		? (value as LibriHandoffEntityStatus)
		: 'error';
}

function normalizeJobId(value: unknown): string | null {
	if (!isRecord(value)) return null;
	const jobId = getField(value, 'job_id', 'jobId');
	return normalizeOptionalString(jobId, 120) ?? null;
}

function normalizeResult(
	raw: unknown,
	entity: ExtractedLibriEntity,
	missingMessage = 'Libri did not return a result for this entity.'
): LibriEntityHandoffResult {
	if (!isRecord(raw)) {
		return {
			entity_type: entity.entity_type,
			canonical_query: entity.canonical_query,
			status: 'error',
			resource_key: null,
			job_id: null,
			message: missingMessage
		};
	}

	const status = normalizeResponseStatus(raw.status);
	const message = normalizeOptionalString(raw.message, 240);
	return {
		entity_type: entity.entity_type,
		canonical_query:
			normalizeOptionalString(getField(raw, 'canonical_query', 'canonicalQuery'), 220) ??
			entity.canonical_query,
		status,
		resource_key:
			normalizeOptionalString(getField(raw, 'resource_key', 'resourceKey'), 180) ?? null,
		job_id: normalizeJobId(raw.job),
		...(message ? { message } : {})
	};
}

function buildConfigurationStatus(params: {
	entities: ExtractedLibriEntity[];
	idempotencyKey: string;
	attemptedAt: string;
	message: string;
}): LibriEntityHandoffStatus {
	return {
		status: 'not_configured',
		attempted_at: params.attemptedAt,
		idempotency_key: params.idempotencyKey,
		message: params.message,
		results: params.entities.map((entity) => ({
			entity_type: entity.entity_type,
			canonical_query: entity.canonical_query,
			status: 'error',
			resource_key: null,
			job_id: null,
			message: params.message
		}))
	};
}

function buildFailureStatus(params: {
	entities: ExtractedLibriEntity[];
	idempotencyKey: string;
	attemptedAt: string;
	message: string;
	httpStatus?: number;
}): LibriEntityHandoffStatus {
	return {
		status: 'failed',
		attempted_at: params.attemptedAt,
		idempotency_key: params.idempotencyKey,
		message: params.message,
		...(params.httpStatus ? { http_status: params.httpStatus } : {}),
		results: params.entities.map((entity) => ({
			entity_type: entity.entity_type,
			canonical_query: entity.canonical_query,
			status: 'error',
			resource_key: null,
			job_id: null,
			message: params.message
		}))
	};
}

function normalizeHandoffPayload(params: {
	payload: unknown;
	entities: ExtractedLibriEntity[];
	idempotencyKey: string;
	attemptedAt: string;
	httpStatus: number;
}): LibriEntityHandoffStatus {
	if (!isRecord(params.payload)) {
		return buildFailureStatus({
			entities: params.entities,
			idempotencyKey: params.idempotencyKey,
			attemptedAt: params.attemptedAt,
			httpStatus: params.httpStatus,
			message: 'Libri returned an invalid entity handoff response.'
		});
	}

	const rawResults = Array.isArray(params.payload.results) ? params.payload.results : [];
	const results = params.entities.map((entity, index) =>
		normalizeResult(rawResults[index], entity)
	);
	const hasMissingResults = rawResults.length !== params.entities.length;
	const hasEntityErrors = results.some((result) => result.status === 'error');
	const message = normalizeOptionalString(params.payload.message, 240);

	return {
		status: hasMissingResults || hasEntityErrors ? 'partial' : 'sent',
		attempted_at: params.attemptedAt,
		idempotency_key: params.idempotencyKey,
		http_status: params.httpStatus,
		results,
		...(message ? { message } : {})
	};
}

export async function handoffLibriSessionEntities(
	input: LibriSessionHandoffInput,
	options: LibriEntityHandoffClientOptions = {}
): Promise<LibriEntityHandoffStatus | null> {
	const entities = getEligibleLibriCandidates(input.extractedEntities);
	if (entities.length === 0) return null;

	const now = options.now ?? (() => new Date());
	const attemptedAt = now().toISOString();
	const idempotencyKey = buildLibriHandoffIdempotencyKey(input.sessionId, entities);
	const config = readConfig(options.env ?? process.env);

	if (!config.enabled) {
		return buildConfigurationStatus({
			entities,
			idempotencyKey,
			attemptedAt,
			message: 'Libri integration is disabled for this BuildOS environment.'
		});
	}

	if (!config.apiBaseUrl || !config.apiKey) {
		return buildConfigurationStatus({
			entities,
			idempotencyKey,
			attemptedAt,
			message: 'Libri is not configured for this BuildOS environment.'
		});
	}

	const url = buildApiUrl(config.apiBaseUrl);
	if (!url) {
		return buildConfigurationStatus({
			entities,
			idempotencyKey,
			attemptedAt,
			message: 'Libri API base URL is invalid.'
		});
	}

	const fetcher = options.fetchFn ?? fetch;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

	try {
		const response = await fetcher(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${config.apiKey}`,
				'Idempotency-Key': idempotencyKey
			},
			body: JSON.stringify(buildRequestPayload(input, entities)),
			signal: controller.signal
		});

		if (!response.ok) {
			const payload = await parseJsonResponse(response);
			const error = extractErrorPayload(payload);
			const message = error.message
				? redactSecret(error.message, config.apiKey)
				: `Libri entity handoff failed with HTTP ${response.status}.`;
			return buildFailureStatus({
				entities,
				idempotencyKey,
				attemptedAt,
				httpStatus: response.status,
				message
			});
		}

		const payload = await parseJsonResponse(response);
		return normalizeHandoffPayload({
			payload,
			entities,
			idempotencyKey,
			attemptedAt,
			httpStatus: response.status
		});
	} catch (error) {
		const isAbort =
			error instanceof Error &&
			(error.name === 'AbortError' || error.message === 'AbortError');
		const message = isAbort
			? 'Libri entity handoff timed out.'
			: redactSecret(error instanceof Error ? error.message : String(error), config.apiKey);
		return buildFailureStatus({
			entities,
			idempotencyKey,
			attemptedAt,
			message
		});
	} finally {
		clearTimeout(timeout);
	}
}
