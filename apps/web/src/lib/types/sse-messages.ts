// apps/web/src/lib/types/sse-messages.ts
// Strongly-typed SSE message interfaces for brain dump streaming

import type {
	ProjectContextResult,
	TaskNoteExtractionResult,
	BrainDumpParseResult,
	PreparatoryAnalysisResult
} from './brain-dump';

// Base message structure
interface BaseSSEMessage {
	type: string;
	message?: string;
}

// Context progress message with proper typing
export interface SSEContextProgress extends BaseSSEMessage {
	type: 'contextProgress';
	message: string;
	data: {
		status: 'pending' | 'processing' | 'completed' | 'failed';
		preview?: ProjectContextResult;
		error?: string;
		allowContinue?: boolean; // For short braindump fallback
	};
}

// Tasks progress message with proper typing
export interface SSETasksProgress extends BaseSSEMessage {
	type: 'tasksProgress';
	message: string;
	data: {
		status: 'pending' | 'processing' | 'completed' | 'failed';
		preview?: TaskNoteExtractionResult;
		error?: string;
	};
}

// Preparatory analysis message (for existing project optimization)
export interface SSEAnalysis extends BaseSSEMessage {
	type: 'analysis';
	message: string;
	data: {
		status: 'pending' | 'processing' | 'completed' | 'failed';
		result?: PreparatoryAnalysisResult;
		error?: string;
	};
}

// Initial status message
export interface SSEStatus extends BaseSSEMessage {
	type: 'status';
	message: string;
	data: {
		processes: ('context' | 'tasks')[];
		contentLength: number;
		isDualProcessing?: boolean;
		isShortBraindump?: boolean;
		source?: string;
	};
}

// Context update decision message (for short braindumps)
export interface SSEContextUpdateRequired extends BaseSSEMessage {
	type: 'contextUpdateRequired';
	message: string;
	data: {
		reason: string;
		processes: ('context' | 'tasks')[];
		required?: boolean;
	};
}

// Retry message for error recovery
export interface SSERetry extends BaseSSEMessage {
	type: 'retry';
	message: string;
	attempt: number;
	maxAttempts: number;
	processName: string;
}

// Final completion message
export interface SSEComplete extends BaseSSEMessage {
	type: 'complete';
	message: string;
	result: BrainDumpParseResult;
}

// Error message
export interface SSEError extends BaseSSEMessage {
	type: 'error';
	message: string;
	error: string;
	context?: 'context' | 'tasks' | 'general';
	recoverable?: boolean;
}

// Union type for all streaming messages
export type StreamingMessage =
	| SSEAnalysis
	| SSEContextProgress
	| SSETasksProgress
	| SSEStatus
	| SSEContextUpdateRequired
	| SSERetry
	| SSEComplete
	| SSEError;

// Type guards for message discrimination
export function isContextProgress(msg: StreamingMessage): msg is SSEContextProgress {
	return msg.type === 'contextProgress';
}

export function isTasksProgress(msg: StreamingMessage): msg is SSETasksProgress {
	return msg.type === 'tasksProgress';
}

export function isComplete(msg: StreamingMessage): msg is SSEComplete {
	return msg.type === 'complete';
}

export function isError(msg: StreamingMessage): msg is SSEError {
	return msg.type === 'error';
}

export function isStatus(msg: StreamingMessage): msg is SSEStatus {
	return msg.type === 'status';
}

export function isContextUpdateRequired(msg: StreamingMessage): msg is SSEContextUpdateRequired {
	return msg.type === 'contextUpdateRequired';
}

export function isRetry(msg: StreamingMessage): msg is SSERetry {
	return msg.type === 'retry';
}

export function isAnalysis(msg: StreamingMessage): msg is SSEAnalysis {
	return msg.type === 'analysis';
}

// Helper type for streaming state in frontend
export interface StreamingState {
	// Progress tracking
	analysisStatus?: 'pending' | 'processing' | 'completed' | 'failed' | 'not_needed';
	contextStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'not_needed';
	tasksStatus: 'pending' | 'processing' | 'completed' | 'failed';

	// Results
	analysisResult?: PreparatoryAnalysisResult;
	contextResult?: ProjectContextResult;
	tasksResult?: TaskNoteExtractionResult;

	// Messages
	analysisProgress?: string;
	contextProgress?: string;
	tasksProgress?: string;

	// Meta
	isShortBraindump?: boolean;
	isDualProcessing?: boolean;
	showContextPanel?: boolean;
}
