# Stripe Webhook Signature Validation Failure Procedures

> **Purpose**: Procedures for handling Stripe webhook signature validation failures in BuildOS
>
> **Severity**: High - Affects billing, subscriptions, and payment processing
>
> **Last Updated**: September 26, 2025

## 🚨 Immediate Response (< 2 minutes)

### 1. Check Webhook Endpoint Status
```bash
# Test webhook endpoint accessibility
curl -X POST https://your-app.vercel.app/api/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: test" \
  -d '{"test": true}'

# Should return 400 (signature validation failure) not 500
```

### 2. Verify Stripe Webhook Configuration
```bash
# Check if STRIPE_WEBHOOK_SECRET is set
echo "Webhook secret length: ${#STRIPE_WEBHOOK_SECRET}"

# Should be 64+ characters starting with "whsec_"
```

### 3. Check Recent Webhook Failures
```bash
# Check Vercel logs for signature failures
vercel logs --filter="stripe" --filter="signature" --limit=20

# Look for specific error patterns:
# - "No signatures found matching the expected signature"
# - "Invalid signature for payload"
# - "Webhook signature verification failed"
```

## 🔍 Failure Types & Diagnosis

### Type 1: Invalid Webhook Secret

**Symptoms**:
- All Stripe webhooks failing with signature validation errors
- Error: "No signatures found matching the expected signature for payload"

**Diagnosis**:
```typescript
// Check webhook secret format
console.log('Webhook secret format check:');
console.log('Starts with whsec_:', process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'));
console.log('Length check:', process.env.STRIPE_WEBHOOK_SECRET?.length > 60);
```

**Common Causes**:
1. Wrong webhook secret from Stripe dashboard
2. Environment variable not properly set in Vercel
3. Secret accidentally regenerated in Stripe

**Immediate Fix**:
```bash
# 1. Get correct webhook secret from Stripe dashboard
# 2. Update Vercel environment variable
vercel env rm STRIPE_WEBHOOK_SECRET
vercel env add STRIPE_WEBHOOK_SECRET

# 3. Redeploy to pick up new environment variable
vercel --prod
```

### Type 2: Request Body Parsing Issues

**Symptoms**:
- Signature validation fails intermittently
- Error: "Invalid signature for payload"
- Works in testing but fails in production

**Diagnosis**:
```typescript
// Common issue: Body parsed before signature validation
export async function POST(request: Request) {
  // ❌ WRONG: Don't parse body before validation
  const body = await request.json();

  // ❌ WRONG: Body already consumed
  const isValid = stripe.webhooks.constructEvent(
    JSON.stringify(body), // This won't match original payload
    signature,
    webhookSecret
  );

  // ✅ CORRECT: Use raw body
  const rawBody = await request.text();
  const isValid = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    webhookSecret
  );
}
```

**Correct Implementation**:
```typescript
import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: 'Missing signature or webhook secret' },
      { status: 400 }
    );
  }

  try {
    // Get raw body as string (critical for signature validation)
    const rawBody = await request.text();

    // Construct and verify the event
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );

    // Process the verified event
    await processStripeEvent(event);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error);

    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    );
  }
}
```

### Type 3: Multiple Webhook Endpoints

**Symptoms**:
- Some webhooks work, others fail
- Signature validation works for some events but not others

**Diagnosis**:
```typescript
// Check if multiple webhook endpoints are configured
// Each endpoint has its own secret!

const webhookSecrets = {
  billing: process.env.STRIPE_WEBHOOK_SECRET_BILLING,
  connect: process.env.STRIPE_WEBHOOK_SECRET_CONNECT,
  main: process.env.STRIPE_WEBHOOK_SECRET,
};

// Route to correct secret based on event type or endpoint
function getWebhookSecret(eventType: string): string {
  if (eventType.startsWith('account.') || eventType.startsWith('capability.')) {
    return webhookSecrets.connect;
  }
  if (eventType.startsWith('invoice.') || eventType.startsWith('customer.subscription.')) {
    return webhookSecrets.billing;
  }
  return webhookSecrets.main;
}
```

### Type 4: Clock Skew / Timestamp Issues

**Symptoms**:
- Webhooks fail with "Timestamp outside the tolerance zone"
- Intermittent failures during high load

**Diagnosis**:
```typescript
// Check server time vs Stripe timestamp
export async function POST(request: NextRequest) {
  const timestamp = request.headers.get('stripe-timestamp');
  const serverTime = Math.floor(Date.now() / 1000);
  const stripeTime = parseInt(timestamp || '0');
  const timeDiff = Math.abs(serverTime - stripeTime);

  console.log({
    serverTime,
    stripeTime,
    timeDiff,
    isWithinTolerance: timeDiff <= 300 // 5 minutes
  });

  // Stripe default tolerance is 300 seconds (5 minutes)
}
```

**Solution**:
```typescript
// Custom tolerance for webhook validation
try {
  const event = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    webhookSecret,
    600 // 10 minutes tolerance instead of default 5
  );
} catch (error) {
  if (error.type === 'StripeSignatureVerificationError') {
    console.error('Signature verification failed:', {
      message: error.message,
      detail: error.detail,
      timestamp: request.headers.get('stripe-timestamp'),
      serverTime: Math.floor(Date.now() / 1000)
    });
  }
  throw error;
}
```

## 🛠️ Recovery Procedures

### Immediate Recovery

1. **Emergency Webhook Bypass** (Use with caution):
```typescript
// Only for critical production issues
// Remove after fixing root cause!

export async function POST(request: NextRequest) {
  const bypassMode = process.env.STRIPE_WEBHOOK_BYPASS === 'true';

  if (bypassMode) {
    console.warn('⚠️ STRIPE WEBHOOK BYPASS MODE ACTIVE');

    // Still log the signature for debugging
    const signature = request.headers.get('stripe-signature');
    console.log('Bypassed signature:', signature);

    // Process without validation
    const body = await request.json();
    await processStripeEvent(body);

    return NextResponse.json({ received: true });
  }

  // Normal validation...
}
```

2. **Webhook Secret Rotation**:
```typescript
// Handle webhook secret rotation gracefully
async function validateWithFallback(rawBody: string, signature: string) {
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,      // Current
    process.env.STRIPE_WEBHOOK_SECRET_OLD,  // Previous (during rotation)
  ].filter(Boolean);

  for (const secret of secrets) {
    try {
      const event = stripe.webhooks.constructEvent(rawBody, signature, secret!);
      return event;
    } catch (error) {
      // Try next secret
      continue;
    }
  }

  throw new Error('All webhook secrets failed validation');
}
```

### Data Recovery

1. **Missed Webhook Events**:
```typescript
// Retrieve missed events from Stripe API
async function recoverMissedEvents(startTime: Date, endTime: Date) {
  try {
    // Get events from Stripe API
    const events = await stripe.events.list({
      created: {
        gte: Math.floor(startTime.getTime() / 1000),
        lte: Math.floor(endTime.getTime() / 1000),
      },
      limit: 100,
    });

    for (const event of events.data) {
      try {
        // Process each missed event
        await processStripeEvent(event);
        console.log(`Recovered event: ${event.id} (${event.type})`);
      } catch (error) {
        console.error(`Failed to process recovered event ${event.id}:`, error);
      }
    }

    // Handle pagination if needed
    if (events.has_more) {
      const lastEvent = events.data[events.data.length - 1];
      await recoverMissedEvents(new Date(lastEvent.created * 1000), endTime);
    }

  } catch (error) {
    console.error('Failed to recover missed events:', error);
  }
}

// Usage during incident recovery
await recoverMissedEvents(
  new Date('2025-09-26T10:00:00Z'), // Start of outage
  new Date('2025-09-26T11:30:00Z')  // End of outage
);
```

2. **Subscription State Reconciliation**:
```typescript
// Ensure subscription states match Stripe
async function reconcileSubscriptions() {
  const localSubscriptions = await supabase
    .from('subscriptions')
    .select('*')
    .in('status', ['active', 'trialing', 'past_due']);

  for (const localSub of localSubscriptions.data || []) {
    try {
      // Get current state from Stripe
      const stripeSub = await stripe.subscriptions.retrieve(localSub.stripe_subscription_id);

      if (stripeSub.status !== localSub.status) {
        console.log(`Subscription ${localSub.id} status mismatch:`, {
          local: localSub.status,
          stripe: stripeSub.status
        });

        // Update local state to match Stripe
        await supabase
          .from('subscriptions')
          .update({
            status: stripeSub.status,
            current_period_start: new Date(stripeSub.current_period_start * 1000),
            current_period_end: new Date(stripeSub.current_period_end * 1000),
          })
          .eq('id', localSub.id);
      }
    } catch (error) {
      console.error(`Failed to reconcile subscription ${localSub.id}:`, error);
    }
  }
}
```

## 📊 Monitoring & Prevention

### Enhanced Webhook Monitoring

1. **Signature Validation Metrics**:
```typescript
// Track signature validation success/failure rates
async function logWebhookAttempt(
  eventType: string,
  success: boolean,
  error?: string
) {
  await supabase.from('webhook_logs').insert({
    provider: 'stripe',
    event_type: eventType,
    success,
    error_message: error,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  const eventType = 'unknown';

  try {
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    await logWebhookAttempt(event.type, true);
    // Process event...
  } catch (error) {
    await logWebhookAttempt(eventType, false, error.message);
    throw error;
  }
}
```

2. **Alert Thresholds**:
```typescript
// Daily webhook health check
async function checkWebhookHealth() {
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const { data: metrics } = await supabase
    .from('webhook_logs')
    .select('success, count(*)')
    .eq('provider', 'stripe')
    .gte('timestamp', last24Hours.toISOString())
    .groupBy('success');

  const total = metrics?.reduce((sum, m) => sum + m.count, 0) || 0;
  const failed = metrics?.find(m => !m.success)?.count || 0;
  const failureRate = total > 0 ? (failed / total) * 100 : 0;

  if (failureRate > 10) { // Alert if >10% failure rate
    await sendSlackAlert(
      `🚨 Stripe webhook failure rate: ${failureRate.toFixed(1)}% (${failed}/${total} failed)`
    );
  }
}
```

### Proactive Prevention

1. **Webhook Secret Validation**:
```typescript
// Startup validation
function validateWebhookConfiguration() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required');
  }

  if (!secret.startsWith('whsec_')) {
    throw new Error('STRIPE_WEBHOOK_SECRET must start with "whsec_"');
  }

  if (secret.length < 60) {
    throw new Error('STRIPE_WEBHOOK_SECRET appears to be invalid (too short)');
  }

  console.log('✅ Stripe webhook configuration validated');
}

// Call during app startup
validateWebhookConfiguration();
```

2. **Webhook Endpoint Testing**:
```typescript
// Create test endpoint for webhook validation
export async function GET() {
  try {
    // Test webhook endpoint configuration
    const testPayload = JSON.stringify({ test: true });
    const testSignature = stripe.webhooks.generateTestHeaderString({
      payload: testPayload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });

    // Validate our own implementation
    const event = stripe.webhooks.constructEvent(
      testPayload,
      testSignature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    return NextResponse.json({
      status: 'healthy',
      webhook_secret_configured: true,
      test_validation: 'passed'
    });
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      error: error.message
    }, { status: 500 });
  }
}
```

## 🔗 Related Resources

- [Stripe Webhook Documentation](https://stripe.com/docs/webhooks)
- [Stripe Webhook Signature Verification](https://stripe.com/docs/webhooks/signatures)
- [Incident Response Template](/docs/technical/deployment/runbooks/incident-response.md)
- [Performance Troubleshooting Guide](/docs/technical/deployment/runbooks/performance-issues.md)

## 📞 Escalation Contacts

- **Stripe Support**: Create ticket at https://support.stripe.com
- **Internal Team**: #engineering Slack channel
- **Billing System Owner**: Check team directory

## 📝 Post-Incident Checklist

- [ ] Verify all webhook endpoints are working
- [ ] Reconcile any missed billing events
- [ ] Update webhook monitoring thresholds
- [ ] Test webhook signature validation
- [ ] Document root cause and prevention measures
- [ ] Review and update webhook secrets if compromised