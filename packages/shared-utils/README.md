# @buildos/shared-utils

Shared utilities and services for BuildOS platform. Used by both web and worker applications.

## Installation

This package is internal to the BuildOS monorepo and installed automatically via workspace dependencies.

```json
{
	"dependencies": {
		"@buildos/shared-utils": "workspace:*"
	}
}
```

## Modules

### Metrics

**SMS Metrics & Alerts** - Track SMS operations and monitor system health

```typescript
import { smsMetricsService, smsAlertsService } from '@buildos/shared-utils';

// Record SMS events
await smsMetricsService.recordScheduled(userId, 5);
await smsMetricsService.recordSent(userId, messageId, twilioSid);
await smsMetricsService.recordDelivered(userId, messageId, deliveryTimeMs);

// Query metrics
const todayMetrics = await smsMetricsService.getTodayMetrics();
const userMetrics = await smsMetricsService.getUserMetrics(userId, 30);

// Check alerts
const alerts = await smsAlertsService.checkAlerts();
const unresolvedAlerts = await smsAlertsService.getUnresolvedAlerts();
```

## Development

```bash
# Watch mode for development
pnpm dev

# Build
pnpm build

# Type checking
pnpm typecheck

# Clean
pnpm clean
```

## Dependencies

- `@buildos/shared-types` - Type definitions
- `@buildos/supabase-client` - Database access
- `date-fns` - Date manipulation
