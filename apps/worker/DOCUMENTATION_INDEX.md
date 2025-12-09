<!-- apps/worker/DOCUMENTATION_INDEX.md -->

# Worker App Documentation Index

Welcome! Here's how to navigate the BuildOS Worker documentation.

## Start Here

### New to the Worker?

Start with **QUICK_REFERENCE.md** - 8 minute read covering:

- Overview & key files
- Main job types & entry points
- Critical environment variables
- Most important API endpoints
- Common development tasks

### Need the Full Picture?

Read **WORKER_STRUCTURE_OVERVIEW.md** - Comprehensive guide including:

- Complete directory structure
- All services & utilities
- Queue configuration details
- Database schema & RPCs
- Architecture patterns
- Testing & deployment

### Working with Jobs & APIs?

Consult **WORKER_JOBS_AND_FLOWS.md** - Detailed reference with:

- 6 data flow diagrams
- Complete API endpoint documentation
- Job metadata examples
- Status state machine
- Error handling & retry logic

### Development & Architecture?

See **CLAUDE.md** - Original development guide with:

- Project overview
- Essential commands
- Architecture explanation
- Environment configuration
- Common development tasks

---

## The 3 Documentation Files (By Size & Scope)

### 1. QUICK_REFERENCE.md (8.8 KB) - Start Here

**Best for:** Getting oriented, finding common commands, quick lookups

**Contains:**

- Overview (port, language, queue type)
- Key files matrix
- Critical environment variables (Supabase, LLM, Email)
- Cron schedules (3 automated jobs)
- API endpoints summary
- Development commands
- Production deployment checklist
- Monitoring & debugging commands
- Common issues & solutions
- LLM fallback chain
- Email transport options

**Read if you need to:** Get started quickly, find a command, understand the basics

---

### 2. WORKER_STRUCTURE_OVERVIEW.md (21 KB) - Deep Dive

**Best for:** Understanding the complete system architecture

**Contains:**

- Comprehensive directory structure (all ~40 files)
- 3 entry points (API server, worker processor, scheduler)
- 7 job types with processor files & data flows
- Core services:
    - Queue (Supabase RPC-based)
    - LLM (DeepSeek primary + fallback chain)
    - Email (webhook + SMTP dual transport)
    - Notifications (push, email, in-app, SMS)
    - Progress tracking (real-time Supabase Realtime)
    - Engagement backoff (email fatigue prevention)
- Queue configuration (all options documented)
- Database: 12+ tables, 6 RPCs, atomic operations
- Utilities & helpers (7 major utilities)
- Architecture patterns (7 key patterns explained)
- Testing (Vitest, test files listed)
- Deployment (Railway, Nixpacks, health checks)
- Performance metrics
- Summary table (15+ components)

**Read if you need to:** Understand the full system, find where a feature is, understand architecture

---

### 3. WORKER_JOBS_AND_FLOWS.md (19 KB) - Detailed Reference

**Best for:** Working with jobs, integrating APIs, understanding data flows

**Contains:**

- Job type matrix (quick lookup table)
- 6 detailed data flow diagrams:
    1. Daily brief generation (scheduler + API)
    2. Email brief delivery (Phase 2)
    3. SMS event reminders (cron-triggered)
    4. Multi-channel notifications
    5. Project phases generation
    6. Onboarding analysis
- Full API endpoints reference (11 endpoint groups):
    - Brief management (3 endpoints)
    - Project management (1 endpoint)
    - Onboarding (1 endpoint)
    - Queue management (4 endpoints)
    - Email tracking (2 endpoints)
    - SMS management (2 endpoints)
- Job metadata examples (4 types)
- Job status state machine
- Error handling & retry logic (exponential backoff formula)

**Read if you need to:** Understand a data flow, implement an API integration, debug a job, understand error handling

---

## How to Use This Documentation

### I want to...

#### Get Started with the Worker

1. Read **QUICK_REFERENCE.md** (section "Overview")
2. Run the commands in "Development Commands"
3. Check "Critical Environment Variables"

#### Understand the Architecture

1. Start with **QUICK_REFERENCE.md** (section "Overview")
2. Read **WORKER_STRUCTURE_OVERVIEW.md** (sections "Entry Points" & "Core Services")
3. Review **WORKER_JOBS_AND_FLOWS.md** (section "Detailed Data Flows")

#### Queue a New Brief

1. Check **QUICK_REFERENCE.md** (section "API Endpoints")
2. See **WORKER_JOBS_AND_FLOWS.md** (section "Queue Brief" with full request/response)
3. Review cron behavior in "Daily Brief Generation Flow"

#### Add a New Job Type

1. Review **WORKER_STRUCTURE_OVERVIEW.md** (section "Job Types & Workers")
2. Look at existing processor in `workers/brief/briefWorker.ts` as template
3. Follow pattern shown in **WORKER_JOBS_AND_FLOWS.md** data flow diagrams

#### Debug a Stalled Job

1. Check **QUICK_REFERENCE.md** (section "Monitoring & Debugging")
2. Run queries from "Database Queries" section
3. Use `POST /queue/cleanup` endpoint (documented in WORKER_JOBS_AND_FLOWS.md)

#### Configure Queue Performance

1. Open **QUICK_REFERENCE.md** (section "Queue Configuration")
2. See **WORKER_STRUCTURE_OVERVIEW.md** (section "Queue Configuration")
3. Check `src/config/queueConfig.ts` for validation constraints

#### Understand Brief Generation

1. Read **QUICK_REFERENCE.md** (section "Data Flow: Brief Generation")
2. See full flow in **WORKER_JOBS_AND_FLOWS.md** (section "Daily Brief Generation Flow")
3. Check processor file: `workers/brief/briefWorker.ts`

#### Deploy to Production

1. Check **QUICK_REFERENCE.md** (section "Production Deployment")
2. See **WORKER_STRUCTURE_OVERVIEW.md** (section "Deployment")
3. Review environment variables in both docs

#### Integrate with the API

1. Use **QUICK_REFERENCE.md** (section "API Endpoints")
2. Get full details from **WORKER_JOBS_AND_FLOWS.md** (section "API Endpoints Reference")
3. See metadata examples in same file

#### Understand Email Delivery

1. Check **QUICK_REFERENCE.md** (section "Email Transport")
2. See full flow in **WORKER_JOBS_AND_FLOWS.md** (section "Email Brief Delivery Flow")
3. Review `lib/services/email-service.ts` for implementation

#### Learn About SMS

1. See quick overview in **QUICK_REFERENCE.md** (section "API Endpoints")
2. Review full SMS flow in **WORKER_JOBS_AND_FLOWS.md** (section "SMS Event Reminder Flow")
3. Check individual SMS sending section for Twilio details

#### Work with Notifications

1. Check **WORKER_STRUCTURE_OVERVIEW.md** (section on Notification Service)
2. See full flow in **WORKER_JOBS_AND_FLOWS.md** (section "Multi-Channel Notifications")
3. Review `workers/notification/notificationWorker.ts`

#### Understand LLM Integration

1. See overview in **QUICK_REFERENCE.md** (section "LLM Service")
2. Review detailed section in **WORKER_STRUCTURE_OVERVIEW.md** (section "LLM Service")
3. Check implementation: `lib/services/smart-llm-service.ts`

---

## File Cross-References

### QUICK_REFERENCE.md References

- **For full details on:** See WORKER_STRUCTURE_OVERVIEW.md or WORKER_JOBS_AND_FLOWS.md
- **Related files:** CLAUDE.md (development patterns), docs/ (feature docs)

### WORKER_STRUCTURE_OVERVIEW.md References

- **For data flows:** See WORKER_JOBS_AND_FLOWS.md
- **For quick facts:** See QUICK_REFERENCE.md
- **For API details:** See WORKER_JOBS_AND_FLOWS.md
- **For development:** See CLAUDE.md

### WORKER_JOBS_AND_FLOWS.md References

- **For architecture:** See WORKER_STRUCTURE_OVERVIEW.md
- **For quick summary:** See QUICK_REFERENCE.md
- **For setup:** See CLAUDE.md
- **For features:** See docs/ folder

---

## Key Topics at a Glance

### Queue System

- **Quick intro:** QUICK_REFERENCE.md → "Queue Configuration"
- **Detailed:** WORKER_STRUCTURE_OVERVIEW.md → "Queue Service"
- **Configuration:** QUICK_REFERENCE.md → "Queue Configuration"
- **Cleanup:** QUICK_REFERENCE.md → "Monitoring & Debugging"

### Job Processing

- **Overview:** QUICK_REFERENCE.md → "Job Types"
- **Details:** WORKER_STRUCTURE_OVERVIEW.md → "Job Types & Workers"
- **Matrix:** WORKER_JOBS_AND_FLOWS.md → "Job Type Matrix"
- **Flows:** WORKER_JOBS_AND_FLOWS.md → "Detailed Data Flows" (6 examples)

### API Integration

- **Endpoints:** QUICK_REFERENCE.md → "API Endpoints"
- **Full reference:** WORKER_JOBS_AND_FLOWS.md → "API Endpoints Reference"
- **Examples:** WORKER_JOBS_AND_FLOWS.md → "Database Job Metadata Examples"

### Cron Scheduling

- **Schedules:** QUICK_REFERENCE.md → "Critical Cron Schedules"
- **Implementation:** WORKER_STRUCTURE_OVERVIEW.md → "Scheduler"
- **Flows:** WORKER_JOBS_AND_FLOWS.md → "PHASE: Scheduler Trigger" sections

### Email Delivery

- **Types:** QUICK_REFERENCE.md → "Email Transport"
- **Architecture:** WORKER_STRUCTURE_OVERVIEW.md → "Email Service"
- **Flow:** WORKER_JOBS_AND_FLOWS.md → "Email Brief Delivery Flow"

### SMS & Notifications

- **SMS Overview:** QUICK_REFERENCE.md → "API Endpoints"
- **SMS Flow:** WORKER_JOBS_AND_FLOWS.md → "SMS Event Reminder Flow"
- **Notifications:** WORKER_JOBS_AND_FLOWS.md → "Multi-Channel Notifications"

### Environment & Configuration

- **Required vars:** QUICK_REFERENCE.md → "Critical Environment Variables"
- **Full list:** WORKER_STRUCTURE_OVERVIEW.md → "Environment Variables (Required)"
- **Configuration:** QUICK_REFERENCE.md → "Queue Configuration"

### Deployment & Operations

- **Quick start:** QUICK_REFERENCE.md → "Production Deployment"
- **Details:** WORKER_STRUCTURE_OVERVIEW.md → "Deployment"
- **Monitoring:** QUICK_REFERENCE.md → "Monitoring & Debugging"
- **Troubleshooting:** QUICK_REFERENCE.md → "Common Issues & Solutions"

### Error Handling

- **Retry logic:** WORKER_JOBS_AND_FLOWS.md → "Error Handling & Retry Logic"
- **State machine:** WORKER_JOBS_AND_FLOWS.md → "Job Status State Machine"

---

## Documentation Statistics

| Document                     | Size      | Content               | Read Time     |
| ---------------------------- | --------- | --------------------- | ------------- |
| QUICK_REFERENCE.md           | 8.8 KB    | Overview + key facts  | 8-10 min      |
| WORKER_STRUCTURE_OVERVIEW.md | 21 KB     | Complete architecture | 30-40 min     |
| WORKER_JOBS_AND_FLOWS.md     | 19 KB     | Data flows + APIs     | 25-35 min     |
| **Total**                    | **49 KB** | **Full reference**    | **65-85 min** |

---

## Related Documentation

### In This Repository

- **CLAUDE.md** - Original development guide with commands & patterns
- **docs/README.md** - Monorepo navigation hub
- **docs/DEPLOYMENT_TOPOLOGY.md** - System-wide deployment architecture
- **docs/architecture/diagrams/** - Architecture diagrams

### Web App Integration

- **apps/web/docs/** - Web app documentation
- **apps/web/docs/features/onboarding/** - Onboarding feature docs
- **apps/web/docs/features/brain-dump/** - Brain dump system docs

### Database

- Supabase console → SQL Editor (for live schema)
- Migration files in `/migrations`

---

## Tips for Maximum Effectiveness

1. **Start small:** Begin with QUICK_REFERENCE.md, then expand
2. **Use search:** All docs are plain text - use Ctrl+F to find topics
3. **Cross-reference:** Links between docs point you to more details
4. **Code examples:** Always check source files referenced in docs
5. **Keep nearby:** These three files cover 99% of questions about the worker

---

## How to Update This Documentation

When code changes:

1. Update QUICK_REFERENCE.md for critical changes
2. Update WORKER_STRUCTURE_OVERVIEW.md for architecture changes
3. Update WORKER_JOBS_AND_FLOWS.md for API or flow changes
4. Keep all three documents in sync

**Maintenance checklist:**

- [ ] New job type? Add to all three docs (matrix, architecture, flows)
- [ ] New API endpoint? Add to QUICK_REFERENCE.md and WORKER_JOBS_AND_FLOWS.md
- [ ] Configuration change? Update QUICK_REFERENCE.md and WORKER_STRUCTURE_OVERVIEW.md
- [ ] Service change? Update WORKER_STRUCTURE_OVERVIEW.md
- [ ] Data flow change? Update WORKER_JOBS_AND_FLOWS.md

---

## Questions?

If you can't find an answer:

1. Check QUICK_REFERENCE.md first (fastest)
2. Search WORKER_STRUCTURE_OVERVIEW.md for architecture
3. Search WORKER_JOBS_AND_FLOWS.md for flows/APIs
4. Review CLAUDE.md for development patterns
5. Check source code files referenced in the docs

**Document updated:** October 22, 2024
**Worker version:** Node.js 18+, TypeScript ~14.6K LOC
**Total system size:** Supabase queue, 7 job types, 11+ services, 3 schedulers
