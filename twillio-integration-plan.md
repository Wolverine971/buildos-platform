# Twilio Messaging Service Architecture for BuildOS

## Overview

This architecture implements a robust, scalable messaging system using Twilio integrated with your existing Supabase Queues infrastructure. The design follows microservice best practices with clean separation of concerns and message queue patterns for reliability.

## Architecture Design

### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         BuildOS Platform                         │
├───────────────────────────────┬─────────────────────────────────┤
│         Web (SvelteKit)       │      Worker (Node.js)           │
│  - Creates reminder requests  │  - Processes message queue      │
│  - Schedules messages         │  - Sends via Twilio API         │
│  - UI for message templates  │  - Handles retries/failures     │
└───────────────┬───────────────┴─────────────────┬───────────────┘
                │                                 │
                ▼                                 ▼
        ┌──────────────┐                 ┌──────────────┐
        │   Supabase   │                 │   Supabase   │
        │    Queues    │◄────────────────│    Queues    │
        │   (pgmq)     │                 │   (pgmq)     │
        └──────────────┘                 └──────────────┘
                │                                 │
                └─────────────┬───────────────────┘
                              │
                      ┌───────▼────────┐
                      │  Twilio Service│
                      │   (Isolated)   │
                      └────────────────┘
```

## Implementation Plan

### Phase 1: Core Infrastructure

#### 1.1 Database Schema

```sql
-- Message templates for reusable content
CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  content_template TEXT NOT NULL, -- Supports {{variables}}
  template_vars JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message queue metadata
CREATE TABLE message_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  recipient_phone TEXT NOT NULL,
  message_content TEXT NOT NULL,
  template_id UUID REFERENCES message_templates(id),
  status TEXT DEFAULT 'pending', -- pending, processing, sent, failed, scheduled
  scheduled_for TIMESTAMPTZ,
  priority INT DEFAULT 0,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  metadata JSONB DEFAULT '{}', -- Store context, task info, etc.
  twilio_sid TEXT, -- Twilio message SID after sending
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- Create indexes for efficient queries
CREATE INDEX idx_message_jobs_status ON message_jobs(status);
CREATE INDEX idx_message_jobs_scheduled ON message_jobs(scheduled_for);
CREATE INDEX idx_message_jobs_user ON message_jobs(user_id);
```

#### 1.2 Supabase Queue Setup

```sql
-- Enable pgmq extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create the SMS queue
SELECT pgmq.create('sms_queue');

-- Optional: Create a high-priority queue for urgent messages
SELECT pgmq.create('sms_priority_queue');
```

### Phase 2: Package Structure

```typescript
// packages/twilio-service/
├── src/
│   ├── index.ts              // Main exports
│   ├── client.ts             // Twilio client wrapper
│   ├── queue/
│   │   ├── producer.ts       // Queue message producer
│   │   ├── consumer.ts       // Queue message consumer
│   │   └── types.ts          // Message types
│   ├── templates/
│   │   ├── engine.ts         // Template rendering
│   │   └── types.ts          // Template types
│   ├── services/
│   │   ├── sms.service.ts   // SMS sending logic
│   │   ├── scheduler.ts     // Message scheduling
│   │   └── retry.ts         // Retry logic
│   └── types.ts              // Shared types
├── package.json
└── tsconfig.json
```

### Phase 3: Core Implementation

#### 3.1 Twilio Client Wrapper

```typescript
// packages/twilio-service/src/client.ts
import twilio from "twilio";
import type { Twilio } from "twilio";

export class TwilioClient {
  private client: Twilio;
  private messagingServiceSid: string;

  constructor(config: {
    accountSid: string;
    authToken: string;
    messagingServiceSid: string;
  }) {
    this.client = twilio(config.accountSid, config.authToken);
    this.messagingServiceSid = config.messagingServiceSid;
  }

  async sendSMS(params: {
    to: string;
    body: string;
    scheduledAt?: Date;
    statusCallback?: string;
  }) {
    const messageParams: any = {
      messagingServiceSid: this.messagingServiceSid,
      to: params.to,
      body: params.body,
    };

    // Use Twilio's native scheduling if within 7 days
    if (params.scheduledAt) {
      const now = new Date();
      const diffDays = Math.ceil(
        (params.scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDays <= 7) {
        messageParams.sendAt = params.scheduledAt.toISOString();
        messageParams.scheduleType = "fixed";
      }
    }

    if (params.statusCallback) {
      messageParams.statusCallback = params.statusCallback;
    }

    return await this.client.messages.create(messageParams);
  }

  async cancelScheduledMessage(messageSid: string) {
    return await this.client
      .messages(messageSid)
      .update({ status: "canceled" });
  }

  async getMessageStatus(messageSid: string) {
    return await this.client.messages(messageSid).fetch();
  }
}
```

#### 3.2 Message Queue Producer

```typescript
// packages/twilio-service/src/queue/producer.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface MessageJob {
  id: string;
  recipient_phone: string;
  message_content: string;
  template_id?: string;
  template_vars?: Record<string, any>;
  scheduled_for?: string;
  priority?: number;
  metadata?: Record<string, any>;
}

export class MessageQueueProducer {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async enqueueMessage(job: MessageJob) {
    // First, save to message_jobs table for tracking
    const { data: messageJob, error: dbError } = await this.supabase
      .from("message_jobs")
      .insert({
        ...job,
        status: job.scheduled_for ? "scheduled" : "pending",
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // If not scheduled or scheduled for immediate send, add to queue
    const shouldQueue =
      !job.scheduled_for || new Date(job.scheduled_for) <= new Date();

    if (shouldQueue) {
      const queueName =
        job.priority && job.priority > 5 ? "sms_priority_queue" : "sms_queue";

      const { error: queueError } = await this.supabase
        .schema("pgmq_public")
        .rpc("send", {
          queue_name: queueName,
          message: {
            job_id: messageJob.id,
            ...job,
          },
        });

      if (queueError) throw queueError;
    }

    return messageJob;
  }

  async enqueueBatch(jobs: MessageJob[]) {
    const results = await Promise.allSettled(
      jobs.map((job) => this.enqueueMessage(job)),
    );

    return {
      successful: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected"),
      total: jobs.length,
    };
  }
}
```

#### 3.3 Message Queue Consumer (Worker)

```typescript
// packages/twilio-service/src/queue/consumer.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { TwilioClient } from "../client";
import { TemplateEngine } from "../templates/engine";

export class MessageQueueConsumer {
  private supabase: SupabaseClient;
  private twilioClient: TwilioClient;
  private templateEngine: TemplateEngine;
  private isRunning = false;

  constructor(supabaseUrl: string, supabaseKey: string, twilioConfig: any) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.twilioClient = new TwilioClient(twilioConfig);
    this.templateEngine = new TemplateEngine(this.supabase);
  }

  async start() {
    this.isRunning = true;
    console.log("Starting message queue consumer...");

    while (this.isRunning) {
      await this.processQueues();
      await this.sleep(1000); // Poll every second
    }
  }

  async processQueues() {
    // Process priority queue first
    await this.processQueue("sms_priority_queue");
    // Then regular queue
    await this.processQueue("sms_queue");
  }

  private async processQueue(queueName: string) {
    try {
      // Read messages with 30-second visibility timeout
      const { data: messages } = await this.supabase
        .schema("pgmq_public")
        .rpc("read", {
          queue_name: queueName,
          vt: 30,
          qty: 10,
        });

      if (!messages || messages.length === 0) return;

      for (const msg of messages) {
        await this.processMessage(msg, queueName);
      }
    } catch (error) {
      console.error(`Error processing queue ${queueName}:`, error);
    }
  }

  private async processMessage(message: any, queueName: string) {
    const job = message.message;

    try {
      // Update status to processing
      await this.updateJobStatus(job.job_id, "processing");

      // Render template if needed
      let messageContent = job.message_content;
      if (job.template_id && job.template_vars) {
        messageContent = await this.templateEngine.render(
          job.template_id,
          job.template_vars,
        );
      }

      // Send via Twilio
      const twilioMessage = await this.twilioClient.sendSMS({
        to: job.recipient_phone,
        body: messageContent,
        scheduledAt: job.scheduled_for
          ? new Date(job.scheduled_for)
          : undefined,
      });

      // Update job as sent
      await this.updateJobStatus(job.job_id, "sent", {
        twilio_sid: twilioMessage.sid,
        sent_at: new Date(),
      });

      // Delete message from queue
      await this.supabase.schema("pgmq_public").rpc("delete", {
        queue_name: queueName,
        msg_id: message.msg_id,
      });
    } catch (error: any) {
      console.error("Error processing message:", error);

      // Handle retry logic
      await this.handleFailure(job, error, message, queueName);
    }
  }

  private async handleFailure(
    job: any,
    error: any,
    message: any,
    queueName: string,
  ) {
    const retryCount = (job.retry_count || 0) + 1;
    const maxRetries = job.max_retries || 3;

    if (retryCount < maxRetries) {
      // Update retry count and re-queue with exponential backoff
      const delaySeconds = Math.pow(2, retryCount) * 60; // 2min, 4min, 8min

      await this.updateJobStatus(job.job_id, "pending", {
        retry_count: retryCount,
        error_details: {
          message: error.message,
          timestamp: new Date(),
        },
      });

      // Re-queue with delay
      await this.supabase.schema("pgmq_public").rpc("send", {
        queue_name: queueName,
        message: { ...job, retry_count: retryCount },
        delay: delaySeconds,
      });
    } else {
      // Max retries reached, mark as failed
      await this.updateJobStatus(job.job_id, "failed", {
        error_details: {
          message: error.message,
          final_attempt: true,
          timestamp: new Date(),
        },
      });
    }

    // Delete the current message from queue
    await this.supabase.schema("pgmq_public").rpc("delete", {
      queue_name: queueName,
      msg_id: message.msg_id,
    });
  }

  private async updateJobStatus(
    jobId: string,
    status: string,
    updates: any = {},
  ) {
    await this.supabase
      .from("message_jobs")
      .update({ status, ...updates })
      .eq("id", jobId);
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  stop() {
    this.isRunning = false;
  }
}
```

### Phase 4: Worker Service Integration

```typescript
// apps/worker/src/services/sms-worker.ts
import { MessageQueueConsumer } from "@buildos/twilio-service";

export class SMSWorkerService {
  private consumer: MessageQueueConsumer;

  constructor() {
    this.consumer = new MessageQueueConsumer(
      process.env.PUBLIC_SUPABASE_URL!,
      process.env.PRIVATE_SUPABASE_SERVICE_KEY!,
      {
        accountSid: process.env.PRIVATE_TWILIO_ACCOUNT_SID!,
        authToken: process.env.PRIVATE_TWILIO_AUTH_TOKEN!,
        messagingServiceSid: process.env.PRIVATE_TWILIO_MESSAGING_SERVICE_SID!,
      },
    );
  }

  async start() {
    await this.consumer.start();
  }

  async stop() {
    this.consumer.stop();
  }
}

// Add to your worker's main file
const smsWorker = new SMSWorkerService();
await smsWorker.start();
```

### Phase 5: Web App Integration

```typescript
// apps/web/src/lib/services/messaging.ts
import { MessageQueueProducer } from "@buildos/twilio-service";
import type { MessageJob } from "@buildos/twilio-service";

export class MessagingService {
  private producer: MessageQueueProducer;

  constructor(supabaseUrl: string, supabaseAnonKey: string) {
    this.producer = new MessageQueueProducer(supabaseUrl, supabaseAnonKey);
  }

  async sendReminder(params: {
    userId: string;
    phone: string;
    taskName: string;
    dueDate: Date;
    llmGeneratedContent: string;
  }) {
    const job: MessageJob = {
      id: crypto.randomUUID(),
      recipient_phone: params.phone,
      message_content: params.llmGeneratedContent,
      metadata: {
        user_id: params.userId,
        task_name: params.taskName,
        due_date: params.dueDate,
        type: "task_reminder",
      },
      priority: this.calculatePriority(params.dueDate),
    };

    return await this.producer.enqueueMessage(job);
  }

  private calculatePriority(dueDate: Date): number {
    const hoursUntilDue = (dueDate.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilDue < 1) return 10; // Urgent
    if (hoursUntilDue < 24) return 5; // High priority
    return 1; // Normal priority
  }
}
```

## Environment Variables

```bash
# .env.local (both apps)
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
PRIVATE_SUPABASE_SERVICE_KEY=your-service-role-key

# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxx
TWILIO_STATUS_CALLBACK_URL=https://your-domain.com/api/twilio/status

# Optional: Rate limiting
TWILIO_RATE_LIMIT_PER_SECOND=10
TWILIO_RATE_LIMIT_PER_MINUTE=100
```

## Monitoring & Observability

### Dashboard Queries

```sql
-- Messages sent today
SELECT COUNT(*) as sent_today
FROM message_jobs
WHERE status = 'sent'
AND sent_at >= CURRENT_DATE;

-- Failed messages requiring attention
SELECT * FROM message_jobs
WHERE status = 'failed'
AND created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Queue depth monitoring
SELECT
  pgmq.metrics('sms_queue') as regular_queue,
  pgmq.metrics('sms_priority_queue') as priority_queue;
```

## Best Practices & Scaling Considerations

### 1. **Message Deduplication**

- Add a unique constraint on `(user_id, message_content, recipient_phone)` with a time window to prevent duplicate sends

### 2. **Rate Limiting**

- Implement per-second and per-minute rate limits
- Use Twilio Messaging Services for automatic sender pool management

### 3. **Compliance**

- Always include opt-out instructions
- Store consent records in database
- Implement quiet hours (no messages 9 PM - 8 AM unless urgent)

### 4. **Scaling**

- Use Supabase read replicas for queue reads under heavy load
- Consider partitioned queues for high volume (>10k messages/day)
- Implement connection pooling in the worker service

### 5. **Error Handling**

- Implement circuit breaker pattern for Twilio API failures
- Use dead letter queues for messages that fail repeatedly
- Set up alerts for queue depth thresholds

## Future Enhancements

1. **WhatsApp Integration**: Extend the service to support WhatsApp Business API
2. **Rich Media**: Support for MMS and rich messaging formats
3. **Analytics Dashboard**: Build comprehensive messaging analytics
4. **Template Management UI**: Visual template builder in the web app
5. **A/B Testing**: Support for message variant testing
6. **Delivery Optimization**: ML-based optimal send time prediction

## Migration from BullMQ

If you're currently using BullMQ and want to migrate to Supabase Queues:

1. **Parallel Run**: Run both systems in parallel initially
2. **Gradual Migration**: Route percentage of traffic to new system
3. **Feature Parity**: Ensure all BullMQ features are replicated
4. **Data Migration**: Migrate historical data and templates

## Conclusion

This architecture provides:

- ✅ Clean separation between message orchestration and delivery
- ✅ Reliable queue-based processing with retry logic
- ✅ Scalable design supporting high throughput
- ✅ Simple interface that's easy to extend
- ✅ Built on proven patterns (message queues, microservices)
- ✅ Native integration with your existing Supabase infrastructure

The design is production-ready while remaining simple enough to understand and maintain. It can start small and scale as your needs grow.
