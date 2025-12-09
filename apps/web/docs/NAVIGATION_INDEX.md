<!-- apps/web/docs/NAVIGATION_INDEX.md -->

# BuildOS Web App Documentation Navigation Index

**Last Updated**: November 4, 2025
**Purpose**: Quick navigation guide to all documentation in the web app
**Location**: `/apps/web/docs/`

## 📍 Quick Navigation by Task

### Working on Ontology Features?

- **Main Hub**: [`/features/ontology/README.md`](./features/ontology/README.md)
- **Data Models**: [`/features/ontology/DATA_MODELS.md`](./features/ontology/DATA_MODELS.md) - Complete schema analysis
- **Implementation Guide**: [`/features/ontology/IMPLEMENTATION_SUMMARY.md`](./features/ontology/IMPLEMENTATION_SUMMARY.md) - What's built

### Working on UI Components?

- **Style Guide**: [`/technical/components/BUILDOS_STYLE_GUIDE.md`](./technical/components/BUILDOS_STYLE_GUIDE.md) - Design system
- **Modal Components**: [`/technical/components/modals/README.md`](./technical/components/modals/README.md) - Modal & FormModal docs
    - [Quick Reference](./technical/components/modals/QUICK_REFERENCE.md) - Usage cheatsheet
    - [Visual Guide](./technical/components/modals/VISUAL_GUIDE.md) - Diagrams & layouts
    - [Technical Analysis](./technical/components/modals/TECHNICAL_ANALYSIS.md) - Deep dive

### Other Features

- **Brain Dump**: [`/features/brain-dump/README.md`](./features/brain-dump/README.md) - AI processing system
- **Calendar**: [`/features/calendar-integration/README.md`](./features/calendar-integration/README.md) - Google Calendar sync
- **Notifications**: [`/features/notifications/README.md`](./features/notifications/README.md) - Notification system
- **Onboarding**: [`/features/onboarding/README.md`](./features/onboarding/README.md) - User onboarding flow

## 📁 Complete Directory Structure

```
/apps/web/docs/
│
├── README.md                              # Web app documentation hub
├── NAVIGATION_INDEX.md                    # THIS FILE - Quick navigation
│
├── /features/                             # Feature-specific documentation
│   ├── /brain-dump/                       # Brain dump processing system
│   │   ├── README.md                      # Overview & architecture
│   │   ├── IMPLEMENTATION_GUIDE.md        # How to implement
│   │   └── TESTING_GUIDE.md               # Testing brain dumps
│   │
│   ├── /calendar-integration/             # Google Calendar integration
│   │   ├── README.md                      # Calendar overview
│   │   ├── API_REFERENCE.md               # Calendar API docs
│   │   └── WEBHOOK_SETUP.md               # Webhook configuration
│   │
│   ├── /notifications/                    # Notification system
│   │   ├── README.md                      # Notification overview
│   │   ├── IMPLEMENTATION.md              # Implementation details
│   │   └── API_REFERENCE.md               # Notification API
│   │
│   ├── /onboarding/                       # User onboarding
│   │   ├── README.md                      # Onboarding flow
│   │   └── CHECKLIST.md                   # Implementation checklist
│   │
│   └── /ontology/                         # Ontology system (NEW)
│       ├── README.md                      # Ontology overview & quick start
│       ├── DATA_MODELS.md                 # Complete database schema (31KB)
│       └── IMPLEMENTATION_SUMMARY.md      # CRUD implementation status
│
├── /technical/                            # Technical documentation
│   ├── /api/                              # API documentation
│   │   ├── README.md                      # API overview
│   │   ├── ENDPOINTS.md                   # All API endpoints
│   │   └── PATTERNS.md                    # API design patterns
│   │
│   ├── /architecture/                     # System architecture
│   │   ├── README.md                      # Architecture overview
│   │   ├── SYSTEM_DESIGN.md               # High-level design
│   │   └── DATA_FLOW.md                   # Data flow diagrams
│   │
│   ├── /components/                       # UI component docs
│   │   ├── BUILDOS_STYLE_GUIDE.md        # Design system & patterns
│   │   └── /modals/                       # Modal components (NEW)
│   │       ├── README.md                  # Modal overview
│   │       ├── QUICK_REFERENCE.md         # Developer cheatsheet
│   │       ├── VISUAL_GUIDE.md            # Visual diagrams
│   │       ├── TECHNICAL_ANALYSIS.md      # Deep technical dive
│   │       └── ANALYSIS_SUMMARY.txt       # Executive summary
│   │
│   ├── /database/                         # Database documentation
│   │   ├── README.md                      # Database overview
│   │   ├── SCHEMA.md                      # Full schema
│   │   └── MIGRATIONS.md                  # Migration guide
│   │
│   ├── /testing/                          # Testing documentation
│   │   ├── README.md                      # Testing strategy
│   │   ├── UNIT_TESTS.md                  # Unit testing guide
│   │   └── E2E_TESTS.md                   # E2E testing guide
│   │
│   └── /deployment/                       # Deployment docs
│       ├── README.md                      # Deployment overview
│       ├── VERCEL.md                      # Vercel deployment
│       └── /runbooks/                     # Operational runbooks
│
├── /operations/                           # Operational documentation
│   ├── /environment/                      # Environment setup
│   │   └── ENV_VARIABLES.md               # Environment variables
│   │
│   └── /monitoring/                       # Monitoring & logging
│       └── LOGGING.md                     # Logging patterns
│
├── /development/                          # Development guides
│   ├── GETTING_STARTED.md                 # New developer guide
│   ├── CODING_STANDARDS.md                # Code style guide
│   ├── TESTING_CHECKLIST.md               # Testing requirements
│   └── WORKFLOW.md                        # Development workflow
│
└── /migrations/                           # Migration documentation
    ├── /active/                           # Active migrations
    └── /completed/                        # Completed migrations
```

## 🔍 Finding Documentation

### By Technology

- **Svelte 5 / SvelteKit**: Check `/technical/architecture/` and component docs
- **Supabase**: See `/technical/database/` and API patterns
- **AI/LLM**: Look in `/features/brain-dump/` and prompt templates
- **Google Calendar**: See `/features/calendar-integration/`
- **Stripe**: Check environment setup and payment docs

### By Task Type

- **Building CRUD Operations**: `/features/ontology/IMPLEMENTATION_SUMMARY.md`
- **Creating Modals**: `/technical/components/modals/QUICK_REFERENCE.md`
- **Writing API Endpoints**: `/technical/api/PATTERNS.md`
- **Database Changes**: `/technical/database/MIGRATIONS.md`
- **Testing**: `/technical/testing/` and feature-specific test guides
- **Deployment**: `/technical/deployment/` and runbooks

### By User Role

- **New Developers**: Start with `/development/GETTING_STARTED.md`
- **Frontend Engineers**: Focus on `/technical/components/` and `/features/`
- **Backend Engineers**: Check `/technical/api/` and `/technical/database/`
- **DevOps**: See `/technical/deployment/` and `/operations/`
- **AI/LLM Engineers**: Review `/features/brain-dump/` and prompt docs

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

1. **[BuildOS Style Guide](./technical/components/BUILDOS_STYLE_GUIDE.md)** - UI/UX patterns
2. **[Ontology Implementation](./features/ontology/IMPLEMENTATION_SUMMARY.md)** - CRUD patterns
3. **[Modal Quick Reference](./technical/components/modals/QUICK_REFERENCE.md)** - Modal usage
4. **[API Patterns](./technical/api/PATTERNS.md)** - API development
5. **[Getting Started](./development/GETTING_STARTED.md)** - New developer guide

## 🚀 Quick Links for Common Tasks

- **Add a new feature?** → Start with `/features/[similar-feature]/` as template
- **Create a modal?** → `/technical/components/modals/QUICK_REFERENCE.md`
- **Build CRUD operations?** → `/features/ontology/IMPLEMENTATION_SUMMARY.md`
- **Write an API endpoint?** → `/technical/api/PATTERNS.md`
- **Update the database?** → `/technical/database/MIGRATIONS.md`
- **Fix a bug?** → Check relevant feature docs first
- **Deploy changes?** → `/technical/deployment/README.md`

---

**Note**: This index is maintained as documentation is added or reorganized. If you find missing or incorrect links, please update this file.

**Last Major Update**: November 4, 2025 - Added ontology and modal documentation
