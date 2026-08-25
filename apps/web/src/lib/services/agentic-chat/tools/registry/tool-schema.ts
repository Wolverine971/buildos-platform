// apps/web/src/lib/services/agentic-chat/tools/registry/tool-schema.ts
import { getToolRegistry, type RegistryOp } from '@buildos/agentic-chat-runtime/catalog';
import type { ToolJsonObjectSchema, ToolJsonSchema } from '@buildos/shared-types';
import { normalizeGatewayOpName } from './gateway-op-aliases';

export type ToolSchemaOptions = {
	include_examples?: boolean;
	include_schema?: boolean;
};

function formatDirectUsage(toolName: string): string {
	return `${toolName}({ ... })`;
}

function getSchemaRequiredArgs(schema: ToolJsonSchema): string[] {
	return schema.required ?? [];
}

function getSchemaProperties(schema: ToolJsonSchema): Record<string, ToolJsonSchema> {
	return schema.properties ?? {};
}

function formatSchemaArgs(schema: ToolJsonObjectSchema): Array<Record<string, unknown>> {
	const properties = getSchemaProperties(schema);
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

function buildExampleArguments(schema: ToolJsonSchema): Record<string, unknown> {
	const args: Record<string, unknown> = {};
	const properties = getSchemaProperties(schema);

	for (const name of getSchemaRequiredArgs(schema)) {
		const property = properties[name];
		args[name] = buildExampleValue(name, property ?? {});
	}

	return args;
}

function buildExampleValue(name: string, property: ToolJsonSchema): unknown {
	if (Object.prototype.hasOwnProperty.call(property, 'default')) return property.default;
	if (Array.isArray(property.enum) && property.enum.length > 0) return property.enum[0];

	const type = Array.isArray(property.type)
		? (property.type.find((candidate) => candidate !== 'null') ?? property.type[0])
		: property.type;
	if (type === 'object') return buildExampleArguments(property);
	if (type === 'array') {
		const itemSchema = Array.isArray(property.items) ? property.items[0] : property.items;
		if ((property.minItems ?? 0) > 0 && itemSchema) {
			return [buildExampleValue('item', itemSchema)];
		}
		return [];
	}
	if (type === 'boolean') return false;
	if (type === 'number' || type === 'integer') {
		if (typeof property.minimum === 'number') return property.minimum;
		if (typeof property.exclusiveMinimum === 'number') return property.exclusiveMinimum + 1;
		return 0;
	}
	if (property.format === 'email') return 'user@example.com';
	if (name.endsWith('_id')) return `<${name}_uuid>`;
	if (name === 'type_key' && property.pattern?.startsWith('^project')) {
		return 'project.business.initiative';
	}
	return `<${name}>`;
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
