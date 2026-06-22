// packages/shared-agent-ops/src/gateway/op-execution-gateway.validation.ts
//
// Shared gateway argument normalization and schema validation. External
// execution, worker commit, and staged proposals all go through this module so
// they reject malformed args the same way.
import type { BuildosAgentAllowedOp } from '@buildos/shared-types';
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
};

const GATEWAY_ARG_ALIAS_GROUPS: Partial<
	Record<BuildosAgentAllowedOp, readonly GatewayArgAliasGroup[]>
> = {
	'onto.edge.link': [
		{
			target: 'src_kind',
			aliases: ['source_kind', 'from_kind', 'from.kind', 'source.kind', 'src.kind'],
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
	'onto.document.update': [{ target: 'content', aliases: ['body_markdown'], normalize: true }]
};

export function coerceGatewayArgs(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function validateRequiredArgs(
	schema: Record<string, any>,
	args: Record<string, unknown>
): string[] {
	const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
	return required.filter((field) => args[field] === undefined);
}

export function validateUnexpectedArgs(
	schema: Record<string, any>,
	args: Record<string, unknown>
): string[] {
	if (schema.additionalProperties !== false) {
		return [];
	}

	const properties = (schema.properties ?? {}) as Record<string, unknown>;
	const allowed = new Set(Object.keys(properties));
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
	if (args[group.target] === undefined) {
		for (const alias of group.aliases) {
			const value = readGatewayArg(args, alias);
			if (value === undefined) continue;
			if (!group.allowNonString && typeof value !== 'string') continue;
			args[group.target] = value;
			break;
		}
	}
	deleteFlatGatewayAliases(args, group.aliases);
}

export function normalizeGatewayOpArgs(
	op: BuildosAgentAllowedOp,
	args: Record<string, unknown>
): Record<string, unknown> {
	if (op !== 'onto.edge.link') {
		return args;
	}

	const normalized = { ...args };
	for (const group of GATEWAY_ARG_ALIAS_GROUPS[op] ?? []) {
		if (group.normalize) {
			mapGatewayArgAlias(normalized, group);
		}
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
	schema: Record<string, any> | undefined,
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

	return null;
}

export function normalizeAndValidateGatewayArgs(params: {
	op: BuildosAgentAllowedOp;
	args: unknown;
	schema?: Record<string, any>;
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
