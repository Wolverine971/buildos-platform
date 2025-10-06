# Queue System Flow Diagrams

**Purpose:** Visual reference for BuildOS queue-based job processing
**Related:** [Web-Worker Architecture](./WEB-WORKER-ARCHITECTURE.md)

---

## Job Lifecycle Overview

```mermaid
flowchart TD
    START([Job Created]) --> PENDING[Status: pending]
    PENDING --> |Worker claims| PROCESSING[Status: processing]

    PROCESSING --> SUCCESS{Success?}
    SUCCESS -->|Yes| COMPLETED[Status: completed]
    SUCCESS -->|No| RETRY{Retry?}

    RETRY -->|Yes, attempts < max| RETRYING[Status: retrying]
    RETRY -->|No| FAILED[Status: failed]

    RETRYING --> |After backoff delay| PENDING

    COMPLETED --> END1([Job Done])
    FAILED --> END2([Job Failed])

    PENDING -.->|Manual action| CANCELLED[Status: cancelled]
    PROCESSING -.->|Manual action| CANCELLED
    CANCELLED --> END3([Job Cancelled])

    style PENDING fill:#ffd700
    style PROCESSING fill:#87ceeb
    style COMPLETED fill:#90ee90
    style FAILED fill:#ff6b6b
    style RETRYING fill:#ffa500
    style CANCELLED fill:#ddd
```

---

## Queue Job Creation

```mermaid
sequenceDiagram
    autonumber
    participant Client as Client (Web/Worker)
    participant DB as Supabase Database
    participant RPC as add_queue_job RPC
    participant Table as queue_jobs Table

    Client->>DB: Call add_queue_job()
    DB->>RPC: Execute function
    RPC->>RPC: Generate UUID
    RPC->>RPC: Check dedup_key

    alt Duplicate job exists
        RPC-->>Client: Return existing job_id
    else New job
        RPC->>Table: INSERT new row
        Table-->>RPC: Row created
        RPC-->>Client: Return new job_id
    end

    Note over Client,Table: Job now in 'pending' status
```

**Parameters:**

```typescript
add_queue_job(
  p_user_id: UUID,
  p_job_type: 'generate_daily_brief' | 'send_sms' | ...,
  p_metadata: JSONB,
  p_priority: 1-20 (default 10),
  p_scheduled_for: TIMESTAMP (default NOW()),
  p_dedup_key: TEXT (optional)
)
```

---

## Job Claiming (Worker Poll)

```mermaid
sequenceDiagram
    autonumber
    participant Worker as Worker Process
    participant DB as Supabase Database
    participant RPC as claim_pending_jobs RPC
    participant Table as queue_jobs Table

    loop Every 5 seconds
        Worker->>DB: Call claim_pending_jobs()
        DB->>RPC: Execute function
        RPC->>Table: SELECT FOR UPDATE SKIP LOCKED
        Note over RPC,Table: WHERE status = 'pending'<br/>AND scheduled_for <= NOW()<br/>AND job_type IN (p_job_types)<br/>ORDER BY priority ASC, created_at ASC<br/>LIMIT p_batch_size

        alt Jobs available
            Table->>RPC: Return matching rows
            RPC->>RPC: Update status = 'processing'
            RPC->>RPC: Set started_at = NOW()
            RPC-->>Worker: Return claimed jobs
            Worker->>Worker: Process jobs concurrently
        else No jobs
            RPC-->>Worker: Return empty array
            Worker->>Worker: Sleep 5 seconds
        end
    end
```

**Key Points:**

- **Atomic claiming:** `SELECT FOR UPDATE SKIP LOCKED` prevents race conditions
- **Priority-based:** Lower priority number = higher priority
- **Batch processing:** Claims up to 5 jobs per poll
- **Concurrent processing:** Uses `Promise.allSettled` for parallel execution

---

## Job Processing Flow

```mermaid
flowchart TD
    START[Worker Claims Job] --> VALIDATE{Metadata Valid?}

    VALIDATE -->|No| FAIL1[Mark Failed: Invalid metadata]
    VALIDATE -->|Yes| PROCESS[Execute Job Processor]

    PROCESS --> CHECK{Processor Type}

    CHECK -->|Brief Generation| BRIEF[Generate Daily Brief]
    CHECK -->|Email Sending| EMAIL[Send Email]
    CHECK -->|SMS Sending| SMS[Send SMS]
    CHECK -->|Phase Generation| PHASES[Generate Phases]

    BRIEF --> LLM1[Call OpenAI API]
    EMAIL --> SMTP[Send via SMTP]
    SMS --> TWILIO[Call Twilio API]
    PHASES --> LLM2[Call OpenAI API]

    LLM1 --> RESULT
    SMTP --> RESULT
    TWILIO --> RESULT
    LLM2 --> RESULT{Success?}

    RESULT -->|Yes| COMPLETE[complete_queue_job]
    RESULT -->|No| ERROR{Retryable?}

    COMPLETE --> UPDATE1[Update status = 'completed']
    UPDATE1 --> SAVE[Save result to JSONB]
    SAVE --> NOTIFY1[Broadcast notification]
    NOTIFY1 --> END1([Done])

    ERROR -->|Yes| RETRY[fail_queue_job retry=true]
    ERROR -->|No| FAIL2[fail_queue_job retry=false]

    RETRY --> BACKOFF[Calculate backoff: 2^attempts * 60min]
    BACKOFF --> REQUEUE[Set scheduled_for = NOW() + backoff]
    REQUEUE --> CHECK_MAX{attempts < max_attempts?}

    CHECK_MAX -->|Yes| STATUS_RETRY[status = 'retrying']
    CHECK_MAX -->|No| STATUS_FAIL[status = 'failed']

    FAIL1 --> END2([Done])
    FAIL2 --> END2
    STATUS_RETRY --> END2
    STATUS_FAIL --> END2

    style COMPLETE fill:#90ee90
    style FAIL1 fill:#ff6b6b
    style FAIL2 fill:#ff6b6b
    style STATUS_FAIL fill:#ff6b6b
    style STATUS_RETRY fill:#ffa500
```

---

## Real-Time Notification Flow

```mermaid
sequenceDiagram
    autonumber
    participant Worker as Worker Service
    participant Channel as Supabase Channel
    participant Realtime as Supabase Realtime Engine
    participant WebApp as Web App (Browser)
    participant Store as Notification Store
    participant UI as User Interface

    Note over Worker: Job completed successfully

    Worker->>Channel: supabase.channel(`user:${userId}`)
    Channel->>Channel: Prepare broadcast message
    Channel->>Realtime: send({type: 'broadcast', event, payload})

    Realtime->>Realtime: Find subscribed clients
    Realtime->>WebApp: Push notification

    WebApp->>Store: notificationStore.add()
    Store->>Store: Generate notification ID
    Store->>Store: Add to notifications array

    Store->>UI: Trigger reactive update
    UI->>UI: Show toast notification
    UI->>UI: Update UI elements

    Note over UI: User sees "Daily brief ready!"
```

**Notification Events:**

| Event              | Triggered By | Payload Example                  |
| ------------------ | ------------ | -------------------------------- |
| `brief_completed`  | Brief worker | `{briefId, briefDate, timezone}` |
| `brief_email_sent` | Email worker | `{emailId, briefId, trackingId}` |
| `phases_completed` | Phase worker | `{projectId, phaseCount}`        |
| `brief_failed`     | Brief worker | `{error, jobId}`                 |

---

## Retry Logic Visualization

```mermaid
flowchart LR
    subgraph "Attempt 1"
        A1[Process] -->|Fails| F1[Wait 2 min]
    end

    subgraph "Attempt 2"
        F1 --> A2[Process] -->|Fails| F2[Wait 4 min]
    end

    subgraph "Attempt 3"
        F2 --> A3[Process] -->|Fails| F3[Mark Failed]
    end

    F3 --> END[Status: failed]

    style A1 fill:#87ceeb
    style A2 fill:#87ceeb
    style A3 fill:#87ceeb
    style F1 fill:#ffa500
    style F2 fill:#ffa500
    style F3 fill:#ff6b6b
    style END fill:#ff6b6b
```

**Backoff Calculation:**

```typescript
const delayMinutes = Math.pow(2, attemptCount) * 60;

// Attempt 1: 2^1 = 2 minutes
// Attempt 2: 2^2 = 4 minutes
// Attempt 3: 2^3 = 8 minutes
```

---

## Job Types & Processors

```mermaid
graph TD
    QUEUE[queue_jobs Table] --> WORKER[Worker Process]

    WORKER --> BRIEF[processBrief]
    WORKER --> EMAIL[processEmailBrief]
    WORKER --> PHASES[processPhases]
    WORKER --> ONBOARD[processOnboarding]
    WORKER --> SMS[processSMS]

    BRIEF -->|Job Type| JT1[generate_daily_brief]
    EMAIL -->|Job Type| JT2[generate_brief_email]
    PHASES -->|Job Type| JT3[generate_phases]
    ONBOARD -->|Job Type| JT4[onboarding_analysis]
    SMS -->|Job Type| JT5[send_sms]

    JT1 --> EXT1[OpenAI API]
    JT2 --> EXT2[Gmail SMTP]
    JT3 --> EXT3[OpenAI API]
    JT4 --> EXT4[OpenAI API]
    JT5 --> EXT5[Twilio API]

    style QUEUE fill:#f9f
    style WORKER fill:#bbf
```

**Processor Registration:**

```typescript
// File: /apps/worker/src/worker.ts
queue.process("generate_daily_brief", processBrief);
queue.process("generate_brief_email", processEmailBrief);
queue.process("generate_phases", processPhases);
queue.process("onboarding_analysis", processOnboarding);
queue.process("send_sms", processSMS);
```

---

## Stalled Job Recovery

```mermaid
sequenceDiagram
    autonumber
    participant Monitor as Stalled Job Monitor
    participant DB as Supabase Database
    participant Table as queue_jobs Table

    Note over Monitor: Runs every 1 minute

    Monitor->>DB: reset_stalled_jobs('15 minutes')
    DB->>Table: Find stalled jobs
    Note over Table: WHERE status = 'processing'<br/>AND started_at < NOW() - '15 min'

    alt Stalled jobs found
        Table->>Table: UPDATE status = 'pending'
        Table->>Table: SET started_at = NULL
        Table-->>Monitor: Return count of reset jobs
        Monitor->>Monitor: Log: "Reset X stalled jobs"
    else No stalled jobs
        Table-->>Monitor: Return 0
    end
```

**Causes of Stalled Jobs:**

- Worker crash during processing
- Network timeout
- Out-of-memory errors
- Deployment during processing

**Recovery Strategy:**

- Reset to `pending` after 15 minutes
- Allows automatic retry
- Prevents permanent job loss

---

## Multi-Worker Horizontal Scaling

```mermaid
graph TD
    subgraph "Database Layer"
        QUEUE[(queue_jobs Table)]
    end

    subgraph "Worker Instance 1"
        W1[Worker Poll]
        P1A[Processor A]
        P1B[Processor B]
    end

    subgraph "Worker Instance 2"
        W2[Worker Poll]
        P2A[Processor A]
        P2B[Processor B]
    end

    subgraph "Worker Instance 3"
        W3[Worker Poll]
        P3A[Processor A]
        P3B[Processor B]
    end

    QUEUE -.->|claim_pending_jobs| W1
    QUEUE -.->|claim_pending_jobs| W2
    QUEUE -.->|claim_pending_jobs| W3

    W1 --> P1A
    W1 --> P1B

    W2 --> P2A
    W2 --> P2B

    W3 --> P3A
    W3 --> P3B

    P1A -.->|update| QUEUE
    P1B -.->|update| QUEUE
    P2A -.->|update| QUEUE
    P2B -.->|update| QUEUE
    P3A -.->|update| QUEUE
    P3B -.->|update| QUEUE

    style QUEUE fill:#f9f
    style W1 fill:#bbf
    style W2 fill:#bbf
    style W3 fill:#bbf
```

**Key Features:**

- **No coordination needed:** Each worker polls independently
- **Atomic claiming:** Database prevents duplicate processing
- **Automatic load balancing:** Jobs distributed by availability
- **Fault tolerant:** Other workers continue if one crashes

---

## Queue Statistics Query

```mermaid
graph LR
    A[Worker] -->|Every 5 min| B[get_queue_stats RPC]
    B --> C{Group By}

    C --> D[Job Type]
    C --> E[Status]

    D --> F[Count Per Type]
    E --> G[Count Per Status]

    F --> H[Log to Console]
    G --> H

    style A fill:#bbf
    style B fill:#f9f
    style H fill:#9f9
```

**Sample Output:**

```
📊 Queue Statistics:
   generate_daily_brief - pending: 12
   generate_daily_brief - processing: 3
   generate_daily_brief - completed: 1,204
   send_sms - pending: 0
   send_sms - processing: 1
   send_sms - completed: 3,456
```

---

## Related Documentation

- [Web-Worker Architecture](./WEB-WORKER-ARCHITECTURE.md) - Complete architecture overview
- [Deployment Topology](/docs/DEPLOYMENT_TOPOLOGY.md) - System deployment
- [Worker Service Docs](/apps/worker/docs/README.md) - Worker implementation details

---

## Summary

The BuildOS queue system provides:

✅ **Atomic Job Claiming:** No duplicate processing
✅ **Priority-Based Processing:** Critical jobs processed first
✅ **Automatic Retries:** Exponential backoff for transient failures
✅ **Stalled Job Recovery:** Automatic cleanup of stuck jobs
✅ **Horizontal Scalability:** Multiple workers without coordination
✅ **Real-Time Feedback:** Instant notifications to web app
✅ **Type Safety:** Strongly typed job metadata

This architecture ensures reliable, scalable background job processing for the BuildOS platform.
