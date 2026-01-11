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
	endpoint?: string;
	httpMethod?: string;
	operationType?: string;
	tableName?: string;
	recordId?: string;
	llmProvider?: string;
	llmModel?: string;
	responseTimeMs?: number;
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

function inferErrorType(error: unknown, context?: WorkerErrorContext): ErrorType {
	if (context?.errorType) return context.errorType;
	if (context?.llmProvider || context?.llmModel) return 'llm_error';

	const message = typeof error === 'string' ? error : (error as any)?.message || '';
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
	const message = typeof error === 'string' ? error : (error as any)?.message || '';
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
			endpoint: context?.endpoint,
			http_method: context?.httpMethod,
			operation_type: context?.operationType,
			table_name: context?.tableName,
			record_id: context?.recordId,
			llm_provider: context?.llmProvider,
			llm_model: context?.llmModel,
			response_time_ms: context?.responseTimeMs,
			metadata,
			environment: resolveEnvironment()
		};

		const { error: insertError } = await supabase.from('error_logs').insert(errorEntry);
		if (insertError) {
			console.error('Failed to log worker error:', insertError);
		}
	} catch (logError) {
		console.error('Worker error logger failed:', logError);
	}
}
