<!-- docs/DOCUMENTATION_GUIDELINES.md -->

# Documentation Guidelines for LLMs and Contributors

**Last Updated:** October 3, 2025  
**Purpose:** Ensure all documentation is properly organized and not floating around randomly

---

## 🎯 Core Principle

**Every document has a home.** No random architecture docs, design specs, or summaries should be created at the root or in arbitrary locations.

---

## 📁 Where to Put Documentation

### Research Documents → `/thoughts/shared/research/`

**When creating research documents** (analyzing the codebase, investigating features, exploring architecture):

**Location:** `/thoughts/shared/research/YYYY-MM-DD_HH-MM-SS_topic.md`

**Required Format:**

```markdown
---
date: [Current date and time with timezone in ISO format]
researcher: [Researcher name, e.g., 'Claude Code']
git_commit: [Current commit hash]
branch: [Current branch name]
repository: buildos-platform
topic: '[Clear topic description]'
tags: [research, codebase, relevant-component-names]
status: complete
last_updated: [YYYY-MM-DD]
last_updated_by: [Researcher name]
---

# Research: [Topic]

**Date**: [timestamp]
**Researcher**: [name]
**Git Commit**: [hash]

## Research Question

[What you were investigating]

## Summary

[High-level findings]

## Detailed Findings

[Component-by-component breakdown with file:line references]

## Code References

- `path/to/file.ts:123` - Description

## Architecture Insights

[Patterns and design decisions discovered]

## Related Research

[Links to other research docs]
```

**Examples of research topics:**

- "How does the brain dump processing flow work?"
- "Calendar integration webhook system analysis"
- "Notification system architecture investigation"
- "Queue worker job processing patterns"

**Key Rules:**

- ✅ Always use timestamp format: `YYYY-MM-DD_HH-MM-SS_topic.md`
- ✅ Include YAML frontmatter with metadata
- ✅ Reference actual code with file:line citations
- ✅ Link to related research documents
- ❌ Don't create research docs outside `/thoughts/shared/research/`
- ❌ Don't use vague filenames like "analysis.md" or "notes.md"

---

### Architecture Documentation → `/docs/architecture/`

**When documenting system-wide architecture** (affects multiple apps, deployment topology, cross-cutting patterns):

**Location Options:**

- `/docs/architecture/SYSTEM_OVERVIEW.md` - High-level system architecture
- `/docs/architecture/DATA_FLOW.md` - Cross-app data flows
- `/docs/architecture/decisions/ADR-NNN-topic.md` - Architecture Decision Records
- `/docs/architecture/diagrams/` - Architecture diagrams

**When to use:**

- System-level architecture that crosses app boundaries
- Deployment topology and infrastructure decisions
- Cross-cutting architectural patterns
- ADRs affecting multiple apps

**Format for ADRs:**

```markdown
# ADR-NNN: [Title]

**Date:** YYYY-MM-DD
**Status:** [Proposed | Accepted | Deprecated | Superseded]
**Deciders:** [Names]
**Related ADRs:** [Links]

## Context

[What is the issue we're facing?]

## Decision

[What did we decide?]

## Consequences

[What becomes easier/harder with this decision?]

## Alternatives Considered

[What other options did we evaluate?]
```

---

### Web App Documentation → `/apps/web/docs/`

**When documenting web app features, components, or operations:**

**Location by Type:**

| Document Type          | Location                                             | Example                      |
| ---------------------- | ---------------------------------------------------- | ---------------------------- |
| **Feature Spec**       | `/apps/web/docs/features/[feature]/`                 | `brain-dump/feature-spec.md` |
| **Component Design**   | `/apps/web/docs/technical/components/`               | `MODAL_STANDARDS.md`         |
| **API Documentation**  | `/apps/web/docs/technical/api/endpoints/`            | `braindumps.md`              |
| **Architecture**       | `/apps/web/docs/technical/architecture/`             | `brain-dump-flow.md`         |
| **Operations**         | `/apps/web/docs/operations/deployment/`              | `VERCEL_DEPLOYMENT.md`       |
| **Migration Docs**     | `/apps/web/docs/migrations/active/` or `/completed/` | `PHASE_2_STATUS.md`          |
| **Development Guides** | `/apps/web/docs/development/`                        | `TESTING_CHECKLIST.md`       |

**When to use:**

- Web app-specific features (brain dump, calendar, notifications)
- SvelteKit components and patterns
- Vercel deployment and operations
- Web API endpoints
- Active or completed migrations

**Required README files:**

- Every feature folder must have a `README.md` explaining:
    - What the feature does
    - Key files and their purposes
    - Links to related documentation

---

### Worker Documentation → `/apps/worker/docs/`

**When documenting worker features or operations:**

**Location by Type:**

| Document Type    | Location                                    | Example                 |
| ---------------- | ------------------------------------------- | ----------------------- |
| **Feature Spec** | `/apps/worker/docs/features/[feature]/`     | `daily-briefs/spec.md`  |
| **Queue System** | `/apps/worker/docs/features/queue-system/`  | `job-processing.md`     |
| **Scheduler**    | `/apps/worker/docs/features/scheduler/`     | `cron-jobs.md`          |
| **Operations**   | `/apps/worker/docs/operations/deployment/`  | `RAILWAY_DEPLOYMENT.md` |
| **Integrations** | `/apps/worker/docs/integrations/[service]/` | `email/setup.md`        |

**When to use:**

- Worker-specific features (daily briefs, queue jobs, scheduler)
- Railway deployment and operations
- Background job processing
- Worker API endpoints

---

### Package Documentation → `/packages/[package]/docs/`

**When documenting shared packages:**

**Location:**

- `/packages/twilio-service/docs/` - SMS service documentation
- `/packages/shared-types/` - Type system and database schema
- `/packages/shared-utils/` - Shared utility functions
- `/packages/smart-llm/` - LLM service abstraction
- `/packages/supabase-client/` - Database client

**When to use:**

- Package-specific usage guides
- API documentation for shared code
- Implementation details
- Migration guides for package updates

---

### Business & Strategy → `/apps/web/docs/business/`

**When documenting business strategy, marketing, fundraising:**

**Location by Type:**

- `/apps/web/docs/business/strategy/` - Business strategy docs
- `/apps/web/docs/business/war-room/` - War room planning
- `/apps/web/docs/marketing/` - Marketing materials
- `/apps/web/docs/marketing/investors/` - Investor outreach

**When to use:**

- Business strategy documents
- Marketing plans and materials
- Investor outreach and fundraising
- Brand and communications guides

---

## 🚫 What NOT to Do

### ❌ Don't Create These Files

**At Root Level:**

- ❌ `architecture.md` → Use `/docs/architecture/`
- ❌ `design-doc.md` → Use feature-specific docs
- ❌ `implementation-notes.md` → Use feature-specific docs
- ❌ `research.md` → Use `/thoughts/shared/research/YYYY-MM-DD_HH-MM-SS_topic.md`
- ❌ `analysis.md` → Use `/thoughts/shared/research/`
- ❌ `notes.md` → Use appropriate feature folder
- ❌ `summary.md` → Use appropriate feature folder

**Random Locations:**

- ❌ Don't create docs in `/src/` unless they're code-level comments
- ❌ Don't create architectural docs in feature folders (use `/docs/architecture/`)
- ❌ Don't mix web and worker docs in the same folder

**Vague Filenames:**

- ❌ `temp.md`, `notes.md`, `stuff.md`
- ✅ Use descriptive names: `brain-dump-processing-flow.md`

---

## ✅ Decision Tree: Where Does My Document Go?

```
Is it research/investigation of the codebase?
├─ YES → /thoughts/shared/research/YYYY-MM-DD_HH-MM-SS_topic.md
└─ NO
    │
    Is it system-wide architecture (affects multiple apps)?
    ├─ YES → /docs/architecture/
    └─ NO
        │
        Is it web app-specific?
        ├─ YES
        │   ├─ Feature? → /apps/web/docs/features/[feature]/
        │   ├─ Component? → /apps/web/docs/technical/components/
        │   ├─ API? → /apps/web/docs/technical/api/
        │   ├─ Deployment? → /apps/web/docs/operations/
        │   └─ Migration? → /apps/web/docs/migrations/
        └─ NO
            │
            Is it worker-specific?
            ├─ YES
            │   ├─ Feature? → /apps/worker/docs/features/[feature]/
            │   ├─ Queue? → /apps/worker/docs/features/queue-system/
            │   └─ Deployment? → /apps/worker/docs/operations/
            └─ NO
                │
                Is it about a shared package?
                ├─ YES → /packages/[package]/docs/
                └─ NO
                    │
                    Is it business/marketing?
                    └─ YES → /apps/web/docs/business/
```

---

## 📝 Checklist for Creating Documentation

Before creating ANY documentation file, ask:

- [ ] Have I determined the correct location using the decision tree?
- [ ] Is there already a similar document I should update instead?
- [ ] Does the folder have a README.md? (If not, create one first)
- [ ] Am I using a descriptive filename (not "notes.md" or "temp.md")?
- [ ] For research: Am I using the timestamp format `YYYY-MM-DD_HH-MM-SS_topic.md`?
- [ ] For research: Have I included YAML frontmatter with all required fields?
- [ ] Have I linked to related documentation?
- [ ] Have I included code references with file:line citations?

---

## 🔄 When to Update vs. Create New

### Update Existing Documentation When:

- Adding information to an existing topic
- Correcting outdated information
- Expanding on existing features
- Following up on previous research (append to same file with timestamp)

### Create New Documentation When:

- Researching a completely new topic (new research doc)
- Documenting a new feature (new feature folder + README)
- Recording a new architectural decision (new ADR)
- Creating a new implementation guide

**For Research Follow-ups:**

- Don't create a new research file if it's related to existing research
- Instead, append to the existing file with a new section:

    ```markdown
    ## Follow-up Research [YYYY-MM-DD HH:MM:SS]

    [New findings]
    ```

- Update frontmatter:
    ```yaml
    last_updated: YYYY-MM-DD
    last_updated_by: [Your name]
    last_updated_note: 'Added follow-up research for [description]'
    ```

---

## 🎨 Documentation Standards

### File Naming Conventions

**Research Files:**

- Format: `YYYY-MM-DD_HH-MM-SS_descriptive-topic.md`
- Example: `2025-10-03_14-30-00_brain-dump-processing-flow.md`

**Feature Documentation:**

- Format: `descriptive-name.md` or `FEATURE_NAME_SPEC.md`
- Example: `brain-dump-processing-spec.md`, `calendar-sync-architecture.md`

**Architecture Decision Records:**

- Format: `ADR-NNN-short-title.md` (NNN = zero-padded number)
- Example: `ADR-001-supabase-choice.md`, `ADR-002-dual-processing.md`

### Markdown Standards

**Headers:**

- Use sentence case: "Brain dump processing flow" not "Brain Dump Processing Flow"
- One H1 per document (the title)
- Logical hierarchy: H2 → H3 → H4

**Code References:**

- Always include file paths: `` `src/lib/services/brain-dump.ts:45` ``
- Link to specific lines when referencing code
- Use relative paths from repo root

**Links:**

- Use relative links for internal docs: `[Architecture](/docs/architecture/README.md)`
- Use absolute links for external resources
- Always verify links work before committing

---

## 🚀 Quick Reference

### Common Scenarios

| I Need To...                    | Location                                  | Example                                      |
| ------------------------------- | ----------------------------------------- | -------------------------------------------- |
| Research how a feature works    | `/thoughts/shared/research/`              | `2025-10-03_14-00-00_notification-system.md` |
| Document a new web feature      | `/apps/web/docs/features/[feature]/`      | `brain-dump/processing-spec.md`              |
| Record an architecture decision | `/docs/architecture/decisions/`           | `ADR-003-notification-bridge-pattern.md`     |
| Document API endpoints          | `/apps/web/docs/technical/api/endpoints/` | `calendar-api.md`                            |
| Create deployment guide         | `/apps/web/docs/operations/deployment/`   | `vercel-setup.md`                            |
| Document worker job             | `/apps/worker/docs/features/[job]/`       | `daily-briefs/generation-flow.md`            |
| Write package usage guide       | `/packages/[package]/docs/`               | `shared-types/usage-guide.md`                |

---

## 📚 Related Documentation

- [Documentation Reorganization Summary](../DOCUMENTATION_REORGANIZATION_SUMMARY.md)
- [Monorepo Documentation Hub](/docs/README.md)
- [Research Codebase Command](../.claude/commands/research_codebase_generic.md)
- [Web App Documentation](/apps/web/docs/README.md)
- [Worker Documentation](/apps/worker/docs/README.md)

---

**Remember:** When in doubt, ask "Who owns this information?"

- System-wide? → `/docs/`
- Web app? → `/apps/web/docs/`
- Worker? → `/apps/worker/docs/`
- Research? → `/thoughts/shared/research/`
