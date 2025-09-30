// apps/web/src/lib/utils/operations/types.ts
export interface ValidationResult {
	isValid: boolean;
	error?: string;
	sanitizedData?: Record<string, any>;
}

export interface FieldValidation {
	required?: boolean;
	type?: 'uuid' | 'date' | 'string' | 'boolean' | 'array' | 'jsonb' | 'number';
	enum?: string[];
	arrayType?: 'uuid' | 'string';
	maxLength?: number;
	custom?: (value: any) => boolean;
}

export interface ReferenceInfo {
	field: string;
	table: string;
	value: string;
	resolvedId?: string;
	sourceField?: string; // Original field that contains the reference (e.g., "project_ref")
	targetField?: string; // Target field to set the resolved ID (e.g., "project_id")
}
