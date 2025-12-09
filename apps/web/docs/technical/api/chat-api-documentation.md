<!-- apps/web/docs/technical/api/chat-api-documentation.md -->

# Chat API Documentation

## Overview

The chat API provides endpoints for managing chat sessions, streaming responses, compressing conversations, and generating titles. All endpoints follow a consistent response format using the `ApiResponse` utility class.

## Response Format

All chat API endpoints return responses in one of two formats:

### Success Response

```typescript
{
  success: true,
  data?: T,        // The response payload
  message?: string // Optional success message
}
```

### Error Response

```typescript
{
  error: string,   // Error message
  code?: string,   // Error code (e.g., 'UNAUTHORIZED', 'NOT_FOUND')
  details?: any    // Additional error details
}
```

## Endpoints

### 1. Stream Chat Response

**POST** `/api/chat/stream`

Stream a chat conversation with support for tool calling and progressive disclosure.

**Request Body:**

```typescript
{
  message: string;           // Required: User's message
  session_id?: string;       // Optional: Existing session ID
  context_type?: string;     // Default: 'global'
  entity_id?: string;        // Optional: Entity ID for context
}
```

**Response:** Server-Sent Events (SSE) stream

**Error Responses:**

- 401: Unauthorized
- 429: Rate limited
- 400: Invalid request

---

**GET** `/api/chat/stream`

Get chat sessions or a specific session with messages.

**Query Parameters:**

- `session_id` (optional): Specific session ID to retrieve

**Success Response (without session_id):**

```typescript
{
  success: true,
  data: {
    sessions: ChatSession[]
  }
}
```

**Success Response (with session_id):**

```typescript
{
  success: true,
  data: {
    session: ChatSession & { messages?: ChatMessage[] }
  }
}
```

### 2. Generate Chat Title

**POST** `/api/chat/generate-title`

Generate a title for a chat session based on the conversation.

**Request Body:**

```typescript
{
	session_id: string; // Required: Session ID
}
```

**Success Response:**

```typescript
{
  success: true,
  data: {
    title: string
  }
}
```

### 3. Compress Chat Session

**POST** `/api/chat/compress`

Compress a chat session to reduce token usage while preserving context.

**Request Body:**

```typescript
{
  session_id: string;       // Required: Session ID
  target_tokens?: number;   // Optional: Target token count (default: 2000)
}
```

**Success Response:**

```typescript
{
  success: true,
  data: {
    compressed: boolean,
    metadata?: any,
    compressionId?: string,
    tokensSaved?: number,
    reason?: string
  }
}
```

---

**GET** `/api/chat/compress`

Get compression history for a session.

**Query Parameters:**

- `session_id` (required): Session ID

**Success Response:**

```typescript
{
  success: true,
  data: {
    history: CompressionRecord[]
  }
}
```

## Rate Limiting

The chat API implements rate limiting to prevent abuse:

- **Max requests per minute:** 30
- **Max tokens per minute:** 50,000

Rate limit errors return HTTP 429 with code 'RATE_LIMITED'.

## Frontend Integration

When consuming these endpoints from the frontend, always expect the wrapped response format:

```typescript
// Correct way to handle responses
const response = await fetch('/api/chat/stream');
const payload = await response.json();

if (payload.success) {
	// Access data through payload.data
	const sessions = payload.data.sessions;
} else {
	// Handle error
	console.error(payload.error);
}
```

## Error Codes

Common error codes returned by chat endpoints:

| Code              | Description                |
| ----------------- | -------------------------- |
| `UNAUTHORIZED`    | User not authenticated     |
| `NOT_FOUND`       | Resource not found         |
| `INVALID_REQUEST` | Invalid request parameters |
| `RATE_LIMITED`    | Rate limit exceeded        |
| `INTERNAL_ERROR`  | Internal server error      |
| `DATABASE_ERROR`  | Database operation failed  |

## Implementation Notes

1. All endpoints use the `ApiResponse` utility class from `$lib/utils/api-response`
2. Authentication is required for all endpoints
3. Session ownership is verified before any operations
4. Responses are cached where appropriate using ETags
5. SSE streaming is used for real-time chat responses

## Related Services

- `ChatCompressionService`: Handles conversation compression
- `ChatContextService`: Manages progressive context disclosure
- `SmartLLMService`: Interfaces with LLM providers
- `ChatToolExecutor`: Executes tool calls during chat

Last updated: 2025-10-28
