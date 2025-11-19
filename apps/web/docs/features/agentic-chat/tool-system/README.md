# Agentic Chat Tool System

**Location**: Part of the agentic chat system
**Tools**: 31 tools across 4 categories
**Last Updated**: 2025-11-17

---

## 🚀 Quick Start

**New to the tool system?** Start here:

1. **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** (5 min)
    - All 31 tools with descriptions
    - Tool categories and contexts
    - Common usage patterns

2. **[SUMMARY.md](./SUMMARY.md)** (8 min)
    - Executive overview
    - Design principles
    - Tool architecture

3. **[DOCUMENTATION.md](./DOCUMENTATION.md)** (45-60 min)
    - Complete technical reference
    - 12 detailed sections
    - Implementation patterns

---

## 📚 Documentation Files

### Navigation & Overview

**[INDEX.md](./INDEX.md)** - Documentation navigation guide

- How to use these docs
- Quick navigation by task
- File organization

**[SUMMARY.md](./SUMMARY.md)** - Executive summary

- Design principles
- Tool categories overview
- Key innovations

### Reference Documentation

**[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** ⭐ Most Used

- All 31 tools listed
- Categories: Search (8), Read (2), Write (12), Utility (9)
- Tool contexts and filtering
- Usage patterns
- API reference

**[DOCUMENTATION.md](./DOCUMENTATION.md)** - Complete reference

- Tool system architecture
- Tool definition format
- Context-based filtering
- Execution flow
- Progressive disclosure pattern
- BuildOS knowledge tools
- Development patterns
- API endpoints
- Error handling
- Adding new tools
- Testing guidelines

---

## 🎯 By Task

### "I want to..."

**Find a specific tool**
→ [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - Section 2: All Tools by Category

**Understand tool categories**
→ [SUMMARY.md](./SUMMARY.md) - Section 2: Tool Categories

**Add a new tool**
→ [DOCUMENTATION.md](./DOCUMENTATION.md) - Section 11: Adding New Tools

**Understand context filtering**
→ [DOCUMENTATION.md](./DOCUMENTATION.md) - Section 4: Context-Based Tool Filtering

**See how tools are executed**
→ [DOCUMENTATION.md](./DOCUMENTATION.md) - Section 5: Tool Execution Flow

**Debug tool execution**
→ [DOCUMENTATION.md](./DOCUMENTATION.md) - Section 8: Error Handling

---

## 📊 Tool System Overview

### Statistics

- **Total Tools**: 31
- **Categories**: 4 (Search, Read, Write, Utility)
- **Contexts**: 9 different conversation contexts
- **Progressive Disclosure**: 3 levels (abbreviated → detailed → full)

### Tool Categories

#### Search Tools (8 tools)

- `search_tasks`, `search_projects`, `search_plans`, `search_goals`
- `search_documents`, `search_outputs`, `search_elements`, `search_templates`

#### Read Tools (2 tools)

- `get_entity_details` - Universal entity reader
- `get_dashboard_overview` - Cross-entity dashboard

#### Write Tools (12 tools)

Create/update operations for:

- Tasks, projects, plans, goals, documents, outputs
- Templates, elements, instances
- Project creation tool

#### Utility Tools (9 tools)

- BuildOS knowledge tools
- Context shifting tools
- Braindump processing

---

## 🏗️ Architecture Highlights

### Context-Aware Tool Filtering

Tools are filtered based on conversation context (9 contexts):

- `workspace` - All tools available
- `project` - Project-scoped tools
- `task`, `plan`, `goal` - Entity-specific tools
- `document`, `output`, `template`, `element` - Specialized contexts

### Progressive Disclosure

Tools return data in 3 levels:

1. **Abbreviated** - Minimal fields for quick overview
2. **Detailed** - Common fields for most operations
3. **Full** - All fields including metadata

### BuildOS Knowledge Integration

Special tools provide context about the BuildOS platform:

- `get_buildos_overview` - Platform introduction
- `get_buildos_references` - Key entities and relationships
- `get_buildos_usage_guide` - Best practices

---

## 🔗 Related Documentation

### Main Agentic Chat Docs

- **[Main README](../README.md)** - Agentic chat system overview
- **[VISUAL_GUIDE](../VISUAL_GUIDE.md)** - Visual flow diagrams
- **[BACKEND_ARCHITECTURE_OVERVIEW](../BACKEND_ARCHITECTURE_OVERVIEW.md)** - Backend architecture

### Implementation

- **Tool Definitions**: `/src/lib/chat/tool-definitions.ts`
- **Tool Configuration**: `/src/lib/chat/tools.config.ts`
- **Tool Execution**: `/src/lib/services/agentic-chat/tool-execution-service.ts`

### API Documentation

- **Agent Stream API**: `/src/routes/api/agent/stream/+server.ts`
- **Tool Endpoints**: Various `/src/routes/api/onto/*` endpoints

---

## 📖 Reading Paths

### Path 1: Quick Overview (15 min)

1. This README (5 min)
2. QUICK_REFERENCE.md (5 min)
3. SUMMARY.md (5 min)

### Path 2: Developer Onboarding (1 hour)

1. This README (5 min)
2. QUICK_REFERENCE.md (10 min)
3. SUMMARY.md (15 min)
4. DOCUMENTATION.md (30 min)

### Path 3: Tool Development (2 hours)

1. QUICK_REFERENCE.md (10 min)
2. DOCUMENTATION.md (full read) (60 min)
3. Review source code (30 min)
4. Check existing tool implementations (20 min)

---

**Maintained by**: BuildOS Platform Team
**Part of**: Agentic Chat System Documentation
