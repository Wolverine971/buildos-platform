# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📚 Documentation System

**START HERE**: `/docs/start-here.md` is your comprehensive documentation index with:

- Quick start guides for new developers
- Common tasks reference table
- Complete documentation structure and organization
- Search guide for finding specific information

All technical documentation is organized under `/docs/`:

- `/docs/technical/` - All technical documentation (architecture, API, development, deployment)
- `/docs/prompts/` - AI prompt templates and architecture
- `/docs/business/` - Business strategy and planning
- `/docs/user-guide/` - End user documentation
- `/docs/archive/` - Archived/outdated documentation

### Feature-Specific Documentation

#### 🧭 Quick Navigation

- **[NAVIGATION INDEX](/apps/web/docs/NAVIGATION_INDEX.md)** - Complete guide to finding any documentation quickly

#### Major Features

- **[Ontology System](/apps/web/docs/features/ontology/README.md)** - Template-driven entity management system
    - **[Data Models](/apps/web/docs/features/ontology/DATA_MODELS.md)** - Complete database schema (31KB, 15 tables)
    - **[Implementation Summary](/apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md)** - CRUD operations status
    - Components: `/src/lib/components/ontology/`
    - API Endpoints: `/src/routes/api/onto/`
    - **Key Features:** Tasks, Plans, Goals, Documents, FSM state machines, template inheritance

- **[Modal Components](/apps/web/docs/technical/components/modals/README.md)** - Comprehensive modal system
    - **[Quick Reference](/apps/web/docs/technical/components/modals/QUICK_REFERENCE.md)** - Usage cheatsheet
    - **[Visual Guide](/apps/web/docs/technical/components/modals/VISUAL_GUIDE.md)** - Diagrams & layouts
    - **[Technical Analysis](/apps/web/docs/technical/components/modals/TECHNICAL_ANALYSIS.md)** - Deep dive
    - Components: `/src/lib/components/ui/Modal.svelte`, `/src/lib/components/ui/FormModal.svelte`

- **[Notification System](../../NOTIFICATION_SYSTEM_DOCS_MAP.md)** - Generic stackable notification system
    - **[Documentation Map](../../NOTIFICATION_SYSTEM_DOCS_MAP.md)** - START HERE - Complete guide to all docs
    - [Implementation Summary](../../NOTIFICATION_SYSTEM_IMPLEMENTATION.md) - Phase 1 complete, API reference, bug fixes
    - [Original Specification](../../generic-stackable-notification-system-spec.md) - Full technical spec and architecture
    - [Component README](/src/lib/components/notifications/README.md) - Quick reference and code examples
    - Components: `/src/lib/components/notifications/`
    - **Important:** See Svelte 5 Map reactivity patterns for store development

## 🚀 BuildOS Core Concepts

### What is BuildOS?

BuildOS is an AI-powered productivity platform that transforms unstructured thoughts into actionable plans. It's designed for anyone struggling with disorganization who needs to get organized—from ADHD minds to overwhelmed professionals. The system's innovation lies in its "brain dump" approach - users write stream-of-consciousness thoughts, and AI automatically extracts projects, tasks, and context.

## Essential Commands

### Development

```bash
# Start development server with type checking in parallel (recommended)
pnpm run dev:split

# Quick dev server (no type checking)
pnpm run dev:fast

# Full development server
pnpm run dev
```

### Testing

```bash
# Run all unit tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run LLM tests (costs money - uses real OpenAI API)
pnpm run test:llm

# Run a single test file
pnpm run test path/to/test.test.ts
```

### Code Quality

```bash
# Type checking and validation
pnpm run check

# Lint and auto-fix issues
pnpm run lint:fix

# Format code with Prettier
pnpm run format

# Full pre-push validation (runs check, test, lint, and build)
pnpm run pre-push
```

### Build & Deploy

```bash
# Production build
pnpm run build:prod

# Preview production build locally
pnpm run preview
```

## 🧠 Core System: Brain Dump Flow

### The Brain Dump Journey

1. **User Input** → User writes unstructured thoughts in the brain dump modal
2. **Processing** → AI processes the dump in two stages:
    - **Context Extraction**: Understanding the overall intent and project context
    - **Task Extraction**: Identifying specific actionable items
3. **Clarification** → AI asks smart questions to fill gaps (optional)
4. **Creation** → System creates/updates projects and tasks
5. **Organization** → Tasks are grouped into phases and optionally scheduled

### Key Brain Dump Files

```typescript
// Core brain dump components
src/lib/components/brain-dump/
  ├── BrainDumpModal.svelte           // Main input interface
  ├── BrainDumpProcessingNotification.svelte // Progress feedback
  └── BrainDumpQuestions.svelte       // AI clarification questions

// Processing logic
src/lib/utils/
  ├── braindump-processor.ts          // Main processor
  ├── braindump-processor-stream-short.ts // Short dump handler
  └── braindump-validation.ts         // Input validation

// Services
src/lib/services/
  ├── braindump.service.ts            // Database operations
  ├── braindump-background.service.ts // Background processing
  └── promptTemplate.service.ts       // AI prompt templates

// API endpoints
src/routes/api/braindumps/
  ├── stream/+server.ts               // Long brain dump endpoint
  └── stream-short/+server.ts         // Short brain dump endpoint
```

### Brain Dump Processing Types

#### Long Brain Dump (Default)

- For comprehensive project planning
- Extracts full context and multiple tasks
- Creates project structure with phases
- Can schedule tasks on calendar

#### Short Brain Dump

- Quick task capture for existing projects
- Minimal context extraction
- Adds tasks to current project phase
- Faster processing time

## 📊 Project Management System

### Project Structure

```typescript
interface Project {
	id: string;
	name: string;
	description: string;
	context: string; // Rich context from brain dumps
	status: 'planning' | 'active' | 'completed';
	phases: Phase[]; // Logical groupings of tasks
	calendar_id?: string; // Optional Google Calendar
}

interface Phase {
	id: string;
	name: string;
	order: number;
	tasks: Task[];
	target_date?: Date;
}
```

### Key Project Files

```typescript
// Project UI
src/routes/projects/
  ├── +page.svelte                    // Project list
  └── [slug]/+page.svelte             // Project detail view

// Services
src/lib/services/
  ├── project.service.ts              // CRUD operations
  ├── realtimeProject.service.ts     // Real-time updates
  └── phase-generation/               // Phase creation strategies
      ├── orchestrator.ts
      └── strategies/

// Components
src/lib/components/projects/
  ├── ProjectCard.svelte
  ├── ProjectHeader.svelte
  ├── TaskList.svelte
  └── PhaseManager.svelte
```

### Project Features

- **Auto-creation**: Projects created from brain dumps
- **Context preservation**: Maintains conversation history
- **Phase organization**: Tasks grouped logically
- **Calendar integration**: Optional Google Calendar per project
- **Real-time sync**: Live updates across devices

## Architecture Overview

### Tech Stack

- **Frontend**: SvelteKit 2+ with Svelte 5 (uses runes)
- **Database**: Supabase (PostgreSQL with RLS)
- **Auth**: Supabase Auth with Google OAuth
- **AI**: OpenAI API with streaming support
- **Payments**: Stripe integration (optional via ENABLE_STRIPE flag)
- **Deployment**: Vercel with serverless functions

### Key Service Layers

#### Phase Generation System (`src/lib/services/phase-generation/`)

- **Orchestrator**: Controls the entire phase generation flow
- **Strategies**: Different algorithms for phase creation
    - `base-strategy.ts`: Abstract base class
    - `phases-only.strategy.ts`: Simple phase generation
    - `schedule-in-phases.strategy.ts`: Phase generation with calendar scheduling
    - `calendar-optimized.strategy.ts`: Advanced calendar-aware generation

#### Brain Dump Processing (Detailed)

##### Processing Pipeline

1. **Validation** (`braindump-validation.ts`)
    - Check input length and format
    - Verify user permissions
    - Rate limiting checks

2. **Dual Processing** (Superior accuracy)
    - **Stage 1 - Context**: Extract project intent, goals, constraints
    - **Stage 2 - Tasks**: Extract specific action items with context
    - Files: `docs/prompts/*/dual-processing/`

3. **Question Generation** (Optional)
    - AI identifies information gaps
    - Generates clarifying questions
    - User responses improve task quality

4. **Project/Task Creation**
    - New project or update existing
    - Create phases based on strategy
    - Generate tasks with priorities
    - Optional calendar scheduling

##### Processing Strategies

- `phases-only.strategy.ts`: Basic phase creation
- `schedule-in-phases.strategy.ts`: With calendar integration
- `calendar-optimized.strategy.ts`: Smart scheduling around commitments

#### Daily Brief System (`src/lib/services/dailyBrief/`)

- **Generator**: Creates AI-powered daily summaries
- **Email Sender**: Handles email delivery via Nodemailer
- **Stream Handler**: Real-time streaming of brief generation
- **Repository**: Database operations for briefs

#### Calendar Integration

- **Service**: `calendar-service.ts` handles Google Calendar sync
- **Webhooks**: `calendar-webhook-service.ts` for real-time updates
- **Project Calendars**: Each project can have its own Google Calendar

### Database Schema

- Core tables defined in `src/lib/database.schema.ts`
- Key tables: `users`, `projects`, `tasks`, `brain_dumps`, `daily_briefs`
- Trial system with 14-day free trial
- Stripe integration tables for payments

### Route Structure

- `/api/` - REST API endpoints
- `/auth/` - Authentication flows
- `/admin/` - Admin dashboard (protected)
- `/projects/` - Project management UI
- Main app pages use `+page.server.ts` for server-side data loading

## Working with Brain Dumps

### Testing Brain Dump Changes

```bash
# Test prompt changes (uses real OpenAI API)
pnpm run test:llm

# Specific brain dump tests
pnpm run test src/lib/utils/braindump-validation.test.ts
```

### Common Brain Dump Tasks

#### Modifying Processing Logic

1. Check `src/lib/utils/braindump-processor.ts`
2. Update validation in `braindump-validation.ts`
3. Test with `pnpm run test:llm`

#### Updating AI Prompts

1. Edit templates in `src/lib/services/promptTemplate.service.ts`
2. Or edit raw prompts in `docs/prompts/*/`
3. Test with real API: `pnpm run test:llm`

#### Adding New Processing Strategy

1. Create strategy in `src/lib/services/phase-generation/strategies/`
2. Extend `base-strategy.ts`
3. Register in `orchestrator.ts`

## Important Patterns

### Svelte 5 Runes

This project uses Svelte 5 with the new runes syntax:

- Use `$state()` instead of `let` for reactive state
- Use `$derived()` for computed values
- Use `$effect()` instead of reactive statements

### UI & Design Patterns

**Design Philosophy:** BuildOS follows the **Inkprint Design System** - a printmaking-inspired aesthetic with semantic textures, warm accent colors, and high information density.

#### Core Design Requirements

1. **Responsive Design (Critical)**
    - ALL UI components must be responsive and work perfectly on mobile and desktop
    - Use mobile-first approach with Tailwind breakpoints: `sm:`, `md:`, `lg:`, `xl:`
    - Test on multiple screen sizes before considering a feature complete

2. **Light & Dark Mode (Required)**
    - Every component MUST support both light and dark modes
    - Use **semantic color tokens** (NOT hardcoded colors like `gray-200`, `slate-700`)
    - Maintain proper contrast ratios in both modes (WCAG AA: 4.5:1)

3. **High Information Density**
    - Maximize useful information visible without overwhelming the user
    - Use compact layouts with clear visual hierarchy
    - Progressive disclosure for complex information

4. **Design System Reference**
    - **ALWAYS consult:** `/apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`
    - This is the **PRIMARY** design reference for all new components

#### Inkprint Design System Quick Reference

**Semantic Color Tokens (Required):**

```css
/* Backgrounds */
bg-background       /* Page background */
bg-card             /* Card/panel backgrounds */
bg-muted            /* Muted/secondary backgrounds */
bg-accent           /* Accent color backgrounds */

/* Text */
text-foreground         /* Primary text */
text-muted-foreground   /* Secondary/muted text */
text-accent             /* Accent-colored text */
text-accent-foreground  /* Text on accent backgrounds */

/* Borders */
border-border       /* Standard borders */
```

**Inkprint Shadows:**

```css
shadow-ink          /* Standard elevation */
shadow-ink-strong   /* Modal/overlay elevation */
shadow-ink-inner    /* Inset shadows */
```

**Texture Classes (Synesthetic Feedback):**

```css
tx tx-frame tx-weak   /* Structural containers (cards, panels) */
tx tx-grain tx-weak   /* Interactive surfaces (buttons, inputs) */
tx tx-bloom tx-weak   /* Empty states, CTAs */
tx tx-static tx-weak  /* Error/warning states */
tx tx-pulse tx-weak   /* Loading/processing states */
```

**Interactive Elements:**

```css
pressable           /* Add to buttons for micro-interactions */
```

#### Example Component Pattern (Inkprint)

```svelte
<script lang="ts">
	let data = $state([]);
	let isLoading = $derived(data.length === 0);
</script>

<!-- Inkprint-styled card -->
<div class="p-4 sm:p-6 lg:p-8">
	<div class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak">
		<!-- Header -->
		<div class="px-4 py-3 border-b border-border">
			<h2 class="text-lg font-semibold text-foreground">Title</h2>
			<p class="text-sm text-muted-foreground">Description</p>
		</div>

		<!-- Body -->
		<div class="p-4">
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				<!-- Content -->
			</div>
		</div>

		<!-- Footer with action -->
		<div class="px-4 py-3 border-t border-border">
			<button
				class="px-4 py-2 bg-accent text-accent-foreground rounded-lg font-semibold shadow-ink pressable"
			>
				Action
			</button>
		</div>
	</div>
</div>
```

#### What NOT to Use (Deprecated)

Do NOT use these patterns from older design systems:

- ❌ Hardcoded colors: `text-gray-700`, `bg-slate-100`, `border-gray-200`
- ❌ Old gradient patterns: `bg-gradient-to-r from-blue-50 to-purple-50`
- ❌ Dithering classes: `dither-*`, industrial design patterns
- ❌ Scratchpad/workbench metaphors

Instead, use Inkprint semantic tokens and texture classes.

### API Patterns

#### Supabase Access in API Routes

In SvelteKit API routes (`+server.ts`), Supabase is accessed via the `locals` object:

```typescript
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals }) => {
	// ✅ Access Supabase from locals
	const supabase = locals.supabase;

	const { data, error } = await supabase.from('table_name').select('*');

	if (error) {
		return ApiResponse.error(error.message, 500);
	}

	return ApiResponse.success(data);
};
```

#### Admin Supabase Client

For privileged operations (bypassing RLS), use the admin client:

```typescript
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';

export const POST: RequestHandler = async ({ request, locals }) => {
	// ✅ Create admin client for privileged operations
	const adminSupabase = createAdminSupabaseClient();

	const { data, error } = await adminSupabase.from('table_name').insert({
		/* data */
	});

	if (error) {
		return ApiResponse.error(error.message, 500);
	}

	return ApiResponse.success(data);
};
```

#### API Response Wrapper (Required)

**ALWAYS use `ApiResponse` for API endpoint responses:**

```typescript
import { ApiResponse } from '$lib/utils/api-response';

// ✅ Success response
return ApiResponse.success(data, 200); // Default 200

// ✅ Error response
return ApiResponse.error('Something went wrong', 500);

// ✅ Validation error
return ApiResponse.error('Invalid input', 400);

// ✅ Not found
return ApiResponse.error('Resource not found', 404);
```

**Benefits:**

- Consistent response format across all endpoints
- Automatic error handling and logging
- Type-safe responses
- Easy debugging

### API Service Pattern

Services in `src/lib/services/base/api-service.ts` provide a consistent interface:

- Automatic error handling
- Retry logic
- Type-safe responses

### Real-time Updates

- Supabase real-time subscriptions for live updates
- Services like `realtimeProject.service.ts` handle subscriptions

### Prompt Templates

- All LLM prompts managed centrally in `promptTemplate.service.ts`
- Supports both new and existing project flows
- Dual processing for better accuracy

## Testing Strategy

### Unit Tests

- Located alongside source files as `*.test.ts`
- Use Vitest with happy-dom environment
- Mock Supabase and external services

### LLM Tests

- Special config in `vitest.config.llm.ts`
- Located in `src/lib/tests/llm/`
- Test actual prompt outputs (costs money)
- Run with `pnpm run test:llm`

## Environment Variables

Critical environment variables (see `.env.example`):

```
# Supabase (required)
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
PRIVATE_SUPABASE_SERVICE_KEY=

# Google OAuth (required)
PUBLIC_GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# OpenAI (required for AI features)
OPENAI_API_KEY=

# Stripe (optional - set ENABLE_STRIPE=false to disable)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

## Development Workflow

1. Always run `pnpm run dev:split` for development with type checking
2. Before committing: `pnpm run lint:fix` to fix formatting
3. Before pushing: `pnpm run pre-push` to validate everything
4. LLM prompt changes: Test with `pnpm run test:llm` (costs money)

### Documentation Updates (Critical for AI Agents)

**After making code changes, ALWAYS update documentation:**

1. **Feature Documentation** - Update relevant feature docs in `/apps/web/docs/features/[feature]/`
2. **Component Documentation** - Update component READMEs if you modify UI components
3. **API Documentation** - Update API docs in `/apps/web/docs/technical/api/` for endpoint changes
4. **Mark Progress** - Document what was completed, what works, and any known issues
5. **Update Checklists** - Check off completed items in implementation checklists

**Example Documentation Update Pattern:**

```markdown
## Progress Log

### 2025-11-03: Implemented Feature X

- ✅ Created API endpoint at `/api/feature-x/+server.ts`
- ✅ Added UI component `FeatureX.svelte` with responsive design
- ✅ Integrated with Supabase using `locals.supabase`
- ✅ Added dark mode support with proper contrast ratios
- ⚠️ Known Issue: Loading state needs spinner animation
- 📝 Next Steps: Add unit tests, update E2E tests

### Implementation Details

[Document key decisions, patterns used, etc.]
```

**Why This Matters:**

- Creates a clear audit trail of changes
- Helps other developers (and future AI agents) understand decisions
- Prevents duplicate work and confusion
- Documents tribal knowledge that would otherwise be lost

## Key Directories

### Documentation

- `/docs/start-here.md` - **START HERE** - Complete documentation index and navigation guide
- `/docs/technical/` - All technical documentation
    - `architecture/` - System architecture and design decisions (ADRs)
    - `api/` - API documentation and endpoint reference
    - `development/` - Development guides, workflows, and performance docs
    - `deployment/` - Deployment checklists and runbooks
    - `database/` - Schema, RLS policies, and indexes
    - `components/` - UI component standards and design system
    - `services/` - Service layer documentation
    - `testing/` - Testing strategy and patterns
- `/docs/prompts/` - AI prompt templates and architecture
- `/docs/business/` - Business strategy, brand, and communications
- `/docs/user-guide/` - End user guides and feature documentation
- `/docs/archive/` - Archived/outdated documentation (historical reference only)

### Core Code

- `/src/lib/services/` - **Business logic** (brain dumps, projects, calendar, etc.)
- `/src/lib/components/` - **UI components** (Svelte 5 with runes)
- `/src/routes/api/` - **API endpoints** (brain dumps, projects, calendar)
- `/src/lib/utils/` - **Utilities** (processors, validators, helpers)

### Brain Dump Specific

- `/src/lib/components/brain-dump/` - Brain dump UI components
- `/src/lib/utils/braindump-*.ts` - Processing logic and validation
- `/docs/prompts/brain-dump/` - Prompt templates organized by flow type
- `/src/routes/api/braindumps/` - API endpoints (stream and stream-short)

### Database

- `/supabase/migrations/` - Database schema changes and migrations
- `/src/lib/database.schema.ts` - TypeScript types for all tables
