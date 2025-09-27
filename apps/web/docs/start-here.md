# 📚 BuildOS Documentation Hub - Start Here

> **The single source of truth for all BuildOS documentation**
>
> Last Updated: September 26, 2025 | Version: 2.0

---

## 🚀 Quick Start Guide

### Essential Reading for New Developers

Start with these documents in order:

1. **BuildOS Overview** → [What is BuildOS?](#what-is-buildos) (below)
2. **Architecture** → `technical/architecture/BUILD_OS_MASTER_CONTEXT.md` - System overview
3. **Brain Dump Flow** → `technical/architecture/brain-dump-flow.md` - Core feature deep dive
4. **Development Process** → `technical/development/DEVELOPMENT_PROCESS.md` - How we work
5. **Claude Guide** → `/CLAUDE.md` - AI assistant guidance

### Common Tasks - Find What You Need Fast

| I need to...                         | Go to...                                                   |
| ------------------------------------ | ---------------------------------------------------------- |
| **View API documentation**           | `technical/api/routes-reference.md` (134 endpoints)        |
| **Understand brain dump processing** | `technical/architecture/brain-dump-flow.md`                |
| **Work with AI prompts**             | `prompts/architecture.md`                                  |
| **Add a new feature**                | `technical/development/templates/FEATURE_PLAN_TEMPLATE.md` |
| **Understand the database**          | `technical/database/schema.md` (64 tables)                 |
| **Set up Stripe payments**           | `technical/integrations/stripe-setup.md`                   |
| **Deploy to production**             | `technical/deployment/DEPLOYMENT_CHECKLIST.md`             |
| **Handle production issues**         | `technical/deployment/runbooks/`                           |
| **Create marketing content**         | `business/` or `marketing/brand/`                          |
| **Find investor profiles**           | `archive/marketing/investors/` (moved to archive)          |
| **Fix a brain dump issue**           | `technical/services/brain-dump-service.md`                 |
| **Understand calendar sync**         | `technical/architecture/CALENDAR_SERVICE_FLOW.md`          |
| **Review architecture decisions**    | `technical/architecture/decisions/` (ADRs)                 |

---

## 🧠 What is BuildOS?

BuildOS is an AI-powered productivity platform designed specifically for ADHD minds and ambitious individuals who struggle with traditional task management systems. It transforms chaotic thoughts into actionable plans through an innovative "brain dump" system.

### Core Features

#### 🧠 Brain Dump System

The heart of BuildOS - a revolutionary approach to task capture:

- **Stream of Consciousness Input**: Write naturally without structure
- **AI Processing**: Automatically extracts context, tasks, and priorities
- **Dual Processing Architecture**: Separates context understanding from task extraction for accuracy
- **Smart Questions**: AI asks clarifying questions to fill gaps
- **Project Creation**: Automatically creates or updates projects from brain dumps

#### 📊 Intelligent Project Management

- **Automatic Organization**: Projects are created and organized from brain dumps
- **Phase-Based Planning**: Tasks grouped into logical phases
- **Context Preservation**: Maintains rich project context for better AI assistance
- **Calendar Integration**: Each project can have its own Google Calendar
- **Smart Scheduling**: AI optimizes task scheduling based on your calendar

#### 📅 Calendar & Scheduling

- **2-Way Google Calendar Sync**: Changes sync bidirectionally
- **Project Calendars**: Dedicated calendars per project for organization
- **Intelligent Scheduling**: AI schedules tasks around existing commitments
- **Recurring Tasks**: Support for repeating tasks and habits

#### 📝 Daily Briefs

- **AI-Generated Summaries**: Daily overview of tasks and priorities
- **Email Delivery**: Automatic morning delivery to your inbox
- **Streaming Generation**: Real-time brief creation
- **Personalized Content**: Tailored to your projects and work style

### Technical Architecture

#### Frontend

- **SvelteKit 2+** with **Svelte 5** (runes syntax)
- **TypeScript** for type safety
- **TailwindCSS** for styling
- **Real-time updates** via Supabase subscriptions

#### Backend

- **Supabase** (PostgreSQL with Row Level Security)
- **OpenAI API** for AI processing
- **Vercel** serverless functions
- **Google OAuth** for authentication
- **Stripe** for payments (optional)

#### AI Processing

- **Streaming responses** for real-time feedback
- **Prompt engineering** for accurate task extraction
- **Context windows** for maintaining conversation history
- **LLM testing framework** for prompt quality

---

## 📁 NEW Documentation Structure (Post-Reorganization)

### 📚 /docs/technical/ - All Technical Documentation

Comprehensive technical documentation for developers and engineers.

#### API Documentation (`technical/api/`)

- **routes-reference.md** - Complete API route documentation (134 endpoints)
- **types.md** - TypeScript type definitions
- **templates.md** - Request/response templates
- **summary.md** - API overview and statistics
- **endpoints/** - Detailed endpoint documentation
    - braindumps.md
    - calendar.md
    - daily-briefs.md
    - projects.md

#### Architecture (`technical/architecture/`)

- **BUILD_OS_MASTER_CONTEXT.md** - Complete system overview
- **brain-dump-flow.md** - Consolidated brain dump architecture
- **CALENDAR_SERVICE_FLOW.md** - Calendar sync architecture
- **CALENDAR_WEBHOOK_FLOW.md** - Webhook system design
- **SCALABILITY_ANALYSIS.md** - Performance analysis
- **email-system.md** - Email infrastructure
- **ai-pipeline.md** - AI integration patterns
- **supabase-design.md** - Database architecture
- **decisions/** - Architecture Decision Records (ADRs)
    - ADR-001-supabase.md - Supabase selection
    - ADR-002-dual-processing.md - Dual processing pattern
    - ADR-003-project-calendars.md - Calendar strategy

#### Services (`technical/services/`)

- **brain-dump-service.md** - Brain dump processing service
- **calendar-service.md** - Calendar integration service
- **project-service.md** - Project management service
- **prompt-service.md** - AI prompt management

#### Database (`technical/database/`)

- **schema.md** - Database schema documentation
- **rls-policies.md** - Row Level Security policies
- **indexes.md** - Performance optimization

#### Components (`technical/components/`)

- **BUILDOS_STYLE_GUIDE.md** - Design system
- **DESIGN_SYSTEM_GUIDE.md** - Component standards
- **MODAL_STANDARDS.md** - Modal patterns
- **brain-dump/** - Brain dump UI components
- **projects/** - Project UI components

#### Development (`technical/development/`)

- **DEVELOPMENT_PROCESS.md** - Development workflow
- **GIT_WORKFLOW.md** - Git conventions
- **getting-started.md** - Quick setup guide
- **sveltekit-patterns.md** - SvelteKit best practices
- **svelte5-runes.md** - Svelte 5 patterns

#### Testing (`technical/testing/`)

- **strategy.md** - Testing approach
- **vitest-setup.md** - Unit test configuration
- **llm-testing.md** - LLM test patterns
- **TESTING_CHECKLIST.md** - Test requirements

#### Deployment (`technical/deployment/`)

- **DEPLOYMENT_CHECKLIST.md** - Pre-deployment checks
- **VERCEL_DEPLOYMENT.md** - Vercel configuration
- **runbooks/** - Operational procedures
    - incident-response.md
    - calendar-webhook-failures.md
    - openai-rate-limiting.md
    - stripe-webhook-validation.md
    - supabase-recovery.md

### 💼 /docs/business/ - Business & Strategy Documentation

Business strategy, planning, and organizational documents.

### 👤 /docs/user-guide/ - End User Documentation

User-facing documentation and guides.

#### Features (`user-guide/features/`)

- **brain-dump.md** - How to use brain dumps
- **projects.md** - Project management guide
- **calendar-sync.md** - Calendar setup
- **daily-briefs.md** - Daily brief configuration

#### Support

- **getting-started.md** - User onboarding
- **faq.md** - Frequently asked questions
- **troubleshooting.md** - Common issues

### 📝 /docs/prompts/ - AI Prompt Templates

Reorganized prompt architecture.

- **architecture.md** - Prompt system design
- **brain-dump/** - All brain dump prompts
    - **new-project/** - New project flows
    - **existing-project/** - Existing project updates

### 🗄️ /archive/ - Archived Documentation

Old documentation moved to archive for reference.

- **marketing/** - Old investor profiles and outreach templates
- **brain-dump-docs/** - Superseded brain dump documentation
- **outdated-development/** - Old development docs

---

## 📁 Legacy Documentation Structure (Being Phased Out)

### 🏛️ Core Architecture & System Design

Essential documentation for understanding BuildOS architecture and design principles.

#### System Architecture

- `architecture/BUILD_OS_MASTER_CONTEXT.md` - **START HERE** - Complete system overview
- `architecture/system-checkpoint.md` - Current system state snapshot
- `architecture/SCALABILITY_ANALYSIS.md` - Performance and scaling considerations
- `architecture/email-system.md` - Email infrastructure design
- `ARCHITECTURE_REORGANIZATION_PLAN.md` - Documentation restructuring plan for SvelteKit + Supabase

#### Calendar Integration

- `architecture/CALENDAR_SERVICE_FLOW.md` - Google Calendar sync architecture
- `architecture/CALENDAR_WEBHOOK_FLOW.md` - Real-time calendar updates
- `design/google-calendar-2-way-sync.md` - Bidirectional sync design
- `design/GOOGLE_CALENDARS_FOR_PROJECTS.md` - Per-project calendar specs
- `research/2025-01-08_google_calendars_for_projects.md` - Implementation research

#### Brain Dump System

- `audits/BRAINDUMP_FLOW_AUDIT_2025.md` - **ESSENTIAL** - Complete flow analysis
- `design/BRAIN_DUMP_AUTO_ACCEPT_SIMPLE.md` - Auto-accept feature design
- `design/BRAIN_DUMP_UNIFIED_STORE_ARCHITECTURE.md` - State management
- `design/BRAIN_DUMP_UNIFIED_STORE_IMPLEMENTATION_STATUS.md` - Implementation progress
- `design/SHORT_BRAINDUMP_QUESTION_GENERATION_FIX.md` - Question generation improvements
- `research/2025-01-07_brain-dump-flow-analysis.md` - Recent analysis
- `development/braindump-refactor-2025.md` - Refactoring plans

### 🤖 AI & Prompt Engineering

Everything related to LLM prompts and AI processing.

#### Prompt Architecture

- `prompts/PROMPT_ARCHITECTURE.md` - **START HERE** - Prompt system overview
- `prompts/README.md` - Quick prompt guide
- `design/prompt-template-refactoring-plan.md` - Refactoring strategy

#### New Project Prompts

- `prompts/new-project/new-project-long-braindump.md` - Full brain dump template
- `prompts/new-project/new-project-short-braindump.md` - Quick capture template
- `prompts/new-project/new-project-short-braindump-prompt.md` - Short prompt spec
- **Dual Processing:**
    - `prompts/new-project/dual-processing/context/new-project-context-prompt.md` - Context extraction
    - `prompts/new-project/dual-processing/tasks/new-project-task-extraction-prompt.md` - Task extraction
- **Singular Processing:**
    - `prompts/new-project/singular/new-project-singular-prompt.md` - Combined processing

#### Existing Project Prompts

- `prompts/existing-project/existing-project-long-braindump.md` - Full update template
- `prompts/existing-project/existing-project-short-braindump.md` - Quick update
- `prompts/existing-project/existing-project-short-braindump-prompt.md` - Short prompt spec
- `prompts/existing-project/existing-project-context-update-prompt.md` - Context updates
- `prompts/existing-project/existing-project-short-context-update.md` - Quick context updates
- **Dual Processing:**
    - `prompts/existing-project/dual-processing/context/existing-project-context-prompt.md`
    - `prompts/existing-project/dual-processing/tasks/existing-project-task-extraction-prompt.md`
    - `prompts/existing-project/dual-processing/tasks/existing-project-task-extraction-with-questions-prompt.md`
- **Short Brain Dump:**
    - `prompts/existing-project/short-braindump/context/short-braindump-context-update-prompt.md`
    - `prompts/existing-project/short-braindump/tasks/short-braindump-task-extraction-prompt.md`
    - `prompts/existing-project/short-braindump/tasks/short-braindump-task-extraction-with-questions-prompt.md`

#### Prompt Components

- `prompts/components/integrated-questions-prompt.md` - Question generation
- `prompts/task-synthesis/task-synthesis-reorganization.md` - Task organization
- `prompts/image-design-prompts.md` - Visual content generation

#### AI Agents

- `agents/create_plan.md` - Planning agent specification
- `agents/simplify-agent.md` - Content simplification agent

#### LLM Testing

- `design/SIMPLIFIED_LLM_TESTING_DESIGN.md` - Testing framework design

### 🎨 Design System & UI Components

UI/UX design standards and component documentation.

#### Design Foundations

- `design/BUILDOS_STYLE_GUIDE.md` - **ESSENTIAL** - Comprehensive style guide with Apple-inspired design system (v1.0.1)
- `design/BASE_DESIGN_PRINCIPLES.md` - Core design philosophy
- `design/DESIGN_SYSTEM_GUIDE.md` - Complete design system
- `design/STYLING_BASE_PROMPT.md` - AI styling guidelines
- `design/OPTIMIZATION_REPORT.md` - Performance optimizations
- `design/CONTEXT_FRAMEWORK_PHILOSOPHY.md` - Context management approach

#### Component Standards

- `design/components/MODAL_STANDARDS.md` - Modal design patterns
- `design/PROJECT_PAGE_COMPONENT_PATTERNS.md` - Project page components

#### Feature Specifications

- `design/EMAIL_FLOW_SYSTEM_SPEC.md` - Email system design
- `design/UNIVERSAL_PROJECT_CONTEXT_FORMAT.md` - Context data structure
- `design/Rolling-context-window.md` - Context window management
- `design/braindump-calendar-sync-research.md` - Calendar sync research

### ⚙️ Development & Engineering

Development processes, workflows, and technical guides.

#### Core Development

- `development/DEVELOPMENT_PROCESS.md` - **ESSENTIAL** - How we build
- `development/GIT_WORKFLOW.md` - Git conventions and workflow
- `development/TESTING_CHECKLIST.md` - Testing requirements
- `development/README.md` - Developer quickstart
- `development/dev_docs.md` - Additional dev notes

#### Feature Planning

- `development/templates/FEATURE_PLAN_TEMPLATE.md` - **USE THIS** - Feature planning template
- `development/phase-intelligent-scheduling-plan.md` - Smart scheduling design
- `development/zero-layout-shift-implementation.md` - Performance improvements
- `development/RECURRING_TASKS_USER_GUIDE.md` - Recurring tasks documentation

#### Implementation Plans

- `development/plans/SYNTHESIS_IMPROVEMENT_PLAN.md` - Task synthesis improvements
- `development/plans/google-calendars-for-projects-implementation.md` - Calendar implementation
- `development/plans/enable-project-calendars.md` - Calendar enablement plan
- `development/plans/2025-09-24_project-calendar-connect-plan.md` - Calendar connection flow
- `development/plans/2025-09-18_braindump-processing-notification-fix.md` - Notification fixes
- `development/plans/brain-dump-collapsible-notification-implementation.md` - UI improvements
- `development/plans/braindump-deletion-feature-plan.md` - Deletion feature
- `development/plans/phase-regeneration-preserve-history.md` - History preservation
- `development/plans/simplified-dashboard-onboarding-plan.md` - Onboarding improvements

#### Code Quality & Audits

- `audits/BRAINDUMP_FLOW_AUDIT_2025.md` - Brain dump system audit
- `audits/CODE_DUPLICATION_REPORT.md` - Code duplication analysis
- `audits/database-types-audit.md` - Database schema review
- `audits/archive/CODE_CLEANUP_REPORT.md` - Legacy code cleanup
- `development/audits/projects-route-review.md` - Route analysis
- `development/2025-09-17_18-44_projects-slug-page-svelte5-audit.md` - Svelte 5 audit
- `development/svelte-5-loop-fix-assessment.md` - Svelte 5 fixes

#### Tools & Utilities

- `development/ollamaBackgroundScript.md` - Local LLM testing
- `development/user-interview-questions.md` - User research questions
- `development/today-todos.md` - Current priorities

### 💼 Business & Strategy

Business planning, strategy, and organizational documentation.

#### Business Communications

- `business/comms-guide.md` - Communication standards
- `business/buildos-comms-guide-lulu-style.md` - Lulu style guide
- `business/buildos-comms-guide-advanced-lulu.md` - Advanced style guide
- `business/buildos-comms-renaissance-rebellion.md` - Brand voice
- `business/buildos-copy-examples-lulu.md` - Copy examples
- `business/buildos-pitch-deck-renaissance-rewrite.md` - Pitch deck rewrite
- `business/info.md` - Company information

#### Strategic Planning

- `business/strategy/master-seed.md` - **ESSENTIAL** - Core vision document
- `business/strategy/market-context.md` - Market analysis
- `business/strategy/masterplan-notes.md` - Strategic planning notes
- `business/strategy/features-notes.md` - Feature strategy
- `business/strategy/ceo-training-plan.md` - Leadership development

#### War Room Documents

- `business/war-room/war-room-design-doc.md` - Strategic planning framework
- `business/war-room/war-room-executive-brief.md` - Executive summary
- `business/war-room/war-room-original-spec.md` - Original specifications
- `business/war-room/war-room-learnings.md` - Strategic learnings
- `business/war-room/war-room-llm-prompting-strategy.md` - AI strategy
- `business/war-room/war-room-positioning.md` - Market positioning

### 📱 Marketing & Growth

Marketing strategies, brand guidelines, and growth initiatives.

#### Brand & Communications

- `marketing/brand/communication-guide.md` - **ESSENTIAL** - Brand communication
- `marketing/brand/brand-guide-1-pager.md` - Quick brand reference
- `marketing/brand/buildos-brand-personality-profile.md` - Brand personality
- `marketing/brand/brand-building-worksheet.md` - Brand development
- `marketing/brand/personal-brand-questionnaire.md` - Personal branding
- `marketing/brand/brand-activating-planner.md` - Brand activation
- `marketing/brand/brand-evolution-roadmap-worksheet.md` - Evolution planning
- `marketing/brand/brand-personality.md` - Personality framework

#### Customer Research

- `marketing/customer-lingo-adhd.md` - ADHD customer language
- `marketing/customer-lingo-writer.md` - Writer customer language
- `marketing/customer-language-decoder.md` - Language analysis template

#### Social Media Strategy

- `marketing/social-media/twitter-strategy.md` - Twitter/X strategy
- `marketing/social-media/twitter-strategy-worksheet.md` - Planning worksheet
- `marketing/social-media/twitter-context-engineering-strategy.md` - Context optimization
- `marketing/social-media/twitter-notes.md` - Twitter insights
- `marketing/social-media/linkedin-strategy-notes.md` - LinkedIn strategy
- `marketing/social-media/instagram-strategy.md` - Instagram strategy
- **Content Templates:**
    - `marketing/social-media/content-template-educational-content.md`
    - `marketing/social-media/content-template-hot-take.md`
    - `marketing/social-media/types-of-content.md`

#### Growth & Viral Marketing

- `marketing/growth/viral-plan-notes.md` - Viral growth strategy
- `marketing/growth/3-phase-warm-outreach-template.md` - Outreach template
- **Target Influencers:**
    - `marketing/growth/target-influencers/tim-ferris.md`
    - `marketing/growth/target-influencers/patrick-bet-david.md`
    - `marketing/growth/target-influencers/viral-plan.md`

#### User Segments

- `marketing/user-segments/users-adhd.md` - ADHD user personas
- `marketing/user-segments/users-professionals.md` - Professional users
- `marketing/user-segments/users-students.md` - Student users
- `marketing/user-segments/user-persona-aquisition-strategy.md` - Acquisition strategy

### 💰 Fundraising & Investors

Investor relations, fundraising strategy, and VC profiles.

#### Fundraising Strategy

- `marketing/investors/buildos-fundraising-strategy.md` - **ESSENTIAL** - Master strategy
- `marketing/investors/fundraising-preparedness-checklist.md` - Readiness checklist
- `marketing/investors/fundraising-preparedness-checklist-part-2.md` - Extended checklist
- `marketing/investors/VC-notes.md` - VC meeting notes
- `marketing/investors/2025-09-17_investor-outreach-research-analysis.md` - Outreach analysis

#### Investor Messaging

- `marketing/investors/investor-optimists.md` - Optimist messaging
- `marketing/investors/investor-skeptics.md` - Skeptic messaging

#### Individual Investor Profiles

- `marketing/investors/brian-singerman-founders-fund-profile.md` - Brian Singerman (Founders Fund)
- `marketing/investors/casey-caruso-topology-ventures-profile.md` - Casey Caruso (Topology)
- `marketing/investors/dennis-mortensen-profile.md` - Dennis Mortensen
- `marketing/investors/paige-craig-profile.md` - Paige Craig (Outlander)
- `marketing/investors/slow-ventures-jack-raines-profile.md` - Jack Raines (Slow)
- `marketing/investors/tim-hsia-context-ventures-profile.md` - Tim Hsia (Context)
- `marketing/investors/tom-blomfield-profile.md` - Tom Blomfield
- `marketing/investors/sequoia-capital-investor-profile.md` - Sequoia Capital

#### Warm Introduction Templates

- `marketing/investors/brian-singerman-gpx-warm-intro-email.md`
- `marketing/investors/casey-caruso-topology-ventures-warm-intro-email.md`
- `marketing/investors/dennis-mortensen-advisory-outreach-email.md`
- `marketing/investors/jack-raines-slow-ventures-warm-intro-email.md`
- `marketing/investors/paige-craig-outlander-vc-warm-intro-email.md`
- `marketing/investors/paige-craig-outreach-template.md`
- `marketing/investors/sarah-guo-conviction-warm-intro-email.md`
- `marketing/investors/tim-hsia-context-ventures-warm-intro-email.md`
- `marketing/investors/tim-hsia-coffee-meeting-strategy.md`
- `marketing/investors/tom-blomfield-yc-warm-intro-email.md`

#### VC Firm Profiles

Complete profiles in `marketing/investors/vc-firms/`:

- **Tier 1 Firms:**
    - `andreessen-horowitz-a16z.md` - Andreessen Horowitz
    - `sequoia-capital.md` - Sequoia Capital
    - `greylock-partners.md` - Greylock Partners
    - `khosla-ventures.md` - Khosla Ventures
    - `thiel-capital-founders-fund.md` - Founders Fund

- **Growth Firms:**
    - `bessemer-venture-partners.md` - Bessemer
    - `general-catalyst.md` - General Catalyst
    - `insight-partners.md` - Insight Partners
    - `lightspeed-venture-partners.md` - Lightspeed
    - `coatue-management.md` - Coatue

- **Early Stage:**
    - `first-round-capital.md` - First Round
    - `craft-ventures.md` - Craft Ventures
    - `point-nine-capital.md` - Point Nine
    - `index-ventures.md` - Index Ventures
    - `matrix-partners.md` - Matrix Partners

- **Specialized/Emerging:**
    - `aix-ventures.md` - AIX Ventures
    - `character-vc.md` - Character VC
    - `context-ventures.md` - Context Ventures
    - `obvious-ventures.md` - Obvious Ventures
    - `pioneer-fund.md` - Pioneer Fund
    - `soma-capital.md` - Soma Capital
    - `south-park-commons.md` - South Park Commons
    - `standard-capital.md` - Standard Capital
    - `vermilion-fund.md` - Vermilion Fund

See `marketing/INDEX.md` for complete marketing directory listing.

### 🔌 Integrations

Third-party service integrations and setup guides.

#### Stripe Payments

- `integrations/stripe-setup.md` - **START HERE** - Setup guide
- `integrations/stripe-integration-overview.md` - Integration overview
- `integrations/STRIPE_IMPLEMENTATION_SUMMARY.md` - Implementation summary
- `integrations/stripe-implementation-checklist.md` - Implementation checklist
- `integrations/stripe-testing-plan.md` - Testing strategy

### 🚀 Deployment

Production deployment guides and checklists.

- `deployment/DEPLOYMENT_CHECKLIST.md` - **ESSENTIAL** - Pre-deployment checklist
- `deployment/VERCEL_DEPLOYMENT.md` - Vercel deployment guide

### ✍️ Content & Blogs

Blog posts and content marketing materials.

- `blogs/why-I-built-buildos.md` - Founder story
- `blogs/how-to-brain-dump-effectively.md` - User guide
- `blogs/ceo-lvl-productivity.md` - Productivity insights
- `blogs/todays-blog.md` - Latest blog post
- `writing/john-mcphee-editing.md` - Writing techniques

### 🧠 Philosophy & Principles

Core philosophy and psychological frameworks behind BuildOS design decisions.

- `philosophy/braindump-psychology.md` - **ESSENTIAL** - Psychological foundation of brain dump system

### 🔬 Research & Analysis

Research findings and system investigations.

- `research/2025-01-07_brain-dump-flow-analysis.md` - Brain dump analysis
- `research/2025-01-08_google_calendars_for_projects.md` - Calendar research

### 🗑️ Maintenance & Cleanup

- `INDEX-GAPS.md` - Documentation gaps analysis
- `OUTDATED_FILES_TO_REMOVE.md` - Files marked for deletion

---

## 🔍 Search Guide

### Quick Search Keywords

Use Ctrl+F (Cmd+F) to search for these common topics:

**Core Features:**

- `brain dump` - Brain dump system documentation
- `psychology` - Psychological foundations
- `philosophy` - Core principles and beliefs
- `calendar` - Google Calendar integration
- `project` - Project management features
- `phase` - Phase-based planning
- `daily brief` - Daily brief generation
- `recurring` - Recurring tasks

**Technical:**

- `architecture` - System architecture
- `database` - Database schema
- `supabase` - Supabase integration
- `stripe` - Payment processing
- `svelte` - Svelte 5 components
- `prompt` - AI prompts
- `llm` - Language model testing

**Business:**

- `investor` - Investor profiles
- `fundraising` - Fundraising strategy
- `brand` - Brand guidelines
- `marketing` - Marketing strategy
- `war room` - Strategic planning

**Development:**

- `deployment` - Deployment guides
- `testing` - Testing documentation
- `audit` - Code audits
- `git` - Git workflow
- `feature` - Feature planning

---

## 📂 Directory Structure (NEW)

```
/docs/
├── 📚 technical/           - ALL TECHNICAL DOCUMENTATION
│   ├── api/               - API documentation (auto-generated)
│   │   ├── endpoints/     - Endpoint specs
│   │   ├── routes-reference.md
│   │   ├── types.md
│   │   └── templates.md
│   ├── architecture/      - System design
│   │   ├── decisions/     - ADRs
│   │   └── *.md          - Architecture docs
│   ├── components/        - UI components
│   │   ├── brain-dump/
│   │   └── projects/
│   ├── database/         - Schema & migrations
│   ├── deployment/       - Production ops
│   │   └── runbooks/     - Operational procedures
│   ├── development/      - Dev guides
│   ├── services/         - Service layer
│   └── testing/          - Test strategy
│
├── 💼 business/           - Business & strategy
│   ├── strategy/         - Strategic planning
│   └── war-room/         - Executive planning
│
├── 👤 user-guide/         - End user docs
│   ├── features/         - Feature guides
│   └── *.md             - Support docs
│
├── 📝 prompts/            - AI prompts
│   ├── architecture.md   - System design
│   └── brain-dump/       - All brain dump prompts
│       ├── new-project/
│       └── existing-project/
│
├── 🗄️ archive/            - Old/archived docs
│   ├── marketing/        - Investor profiles
│   ├── brain-dump-docs/  - Old brain dump docs
│   └── outdated-development/
│
└── [Legacy folders being phased out]
    ├── agents/
    ├── audits/
    ├── blogs/
    ├── design/
    ├── development/
    ├── integrations/
    ├── marketing/
    ├── philosophy/
    └── research/
```

---

## 💡 Navigation Tips

1. **Start with Quick Start** - Essential docs for new team members
2. **Use Common Tasks table** - Quick reference for frequent needs
3. **Search keywords** - Ctrl+F for rapid navigation
4. **Check parent directories** - Related docs are grouped together
5. **Follow cross-references** - Docs often link to related content

---

## 🆘 Can't Find Something?

1. **Search this document** - Use Ctrl+F with different keywords
2. **Check subdirectories** - Navigate to parent folders for related docs
3. **Look in research/** - Recent investigations and findings
4. **Check development/plans/** - Upcoming features and changes
5. **Review audits/** - System analysis and improvements

---

## 📋 Documentation Standards

When adding new documentation:

1. **Use clear filenames** - Descriptive, lowercase, hyphenated
2. **Add to this index** - Keep start-here.md updated
3. **Include metadata** - Date, author, purpose at top of file
4. **Cross-reference** - Link to related documentation
5. **Mark status** - Indicate if draft, complete, or outdated

---

_Last Updated: September 27, 2025_
_Index Version: 3.0_
_Total Documents: 250+ files_
_Maintainer: BuildOS Team_
