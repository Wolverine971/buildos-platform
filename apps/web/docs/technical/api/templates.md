<!-- apps/web/docs/technical/api/templates.md -->

# API Request/Response Templates

_Auto-generated on 2025-09-27T04:23:16.671Z_

This document provides templates for documenting API request and response formats.

## Standard Response Format

JSON API endpoints follow a consistent envelope format. Protocol endpoints (SSE streams, file/binary
downloads, tracking pixels/redirects, MCP/JSON-RPC) can return protocol-native responses.

```typescript
interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
	warnings?: Array<{
		message: string;
		type: string;
	}>;
	code?: string;
	details?: unknown;
	errorInfo?: {
		code: string;
		message: string;
		status: number;
		details?: unknown;
		field?: string;
	};
	timestamp: string;
	requestId?: string;
}
```

## Authentication

Most API endpoints require authentication via Supabase session cookies:

```
Cookie: sb-session=<session-token>
```

## Error Responses

Standard error response codes:

| Code | Description           | Example                           |
| ---- | --------------------- | --------------------------------- |
| 400  | Bad Request           | Invalid input parameters          |
| 401  | Unauthorized          | Missing or invalid authentication |
| 403  | Forbidden             | Insufficient permissions          |
| 404  | Not Found             | Resource does not exist           |
| 429  | Too Many Requests     | Rate limit exceeded               |
| 500  | Internal Server Error | Unexpected server error           |

## Common Request Parameters

### Pagination Parameters

For endpoints that support pagination:

```typescript
interface PaginationParams {
	page?: number; // Page number (default: 1)
	limit?: number; // Items per page (default: 20, max: 100)
}
```

### Search Parameters

For endpoints that support searching:

```typescript
interface SearchParams {
	search?: string; // Search query
	year?: string; // Filter by year (YYYY)
	day?: string; // Filter by day (YYYY-MM-DD)
}
```

## Response Examples

### Success Response

```json
{
	"success": true,
	"data": {
		"id": "123",
		"name": "Example Project",
		"status": "active"
	},
	"timestamp": "2026-02-16T10:15:30.000Z"
}
```

### Paginated Response

```json
{
	"success": true,
	"data": [
		{ "id": "1", "name": "Item 1" },
		{ "id": "2", "name": "Item 2" }
	],
	"pagination": {
		"page": 1,
		"pageSize": 20,
		"totalPages": 3,
		"totalItems": 42,
		"hasNext": true,
		"hasPrevious": false
	},
	"timestamp": "2026-02-16T10:15:30.000Z"
}
```

### Error Response

```json
{
	"success": false,
	"error": "Resource not found",
	"message": "Resource not found",
	"code": "NOT_FOUND",
	"details": {
		"resource": "project",
		"id": "invalid-id"
	},
	"timestamp": "2026-02-16T10:15:30.000Z"
}
```
