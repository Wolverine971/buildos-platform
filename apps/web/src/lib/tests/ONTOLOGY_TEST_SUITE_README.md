<!-- apps/web/src/lib/tests/ONTOLOGY_TEST_SUITE_README.md -->

# Ontology Testing Suite - README

**Created**: 2025-11-12
**Purpose**: Comprehensive testing suite for BuildOS ontology system with agentic chat integration
**Location**: `/apps/web/src/lib/tests/test-onto-*.md`

## Overview

This testing suite validates the **complete ontology system** including:

- All 25+ `onto_*` database tables
- Agentic chat context flows and transitions
- Template-driven project creation
- Multi-entity relationships via `onto_edges`
- All CRUD operations via AI agent tools

## Test Files

### 1. `test-onto-project-creation-writer.md` ✅

**Persona**: Writer/Author
**Templates**: `writer.book`, `writer.blog`, `writer.article`

**Covers**:

- Novel writing projects with worldbuilding
- Blog content series
- Chapter writing and revision workflows
- Publishing plans with milestones
- Risk assessment (writer's block, motivation)
- Decision tracking (publishing platforms)
- Document types (character profiles, worldbuilding docs)

**Entity Types Tested**:

- onto_projects, onto_goals, onto_plans, onto_tasks
- onto_documents (creative types)
- onto_outputs (manuscript, published content)
- onto_milestones (draft complete, beta readers, launch)
- onto_risks (creative/motivational)
- onto_decisions (publishing strategy)

**Key Scenarios**:

1. Comprehensive book project creation
2. Simple blog series creation
3. Update tasks in workspace mode
4. Progress tracking and chapter completion
5. Risk and requirements in audit mode
6. Publishing milestones and decisions

---

### 2. `test-onto-project-creation-developer.md` ✅

**Persona**: Software Developer/Engineer
**Templates**: `developer.app`, `developer.saas`, `developer.feature`

**Covers**:

- SaaS application development
- Sprint planning with velocity tracking
- Bug fixes and feature implementation
- Technical decision records
- Release planning (alpha, beta, GA)
- Performance metrics and monitoring
- Code quality and technical debt

**Entity Types Tested**:

- onto_projects (technical props, tech_stack)
- onto_requirements (technical, performance, compliance)
- onto_metrics (velocity, latency, uptime, error rates)
- onto_metric_points (time-series tracking)
- onto_decisions (architectural, infrastructure)
- onto_risks (security, technical)
- onto_milestones (sprints, releases, code freeze)

**Key Scenarios**:

1. Full-stack SaaS project creation
2. Bug tracking and feature tasks
3. Sprint planning with story points
4. Technical decision documentation
5. Multi-stage release management
6. Performance monitoring setup

---

### 3. `test-onto-project-creation-designer.md` ✨ NEW

**Persona**: Designer / Creative Professional
**Templates**: `designer.brand`, `designer.product`, `designer.ux`

**Covers**:

- Brand identity design projects
- Design system creation and component libraries
- UX/UI design workflows
- Client feedback and revision cycles
- Design asset delivery (multiple formats)
- Accessibility compliance (WCAG)
- Portfolio case studies

**Entity Types Tested**:

- onto_projects (design-focused props)
- onto_goals (deliverables, client approval, accessibility)
- onto_plans (discovery, concept, execution, delivery)
- onto_tasks (design, revision, export types)
- onto_requirements (accessibility, technical formats, aesthetics)
- onto_documents (brief, moodboard, guidelines, specifications)
- onto_outputs (logo packages, design libraries, UI mockups)
- onto_milestones (presentations, reviews, deliveries)
- onto_metrics (component progress, accessibility compliance)
- onto_decisions (design direction, tool selection)

**Key Scenarios**:

1. Complete brand identity project creation
2. Design system with component library
3. Client revision and iteration management
4. Design asset delivery with formats/sizes
5. Design metrics and portfolio documentation
6. Accessibility and quality tracking

---

### 4. `test-onto-project-creation-event-planner.md` ✨ NEW

**Persona**: Event Planner / Event Coordinator
**Templates**: `event.conference`, `event.wedding`, `event.corporate`

**Covers**:

- Corporate conference planning (500 attendees)
- Wedding planning and coordination
- Vendor management and contracts
- Event day timeline management
- Multi-day event scheduling
- Budget tracking and payment milestones
- Post-event analysis and metrics

**Entity Types Tested**:

- onto_projects (event-specific props: attendees, venue, budget)
- onto_goals (attendance, budget, quality)
- onto_plans (venue, programming, catering, marketing)
- onto_tasks (vendor booking, logistics, coordination)
- onto_requirements (venue capacity, dietary options, deadlines)
- onto_documents (timeline, vendor lists, attendee packets)
- onto_outputs (event program, floor plans)
- onto_milestones (contracts, registration, event dates)
- onto_actors (event staff, vendors, coordinators)
- onto_events (detailed event day schedule)
- onto_metrics (registration count, budget, attendance)
- onto_risks (venue availability, speaker issues, weather)

**Key Scenarios**:

1. Large conference with speakers and sponsors
2. Wedding planning with ceremony and reception
3. Vendor tracking and payment schedules
4. Detailed event day timeline creation
5. Guest management and RSVPs
6. Post-event success metrics and insights

---

### 5. `test-onto-project-creation-researcher.md` ✨ NEW

**Persona**: Researcher / Academic / Scientist
**Templates**: `research.study`, `research.paper`, `research.experiment`

**Covers**:

- Longitudinal research studies
- Systematic literature reviews (PRISMA)
- IRB/ethics approval processes
- Quantitative and qualitative data collection
- Statistical and thematic analysis
- Research team collaboration and authorship
- Publication and peer review process
- Research compliance and reporting

**Entity Types Tested**:

- onto_projects (research methodology, sample sizes)
- onto_goals (IRB approval, recruitment, publication)
- onto_plans (ethics, design, recruitment, data collection, analysis, publication)
- onto_tasks (IRB application, instrument development, analysis, manuscript)
- onto_requirements (IRB approval, data security, validated instruments, retention)
- onto_documents (IRB application, protocol, instruments, codebooks, manuscripts)
- onto_outputs (datasets, journal articles, conference presentations)
- onto_milestones (approvals, data collection quarters, submissions)
- onto_metrics (recruitment, response rate, retention, literature reviewed)
- onto_metric_points (time-series data across study period)
- onto_risks (IRB delays, low recruitment, attrition, data breach)
- onto_sources (academic papers, validated instruments)
- onto_actors (co-investigators, research assistants, team members)
- onto_assignments (role distribution across team)
- onto_permissions (data access control)
- onto_insights (research findings and analysis)

**Key Scenarios**:

1. Complete research study with mixed methods
2. Systematic literature review with PRISMA
3. Data analysis with statistical and qualitative methods
4. Research team management and authorship
5. Manuscript submission and peer review
6. Ethics compliance and annual reporting

---

### 6. `test-onto-project-creation-business-owner.md` ✨ NEW

**Persona**: Small Business Owner / Entrepreneur
**Templates**: `business.startup`, `business.product_launch`, `business.operations`

**Covers**:

- E-commerce product launches
- Restaurant operations improvement
- Revenue and customer metrics tracking
- Investor pitches and fundraising
- Vendor and supplier management
- FDA and business compliance
- Team expansion and hiring
- Business KPI tracking over time

**Entity Types Tested**:

- onto_projects (business model, budget, revenue targets)
- onto_goals (launch, revenue, compliance, funding)
- onto_plans (product dev, branding, ecommerce, marketing, fundraising)
- onto_tasks (sourcing, vendor selection, system setup, sales)
- onto_requirements (compliance, certifications, security, budget caps)
- onto_documents (business plans, brand guidelines, pitch decks, financials)
- onto_outputs (product SKUs, websites, marketing assets)
- onto_milestones (supplier contracts, launches, funding rounds)
- onto_metrics (revenue, CAC, retention, budget tracking)
- onto_metric_points (monthly revenue tracking, growth metrics)
- onto_risks (regulatory delays, supply chain, budget overruns, market risks)
- onto_decisions (platform selection, fundraising strategy, vendor choices)
- onto_insights (growth trends, efficiency improvements, performance analysis)

**Key Scenarios**:

1. Product launch with e-commerce setup
2. Operations improvement and expansion
3. Monthly revenue and KPI tracking
4. Investor pitch preparation and fundraising
5. Supplier management and contracts
6. Business compliance (FDA, food safety)

---

### 7. `test-onto-multi-entity-comprehensive.md` ✅

**Persona**: Product Launch (All Personas)
**Templates**: Multiple types across domains

**Covers**:

- **ALL ontology entity types in single project**
- Complete product launch scenario
- Signal → Insight pipeline
- Team assignments and permissions
- Time-series metric tracking
- Document and output versioning
- Calendar event scheduling

**Entity Types Tested** (COMPLETE COVERAGE):

- ✅ onto_projects, onto_goals, onto_plans, onto_tasks
- ✅ onto_outputs, onto_documents, onto_requirements
- ✅ onto_milestones, onto_risks, onto_metrics
- ✅ onto_metric_points (time-series)
- ✅ onto_decisions, onto_sources
- ✅ onto_signals, onto_insights
- ✅ onto_actors, onto_assignments, onto_permissions
- ✅ onto_document_versions, onto_output_versions
- ✅ onto_events (calendar integration)
- ✅ onto_edges (all relationship types)
- ✅ onto_tools, onto_facet_definitions, onto_facet_values

**Key Scenarios**:

1. **Comprehensive creation** - All entity types in one call
2. **Signal tracking** - External events and competitor intelligence
3. **Insights generation** - Derived analysis from signals
4. **Team management** - Actor assignments and role-based permissions
5. **Metric tracking** - Time-series data collection
6. **Versioning** - Document and output version history
7. **Calendar integration** - Recurring events and schedules

---

### 8. `test-onto-context-flow.md` ✅

**Focus**: Context transitions and workspace modes
**Templates**: N/A (focuses on flow, not creation)

**Covers**:

- Context type transitions
- Workspace mode behaviors
- Session persistence
- Tool availability per context
- Invalid transition handling
- Multi-project switching

**Context Types Tested**:

- `global` - Cross-project operations
- `project_create` - New project creation flow
- `project` - Working within project workspace
- `project_audit` - Specialized audit/review mode
- `project_forecast` - Scenario planning (not implemented yet)
- `calendar` - Calendar planning mode
- `daily_brief_update` - Brief configuration (not fully tested)
- Project focus (task/goal/plan/document/etc) within `project` context

**Key Scenarios**:

1. **Global → Project Create → Project** - Creation flow
2. **Project ↔ Audit** - Switching to specialized mode
3. **Project ↔ Project** - Multi-project switching
4. **Project focus shifts** - Task/goal/document focus within project context
5. **Session restoration** - Context persistence
6. **Calendar operations** - Cross-project scheduling
7. **Invalid transitions** - Safe routing paths

---

## Ontology Entity Reference

### Core Entities

| Table         | Purpose              | Test Coverage     |
| ------------- | -------------------- | ----------------- |
| onto_projects | Root work units      | ✅ All test files |
| onto_tasks    | Actionable items     | ✅ All test files |
| onto_plans    | Task groupings       | ✅ All test files |
| onto_goals    | Strategic objectives | ✅ All test files |

### Deliverables

| Table          | Purpose                | Test Coverage               |
| -------------- | ---------------------- | --------------------------- |
| onto_outputs   | Versioned deliverables | ✅ Multi-entity + Writer    |
| onto_documents | Documentation          | ✅ Multi-entity + Developer |

### Planning & Tracking

| Table              | Purpose             | Test Coverage               |
| ------------------ | ------------------- | --------------------------- |
| onto_requirements  | Project constraints | ✅ Multi-entity + Developer |
| onto_milestones    | Time markers        | ✅ Writer + Developer       |
| onto_risks         | Risk assessment     | ✅ Writer + Developer       |
| onto_metrics       | Measurements        | ✅ Developer + Multi-entity |
| onto_metric_points | Time-series data    | ✅ Multi-entity             |

### Knowledge Management

| Table          | Purpose             | Test Coverage         |
| -------------- | ------------------- | --------------------- |
| onto_decisions | Decision records    | ✅ Writer + Developer |
| onto_sources   | External references | ✅ Multi-entity       |
| onto_signals   | External events     | ✅ Multi-entity       |
| onto_insights  | Derived analysis    | ✅ Multi-entity       |

### Team & Access

| Table            | Purpose             | Test Coverage   |
| ---------------- | ------------------- | --------------- |
| onto_actors      | Users and AI agents | ✅ Multi-entity |
| onto_assignments | Role assignments    | ✅ Multi-entity |
| onto_permissions | Access control      | ✅ Multi-entity |

### Versioning

| Table                  | Purpose          | Test Coverage   |
| ---------------------- | ---------------- | --------------- |
| onto_document_versions | Document history | ✅ Multi-entity |
| onto_output_versions   | Output versions  | ✅ Multi-entity |

### Calendar

| Table           | Purpose                | Test Coverage            |
| --------------- | ---------------------- | ------------------------ |
| onto_events     | Scheduled events       | ✅ Multi-entity          |
| onto_event_sync | External calendar sync | ⚠️ Not tested (external) |

### Graph & System

| Table                  | Purpose              | Test Coverage                   |
| ---------------------- | -------------------- | ------------------------------- |
| onto_edges             | Entity relationships | ✅ All test files (implicit)    |
| onto_templates         | Template definitions | ✅ Implicit (via instantiation) |
| onto_tools             | Available tools      | ✅ Context flow                 |
| onto_facet_definitions | Facet taxonomy       | ✅ Implicit                     |
| onto_facet_values      | Facet value catalog  | ✅ Implicit                     |

---

## How to Use These Tests

### For Manual Testing

1. **Start AgentChatModal** in dev environment
2. **Select context type** from the test scenario (usually `project_create` or `global`)
3. **Copy user input** from test prompt
4. **Observe agent behavior**:
    - Tool calls made
    - Entities created
    - Context transitions
5. **Verify results** in database:

    ```sql
    -- Check project created
    SELECT * FROM onto_projects WHERE name LIKE '%Test Project%';

    -- Check all related entities
    SELECT * FROM onto_edges WHERE src_id = '[project_id]';
    SELECT * FROM onto_tasks WHERE project_id = '[project_id]';
    SELECT * FROM onto_goals WHERE project_id = '[project_id]';
    -- etc.
    ```

### For Automated Testing (Future)

These markdown tests can be converted to automated test cases:

```typescript
describe('Ontology Writer Tests', () => {
	it('should create complete novel project', async () => {
		const input = `I'm starting my first fantasy novel - 'The Last Ember'...`;
		const result = await agentChat.processMessage(input, {
			context_type: 'project_create'
		});

		// Verify project created
		expect(result.entities.projects).toHaveLength(1);
		expect(result.entities.projects[0].name).toContain('Last Ember');

		// Verify goals created
		expect(result.entities.goals).toHaveLength(2);

		// Verify plans created
		expect(result.entities.plans).toHaveLength(3);

		// Verify context shift
		expect(result.context_shifts).toHaveLength(1);
		expect(result.context_shifts[0].new_context).toBe('project');
	});
});
```

### For LLM Prompt Testing

Use these tests with `pnpm test:llm` (costs money - uses real OpenAI API):

```typescript
// apps/web/src/lib/tests/llm/ontology-creation.test.ts
import { describe, it, expect } from 'vitest';
import { testLLMPrompt } from './test-helpers';

describe('Ontology Project Creation - Writer', () => {
	it('should create book project with all entities', async () => {
		const userInput = `I'm starting my first fantasy novel - 'The Last Ember'...`;

		const result = await testLLMPrompt({
			systemPrompt: PROJECT_CREATE_SYSTEM_PROMPT,
			userMessage: userInput,
			tools: PROJECT_CREATE_TOOLS,
			expectedToolCalls: ['list_onto_templates', 'create_onto_project']
		});

		// Verify template search happened
		expect(result.toolCalls[0].function.name).toBe('list_onto_templates');
		expect(result.toolCalls[0].function.arguments).toContain('writer');

		// Verify project creation
		const projectCall = result.toolCalls.find(
			(tc) => tc.function.name === 'create_onto_project'
		);
		expect(projectCall).toBeDefined();

		const projectSpec = JSON.parse(projectCall.function.arguments);
		expect(projectSpec.project.name).toContain('Last Ember');
		expect(projectSpec.project.type_key).toBe('writer.book');
		expect(projectSpec.goals).toHaveLength(2);
		expect(projectSpec.plans).toHaveLength(3);
		expect(projectSpec.tasks).toHaveLength(4);
	});
});
```

---

## Test Coverage Matrix

| Feature             | Writer | Developer | Designer | Event | Research | Business | Multi-Entity | Context Flow |
| ------------------- | ------ | --------- | -------- | ----- | -------- | -------- | ------------ | ------------ |
| Project Creation    | ✅     | ✅        | ✅       | ✅    | ✅       | ✅       | ✅           | ✅           |
| Goals               | ✅     | ✅        | ✅       | ✅    | ✅       | ✅       | ✅           | -            |
| Plans               | ✅     | ✅        | ✅       | ✅    | ✅       | ✅       | ✅           | -            |
| Tasks               | ✅     | ✅        | ✅       | ✅    | ✅       | ✅       | ✅           | ✅           |
| Documents           | ✅     | ✅        | ✅       | ✅    | ✅       | ✅       | ✅           | -            |
| Outputs             | ✅     | ✅        | ✅       | ✅    | ✅       | ✅       | ✅           | -            |
| Requirements        | ✅     | ✅        | ✅       | ✅    | ✅       | ✅       | ✅           | -            |
| Milestones          | ✅     | ✅        | ✅       | ✅    | ✅       | ✅       | ✅           | -            |
| Risks               | ✅     | ✅        | -        | ✅    | ✅       | ✅       | ✅           | -            |
| Metrics             | -      | ✅        | ✅       | ✅    | ✅       | ✅       | ✅           | -            |
| Metric Points       | -      | -         | ✅       | ✅    | ✅       | ✅       | ✅           | -            |
| Decisions           | ✅     | ✅        | ✅       | -     | ✅       | ✅       | ✅           | -            |
| Sources             | -      | -         | -        | -     | ✅       | -        | ✅           | -            |
| Signals             | -      | -         | -        | -     | -        | -        | ✅           | -            |
| Insights            | -      | -         | -        | -     | ✅       | ✅       | ✅           | -            |
| Actors              | -      | -         | -        | ✅    | ✅       | -        | ✅           | -            |
| Assignments         | -      | -         | -        | ✅    | ✅       | -        | ✅           | -            |
| Permissions         | -      | -         | -        | -     | ✅       | -        | ✅           | -            |
| Document Versions   | -      | -         | -        | -     | -        | -        | ✅           | -            |
| Output Versions     | -      | -         | -        | -     | -        | -        | ✅           | -            |
| Events              | -      | -         | -        | ✅    | -        | -        | ✅           | -            |
| Context Transitions | -      | -         | -        | -     | -        | -        | -            | ✅           |
| Workspace Modes     | ✅     | ✅        | ✅       | ✅    | ✅       | ✅       | ✅           | ✅           |
| Template Selection  | ✅     | ✅        | ✅       | ✅    | ✅       | ✅       | ✅           | -            |
| Facet Inference     | ✅     | ✅        | ✅       | ✅    | ✅       | ✅       | ✅           | -            |

---

## What Changed from Old Tests

### Old Test: `test-braindump-prompts-writer.md`

**Limitations**:

- Only tested `projects` and `tasks` tables (legacy schema)
- No template system
- No context shifting
- No ontology entity types (goals, plans, documents, etc.)
- No relationship tracking (onto_edges)
- Simple CRUD operations only

### New Test Suite

**Improvements**:

- ✅ **All 25+ onto\_ tables** covered
- ✅ **Template-driven** creation
- ✅ **Context flow** and transitions
- ✅ **15 entity types** (projects, tasks, plans, goals, documents, outputs, requirements, milestones, risks, metrics, decisions, sources, signals, insights, events)
- ✅ **Graph relationships** via onto_edges
- ✅ **Multi-dimensional** facets (context, scale, stage)
- ✅ **FSM states** for lifecycle management
- ✅ **Versioning** for documents and outputs
- ✅ **Time-series** metric tracking
- ✅ **Team management** (actors, assignments, permissions)
- ✅ **Signal → Insight** pipeline
- ✅ **Workspace modes** (global, project, audit, task, calendar)

---

## Running the Tests

### Manual Testing

```bash
# Start dev server
pnpm dev

# Open AgentChatModal in browser
# Navigate to /admin/chat or click "Chat with AI"
# Follow test scenarios from markdown files
```

### LLM Testing (when implemented)

```bash
# Run all ontology tests (costs money!)
pnpm test:llm ontology

# Run specific test file
pnpm test:llm ontology-writer

# Run specific test case
pnpm test:llm ontology-writer -t "should create book project"
```

### Type Checking

```bash
# Verify type definitions for all entities
pnpm typecheck
```

---

## Expected Database State After Tests

After running all test scenarios, database should contain:

**Projects**: 4-6 test projects (writer, developer, multi-entity)
**Tasks**: 20-30 tasks across projects
**Goals**: 10-15 goals
**Plans**: 10-15 plans
**Documents**: 10-15 documents (various types)
**Outputs**: 5-10 outputs
**Requirements**: 5-10 requirements
**Milestones**: 15-20 milestones
**Risks**: 8-12 risks
**Metrics**: 5-10 metrics
**Metric Points**: 6+ time-series data points
**Decisions**: 5-8 decisions
**Sources**: 2-5 external sources
**Signals**: 2-5 signals
**Insights**: 1-3 insights
**Actors**: 3-5 actors (user + team members)
**Assignments**: 2-5 role assignments
**Permissions**: 3-6 permission records
**Document Versions**: 1-2 versions
**Output Versions**: 1-2 versions
**Events**: 1-2 calendar events
**Edges**: 100+ relationships between entities

---

## Persona Coverage Summary

The test suite now covers **7 distinct personas** with diverse project types:

| Persona               | Project Types                | Key Differentiators                                 |
| --------------------- | ---------------------------- | --------------------------------------------------- |
| **Writer**            | Books, blogs, articles       | Creative workflows, publishing, worldbuilding       |
| **Developer**         | SaaS, apps, features         | Technical specs, sprints, metrics, releases         |
| **Designer** ✨       | Brand, UX, product design    | Client feedback, design assets, accessibility       |
| **Event Planner** ✨  | Conferences, weddings        | Vendors, timelines, budgets, multi-day schedules    |
| **Researcher** ✨     | Studies, papers, experiments | Ethics/IRB, data collection, analysis, publication  |
| **Business Owner** ✨ | Product launch, operations   | Revenue, suppliers, compliance, investor pitches    |
| **Multi-Entity**      | All types                    | Comprehensive coverage of ALL ontology entity types |

### New Test Files Highlights

#### Designer Tests (`test-onto-project-creation-designer.md`)

- **Brand identity projects**: Logo, color palette, packaging, guidelines
- **Design systems**: Component libraries, accessibility (WCAG), design tokens
- **Client workflows**: Revisions, feedback cycles, presentations
- **Asset delivery**: Multiple formats, sizes, file types
- **Portfolio tracking**: Case studies, metrics, client satisfaction

#### Event Planner Tests (`test-onto-project-creation-event-planner.md`)

- **Large conferences**: 500 attendees, speakers, sponsors, multi-track schedules
- **Wedding coordination**: Ceremony, reception, vendors, guest management
- **Vendor contracts**: Payment schedules, deliverables, booking
- **Event timelines**: Minute-by-minute schedules for event day
- **Post-event analysis**: Attendance, budget variance, satisfaction metrics

#### Researcher Tests (`test-onto-project-creation-researcher.md`)

- **Research studies**: Longitudinal, mixed-methods, data collection
- **Literature reviews**: Systematic reviews, PRISMA methodology, screening
- **IRB/ethics**: Compliance tracking, approvals, annual reporting
- **Team collaboration**: Co-investigators, authorship, role distribution
- **Publication process**: Manuscript submission, peer review, revisions

#### Business Owner Tests (`test-onto-project-creation-business-owner.md`)

- **Product launches**: E-commerce, supplier sourcing, FDA compliance
- **Operations improvement**: Efficiency metrics, system implementation
- **Revenue tracking**: Monthly MRR, CAC, retention, growth trends
- **Fundraising**: Investor pitches, financial projections, equity deals
- **Business compliance**: Regulatory requirements, certifications

## Next Steps

1. **Implement LLM Test Runner**: Create automated test harness
2. **Add More Personas**: Coach/consultant, student, healthcare professional
3. **Edge Case Coverage**: Error handling, validation failures
4. **Performance Testing**: Large projects with 100+ tasks
5. **Integration Tests**: Full end-to-end flows
6. **Regression Suite**: Automated on every PR

---

## Contributing

When adding new ontology features:

1. **Update test files** with new scenarios
2. **Add entity coverage** in multi-entity test
3. **Document context behavior** in context flow test
4. **Update this README** with new tables/features
5. **Run manual tests** to verify behavior
6. **Create LLM tests** when test runner is ready

---

## Questions or Issues

For questions about these tests:

- Check `/apps/web/docs/features/ontology/README.md`
- Check `/apps/web/CLAUDE.md` for development patterns
- Review actual implementations in `/apps/web/src/lib/services/agentic-chat/`

For bugs or improvements:

- Create issue with label `ontology` and `testing`
- Reference specific test file and scenario
- Include actual vs expected behavior
