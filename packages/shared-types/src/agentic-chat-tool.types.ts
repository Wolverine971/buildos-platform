// packages/shared-types/src/agentic-chat-tool.types.ts
/**
 * JSON-compatible values accepted by Agentic Chat tool parameter schemas.
 *
 * This is intentionally separate from the worker artifact `JsonValue`, whose
 * object form permits `undefined` for ergonomic reads. Tool definitions are
 * serialized and sent to model providers, so their schema values must stay
 * representable in JSON.
 */
export type ToolJsonValue =
	| null
	| boolean
	| number
	| string
	| ToolJsonValue[]
	| { [key: string]: ToolJsonValue };

export type ToolJsonSchemaType =
	| 'array'
	| 'boolean'
	| 'integer'
	| 'null'
	| 'number'
	| 'object'
	| 'string';

/**
 * The JSON Schema vocabulary used by model-facing function parameters.
 *
 * The shape is recursive and remains JSON-compatible without exposing an
 * open `any` index signature. Add a named keyword here when a definition starts
 * using it so schema consumers retain useful, narrow types.
 */
export interface ToolJsonSchema {
	$id?: string;
	$ref?: string;
	$schema?: string;
	$defs?: Record<string, ToolJsonSchema>;
	title?: string;
	description?: string;
	type?: ToolJsonSchemaType | ToolJsonSchemaType[];
	properties?: Record<string, ToolJsonSchema>;
	patternProperties?: Record<string, ToolJsonSchema>;
	required?: string[];
	additionalProperties?: boolean | ToolJsonSchema;
	items?: ToolJsonSchema | ToolJsonSchema[];
	prefixItems?: ToolJsonSchema[];
	contains?: ToolJsonSchema;
	propertyNames?: ToolJsonSchema;
	dependentSchemas?: Record<string, ToolJsonSchema>;
	dependentRequired?: Record<string, string[]>;
	allOf?: ToolJsonSchema[];
	anyOf?: ToolJsonSchema[];
	oneOf?: ToolJsonSchema[];
	not?: ToolJsonSchema;
	if?: ToolJsonSchema;
	then?: ToolJsonSchema;
	else?: ToolJsonSchema;
	enum?: ToolJsonValue[];
	const?: ToolJsonValue;
	default?: ToolJsonValue;
	examples?: ToolJsonValue[];
	format?: string;
	pattern?: string;
	minLength?: number;
	maxLength?: number;
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: number;
	exclusiveMaximum?: number;
	multipleOf?: number;
	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;
	minProperties?: number;
	maxProperties?: number;
}

/** Top-level parameter schema required by function-calling providers. */
export interface ToolJsonObjectSchema extends ToolJsonSchema {
	type: 'object';
	properties: Record<string, ToolJsonSchema>;
}

/** Context scopes used to select Agentic Chat tools for a turn. */
export type ToolContextScope = 'base' | 'global' | 'project_create' | 'project';

export type RegistryOpGroup = 'onto' | 'util' | 'cal' | 'email' | 'search' | 'x';

/**
 * Serializable registry entry shared by the web catalog, runtime lookup port,
 * and the downward-only operation package.
 */
export interface RegistryOp {
	op: string;
	tool_name: string;
	description: string;
	parameters_schema: ToolJsonObjectSchema;
	group: RegistryOpGroup;
	kind: 'read' | 'write';
	entity?: string;
	action?: string;
	contexts?: ToolContextScope[];
	chat_discoverable: boolean;
}
