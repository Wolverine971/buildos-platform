// apps/web/src/lib/services/agentic-chat/tools/registry/tool-schema.ts
import { normalizeGatewayOpName } from './gateway-op-aliases';
import { getToolRegistry, type RegistryOp } from './tool-registry';

export type ToolSchemaOptions = {
	include_examples?: boolean;
	include_schema?: boolean;
};

type SchemaProperty = {
	type?: string | string[];
	description?: string;
	enum?: unknown[];
	default?: unknown;
};

function formatDirectUsage(toolName: string): string {
	return `${toolName}({ ... })`;
}

function getSchemaRequiredArgs(schema: Record<string, any>): string[] {
	return Array.isArray(schema.required)
		? schema.required.filter((entry: unknown): entry is string => typeof entry === 'string')
		: [];
}

function formatSchemaArgs(schema: Record<string, any>): Array<Record<string, unknown>> {
	const properties =
		schema.properties &&
		typeof schema.properties === 'object' &&
		!Array.isArray(schema.properties)
			? (schema.properties as Record<string, SchemaProperty>)
			: {};
	const required = new Set(getSchemaRequiredArgs(schema));

	return Object.entries(properties).map(([name, property]) => ({
		name,
		type: Array.isArray(property.type) ? property.type.join('|') : (property.type ?? 'unknown'),
		required: required.has(name),
		description: property.description,
		enum: Array.isArray(property.enum) ? property.enum : undefined,
		default: property.default
	}));
}

function buildExampleArguments(schema: Record<string, any>): Record<string, unknown> {
	const args: Record<string, unknown> = {};
	const properties =
		schema.properties &&
		typeof schema.properties === 'object' &&
		!Array.isArray(schema.properties)
			? (schema.properties as Record<string, SchemaProperty>)
			: {};

	for (const name of getSchemaRequiredArgs(schema)) {
		const property = properties[name];
		const type = Array.isArray(property?.type) ? property?.type[0] : property?.type;
		if (Array.isArray(property?.enum) && property.enum.length > 0) {
			args[name] = property.enum[0];
		} else if (type === 'array') {
			args[name] = [];
		} else if (type === 'boolean') {
			args[name] = false;
		} else if (type === 'number' || type === 'integer') {
			args[name] = 0;
		} else if (name.endsWith('_id')) {
			args[name] = `<${name}_uuid>`;
		} else {
			args[name] = `<${name}>`;
		}
	}

	return args;
}

function resolveRegistryEntry(reference: string): RegistryOp | undefined {
	const registry = getToolRegistry();
	const normalized = normalizeGatewayOpName(reference);
	return (
		registry.ops[normalized] ??
		registry.byToolName[reference] ??
		registry.byToolName[normalized]
	);
}

export function getToolSchema(
	opReference: string,
	options: ToolSchemaOptions = {}
): Record<string, unknown> {
	const reference = opReference.trim();
	const entry = resolveRegistryEntry(reference);

	if (!entry) {
		return {
			type: 'not_found',
			op: normalizeGatewayOpName(reference),
			message: 'No tool schema found for this op.'
		};
	}

	const payload: Record<string, unknown> = {
		type: 'tool_schema',
		op: entry.op,
		tool_name: entry.tool_name,
		callable_tool: entry.tool_name,
		summary: entry.description,
		group: entry.group,
		kind: entry.kind,
		entity: entry.entity,
		action: entry.action,
		usage: formatDirectUsage(entry.tool_name),
		required_args: getSchemaRequiredArgs(entry.parameters_schema),
		args: formatSchemaArgs(entry.parameters_schema)
	};

	if (options.include_schema !== false) {
		payload.schema = entry.parameters_schema;
	}

	if (options.include_examples !== false) {
		payload.example_tool_call = {
			name: entry.tool_name,
			arguments: buildExampleArguments(entry.parameters_schema)
		};
	}

	return payload;
}
