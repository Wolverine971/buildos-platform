// packages/shared-agent-ops/src/gateway/op-execution-gateway.validation.ts
//
// Shared gateway argument normalization and schema validation. External
// execution, worker commit, and staged proposals all go through this module so
// they reject malformed args the same way.
import {
	isValidUUID,
	type BuildosAgentAllowedOp,
	type ToolJsonObjectSchema,
	type ToolJsonSchema
} from '@buildos/shared-types';
import { normalizeTaskStateInput } from '../ontology/task-state';
import { EXTERNAL_WRITE_OP_SCHEMAS } from './op-execution-gateway.config';

export type GatewayArgValidationError = {
	code: 'VALIDATION_ERROR';
	message: string;
};

export type GatewayLegacyArgAliasUsage = {
	alias: string;
	target: string;
};

export type GatewayArgValidationResult =
	| {
			ok: true;
			args: Record<string, unknown>;
			legacyAliasesUsed: GatewayLegacyArgAliasUsage[];
	  }
	| {
			ok: false;
			error: GatewayArgValidationError;
			legacyAliasesUsed: GatewayLegacyArgAliasUsage[];
	  };

type GatewayArgAliasGroup = {
	target: string;
	aliases: readonly string[];
	allowNonString?: boolean;
	normalize?: boolean;
	unwrapSingletonArray?: boolean;
};

const GATEWAY_ARG_ALIAS_GROUPS: Partial<
	Record<BuildosAgentAllowedOp, readonly GatewayArgAliasGroup[]>
> = {
	'onto.edge.link': [
		{
			target: 'src_kind',
			aliases: [
				'source_kind',
				'from_kind',
				'from_type',
				'from.kind',
				'source.kind',
				'src.kind'
			],
			normalize: true
		},
		{
			target: 'src_id',
			aliases: ['source_id', 'from_id', 'from.id', 'source.id', 'src.id'],
			normalize: true
		},
		{
			target: 'dst_kind',
			aliases: [
				'target_kind',
				'tgt_kind',
				'to_kind',
				'to_type',
				'to.kind',
				'target.kind',
				'tgt.kind',
				'dst.kind'
			],
			normalize: true
		},
		{
			target: 'dst_id',
			aliases: ['target_id', 'tgt_id', 'to_id', 'to.id', 'target.id', 'tgt.id', 'dst.id'],
			normalize: true
		},
		{
			target: 'rel',
			aliases: ['relationship', 'relation', 'relationship_type', 'edge_type', 'type'],
			normalize: true
		},
		{
			target: 'props',
			aliases: ['edge_props', 'metadata'],
			allowNonString: true,
			normalize: true
		}
	],
	'onto.document.create': [
		{ target: 'content', aliases: ['body_markdown'], normalize: true },
		{ target: 'parent_document_id', aliases: ['parent_id'], normalize: true }
	],
	'onto.document.update': [{ target: 'content', aliases: ['body_markdown'], normalize: true }],
	'onto.task.create': [
		{ target: 'title', aliases: ['name'], normalize: true },
		{
			target: 'goal_id',
			aliases: ['goal_ids'],
			normalize: true,
			unwrapSingletonArray: true
		},
		{
			target: 'supporting_milestone_id',
			aliases: ['milestone_id'],
			normalize: true
		}
	],
	'onto.task.update': [
		{ target: 'title', aliases: ['name'], normalize: true },
		{
			target: 'goal_id',
			aliases: ['goal_ids'],
			normalize: true,
			unwrapSingletonArray: true
		},
		{
			target: 'supporting_milestone_id',
			aliases: ['milestone_id'],
			normalize: true
		}
	]
};

export function coerceGatewayArgs(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function validateRequiredArgs(
	schema: ToolJsonObjectSchema,
	args: Record<string, unknown>
): string[] {
	const required = schema.required ?? [];
	return required.filter((field) => args[field] === undefined);
}

export function validateUnexpectedArgs(
	schema: ToolJsonObjectSchema,
	args: Record<string, unknown>
): string[] {
	if (schema.additionalProperties !== false) {
		return [];
	}

	const allowed = new Set(Object.keys(schema.properties));
	return Object.keys(args).filter((field) => !allowed.has(field));
}

function readGatewayArg(args: Record<string, unknown>, alias: string): unknown {
	if (Object.prototype.hasOwnProperty.call(args, alias)) {
		return args[alias];
	}

	if (!alias.includes('.')) {
		return undefined;
	}

	let current: unknown = args;
	for (const part of alias.split('.')) {
		if (!current || typeof current !== 'object' || Array.isArray(current)) {
			return undefined;
		}
		const record = current as Record<string, unknown>;
		if (!Object.prototype.hasOwnProperty.call(record, part)) {
			return undefined;
		}
		current = record[part];
	}
	return current;
}

function deleteFlatGatewayAliases(args: Record<string, unknown>, aliases: readonly string[]) {
	for (const alias of aliases) {
		if (!alias.includes('.')) {
			delete args[alias];
		}
	}
}

function mapGatewayArgAlias(args: Record<string, unknown>, group: GatewayArgAliasGroup) {
	let mapped = args[group.target] !== undefined;
	if (args[group.target] === undefined) {
		for (const alias of group.aliases) {
			const rawValue = readGatewayArg(args, alias);
			const value = group.unwrapSingletonArray
				? Array.isArray(rawValue) && rawValue.length === 1
					? rawValue[0]
					: undefined
				: rawValue;
			if (value === undefined) continue;
			if (!group.allowNonString && typeof value !== 'string') continue;
			args[group.target] = value;
			mapped = true;
			break;
		}
	}
	if (mapped) deleteFlatGatewayAliases(args, group.aliases);
}

export function normalizeGatewayOpArgs(
	op: BuildosAgentAllowedOp,
	args: Record<string, unknown>
): Record<string, unknown> {
	const groups = GATEWAY_ARG_ALIAS_GROUPS[op] ?? [];
	if (groups.length === 0) {
		return args;
	}

	const normalized = { ...args };
	for (const group of groups) {
		if (group.normalize) {
			mapGatewayArgAlias(normalized, group);
		}
	}
	if (
		(op === 'onto.task.create' || op === 'onto.task.update') &&
		typeof normalized.state_key === 'string'
	) {
		const state = normalizeTaskStateInput(normalized.state_key);
		if (state) normalized.state_key = state;
	}
	return normalized;
}

export function detectGatewayLegacyArgAliases(
	op: BuildosAgentAllowedOp,
	args: Record<string, unknown>
): GatewayLegacyArgAliasUsage[] {
	const groups = GATEWAY_ARG_ALIAS_GROUPS[op] ?? [];
	const used: GatewayLegacyArgAliasUsage[] = [];

	for (const group of groups) {
		for (const alias of group.aliases) {
			if (readGatewayArg(args, alias) !== undefined) {
				used.push({ alias, target: group.target });
			}
		}
	}

	return used;
}

export function validateGatewayArgs(
	schema: ToolJsonObjectSchema | undefined,
	args: Record<string, unknown>
): GatewayArgValidationError | null {
	if (!schema) {
		return null;
	}

	const missing = validateRequiredArgs(schema, args);
	if (missing.length > 0) {
		return {
			code: 'VALIDATION_ERROR',
			message: `Missing required parameter${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`
		};
	}

	const unexpected = validateUnexpectedArgs(schema, args);
	if (unexpected.length > 0) {
		return {
			code: 'VALIDATION_ERROR',
			message: `Unsupported parameter${unexpected.length === 1 ? '' : 's'}: ${unexpected.join(', ')}`
		};
	}

	const schemaError = validateGatewaySchemaValue(schema, args, '');
	if (schemaError) {
		return {
			code: 'VALIDATION_ERROR',
			message: schemaError
		};
	}

	return null;
}

function matchesGatewaySchemaType(type: string, value: unknown): boolean {
	switch (type) {
		case 'null':
			return value === null;
		case 'array':
			return Array.isArray(value);
		case 'object':
			return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
		case 'integer':
			return typeof value === 'number' && Number.isInteger(value);
		case 'number':
			return typeof value === 'number' && Number.isFinite(value);
		default:
			return typeof value === type;
	}
}

function describeGatewaySchemaTypes(types: readonly string[]): string {
	if (types.length === 1) return types[0]!;
	return types.slice(0, -1).join(', ') + `, or ${types.at(-1)}`;
}

function validateGatewaySchemaValue(
	schema: ToolJsonSchema,
	value: unknown,
	path: string
): string | null {
	const types = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : [];
	if (types.length > 0 && !types.some((type) => matchesGatewaySchemaType(type, value))) {
		return `${path} must be ${describeGatewaySchemaTypes(types)}`;
	}

	if (typeof value === 'string') {
		if (schema.format === 'uuid' && !isValidUUID(value.trim())) {
			return `${path} must be a valid UUID`;
		}
		if (schema.enum && !schema.enum.includes(value)) {
			return `${path} must be one of: ${schema.enum.join(', ')}`;
		}
	}
	if (typeof value === 'number') {
		if (typeof schema.minimum === 'number' && value < schema.minimum) {
			return `${path} must be at least ${schema.minimum}`;
		}
		if (typeof schema.maximum === 'number' && value > schema.maximum) {
			return `${path} must be at most ${schema.maximum}`;
		}
	}

	if (Array.isArray(value)) {
		if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
			return `${path} must contain at least ${schema.minItems} item(s)`;
		}
		if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
			return `${path} must contain at most ${schema.maxItems} item(s)`;
		}
		if (schema.items && !Array.isArray(schema.items)) {
			for (let index = 0; index < value.length; index += 1) {
				const error = validateGatewaySchemaValue(
					schema.items,
					value[index],
					`${path}[${index}]`
				);
				if (error) return error;
			}
		}
	}

	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const record = value as Record<string, unknown>;
		const properties = schema.properties ?? {};
		for (const required of schema.required ?? []) {
			const requiredPath = path ? `${path}.${required}` : required;
			if (record[required] === undefined) return `${requiredPath} is required`;
		}
		if (schema.additionalProperties === false) {
			const unexpected = Object.keys(record).filter(
				(key) => !Object.prototype.hasOwnProperty.call(properties, key)
			);
			if (unexpected.length > 0) {
				return `${path} has unsupported parameter${unexpected.length === 1 ? '' : 's'}: ${unexpected.join(', ')}`;
			}
		}
		for (const [key, childSchema] of Object.entries(properties)) {
			if (record[key] === undefined) continue;
			const childPath = path ? `${path}.${key}` : key;
			const error = validateGatewaySchemaValue(childSchema, record[key], childPath);
			if (error) return error;
		}
	}

	return null;
}

export function normalizeAndValidateGatewayArgs(params: {
	op: BuildosAgentAllowedOp;
	args: unknown;
	schema?: ToolJsonObjectSchema;
	allowLegacyAliases?: boolean;
}): GatewayArgValidationResult {
	const rawArgs = coerceGatewayArgs(params.args);
	const legacyAliasesUsed = detectGatewayLegacyArgAliases(params.op, rawArgs);
	if (params.allowLegacyAliases === false && legacyAliasesUsed.length > 0) {
		const aliases = legacyAliasesUsed.map((usage) => usage.alias);
		return {
			ok: false,
			error: {
				code: 'VALIDATION_ERROR',
				message: `Unsupported compatibility parameter${aliases.length === 1 ? '' : 's'}: ${aliases.join(', ')}`
			},
			legacyAliasesUsed
		};
	}
	const args = normalizeGatewayOpArgs(params.op, rawArgs);
	const error = validateGatewayArgs(params.schema, args);
	if (error) {
		return { ok: false, error, legacyAliasesUsed };
	}
	return { ok: true, args, legacyAliasesUsed };
}

export function normalizeAndValidateGatewayWriteArgs(
	op: BuildosAgentAllowedOp,
	args: unknown
): GatewayArgValidationResult {
	return normalizeAndValidateGatewayArgs({
		op,
		args,
		schema: EXTERNAL_WRITE_OP_SCHEMAS[op]
	});
}
