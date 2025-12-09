<!-- apps/web/docs/features/ontology/INTELLIGENT_PROJECT_CREATION.md -->

# Intelligent Project Creation - AI Agent Implementation

**Status**: ✅ Complete
**Date**: 2025-11-04
**Feature**: Smart project creation with template selection and inference

## Overview

This document describes the intelligent project creation system that enables the AI agent to create complete ontology projects from natural language commands. The system uses template search, intelligent inference, and the clarifications pattern to create rich project structures with minimal user input.

## What Was Implemented

### 1. Template Search Tool (`list_onto_templates`)

**Purpose**: Enable the AI to discover and select appropriate project templates based on user intent.

**Tool Definition** (`tools.config.ts` lines 1493-1540):

- Searches templates by scope (project, task, plan, output, etc.)
- Filters by realm (writer, developer, coach, designer, etc.)
- Full-text search across names, type_keys, and descriptions
- Facet filtering (context, scale, stage)

**Parameters**:

- `scope`: Entity type (project, plan, task, output, document, goal, requirement)
- `realm`: Domain filter (optional)
- `search`: Text search (optional)
- `context`, `scale`, `stage`: Facet filters (optional)

**Handler** (`tool-executor.ts` lines 2300-2327):

- Builds query parameters from args
- Calls `GET /api/onto/templates` with filters
- Returns templates array with count and descriptive message

### 2. Project Creation Tool (`create_onto_project`)

**Purpose**: Create complete projects with all related entities using intelligent inference.

**Tool Definition** (`tools.config.ts` lines 1542-1764):

- Accepts full ProjectSpec structure
- All fields except `project.name` and `project.type_key` are optional
- Supports goals, plans, tasks, outputs, documents
- Includes clarifications array for missing critical info
- Metadata tracking for AI confidence and suggestions

**Key Features**:

- **Intelligent Inference**: LLM fills in details from user message
- **Template-Driven**: Uses type_key from template search
- **Rich Entities**: Can create goals, tasks, plans in one call
- **Clarifications Pattern**: Asks questions only when critical info is missing
- **Flexible Structure**: All child arrays are optional

**Handler** (`tool-executor.ts` lines 2329-2398):

- Checks for clarifications and returns them if present
- Builds ProjectSpec from provided args
- Calls `POST /api/onto/projects/instantiate`
- Returns project_id, entity counts, and descriptive summary

### 3. System Prompt Updates

**Location**: `chat-context-service.ts` lines 291-375

**Added Tier 5: PROJECT CREATION** section with:

#### Workflow Steps:

1. **Search templates** with appropriate filters
2. **Pick best template** from results
3. **Infer project details** from user message:
    - Extract name from intent
    - Expand description
    - Infer facets (context, scale, stage)
    - Default start_at to current date
4. **Add initial entities** if mentioned (goals, tasks, outputs)
5. **Use clarifications** only if critical info is missing
6. **Call create_onto_project** with inferred ProjectSpec

#### Example Workflows:

**Example 1: Rich Context**

```
User: "Create a book writing project"

Agent workflow:
1. list_onto_templates(scope="project", realm="writer", search="book")
2. Pick "project.writer.book" from results
3. create_onto_project({
     project: {
       name: "Book Writing Project",
       type_key: "project.writer.book",
       description: "Writing project for book creation",
       props: { facets: { context: "personal", scale: "large", stage: "discovery" } },
       start_at: "2025-11-04T00:00:00Z"
     },
     goals: [
       { name: "Complete first draft" },
       { name: "Publish book" }
     ]
   })
```

**Example 2: Client Project with Deadline**

```
User: "Start a new software project for client work with an MVP deadline in 3 months"

Agent workflow:
1. list_onto_templates(scope="project", realm="developer", search="software")
2. Pick "project.developer.software"
3. create_onto_project({
     project: {
       name: "Client Software Project",
       type_key: "project.developer.software",
       description: "Software development project for client with MVP focus",
       props: { facets: { context: "client", scale: "medium", stage: "planning" } },
       start_at: "2025-11-04T00:00:00Z",
       end_at: "2026-02-04T00:00:00Z"
     },
     goals: [
       { name: "Launch MVP in 3 months" }
     ],
     tasks: [
       { title: "Define MVP scope", priority: 5, state_key: "todo" }
     ]
   })
```

**Example 3: Vague Request (Needs Clarification)**

```
User: "Create a project"

Agent workflow:
create_onto_project({
  project: {
    name: "New Project",
    type_key: "project.generic"
  },
  clarifications: [
    {
      key: "project_type",
      question: "What kind of project would you like to create?",
      required: true,
      choices: ["Software Development", "Writing/Content", "Design", "Business", "Personal"]
    }
  ]
})

→ Returns clarifications to user
→ User answers
→ Agent calls create_onto_project again with full data
```

#### Key Principles Documented:

1. **BE PROACTIVE**: Infer as much as possible from user message
2. **DON'T ASK**: If you can reasonably infer the answer
3. **DO ASK**: Only if CRITICAL information is completely missing
4. **SEARCH FIRST**: Always use list_onto_templates to find right template
5. **RICH DEFAULTS**: Provide sensible defaults for facets, dates, etc.
6. **ADD ENTITIES**: If user mentions goals/tasks, include them in spec

### 4. Tool Configuration Updates

**ONTOLOGY_TOOLS Array** (`tools.config.ts` lines 1911-1946):

- Added `list_onto_templates` (TEMPLATES section)
- Added `create_onto_project` (CREATE section)

**TOOL_CATEGORIES** (`tools.config.ts` lines 1804-1868):

- Added `list_onto_templates` to `list` category
- Added `create_onto_project` to `ontology_action` category
- Increased `ontology_action` averageTokens from 200 to 250 (due to project creation complexity)

## Architecture

### Information Flow

```
User: "Create a book project"
    ↓
Agent analyzes intent
    ↓
list_onto_templates(scope="project", realm="writer", search="book")
    ↓
GET /api/onto/templates?scope=project&realm=writer&search=book
    ↓
Returns: [
  {
    type_key: "project.writer.book",
    name: "Book Writing Project",
    facet_defaults: { context: "personal", scale: "large", stage: "discovery" },
    ...
  }
]
    ↓
Agent picks best template
    ↓
Agent infers:
  - name: "Book Writing Project"
  - description: "Writing project for book creation"
  - facets: From template defaults
  - start_at: Current date
  - goals: [ "Complete first draft", "Publish book" ]
    ↓
create_onto_project({ project: {...}, goals: [...] })
    ↓
POST /api/onto/projects/instantiate
    ↓
instantiateProject(client, spec, userId)
    ↓
Creates:
  - onto_projects record
  - onto_goals records (2)
  - onto_edges linking them
    ↓
Returns: { project_id, counts: { goals: 2, ... } }
    ↓
Agent: "Created project 'Book Writing Project' (ID: abc-123) with 2 goals"
```

### Template Selection Logic

The AI agent should:

1. **Parse user intent** to identify:
    - Project type (software, writing, design, etc.)
    - Context (personal, client, commercial)
    - Scale indicators (small, large, epic)
    - Time horizon

2. **Search templates** with:
    - `scope="project"` (always for project creation)
    - `realm` inferred from project type
    - `search` with relevant keywords
    - Facet filters if explicitly mentioned

3. **Rank results** by:
    - Name/description match to user intent
    - Facet_defaults alignment with inferred context
    - Realm relevance

4. **Pick best match** and extract `type_key`

### Inference Strategy

The AI agent should infer:

**From Explicit Mentions**:

- Project type → realm and search terms
- Deadlines → end_at
- Client work → context="client"
- Personal project → context="personal"
- Specific goals → goals array
- Specific tasks → tasks array

**From Implicit Context**:

- No deadline mentioned → omit end_at (ongoing)
- No context mentioned → use template facet_defaults
- No scale mentioned → infer from time horizon or complexity
- No stage mentioned → default to "discovery" or "planning"

**Defaults to Apply**:

- `start_at`: Current date/time
- `state_key`: "draft" (from API default)
- `priority` (for tasks): 3 (medium)
- `state_key` (for tasks): "todo"

### Clarifications Pattern

**When to Add Clarifications**:

✅ **DO add clarifications when:**

- User says "create a project" with NO context whatsoever
- Multiple valid interpretations exist and choice is critical
- User explicitly asks for options ("What types of projects can I create?")

❌ **DON'T add clarifications when:**

- You can infer the project type from keywords ("book" → writing project)
- You can provide reasonable defaults ("personal" context if not specified)
- Missing info is non-critical (omit optional fields instead)

**Clarification Structure**:

```typescript
clarifications: [
	{
		key: 'unique_identifier', // Used to track answers
		question: 'Clear question?', // What to ask
		required: true, // Must be answered before creation
		choices: ['Option 1', 'Option 2'], // Optional predefined choices
		help_text: 'Additional context' // Optional help
	}
];
```

**Handling Clarification Responses**:

1. If clarifications are returned, present them to user
2. User provides answers
3. Agent makes second create_onto_project call with answers incorporated
4. No clarifications in second call → project created

## API Integration

### Template Search Endpoint

**Endpoint**: `GET /api/onto/templates`

**Query Parameters**:

- `scope`: Filter by entity type
- `realm`: Filter by domain
- `search`: Full-text search
- `context[]`: Facet filter (can appear multiple times)
- `scale[]`: Facet filter
- `stage[]`: Facet filter
- `sort`: Sort field (name, type_key, realm, scope, status)
- `direction`: Sort direction (asc, desc)

**Response**:

```json
{
  "success": true,
  "data": {
    "templates": [...],
    "grouped": { "writer": [...], "developer": [...] },
    "count": 25
  }
}
```

### Project Instantiation Endpoint

**Endpoint**: `POST /api/onto/projects/instantiate`

**Request Body**: Full ProjectSpec (see `onto.ts`)

**Response**:

```json
{
	"success": true,
	"data": {
		"project_id": "uuid",
		"counts": {
			"goals": 2,
			"requirements": 0,
			"plans": 1,
			"tasks": 5,
			"outputs": 3,
			"documents": 1,
			"edges": 12
		}
	}
}
```

**Error Handling**:

- 400: Validation error (missing required fields, invalid facets)
- 403: Permission denied
- 500: Internal server error

## Testing Scenarios

### Scenario 1: Book Writing Project (Rich Context)

**User Input**: "Create a book writing project"

**Expected Agent Behavior**:

1. Search templates for writing/book projects
2. Infer project name, context=personal, scale=large
3. Create project with inferred goals

**Expected Result**:

- Project created with type_key="project.writer.book"
- 2-3 default goals inferred
- No clarifications needed

### Scenario 2: Client Software Project with Deadline

**User Input**: "Start a new software project for client work with an MVP deadline in 3 months"

**Expected Agent Behavior**:

1. Search templates for software projects
2. Infer context=client, scale=medium, stage=planning
3. Calculate end_at = current date + 3 months
4. Add MVP-related goal and initial task

**Expected Result**:

- Project created with proper facets
- End date set correctly
- Goal and task created

### Scenario 3: Vague Request (Needs Clarification)

**User Input**: "Create a project"

**Expected Agent Behavior**:

1. Recognize insufficient context
2. Return clarifications asking for project type
3. Wait for user answer
4. Create project with user's choice

**Expected Result**:

- First call returns clarifications
- User answers
- Second call creates project

### Scenario 4: Project with Multiple Entities

**User Input**: "Create a design project for a client website with pages for home, about, and contact"

**Expected Agent Behavior**:

1. Search design templates
2. Infer context=client, realm=designer
3. Create outputs for each page mentioned
4. Add tasks for each output

**Expected Result**:

- Project created with design template
- 3 outputs created (home page, about page, contact page)
- Tasks linked to outputs

## Files Modified

### Tool Definitions

- `/apps/web/src/lib/chat/tools.config.ts`
    - Lines 1493-1540: `list_onto_templates` tool definition
    - Lines 1542-1764: `create_onto_project` tool definition
    - Lines 1813-1814: Added to TOOL_CATEGORIES.list
    - Lines 1857: Added to TOOL_CATEGORIES.ontology_action
    - Lines 1913, 1933: Added to ONTOLOGY_TOOLS array

### Tool Handlers

- `/apps/web/src/lib/chat/tool-executor.ts`
    - Lines 148-221: Interface definitions (ListOntoTemplatesArgs, CreateOntoProjectArgs)
    - Lines 502-508: Switch statement cases
    - Lines 2300-2327: `listOntoTemplates()` handler
    - Lines 2329-2398: `createOntoProject()` handler

### System Prompts

- `/apps/web/src/lib/services/chat-context-service.ts`
    - Lines 291-375: Tier 5: PROJECT CREATION documentation
    - Complete workflow, examples, and principles

## Known Limitations

1. **No Undo**: Project creation is permanent, no rollback
2. **No Draft Mode**: Projects are created immediately (state_key="draft" but committed to DB)
3. **No Validation Preview**: User doesn't see what will be created before confirmation
4. **Limited Entity Types**: Currently supports goals, plans, tasks, outputs, documents
    - Missing: requirements, sources, metrics, milestones, risks, decisions (defined in ProjectSpec but not emphasized in prompts)
5. **No Batch Creation**: Must create one project at a time
6. **Clarification Handling**: Requires manual re-invocation after user answers (not automatic)

## Future Enhancements

### Phase 2: Enhanced Inference

- [ ] Use conversation history to infer project type from recent messages
- [ ] Learn user's common patterns (always creates client projects, prefers certain scales)
- [ ] Suggest templates based on user's past project types

### Phase 3: Richer Entity Creation

- [ ] Add emphasis on requirements, sources, metrics in prompts
- [ ] Support milestones based on timeline mentions
- [ ] Auto-generate risks from project complexity

### Phase 4: Validation & Preview

- [ ] Return preview of what will be created before final confirmation
- [ ] Add "dry run" mode that shows spec without creating
- [ ] Validation warnings for unusual combinations (micro-epic mismatch, etc.)

### Phase 5: Advanced Features

- [ ] Batch project creation from list
- [ ] Clone/template from existing project
- [ ] Automatic clarification handling (agent re-calls after user answers)
- [ ] Smart defaults from user's organization settings

## Success Criteria

✅ **Implemented** (Phase 1 - 2025-11-04):

- [x] Template search tool with full filtering
- [x] Project creation tool with ProjectSpec support
- [x] Intelligent inference in system prompts
- [x] Clarifications pattern support
- [x] Rich example workflows
- [x] Tool handlers with proper API integration
- [x] Type-safe implementations
- [x] Documentation complete

✅ **Implemented** (Phase 2 - 2025-11-05):

- [x] Context-aware tool selection in `getContextTools()`
- [x] Template overview loading in `buildPlannerContext()`
- [x] Special system prompt for project_create context
- [x] Flow routing in `processUserMessage()` for project_create
- [x] Proper integration with existing agent planner flow
- [x] No syntax errors introduced (verified with pnpm check)

**Bugs Fixed:**

- [x] **Fixed #1**: Exported `extractTools` function from tools.config.ts (was causing import error)
- [x] **Fixed #2**: Tool loop issue - templates now pre-loaded in context, tool call optional
- [x] **Fixed #3**: Agent stopping after tool call - added explicit "IMMEDIATELY call create_onto_project" instructions
- [x] **Fixed #4**: API parameter mismatches - removed `meta` field from API payload, added missing `requirements`, added `description` to goals, added `state_key` to documents

⏳ **Testing Required**:

- [ ] End-to-end test: "Create a book project"
- [ ] End-to-end test: Client software project with deadline
- [ ] End-to-end test: Vague request with clarifications
- [ ] End-to-end test: Project with multiple entities
- [ ] Verify template search returns relevant results
- [ ] Verify facet inference accuracy
- [ ] Verify clarifications flow works

## Integration Points

### With Existing Systems

- **Template System**: Uses existing template catalog and resolver
- **Instantiation Service**: Calls existing `instantiateProject()` function
- **Ontology API**: Uses existing `/api/onto/projects/instantiate` endpoint
- **Agent Context**: Works with existing ontology context loading

### With Agent Workflows

- **analyzeUserIntent()**: Detects project creation intent
- **executeStrategy()**: Routes to tool executor
- **last_turn_context**: Tracks created project_id for follow-up questions

## Related Documentation

- [Agent Chat Ontology Integration Status](/apps/web/docs/features/ontology/AGENT_CHAT_ONTOLOGY_INTEGRATION_STATUS.md)
- [CRUD Tools Implementation](/apps/web/docs/features/ontology/CRUD_TOOLS_IMPLEMENTATION.md)
- [Data Models](/apps/web/docs/features/ontology/DATA_MODELS.md)
- [Ontology First Refactoring](/apps/web/docs/features/ontology/ONTOLOGY_FIRST_REFACTORING.md)

---

## Testing Guide

### Prerequisites

1. Ensure the development server is running: `pnpm dev:split`
2. Have a user account with access to the agent chat
3. Ensure project templates are seeded in the database

### Test Case 1: Simple Book Project Creation

**User Input**: "Create a book writing project"

**Expected Behavior**:

1. Agent recognizes project creation intent
2. Calls `list_onto_templates(scope="project", realm="writer", search="book")`
3. Receives template catalog with `project.writer.book` template
4. Infers project details:
    - name: "Book Writing Project" (or similar)
    - type_key: "project.writer.book"
    - context: "personal"
    - scale: "large"
    - stage: "discovery"
    - start_at: Current date
5. Creates 2-3 goals related to book writing
6. Calls `create_onto_project()` with inferred spec
7. Returns success message with project ID

**Verification**:

- Check that project appears in database (`onto_projects` table)
- Verify goals were created and linked to project
- Confirm facets match expected values
- Check that project URL is provided to user

### Test Case 2: Client Software Project with Deadline

**User Input**: "Start a new software project for client work with an MVP deadline in 3 months"

**Expected Behavior**:

1. Calls `list_onto_templates(scope="project", realm="developer", search="software")`
2. Infers:
    - context: "client"
    - scale: "medium"
    - end_at: Current date + 3 months
3. Creates goal for MVP launch
4. Creates initial task for scope definition
5. Successfully creates project

**Verification**:

- Project has correct end_at date
- Context facet is "client"
- Goal and task are created and linked

### Test Case 3: Vague Request (Clarifications)

**User Input**: "Create a project"

**Expected Behavior**:

1. Agent recognizes insufficient context
2. Calls `create_onto_project()` with clarifications array
3. Returns questions to user:
    - "What kind of project would you like to create?"
    - Offers choices: Software Development, Writing/Content, Design, Business, Personal
4. After user answers, makes second call with full details

**Verification**:

- First response contains clarifying questions
- No project is created on first call
- After user answers, project is created successfully

### Test Case 4: Project with Multiple Entities

**User Input**: "Create a design project for a client website with pages for home, about, and contact"

**Expected Behavior**:

1. Calls `list_onto_templates(scope="project", realm="designer")`
2. Infers context="client"
3. Creates 3 outputs (home page, about page, contact page)
4. Creates tasks for each page
5. Links outputs and tasks to project

**Verification**:

- Project created with design template
- 3 outputs exist in database
- Tasks are linked to outputs
- All entities have correct project_id

### How to Debug Issues

**Check Agent Logs**:

```bash
# Look for these key log messages
- "Loading planner context for contextType: project_create"
- "Loaded template overview: X templates"
- "Providing project-creation-specific tools"
```

**Verify Context Loading**:

- Open browser DevTools → Network tab
- Look for API calls to `/api/onto/templates`
- Verify template catalog is returned

**Check Tool Calls**:

- In chat UI, look for tool usage indicators
- Verify `list_onto_templates` is called before `create_onto_project`
- Check tool call arguments match expected inference

**Database Verification**:

```sql
-- Check project was created
SELECT * FROM onto_projects WHERE name LIKE '%Book%' ORDER BY created_at DESC LIMIT 1;

-- Check related entities
SELECT * FROM onto_goals WHERE project_id = '<project_id>';
SELECT * FROM onto_tasks WHERE project_id = '<project_id>';
```

---

**Implementation Complete**:

- Phase 1: 2025-11-04 (Tools, handlers, prompts)
- Phase 2: 2025-11-05 (Context loading, flow routing)

**Implemented By**: Claude Code (Agent Chat Enhancement Team)

**Next Steps**: Manual end-to-end testing with real AI agent interactions
