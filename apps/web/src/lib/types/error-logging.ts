// apps/web/src/lib/types/error-logging.ts
export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info';
export type ErrorType =
	| 'brain_dump_processing'
	| 'api_error'
	| 'database_error'
	| 'validation_error'
	| 'llm_error'
	| 'tool_execution'
	| 'calendar_sync_error'
	| 'calendar_delete_error'
	| 'calendar_update_error'
	| 'email_delivery_failure'
	| 'unknown';

export interface ErrorSummary {
	total_errors: number;
	unresolved_errors: number;
	critical_errors: number;
	errors_last_24h: number;
	error_trend: number;
}

export interface LLMMetadata {
	provider?: string;
	model?: string;
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
	responseTimeMs?: number;
	temperature?: number;
	maxTokens?: number;
}

export interface BrowserInfo {
	userAgent?: string;
	platform?: string;
	language?: string;
	screenResolution?: string;
	timezone?: string;
}

/**
 * `ErrorLogEntry` mirrors the DB row shape (snake_case) returned from
 * `error_logs`. The `ErrorContext` interface below is the camelCase input
 * that callers pass to `ErrorLogger`; the service translates camelCase →
 * snake_case on insert. If you need a camelCase view in UI, map at the
 * boundary rather than adding camelCase fallbacks to this type.
 */
export interface ErrorLogEntry {
	id?: string;
	error_type?: ErrorType;
	error_code?: string;
	error_message?: string;
	error_stack?: string;
	severity?: ErrorSeverity;

	user_id?: string;
	user?: {
		id: string;
		email: string;
		name?: string | null;
	};
	project_id?: string;
	brain_dump_id?: string;

	endpoint?: string;
	http_method?: string;
	request_id?: string;
	user_agent?: string;
	ip_address?: string;

	llm_provider?: string;
	llm_model?: string;
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
	response_time_ms?: number;
	llm_temperature?: number;
	llm_max_tokens?: number;

	operation_type?: string;
	table_name?: string;
	record_id?: string;
	operation_payload?: Record<string, any>;

	metadata?: Record<string, any>;
	environment?: 'development' | 'staging' | 'production';
	app_version?: string;
	browser_info?: BrowserInfo;

	resolved?: boolean;
	resolved_at?: string;
	resolved_by?: string;
	resolution_notes?: string;

	created_at?: string;
	updated_at?: string;
}

export interface ErrorContext {
	userId?: string;
	projectId?: string;
	brainDumpId?: string;
	endpoint?: string;
	httpMethod?: string;
	requestId?: string;
	operationType?: string;
	tableName?: string;
	recordId?: string;
	operationPayload?: Record<string, any>;
	llmMetadata?: LLMMetadata;
	browserInfo?: BrowserInfo;
	metadata?: Record<string, any>;
}
