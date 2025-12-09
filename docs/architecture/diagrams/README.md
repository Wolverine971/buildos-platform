<!-- docs/architecture/diagrams/README.md -->

# Architecture Diagrams

This directory contains visual documentation and flow diagrams for the BuildOS platform architecture.

## Available Diagrams

### [Web-Worker Architecture](./WEB-WORKER-ARCHITECTURE.md) ⭐

**Purpose:** Comprehensive documentation of how the web app and worker service communicate

**Contains:**

- System architecture overview
- Communication patterns (queue-based, real-time, status polling)
- Feature-specific flows (daily briefs, brain dumps, calendar, SMS, phases)
- Database communication layer and RPC functions
- Job lifecycle and state machine
- Error handling and reliability patterns
- Performance and scalability considerations
- Monitoring and observability
- Security considerations
- Deployment considerations

**When to use:** Understanding the overall system architecture, adding new features that span web and worker, debugging cross-service issues

### [Queue System Flow](./QUEUE-SYSTEM-FLOW.md)

**Purpose:** Visual reference for queue-based job processing

**Contains:**

- Job lifecycle diagrams
- Queue job creation flow
- Job claiming (worker poll) sequence
- Job processing flow
- Real-time notification flow
- Retry logic visualization
- Job types and processors mapping
- Stalled job recovery
- Multi-worker horizontal scaling
- Queue statistics

**When to use:** Working with background jobs, adding new job types, debugging job processing issues, understanding worker scaling

## Quick Reference

### Job Types

| Job Type               | Created By               | Processed By      | Purpose                 |
| ---------------------- | ------------------------ | ----------------- | ----------------------- |
| `generate_daily_brief` | Scheduler (Worker)       | Brief Worker      | Generate AI daily brief |
| `generate_brief_email` | Brief Worker             | Email Worker      | Send brief via email    |
| `generate_phases`      | Web API                  | Phases Worker     | Generate project phases |
| `onboarding_analysis`  | Web API                  | Onboarding Worker | Analyze user onboarding |
| `send_sms`             | Web API / Twilio Webhook | SMS Worker        | Send SMS via Twilio     |

### Communication Patterns

- **Web → Worker:** Queue jobs via `add_queue_job()` RPC
- **Worker → Web:** Broadcast notifications via Supabase Realtime
- **Status Tracking:** Database queries for job status

### Key Files Referenced

**Worker:**

- `/apps/worker/src/lib/supabaseQueue.ts` - Queue implementation
- `/apps/worker/src/worker.ts` - Worker startup and processor registration
- `/apps/worker/src/scheduler.ts` - Cron job scheduler
- `/apps/worker/src/workers/*/` - Job processors

**Web:**

- `/apps/web/src/lib/services/` - Service layer
- `/apps/web/src/routes/api/` - API routes
- `/apps/web/src/lib/stores/` - Reactive stores

**Shared:**

- `/packages/shared-types/src/queue-types.ts` - Queue job types
- `/packages/shared-types/src/database.schema.ts` - Database schema

## Related Documentation

- [Deployment Topology](/docs/DEPLOYMENT_TOPOLOGY.md) - How apps deploy
- [Monorepo Guide](/docs/MONOREPO_GUIDE.md) - Working with the monorepo
- [Web App Docs](/apps/web/docs/README.md) - Web application details
- [Worker Docs](/apps/worker/docs/README.md) - Worker service details

## Contributing

When adding new architecture diagrams:

1. **Use Mermaid syntax** for diagrams (renders in GitHub)
2. **Include context** - Explain when and why to use the diagram
3. **Reference code** - Link to actual implementation files
4. **Keep updated** - Update diagrams when architecture changes
5. **Cross-reference** - Link related diagrams and documentation

## Diagram Tools

**Mermaid Documentation:** https://mermaid.js.org/

**Common Diagram Types:**

- `flowchart` - Process flows
- `sequenceDiagram` - Interaction sequences
- `graph` - System architecture
- `stateDiagram` - State machines
- `erDiagram` - Database relationships

**Viewing:**

- GitHub renders Mermaid automatically
- VS Code: Install "Markdown Preview Mermaid Support" extension
- Online: https://mermaid.live/
