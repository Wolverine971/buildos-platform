
> almost. I like my current flexible structure. I just want to add this onto_scaffolding_templates on top of what 
already exists. So that I can through a project scaffolding template gallery select a predfined template and it
scaffolds my project and the entities so that I am not starting from scratch.\
\
I want both flows. The current flows is good for agentic project creation.\
\
BUt I want the onto_scaffolding_templates for a different flow. Please ultrathink and create a detailed spec for 
this. \
\
I want a project template scaffolding gallery that I can choose from. And I want a UI for creating these project 
scaffolding templates.\
\
For now we need to concentrate on the datamodels. \
\
Ultrathink and create a spec for this and ask any clarifying questions you have so that we get this right.

⏺ This is a really smart clarification. You want to keep both flows - agentic creation for flexible exploration,
  and structured templates for users who want guidance. Let me ultrathink this design.

  I'll create a detailed data model spec with clarifying questions so we get this right the first time.

  ---
  Ultra-Think: Project Scaffolding Templates System

  Core Vision

  Two distinct user journeys:

  Journey A (Current - Brain Dump)
  - User writes unstructured thoughts
  - AI extracts projects + automatically structures them
  - Good for: Exploratory, flexible, conversational

  Journey B (New - Scaffolding Gallery)
  - User browses project scaffolding gallery
  - Picks template ("Writer's Book", "Founder's Startup")
  - Fills in 3-5 questions specific to that template
  - System creates entire project structure with all entities
  - Good for: Guided, fast, guaranteed structure, best practices

  Both should coexist. Different use cases, different users.

  ---
  Data Model Design

  Table 1: onto_scaffolding_templates (Main Definition)

  CREATE TABLE onto_scaffolding_templates (
    -- Identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_key TEXT UNIQUE NOT NULL,         -- "scaffolding.writer.book"

    -- Metadata for Gallery
    name TEXT NOT NULL,                    -- "Writer's Book Project"
    description TEXT,                      -- Short description
    instructions TEXT,                     -- Onboarding/how-to guide

    -- Discovery/Organization
    realm TEXT,                            -- "writer", "founder", "marketer"
    category TEXT,                         -- "creative", "business", "learning"
    difficulty TEXT,                       -- "beginner", "intermediate", "expert"
    tags TEXT[],                           -- ["novel", "fiction", "writing"]
    recommended_contexts TEXT[],           -- ["personal", "commercial"]
    recommended_scale TEXT,                -- "medium", "large"
    typical_duration_days INT,             -- Estimate how long project lasts

    -- The Complete Scaffolding Definition
    definition JSONB NOT NULL,             -- (See detailed spec below)

    -- Variants Support
    variants JSONB,                        -- { fiction: {...}, nonfiction: {...} }
    default_variant TEXT,                  -- Which variant to use if not specified

    -- Lifecycle
    status TEXT DEFAULT 'draft',           -- "draft", "published", "deprecated"
    created_by UUID,                       -- Admin who created
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT valid_status CHECK (status IN ('draft', 'published', 'deprecated'))
  );

  Key Decisions:
  - ✅ definition is JSONB (complete self-contained template)
  - ✅ variants support (e.g., fiction vs nonfiction books)
  - ✅ Metadata for discovery (realm, tags, difficulty)
  - ✅ instructions for onboarding users on how to use the template

  ---
  Table 2: onto_scaffolding_instantiations (Audit Trail)

  Track which projects were created from scaffolding templates:

  CREATE TABLE onto_scaffolding_instantiations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What was used
    scaffolding_template_id UUID NOT NULL REFERENCES onto_scaffolding_templates(id),
    variant_key TEXT,                      -- Which variant was selected (if any)

    -- What was created
    project_id UUID NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,

    -- Variables that were filled in
    user_variables JSONB,                  -- { book_title: "My Novel", word_count: 80000 }

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID                        -- User who instantiated
  );

  Purpose:
  - Track origin of projects ("This came from scaffolding.writer.book")
  - Enable "show example" (fetch a project created from this template)
  - Analytics ("Which scaffolding templates are most popular?")
  - Optional: Ability to "re-scaffold" if user wants to sync with latest template version

  ---
  Table 3: onto_scaffolding_components (Optional - For Admin UI)

  For the admin scaffolding template creator, might want normalized components:

  CREATE TABLE onto_scaffolding_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scaffolding_template_id UUID NOT NULL REFERENCES onto_scaffolding_templates(id) ON DELETE CASCADE,

    component_type TEXT NOT NULL,          -- "plan", "goal", "task", "output"
    order_index INT NOT NULL,

    -- The component definition
    definition JSONB NOT NULL,             -- { name, template_key, count, etc. }

    created_at TIMESTAMP DEFAULT NOW()
  );

  Why: Makes it easier to build an admin UI that lets you add/remove/reorder components without editing raw JSON.

  ---
  JSONB Structure: The Complete Scaffolding Definition

  Here's what goes in onto_scaffolding_templates.definition:

  {
    "project": {
      "template_key": "writer.book",
      "facet_defaults": {
        "context": "personal",
        "scale": "large",
        "stage": "planning"
      }
    },

    "variables": {
      "book_title": {
        "type": "string",
        "label": "Book Title",
        "help": "What is your book called?",
        "required": true,
        "placeholder": "e.g. The Last Astronaut"
      },
      "word_count": {
        "type": "number",
        "label": "Target Word Count",
        "help": "How many words do you want to write?",
        "default": 80000,
        "minimum": 10000,
        "maximum": 500000
      },
      "num_chapters": {
        "type": "number",
        "label": "Number of Chapters",
        "help": "How many chapters?",
        "default": 15,
        "minimum": 1,
        "maximum": 100
      },
      "deadline": {
        "type": "date",
        "label": "Target Completion Date",
        "help": "When do you want to finish?",
        "required": false
      },
      "genre": {
        "type": "select",
        "label": "Genre",
        "options": ["fiction", "nonfiction", "memoir", "academic"],
        "default": "fiction"
      }
    },

    "plans": [
      {
        "name": "Planning Phase",
        "order": 1,
        "description": "Structure and preparation for {{book_title}}"
      },
      {
        "name": "Writing Phase",
        "order": 2,
        "description": "First draft completion"
      },
      {
        "name": "Editing Phase",
        "order": 3,
        "description": "Revision and refinement"
      }
    ],

    "goals": [
      {
        "name": "Complete {{book_title}} draft",
        "template_key": "goal.outcome",
        "description": "Write {{word_count}} words by {{deadline}}",
        "priority": 1
      },
      {
        "name": "Get published",
        "template_key": "goal.outcome",
        "priority": 2
      }
    ],

    "tasks": [
      {
        "order": 1,
        "title": "Outline {{book_title}}",
        "plan_name": "Planning Phase",
        "template_key": "task.deepwork",
        "description": "Create chapter breakdown and plot structure",
        "estimated_hours": 4,
        "priority": 1,
        "count": 1
      },
      {
        "order": 2,
        "title": "Develop {{genre}} characters",
        "plan_name": "Planning Phase",
        "template_key": "task.deepwork",
        "description": "Character profiles, arcs, motivations",
        "estimated_hours": 6,
        "count": 1
      },
      {
        "order": 3,
        "title": "Research for {{book_title}}",
        "plan_name": "Planning Phase",
        "template_key": "task.research",
        "description": "Gather research materials and references",
        "estimated_hours": 8,
        "count": 1
      },
      {
        "order": 4,
        "title": "Write {{book_title}} - Chapter {{chapter_num}}",
        "plan_name": "Writing Phase",
        "template_key": "task.writing",
        "description": "First draft of chapter {{chapter_num}}",
        "estimated_hours": 8,
        "count": "{{num_chapters}}",
        "sequence": {
          "enabled": true,
          "variable": "chapter_num",
          "start": 1
        }
      },
      {
        "order": 5,
        "title": "First edit pass on {{book_title}}",
        "plan_name": "Editing Phase",
        "template_key": "task.deepwork",
        "description": "Line editing and structural revisions",
        "estimated_hours": 12,
        "count": 1
      },
      {
        "order": 6,
        "title": "Get feedback on {{book_title}}",
        "plan_name": "Editing Phase",
        "template_key": "task.coordination",
        "description": "Share with beta readers or editor",
        "estimated_hours": 4,
        "count": 1
      }
    ],

    "outputs": [
      {
        "order": 1,
        "name": "{{book_title}} - Manuscript",
        "type_key": "output.document",
        "description": "Final edited manuscript ready for publication"
      }
    ]
  }

  ---
  Key Design Questions (Please Answer These)

  Q1: Task Templating Strategy

  When a task definition includes template_key: "task.deepwork":

  What should that do?

  - Option A: Just for reference/consistency - user sees "this is a deep work task" but system doesn't inherit
  anything
  - Option B: Inherit schema + FSM + default props from onto_templates.task.deepwork
  - Option C: Reference only if provided, otherwise standalone

  Which makes sense for your use case?

  Example scenarios:
  - If I reference task.deepwork, should created tasks automatically get the deepwork template's schema/properties?
  - Or is it just metadata for the UI to display properly?

  ---
  Q2: Conditional Content

  Do you need conditionals in scaffolding templates?

  Examples:
  {
    "tasks": [
      {
        "title": "Research settings",
        "plan_name": "Planning Phase",
        "if_genre": "fiction"  // Only include this if user picked fiction
      },
      {
        "title": "Gather citations",
        "plan_name": "Planning Phase",
        "if_genre": "nonfiction"  // Only for nonfiction
      }
    ]
  }

  Option A: No conditionals for v1 - create separate scaffolding templates per variant
  (scaffolding.writer.book.fiction vs .nonfiction)

  Option B: Support if_variable conditionals in JSONB

  Recommendation: Start with Option A (simpler, cleaner), add conditionals in v2 if needed.

  ---
  Q3: Repeat/Sequencing Strategy

  For tasks that repeat (like "Write Chapter 1, 2, 3..."), I used:

  {
    "title": "Write {{book_title}} - Chapter {{chapter_num}}",
    "count": "{{num_chapters}}",  // Variable reference
    "sequence": {
      "enabled": true,
      "variable": "chapter_num",  // Variable name to increment
      "start": 1                   // Start at 1
    }
  }

  Questions:
  - Does this feel intuitive?
  - Should sequence support step (increment by 2)? Or just 1?
  - What about more complex sequences like Chapter 1, 1.1, 1.2? (Probably not for v1)

  ---
  Q4: Relationship to Existing onto_templates

  Decision needed: How should scaffolding templates relate to project/task/goal templates?

  Option A: Completely independent
  - Scaffolding templates don't reference onto_templates at all
  - Just define structure inline
  - Pro: Self-contained, portable; Con: Duplication

  Option B: Always reference existing templates
  - Every project/task/goal must use existing template_key
  - Pro: Consistency, reuse; Con: Less flexibility

  Option C: Optional reference (hybrid)
  - Reference if you want to reuse/inherit
  - Define inline if custom
  - Pro: Flexible; Con: More complex

  My recommendation: Option C (Hybrid) - but start simple. For v1, let scaffolding be self-contained. In v2, add
  optional template_key references for reuse.

  ---
  Q5: Scope of Scaffolding

  What entities should scaffolding templates support?

  Currently I have:
  - ✅ Project
  - ✅ Plans
  - ✅ Goals
  - ✅ Tasks
  - ✅ Outputs

  Should we also support?
  - Documents? (e.g., "Create research doc for book")
  - Metrics? (e.g., "Track daily word count")
  - Milestones? (e.g., "Reach 50k words")
  - Risks? (e.g., "Timeline risk")
  - Decisions? (e.g., "Genre decision")

  Recommendation: Start with Project + Plans + Goals + Tasks + Outputs. Add others if scaffolding templates
  specifically need them.

  ---
  Q6: Variable Types

  I included:
  - string (book_title)
  - number (word_count, num_chapters)
  - date (deadline)
  - select (genre dropdown)

  Do you need:
  - text (multiline textarea)?
  - checkbox (boolean)?
  - array (comma-separated values)?
  - email, url?
  - datetime (date + time)?

  Recommendation: Start with string, number, date, select. Add others if templates need them.

  ---
  Q7: Admin Creation vs. Programmatic

  For creating scaffolding templates, do you want:

  Option A: Admin UI (/admin/scaffolding/new) that builds JSONB through form
  - Pros: User-friendly, no raw JSON
  - Cons: Need to build editor UI

  Option B: Admins write JSON directly (or use JSON editor)
  - Pros: Flexible, fast
  - Cons: Requires technical knowledge

  Option C: Hybrid - simple form for basics, JSON editor for advanced

  Recommendation: Option C for v1 - Form for metadata/basic structure, ability to edit raw JSON for power users.

  ---
  Q8: Validation Rules

  When a scaffolding template is created/edited, what should we validate?

  Must validate:
  - ✅ Valid JSON structure
  - ✅ All variables referenced in text are defined
  - ✅ No undefined template references (task.deepwork must exist)
  - ✅ Plan/goal/task names are not empty after variable substitution
  - ✅ Sequence variables are valid

  Should we support:
  - Dry-run instantiation (simulate creating a project with example variables)?
  - Example instantiation (create real test project)?
  - Preview of what will be created?

  Recommendation: Add dry-run and preview - would be super helpful for admins testing templates.

  ---
  Q9: Variants Design

  For variants (fiction vs nonfiction), I suggested:

  {
    "variants": {
      "fiction": { /* override definition */ },
      "nonfiction": { /* override definition */ }
    },
    "default_variant": "fiction"
  }

  Options:
  - Option A: One template with variants defined inline (what I suggested)
  - Option B: Separate scaffolding templates per variant (scaffolding.writer.book.fiction,
  scaffolding.writer.book.nonfiction)
  - Option C: Support both - base template + variant overrides

  Recommendation: Option A (inline variants) for related variants. Option B (separate templates) for completely
  different structures. Let admin choose.

  ---
  Q10: User Instantiation Flow

  When a user picks a scaffolding template from gallery, what's the UX?

  Option A: Simple
  1. Click template
  2. Fill in variables (book_title, word_count, num_chapters, deadline)
  3. Click "Create Project"
  4. Done

  Option B: With Preview
  1. Click template
  2. Fill in variables
  3. See preview: "This will create 3 plans, 5 goals, 16 tasks"
  4. Review structure
  5. Customize (rename tasks, add/remove plans)
  6. Click "Create Project"

  Option C: Two-step commitment
  1. Click template
  2. Fill in variables
  3. Go to project detail page (project created in "setup" mode)
  4. Review/edit everything
  5. "Lock/finalize" when ready

  Recommendation: Option B (with preview) - shows power of scaffolding but doesn't let users mess things up without
   seeing consequences.

  ---
  Proposed Data Model (Summary)

  CREATE TABLE onto_scaffolding_templates (
    id UUID PRIMARY KEY,
    type_key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    instructions TEXT,

    realm TEXT,
    category TEXT,
    difficulty TEXT,
    tags TEXT[],
    recommended_contexts TEXT[],
    recommended_scale TEXT,
    typical_duration_days INT,

    definition JSONB NOT NULL,    -- See structure above
    variants JSONB,               -- Optional: { fiction: {...}, nonfiction: {...} }
    default_variant TEXT,

    status TEXT DEFAULT 'draft',
    created_by UUID,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
  );

  CREATE TABLE onto_scaffolding_instantiations (
    id UUID PRIMARY KEY,
    scaffolding_template_id UUID REFERENCES onto_scaffolding_templates(id),
    project_id UUID REFERENCES onto_projects(id),
    variant_key TEXT,
    user_variables JSONB,
    created_by UUID,
    created_at TIMESTAMP
  );

  CREATE TABLE onto_scaffolding_components (  -- Optional, for admin UI only
    id UUID PRIMARY KEY,
    scaffolding_template_id UUID REFERENCES onto_scaffolding_templates(id),
    component_type TEXT,
    order_index INT,
    definition JSONB,
    created_at TIMESTAMP
  );

  ---
  Next Steps (If You Agree)

  Once you clarify the 10 questions above, I can:

  1. ✅ Finalize the JSONB schema
  2. ✅ Write the migration file to create tables
  3. ✅ Create the instantiation service (fills variables, creates project + all entities)
  4. ✅ Design the admin UI for creating templates
  5. ✅ Design the user-facing gallery + instantiation flow
  6. ✅ Add validation layer

  But first - please answer the 10 questions so we nail the design before implementing. 🎯



Ok I think the table should be called onto_project_template_scaffolding

It should still be based off of project onto_templates. THe difference is that it has more connected edges with other data that comes prepopulated such as tasks and plans and stuff like that.


For Task Templating Strategy- it should inherit the schema and FSM from the template.

For Conditional Content, no conditionals for V1

I recently redesigned how the recurring tasks are structured so this is updated now.

For relationship to Existing onto_templates as I said this scaffolding should properly inherit from the onto_templates that are for projects. We should always be reference existing templates however there should be standard generic base templates for each type. I think there are not sure. With this you should be able to inherit the base templates to go and build out a unique scaffolding for a project.

For the Scope of Scaffolding lets extend to all relevant entities.

Not sure about the variable types.

For the Admin Creation vs. Programmatic

Yes I want a form flow to create templates this is already sortof done here apps/web/src/routes/ontology/templates