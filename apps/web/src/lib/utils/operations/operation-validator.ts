// apps/web/src/lib/utils/operations/operation-validator.ts
import type { ValidationResult, FieldValidation } from './types';
import { tableSchemas } from './validation-schemas';
import {
	isValidDate,
	normalizeDate,
	isValidUUID,
	sanitizeString,
	sanitizeArray,
	sanitizeBoolean,
	sanitizeNumber,
	sanitizeJsonb,
	isPastDate
} from './validation-utils';
import type { ParsedOperation, TableName } from '$lib/types/brain-dump';

export class OperationValidator {
	/**
	 * Validate operation data against table schema
	 */
	validateOperation(operation: ParsedOperation): ValidationResult {
		const { table, data, operation: operation_type } = operation;

		// Check if table is valid
		if (!this.isValidTable(table)) {
			return {
				isValid: false,
				error: `Invalid table: ${table}`
			};
		}

		// Validate project create operations have a ref
		if (table === 'projects' && operation_type === 'create' && !operation.ref) {
			return {
				isValid: false,
				error: 'Project create operations must have a ref for other operations to reference'
			};
		}

		// Get schema for the table
		const schema = tableSchemas[table];
		if (!schema) {
			// If no schema defined, allow the operation
			return {
				isValid: true,
				sanitizedData: data
			};
		}

		// For delete operations, only validate ID fields
		if (operation_type === 'delete') {
			return this.validateDeleteOperation(operation, schema);
		}

		// Validate and sanitize each field
		const sanitizedData: Record<string, any> = {};
		const errors: string[] = [];

		// Check required fields for create operations
		if (operation_type === 'create') {
			for (const [field, validation] of Object.entries(schema)) {
				if (validation.required && !(field in data)) {
					// Special handling for reference resolution metadata
					// If a field is missing but there's metadata indicating it will be resolved, skip the error
					if (this.isFieldPendingResolution(field, data)) {
						continue;
					}
					errors.push(`Missing required field: ${field}`);
				}
			}
		}

		// Validate provided fields
		for (const [field, value] of Object.entries(data)) {
			const validation = schema[field];

			// Skip fields not in schema (allow flexibility)
			if (!validation) {
				sanitizedData[field] = value;
				continue;
			}

			const fieldResult = this.validateField(field, value, validation);
			if (!fieldResult.isValid) {
				errors.push(fieldResult.error!);
			} else if (fieldResult.sanitizedValue !== undefined) {
				sanitizedData[field] = fieldResult.sanitizedValue;
			}
		}

		// Custom validation for specific tables
		const customValidation = this.performCustomValidation(
			table,
			sanitizedData,
			operation.operation
		);
		if (!customValidation.isValid) {
			return customValidation;
		}

		if (errors.length > 0) {
			return {
				isValid: false,
				error: errors.join('; ')
			};
		}

		return {
			isValid: true,
			sanitizedData
		};
	}

	/**
	 * Validate delete operation
	 */
	private validateDeleteOperation(
		operation: ParsedOperation,
		schema: Record<string, FieldValidation>
	): ValidationResult {
		const { data } = operation;

		// For delete operations, we need an ID or search criteria
		if (!data || (!data.id && !operation.searchQuery)) {
			return {
				isValid: false,
				error: 'Delete operation requires an id or searchQuery'
			};
		}

		// If using data fields as conditions, validate they exist in schema
		for (const field of Object.keys(data)) {
			if (!(field in schema) && field !== 'id') {
				return {
					isValid: false,
					error: `Invalid condition field: ${field}`
				};
			}
		}

		return { isValid: true, sanitizedData: data };
	}

	/**
	 * Validate individual field
	 */
	private validateField(
		field: string,
		value: any,
		validation: FieldValidation
	): { isValid: boolean; error?: string; sanitizedValue?: any } {
		// Handle null/undefined
		if (value === null || value === undefined) {
			if (validation.required) {
				return {
					isValid: false,
					error: `Field ${field} is required`
				};
			}
			return { isValid: true, sanitizedValue: null };
		}

		// Type validation and sanitization
		switch (validation.type) {
			case 'uuid':
				if (typeof value !== 'string' || !isValidUUID(value)) {
					return {
						isValid: false,
						error: `Field ${field} must be a valid UUID`
					};
				}
				return { isValid: true, sanitizedValue: value };

			case 'date':
				if (!isValidDate(value)) {
					return {
						isValid: false,
						error: `Field ${field} must be a valid date`
					};
				}

				// Check for past dates on date fields that shouldn't be in the past
				// temp disabled
				// if (this.shouldValidatePastDate(field) && isPastDate(value)) {
				// 	return {
				// 		isValid: false,
				// 		error: `Field ${field} cannot be set to a date in the past`
				// 	};
				// }

				return { isValid: true, sanitizedValue: normalizeDate(value) };

			case 'string':
				const sanitizedStr = sanitizeString(value, validation.maxLength);
				if (validation.enum && !validation.enum.includes(sanitizedStr || '')) {
					return {
						isValid: false,
						error: `Field ${field} must be one of: ${validation.enum.join(', ')}`
					};
				}
				return { isValid: true, sanitizedValue: sanitizedStr };

			case 'boolean':
				return { isValid: true, sanitizedValue: sanitizeBoolean(value) };

			case 'number':
				const num = sanitizeNumber(value);
				if (num === null && value !== null) {
					return {
						isValid: false,
						error: `Field ${field} must be a number`
					};
				}
				return { isValid: true, sanitizedValue: num };

			case 'array':
				const arr = sanitizeArray(value, validation.arrayType);
				if (arr === null && value !== null) {
					return {
						isValid: false,
						error: `Field ${field} must be an array`
					};
				}
				return { isValid: true, sanitizedValue: arr };

			case 'jsonb':
				const json = sanitizeJsonb(value);
				return { isValid: true, sanitizedValue: json };

			default:
				return { isValid: true, sanitizedValue: value };
		}
	}

	/**
	 * Check if table name is valid
	 */
	private isValidTable(table: string): boolean {
		// Use the actual TableName type values
		const validTables: TableName[] = ['projects', 'tasks', 'notes'];
		return validTables.includes(table as TableName);
	}

	/**
	 * Perform custom validation for specific tables
	 */
	private performCustomValidation(
		table: string,
		data: Record<string, any>,
		operation: string
	): ValidationResult {
		switch (table) {
			case 'tasks':
				// Validate project reference pattern
				const hasProjectId = !!data.project_id;
				const hasProjectRef = !!data.project_ref;

				// Tasks must have exactly ONE project reference (unless it's pending resolution)
				if (
					!hasProjectId &&
					!hasProjectRef &&
					!this.isFieldPendingResolution('project_id', data) &&
					operation === 'create'
				) {
					return {
						isValid: false,
						error: 'Tasks must have either project_id or project_ref'
					};
				}

				if (hasProjectId && hasProjectRef && operation === 'create') {
					return {
						isValid: false,
						error: 'Tasks cannot have both project_id and project_ref'
					};
				}

				// Validate project_id format if present
				if (hasProjectId && !isValidUUID(data.project_id) && operation === 'create') {
					return {
						isValid: false,
						error: 'Invalid project_id format (must be UUID)'
					};
				}

				// Validate recurring task requirements
				if (data.task_type === 'recurring') {
					if (!data.start_date) {
						return {
							isValid: false,
							error: 'Recurring tasks require start_date'
						};
					}
					if (!data.recurrence_pattern) {
						// We'll let this pass - the executor will add 'weekly' as default
						console.warn(
							'Recurring task missing recurrence_pattern - will use default (weekly)'
						);
					} else {
						// Validate recurrence_pattern is valid
						const validPatterns = [
							'daily',
							'weekdays',
							'weekly',
							'biweekly',
							'monthly',
							'quarterly',
							'yearly'
						];
						if (!validPatterns.includes(data.recurrence_pattern)) {
							return {
								isValid: false,
								error: `Invalid recurrence_pattern: ${data.recurrence_pattern}. Must be one of: ${validPatterns.join(', ')}`
							};
						}
					}

					// Validate recurrence_ends date if provided
					if (data.recurrence_ends) {
						const startDate = new Date(data.start_date);
						const endDate = new Date(data.recurrence_ends);
						if (endDate <= startDate) {
							return {
								isValid: false,
								error: 'Recurring task recurrence_ends must be after start_date'
							};
						}
					}
				}
				break;

			case 'notes':
			case 'project_notes':
				// Validate project reference pattern (notes are optional - don't require project)
				const noteHasProjectId = !!data.project_id;
				const noteHasProjectRef = !!data.project_ref;

				if (noteHasProjectId && noteHasProjectRef) {
					return {
						isValid: false,
						error: 'Notes cannot have both project_id and project_ref'
					};
				}

				// Validate formats if present
				if (noteHasProjectId && !isValidUUID(data.project_id)) {
					return {
						isValid: false,
						error: 'Invalid project_id format (must be UUID)'
					};
				}

				if (
					noteHasProjectRef &&
					typeof data.project_ref === 'string' &&
					!data.project_ref.startsWith('new-')
				) {
					return {
						isValid: false,
						error: 'Invalid project_ref format (must start with "new-")'
					};
				}

				// Notes must have either title or content
				if (!data.title && !data.content) {
					return {
						isValid: false,
						error: 'Note must have either title or content'
					};
				}
				break;

			case 'projects':
				// Projects should NOT have project_id or project_ref in their data
				if (data.project_id || data.project_ref) {
					return {
						isValid: false,
						error: 'Project operations should not have project_id or project_ref'
					};
				}

				// Validate date ranges
				if (data.start_date && data.end_date) {
					const startDate = new Date(data.start_date);
					const endDate = new Date(data.end_date);
					if (endDate < startDate) {
						return {
							isValid: false,
							error: 'Project end date must be after start date'
						};
					}
				}
				break;
		}

		return { isValid: true, sanitizedData: data };
	}

	/**
	 * Determine if a date field should be validated against past dates
	 */
	private shouldValidatePastDate(field: string): boolean {
		// Date fields that should not be set to past dates
		const pastDateValidatedFields = ['start_date', 'end_date', 'recurrence_ends'];

		// Fields that can be in the past (historical data)
		const allowedPastDateFields = ['created_at', 'updated_at', 'completed_at', 'deleted_at'];

		if (allowedPastDateFields.includes(field)) {
			return false;
		}

		return pastDateValidatedFields.includes(field);
	}

	/**
	 * Check if a required field is pending resolution via metadata
	 */
	private isFieldPendingResolution(field: string, data: Record<string, any>): boolean {
		// Check for standard metadata format
		if (data._needs_ref_resolution && data._id_field === field && data._ref_field) {
			// The required field will be resolved from the ref field
			return true;
		}

		// Check for parent task metadata
		if (data._parent_id_field === field && data._parent_ref_field) {
			return true;
		}

		// Check for direct project_ref field (for new project creation)
		if (field === 'project_id' && data.project_ref && !data.project_id) {
			// project_id will be resolved from project_ref
			return true;
		}

		return false;
	}
}
