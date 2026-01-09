// apps/web/src/routes/api/onto/projects/instantiate/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type { ProjectSpec } from '$lib/types/onto';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import {
	instantiateProject,
	validateProjectSpec,
	OntologyInstantiationError
} from '$lib/services/ontology/instantiation.service';

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const body = (await request.json()) as unknown;

		const validation = validateProjectSpec(body);
		if (!validation.valid) {
			const errorLogger = ErrorLoggerService.getInstance(supabase);
			const { requestId, incomingRequestId } = resolveRequestIds(request);
			const sanitizedPayload = sanitizeProjectSpecForLogging(body);
			await errorLogger.logError(
				new Error('Invalid ProjectSpec'),
				{
					userId: user.id,
					endpoint: '/api/onto/projects/instantiate',
					httpMethod: 'POST',
					requestId,
					operationType: 'project_spec_validation',
					operationPayload: sanitizedPayload,
					metadata: {
						validationErrors: validation.errors,
						changeSource: request.headers.get('x-change-source') || undefined,
						chatSessionId: request.headers.get('x-chat-session-id') || undefined,
						incomingRequestId
					}
				},
				'warning'
			);

			return ApiResponse.badRequest('Invalid ProjectSpec', {
				errors: validation.errors
			});
		}

		const spec = body as ProjectSpec;

		const typedSupabase = supabase as unknown as TypedSupabaseClient;
		const result = await instantiateProject(typedSupabase, spec, user.id);

		return ApiResponse.success({
			project_id: result.project_id,
			counts: result.counts
		});
	} catch (err) {
		if (err instanceof OntologyInstantiationError) {
			return ApiResponse.badRequest(err.message);
		}

		console.error('[Ontology] Project instantiation failed:', err);
		return ApiResponse.error(
			'Project instantiation failed',
			500,
			undefined,
			err instanceof Error ? err.message : 'Unknown error'
		);
	}
};

const MAX_SAMPLE_ENTRIES = 5;
const MAX_KEY_SAMPLE = 25;
const SENSITIVE_STRING_FIELDS = new Set([
	'name',
	'title',
	'description',
	'text',
	'content',
	'body_markdown',
	'rationale',
	'outcome',
	'impact',
	'measurement_criteria',
	'definition',
	'uri',
	'snapshot_uri'
]);

function resolveRequestIds(request: Request): {
	requestId: string;
	incomingRequestId?: string;
} {
	const incomingRequestId =
		request.headers.get('x-request-id') ||
		request.headers.get('x-correlation-id') ||
		request.headers.get('x-vercel-id') ||
		undefined;
	const requestId =
		incomingRequestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	return { requestId, incomingRequestId };
}

function sanitizeProjectSpecForLogging(payload: unknown): Record<string, unknown> {
	if (!isPlainObject(payload)) {
		return {
			type: Array.isArray(payload) ? 'array' : typeof payload
		};
	}

	const obj = payload as Record<string, unknown>;
	const knownKeys = new Set([
		'project',
		'entities',
		'relationships',
		'context_document',
		'clarifications',
		'meta'
	]);
	const extraKeys = Object.keys(obj).filter((key) => !knownKeys.has(key));

	return {
		key_summary: summarizeKeys(obj),
		extra_keys: extraKeys.length ? extraKeys.slice(0, MAX_KEY_SAMPLE) : undefined,
		project: sanitizeProject(obj.project),
		entities: sanitizeEntities(obj.entities),
		relationships: sanitizeRelationships(obj.relationships),
		context_document: sanitizeContextDocument(obj.context_document),
		clarifications: sanitizeClarifications(obj.clarifications),
		meta: sanitizeMeta(obj.meta)
	};
}

function sanitizeProject(value: unknown): Record<string, unknown> | undefined {
	if (value === undefined) return undefined;
	if (!isPlainObject(value)) {
		return { type: Array.isArray(value) ? 'array' : typeof value };
	}
	const obj = value as Record<string, unknown>;
	return {
		key_summary: summarizeKeys(obj),
		type_key: stringOrUndefined(obj.type_key),
		state_key: stringOrUndefined(obj.state_key),
		facet_context: stringOrUndefined(obj.facet_context),
		facet_scale: stringOrUndefined(obj.facet_scale),
		facet_stage: stringOrUndefined(obj.facet_stage),
		name_length: stringLength(obj.name),
		description_length: stringLength(obj.description),
		props_keys: isPlainObject(obj.props)
			? summarizeKeys(obj.props as Record<string, unknown>)
			: undefined
	};
}

function sanitizeEntities(value: unknown): Record<string, unknown> | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) {
		return { type: Array.isArray(value) ? 'array' : typeof value };
	}
	const kinds: Record<string, number> = {};
	let invalidCount = 0;
	for (const entry of value) {
		if (isPlainObject(entry) && typeof entry.kind === 'string') {
			kinds[entry.kind] = (kinds[entry.kind] || 0) + 1;
		} else {
			invalidCount += 1;
		}
	}
	return {
		count: value.length,
		kinds,
		invalid_count: invalidCount || undefined,
		sample: value
			.slice(0, MAX_SAMPLE_ENTRIES)
			.map((entry, index) => sanitizeEntity(entry, index))
	};
}

function sanitizeEntity(value: unknown, index: number): Record<string, unknown> {
	if (!isPlainObject(value)) {
		return {
			index,
			type: Array.isArray(value) ? 'array' : typeof value
		};
	}
	const obj = value as Record<string, unknown>;
	const stringLengths: Record<string, number> = {};
	for (const field of SENSITIVE_STRING_FIELDS) {
		const length = stringLength(obj[field]);
		if (length !== undefined) {
			stringLengths[field] = length;
		}
	}
	return {
		index,
		key_summary: summarizeKeys(obj),
		kind: stringOrUndefined(obj.kind),
		temp_id: sanitizeTempId(obj.temp_id),
		string_lengths: Object.keys(stringLengths).length ? stringLengths : undefined
	};
}

function sanitizeRelationships(value: unknown): Record<string, unknown> | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) {
		return { type: Array.isArray(value) ? 'array' : typeof value };
	}
	const shapes = { array: 0, object: 0, other: 0 };
	const arrayLengths: Record<string, number> = {};
	for (const entry of value) {
		if (Array.isArray(entry)) {
			shapes.array += 1;
			const lenKey = String(entry.length);
			arrayLengths[lenKey] = (arrayLengths[lenKey] || 0) + 1;
		} else if (isPlainObject(entry)) {
			shapes.object += 1;
		} else {
			shapes.other += 1;
		}
	}
	return {
		count: value.length,
		shapes,
		array_lengths: Object.keys(arrayLengths).length ? arrayLengths : undefined,
		sample: value
			.slice(0, MAX_SAMPLE_ENTRIES)
			.map((entry, index) => sanitizeRelationship(entry, index))
	};
}

function sanitizeRelationship(value: unknown, index: number): Record<string, unknown> {
	if (Array.isArray(value)) {
		return {
			index,
			type: 'array',
			length: value.length,
			items: value.slice(0, 2).map((entry) => sanitizeRelationshipNode(entry))
		};
	}
	if (!isPlainObject(value)) {
		return {
			index,
			type: Array.isArray(value) ? 'array' : typeof value
		};
	}
	const obj = value as Record<string, unknown>;
	return {
		index,
		type: 'object',
		key_summary: summarizeKeys(obj),
		from: sanitizeRelationshipNode(obj.from),
		to: sanitizeRelationshipNode(obj.to),
		rel: stringOrUndefined(obj.rel),
		intent: stringOrUndefined(obj.intent)
	};
}

function sanitizeRelationshipNode(value: unknown): Record<string, unknown> {
	if (!isPlainObject(value)) {
		return {
			type: Array.isArray(value) ? 'array' : typeof value
		};
	}
	const obj = value as Record<string, unknown>;
	return {
		key_summary: summarizeKeys(obj),
		temp_id: sanitizeTempId(obj.temp_id),
		kind: stringOrUndefined(obj.kind)
	};
}

function sanitizeContextDocument(value: unknown): Record<string, unknown> | undefined {
	if (value === undefined) return undefined;
	if (!isPlainObject(value)) {
		return { type: Array.isArray(value) ? 'array' : typeof value };
	}
	const obj = value as Record<string, unknown>;
	return {
		key_summary: summarizeKeys(obj),
		title_length: stringLength(obj.title),
		content_length: stringLength(obj.content ?? obj.body_markdown),
		type_key: stringOrUndefined(obj.type_key),
		state_key: stringOrUndefined(obj.state_key)
	};
}

function sanitizeClarifications(value: unknown): Record<string, unknown> | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) {
		return { type: Array.isArray(value) ? 'array' : typeof value };
	}
	return {
		count: value.length,
		sample: value.slice(0, MAX_SAMPLE_ENTRIES).map((entry, index) => {
			if (!isPlainObject(entry)) {
				return { index, type: Array.isArray(entry) ? 'array' : typeof entry };
			}
			const obj = entry as Record<string, unknown>;
			return {
				index,
				key_summary: summarizeKeys(obj),
				required: typeof obj.required === 'boolean' ? obj.required : undefined,
				choices_count: Array.isArray(obj.choices) ? obj.choices.length : undefined,
				question_length: stringLength(obj.question)
			};
		})
	};
}

function sanitizeMeta(value: unknown): Record<string, unknown> | undefined {
	if (value === undefined) return undefined;
	if (!isPlainObject(value)) {
		return { type: Array.isArray(value) ? 'array' : typeof value };
	}
	const obj = value as Record<string, unknown>;
	const suggestedFacets = isPlainObject(obj.suggested_facets)
		? summarizeKeys(obj.suggested_facets as Record<string, unknown>)
		: undefined;
	return {
		key_summary: summarizeKeys(obj),
		model: stringOrUndefined(obj.model),
		template_keys_count: Array.isArray(obj.template_keys)
			? obj.template_keys.length
			: undefined,
		confidence: typeof obj.confidence === 'number' ? obj.confidence : undefined,
		suggested_facets: suggestedFacets
	};
}

function summarizeKeys(obj: Record<string, unknown>): {
	keys: string[];
	key_count: number;
} {
	const keys = Object.keys(obj).sort();
	return {
		keys: keys.slice(0, MAX_KEY_SAMPLE),
		key_count: keys.length
	};
}

function sanitizeTempId(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	if (value.length > 64) {
		return `${value.slice(0, 61)}...`;
	}
	return value;
}

function stringOrUndefined(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function stringLength(value: unknown): number | undefined {
	return typeof value === 'string' ? value.length : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
