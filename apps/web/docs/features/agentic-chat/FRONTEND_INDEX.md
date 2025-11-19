# Agentic Chat Frontend - Documentation Index

## Navigation Guide

This index helps you quickly find the right documentation for your needs.

### Getting Started (Start Here)

**New to the agentic chat system?**

1. Read **[EXPLORATION_SUMMARY.md](./EXPLORATION_SUMMARY.md)** (11 KB, 5 min read)
    - High-level overview of components, streaming, and project focus
    - Key findings and architecture summary
    - Best for: Understanding what the system does and how it works

2. Then read **FRONTEND_QUICK_REFERENCE.md** (11 KB, quick lookup)
    - State variables cheat sheet
    - Event handling map
    - Common patterns and keyboard shortcuts
    - Best for: Day-to-day development reference

### For Implementation Details

**Working on a specific component or feature?**

Read **FRONTEND_EXPLORATION.md** (33 KB, detailed reference)

- Complete technical deep-dive with code examples
- State management with Svelte 5 runes
- SSE message handling (25+ event types)
- Component lifecycle and interactions
- Tool execution tracking
- Auto-scroll behavior
- Voice input integration
- Error handling strategies
- Accessibility features
- User interaction flows

### By Task

#### I want to...

**Add a new SSE event type**

1. Read Section 3 of FRONTEND_EXPLORATION.md "SSE Message Processing"
2. Look at existing event handlers for patterns (e.g., plan_created)
3. Add case to `handleSSEMessage()` switch statement
4. Update ActivityType in ThinkingBlock if needed
5. Check FRONTEND_QUICK_REFERENCE.md "Common Patterns" section

**Modify project focus feature**

1. Read Section 4 of FRONTEND_EXPLORATION.md "Project Focus Feature"
2. Check FRONTEND_QUICK_REFERENCE.md "ProjectFocus Types" section
3. Modify ProjectFocusIndicator and/or ProjectFocusSelector components
4. Update type definitions in agent-chat-enhancement.ts

**Fix message scrolling behavior**

1. Read Section 7 of FRONTEND_EXPLORATION.md "Message Scrolling & Auto-scroll"
2. Check scroll position detection threshold (100px)
3. Verify userHasScrolled flag logic
4. Test with various message lengths and user interactions

**Improve error handling**

1. Read Section 9 of FRONTEND_EXPLORATION.md "Error Handling & Resilience"
2. Review AbortController cleanup patterns
3. Check timeout implementation (4 minutes, inactivity-based)
4. Look at graceful degradation examples

**Integrate new tool type**

1. Read Section 6 of FRONTEND_EXPLORATION.md "Tool Message Formatting"
2. Add formatter to TOOL_DISPLAY_FORMATTERS in AgentChatModal.svelte
3. Test message display for pending/completed/failed states
4. Verify tool icon display if using activity log

**Work on voice input**

1. Read Section 8 of FRONTEND_EXPLORATION.md "Voice Input Integration"
2. Check TextareaWithVoice component bindings
3. Verify recording state management
4. Test voice blocking during streaming

**Improve accessibility**

1. Read Section 10 of FRONTEND_EXPLORATION.md "Accessibility & UX Features"
2. Check ARIA labels in components
3. Verify keyboard navigation
4. Test with screen reader

## Documentation Structure

```
/apps/web/docs/features/agentic-chat/

├── FRONTEND_INDEX.md (THIS FILE)
│   └── Navigation guide for frontend docs
│
├── FRONTEND_EXPLORATION.md
│   └── 33 KB, comprehensive technical reference
│       ├── Main Chat Modal Component (Section 1)
│       ├── SSE Stream Initiation (Section 2)
│       ├── SSE Message Processing (Section 3)
│       ├── Project Focus Feature (Section 4)
│       ├── ThinkingBlock Component (Section 5)
│       ├── Tool Message Formatting (Section 6)
│       ├── Message Scrolling (Section 7)
│       ├── Voice Input Integration (Section 8)
│       ├── Error Handling (Section 9)
│       ├── Accessibility (Section 10)
│       ├── User Interaction Flow (Section 11)
│       ├── API Types & Contracts (Section 12)
│       ├── Component Files Reference (Section 13)
│       ├── State Management Summary (Section 14)
│       └── Performance & Optimization (Section 15)
│
├── FRONTEND_QUICK_REFERENCE.md
│   └── 11 KB, quick lookup tables and cheat sheets
│       ├── File Locations
│       ├── State Variables Cheat Sheet
│       ├── Event Handling Map
│       ├── Function Quick Reference
│       ├── Key Derived Values
│       ├── Tool Formatting
│       ├── Activity Types & Icons
│       ├── ProjectFocus Types
│       ├── Common Patterns
│       ├── Configuration Constants
│       ├── Keyboard Shortcuts
│       └── CSS Classes
│
└── [OTHER DOCS - Architecture, Backend, Planning, etc.]
```

## File Reference

### Core Components

| File                             | Lines | Purpose                             | Key Sections         |
| -------------------------------- | ----- | ----------------------------------- | -------------------- |
| **AgentChatModal.svelte**        | 1941  | Main chat UI, streaming, state mgmt | Sections 1, 2, 3, 14 |
| **ThinkingBlock.svelte**         | 299   | Activity log visualization          | Section 5            |
| **ProjectFocusIndicator.svelte** | 94    | Focus display                       | Section 4            |
| **ProjectFocusSelector.svelte**  | 299   | Entity selection modal              | Section 4            |

### Utilities & Helpers

| File                            | Lines | Purpose                            | Key Sections      |
| ------------------------------- | ----- | ---------------------------------- | ----------------- |
| **sse-processor.ts**            | 290   | Stream parsing, buffering, timeout | Sections 2, 3, 9  |
| **api/agent/stream/+server.ts** | 500+  | Backend SSE handler                | Sections 2, 3, 12 |

### Type Definitions

| File                          | Purpose            | Key Types                                      |
| ----------------------------- | ------------------ | ---------------------------------------------- |
| **agent.types.ts**            | Agent system types | AgentSSEMessage, ProjectFocus, LastTurnContext |
| **agent-chat-enhancement.ts** | Ontology types     | OntologyContext, EnhancedAgentStreamRequest    |

## Key Concepts

### SSE Event Types (25+ types)

Grouped by category in FRONTEND_QUICK_REFERENCE.md:

- **Session**: session, last_turn_context
- **Agent State**: agent_state, focus_active, focus_changed
- **Planning**: plan_created, plan_ready_for_review, plan_review
- **Execution**: step_start, step_complete, executor_spawned, executor_result
- **Tools**: tool_call, tool_result
- **Context**: context_shift, ontology_loaded
- **Clarification**: clarifying_questions
- **Templates**: template_creation_request, template_creation_status, template_created, template_creation_failed
- **Completion**: text, done, error

See **FRONTEND_EXPLORATION.md Section 3** for detailed handlers for each type.

### State Management (40+ variables)

All documented in **FRONTEND_QUICK_REFERENCE.md "State Variables Cheat Sheet"**

Categories:

- Context & Conversation
- Streaming & Agent State
- Project Focus
- Ontology Integration
- Voice Input

### Component Hierarchy

```
AgentChatModal
├── ContextSelectionScreen (conditional)
├── Modal (wrapper)
│   ├── MessageContainer
│   │   └── ThinkingBlock (for each thinking block)
│   │       └── ActivityEntry[] (activity log)
│   ├── ProjectFocusIndicator (conditional)
│   ├── ProjectFocusSelector (modal)
│   │   ├── Type filter pills
│   │   ├── Search input
│   │   └── Entity list
│   └── TextareaWithVoice
│       ├── Voice recorder
│       └── Send button
└── Modal (project focus selector)
```

### Message Flow

Complete flow documented in **FRONTEND_EXPLORATION.md Section 11**

```
User Input
  → sendMessage()
  → POST /api/agent/stream
  → SSEProcessor.processStream()
  → handleSSEMessage() for each event
  → UI updates via Svelte reactivity
  → User sees streaming response + activities
```

## Quick Lookup

### How to...

**Find state variable documentation**
→ FRONTEND_QUICK_REFERENCE.md "State Variables Cheat Sheet"

**Understand event handlers**
→ FRONTEND_QUICK_REFERENCE.md "Event Handling Map"
→ FRONTEND_EXPLORATION.md Section 3 for detailed handlers

**See component architecture**
→ FRONTEND_EXPLORATION.md Section 1

**Find code examples**
→ FRONTEND_EXPLORATION.md Section 6 (tool formatting)
→ FRONTEND_QUICK_REFERENCE.md "Common Patterns"

**Understand project focus**
→ FRONTEND_EXPLORATION.md Section 4

**Check accessibility**
→ FRONTEND_EXPLORATION.md Section 10

**Learn about types & contracts**
→ FRONTEND_EXPLORATION.md Section 12

## Development Checklist

When working on agentic chat features:

**Before starting**

- [ ] Read relevant sections of FRONTEND_EXPLORATION.md
- [ ] Check FRONTEND_QUICK_REFERENCE.md for patterns
- [ ] Understand state management implications

**During development**

- [ ] Keep immutable Svelte 5 patterns (use .map() for array updates)
- [ ] Use $derived for computed values
- [ ] Use $effect for side effects
- [ ] Test SSE event handling
- [ ] Verify scroll behavior
- [ ] Check dark mode

**Before committing**

- [ ] Test multiple SSE event types
- [ ] Verify error messages
- [ ] Test stream abort
- [ ] Check accessibility (ARIA, keyboard)
- [ ] Run pnpm typecheck
- [ ] Run pnpm test

## Related Documentation

### Other Agentic Chat Docs

- ARCHITECTURE_IMPROVEMENTS_2025-11-14.md - System improvements
- BACKEND_ARCHITECTURE_OVERVIEW.md - Backend design
- PROJECT_WORKSPACE_FOCUS_PLAN.md - Focus feature planning
- THINKING_BLOCK_LOG_UI_SPEC.md - ThinkingBlock UI spec
- BUG_ANALYSIS_2025-11-14.md - Known issues and fixes
- REFACTORING_SPEC.md - Code organization

### App-Wide Documentation

- `/apps/web/CLAUDE.md - SvelteKit patterns and conventions
- `/apps/web/docs/NAVIGATION_INDEX.md - All web app docs
- `/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md - System architecture
- `/docs/DEPLOYMENT_TOPOLOGY.md - Production deployment

## Key Technologies

- **Svelte 5**: Runes syntax ($state, $derived, $effect)
- **TypeScript**: Full type safety
- **SSE**: Server-Sent Events for streaming
- **AbortController**: Stream cancellation
- **Supabase**: Session persistence
- **Tailwind CSS**: Styling and dark mode

## File Sizes & Reading Time

| File                                | Size  | Lines | Read Time |
| ----------------------------------- | ----- | ----- | --------- |
| FRONTEND_EXPLORATION.md             | 33 KB | 1097  | 30-45 min |
| FRONTEND_QUICK_REFERENCE.md         | 11 KB | 290   | 5-10 min  |
| AGENTIC_CHAT_EXPLORATION_SUMMARY.md | 11 KB | 350   | 10-15 min |

## How to Use These Docs

### 5-Minute Overview

1. Read AGENTIC_CHAT_EXPLORATION_SUMMARY.md sections 1-5

### 15-Minute Orientation

1. Read AGENTIC_CHAT_EXPLORATION_SUMMARY.md (all sections)
2. Skim FRONTEND_QUICK_REFERENCE.md tables

### 1-Hour Deep Dive

1. Read AGENTIC_CHAT_EXPLORATION_SUMMARY.md
2. Read FRONTEND_EXPLORATION.md sections 1-6
3. Review FRONTEND_QUICK_REFERENCE.md

### Complete Study

1. Read AGENTIC_CHAT_EXPLORATION_SUMMARY.md
2. Read entire FRONTEND_EXPLORATION.md
3. Use FRONTEND_QUICK_REFERENCE.md as ongoing reference
4. Study source code (AgentChatModal.svelte)

## Contributing to Docs

When you make changes to agentic chat:

1. **Update relevant sections** in FRONTEND_EXPLORATION.md if behavior changes
2. **Update tables** in FRONTEND_QUICK_REFERENCE.md if state changes
3. **Add examples** if introducing new patterns
4. **Update this index** if adding new documentation files

---

**Last Updated**: November 17, 2025

**Generated by**: Claude Code - Agentic Chat Frontend Exploration

**Status**: Complete - Ready for reference and development
