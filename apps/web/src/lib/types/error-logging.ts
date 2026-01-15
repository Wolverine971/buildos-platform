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
	| 'unknown';

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

export interface ErrorLogEntry {
	id?: string;
	error_type?: ErrorType;
	errorType?: ErrorType; // Support both formats
	error_code?: string;
	errorCode?: string; // Support both formats
	error_message?: string;
	errorMessage?: string; // Support both formats
	error_stack?: string;
	errorStack?: string; // Support both formats
	severity?: ErrorSeverity;

	user_id?: string;
	userId?: string; // Support both formats
	user?: {
		id: string;
		email: string;
		name?: string | null;
	};
	project_id?: string;
	projectId?: string; // Support both formats
	brain_dump_id?: string;
	brainDumpId?: string; // Support both formats

	endpoint?: string;
	http_method?: string;
	httpMethod?: string; // Support both formats
	request_id?: string;
	requestId?: string; // Support both formats
	user_agent?: string;
	userAgent?: string; // Support both formats
	ip_address?: string;
	ipAddress?: string; // Support both formats

	llm_provider?: string;
	llmProvider?: string; // Support both formats
	llm_model?: string;
	llmModel?: string; // Support both formats
	prompt_tokens?: number;
	promptTokens?: number; // Support both formats
	completion_tokens?: number;
	completionTokens?: number; // Support both formats
	total_tokens?: number;
	totalTokens?: number; // Support both formats
	response_time_ms?: number;
	responseTimeMs?: number; // Support both formats
	llm_temperature?: number;
	llmTemperature?: number; // Support both formats
	llm_max_tokens?: number;
	llmMaxTokens?: number; // Support both formats

	operation_type?: string;
	operationType?: string; // Support both formats
	table_name?: string;
	tableName?: string; // Support both formats
	record_id?: string;
	recordId?: string; // Support both formats
	operation_payload?: Record<string, any>;
	operationPayload?: Record<string, any>; // Support both formats

	metadata?: Record<string, any>;
	environment?: 'development' | 'staging' | 'production';
	app_version?: string;
	appVersion?: string; // Support both formats
	browser_info?: BrowserInfo;
	browserInfo?: BrowserInfo; // Support both formats

	resolved?: boolean;
	resolved_at?: string;
	resolvedAt?: string; // Support both formats
	resolved_by?: string;
	resolvedBy?: string; // Support both formats
	resolution_notes?: string;
	resolutionNotes?: string; // Support both formats

	created_at?: string;
	createdAt?: string; // Support both formats
	updated_at?: string;
	updatedAt?: string; // Support both formats
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
