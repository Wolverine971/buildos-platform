// apps/web/src/lib/services/ontology/migration/schema-auto-repair.service.ts
/**
 * Schema Auto-Repair Service
 *
 * When template validation fails due to type/default mismatches, this service
 * uses an LLM to intelligently generate appropriate default values that match
 * the schema types and semantic context of the field.
 *
 * Example: If `due_date` is required with type `string` but has default `null`,
 * the LLM will suggest an appropriate placeholder like "" or "TBD" based on context.
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Json } from '@buildos/shared-types';
import type { SmartLLMService } from '$lib/services/smart-llm-service';

export interface SchemaRepairResult {
	success: boolean;
	repairedSchema: any;
	repairedDefaultProps: Record<string, unknown>;
	repairs: SchemaRepair[];
	templateUpdated: boolean;
}

export interface SchemaRepair {
	field: string;
	issue: 'type_mismatch' | 'required_null_default' | 'missing_default';
	originalType: string;
	originalDefault: unknown;
	newDefault: unknown;
	rationale: string;
}

interface LLMRepairResponse {
	repairs: Array<{
		field: string;
		suggested_default: unknown;
		rationale: string;
	}>;
}

export class SchemaAutoRepairService {
	constructor(
		private readonly client: TypedSupabaseClient,
		private readonly llm: SmartLLMService
	) {}

	/**
	 * Analyze validation errors and attempt to auto-repair schema issues
	 */
	async attemptRepair(options: {
		templateId: string;
		typeKey: string;
		schema: any;
		defaultProps: Record<string, unknown>;
		extractedProps: Record<string, unknown>;
		validationErrors: string[];
		userId: string;
		persistChanges?: boolean; // Whether to save repairs to the template
	}): Promise<SchemaRepairResult> {
		const { schema, defaultProps, extractedProps, validationErrors, persistChanges = true } = options;

		// Parse validation errors to identify repairable issues
		const repairableIssues = this.parseValidationErrors(validationErrors, schema);

		if (repairableIssues.length === 0) {
			console.log('[SchemaAutoRepair] No repairable issues found');
			return {
				success: false,
				repairedSchema: schema,
				repairedDefaultProps: defaultProps,
				repairs: [],
				templateUpdated: false
			};
		}

		console.log(
			`[SchemaAutoRepair] Found ${repairableIssues.length} repairable issue(s):`,
			repairableIssues.map((i) => `${i.field}: ${i.issue}`)
		);

		// Use LLM to generate appropriate defaults
		const llmRepairs = await this.generateSmartDefaults({
			issues: repairableIssues,
			schema,
			extractedProps,
			userId: options.userId
		});

		if (!llmRepairs || llmRepairs.repairs.length === 0) {
			console.warn('[SchemaAutoRepair] LLM did not provide any repairs');
			return {
				success: false,
				repairedSchema: schema,
				repairedDefaultProps: defaultProps,
				repairs: [],
				templateUpdated: false
			};
		}

		// Apply repairs to schema and default props
		const { repairedSchema, repairedDefaultProps, repairs } = this.applyRepairs(
			schema,
			defaultProps,
			repairableIssues,
			llmRepairs
		);

		// Persist changes to template if requested
		let templateUpdated = false;
		if (persistChanges && repairs.length > 0) {
			templateUpdated = await this.persistRepairs(options.templateId, repairedSchema, repairedDefaultProps);
		}

		console.log(
			`[SchemaAutoRepair] Applied ${repairs.length} repair(s):`,
			repairs.map((r) => `${r.field}: ${JSON.stringify(r.originalDefault)} -> ${JSON.stringify(r.newDefault)}`)
		);

		return {
			success: repairs.length > 0,
			repairedSchema,
			repairedDefaultProps,
			repairs,
			templateUpdated
		};
	}

	/**
	 * Parse validation error messages to identify fields with type/default mismatches
	 */
	private parseValidationErrors(
		errors: string[],
		schema: any
	): Array<{
		field: string;
		issue: 'type_mismatch' | 'required_null_default' | 'missing_default';
		expectedType: string;
		currentDefault: unknown;
	}> {
		const issues: Array<{
			field: string;
			issue: 'type_mismatch' | 'required_null_default' | 'missing_default';
			expectedType: string;
			currentDefault: unknown;
		}> = [];

		const properties = schema?.properties ?? {};
		const required = new Set<string>(schema?.required ?? []);

		for (const error of errors) {
			// Pattern: "Type mismatch for field_name: expected string, got null"
			const typeMismatchMatch = error.match(
				/Type mismatch for (\w+): expected (\w+), got (\w+)/
			);
			if (typeMismatchMatch) {
				const [, field, expectedType, actualType] = typeMismatchMatch;
				const fieldSchema = properties[field];
				const currentDefault = fieldSchema?.default;

				// Only repair if the issue is a null default for a non-nullable required field
				if (actualType === 'null' && required.has(field)) {
					issues.push({
						field,
						issue: currentDefault === null ? 'required_null_default' : 'type_mismatch',
						expectedType,
						currentDefault
					});
				}
			}

			// Pattern: "Required field missing: field_name"
			const missingMatch = error.match(/Required field missing: (\w+)/);
			if (missingMatch) {
				const [, field] = missingMatch;
				const fieldSchema = properties[field];
				const expectedType = fieldSchema?.type ?? 'unknown';
				const currentDefault = fieldSchema?.default;

				// Only add if we haven't already identified this field
				if (!issues.some((i) => i.field === field)) {
					issues.push({
						field,
						issue: 'missing_default',
						expectedType,
						currentDefault
					});
				}
			}
		}

		return issues;
	}

	/**
	 * Use LLM to generate semantically appropriate default values
	 */
	private async generateSmartDefaults(options: {
		issues: Array<{
			field: string;
			issue: string;
			expectedType: string;
			currentDefault: unknown;
		}>;
		schema: any;
		extractedProps: Record<string, unknown>;
		userId: string;
	}): Promise<LLMRepairResponse | null> {
		const { issues, schema, extractedProps } = options;
		const properties = schema?.properties ?? {};

		// Build context for each field that needs repair
		const fieldContexts = issues.map((issue) => {
			const fieldSchema = properties[issue.field];
			return {
				field: issue.field,
				type: issue.expectedType,
				description: fieldSchema?.description ?? 'No description',
				issue: issue.issue,
				currentDefault: issue.currentDefault,
				extractedValue: extractedProps[issue.field]
			};
		});

		const systemPrompt = `You are a schema repair assistant. Your job is to suggest appropriate default values for required fields in a template schema.

CRITICAL RULES:
1. The default value MUST match the expected type exactly
2. For "string" type: use empty string "" or a semantic placeholder like "TBD", "Not specified", etc.
3. For "number" or "integer" type: use 0 or a sensible default number
4. For "boolean" type: use false
5. For "array" type: use []
6. For "object" type: use {}
7. NEVER suggest null for a required field - that's what we're trying to fix!
8. Consider the field name and description to suggest a semantically meaningful default

Return JSON with repairs for each field.`;

		const userPrompt = `The following required fields have type/default mismatches that are causing validation failures.
Please suggest appropriate default values that match the expected types.

Fields needing repair:
${JSON.stringify(fieldContexts, null, 2)}

Full schema properties for context:
${JSON.stringify(properties, null, 2)}

Extracted values that couldn't be used (for context):
${JSON.stringify(
			Object.fromEntries(issues.map((i) => [i.field, extractedProps[i.field]])),
			null,
			2
		)}

Return JSON:
{
  "repairs": [
    {
      "field": "field_name",
      "suggested_default": <value matching the expected type>,
      "rationale": "Brief explanation of why this default makes sense"
    }
  ]
}`;

		try {
			const response = await this.llm.getJSONResponse<LLMRepairResponse>({
				systemPrompt,
				userPrompt,
				userId: options.userId,
				profile: 'fast',
				temperature: 0.1,
				validation: {
					retryOnParseError: true,
					maxRetries: 1
				},
				operationType: 'ontology_migration.schema_auto_repair'
			});

			return response;
		} catch (error) {
			console.error('[SchemaAutoRepair] LLM repair generation failed:', error);
			return null;
		}
	}

	/**
	 * Apply LLM-suggested repairs to schema and default props
	 */
	private applyRepairs(
		originalSchema: any,
		originalDefaultProps: Record<string, unknown>,
		issues: Array<{
			field: string;
			issue: string;
			expectedType: string;
			currentDefault: unknown;
		}>,
		llmRepairs: LLMRepairResponse
	): {
		repairedSchema: any;
		repairedDefaultProps: Record<string, unknown>;
		repairs: SchemaRepair[];
	} {
		const repairedSchema = JSON.parse(JSON.stringify(originalSchema));
		const repairedDefaultProps = { ...originalDefaultProps };
		const repairs: SchemaRepair[] = [];

		for (const llmRepair of llmRepairs.repairs) {
			const { field, suggested_default, rationale } = llmRepair;

			// Find the corresponding issue
			const issue = issues.find((i) => i.field === field);
			if (!issue) continue;

			// Validate that suggested default matches expected type
			const suggestedType = this.getJsonType(suggested_default);
			const expectedType = issue.expectedType;

			// Type compatibility check (allow integer for number)
			const isCompatible =
				suggestedType === expectedType ||
				(expectedType === 'number' && suggestedType === 'integer') ||
				(expectedType === 'integer' && suggestedType === 'number');

			if (!isCompatible && suggested_default !== null) {
				console.warn(
					`[SchemaAutoRepair] Skipping repair for ${field}: suggested type ${suggestedType} doesn't match expected ${expectedType}`
				);
				// Fall back to type-appropriate default
				const fallbackDefault = this.getTypeFallbackDefault(expectedType);
				if (fallbackDefault !== undefined) {
					// Apply fallback
					if (repairedSchema.properties?.[field]) {
						repairedSchema.properties[field].default = fallbackDefault;
					}
					repairedDefaultProps[field] = fallbackDefault;

					repairs.push({
						field,
						issue: issue.issue as SchemaRepair['issue'],
						originalType: expectedType,
						originalDefault: issue.currentDefault,
						newDefault: fallbackDefault,
						rationale: `LLM suggestion type mismatch, using type fallback: ${expectedType}`
					});
				}
				continue;
			}

			// Apply the LLM-suggested repair
			if (repairedSchema.properties?.[field]) {
				repairedSchema.properties[field].default = suggested_default;
			}
			repairedDefaultProps[field] = suggested_default;

			repairs.push({
				field,
				issue: issue.issue as SchemaRepair['issue'],
				originalType: expectedType,
				originalDefault: issue.currentDefault,
				newDefault: suggested_default,
				rationale
			});
		}

		return { repairedSchema, repairedDefaultProps, repairs };
	}

	/**
	 * Persist repaired schema to the template
	 */
	private async persistRepairs(
		templateId: string,
		repairedSchema: any,
		repairedDefaultProps: Record<string, unknown>
	): Promise<boolean> {
		try {
			const { error } = await this.client
				.from('onto_templates')
				.update({
					schema: repairedSchema as Json,
					default_props: repairedDefaultProps as Json,
					updated_at: new Date().toISOString()
				})
				.eq('id', templateId);

			if (error) {
				console.error('[SchemaAutoRepair] Failed to persist repairs:', error);
				return false;
			}

			console.info(`[SchemaAutoRepair] Successfully persisted repairs to template ${templateId}`);
			return true;
		} catch (error) {
			console.error('[SchemaAutoRepair] Error persisting repairs:', error);
			return false;
		}
	}

	/**
	 * Get JSON type of a value
	 */
	private getJsonType(value: unknown): string {
		if (value === null) return 'null';
		if (Array.isArray(value)) return 'array';
		if (typeof value === 'object') return 'object';
		if (typeof value === 'number') {
			return Number.isInteger(value) ? 'integer' : 'number';
		}
		return typeof value; // 'string', 'boolean'
	}

	/**
	 * Get type-appropriate fallback default
	 */
	private getTypeFallbackDefault(fieldType: string): unknown {
		switch (fieldType) {
			case 'number':
			case 'integer':
				return 0;
			case 'string':
				return '';
			case 'boolean':
				return false;
			case 'array':
				return [];
			case 'object':
				return {};
			default:
				return undefined;
		}
	}

	/**
	 * Repair extracted props based on schema to fix type mismatches
	 * This fixes the props without modifying the template schema
	 */
	repairExtractedProps(
		props: Record<string, unknown>,
		schema: any
	): Record<string, unknown> {
		if (!schema?.properties) {
			return props;
		}

		const result = { ...props };
		const requiredFields: string[] = Array.isArray(schema.required) ? schema.required : [];
		const properties = schema.properties ?? {};

		for (const field of requiredFields) {
			const fieldValue = result[field];
			const fieldSchema = properties[field];

			if (!fieldSchema) continue;

			const expectedType = fieldSchema.type;
			const actualType = this.getJsonType(fieldValue);

			// If there's a type mismatch and we have null for a required field
			if (actualType === 'null' || fieldValue === undefined) {
				// Check if schema has a proper default (not null)
				if (fieldSchema.default !== null && fieldSchema.default !== undefined) {
					result[field] = fieldSchema.default;
				} else {
					// Use type-appropriate fallback
					const fallback = this.getTypeFallbackDefault(expectedType);
					if (fallback !== undefined) {
						result[field] = fallback;
					}
				}
			}
		}

		return result;
	}
}
