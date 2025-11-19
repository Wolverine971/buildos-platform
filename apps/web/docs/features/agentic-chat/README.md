# Agentic Chat System - Complete Documentation

**System**: AI-powered chat with tool execution, planning, and project context awareness
**Location**: `/src/routes/api/agent/stream/+server.ts` (backend), `/src/lib/components/agent/` (frontend)
**Last Updated**: 2025-11-17

---

## 🚀 Quick Start

**New to the agentic chat system?** Start here:

### For Developers

1. **Understand the Architecture** (15 min)
    - Read: [VISUAL_GUIDE.md](./VISUAL_GUIDE.md) - Visual flow diagrams
    - Read: [BACKEND_ARCHITECTURE_OVERVIEW.md](./BACKEND_ARCHITECTURE_OVERVIEW.md)
    - Understand: Orchestrator pattern, tool execution, streaming

2. **Learn the Frontend** (10 min)
    - Read: [FRONTEND_QUICK_REFERENCE.md](./FRONTEND_QUICK_REFERENCE.md)
    - Understand: SSE handling, state management, UI components

3. **Review Recent Improvements** (5 min)
    - Read: [PERFORMANCE.md](./PERFORMANCE.md)
    - Understand: Caching, optimizations, best practices

4. **Explore the Tool System** (10 min)
    - Read: [tool-system/QUICK_REFERENCE.md](./tool-system/QUICK_REFERENCE.md)
    - Understand: 31 tools, categories, usage patterns

### For AI Agents

**If you need to extend or modify the agentic chat system:**

1. **Check the ADR** - Understand architectural decisions
    - Location: `/docs/technical/architecture/decisions/ADR-001-agentic-chat-performance-optimizations.md`
    - Why: Learn WHY things are built this way

2. **Review Performance Guide** - Understand optimizations
    - Location: `./PERFORMANCE.md`
    - Why: Avoid breaking optimizations, maintain performance

3. **Read Implementation Record** - See what was changed recently
    - Location: `/docs/migrations/completed/2025-11-17-agentic-chat-optimizations.md`
    - Why: Understand recent changes, testing approach

4. **Use the Logger Service** - Add structured logging
    - Location: `/docs/technical/services/logger.md`
    - Why: Maintain consistent, production-ready logging

---

## 📚 Documentation Structure

### Architecture & Design

| Document                                                                                                                           | Purpose                                                               | When to Read                                |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| **[VISUAL_GUIDE.md](./VISUAL_GUIDE.md)** ⭐                                                                                        | Visual flow diagrams and architecture overview                        | Quick understanding of system flow          |
| **[EXPLORATION_SUMMARY.md](./EXPLORATION_SUMMARY.md)**                                                                             | High-level exploration summary and key findings                       | Getting started, understanding scope        |
| **[ADR-001: Performance Optimizations](../../technical/architecture/decisions/ADR-001-agentic-chat-performance-optimizations.md)** | Architectural decisions for caching, logging, and code simplification | Before making architectural changes         |
| **[BACKEND_ARCHITECTURE_OVERVIEW.md](./BACKEND_ARCHITECTURE_OVERVIEW.md)**                                                         | Complete backend system architecture                                  | Understanding orchestration, services, flow |
| **[FLEXIBLE_ORCHESTRATION_SPEC.md](./FLEXIBLE_ORCHESTRATION_SPEC.md)**                                                             | Orchestration patterns and strategies                                 | Working on orchestrator or plan execution   |

### Performance & Optimization

| Document                                                                                             | Purpose                                                 | When to Read                                 |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| **[PERFORMANCE.md](./PERFORMANCE.md)** ⭐ **NEW**                                                    | Caching strategies, optimization techniques, monitoring | Debugging performance, understanding caching |
| **[MODEL_OPTIMIZATION_GUIDE.md](./MODEL_OPTIMIZATION_GUIDE.md)**                                     | LLM model selection and cost optimization               | Optimizing AI costs and latency              |
| **[COMPREHENSIVE_OPTIMIZATION_RECOMMENDATIONS.md](./COMPREHENSIVE_OPTIMIZATION_RECOMMENDATIONS.md)** | Full list of optimization opportunities                 | Planning future improvements                 |

### Tool System Documentation

| Document                                                                  | Purpose                                         | When to Read                    |
| ------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------- |
| **[tool-system/INDEX.md](./tool-system/INDEX.md)**                        | Navigation guide for tool system docs           | Finding tool documentation      |
| **[tool-system/QUICK_REFERENCE.md](./tool-system/QUICK_REFERENCE.md)** ⭐ | Quick lookup for all 31 tools                   | Day-to-day tool usage           |
| **[tool-system/SUMMARY.md](./tool-system/SUMMARY.md)**                    | Executive overview and design principles        | Understanding tool architecture |
| **[tool-system/DOCUMENTATION.md](./tool-system/DOCUMENTATION.md)**        | Complete tool system reference (45-60 min read) | Deep dive into tool system      |

### Implementation Guides

| Document                                                                                                       | Purpose                                               | When to Read                                 |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------- |
| **[Migration: 2025-11-17 Optimizations](../../migrations/completed/2025-11-17-agentic-chat-optimizations.md)** | Detailed implementation plan for recent optimizations | Understanding what changed and why           |
| **[AGENT_TOOL_SYSTEM_SPEC.md](./AGENT_TOOL_SYSTEM_SPEC.md)**                                                   | Tool system specification                             | Adding new tools or modifying tool execution |
| **[PROJECT_WORKSPACE_FOCUS_PLAN.md](./PROJECT_WORKSPACE_FOCUS_PLAN.md)**                                       | Project focus and context system                      | Working with ontology integration            |

### Frontend Documentation

| Document                                                         | Purpose                                       | When to Read                                    |
| ---------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| **[FRONTEND_INDEX.md](./FRONTEND_INDEX.md)**                     | Navigation guide for frontend docs            | Finding specific frontend documentation         |
| **[FRONTEND_QUICK_REFERENCE.md](./FRONTEND_QUICK_REFERENCE.md)** | Quick lookup for state vars, events, patterns | Day-to-day frontend development                 |
| **[FRONTEND_EXPLORATION.md](./FRONTEND_EXPLORATION.md)**         | Complete frontend technical deep-dive         | Understanding SSE, state management, components |

### Debugging & Troubleshooting

| Document                                                                 | Purpose                         | When to Read                         |
| ------------------------------------------------------------------------ | ------------------------------- | ------------------------------------ |
| **[BUG_ANALYSIS_INDEX.md](./BUG_ANALYSIS_INDEX.md)**                     | Index of bug analysis documents | Debugging similar issues             |
| **[BUG_ANALYSIS_2025-11-14.md](./BUG_ANALYSIS_2025-11-14.md)**           | Detailed bug analysis and fixes | Learning from past bugs              |
| **[Logger Service Docs](../../technical/services/logger.md)** ⭐ **NEW** | How to use structured logging   | Adding logging, debugging production |

### Enhancements & Specs

| Document                                                                             | Purpose                                  | When to Read                         |
| ------------------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------ |
| **[THINKING_BLOCK_LOG_UI_SPEC.md](./THINKING_BLOCK_LOG_UI_SPEC.md)**                 | ThinkingBlock activity log specification | Working on activity visualization    |
| **[ENHANCED_WRAPPER_INTEGRATION_GUIDE.md](./ENHANCED_WRAPPER_INTEGRATION_GUIDE.md)** | Tool wrapper patterns                    | Creating tool wrappers               |
| **[PROJECT_CREATE_EXECUTION_PLAN.md](./PROJECT_CREATE_EXECUTION_PLAN.md)**           | Project creation flow                    | Understanding project creation tools |

---

## 🎯 By Task - Quick Navigation

### "I want to understand..."

| Task                                | Primary Document                     | Supporting Docs                  |
| ----------------------------------- | ------------------------------------ | -------------------------------- |
| **How the whole system works**      | VISUAL_GUIDE.md ⭐                   | BACKEND_ARCHITECTURE_OVERVIEW.md |
| **Recent performance improvements** | PERFORMANCE.md ⭐                    | ADR-001, Migration record        |
| **Why certain decisions were made** | ADR-001 ⭐                           | Migration record                 |
| **How caching works**               | PERFORMANCE.md (Ontology Caching) ⭐ | ADR-001                          |
| **How to use the logger**           | Logger Service Docs ⭐               | PERFORMANCE.md                   |
| **Frontend SSE handling**           | FRONTEND_QUICK_REFERENCE.md          | FRONTEND_EXPLORATION.md          |
| **Tool execution flow**             | tool-system/QUICK_REFERENCE.md ⭐    | tool-system/DOCUMENTATION.md     |
| **All available tools**             | tool-system/QUICK_REFERENCE.md ⭐    | tool-system/INDEX.md             |

### "I want to build..."

| Task                         | Primary Document                     | Code Location                              |
| ---------------------------- | ------------------------------------ | ------------------------------------------ |
| **A new tool**               | tool-system/DOCUMENTATION.md § 11 ⭐ | `/src/lib/chat/tool-definitions.ts`        |
| **A new SSE event handler**  | FRONTEND_EXPLORATION.md § 3          | `AgentChatModal.svelte` (handleSSEMessage) |
| **Performance optimization** | PERFORMANCE.md ⭐                    | Varies by optimization                     |
| **Logging for new feature**  | Logger Service Docs ⭐               | Import from `/src/lib/utils/logger.ts`     |
| **Project focus feature**    | PROJECT_WORKSPACE_FOCUS_PLAN.md      | `ProjectFocusSelector.svelte`              |
| **Modify existing tool**     | tool-system/QUICK_REFERENCE.md ⭐    | Find tool, check implementation            |

### "I need to debug..."

| Issue                          | Start Here                               | Then Check                            |
| ------------------------------ | ---------------------------------------- | ------------------------------------- |
| **Slow API responses**         | PERFORMANCE.md (Monitoring) ⭐           | Check cache hit rates, DB queries     |
| **Missing logs in production** | Logger Service Docs (Troubleshooting) ⭐ | Verify log levels, structured logging |
| **Cache not working**          | PERFORMANCE.md (Cache Logic) ⭐          | Check cache keys, TTL, focus changes  |
| **SSE stream errors**          | FRONTEND_EXPLORATION.md § 9              | Check AbortController, timeouts       |
| **Tool execution failures**    | BUG_ANALYSIS_INDEX.md                    | AGENT_TOOL_SYSTEM_SPEC.md             |

---

## 🔧 Key Components

### Backend (`/src/routes/api/agent/stream/+server.ts`)

**Main API Endpoint** (900+ lines)

- Handles streaming agent chat requests
- Manages session state and context
- Orchestrates tool execution
- Implements caching and logging ⭐

**Key Sections**:

- Lines 1-100: Imports and type definitions
- Lines 289-450: Last turn context generation (recently simplified ⭐)
- Lines 740-822: Ontology context caching (recently added ⭐)
- Lines 100-900: Request handling, streaming, orchestration

### Frontend (`/src/lib/components/agent/`)

**AgentChatModal.svelte** (1941 lines)

- Main chat interface
- SSE message handling (25+ event types)
- State management with Svelte 5 runes
- Tool execution tracking

**ProjectFocusSelector.svelte** & **ProjectFocusIndicator.svelte**

- Project context selection and display
- Integrates with ontology system

**ThinkingBlock.svelte**

- Activity log visualization
- Real-time tool execution display

### Services (`/src/lib/services/agentic-chat/`)

**agent-chat-orchestrator.ts**

- Main orchestrator for chat flow
- Coordinates tool execution and planning

**tool-execution-service.ts**

- Executes tools and tracks results
- Extracts entities from tool outputs ⭐

**plan-orchestrator.ts**

- Manages complex multi-step plans
- Coordinates executor agents

---

## 🚀 Recent Improvements (2025-11-17)

### ✅ Performance Optimizations

Three major improvements implemented:

1. **Structured Logging Service** ⭐
    - Created centralized logger (`/src/lib/utils/logger.ts`)
    - Replaced 88 console calls in API endpoint
    - Production: Structured JSON logs
    - Development: Colorized console output
    - **See**: [Logger Service Docs](../../technical/services/logger.md)

2. **Ontology Context Caching** ⭐
    - 5-minute TTL cache in session metadata
    - Reduces DB queries by ~70%
    - Saves 200-500ms per cached request
    - Smart cache invalidation on focus change
    - **See**: [PERFORMANCE.md](./PERFORMANCE.md) § Ontology Context Caching

3. **Simplified Last Turn Context** ⭐
    - Removed ~200 lines of redundant code
    - Eliminated 6 complex helper functions
    - Uses pre-extracted entities from ToolExecutionService
    - 60-75% faster execution
    - **See**: [PERFORMANCE.md](./PERFORMANCE.md) § Simplified Context Extraction

**Documentation**:

- ADR: `/docs/technical/architecture/decisions/ADR-001-agentic-chat-performance-optimizations.md`
- Migration: `/docs/migrations/completed/2025-11-17-agentic-chat-optimizations.md`
- Performance: [PERFORMANCE.md](./PERFORMANCE.md)

---

## 📊 System Statistics

### Code Metrics

- **Backend API**: ~900 lines (`/api/agent/stream/+server.ts`)
- **Frontend Modal**: ~1941 lines (`AgentChatModal.svelte`)
- **Recent Reduction**: -200 lines from simplifications ⭐
- **Documentation**: 25+ documents, comprehensive coverage

### Performance Metrics

- **Cache Hit Rate**: 70-90% (multi-turn conversations)
- **Ontology Load Time**:
    - Cached: <10ms ⭐
    - Uncached: 200-500ms
- **Context Extraction**:
    - Before: 20-30ms
    - After: 5-10ms ⭐

### Tool System

- **Total Tools**: 31+ tools across 4 categories
- **Tool Execution**: Tracked with entity extraction
- **Real-time Updates**: SSE with 25+ event types

---

## 🔗 Related Documentation

### Cross-Cutting Documentation

- **Web App Navigation**: `/apps/web/docs/NAVIGATION_INDEX.md`
- **Main Web Docs**: `/apps/web/docs/README.md`
- **Monorepo Guide**: Root `/docs/` directory

### Supporting Systems

- **Ontology System**: `/apps/web/docs/features/ontology/README.md`
- **Modal Components**: `/apps/web/docs/technical/components/modals/README.md`
- **Database Schema**: `/apps/web/docs/technical/database/schema.md`

### AI/LLM Integration

- **Prompt Templates**: `/apps/web/docs/prompts/`
- **Model Selection**: [MODEL_OPTIMIZATION_GUIDE.md](./MODEL_OPTIMIZATION_GUIDE.md)
- **Cost Optimization**: [COMPREHENSIVE_OPTIMIZATION_RECOMMENDATIONS.md](./COMPREHENSIVE_OPTIMIZATION_RECOMMENDATIONS.md)

---

## 🎓 Learning Paths

### Path 1: Quick Overview (30 minutes)

1. README.md (this file) - 5 min
2. VISUAL_GUIDE.md - 10 min ⭐
3. EXPLORATION_SUMMARY.md - 5 min
4. tool-system/QUICK_REFERENCE.md - 5 min
5. PERFORMANCE.md (skim) - 5 min

### Path 2: Full Developer Onboarding (2.5 hours)

1. README.md (this file) - 5 min
2. VISUAL_GUIDE.md - 15 min ⭐
3. BACKEND_ARCHITECTURE_OVERVIEW.md - 30 min
4. tool-system/QUICK_REFERENCE.md - 10 min ⭐
5. FRONTEND_EXPLORATION.md - 45 min
6. PERFORMANCE.md - 20 min
7. ADR-001 - 10 min
8. Source code review - 10 min

### Path 3: Performance Expert (1 hour)

1. PERFORMANCE.md - 30 min ⭐
2. ADR-001 - 15 min ⭐
3. Migration record - 10 min ⭐
4. Source code (caching + context extraction) - 5 min

### Path 4: AI Agent Extension (1 hour)

1. README.md (this file) - 5 min
2. VISUAL_GUIDE.md - 10 min ⭐
3. tool-system/QUICK_REFERENCE.md - 10 min ⭐
4. ADR-001 - 15 min ⭐
5. PERFORMANCE.md - 15 min ⭐
6. Logger Service Docs - 10 min ⭐

---

## 🤝 Contributing

### Before Making Changes

1. **Read relevant ADRs** - Understand architectural decisions
2. **Check performance docs** - Don't break optimizations
3. **Review recent migrations** - Understand recent changes
4. **Use structured logging** - Add logger calls, not console

### Adding New Features

1. **Update ADRs** - Document architectural decisions
2. **Add tests** - Verify no breaking changes
3. **Update docs** - Keep documentation current
4. **Monitor performance** - Track impact on latency/caching

### Debugging Production Issues

1. **Check structured logs** - Use log aggregation tools
2. **Monitor cache hit rates** - Verify caching is working
3. **Track performance metrics** - Look for regressions
4. **Review error patterns** - Use structured error logs

---

## 📞 Getting Help

### For Documentation Questions

- Check this README's "By Task" section
- Use the documentation structure table
- Review the learning paths

### For Implementation Questions

- Start with the relevant documentation
- Review source code with docs as guide
- Check ADRs for architectural context

### For Performance Questions

- Read [PERFORMANCE.md](./PERFORMANCE.md) ⭐
- Check cache hit rates in logs
- Review optimization recommendations

### For Debugging

- Check [Logger Service Docs](../../technical/services/logger.md) ⭐
- Review [BUG_ANALYSIS_INDEX.md](./BUG_ANALYSIS_INDEX.md)
- Enable debug logging in development

---

**Maintained by**: BuildOS Platform Team
**Last Major Update**: 2025-11-17 (Performance Optimizations)
**Status**: ✅ Production-ready with recent optimizations
