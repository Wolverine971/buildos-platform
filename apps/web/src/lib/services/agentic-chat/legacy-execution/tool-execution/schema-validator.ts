// apps/web/src/lib/services/agentic-chat/legacy-execution/tool-execution/schema-validator.ts
import type { ChatToolDefinition } from '@buildos/shared-types';
import { GATEWAY_TOOL_DEFINITIONS } from '@buildos/agentic-chat-runtime/catalog';
import { isToolArgumentRecord, type ToolArguments } from './argument-values';
import { isGatewayToolName } from './gateway-executor';
import { applyCustomToolValidation, validateUuidIdArguments } from './schema-custom-validations';

export type SupportedSchemaType =
	| 'object'
	| 'array'
	| 'string'
	| 'number'
	| 'integer'
	| 'boolean'
	| 'null';

/**
 * The deliberately small schema surface enforced by tool execution.
 * Nested properties are described for consumers, but validation remains at the
 * same argument-property boundary as the legacy facade implementation.
 */
export type SupportedToolSchema = ToolArguments & {
	type?: SupportedSchemaType | SupportedSchemaType[];
	nullable?: boolean;
	required?: string[];
	properties?: Record<string, SupportedToolSchema>;
	enum?: unknown[];
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	format?: 'email';
	minItems?: number;
	maxItems?: number;
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: number;
	exclusiveMaximum?: number;
	anyOf?: SupportedToolSchema[];
	oneOf?: SupportedToolSchema[];
	allOf?: SupportedToolSchema[];
};

export interface ToolValidation {
	isValid: boolean;
	errors: string[];
}

export function getValidationToolDefinitions(
	toolName: string,
	availableTools: ChatToolDefinition[] | undefined
): ChatToolDefinition[] {
	const providedTools = Array.isArray(availableTools) ? availableTools : [];
	if (!isGatewayToolName(toolName)) return providedTools;

	const resolved = [...GATEWAY_TOOL_DEFINITIONS];
	for (const providedTool of providedTools) {
		const providedName = getDefinitionName(providedTool);
		if (!providedName || !isGatewayToolName(providedName)) resolved.push(providedTool);
	}
	return resolved;
}

export function getToolDefinition(
	toolName: string,
	availableTools: ChatToolDefinition[] | undefined
): ChatToolDefinition | undefined {
	if (!Array.isArray(availableTools) || availableTools.length === 0) return undefined;
	return availableTools.find((tool) => getDefinitionName(tool) === toolName);
}

export function getToolParameterSchema(
	toolDefinition: ChatToolDefinition | undefined
): SupportedToolSchema | undefined {
	if (!toolDefinition) return undefined;
	const nestedFunction: unknown = Reflect.get(toolDefinition, 'function');
	const nestedParameters = isToolArgumentRecord(nestedFunction)
		? nestedFunction.parameters
		: undefined;
	const directParameters: unknown = Reflect.get(toolDefinition, 'parameters');
	const schema = nestedParameters ?? directParameters;
	return isToolArgumentRecord(schema) ? (schema as SupportedToolSchema) : undefined;
}

export function toolDefinitionSupportsProjectId(
	toolDefinition: ChatToolDefinition | undefined
): boolean {
	const parameterSchema = getToolParameterSchema(toolDefinition);
	if (!parameterSchema) return false;
	const properties = isToolArgumentRecord(parameterSchema.properties)
		? parameterSchema.properties
		: {};
	const required = Array.isArray(parameterSchema.required)
		? parameterSchema.required.filter((value): value is string => typeof value === 'string')
		: [];
	return 'project_id' in properties || required.includes('project_id');
}

export function validateToolArguments(
	toolName: string,
	args: ToolArguments,
	availableTools: ChatToolDefinition[] | undefined
): ToolValidation {
	const errors: string[] = [];
	const toolDefinitions = getValidationToolDefinitions(toolName, availableTools);
	const toolDefinition = getToolDefinition(toolName, toolDefinitions);
	if (!toolDefinition) {
		return { isValid: false, errors: [`Unknown tool: ${toolName}`] };
	}

	const parameterSchema = getToolParameterSchema(toolDefinition);
	if (parameterSchema) validateSupportedSchema(toolName, args, parameterSchema, errors);
	applyCustomToolValidation(toolName, args, errors);

	return { isValid: errors.length === 0, errors };
}

function validateSupportedSchema(
	toolName: string,
	args: ToolArguments,
	parameterSchema: SupportedToolSchema,
	errors: string[]
): void {
	const properties = isToolArgumentRecord(parameterSchema.properties)
		? parameterSchema.properties
		: {};
	const requiredParameters = Array.isArray(parameterSchema.required)
		? parameterSchema.required
		: [];

	for (const required of requiredParameters) {
		if (typeof required !== 'string') continue;
		const value = args[required];
		const propertySchema = getSupportedSchema(properties[required]);
		if (
			!(required in args) ||
			value === undefined ||
			(value === null && !allowsNull(propertySchema)) ||
			(typeof value === 'string' && value.trim().length === 0)
		) {
			errors.push(`Missing required parameter: ${required}`);
		}
	}

	for (const [key, value] of Object.entries(args)) {
		const propertySchema = getSupportedSchema(properties[key]);
		if (!propertySchema) continue;

		const allowedTypes = getAllowedTypes(propertySchema);
		const actualType = getActualType(value);
		const matchesInteger =
			actualType === 'number' &&
			allowedTypes?.has('integer') === true &&
			Number.isInteger(value);
		if (allowedTypes && !allowedTypes.has(actualType) && !matchesInteger) {
			errors.push(
				`Invalid type for parameter ${key}: expected ${Array.from(allowedTypes).join(' | ')}, got ${actualType}`
			);
		}

		if (Array.isArray(propertySchema.enum) && value !== undefined) {
			if (!propertySchema.enum.includes(value)) {
				errors.push(
					`Invalid value for parameter ${key}: expected one of ${propertySchema.enum.map(formatSchemaValue).join(', ')}, got ${formatSchemaValue(value)}`
				);
			}
		}

		if (typeof value === 'string' && typeof propertySchema.minLength === 'number') {
			if (value.length < propertySchema.minLength) {
				errors.push(
					`Invalid length for parameter ${key}: expected at least ${propertySchema.minLength} characters`
				);
			}
		}

		if (typeof value === 'string' && typeof propertySchema.maxLength === 'number') {
			if (value.length > propertySchema.maxLength) {
				errors.push(
					`Invalid length for parameter ${key}: expected at most ${propertySchema.maxLength} characters`
				);
			}
		}

		if (typeof value === 'string' && typeof propertySchema.pattern === 'string') {
			try {
				if (!new RegExp(propertySchema.pattern).test(value)) {
					errors.push(
						`Invalid format for parameter ${key}: must match ${propertySchema.pattern}`
					);
				}
			} catch {
				// Provider schemas are static application code. Ignore a malformed pattern
				// here so one metadata bug cannot make every call to the tool fail closed.
			}
		}

		if (typeof value === 'string' && propertySchema.format === 'email') {
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
				errors.push(`Invalid format for parameter ${key}: expected email`);
			}
		}

		if (Array.isArray(value) && typeof propertySchema.minItems === 'number') {
			if (value.length < propertySchema.minItems) {
				errors.push(
					`Invalid length for parameter ${key}: expected at least ${propertySchema.minItems} items`
				);
			}
		}

		if (Array.isArray(value) && typeof propertySchema.maxItems === 'number') {
			if (value.length > propertySchema.maxItems) {
				errors.push(
					`Invalid length for parameter ${key}: expected at most ${propertySchema.maxItems} items`
				);
			}
		}

		if (typeof value === 'number' && Number.isFinite(value)) {
			if (typeof propertySchema.minimum === 'number' && value < propertySchema.minimum) {
				errors.push(
					`Invalid value for parameter ${key}: expected at least ${propertySchema.minimum}`
				);
			}
			if (typeof propertySchema.maximum === 'number' && value > propertySchema.maximum) {
				errors.push(
					`Invalid value for parameter ${key}: expected at most ${propertySchema.maximum}`
				);
			}
			if (
				typeof propertySchema.exclusiveMinimum === 'number' &&
				value <= propertySchema.exclusiveMinimum
			) {
				errors.push(
					`Invalid value for parameter ${key}: expected greater than ${propertySchema.exclusiveMinimum}`
				);
			}
			if (
				typeof propertySchema.exclusiveMaximum === 'number' &&
				value >= propertySchema.exclusiveMaximum
			) {
				errors.push(
					`Invalid value for parameter ${key}: expected less than ${propertySchema.exclusiveMaximum}`
				);
			}
		}
	}

	validateUuidIdArguments({
		toolName,
		args,
		parameterSchema,
		errors,
		allowsNull
	});
}

function getDefinitionName(toolDefinition: ChatToolDefinition): string | undefined {
	const directName: unknown = Reflect.get(toolDefinition, 'name');
	if (typeof directName === 'string') return directName;
	const nestedFunction: unknown = Reflect.get(toolDefinition, 'function');
	if (!isToolArgumentRecord(nestedFunction)) return undefined;
	return typeof nestedFunction.name === 'string' ? nestedFunction.name : undefined;
}

function getSupportedSchema(value: unknown): SupportedToolSchema | undefined {
	return isToolArgumentRecord(value) ? (value as SupportedToolSchema) : undefined;
}

function getActualType(value: unknown): string {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'array';
	return typeof value;
}

function formatSchemaValue(value: unknown): string {
	return typeof value === 'string' ? `"${value}"` : String(value);
}

function collectTypes(schema: SupportedToolSchema | undefined, types: Set<string>): void {
	if (!schema) return;
	if (schema.nullable === true) types.add('null');
	if (Array.isArray(schema.type)) {
		for (const type of schema.type) {
			if (typeof type === 'string') types.add(type);
		}
	} else if (typeof schema.type === 'string') {
		types.add(schema.type);
	}

	for (const union of [schema.anyOf, schema.oneOf, schema.allOf]) {
		if (!Array.isArray(union)) continue;
		for (const entry of union) collectTypes(getSupportedSchema(entry), types);
	}
}

function getAllowedTypes(schema: SupportedToolSchema | undefined): Set<string> | null {
	const types = new Set<string>();
	collectTypes(schema, types);
	return types.size > 0 ? types : null;
}

function allowsNull(schema: unknown): boolean {
	const types = getAllowedTypes(getSupportedSchema(schema));
	return types?.has('null') ?? false;
}
