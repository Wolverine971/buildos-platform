# SMS Testing Guide

This guide provides comprehensive testing strategies for the BuildOS SMS integration, including unit tests, integration tests, and end-to-end testing scenarios.

## Testing Overview

The SMS integration can be tested at multiple levels:

- **Unit Tests** - Test individual components in isolation
- **Integration Tests** - Test component interactions
- **End-to-End Tests** - Test complete workflows
- **Manual Testing** - Verify actual SMS delivery

## Setting Up Test Environment

### 1. Twilio Test Credentials

Twilio provides test credentials that don't charge your account:

1. Go to [Twilio Console > Settings](https://console.twilio.com/us1/develop/settings/api-keys)
2. Find **Test Credentials**:
   ```
   Test Account SID: ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   Test Auth Token: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### 2. Test Environment Variables

Create `apps/web/.env.test`:

```bash
# Test Twilio Credentials
PRIVATE_TWILIO_ACCOUNT_SID=ACtest_account_sid
PRIVATE_TWILIO_AUTH_TOKEN=test_auth_token
PRIVATE_TWILIO_MESSAGING_SERVICE_SID=MGtest_messaging_service
PRIVATE_TWILIO_VERIFY_SERVICE_SID=VAtest_verify_service

# Test Database
DATABASE_URL=postgresql://localhost:5432/buildos_test
PUBLIC_SUPABASE_URL=http://localhost:54321
PUBLIC_SUPABASE_ANON_KEY=test_anon_key

# Disable rate limiting for tests
PRIVATE_SMS_RATE_LIMIT_PER_MINUTE=1000
PRIVATE_SMS_RATE_LIMIT_PER_HOUR=10000
```

### 3. Test Phone Numbers

Twilio provides magic test numbers with specific behaviors:

| Phone Number | Behavior                   | Use Case           |
| ------------ | -------------------------- | ------------------ |
| +15005550006 | Valid number, SMS succeeds | Success testing    |
| +15005550001 | Invalid number error       | Error handling     |
| +15005550009 | SMS not capable            | Capability testing |
| +15005550004 | Blacklisted number         | Blacklist testing  |
| +15005551234 | Queue overflow             | Rate limit testing |

## Unit Testing

### Running Unit Tests

```bash
# Run all Twilio service tests
pnpm test --filter=@buildos/twilio-service

# Run with coverage
pnpm test:coverage --filter=@buildos/twilio-service

# Run in watch mode
pnpm test:watch --filter=@buildos/twilio-service
```

### Example Unit Tests

#### Test Phone Formatting

```typescript
// packages/twilio-service/src/__tests__/client.test.ts
import { describe, it, expect } from "vitest";
import { TwilioClient } from "../client";

describe("TwilioClient", () => {
  describe("Phone Number Formatting", () => {
    const client = new TwilioClient({
      accountSid: "test",
      authToken: "test",
      messagingServiceSid: "test",
    });

    it("should format US numbers correctly", () => {
      const testCases = [
        { input: "5551234567", expected: "+15551234567" },
        { input: "(555) 123-4567", expected: "+15551234567" },
        { input: "+15551234567", expected: "+15551234567" },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = client["formatPhoneNumber"](input);
        expect(result).toBe(expected);
      });
    });
  });
});
```

#### Test SMS Service

```typescript
// packages/twilio-service/src/__tests__/sms-service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SMSService } from "../services/sms.service";

describe("SMSService", () => {
  let service: SMSService;
  let mockTwilioClient: any;
  let mockSupabase: any;

  beforeEach(() => {
    mockTwilioClient = {
      sendSMS: vi.fn().mockResolvedValue({ sid: "SM123" }),
    };

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "template-1", message_template: "Test {{name}}" },
      }),
    };

    service = new SMSService(mockTwilioClient, mockSupabase);
  });

  it("should send task reminder", async () => {
    const result = await service.sendTaskReminder({
      userId: "user-123",
      phoneNumber: "+15005550006",
      taskName: "Test Task",
      dueDate: new Date(),
    });

    expect(result.success).toBe(true);
    expect(mockTwilioClient.sendSMS).toHaveBeenCalled();
  });

  it("should handle user opt-out", async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { opted_out: true },
    });

    await expect(
      service.sendTaskReminder({
        userId: "user-123",
        phoneNumber: "+15005550006",
        taskName: "Test",
        dueDate: new Date(),
      }),
    ).rejects.toThrow("User has disabled");
  });
});
```

## Integration Testing

### Database Integration Tests

```typescript
// apps/web/src/tests/integration/sms-db.test.ts
import { createClient } from "@supabase/supabase-js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

describe("SMS Database Integration", () => {
  let supabase: any;
  let testUserId: string;

  beforeAll(async () => {
    supabase = createClient(
      process.env.PUBLIC_SUPABASE_URL!,
      process.env.PRIVATE_SUPABASE_SERVICE_KEY!,
    );

    // Create test user
    const { data: user } = await supabase.auth.signUp({
      email: "test@example.com",
      password: "testpass123",
    });
    testUserId = user.user.id;
  });

  afterAll(async () => {
    // Cleanup
    await supabase.from("sms_messages").delete().eq("user_id", testUserId);
    await supabase
      .from("user_sms_preferences")
      .delete()
      .eq("user_id", testUserId);
  });

  it("should queue SMS message", async () => {
    const { data, error } = await supabase.rpc("queue_sms_message", {
      p_user_id: testUserId,
      p_phone_number: "+15005550006",
      p_message: "Test message",
      p_priority: "normal",
    });

    expect(error).toBeNull();
    expect(data).toBeDefined();

    // Verify message was created
    const { data: message } = await supabase
      .from("sms_messages")
      .select("*")
      .eq("id", data)
      .single();

    expect(message.status).toBe("queued");
    expect(message.phone_number).toBe("+15005550006");
  });

  it("should enforce RLS policies", async () => {
    // Create another user
    const { data: otherUser } = await supabase.auth.signUp({
      email: "other@example.com",
      password: "testpass123",
    });

    // Try to read first user's messages
    const { data: messages } = await supabase
      .from("sms_messages")
      .select("*")
      .eq("user_id", testUserId);

    expect(messages).toHaveLength(0); // Should not see other user's messages
  });
});
```

### API Integration Tests

```typescript
// apps/web/src/tests/integration/sms-api.test.ts
import { describe, it, expect } from "vitest";

describe("SMS API Integration", () => {
  const baseUrl = "http://localhost:5173";
  let authToken: string;

  beforeAll(async () => {
    // Get auth token
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "testpass123",
      }),
    });
    const data = await response.json();
    authToken = data.token;
  });

  it("should start phone verification", async () => {
    const response = await fetch(`${baseUrl}/api/sms/verify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phoneNumber: "+15005550006",
      }),
    });

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.verificationSent).toBe(true);
  });

  it("should handle invalid phone number", async () => {
    const response = await fetch(`${baseUrl}/api/sms/verify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phoneNumber: "+15005550001", // Invalid test number
      }),
    });

    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.errors).toContain("Invalid phone number");
  });
});
```

## End-to-End Testing

### Playwright E2E Tests

```typescript
// e2e/sms-verification.spec.ts
import { test, expect } from "@playwright/test";

test.describe("SMS Phone Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "test@example.com");
    await page.fill('input[name="password"]', "testpass123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/dashboard");
  });

  test("should verify phone number", async ({ page }) => {
    // Navigate to settings
    await page.goto("/settings/sms");

    // Enter phone number
    await page.fill('input[type="tel"]', "5005550006");
    await page.click('button:has-text("Send Code")');

    // Wait for verification sent
    await expect(page.locator("text=Verification code sent")).toBeVisible();

    // Enter test code
    await page.fill('input[placeholder="123456"]', "123456");
    await page.click('button:has-text("Verify")');

    // Check success
    await expect(page.locator("text=verified successfully")).toBeVisible();
  });

  test("should update SMS preferences", async ({ page }) => {
    await page.goto("/settings/sms");

    // Enable task reminders
    await page.check('input[id="task-reminders"]');

    // Set quiet hours
    await page.fill('input[id="quiet-start"]', "22:00");
    await page.fill('input[id="quiet-end"]', "08:00");

    // Save preferences
    await page.click('button:has-text("Save Preferences")');

    // Verify saved
    await expect(page.locator("text=preferences saved")).toBeVisible();
  });
});
```

## Manual Testing Checklist

### Phone Verification Flow

- [ ] Enter valid phone number
- [ ] Receive verification code
- [ ] Enter correct code
- [ ] Verify success message
- [ ] Check database for verified status

### SMS Sending

- [ ] Create task with due date
- [ ] Enable task reminders
- [ ] Trigger reminder
- [ ] Verify SMS received
- [ ] Check delivery status in dashboard

### Error Scenarios

- [ ] Invalid phone number format
- [ ] Duplicate phone number
- [ ] Wrong verification code
- [ ] Expired verification code
- [ ] Rate limit exceeded

### Preferences

- [ ] Enable/disable notifications
- [ ] Set quiet hours
- [ ] Test quiet hours enforcement
- [ ] Opt-out functionality
- [ ] Re-enable after opt-out

## Testing Commands

### Quick Test Commands

```bash
# Run all tests
pnpm test

# Run SMS package tests only
pnpm test --filter=@buildos/twilio-service

# Run integration tests
pnpm test:integration

# Run E2E tests
pnpm test:e2e

# Run specific test file
pnpm test src/services/sms.test.ts

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

### Database Testing

```sql
-- Test SMS queueing
SELECT queue_sms_message(
  p_user_id := (SELECT id FROM auth.users LIMIT 1),
  p_phone_number := '+15005550006',
  p_message := 'Test message',
  p_priority := 'high'::sms_priority
);

-- Check message status
SELECT id, status, twilio_sid, sent_at, delivered_at
FROM sms_messages
ORDER BY created_at DESC
LIMIT 5;

-- Test template rendering
SELECT
  template_key,
  message_template,
  regexp_replace(
    message_template,
    '{{task_name}}',
    'Test Task',
    'g'
  ) as rendered
FROM sms_templates
WHERE template_key = 'task_reminder';
```

## Load Testing

### Using Artillery

Create `load-test.yml`:

```yaml
config:
  target: "http://localhost:5173"
  phases:
    - duration: 60
      arrivalRate: 10
  defaults:
    headers:
      Authorization: "Bearer YOUR_TEST_TOKEN"

scenarios:
  - name: "SMS Sending"
    flow:
      - post:
          url: "/api/sms/send"
          json:
            phoneNumber: "+15005550006"
            message: "Load test message"
      - think: 5
```

Run load test:

```bash
artillery run load-test.yml
```

## Debugging Tests

### Enable Debug Logging

```typescript
// Set in test files
process.env.DEBUG = "twilio:*";
process.env.LOG_LEVEL = "debug";
```

### Inspect Database State

```sql
-- Check queue status
SELECT
  job_type,
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM queue_jobs
WHERE job_type = 'send_sms'
GROUP BY job_type, status;

-- Check recent errors
SELECT
  id,
  phone_number,
  status,
  twilio_error_code,
  twilio_error_message,
  created_at
FROM sms_messages
WHERE status = 'failed'
AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### Mock Twilio Responses

```typescript
// Mock successful send
vi.mock("twilio", () => ({
  default: () => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        sid: "SM123",
        status: "queued",
        to: "+15005550006",
      }),
    },
    verify: {
      v2: {
        services: () => ({
          verifications: {
            create: vi.fn().mockResolvedValue({
              sid: "VE123",
              status: "pending",
            }),
          },
          verificationChecks: {
            create: vi.fn().mockResolvedValue({
              status: "approved",
            }),
          },
        }),
      },
    },
  }),
}));
```

## Continuous Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/sms-tests.yml
name: SMS Integration Tests

on:
  push:
    paths:
      - "packages/twilio-service/**"
      - "apps/web/src/lib/services/sms*"
      - "apps/worker/src/workers/smsWorker.ts"

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: supabase/postgres:latest
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - uses: pnpm/action-setup@v2
        with:
          version: 9

      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install

      - run: pnpm build --filter=@buildos/twilio-service

      - run: pnpm test --filter=@buildos/twilio-service

      - run: pnpm test:integration
```

## Test Coverage Goals

Aim for:

- **Unit Tests**: 80% coverage
- **Integration Tests**: Key workflows covered
- **E2E Tests**: Critical user journeys

Check coverage:

```bash
pnpm test:coverage --filter=@buildos/twilio-service
```

## Troubleshooting Test Failures

### Common Issues

#### Tests timing out

- Increase timeout: `test.setTimeout(10000)`
- Check async operations completing
- Verify database connections

#### Mocks not working

- Clear mock state: `vi.clearAllMocks()`
- Check mock implementation matches actual
- Verify import paths

#### Database state issues

- Clean up in `afterEach` hooks
- Use transactions for isolation
- Reset sequences if needed

### Debug Commands

```bash
# Run single test with verbose output
pnpm test -- --reporter=verbose sms.test.ts

# Run with specific test name
pnpm test -- -t "should send SMS"

# Run with coverage for specific file
pnpm test:coverage -- sms.service.ts
```

## Best Practices

1. **Isolate Tests** - Each test should be independent
2. **Use Test Data** - Never use production phone numbers
3. **Mock External Services** - Don't call real Twilio API in unit tests
4. **Clean Up** - Always clean up test data
5. **Test Edge Cases** - Invalid inputs, timeouts, rate limits
6. **Document Tests** - Clear test names and comments
7. **Maintain Tests** - Update tests when code changes

## Summary

Testing the SMS integration involves:

1. Unit tests for business logic
2. Integration tests for component interaction
3. E2E tests for user workflows
4. Manual testing for actual delivery
5. Load testing for performance
6. Continuous integration for reliability

Remember to use test credentials and phone numbers to avoid charges during testing!
