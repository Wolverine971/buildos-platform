<!-- apps/web/docs/NAVIGATION_INDEX.md -->

# BuildOS Web App Documentation Navigation Index

**Last Updated**: February 6, 2026
**Purpose**: Quick navigation guide to all documentation in the web app
**Location**: `/apps/web/docs/`

## 📍 Quick Navigation by Task

### Working on Ontology Features?

- **Main Hub**: [`/features/ontology/README.md`](./features/ontology/README.md)
- **Data Models**: [`/features/ontology/DATA_MODELS.md`](./features/ontology/DATA_MODELS.md) - Complete database schema (31KB, 15 tables)

### Working on UI Components?

- **Style Guide**: [`/technical/components/BUILDOS_STYLE_GUIDE.md`](./technical/components/BUILDOS_STYLE_GUIDE.md) - Design system
- **Modal Components**: [`/technical/components/modals/README.md`](./technical/components/modals/README.md) - Modal & FormModal docs
    - [Quick Reference](./technical/components/modals/QUICK_REFERENCE.md) - Usage cheatsheet
    - [Visual Guide](./technical/components/modals/VISUAL_GUIDE.md) - Diagrams & layouts
    - [Technical Analysis](./technical/components/modals/TECHNICAL_ANALYSIS.md) - Deep dive

### Other Features

- **Admin Dashboard**: [`/features/admin-dashboard/README.md`](./features/admin-dashboard/README.md) - Admin tools and dashboard
- **Agentic Chat**: [`/features/agentic-chat/README.md`](./features/agentic-chat/README.md) - AI chat system with tool execution
    - **Tool/API Mapping**: [`/features/agentic-chat/TOOL_API_MAPPING.md`](./features/agentic-chat/TOOL_API_MAPPING.md) - Tool to endpoint/data map
- **Brain Dump**: [`/features/braindump-context/README.md`](./features/braindump-context/README.md) - AI processing system
- **Calendar**: [`/features/calendar-integration/README.md`](./features/calendar-integration/README.md) - Google Calendar sync
- **Chat System**: [`/features/chat-system/README.md`](./features/chat-system/README.md) - Chat infrastructure
- **History Page**: [`/features/history-page/README.md`](./features/history-page/README.md) - Chat session history and resumption
- **Integrations**: [`/features/integrations/README.md`](./features/integrations/README.md) - External integration capabilities
- **Notifications**: [`/features/notifications/README.md`](./features/notifications/README.md) - Notification system
- **Onboarding**: [`/features/onboarding/README.md`](./features/onboarding/README.md) - User onboarding flow
- **Onboarding V2**: [`archived`](../../../docs/archive/apps-web/features/onboarding-v2/README.md) - Legacy archive (moved to `docs/archive/`)
- **Phase Generation**: [`/features/phase-generation/README.md`](./features/phase-generation/README.md) - Procedural phase generation
- **Project Activity Logging**: [`/features/project-activity-logging/README.md`](./features/project-activity-logging/README.md) - Activity tracking and next steps
- **Project Export**: [`/features/project-export/README.md`](./features/project-export/README.md) - Browser-native PDF export
- **Project Sharing**: [`/features/project-sharing/README.md`](./features/project-sharing/README.md) - Project sharing capabilities
- **Time Blocks**: [`/features/time-blocks/README.md`](./features/time-blocks/README.md) - Time block scheduling
- **User Preferences**: [`/features/preferences/README.md`](./features/preferences/README.md) - AI behavior preferences

## 📁 Complete Directory Structure

```
/apps/web/docs/
│
├── README.md                              # Web app documentation hub
├── NAVIGATION_INDEX.md                    # THIS FILE - Quick navigation
│
├── /features/                             # Feature-specific documentation
│   ├── /admin-dashboard/                  # Admin tools and dashboard
│   │   └── README.md
│   │
│   ├── /agentic-chat/                     # AI chat system with tool execution
│   │   ├── README.md                      # Complete architecture & flow (canonical)
│   │   └── TOOL_API_MAPPING.md            # Tool -> API and data mapping
│   │
│   ├── /braindump-context/                # Brain dump processing system
│   │   ├── README.md                      # Overview & architecture
│   │   └── AGENT_CAPABILITIES_ASSESSMENT.md # Agent capabilities
│   │
│   ├── /calendar-integration/             # Google Calendar integration
│   │   ├── README.md                      # Calendar overview
│   │   ├── API_REFERENCE.md               # Calendar API docs
│   │   └── WEBHOOK_SETUP.md               # Webhook configuration
│   │
│   ├── /chat-system/                      # Chat infrastructure
│   │   └── README.md
│   │
│   ├── /conversational-agent/             # Agent conversation design
│   │   └── README.md
│   │
│   ├── /history-page/                     # Chat session history
│   │   └── README.md
│   │
│   ├── /integrations/                     # External integrations
│   │   └── README.md
│   │
│   ├── /notifications/                    # Notification system
│   │   ├── README.md                      # Notification overview
│   │   ├── IMPLEMENTATION.md              # Implementation details
│   │   └── API_REFERENCE.md               # Notification API
│   │
│   ├── /onboarding/                       # User onboarding
│   │   ├── README.md                      # Onboarding flow overview
│   │   ├── ONBOARDING_V2_UPDATE_ASSESSMENT.md  # V2 implementation spec
│   │   └── ONBOARDING_V2_UPDATED_SPEC.md  # Detailed V2 specification
│   │
│   ├── /onboarding-v2/                    # Updated onboarding flow
│   │   └── README.md
│   │
│   ├── /ontology/                         # Ontology system
│   │   ├── README.md                      # Ontology overview & quick start
│   │   └── DATA_MODELS.md                 # Complete database schema (31KB)
│   │
│   ├── /phase-generation/                 # Procedural phase generation
│   │   └── README.md
│   │
│   ├── /preferences/                      # User preferences
│   │   └── README.md                      # Preference system documentation
│   │
│   ├── /project-activity-logging/         # Activity tracking & next steps
│   │   └── README.md
│   │
│   ├── /project-export/                   # Browser-native PDF export
│   │   └── README.md
│   │
│   ├── /project-sharing/                  # Project sharing
│   │   └── README.md
│   │
│   └── /time-blocks/                      # Time block scheduling
│       └── README.md
│
├── /technical/                            # Technical documentation
│   ├── README.md                          # Technical docs overview
│   ├── /api/                              # API documentation
│   │   ├── README.md                      # API overview
│   │   ├── routes-reference.md            # Route reference
│   │   └── /endpoints/                    # Per-resource endpoint docs
│   │
│   ├── /architecture/                     # System architecture
│   │   ├── README.md                      # Architecture overview
│   │   └── BUILD_OS_MASTER_CONTEXT.md     # Master context document
│   │
│   ├── /components/                       # UI component docs
│   │   ├── INKPRINT_DESIGN_SYSTEM.md      # Inkprint design system
│   │   ├── BUILDOS_STYLE_GUIDE.md         # Style guide & patterns
│   │   └── /modals/                       # Modal components
│   │       ├── QUICK_REFERENCE.md         # Developer cheatsheet
│   │       ├── VISUAL_GUIDE.md            # Visual diagrams
│   │       ├── TECHNICAL_ANALYSIS.md      # Deep technical dive
│   │       └── ANALYSIS_SUMMARY.md        # Executive summary
│   │
│   ├── /database/                         # Database documentation
│   │   └── CALENDAR_AND_ONTOLOGY_SCHEMA.md # Calendar & ontology schema
│   │
│   ├── /testing/                          # Testing documentation
│   │   └── TESTING_CHECKLIST.md           # Testing requirements
│   │
│   ├── /deployment/                       # Deployment docs
│   │   ├── DEPLOYMENT_CHECKLIST.md        # Deployment checklist
│   │   ├── VERCEL_DEPLOYMENT.md           # Vercel deployment
│   │   └── /runbooks/                     # Operational runbooks
│   │
│   └── /design-system/                    # Design system docs
│       ├── README.md                      # Design system overview
│       └── DARK_MODE.md                   # Dark mode implementation
│
├── /operations/                           # Operational documentation
│   ├── README.md                          # Operations overview
│   └── /deployment/                       # Deployment operations
│       ├── READY_TO_DEPLOY.md             # Deploy readiness checklist
│       └── VERCEL_CONFIGURATION_GUIDE.md  # Vercel config guide
│
└── /migrations/                           # Migration documentation
    ├── README.md                          # Migrations overview
    └── /completed/                        # Completed migrations
```

## 🔍 Finding Documentation

### By Technology

- **Svelte 5 / SvelteKit**: Check `/technical/architecture/` and component docs
- **Supabase**: See `/technical/database/` and API patterns
- **AI/LLM**: Look in `/features/braindump-context/` and prompt templates
- **Google Calendar**: See `/features/calendar-integration/`
- **Stripe**: Check environment setup and payment docs

### By Task Type

- **Building CRUD Operations**: `/features/ontology/README.md`
- **Creating Modals**: `/technical/components/modals/QUICK_REFERENCE.md`
- **Writing API Endpoints**: `/technical/api/README.md`
- **Database Changes**: `packages/shared-types/src/database.schema.ts` (generated)
- **Testing**: `/technical/testing/` and feature-specific test guides
- **Deployment**: `/technical/deployment/` and runbooks

### By User Role

- **New Developers**: Start with the root `README.md` + `CLAUDE.md`, then `/technical/development/DEVELOPMENT_PROCESS.md`
- **Frontend Engineers**: Focus on `/technical/components/` and `/features/`
- **Backend Engineers**: Check `/technical/api/` and `/technical/database/`
- **DevOps**: See `/technical/deployment/` and `/operations/`
- **AI/LLM Engineers**: Review `/features/braindump-context/` and prompt docs

## 📝 Documentation Standards

### File Naming Conventions

- **README.md** - Overview and entry point for each directory
- **IMPLEMENTATION\_\*.md** - Implementation guides and summaries
- **API\_\*.md** - API documentation
- **DATA\_\*.md** - Data models and schemas
- **[FEATURE]\_GUIDE.md** - Feature-specific guides
- **CHECKLIST.md** - Implementation checklists

### Document Headers

All documentation should include:

```markdown
**Last Updated**: [Date]
**Status**: [Active/Draft/Complete/Deprecated]
**Category**: [Feature/Technical/Operations/Development]
**Location**: [Path in repository]
```

### Content Structure

1. **Overview** - What is this document about?
2. **Quick Start** - Get going quickly
3. **Detailed Content** - Complete information
4. **Examples** - Code samples and use cases
5. **Related Documentation** - Links to related docs
6. **Support** - Where to get help

## 🆕 Recently Added Documentation

### January 30, 2026

- ✅ Consolidated agentic chat documentation into single canonical README
    - Removed 15+ outdated docs, replaced with comprehensive flow guide
    - Documents: API calls, SSE events, context types, tool system, data models
    - See `/features/agentic-chat/README.md`
- ✅ Added tool -> API mapping for agentic chat
    - Documents tool endpoints, data sources, and context-shift behavior
    - See `/features/agentic-chat/TOOL_API_MAPPING.md`

### January 7, 2026

- ✅ Created user preferences documentation in `/features/preferences/`
    - Global and project-level preferences
    - Prompt injection system
    - API reference
- ✅ Updated onboarding documentation for V2 completion
    - All 3 phases complete (Ontology, Education, Preferences)
    - Cross-linked to preferences system
- ✅ Updated navigation index with new features

### November 4, 2025

- ✅ Created comprehensive ontology documentation in `/features/ontology/`
    - Complete data model analysis (31KB)
    - CRUD implementation summary
    - Template system documentation
- ✅ Organized modal component documentation in `/technical/components/modals/`
    - Quick reference guide
    - Visual diagrams
    - Technical deep-dive
    - Migration strategies
- ✅ Created this navigation index

## 🔗 External Documentation

- **Monorepo Guide**: `/docs/MONOREPO_GUIDE.md` (root level)
- **Worker Service**: `/apps/worker/docs/README.md`
- **Shared Packages**: `/packages/*/docs/`
- **Main Project Docs**: `/docs/README.md` (root level)

## 📚 Most Used Documents

Based on common development tasks:

1. **[Inkprint Design System](./technical/components/INKPRINT_DESIGN_SYSTEM.md)** - Design system reference
2. **[Ontology Data Models](./features/ontology/DATA_MODELS.md)** - Schema & CRUD patterns
3. **[Modal Quick Reference](./technical/components/modals/QUICK_REFERENCE.md)** - Modal usage
4. **[API Reference](./technical/api/README.md)** - API documentation
5. **[Development Process](./technical/development/DEVELOPMENT_PROCESS.md)** - New developer guide

## 🚀 Quick Links for Common Tasks

- **Add a new feature?** → Start with `/features/[similar-feature]/` as template
- **Create a modal?** → `/technical/components/modals/QUICK_REFERENCE.md`
- **Build CRUD operations?** → `/features/ontology/README.md`
- **Write an API endpoint?** → `/technical/api/PATTERNS.md`
- **Update the database?** → `/technical/database/MIGRATIONS.md`
- **Fix a bug?** → Check relevant feature docs first
- **Deploy changes?** → `/technical/deployment/README.md`
- **Add AI preferences?** → `/features/preferences/README.md`
- **Update onboarding?** → `/features/onboarding/ONBOARDING_V2_UPDATE_ASSESSMENT.md`

---

**Note**: This index is maintained as documentation is added or reorganized. If you find missing or incorrect links, please update this file.

**Last Major Update**: February 6, 2026 - Added all 19 feature directories to navigation, fixed broken links
