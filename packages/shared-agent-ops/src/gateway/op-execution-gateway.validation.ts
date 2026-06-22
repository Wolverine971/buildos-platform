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

export type GatewayArgValidationResult =
	| { ok: true; args: Record<string, unknown> }
	| { ok: false; error: GatewayArgValidationError };

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

function mapGatewayArgAlias(
	args: Record<string, unknown>,
	target: string,
	aliases: readonly string[],
	options: { allowNonString?: boolean } = {}
) {
	if (args[target] === undefined) {
		for (const alias of aliases) {
			const value = readGatewayArg(args, alias);
			if (value === undefined) continue;
			if (!options.allowNonString && typeof value !== 'string') continue;
			args[target] = value;
			break;
		}
	}
	deleteFlatGatewayAliases(args, aliases);
}

export function normalizeGatewayOpArgs(
	op: BuildosAgentAllowedOp,
	args: Record<string, unknown>
): Record<string, unknown> {
	if (op !== 'onto.edge.link') {
		return args;
	}

	const normalized = { ...args };
	mapGatewayArgAlias(normalized, 'src_kind', [
		'source_kind',
		'from_kind',
		'from.kind',
		'source.kind',
		'src.kind'
	]);
	mapGatewayArgAlias(normalized, 'src_id', [
		'source_id',
		'from_id',
		'from.id',
		'source.id',
		'src.id'
	]);
	mapGatewayArgAlias(normalized, 'dst_kind', [
		'target_kind',
		'tgt_kind',
		'to_kind',
		'to.kind',
		'target.kind',
		'tgt.kind',
		'dst.kind'
	]);
	mapGatewayArgAlias(normalized, 'dst_id', [
		'target_id',
		'tgt_id',
		'to_id',
		'to.id',
		'target.id',
		'tgt.id',
		'dst.id'
	]);
	mapGatewayArgAlias(normalized, 'rel', [
		'relationship',
		'relation',
		'relationship_type',
		'edge_type',
		'type'
	]);
	mapGatewayArgAlias(normalized, 'props', ['edge_props', 'metadata'], { allowNonString: true });
	return normalized;
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
}): GatewayArgValidationResult {
	const args = normalizeGatewayOpArgs(params.op, coerceGatewayArgs(params.args));
	const error = validateGatewayArgs(params.schema, args);
	if (error) {
		return { ok: false, error };
	}
	return { ok: true, args };
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
