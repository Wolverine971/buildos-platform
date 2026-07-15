// apps/worker/src/lib/errorLogger.ts
import type { Database } from '@buildos/shared-types';
import { supabase } from './supabase';

type ErrorLogInsert = Database['public']['Tables']['error_logs']['Insert'];
type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info';
type ErrorType =
	| 'brain_dump_processing'
	| 'api_error'
	| 'database_error'
	| 'validation_error'
	| 'llm_error'
	| 'calendar_sync_error'
	| 'calendar_delete_error'
	| 'calendar_update_error'
	| 'unknown';

type WorkerErrorContext = {
	userId?: string;
	projectId?: string;
	brainDumpId?: string;
	endpoint?: string;
	httpMethod?: string;
	operationType?: string;
	tableName?: string;
	recordId?: string;
	operationPayload?: ErrorLogInsert['operation_payload'];
	llmProvider?: string;
	llmModel?: string;
	llmPromptTokens?: number;
	llmCompletionTokens?: number;
	llmTotalTokens?: number;
	responseTimeMs?: number;
	llmTemperature?: number;
	llmMaxTokens?: number;
	errorType?: ErrorType;
	severity?: ErrorSeverity;
	metadata?: Record<string, unknown>;
};

function extractErrorInfo(error: unknown): { message: string; stack?: string; code?: string } {
	if (error instanceof Error) {
		return {
			message: error.message,
			stack: error.stack,
			code: (error as { code?: string }).code
		};
	}
	if (typeof error === 'string') {
		return { message: error };
	}
	if (error && typeof error === 'object') {
		const typedError = error as {
			message?: string;
			stack?: string;
			code?: string;
			error_code?: string;
		};
		return {
			message: typedError.message || JSON.stringify(error),
			stack: typedError.stack,
			code: typedError.code || typedError.error_code
		};
	}
	return { message: String(error) };
}

function getErrorMessage(error: unknown): string {
	return extractErrorInfo(error).message;
}

function inferErrorType(error: unknown, context?: WorkerErrorContext): ErrorType {
	if (context?.errorType) return context.errorType;

	// Database work can happen after a successful LLM call. Preserve SQLSTATE
	// precedence so those failures are not mislabeled as model failures merely
	// because provider/model metadata is attached to the operation.
	const errorCodeClass = extractErrorInfo(error).code?.slice(0, 2);
	if (
		errorCodeClass &&
		['22', '23', '24', '25', '40', '42', '53', '54', '55', '57', '58'].includes(errorCodeClass)
	) {
		return 'database_error';
	}

	if (context?.llmProvider || context?.llmModel) return 'llm_error';

	const message = getErrorMessage(error);
	const lowered = message.toLowerCase();

	if (
		lowered.includes('database') ||
		lowered.includes('sql') ||
		lowered.includes('relation') ||
		lowered.includes('row')
	) {
		return 'database_error';
	}

	if (
		lowered.includes('validation') ||
		lowered.includes('invalid') ||
		lowered.includes('schema')
	) {
		return 'validation_error';
	}

	if (
		lowered.includes('api') ||
		lowered.includes('fetch') ||
		lowered.includes('network') ||
		lowered.includes('timeout')
	) {
		return 'api_error';
	}

	return 'unknown';
}

function inferSeverity(error: unknown, errorType: ErrorType): ErrorSeverity {
	const message = getErrorMessage(error);
	const lowered = message.toLowerCase();

	if (
		errorType === 'database_error' ||
		lowered.includes('critical') ||
		lowered.includes('fatal')
	) {
		return 'critical';
	}

	if (errorType === 'validation_error' || lowered.includes('warning')) {
		return 'warning';
	}

	if (lowered.includes('info')) {
		return 'info';
	}

	return 'error';
}

function resolveEnvironment(): 'development' | 'staging' | 'production' {
	const env = process.env.NODE_ENV;
	if (env === 'production') return 'production';
	if (env === 'staging') return 'staging';
	return 'development';
}

export async function logWorkerError(error: unknown, context?: WorkerErrorContext): Promise<void> {
	try {
		const errorInfo = extractErrorInfo(error);
		const errorType = inferErrorType(error, context);
		const severity = context?.severity ?? inferSeverity(error, errorType);
		const metadata = {
			...(context?.metadata || {}),
			worker: true,
			timestamp: new Date().toISOString()
		};

		const errorEntry: ErrorLogInsert = {
			error_type: errorType,
			error_code: errorInfo.code,
			error_message: errorInfo.message,
			error_stack: errorInfo.stack,
			severity,
			user_id: context?.userId,
			project_id: context?.projectId,
			brain_dump_id: context?.brainDumpId,
			endpoint: context?.endpoint,
			http_method: context?.httpMethod,
			operation_type: context?.operationType,
			table_name: context?.tableName,
			record_id: context?.recordId,
			operation_payload: context?.operationPayload,
			llm_provider: context?.llmProvider,
			llm_model: context?.llmModel,
			prompt_tokens: context?.llmPromptTokens,
			completion_tokens: context?.llmCompletionTokens,
			total_tokens: context?.llmTotalTokens,
			response_time_ms: context?.responseTimeMs,
			llm_temperature: context?.llmTemperature,
			llm_max_tokens: context?.llmMaxTokens,
			metadata,
			environment: resolveEnvironment()
		};

		const { error: insertError } = await supabase.from('error_logs').insert(errorEntry);
		if (insertError) {
			if (insertError.code === '23503' && errorEntry.project_id) {
				const { error: retryError } = await supabase.from('error_logs').insert({
					...errorEntry,
					project_id: null,
					metadata: {
						...metadata,
						project_id_fk_retry: true,
						invalid_project_id: errorEntry.project_id
					}
				});
				if (!retryError) return;
				console.error('Failed to log worker error after project_id retry:', retryError);
				return;
			}
			console.error('Failed to log worker error:', insertError);
		}
	} catch (logError) {
		console.error('Worker error logger failed:', logError);
	}
}
