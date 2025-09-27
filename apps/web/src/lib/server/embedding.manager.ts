// src/lib/server/embedding.manager.ts
// Server-side embedding operations and CRUD management

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { toVectorLiteral } from '$lib/utils/pgvector';
import type { SmartLLMService } from '$lib/services/smart-llm-service';

interface CRUDOperation {
	table: string;
	operation: 'create' | 'update' | 'delete';
	data: any;
	ref?: string;
	searchQuery?: string;
}

interface CRUDResult {
	operation: string;
	table: string;
	id?: string;
	record?: any;
	error?: string;
}

/**
 * Manages embeddings and CRUD operations for BuildOS data
 * Handles semantic search, deduplication, and intelligent data operations
 */
export class EmbeddingManager {
	private llmService: SmartLLMService;
	private db: SupabaseClient<Database>;
	private openAIApiKey: string;

	constructor(db: SupabaseClient<Database>, llmService: SmartLLMService, openAIApiKey: string) {
		this.db = db;
		this.llmService = llmService;
		this.openAIApiKey = openAIApiKey;
	}

	/* -------------------------------------------------------------------- */
	/* Public Embedding API                                                */
	/* -------------------------------------------------------------------- */

	/**
	 * Generate a single embedding for text content
	 */
	async generateEmbedding(text: string): Promise<number[]> {
		return await this.llmService.generateEmbedding(text, this.openAIApiKey);
	}

	/**
	 * Generate multiple embeddings for an array of text content
	 */
	async generateEmbeddings(texts: string[]): Promise<number[][]> {
		return await this.llmService.generateEmbeddings(texts, this.openAIApiKey);
	}

	/**
	 * Search for similar items across any table
	 */
	async searchSimilar(table: string, query: string, threshold = 0.85, limit = 5): Promise<any[]> {
		try {
			const embedding = await this.generateEmbedding(query);
			const { data } = await this.db.rpc('search_similar_items', {
				table_name: table,
				query_embedding: toVectorLiteral(embedding),
				similarity_threshold: threshold,
				match_count: limit
			});
			return data || [];
		} catch (error) {
			console.error(`Error searching similar items in ${table}:`, error);
			return [];
		}
	}

	/**
	 * Update embedding for a specific record
	 */
	async updateEmbedding(table: string, id: string, data: any): Promise<void> {
		try {
			const text = this.generateEmbeddingText(table, data);
			const embedding = await this.generateEmbedding(text);

			await this.db
				.from(table as any)
				.update({ embedding: toVectorLiteral(embedding) })
				.eq('id', id);
		} catch (error) {
			console.error(`Error updating embedding for ${table}:${id}:`, error);
		}
	}

	/**
	 * Generate missing embeddings for records without them
	 */
	async generateMissingEmbeddings(table: string, batchSize = 50): Promise<void> {
		try {
			// Fetch records without embeddings
			const { data: records, error } = await this.db
				.from(table as any)
				.select('*')
				.is('embedding', null)
				.limit(batchSize);

			if (error || !records || records.length === 0) {
				return;
			}

			// Generate embedding texts
			const embeddingTexts = records.map((record) =>
				this.generateEmbeddingText(table, record)
			);

			// Generate embeddings in batch
			const embeddings = await this.generateEmbeddings(embeddingTexts);

			// Update records with embeddings
			const updates = records.map((record, index) => ({
				id: record.id,
				embedding: toVectorLiteral(embeddings[index])
			}));

			// Batch update
			for (const update of updates) {
				await this.db
					.from(table as any)
					.update({ embedding: update.embedding })
					.eq('id', update.id);
			}

			console.log(`Generated ${updates.length} missing embeddings for ${table}`);
		} catch (error) {
			console.error(`Error generating missing embeddings for ${table}:`, error);
		}
	}

	/* -------------------------------------------------------------------- */
	/* CRUD Operations with Intelligence                                    */
	/* -------------------------------------------------------------------- */

	/**
	 * Process a CRUD operation with intelligent deduplication and validation
	 */
	async processCRUDOperation(operation: CRUDOperation): Promise<CRUDResult> {
		const { table, operation: op, data: rawData, searchQuery } = operation;

		try {
			// Clean and validate data
			const data = this.cleanDataForTable(table, rawData);
			const validation = this.validateRequiredFields(table, data, op);

			if (!validation.isValid) {
				return {
					operation: 'error',
					table,
					error: `Missing required fields: ${validation.missingFields.join(', ')}`
				};
			}

			// Handle deduplication for create/update operations
			if (searchQuery && ['create', 'update'].includes(op)) {
				const similarItems = await this.searchSimilar(table, searchQuery, 0.9, 1);
				if (similarItems.length > 0) {
					const existingId = similarItems[0].id;
					await this.db
						.from(table as any)
						.update(data)
						.eq('id', existingId);

					await this.updateEmbedding(table, existingId, { ...data, id: existingId });

					return { operation: 'updated_existing', table, id: existingId };
				}
			}

			// Standard CRUD operations
			switch (op) {
				case 'create':
					return await this.handleCreate(table, data);
				case 'update':
					return await this.handleUpdate(table, data);
				case 'delete':
					return await this.handleDelete(table, data);
				default:
					return { operation: 'error', table, error: `Unsupported operation: ${op}` };
			}
		} catch (error) {
			console.error(`Error processing CRUD operation for ${table}:`, error);
			return {
				operation: 'error',
				table,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/* -------------------------------------------------------------------- */
	/* Private Helper Methods                                               */
	/* -------------------------------------------------------------------- */

	private generateEmbeddingText(table: string, data: any): string {
		switch (table) {
			case 'projects':
				return `Project: ${data.name || 'Unnamed'}. ${data.description || ''}. Status: ${data.status || 'unknown'}. Tags: ${data.tags?.join(', ') || 'none'}`;

			case 'tasks':
				return `Task (${data.task_type || 'one_off'}): ${data.title || 'Untitled'}. ${data.description || ''}. Priority: ${data.priority || 'medium'}. Status: ${data.status || 'backlog'}`;

			case 'notes':
				return `Note: ${data.title || 'Untitled'}. ${data.content || ''}. Tags: ${data.tags?.join(', ') || 'none'}`;

			case 'habits':
				return `Habit: ${data.name || 'Unnamed'}. ${data.description || ''}. Frequency: ${data.frequency || 'daily'}`;

			case 'routines':
				return `Routine: ${data.name || 'Unnamed'}. ${data.description || ''}. Time: ${data.start_time || ''}-${data.end_time || ''}`;
			default:
				// Fallback to JSON representation
				return JSON.stringify(data);
		}
	}

	private cleanDataForTable(table: string, data: any): any {
		// Remove null/undefined values and clean data
		const cleaned: any = {};

		for (const [key, value] of Object.entries(data)) {
			if (value !== null && value !== undefined && value !== '') {
				cleaned[key] = value;
			}
		}

		// Add timestamps if missing
		if (!cleaned.updated_at) {
			cleaned.updated_at = new Date().toISOString();
		}

		if (!cleaned.created_at && !this.isUpdateOperation(table, cleaned)) {
			cleaned.created_at = new Date().toISOString();
		}

		return cleaned;
	}

	private validateRequiredFields(
		table: string,
		data: any,
		operation: string
	): {
		isValid: boolean;
		missingFields: string[];
	} {
		const requiredFields = this.getRequiredFields(table, operation);
		const missingFields = requiredFields.filter((field) => !data[field]);

		return {
			isValid: missingFields.length === 0,
			missingFields
		};
	}

	private getRequiredFields(table: string, operation: string): string[] {
		const fieldMap: Record<string, Record<string, string[]>> = {
			projects: {
				create: ['name', 'user_id'],
				update: ['id'],
				delete: ['id']
			},
			tasks: {
				create: ['title', 'user_id'],
				update: ['id'],
				delete: ['id']
			},
			notes: {
				create: ['title', 'content', 'user_id'],
				update: ['id'],
				delete: ['id']
			},
			project_context: {
				create: ['project_id'],
				update: ['project_id'],
				delete: ['project_id']
			}
		};

		return fieldMap[table]?.[operation] || [];
	}

	private isUpdateOperation(table: string, data: any): boolean {
		return !!(data.id || data.project_id);
	}

	private async handleContextUpsert(table: string, data: any): Promise<CRUDResult> {
		const key = 'project_id';
		const keyValue = data[key];

		if (!keyValue) {
			return { operation: 'error', table, error: `Missing ${key}` };
		}

		// Check if context already exists
		const { data: existing } = await this.db
			.from(table as any)
			.select(key)
			.eq(key, keyValue)
			.single();

		if (existing) {
			// Update existing context
			const { error } = await this.db
				.from(table as any)
				.update(data)
				.eq(key, keyValue);

			if (error) {
				return { operation: 'error', table, error: error.message };
			}

			return { operation: 'updated', table, id: keyValue };
		} else {
			// Create new context
			const { data: created, error } = await this.db
				.from(table as any)
				.insert(data)
				.select()
				.single();

			if (error) {
				return { operation: 'error', table, error: error.message };
			}

			return { operation: 'created', table, id: keyValue, record: created };
		}
	}

	private async handleCreate(table: string, data: any): Promise<CRUDResult> {
		const { data: record, error } = await this.db
			.from(table as any)
			.insert(data)
			.select()
			.single();

		if (error) {
			return { operation: 'error', table, error: error.message };
		}

		return { operation: 'created', table, id: record.id, record };
	}

	private async handleUpdate(table: string, data: any): Promise<CRUDResult> {
		const key = this.getKeyField(table);
		const keyValue = data[key];

		if (!keyValue) {
			return { operation: 'error', table, error: `Missing ${key}` };
		}

		const { error } = await this.db
			.from(table as any)
			.update(data)
			.eq(key, keyValue);

		if (error) {
			return { operation: 'error', table, error: error.message };
		}

		return { operation: 'updated', table, id: keyValue };
	}

	private async handleDelete(table: string, data: any): Promise<CRUDResult> {
		const key = this.getKeyField(table);
		const keyValue = data[key];

		if (!keyValue) {
			return { operation: 'error', table, error: `Missing ${key}` };
		}

		const { error } = await this.db
			.from(table as any)
			.delete()
			.eq(key, keyValue);

		if (error) {
			return { operation: 'error', table, error: error.message };
		}

		return { operation: 'deleted', table, id: keyValue };
	}

	private getKeyField(table: string): string {
		if (table === 'project_context') return 'project_id';
		return 'id';
	}
}
