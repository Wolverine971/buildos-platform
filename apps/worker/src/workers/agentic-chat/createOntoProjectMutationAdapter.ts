// apps/worker/src/workers/agentic-chat/createOntoProjectMutationAdapter.ts
import { runGatewayWriteOp } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import { type Database, type JsonObject } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	buildAgenticChatProjectContextDocumentV1,
	normalizeAgenticChatProjectStateV1
} from '@buildos/agentic-chat-runtime/loop';
import type { AgenticChatMutatingToolPortV1 } from './mutation-executor';
import {
	type MutationInput,
	assertMutationAdapterBoundary,
	assertMutationReceiptSize,
	canonicalGatewayError,
	canonicalMutationReceipt,
	canonicalUuid,
	isRecord,
	knownFailure,
	requestProjectId,
	throwGatewayResultFailure,
	uncertainFailure
} from './mutationAdapterBoundary';
import { AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1 } from './mutationToolCatalog';

const TOOL_NAME = 'create_onto_project';
const MUTATION_SPEC = AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1[TOOL_NAME];
const REVIEWED_ARGUMENT_NAMES = new Set(MUTATION_SPEC.reviewedArgumentNames);
const PROJECT_FIELDS = new Set([
	'name',
	'type_key',
	'description',
	'state_key',
	'props',
	'start_at',
	'end_at'
]);
const PROJECT_STATES = new Set(['planning', 'active', 'paused', 'completed', 'cancelled']);
const PROJECT_TYPE_PATTERN = /^project\.[a-z_]+\.[a-z_]+(?:\.[a-z_]+)?$/;
const FICTION_PROJECT_TYPE_PATTERN =
	/^project\.creative\.(?:novel|book|fiction|screenplay)(?:\.|$)/i;
const FACET_VALUES = {
	context: new Set([
		'personal',
		'client',
		'commercial',
		'internal',
		'open_source',
		'community',
		'academic',
		'nonprofit',
		'startup'
	]),
	scale: new Set(['micro', 'small', 'medium', 'large', 'epic']),
	stage: new Set(['discovery', 'planning', 'execution', 'launch', 'maintenance', 'complete'])
} as const;
const EXPECTED_COUNTS = {
	goals: 0,
	requirements: 0,
	plans: 0,
	tasks: 0,
	documents: 1,
	sources: 0,
	metrics: 0,
	milestones: 0,
	risks: 0,
	edges: 0
} as const;

type GatewayRunner = typeof runGatewayWriteOp;

/**
 * One-attempt adapter for a deliberately bounded project shell.
 *
 * The shared instantiator creates a project and its Context document through
 * several writes without a durable domain effect key. Any thrown or malformed
 * post-dispatch outcome is therefore uncertain and must never be replayed.
 */
export class AgenticChatCreateOntoProjectMutationAdapter implements AgenticChatMutatingToolPortV1 {
	private readonly runGateway: GatewayRunner;

	constructor(
		private readonly client: SupabaseClient<Database>,
		options: { runGateway?: GatewayRunner; now?: () => number } = {}
	) {
		this.runGateway = options.runGateway ?? runGatewayWriteOp;
		this.now = options.now ?? Date.now;
	}

	private readonly now: () => number;

	async execute(input: MutationInput): Promise<JsonObject> {
		assertMutationAdapterBoundary(input, {
			toolName: TOOL_NAME,
			operationName: MUTATION_SPEC.operationName,
			downstreamIdempotencySupported: MUTATION_SPEC.downstreamIdempotencySupported,
			reviewedArgumentNames: REVIEWED_ARGUMENT_NAMES
		});
		assertProjectCreateContext(input);

		const project = normalizeProjectShell(input.arguments);
		const contextDocument = buildContextDocument(project, this.now());
		const gatewayArguments = {
			project,
			entities: [],
			relationships: [],
			context_document: contextDocument
		};

		let result: Awaited<ReturnType<GatewayRunner>>;
		try {
			result = await this.runGateway({
				admin: this.client,
				userId: input.executionInput.claim.userId,
				scope: {
					mode: 'read_write',
					allowed_ops: [MUTATION_SPEC.operationName],
					project_ids: [],
					write_project_ids: []
				},
				op: MUTATION_SPEC.operationName,
				args: gatewayArguments,
				chatSessionId: input.executionInput.claim.sessionId
			});
		} catch (error) {
			throw uncertainFailure(
				'create_onto_project_gateway_threw',
				canonicalGatewayError(error, TOOL_NAME)
			);
		}

		if (!result.ok) {
			throwGatewayResultFailure(TOOL_NAME, result.error);
		}

		const downstream = requireProjectShellReceipt(result.data, project.name);
		const summary = Object.entries(downstream.counts)
			.filter(([, value]) => value > 0)
			.map(([entity, value]) => `${value} ${entity.replace(/_/g, ' ')}`)
			.join(', ');
		const receipt = canonicalMutationReceipt(
			{
				project_id: downstream.projectId,
				counts: downstream.counts,
				created_entities: downstream.createdEntities,
				message:
					`Created project "${project.name}" (ID: ${downstream.projectId})` +
					(summary ? ` with ${summary}` : ''),
				context_shift: {
					new_context: 'project',
					entity_id: downstream.projectId,
					entity_name: project.name,
					entity_type: 'project'
				}
			},
			TOOL_NAME
		);
		assertMutationReceiptSize(receipt, TOOL_NAME);
		return receipt;
	}
}

function assertProjectCreateContext(input: MutationInput): void {
	const context = input.executionInput.requestPayload.context;
	if (!isRecord(context)) {
		throw knownFailure('mutation_context_invalid', 'Mutation turn context is invalid');
	}
	if (!['global', 'general', 'project_create'].includes(String(context.type))) {
		throw knownFailure(
			'mutation_context_invalid',
			'create_onto_project is available only outside an existing project context'
		);
	}
	if (requestProjectId(input) !== null) {
		throw knownFailure(
			'mutation_context_invalid',
			'create_onto_project cannot inherit an existing project scope'
		);
	}
}

function normalizeProjectShell(args: JsonObject): JsonObject & { name: string } {
	if (!Array.isArray(args.entities) || args.entities.length !== 0) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'create_onto_project requires an empty entities array'
		);
	}
	if (!Array.isArray(args.relationships) || args.relationships.length !== 0) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'create_onto_project requires an empty relationships array'
		);
	}
	if (!isRecord(args.project)) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'create_onto_project requires a project object'
		);
	}
	const unsupported = Object.keys(args.project).filter((field) => !PROJECT_FIELDS.has(field));
	if (unsupported.length > 0) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			`create_onto_project project contains unsupported fields: ${unsupported.sort().join(', ')}`
		);
	}

	const name = requireText(args.project.name, 'project.name');
	if (['undefined', 'null'].includes(name.toLowerCase())) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'project.name must be a real project name'
		);
	}
	const typeKey = requireText(args.project.type_key, 'project.type_key');
	if (!PROJECT_TYPE_PATTERN.test(typeKey)) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'project.type_key must use project.{realm}.{domain} lowercase format'
		);
	}
	if (FICTION_PROJECT_TYPE_PATTERN.test(typeKey)) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'This tool cannot create fiction or living-reference projects'
		);
	}

	const project: Record<string, unknown> = { name, type_key: typeKey };
	if (args.project.description !== undefined) {
		if (typeof args.project.description !== 'string') {
			throw knownFailure(
				'mutation_arguments_not_admitted',
				'project.description must be a string'
			);
		}
		project.description = args.project.description;
	}
	if (args.project.state_key !== undefined) {
		const state = normalizeProjectState(args.project.state_key);
		if (!PROJECT_STATES.has(state)) {
			throw knownFailure(
				'mutation_arguments_not_admitted',
				'project.state_key is not a supported project state'
			);
		}
		project.state_key = state;
	}
	if (args.project.props !== undefined) {
		const props = normalizeProjectProps(args.project.props);
		if (Object.keys(props).length > 0) project.props = props;
	}
	for (const [field, boundary] of [
		['start_at', 'start'],
		['end_at', 'end']
	] as const) {
		if (args.project[field] === undefined) continue;
		const normalized = normalizeProjectDate(args.project[field], boundary, field);
		if (normalized !== undefined) project[field] = normalized;
	}
	return project as JsonObject & { name: string };
}

function normalizeProjectProps(value: unknown): JsonObject {
	if (!isRecord(value)) {
		throw knownFailure('mutation_arguments_not_admitted', 'project.props must be an object');
	}
	const unsupported = Object.keys(value).filter((key) => key !== 'facets');
	if (unsupported.length > 0) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			`project.props contains unsupported fields: ${unsupported.sort().join(', ')}`
		);
	}
	if (value.facets === undefined) return {};
	if (!isRecord(value.facets)) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'project.props.facets must be an object'
		);
	}
	const facets: Record<string, string> = {};
	for (const [key, candidate] of Object.entries(value.facets)) {
		if (!Object.hasOwn(FACET_VALUES, key)) {
			throw knownFailure(
				'mutation_arguments_not_admitted',
				`project.props.facets contains unsupported field: ${key}`
			);
		}
		if (
			typeof candidate !== 'string' ||
			!(FACET_VALUES[key as keyof typeof FACET_VALUES] as ReadonlySet<string>).has(candidate)
		) {
			throw knownFailure(
				'mutation_arguments_not_admitted',
				`project.props.facets.${key} is invalid`
			);
		}
		facets[key] = candidate;
	}
	return Object.keys(facets).length > 0 ? { facets } : {};
}

function normalizeProjectState(value: unknown): string {
	return normalizeAgenticChatProjectStateV1(value) ?? '';
}

function normalizeProjectDate(
	value: unknown,
	boundary: 'start' | 'end',
	field: string
): string | undefined {
	if (value === null || value === '') return undefined;
	if (typeof value !== 'string') {
		throw knownFailure('mutation_arguments_not_admitted', `${field} must be a valid date`);
	}
	const raw = value.trim();
	if (!raw) return undefined;

	const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (dateOnly) {
		return calendarBoundary(
			Number(dateOnly[1]),
			Number(dateOnly[2]),
			Number(dateOnly[3]),
			boundary,
			field
		);
	}
	const yearMonth = raw.match(/^(\d{4})-(\d{2})$/);
	if (yearMonth) {
		const year = Number(yearMonth[1]);
		const month = Number(yearMonth[2]);
		const day = boundary === 'end' ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 1;
		return calendarBoundary(year, month, day, boundary, field);
	}
	const yearOnly = raw.match(/^(\d{4})$/);
	if (yearOnly) {
		return boundary === 'end'
			? calendarBoundary(Number(yearOnly[1]), 12, 31, boundary, field)
			: calendarBoundary(Number(yearOnly[1]), 1, 1, boundary, field);
	}
	const parsed = new Date(raw);
	if (Number.isNaN(parsed.getTime())) {
		throw knownFailure('mutation_arguments_not_admitted', `${field} must be a valid date`);
	}
	return parsed.toISOString();
}

function calendarBoundary(
	year: number,
	month: number,
	day: number,
	boundary: 'start' | 'end',
	field: string
): string {
	const parsed = new Date(Date.UTC(year, month - 1, day));
	if (
		month < 1 ||
		month > 12 ||
		day < 1 ||
		parsed.getUTCFullYear() !== year ||
		parsed.getUTCMonth() !== month - 1 ||
		parsed.getUTCDate() !== day
	) {
		throw knownFailure('mutation_arguments_not_admitted', `${field} must be a valid date`);
	}
	const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(
		day
	).padStart(2, '0')}`;
	return boundary === 'end' ? `${date}T23:59:59Z` : `${date}T00:00:00Z`;
}

function buildContextDocument(project: JsonObject & { name: string }, now: number): JsonObject {
	return buildAgenticChatProjectContextDocumentV1({
		name: project.name,
		description: typeof project.description === 'string' ? project.description : null,
		generatedAt: new Date(now).toISOString()
	});
}

function requireProjectShellReceipt(
	value: Record<string, unknown> | undefined,
	expectedName: string
): {
	projectId: string;
	counts: Record<keyof typeof EXPECTED_COUNTS, number>;
	createdEntities: JsonObject[];
} {
	if (!isRecord(value) || !canonicalUuid(value.project_id)) {
		throw uncertainFailure(
			'create_onto_project_receipt_invalid',
			'create_onto_project returned no canonical project ID'
		);
	}
	const projectId = value.project_id;
	if (
		!isRecord(value.project) ||
		value.project.id !== projectId ||
		value.project.name !== expectedName
	) {
		throw uncertainFailure(
			'create_onto_project_receipt_invalid',
			'create_onto_project returned a mismatched project receipt'
		);
	}
	if (!isRecord(value.counts)) {
		throw uncertainFailure(
			'create_onto_project_receipt_invalid',
			'create_onto_project returned no creation counts'
		);
	}
	const counts = value.counts;
	const countKeys = Object.keys(counts).sort();
	const expectedCountKeys = Object.keys(EXPECTED_COUNTS).sort();
	if (
		countKeys.length !== expectedCountKeys.length ||
		countKeys.some((key, index) => key !== expectedCountKeys[index]) ||
		Object.entries(EXPECTED_COUNTS).some(([key, expected]) => counts[key] !== expected)
	) {
		throw uncertainFailure(
			'create_onto_project_receipt_invalid',
			'create_onto_project returned unexpected entity or relationship counts'
		);
	}
	if (!Array.isArray(value.created_entities) || value.created_entities.length !== 2) {
		throw uncertainFailure(
			'create_onto_project_receipt_invalid',
			'create_onto_project returned an unexpected created-entity set'
		);
	}
	const createdEntities = value.created_entities.map((entry) => {
		if (
			!isRecord(entry) ||
			!canonicalUuid(entry.id) ||
			entry.project_id !== projectId ||
			(entry.kind !== 'project' && entry.kind !== 'document')
		) {
			throw uncertainFailure(
				'create_onto_project_receipt_invalid',
				'create_onto_project returned an invalid created-entity receipt'
			);
		}
		return canonicalMutationReceipt(entry, TOOL_NAME);
	});
	const projectRefs = createdEntities.filter(
		(entry) => entry.kind === 'project' && entry.id === projectId
	);
	const documentRefs = createdEntities.filter(
		(entry) => entry.kind === 'document' && entry.id !== projectId
	);
	if (projectRefs.length !== 1 || documentRefs.length !== 1) {
		throw uncertainFailure(
			'create_onto_project_receipt_invalid',
			'create_onto_project did not return exactly one project and one Context document'
		);
	}
	return {
		projectId,
		counts: counts as Record<keyof typeof EXPECTED_COUNTS, number>,
		createdEntities
	};
}

function requireText(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw knownFailure('mutation_arguments_not_admitted', `${field} is required`);
	}
	return value.trim();
}
