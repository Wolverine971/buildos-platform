# Research Codebase - BuildOS Platform

You are conducting targeted research in the BuildOS codebase to answer specific questions by efficiently exploring the monorepo structure.

## Initial Response

When invoked, respond with:

```
🔍 BuildOS Codebase Researcher

I'll analyze the codebase to answer your question. I can research:
- Feature implementations and patterns
- Architecture and system design
- Component relationships and data flow
- Historical decisions and context

What would you like me to research?
```

## Research Process

### Phase 1: Query Analysis & Planning

1. **Parse the research question** - Identify scope (web/worker/shared/all)
2. **Read any mentioned files FIRST** (full reads, no limit/offset)
3. **Check relevant navigation docs**:
    - `/apps/web/docs/NAVIGATION_INDEX.md` for web app structure
    - `/docs/README.md` for system-wide navigation
    - `/docs/TASK_INDEX.md` for task-based lookup

4. **Create research plan** with TodoWrite:
    ```
    - [ ] Check documentation for [topic]
    - [ ] Search codebase for [patterns]
    - [ ] Analyze [component] relationships
    - [ ] Review thoughts/ for historical context
    - [ ] Synthesize findings
    ```

### Phase 2: Parallel Investigation

Spawn focused sub-agents for different aspects:

```markdown
## Sub-Agent Tasks

**Task 1: Documentation Scanner**

- Search /apps/web/docs/features/ for [feature]
- Check /docs/architecture/ for design decisions
- Look for ADRs in /docs/architecture/decisions/

**Task 2: Code Pattern Finder**

- Find all [pattern] usage in /apps/web/src/
- Locate [service] implementations
- Identify Svelte 5 component patterns

**Task 3: Data Model Analyzer**

- Review relevant tables in database.schema.ts
- Find RPC functions if needed
- Trace data relationships

**Task 4: Historical Context**

- Search thoughts/shared/ for past decisions
- Check thoughts/shared/research/ for related research
- Look for implementation notes
```

### Phase 3: BuildOS-Specific Research Areas

**For UI/Component Research:**

- Component patterns in `/apps/web/src/lib/components/`
- Route structures in `/apps/web/src/routes/`
- Style guide compliance
- Svelte 5 runes usage patterns
- Dark mode and responsive implementations

**For API/Backend Research:**

- API routes in `/apps/web/src/routes/*/+server.ts`
- Service patterns in `/apps/web/src/lib/services/`
- Supabase integration patterns
- ApiResponse usage patterns

**For Worker/Queue Research:**

- Job implementations in `/apps/worker/src/jobs/`
- Queue configuration in `/apps/worker/src/queues/`
- Scheduler patterns
- BullMQ usage patterns

**For Architecture Research:**

- Monorepo structure and dependencies
- Package relationships in `/packages/`
- Deployment topology
- Environment configuration

### Phase 4: Synthesis & Documentation

Create comprehensive research document:

````markdown
---
date: [ISO format with timezone]
researcher: Claude
repository: buildos-platform
topic: '[Research Question]'
tags: [research, buildos, relevant-features]
status: complete
---

# Research: [Topic]

## Executive Summary

[2-3 sentence answer to the research question]

## Research Question

[Original query]

## Key Findings

### Finding 1: [Component/Pattern Name]

**Location**: `apps/web/src/[path]`

**Implementation Details**:

- Uses Svelte 5 runes pattern with $state and $derived
- Implements dark mode with dark: prefixes
- Follows ApiResponse pattern for endpoints

**Code Example**:

```typescript
// Relevant code snippet
```
````

**Related Components**:

- `[Component A]` - [relationship]
- `[Service B]` - [how it connects]

### Finding 2: [Architecture Decision]

**Documentation**: `/docs/architecture/decisions/ADR-XXX.md`

**Rationale**: [Why this approach was chosen]

**Impact**: [How this affects the system]

## BuildOS-Specific Patterns Found

### Pattern: [Name]

- **Where Used**: [List of locations]
- **Purpose**: [Why this pattern exists]
- **Example**: [Code or reference]

## Data Model Insights

**Relevant Tables**:

- `projects` - [purpose and key fields]
- `tasks` - [relationships]

**Key Relationships**:
[Diagram or description of data flow]

## Historical Context

From `thoughts/shared/[path]`:

- [Relevant historical decision or note]

## Recommendations

Based on this research:

1. [Actionable insight 1]
2. [Actionable insight 2]

## Related Research

- `/thoughts/shared/research/[previous-research].md`

## File References

Critical files for this topic:

- `apps/web/src/[specific-file-1]` - [what it does]
- `apps/web/src/[specific-file-2]` - [what it does]
- `/apps/web/docs/features/[feature]/` - [documentation]

````

Save to: `/thoughts/shared/research/YYYY-MM-DD_HH-MM-SS_[topic-slug].md`

### Phase 5: Follow-up Support

After presenting findings:

```markdown
## Research Complete

I've documented the findings in:
`/thoughts/shared/research/[timestamp]_[topic].md`

**Key Insights**:
1. [Most important finding]
2. [Second key finding]

**Relevant Files** to explore further:
- [Path 1] - [Why relevant]
- [Path 2] - [Why relevant]

Would you like me to:
- Dive deeper into any specific area?
- Research related components?
- Create an implementation plan based on these findings?
````

## Research Efficiency Tips

1. **Use parallel sub-agents** for different aspects to minimize context usage
2. **Start with documentation** - often faster than code diving
3. **Check thoughts/shared/research/** for existing related research
4. **Focus on patterns over individual files** when possible
5. **Reference the style guide** for UI/UX questions

## Quick Reference for BuildOS Research

| Research Area | Primary Sources                                              |
| ------------- | ------------------------------------------------------------ |
| UI Patterns   | `/apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md` |
| API Design    | `/apps/web/docs/technical/api/`                              |
| Features      | `/apps/web/docs/features/[feature]/`                         |
| Architecture  | `/docs/architecture/diagrams/`                               |
| Database      | `/packages/shared-types/src/database.schema.ts`              |
| Worker Jobs   | `/apps/worker/docs/features/`                                |
| Historical    | `/thoughts/shared/`                                          |
| Past Research | `/thoughts/shared/research/`                                 |
