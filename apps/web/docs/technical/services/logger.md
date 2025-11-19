# Logger Service

**Location**: `/src/lib/utils/logger.ts`
**Created**: 2025-11-17
**Purpose**: Centralized structured logging service for consistent, production-ready logging

---

## Overview

The Logger service provides structured logging with automatic context injection, supporting both development and production environments. It replaces scattered `console.log/warn/error` calls with a consistent, type-safe logging interface.

### Key Features

- **Structured Logging**: JSON output in production for log aggregation
- **Development Mode**: Human-readable colored output for local debugging
- **Context Injection**: Automatic inclusion of logger context in all messages
- **Type Safety**: TypeScript interfaces for log entries
- **Multiple Levels**: `debug`, `info`, `warn`, `error`

---

## Quick Start

### Basic Usage

```typescript
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('MyService');

logger.info('User logged in', { userId: '123', timestamp: Date.now() });
logger.error(new Error('Database connection failed'), { retryAttempt: 3 });
```

### In API Routes

```typescript
import { createLogger } from '$lib/utils/logger';
import type { RequestHandler } from './$types';

const logger = createLogger('API:UserEndpoint');

export const POST: RequestHandler = async ({ request, locals }) => {
	logger.info('Processing user request', { path: request.url });

	try {
		// ... your code
		logger.debug('Request successful', { userId: user.id });
	} catch (error) {
		logger.error(error as Error, { context: 'user_creation' });
	}
};
```

### In Services

```typescript
import { createLogger } from '$lib/utils/logger';

export class UserService {
	private logger = createLogger('UserService');

	async createUser(data: UserData) {
		this.logger.info('Creating user', { email: data.email });

		try {
			// ... implementation
			this.logger.debug('User created successfully', { userId: user.id });
			return user;
		} catch (error) {
			this.logger.error(error as Error, { operation: 'create_user', data });
			throw error;
		}
	}
}
```

---

## API Reference

### `createLogger(context: string): Logger`

Creates a new logger instance with the specified context.

**Parameters**:

- `context` (string): Identifier for the logger (e.g., 'UserService', 'API:Auth')

**Returns**: Logger instance

**Example**:

```typescript
const logger = createLogger('AgentChatOrchestrator');
```

---

### Logger Methods

#### `logger.debug(message: string, meta?: Record<string, any>): void`

Debug-level logging. **Only outputs in development mode.**

**Parameters**:

- `message`: The log message
- `meta` (optional): Additional metadata to include

**Example**:

```typescript
logger.debug('Cache hit', { cacheKey: 'user_123', age: 45000 });
```

**Output (dev)**:

```
[DEBUG] [UserService] Cache hit { cacheKey: 'user_123', age: 45000 }
```

**Output (production)**: _(not logged)_

---

#### `logger.info(message: string, meta?: Record<string, any>): void`

Info-level logging. Logs important events and state changes.

**Parameters**:

- `message`: The log message
- `meta` (optional): Additional metadata to include

**Example**:

```typescript
logger.info('User session started', { userId: '123', sessionId: 'abc' });
```

**Output (dev)**:

```
[INFO] [AuthService] User session started { userId: '123', sessionId: 'abc' }
```

**Output (production)**:

```json
{
	"level": "info",
	"message": "User session started",
	"context": "AuthService",
	"timestamp": "2025-11-17T12:34:56.789Z",
	"meta": { "userId": "123", "sessionId": "abc" }
}
```

---

#### `logger.warn(message: string, meta?: Record<string, any>): void`

Warning-level logging. Logs potentially problematic situations.

**Parameters**:

- `message`: The log message
- `meta` (optional): Additional metadata to include

**Example**:

```typescript
logger.warn('Rate limit approaching', { userId: '123', requestCount: 95, limit: 100 });
```

**Output (dev)**:

```
[WARN] [RateLimiter] Rate limit approaching { userId: '123', requestCount: 95, limit: 100 }
```

**Output (production)**:

```json
{
	"level": "warn",
	"message": "Rate limit approaching",
	"context": "RateLimiter",
	"timestamp": "2025-11-17T12:34:56.789Z",
	"meta": { "userId": "123", "requestCount": 95, "limit": 100 }
}
```

---

#### `logger.error(error: Error | string, meta?: Record<string, any>): void`

Error-level logging. Logs errors and exceptions.

**Parameters**:

- `error`: Error object or error message string
- `meta` (optional): Additional metadata to include

**Example**:

```typescript
try {
	await dangerousOperation();
} catch (error) {
	logger.error(error as Error, { operation: 'dangerousOperation', userId: '123' });
}
```

**Output (dev)**:

```
[ERROR] [DatabaseService] Connection timeout {
  operation: 'dangerousOperation',
  userId: '123',
  error: {
    name: 'TimeoutError',
    message: 'Connection timeout',
    stack: '...' // full stack trace
  }
}
```

**Output (production)**:

```json
{
	"level": "error",
	"message": "Connection timeout",
	"context": "DatabaseService",
	"timestamp": "2025-11-17T12:34:56.789Z",
	"meta": { "operation": "dangerousOperation", "userId": "123" },
	"error": { "name": "TimeoutError", "message": "Connection timeout" }
}
```

**Note**: Stack traces are only included in development mode for security.

---

## Log Entry Format

### TypeScript Interface

```typescript
export interface LogEntry {
	level: LogLevel; // 'debug' | 'info' | 'warn' | 'error'
	message: string; // The log message
	context: string; // Logger context (e.g., 'UserService')
	timestamp: string; // ISO 8601 timestamp
	meta?: Record<string, any>; // Optional metadata
	error?: {
		// Error details (error level only)
		name: string;
		message: string;
		stack?: string; // Only in development
	};
}
```

### Development Output

Human-readable format with color coding:

- `DEBUG`: Cyan
- `INFO`: Green
- `WARN`: Yellow
- `ERROR`: Red

```
[INFO] [UserService] User created { userId: '123', email: 'user@example.com' }
```

### Production Output

Structured JSON for log aggregation:

```json
{
	"level": "info",
	"message": "User created",
	"context": "UserService",
	"timestamp": "2025-11-17T12:34:56.789Z",
	"meta": {
		"userId": "123",
		"email": "user@example.com"
	}
}
```

---

## Best Practices

### 1. Choose Appropriate Log Levels

```typescript
// ✅ Good
logger.debug('Query executed', { query: sql, duration: 45 }); // Debug info
logger.info('User logged in', { userId: '123' }); // Important events
logger.warn('Slow query detected', { duration: 5000 }); // Potential issues
logger.error(error, { context: 'payment_processing' }); // Errors

// ❌ Avoid
logger.info('Loop iteration 5'); // Too verbose
logger.error('User not found'); // Not an error (use warn)
```

### 2. Include Relevant Context

```typescript
// ✅ Good - Includes actionable context
logger.error(error, {
	operation: 'createUser',
	userId: data.userId,
	timestamp: Date.now(),
	retryAttempt: 3
});

// ❌ Poor - Missing context
logger.error(error);
```

### 3. Use Consistent Naming

```typescript
// ✅ Good - Clear, hierarchical naming
createLogger('API:AgentStream');
createLogger('Service:UserManagement');
createLogger('DB:QueryBuilder');

// ❌ Avoid - Inconsistent naming
createLogger('agent stuff');
createLogger('my-service');
```

### 4. Avoid Sensitive Data

```typescript
// ✅ Good - Redact sensitive info
logger.info('Payment processed', {
	userId: user.id,
	amount: payment.amount,
	last4: payment.card.slice(-4)
});

// ❌ Bad - Leaks sensitive data
logger.info('Payment processed', {
	creditCard: payment.card,
	cvv: payment.cvv,
	password: user.password
});
```

### 5. Log Before and After Critical Operations

```typescript
async function processPayment(data: PaymentData) {
	logger.info('Processing payment', { userId: data.userId, amount: data.amount });

	try {
		const result = await stripe.charge(data);
		logger.info('Payment successful', { chargeId: result.id, amount: data.amount });
		return result;
	} catch (error) {
		logger.error(error as Error, { operation: 'stripe_charge', userId: data.userId });
		throw error;
	}
}
```

---

## Migration from console.\*

### Before (console)

```typescript
console.log('User created:', user.id);
console.warn('Rate limit approaching');
console.error('Database error:', error);
```

### After (logger)

```typescript
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('UserService');

logger.info('User created', { userId: user.id });
logger.warn('Rate limit approaching', { currentRate: 95, limit: 100 });
logger.error(error as Error, { context: 'database_query' });
```

---

## Usage Examples

### Example 1: API Endpoint

```typescript
import { createLogger } from '$lib/utils/logger';
import type { RequestHandler } from './$types';

const logger = createLogger('API:AgentStream');

export const POST: RequestHandler = async ({ request, locals }) => {
	logger.info('Agent stream request started', { userId: locals.user?.id });

	try {
		const data = await request.json();
		logger.debug('Request payload received', { messageCount: data.messages?.length });

		// Process request...

		logger.info('Agent stream completed successfully', {
			userId: locals.user?.id,
			duration: Date.now() - startTime
		});

		return new Response(/* ... */);
	} catch (error) {
		logger.error(error as Error, {
			userId: locals.user?.id,
			endpoint: '/api/agent/stream'
		});
		throw error;
	}
};
```

### Example 2: Service Class

```typescript
import { createLogger } from '$lib/utils/logger';

export class OntologyContextLoader {
	private logger = createLogger('OntologyContextLoader');

	async loadProjectContext(projectId: string): Promise<OntologyContext> {
		this.logger.info('Loading project context', { projectId });

		const startTime = Date.now();

		try {
			const context = await this.fetchFromDatabase(projectId);

			this.logger.debug('Context loaded successfully', {
				projectId,
				duration: Date.now() - startTime,
				elementCount: context.elements.length
			});

			return context;
		} catch (error) {
			this.logger.error(error as Error, {
				operation: 'loadProjectContext',
				projectId
			});
			throw error;
		}
	}
}
```

### Example 3: Caching with Logging

```typescript
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('CacheService');

function getCachedValue<T>(cacheKey: string, loader: () => Promise<T>): Promise<T> {
	const cached = cache.get(cacheKey);

	if (cached) {
		logger.debug('Cache hit', {
			cacheKey,
			age: Date.now() - cached.timestamp
		});
		return Promise.resolve(cached.value);
	}

	logger.debug('Cache miss, loading fresh data', { cacheKey });

	return loader().then((value) => {
		cache.set(cacheKey, { value, timestamp: Date.now() });
		logger.debug('Value cached', { cacheKey });
		return value;
	});
}
```

---

## Integration with Log Aggregation Tools

The structured JSON output in production is designed to integrate with log aggregation platforms:

### Datadog

```javascript
// Logs are automatically parsed as JSON
// Query examples:
// - service:buildos @level:error
// - @context:API* @meta.userId:123
```

### Elasticsearch / OpenSearch

```json
// Automatic field mapping
{
	"level": "error",
	"message": "Database connection failed",
	"context": "DatabaseService",
	"timestamp": "2025-11-17T12:34:56.789Z",
	"@metadata": {
		"userId": "123",
		"operation": "query"
	}
}
```

### CloudWatch Logs

```javascript
// CloudWatch Insights query examples:
fields @timestamp, level, context, message
| filter level = "error"
| filter context like /API/
| sort @timestamp desc
```

---

## Performance Considerations

### Log Level Control

Debug logs are automatically disabled in production to reduce overhead:

```typescript
// This has ZERO cost in production
logger.debug('Expensive computation result', { data: heavyObject });
```

### Lazy Evaluation

For expensive metadata computation, use functions:

```typescript
// ❌ Avoid - Computes even if not logged
logger.debug('Result', { data: expensiveComputation() });

// ✅ Better - Only compute if needed
if (dev) {
	logger.debug('Result', { data: expensiveComputation() });
}
```

### Async Logging

Consider async logging for high-volume production systems:

```typescript
// Future enhancement - async logging queue
logger.infoAsync('High volume event', { data });
```

---

## Troubleshooting

### Logs not appearing in production

**Issue**: Logs don't show up in production environment

**Solutions**:

1. Verify `dev` environment variable is set correctly
2. Check that production logging infrastructure is configured
3. Ensure `info/warn/error` levels are used (debug is dev-only)

### JSON parsing errors in production

**Issue**: Log aggregation tool can't parse logs

**Solutions**:

1. Verify no other code is using `console.log` with non-JSON output
2. Check that logger is imported correctly
3. Ensure metadata objects are JSON-serializable (no circular references)

### Missing context in logs

**Issue**: Logs lack context information

**Solutions**:

1. Always create logger with descriptive context: `createLogger('MyService')`
2. Include relevant metadata in log calls
3. Use consistent naming conventions for contexts

---

## Related Documentation

- **ADR**: Architecture decision record for structured logging
    - Location: `/docs/technical/architecture/decisions/ADR-001-agentic-chat-performance-optimizations.md`

- **Implementation**: Logger service source code
    - Location: `/src/lib/utils/logger.ts`

- **Usage Examples**: Real-world usage in agent stream API
    - Location: `/src/routes/api/agent/stream/+server.ts`

---

## Future Enhancements

1. **Log Level Configuration**: Environment-based log level control
2. **Async Logging**: Non-blocking log queue for high-volume scenarios
3. **Sampling**: Sample debug logs in production for specific users/sessions
4. **Metrics Integration**: Export log metrics to monitoring dashboards
5. **Correlation IDs**: Automatic request correlation across services
