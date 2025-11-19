# BuildOS Tool System Documentation Index

## Complete Tool System Documentation

This directory contains comprehensive documentation of the BuildOS agentic chat tool system, generated on 2025-11-17.

### Files Included

1. **TOOL_SYSTEM_SUMMARY.md** (270 lines, 8.5 KB)
    - Executive summary of the entire tool system
    - Key facts, statistics, and overview
    - Best for: Quick understanding of what the tool system is
    - Read time: 5-10 minutes

2. **TOOL_SYSTEM_QUICK_REFERENCE.md** (356 lines, 8.4 KB)
    - Condensed reference guide with tables and lists
    - Tool inventory, context mapping, API endpoints
    - Best for: Quick lookup during development
    - Read time: 3-5 minutes

3. **TOOL_SYSTEM_DOCUMENTATION.md** (899 lines, 27 KB)
    - Complete, in-depth reference documentation
    - 12 detailed sections covering all aspects
    - Best for: Learning the full system in detail
    - Read time: 30-45 minutes

4. **TOOL_SYSTEM_INDEX.md** (this file)
    - Navigation guide and overview of documentation

---

## Quick Navigation by Topic

### Getting Started

1. Start with **TOOL_SYSTEM_SUMMARY.md** for overview
2. Scan **TOOL_SYSTEM_QUICK_REFERENCE.md** for quick facts
3. Dive into **TOOL_SYSTEM_DOCUMENTATION.md** for details

### By Role

#### LLM/AI Agent Using Tools

- Read: TOOL_SYSTEM_QUICK_REFERENCE.md (Tool inventory, Usage patterns)
- Reference: TOOL_SYSTEM_DOCUMENTATION.md (Part 8: Progressive Disclosure)

#### Developer Adding New Tools

- Read: TOOL_SYSTEM_DOCUMENTATION.md (Part 12: Development Patterns)
- Reference: TOOL_SYSTEM_QUICK_REFERENCE.md (Adding a New Tool)

#### Architect Understanding System Design

- Read: TOOL_SYSTEM_DOCUMENTATION.md (All parts)
- Reference: TOOL_SYSTEM_SUMMARY.md (Design Principles)

#### DevOps/Debugging Tool Issues

- Read: TOOL_SYSTEM_DOCUMENTATION.md (Part 3: Tool Execution, Part 4: Execution Service)
- Reference: TOOL_SYSTEM_QUICK_REFERENCE.md (Error Handling)

### By Topic

#### Tool Categories & Inventory

- TOOL_SYSTEM_QUICK_REFERENCE.md - All 31 Tools by Category
- TOOL_SYSTEM_DOCUMENTATION.md - Part 1: Tool Definitions

#### Tool Execution & Runtime

- TOOL_SYSTEM_DOCUMENTATION.md - Part 3: Tool Execution
- TOOL_SYSTEM_DOCUMENTATION.md - Part 4: Execution Service

#### Context-Aware Tool Selection

- TOOL_SYSTEM_QUICK_REFERENCE.md - Tool Selection by Context
- TOOL_SYSTEM_DOCUMENTATION.md - Part 2: Tool Configuration

#### BuildOS Knowledge Tools

- TOOL_SYSTEM_DOCUMENTATION.md - Part 5: BuildOS Knowledge Tools
- TOOL_SYSTEM_QUICK_REFERENCE.md - BuildOS Knowledge Tools

#### Token Management & Progressive Disclosure

- TOOL_SYSTEM_DOCUMENTATION.md - Part 8: Progressive Disclosure Strategy
- TOOL_SYSTEM_QUICK_REFERENCE.md - Usage Pattern: Progressive Disclosure

#### Entity Metadata & State Machines

- TOOL_SYSTEM_QUICK_REFERENCE.md - Entity State Values & Facets
- TOOL_SYSTEM_DOCUMENTATION.md - Part 1.2: Entity Field Information

#### Development & Integration

- TOOL_SYSTEM_DOCUMENTATION.md - Part 12: Development Patterns
- TOOL_SYSTEM_QUICK_REFERENCE.md - Adding a New Tool

---

## Key Statistics

| Metric                  | Value                                        |
| ----------------------- | -------------------------------------------- |
| Total Tools             | 31                                           |
| Search/List Tools       | 8                                            |
| Read/Detail Tools       | 2                                            |
| Write Tools (CRUD)      | 12                                           |
| Utility/Knowledge Tools | 9                                            |
| Entity Types Supported  | 5 (projects, tasks, plans, goals, templates) |
| Conversation Contexts   | 9                                            |
| State Machines          | 3                                            |
| Facet Dimensions        | 3                                            |
| Total Facet Values      | 19                                           |

---

## Core File Locations (Absolute Paths)

### Tool Definitions & Configuration

- Tool Definitions: `/Users/annawayne/buildos-platform/apps/web/src/lib/chat/tool-definitions.ts`
- Tool Config: `/Users/annawayne/buildos-platform/apps/web/src/lib/chat/tools.config.ts`

### Runtime Execution

- Tool Executor: `/Users/annawayne/buildos-platform/apps/web/src/lib/chat/tool-executor.ts`
- Execution Service: `/Users/annawayne/buildos-platform/apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`

### BuildOS Knowledge Tools

- Location: `/Users/annawayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/buildos/`
- Files: overview.ts, usage-guide.ts, references.ts, types.ts, index.ts

### API Endpoints

- Projects: `/Users/annawayne/buildos-platform/apps/web/src/routes/api/onto/projects/`
- Tasks: `/Users/annawayne/buildos-platform/apps/web/src/routes/api/onto/tasks/`
- Plans: `/Users/annawayne/buildos-platform/apps/web/src/routes/api/onto/plans/`
- Goals: `/Users/annawayne/buildos-platform/apps/web/src/routes/api/onto/goals/`

---

## Tool Categories Overview

### Search Tools (8 tools)

Used for discovery and listing. Return abbreviated data to manage tokens.

```
list_onto_projects, search_onto_projects, list_onto_tasks, search_onto_tasks,
list_onto_plans, list_onto_goals, list_onto_templates, get_entity_relationships
```

### Read Tools (2 tools)

Fetch complete detailed information on demand.

```
get_onto_project_details, get_onto_task_details
```

### Write Tools (12 tools)

Create, update, and delete operations.

```
create_onto_project, create_onto_task, create_onto_goal, create_onto_plan,
update_onto_project, update_onto_task,
delete_onto_task, delete_onto_goal, delete_onto_plan,
request_template_creation
```

### Utility/Knowledge Tools (9 tools)

Reference, schema lookup, and documentation.

```
get_field_info, get_buildos_overview, get_buildos_usage_guide
```

---

## Conversation Contexts

The system provides 9 conversation modes with context-specific tool sets:

```
global              → Workspace-wide discovery
project_create      → Creating new projects
project             → Project-focused work
task                → Task-focused work
calendar            → Calendar planning
project_audit       → Project review
project_forecast    → Scenario planning
task_update         → Updating tasks
daily_brief_update  → Brief generation
```

---

## Design Principles

1. **Progressive Disclosure** - Start small, fetch details on demand
2. **Context Awareness** - Different modes get different tools
3. **Clear Semantics** - Tool names indicate their purpose
4. **Safe Operations** - Validation before execution
5. **Observable** - Telemetry and logging
6. **Helpful Errors** - Errors suggest next steps
7. **Flexible Metadata** - Props for custom data
8. **Token Efficiency** - Manage context window smartly

---

## Common Tasks

### Find a Specific Tool

- Use TOOL_SYSTEM_QUICK_REFERENCE.md "All 31 Tools by Category"
- Or search TOOL_SYSTEM_DOCUMENTATION.md for tool name

### Add a New Tool

1. Read: TOOL_SYSTEM_DOCUMENTATION.md Part 12
2. Reference: TOOL_SYSTEM_QUICK_REFERENCE.md "Adding a New Tool"

### Understand Tool Selection for a Context

- Reference: TOOL_SYSTEM_QUICK_REFERENCE.md "Tool Selection by Context"
- Deep dive: TOOL_SYSTEM_DOCUMENTATION.md Part 2

### Debug Tool Execution Issues

1. Check: TOOL_SYSTEM_QUICK_REFERENCE.md "Error Handling"
2. Deep dive: TOOL_SYSTEM_DOCUMENTATION.md Part 3 & 4

### Learn About Progressive Disclosure

- Read: TOOL_SYSTEM_DOCUMENTATION.md Part 8
- Example: TOOL_SYSTEM_QUICK_REFERENCE.md "Usage Pattern"

### Get Entity Schema Information

- TOOL_SYSTEM_DOCUMENTATION.md Part 1.2: Entity Field Information
- TOOL_SYSTEM_QUICK_REFERENCE.md: Entity State Values & Facets

---

## Related Repository Documentation

- **Tool System Spec:** `/apps/web/docs/features/agentic-chat/AGENT_TOOL_SYSTEM_SPEC.md`
    - Architectural decisions and requirements

- **Ontology System:** `/apps/web/docs/features/ontology/README.md`
    - Entity definitions and relationships

- **Chat Architecture:** `/apps/web/docs/features/agentic-chat/ARCHITECTURE_IMPROVEMENTS_2025-11-14.md`
    - System architecture and design

- **Web App Guide:** `/apps/web/CLAUDE.md`
    - Development patterns and conventions

---

## Document Statistics

| Document                       | Lines     | Size        | Sections            |
| ------------------------------ | --------- | ----------- | ------------------- |
| TOOL_SYSTEM_SUMMARY.md         | 270       | 8.5 KB      | High-level overview |
| TOOL_SYSTEM_QUICK_REFERENCE.md | 356       | 8.4 KB      | Quick lookup tables |
| TOOL_SYSTEM_DOCUMENTATION.md   | 899       | 27 KB       | 12 detailed parts   |
| **Total**                      | **1,525** | **43.9 KB** | Complete coverage   |

---

## How to Use This Documentation

### First Time Readers

1. Start with TOOL_SYSTEM_SUMMARY.md (5-10 min read)
2. Scan TOOL_SYSTEM_QUICK_REFERENCE.md (3-5 min)
3. Bookmark for later reference

### Developers

1. Read TOOL_SYSTEM_QUICK_REFERENCE.md for overview
2. Reference TOOL_SYSTEM_DOCUMENTATION.md as needed
3. Use Part 12 for new tool development

### Architects/Designers

1. Read all three documents in order
2. Focus on design principles and patterns
3. Reference for future decisions

### Quick Lookup During Coding

- Use TOOL_SYSTEM_QUICK_REFERENCE.md exclusively
- Bookmark key sections (Tool inventory, Contexts, API endpoints)

---

## Key Takeaways

1. **31 tools** organized into 4 categories for different purposes
2. **Context-aware selection** ensures only relevant tools available
3. **Progressive disclosure** pattern manages token budget
4. **BuildOS knowledge tools** provide platform documentation
5. **Clear execution flow** with validation, error handling, telemetry
6. **Flexible metadata** system (props, facets) for customization
7. **Easy to extend** with clear development patterns
8. **Well-documented** with comprehensive reference guides

---

## Questions & Issues

For questions about the tool system:

1. Check TOOL_SYSTEM_QUICK_REFERENCE.md first
2. Read relevant section in TOOL_SYSTEM_DOCUMENTATION.md
3. Review AGENT_TOOL_SYSTEM_SPEC.md in repository
4. Check related documentation links above

---

**Generated:** 2025-11-17
**Status:** Complete Documentation
**Coverage:** 31 tools, 9 contexts, 4 categories, full system overview
