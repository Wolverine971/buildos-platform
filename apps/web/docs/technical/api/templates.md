# API Request/Response Templates

_Auto-generated on 2025-09-27T04:23:16.671Z_

This document provides templates for documenting API request and response formats.

## Standard Response Format

All API endpoints follow a consistent response format:

```typescript
interface ApiResponse<T = any> {
	success: boolean;
	data?: T;
	error?: {
		message: string;
		code?: string;
		details?: any;
	};
	meta?: {
		total?: number;
		page?: number;
		limit?: number;
	};
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
	}
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
	"meta": {
		"total": 42,
		"page": 1,
		"limit": 20
	}
}
```

### Error Response

```json
{
	"success": false,
	"error": {
		"message": "Resource not found",
		"code": "NOT_FOUND",
		"details": {
			"resource": "project",
			"id": "invalid-id"
		}
	}
}
```
