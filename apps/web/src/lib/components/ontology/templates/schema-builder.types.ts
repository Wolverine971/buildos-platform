// apps/web/src/lib/components/ontology/templates/schema-builder.types.ts

/**
 * JSON Schema Type Values
 */
export type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';

/**
 * JSON Schema Property Definition
 * Represents a single property in a JSON Schema
 */
export interface JsonSchemaProperty {
	type: JsonSchemaType;
	description?: string;

	// String-specific
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	enum?: string[];

	// Number/Integer-specific
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: boolean;
	exclusiveMaximum?: boolean;

	// Array-specific
	items?: JsonSchemaProperty;
	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;

	// Object-specific
	properties?: Record<string, JsonSchemaProperty>;
	required?: string[];
	additionalProperties?: boolean;

	// Common
	default?: unknown;
	examples?: unknown[];
}

/**
 * Complete JSON Schema Definition
 * Matches the structure stored in onto_templates.schema column
 */
export interface JsonSchemaDefinition {
	type: 'object';
	properties: Record<string, JsonSchemaProperty>;
	required?: string[];
	additionalProperties?: boolean;
	$schema?: string;
	title?: string;
	description?: string;
}

/**
 * JSON Schema Validation Result
 */
export interface JsonSchemaValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}
