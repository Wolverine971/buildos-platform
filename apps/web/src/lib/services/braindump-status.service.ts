// src/lib/services/braindump-status.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { ParsedOperation, BrainDumpParseResult, ExecutionResult } from '$lib/types/brain-dump';
import { ErrorLoggerService } from './errorLogger.service';

export interface ProjectInfo {
	id: string;
	name?: string;
	slug?: string;
	isNew: boolean;
}

export interface BrainDumpStatusMetadata {
	operations: ParsedOperation[];
	summary: string;
	insights: string;
	totalOperations: number;
	tableBreakdown: Record<string, number>;
	processingTime: number;
	timestamp: string;
	project_info?: ProjectInfo | null;
	executionSummary?: {
		successful: number;
		failed: number;
		results: number;
	};
	processingMode?: 'single' | 'dual';
	processingNote?: string;
}

/**
 * Service to handle brain dump status updates
 * Consolidates duplicate status update logic from multiple locations
 */
export class BrainDumpStatusService {
	private supabase: SupabaseClient<Database>;
	private errorLogger: ErrorLoggerService;

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
		this.errorLogger = ErrorLoggerService.getInstance(supabase);
	}

	/**
	 * Update brain dump to parsed status after LLM processing
	 */
	async updateToParsed(
		brainDumpId: string,
		userId: string,
		parseResult: BrainDumpParseResult,
		selectedProjectId?: string
	): Promise<boolean> {
		try {
			const { error } = await this.supabase
				.from('brain_dumps')
				.update({
					title: parseResult.title || `Brain Dump - ${new Date().toLocaleDateString()}`,
					status: 'parsed' as const,
					project_id: selectedProjectId || null,
					ai_insights: parseResult.insights,
					ai_summary: parseResult.summary,
					parsed_results: JSON.stringify(parseResult),
					tags: parseResult.tags,
					updated_at: new Date().toISOString()
				})
				.eq('id', brainDumpId)
				.eq('user_id', userId);

			if (error) {
				console.error('Failed to update brain dump to parsed status:', error);
				await this.errorLogger.logDatabaseError(
					error,
					'update',
					'brain_dumps',
					brainDumpId,
					{
						status: 'parsed',
						project_id: selectedProjectId
					}
				);
				return false;
			}

			console.log(`Brain dump ${brainDumpId} status updated to parsed`);
			return true;
		} catch (error) {
			console.error('Error updating brain dump to parsed:', error);
			return false;
		}
	}

	/**
	 * Update brain dump to saved status after operations execution
	 */
	async updateToSaved(
		brainDumpId: string,
		userId: string,
		executionResult: ExecutionResult | undefined,
		operations: ParsedOperation[],
		projectInfo: ProjectInfo | null,
		parseResult: Partial<BrainDumpParseResult>,
		processingTime: number,
		processingMode: 'single' | 'dual' = 'single'
	): Promise<boolean> {
		try {
			const metadata = this.buildMetadata(
				operations,
				executionResult,
				projectInfo,
				parseResult,
				processingTime,
				processingMode
			);

			const { error } = await this.supabase
				.from('brain_dumps')
				.update({
					status: 'saved' as const,
					project_id: projectInfo?.id || null,
					title: parseResult.title || `Brain Dump - ${new Date().toLocaleDateString()}`,
					ai_summary: parseResult.summary,
					ai_insights: parseResult.insights,
					parsed_results: JSON.stringify(parseResult),
					tags: parseResult.tags,
					metaData: JSON.stringify(metadata),
					updated_at: new Date().toISOString()
				})
				.eq('id', brainDumpId)
				.eq('user_id', userId);

			if (error) {
				console.error('Failed to update brain dump to saved status:', error);
				await this.errorLogger.logDatabaseError(
					error,
					'update',
					'brain_dumps',
					brainDumpId,
					{
						status: 'saved',
						project_id: projectInfo?.id
					}
				);
				return false;
			}

			console.log(
				`Brain dump ${brainDumpId} status updated to saved (${processingMode} processing)`
			);
			return true;
		} catch (error) {
			console.error('Error updating brain dump to saved:', error);
			return false;
		}
	}

	/**
	 * Build consistent metadata object for brain dump
	 */
	private buildMetadata(
		operations: ParsedOperation[],
		executionResult: ExecutionResult | undefined,
		projectInfo: ProjectInfo | null,
		parseResult: Partial<BrainDumpParseResult>,
		processingTime: number,
		processingMode: 'single' | 'dual' = 'single'
	): BrainDumpStatusMetadata {
		const metadata: BrainDumpStatusMetadata = {
			operations: executionResult?.successful || operations,
			summary: parseResult.summary || 'Brain dump processed successfully',
			insights: parseResult.insights || 'Operations executed',
			totalOperations: operations.length,
			tableBreakdown: this.getTableBreakdown(operations),
			processingTime,
			timestamp: new Date().toISOString(),
			project_info: projectInfo,
			processingMode
		};

		// Add execution summary if available
		if (executionResult) {
			metadata.executionSummary = {
				successful: executionResult.successful?.length || 0,
				failed: executionResult.failed?.length || 0,
				results: executionResult.results?.length || 0
			};
		}

		// Add processing note if present
		if (parseResult.metadata?.processingNote) {
			metadata.processingNote = parseResult.metadata.processingNote;
		}

		return metadata;
	}

	/**
	 * Calculate table breakdown from operations
	 */
	private getTableBreakdown(operations: ParsedOperation[]): Record<string, number> {
		return operations.reduce(
			(acc, op) => {
				acc[op.table] = (acc[op.table] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>
		);
	}

	/**
	 * Mark brain dump as failed
	 */
	async markAsFailed(brainDumpId: string, userId: string, error: any): Promise<boolean> {
		try {
			const { error: updateError } = await this.supabase
				.from('brain_dumps')
				.update({
					status: 'parsed_and_deleted' as const,
					ai_insights: JSON.stringify({ error: error?.message || 'Processing failed' }),
					updated_at: new Date().toISOString()
				})
				.eq('id', brainDumpId)
				.eq('user_id', userId);

			if (updateError) {
				console.error('Failed to mark brain dump as failed:', updateError);
				return false;
			}

			return true;
		} catch (err) {
			console.error('Error marking brain dump as failed:', err);
			return false;
		}
	}
}
