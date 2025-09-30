// packages/shared-types/src/api-types.ts

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
  requestId?: string;
}

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
  status: number;
  field?: string; // For validation errors
  stack?: string; // Only in development
}

export enum ErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  SESSION_EXPIRED = "SESSION_EXPIRED",
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  TOKEN_INVALID = "TOKEN_INVALID",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",

  // Validation
  INVALID_REQUEST = "INVALID_REQUEST",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  INVALID_DATE_FORMAT = "INVALID_DATE_FORMAT",
  INVALID_TIMEZONE = "INVALID_TIMEZONE",
  INVALID_JOB_TYPE = "INVALID_JOB_TYPE",
  INVALID_METADATA = "INVALID_METADATA",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  INVALID_FIELD_TYPE = "INVALID_FIELD_TYPE",

  // Resources
  NOT_FOUND = "NOT_FOUND",
  ALREADY_EXISTS = "ALREADY_EXISTS",
  CONFLICT = "CONFLICT",
  RESOURCE_LOCKED = "RESOURCE_LOCKED",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",

  // Operations
  OPERATION_FAILED = "OPERATION_FAILED",
  DATABASE_ERROR = "DATABASE_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  TIMEOUT = "TIMEOUT",
  RATE_LIMITED = "RATE_LIMITED",
  INTERNAL_ERROR = "INTERNAL_ERROR",

  // Queue/Job specific
  JOB_NOT_FOUND = "JOB_NOT_FOUND",
  JOB_ALREADY_PROCESSING = "JOB_ALREADY_PROCESSING",
  JOB_ALREADY_COMPLETED = "JOB_ALREADY_COMPLETED",
  JOB_FAILED = "JOB_FAILED",
  JOB_CANCELLED = "JOB_CANCELLED",
  QUEUE_FULL = "QUEUE_FULL",

  // Brief specific
  BRIEF_ALREADY_EXISTS = "BRIEF_ALREADY_EXISTS",
  BRIEF_ALREADY_GENERATING = "BRIEF_ALREADY_GENERATING",
  BRIEF_GENERATION_FAILED = "BRIEF_GENERATION_FAILED",
  INVALID_BRIEF_DATE = "INVALID_BRIEF_DATE",
  BRIEF_NOT_FOUND = "BRIEF_NOT_FOUND",
  BRIEF_LOCKED = "BRIEF_LOCKED",

  // Worker specific
  WORKER_UNAVAILABLE = "WORKER_UNAVAILABLE",
  WORKER_TIMEOUT = "WORKER_TIMEOUT",
  WORKER_ERROR = "WORKER_ERROR",

  // LLM/AI specific
  LLM_ERROR = "LLM_ERROR",
  LLM_RATE_LIMITED = "LLM_RATE_LIMITED",
  LLM_QUOTA_EXCEEDED = "LLM_QUOTA_EXCEEDED",
  LLM_INVALID_RESPONSE = "LLM_INVALID_RESPONSE",
  LLM_SERVICE_UNAVAILABLE = "LLM_SERVICE_UNAVAILABLE",

  // Email specific
  EMAIL_SEND_FAILED = "EMAIL_SEND_FAILED",
  EMAIL_INVALID_RECIPIENT = "EMAIL_INVALID_RECIPIENT",
  EMAIL_TEMPLATE_NOT_FOUND = "EMAIL_TEMPLATE_NOT_FOUND",

  // Payment specific
  PAYMENT_REQUIRED = "PAYMENT_REQUIRED",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  SUBSCRIPTION_EXPIRED = "SUBSCRIPTION_EXPIRED",
  TRIAL_EXPIRED = "TRIAL_EXPIRED",
}

// Pagination types
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// Streaming response types
export interface StreamEvent<T = unknown> {
  event: StreamEventType;
  data: T;
  id?: string;
  timestamp: string;
}

export enum StreamEventType {
  // General streaming events
  STARTED = "started",
  PROGRESS = "progress",
  DATA = "data",
  COMPLETED = "completed",
  ERROR = "error",
  HEARTBEAT = "heartbeat",

  // Brief generation specific
  BRIEF_STEP = "brief_step",
  PROJECT_BRIEF_STARTED = "project_brief_started",
  PROJECT_BRIEF_COMPLETED = "project_brief_completed",
  MAIN_BRIEF_STARTED = "main_brief_started",
  MAIN_BRIEF_COMPLETED = "main_brief_completed",

  // Queue/Job specific
  JOB_QUEUED = "job_queued",
  JOB_STARTED = "job_started",
  JOB_PROGRESS = "job_progress",
  JOB_COMPLETED = "job_completed",
  JOB_FAILED = "job_failed",
  JOB_CANCELLED = "job_cancelled",
}

// Helper functions for API responses
export function createSuccessResponse<T>(
  data: T,
  requestId?: string,
): ApiResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
    requestId,
  };
}

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  status: number = 500,
  details?: unknown,
  requestId?: string,
): ApiResponse<never> {
  return {
    success: false,
    error: {
      code,
      message,
      status,
      details,
    },
    timestamp: new Date().toISOString(),
    requestId,
  };
}

export function createPaginatedResponse<T>(
  data: T[],
  pagination: PaginationMeta,
  requestId?: string,
): PaginatedResponse<T> {
  return {
    success: true,
    data,
    pagination,
    timestamp: new Date().toISOString(),
    requestId,
  };
}

// Type guards
export function isApiResponse(obj: unknown): obj is ApiResponse {
  if (!obj || typeof obj !== "object") return false;
  const response = obj as Record<string, unknown>;
  return (
    typeof response.success === "boolean" &&
    typeof response.timestamp === "string"
  );
}

export function isApiError(obj: unknown): obj is ApiError {
  if (!obj || typeof obj !== "object") return false;
  const error = obj as Record<string, unknown>;
  return (
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    typeof error.status === "number"
  );
}

export function isStreamEvent(obj: unknown): obj is StreamEvent {
  if (!obj || typeof obj !== "object") return false;
  const event = obj as Record<string, unknown>;
  return (
    typeof event.event === "string" &&
    event.data !== undefined &&
    typeof event.timestamp === "string"
  );
}

// HTTP status code helpers
export const HttpStatus = {
  // Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,

  // Client errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,

  // Server errors
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus];

// Map error codes to HTTP status codes
export function getHttpStatusForErrorCode(code: ErrorCode): HttpStatusCode {
  switch (code) {
    case ErrorCode.UNAUTHORIZED:
    case ErrorCode.INVALID_CREDENTIALS:
    case ErrorCode.TOKEN_INVALID:
    case ErrorCode.TOKEN_EXPIRED:
      return HttpStatus.UNAUTHORIZED;

    case ErrorCode.FORBIDDEN:
    case ErrorCode.SESSION_EXPIRED:
      return HttpStatus.FORBIDDEN;

    case ErrorCode.NOT_FOUND:
    case ErrorCode.JOB_NOT_FOUND:
    case ErrorCode.BRIEF_NOT_FOUND:
      return HttpStatus.NOT_FOUND;

    case ErrorCode.ALREADY_EXISTS:
    case ErrorCode.CONFLICT:
    case ErrorCode.JOB_ALREADY_PROCESSING:
    case ErrorCode.BRIEF_ALREADY_EXISTS:
    case ErrorCode.BRIEF_ALREADY_GENERATING:
      return HttpStatus.CONFLICT;

    case ErrorCode.INVALID_REQUEST:
    case ErrorCode.VALIDATION_FAILED:
    case ErrorCode.INVALID_DATE_FORMAT:
    case ErrorCode.INVALID_TIMEZONE:
    case ErrorCode.INVALID_JOB_TYPE:
    case ErrorCode.INVALID_METADATA:
    case ErrorCode.MISSING_REQUIRED_FIELD:
    case ErrorCode.INVALID_FIELD_TYPE:
      return HttpStatus.BAD_REQUEST;

    case ErrorCode.RATE_LIMITED:
    case ErrorCode.LLM_RATE_LIMITED:
      return HttpStatus.TOO_MANY_REQUESTS;

    case ErrorCode.PAYMENT_REQUIRED:
    case ErrorCode.SUBSCRIPTION_EXPIRED:
    case ErrorCode.TRIAL_EXPIRED:
      return HttpStatus.FORBIDDEN;

    case ErrorCode.SERVICE_UNAVAILABLE:
    case ErrorCode.WORKER_UNAVAILABLE:
    case ErrorCode.LLM_SERVICE_UNAVAILABLE:
      return HttpStatus.SERVICE_UNAVAILABLE;

    case ErrorCode.TIMEOUT:
    case ErrorCode.WORKER_TIMEOUT:
      return HttpStatus.GATEWAY_TIMEOUT;

    default:
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
