// apps/web/src/lib/utils/operations/reference-resolver.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { ReferenceInfo } from './types';
import { isValidUUID } from './validation-utils';
import type { ParsedOperation } from '$lib/types/brain-dump';

export class ReferenceResolver {
	private actorIdByUser = new Map<string, string>();

	constructor(private supabase: SupabaseClient<Database>) {}

	private async resolveActorId(userId: string): Promise<string | null> {
		const cached = this.actorIdByUser.get(userId);
		if (cached) {
			return cached;
		}

		const { data: actorId, error } = await this.supabase.rpc('ensure_actor_for_user', {
			p_user_id: userId
		});
		if (error || !actorId) {
			console.warn('Failed to resolve actor for reference resolution:', error?.message);
			return null;
		}

		this.actorIdByUser.set(userId, actorId);
		return actorId;
	}

	/**
	 * Resolve references in operations
	 */
	async resolveReferences(
		operations: ParsedOperation[],
		userId: string
	): Promise<ParsedOperation[]> {
		// Extract all references
		const references = this.extractReferences(operations);
		if (references.length === 0) {
			return operations;
		}

		// Group references by table for batch resolution
		const referencesByTable = this.groupReferencesByTable(references);

		// Resolve all references in parallel
		const resolutionMap = new Map<string, string>();
		const resolutionPromises = Object.entries(referencesByTable).map(async ([table, refs]) => {
			const results = await this.resolveTableReferences(table, refs, userId);
			results.forEach((id, ref) => {
				resolutionMap.set(this.getReferenceKey(ref), id);
			});
		});

		await Promise.all(resolutionPromises);

		// Replace references in operations
		return this.replaceReferences(operations, resolutionMap);
	}

	/**
	 * Extract references from operations
	 */
	private extractReferences(operations: ParsedOperation[]): ReferenceInfo[] {
		const references: ReferenceInfo[] = [];

		for (const op of operations) {
			// Check data fields
			if (op.data) {
				this.extractReferencesFromObject(op.data, references);
			}

			// Check conditions
			if (op.conditions) {
				this.extractReferencesFromObject(op.conditions, references);
			}
		}

		return references;
	}

	/**
	 * Extract references from an object
	 */
	private extractReferencesFromObject(
		obj: Record<string, any>,
		references: ReferenceInfo[]
	): void {
		// Handle special metadata format from brain-dump processor
		if (obj._needs_ref_resolution && obj._ref_field && obj._id_field) {
			const refField = obj._ref_field;
			const idField = obj._id_field;
			const refValue = obj[refField];

			if (typeof refValue === 'string' && !isValidUUID(refValue)) {
				const refInfo = this.parseReference(idField, refValue);
				if (refInfo) {
					// Store the original ref field and target id field for later replacement
					refInfo.sourceField = refField;
					refInfo.targetField = idField;
					references.push(refInfo);
				}
			}
		}

		// Handle parent task references
		if (obj._parent_ref_field && obj._parent_id_field) {
			const refField = obj._parent_ref_field;
			const idField = obj._parent_id_field;
			const refValue = obj[refField];

			if (typeof refValue === 'string' && !isValidUUID(refValue)) {
				const refInfo = this.parseReference(idField, refValue);
				if (refInfo) {
					refInfo.sourceField = refField;
					refInfo.targetField = idField;
					references.push(refInfo);
				}
			}
		}

		// Original reference extraction logic
		for (const [field, value] of Object.entries(obj)) {
			if (typeof value === 'string' && this.isReference(value, field)) {
				const refInfo = this.parseReference(field, value);
				if (refInfo) {
					references.push(refInfo);
				}
			} else if (Array.isArray(value)) {
				// Handle array of references
				for (const item of value) {
					if (typeof item === 'string' && this.isReference(item, field)) {
						const refInfo = this.parseReference(field, item);
						if (refInfo) {
							references.push(refInfo);
						}
					}
				}
			}
		}
	}

	/**
	 * Check if a value is a reference
	 */
	private isReference(value: string, field: string): boolean {
		// Skip if already a UUID
		if (isValidUUID(value)) {
			return false;
		}

		// Check field naming patterns
		const referenceFields = [
			'project_id',
			'task_id',
			'parent_task_id',
			'parent_note_id',
			'assignee_id',
			'template_id',
			'parent_document_id'
		];

		return referenceFields.includes(field) || field.endsWith('_id');
	}

	/**
	 * Parse reference information
	 */
	private parseReference(field: string, value: string): ReferenceInfo | null {
		// Determine target table from field name
		let table = '';

		if (field === 'project_id') {
			table = 'projects';
		} else if (field === 'task_id' || field === 'parent_task_id') {
			table = 'tasks';
		} else if (field === 'assignee_id') {
			table = 'profiles';
		} else if (field === 'parent_note_id') {
			table = 'project_notes';
		} else if (field === 'template_id') {
			table = 'projects';
		} else if (field === 'parent_document_id') {
			table = 'project_documents';
		} else {
			// Try to infer from field name
			const match = field.match(/^(.+)_id$/);
			if (match) {
				table = match[1] + 's'; // Simple pluralization
			}
		}

		if (!table) {
			return null;
		}

		return {
			field,
			table,
			value
		};
	}

	/**
	 * Group references by table
	 */
	private groupReferencesByTable(references: ReferenceInfo[]): Record<string, ReferenceInfo[]> {
		const grouped: Record<string, ReferenceInfo[]> = {};

		for (const ref of references) {
			if (!grouped[ref.table]) {
				grouped[ref.table] = [];
			}
			grouped[ref.table]!.push(ref);
		}

		return grouped;
	}

	/**
	 * Resolve references for a specific table
	 */
	private async resolveTableReferences(
		table: string,
		references: ReferenceInfo[],
		userId: string
	): Promise<Map<ReferenceInfo, string>> {
		const resolved = new Map<ReferenceInfo, string>();

		// Handle special case for profiles
		if (table === 'profiles') {
			// For now, just use the current user ID
			references.forEach((ref) => {
				resolved.set(ref, userId);
			});
			return resolved;
		}

		// Skip cache lookup since we're removing the cache approach

		// Build query to find records by name/title
		const values = [...new Set(references.map((r) => r.value))];
		const nameField = this.getNameField(table);
		const targetTable =
			table === 'projects' ? 'onto_projects' : table === 'tasks' ? 'onto_tasks' : table;

		if (!nameField) {
			return resolved;
		}

		try {
			let query = this.supabase
				.from(targetTable as any)
				.select('id, ' + nameField)
				.in(nameField, values);

			if (table === 'projects' || table === 'tasks') {
				const actorId = await this.resolveActorId(userId);
				if (!actorId) {
					return resolved;
				}
				query = query.eq('created_by', actorId).is('deleted_at', null);
			}

			const { data, error } = await query;

			if (!error && data) {
				// Create lookup map
				const lookup = new Map<string, string>();
				for (const record of data as any[]) {
					if (record[nameField] && record.id) {
						lookup.set(record[nameField], record.id);
					}
				}

				// Resolve references
				for (const ref of references) {
					const id = lookup.get(ref.value);
					if (id) {
						resolved.set(ref, id);
					}
				}
			}
		} catch (err) {
			console.error(`Failed to resolve references for table ${table}:`, err);
		}

		return resolved;
	}

	/**
	 * Get the name field for a table
	 */
	private getNameField(table: string): string | null {
		const nameFields: Record<string, string> = {
			projects: 'name',
			tasks: 'title',
			project_notes: 'title',
			project_documents: 'title',
			brain_dumps: 'title',
			project_checklists: 'title'
		};

		return nameFields[table] || null;
	}

	/**
	 * Get unique key for a reference
	 */
	private getReferenceKey(ref: ReferenceInfo): string {
		return `${ref.table}:${ref.field}:${ref.value}`;
	}

	/**
	 * Replace references in operations with resolved IDs
	 */
	private replaceReferences(
		operations: ParsedOperation[],
		resolutionMap: Map<string, string>
	): ParsedOperation[] {
		return operations.map((op) => {
			const updatedOp = { ...op };

			// Replace in data
			if (updatedOp.data) {
				updatedOp.data = this.replaceReferencesInObject(updatedOp.data, resolutionMap);
			}

			// Replace in conditions
			if (updatedOp.conditions) {
				updatedOp.conditions = this.replaceReferencesInObject(
					updatedOp.conditions,
					resolutionMap
				);
			}

			return updatedOp;
		});
	}

	/**
	 * Replace references in an object
	 */
	private replaceReferencesInObject(
		obj: Record<string, any>,
		resolutionMap: Map<string, string>
	): Record<string, any> {
		const updated = { ...obj };

		// Handle special metadata format first
		if (updated._needs_ref_resolution && updated._ref_field && updated._id_field) {
			const refField = updated._ref_field;
			const idField = updated._id_field;
			const refValue = updated[refField];

			if (typeof refValue === 'string' && !isValidUUID(refValue)) {
				const refInfo = this.parseReference(idField, refValue);
				if (refInfo) {
					const key = this.getReferenceKey(refInfo);
					const resolvedId = resolutionMap.get(key);
					if (resolvedId) {
						// Set the resolved ID in the target field
						updated[idField] = resolvedId;
						// Clean up metadata fields
						delete updated._needs_ref_resolution;
						delete updated._ref_field;
						delete updated._id_field;
						// Keep the original ref field for now - might be useful for debugging
					}
				}
			}
		}

		// Handle parent task references
		if (updated._parent_ref_field && updated._parent_id_field) {
			const refField = updated._parent_ref_field;
			const idField = updated._parent_id_field;
			const refValue = updated[refField];

			if (typeof refValue === 'string' && !isValidUUID(refValue)) {
				const refInfo = this.parseReference(idField, refValue);
				if (refInfo) {
					const key = this.getReferenceKey(refInfo);
					const resolvedId = resolutionMap.get(key);
					if (resolvedId) {
						updated[idField] = resolvedId;
						delete updated._parent_ref_field;
						delete updated._parent_id_field;
					}
				}
			}
		}

		// Original reference replacement logic
		for (const [field, value] of Object.entries(updated)) {
			if (typeof value === 'string' && this.isReference(value, field)) {
				const refInfo = this.parseReference(field, value);
				if (refInfo) {
					const key = this.getReferenceKey(refInfo);
					const resolvedId = resolutionMap.get(key);
					if (resolvedId) {
						updated[field] = resolvedId;
					}
				}
			} else if (Array.isArray(value)) {
				updated[field] = value.map((item) => {
					if (typeof item === 'string' && this.isReference(item, field)) {
						const refInfo = this.parseReference(field, item);
						if (refInfo) {
							const key = this.getReferenceKey(refInfo);
							return resolutionMap.get(key) || item;
						}
					}
					return item;
				});
			}
		}

		return updated;
	}
}
