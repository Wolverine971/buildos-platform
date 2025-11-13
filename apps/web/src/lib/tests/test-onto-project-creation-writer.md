# Ontology Project Creation Tests - Writer/Author Persona

**Test Suite**: Ontology project creation with agentic chat
**Persona**: Writer/Author
**Context Type**: `project_create` → `project` (after creation)
**Primary Template**: `writer.book`, `writer.blog`, `writer.article`

## Test Prompt 1: Novel Writing Project - Comprehensive Creation

**Scenario**: Author wants to start a fantasy novel project with full structure

**Context Type**: `project_create`

### User Input:

"I want to create a fantasy novel project called 'The Last Ember'. It's about a young blacksmith who discovers she can forge magical weapons. I need to develop the main character, create a magic system, map out the kingdom, and outline the first three chapters."

### Expected Agent Behavior:

1. **Template Search**:

    ```
    list_onto_templates(
      scope="project",
      realm="writer",
      search="book"
    )
    ```

    - Should find `writer.book` template

2. **Project Creation**:

    ```
    create_onto_project({
      project: {
        name: "The Last Ember - Fantasy Novel",
        type_key: "writer.book",
        description: "Fantasy novel about a blacksmith who discovers magical weapon forging",
        props: {
          facets: {
            context: "personal",
            scale: "large",
            stage: "discovery"
          }
        },
        start_at: "[current_date]"
      },
      goals: [
        {
          name: "Complete first draft",
          type_key: "goal.outcome"
        },
        {
          name: "Develop magic system",
          type_key: "goal.learning"
        }
      ],
      plans: [
        {
          name: "World Building",
          type_key: "plan.creative.worldbuilding",
          state_key: "active"
        },
        {
          name: "Character Development",
          type_key: "plan.creative.character",
          state_key: "active"
        },
        {
          name: "Chapter Outlines",
          type_key: "plan.writing.chapters",
          state_key: "draft"
        }
      ],
      tasks: [
        {
          title: "Develop main character backstory (orphan raised by blacksmith)",
          plan_name: "Character Development",
          priority: 5,
          state_key: "todo"
        },
        {
          title: "Create magic system based on metal and fire",
          plan_name: "World Building",
          priority: 5,
          state_key: "todo"
        },
        {
          title: "Map out the kingdom of Aethermoor",
          plan_name: "World Building",
          priority: 4,
          state_key: "todo"
        },
        {
          title: "Outline first three chapters",
          plan_name: "Chapter Outlines",
          priority: 4,
          state_key: "todo"
        }
      ],
      documents: [
        {
          title: "Character Profile - Elena (Protagonist)",
          type_key: "document.creative.character",
          state_key: "draft"
        },
        {
          title: "Magic System Documentation",
          type_key: "document.creative.worldbuilding",
          state_key: "draft"
        }
      ],
      outputs: [
        {
          name: "Final Manuscript",
          type_key: "output.writing.manuscript",
          state_key: "draft"
        }
      ],
      context_document: {
        title: "The Last Ember - Project Overview",
        body_markdown: "Fantasy novel about a young blacksmith who discovers she can forge magical weapons when the kingdom's last dragon dies..."
      }
    })
    ```

3. **Context Shift**:
    - After successful creation, context should shift from `project_create` to `project`
    - `entity_id` should be set to the new project_id
    - Session should update with new context

### Expected Results:

**Onto Tables Created**:

- ✅ **onto_projects**: 1 project
    - name: "The Last Ember - Fantasy Novel"
    - type_key: "writer.book"
    - facet_context: "personal"
    - facet_scale: "large"
    - facet_stage: "discovery"
    - context_document_id: [linked to context document]

- ✅ **onto_goals**: 2 goals
    - "Complete first draft" (outcome goal)
    - "Develop magic system" (learning goal)

- ✅ **onto_plans**: 3 plans
    - "World Building" (active)
    - "Character Development" (active)
    - "Chapter Outlines" (draft)

- ✅ **onto_tasks**: 4 tasks
    - "Develop main character backstory" (priority 5, linked to Character Development plan)
    - "Create magic system" (priority 5, linked to World Building plan)
    - "Map out kingdom" (priority 4, linked to World Building plan)
    - "Outline first three chapters" (priority 4, linked to Chapter Outlines plan)

- ✅ **onto_documents**: 3 documents
    - "The Last Ember - Project Overview" (context document, type: document.project.context)
    - "Character Profile - Elena" (creative document)
    - "Magic System Documentation" (worldbuilding document)

- ✅ **onto_outputs**: 1 output
    - "Final Manuscript" (manuscript output, draft state)

- ✅ **onto_edges**: Multiple relationships created
    - project → goals (has_goal)
    - project → plans (has_plan)
    - project → tasks (has_task)
    - project → documents (has_document)
    - project → outputs (has_output)
    - tasks → plans (belongs_to_plan)

**Context After Creation**:

- context_type: "project"
- entity_id: [new project_id]
- User is now in project workspace mode

---

## Test Prompt 2: Blog Content Series - Simple Creation

**Scenario**: Blogger wants to create a content series about productivity

**Context Type**: `project_create`

### User Input:

"Start a blog project for a productivity tips series. I want to write 10 articles over the next 3 months."

### Expected Agent Behavior:

1. **Template Search**:

    ```
    list_onto_templates(scope="project", realm="writer", search="blog")
    ```

2. **Project Creation**:
    ```
    create_onto_project({
      project: {
        name: "Productivity Tips Blog Series",
        type_key: "writer.blog",
        description: "10-article series about productivity tips",
        props: {
          facets: {
            context: "personal",
            scale: "small",
            stage: "planning"
          }
        },
        start_at: "[current_date]",
        end_at: "[current_date + 3 months]"
      },
      goals: [
        {
          name: "Publish 10 productivity articles",
          type_key: "goal.outcome",
          props: {
            target_count: 10,
            measurement: "articles_published"
          }
        }
      ],
      outputs: [
        {
          name: "Published Blog Series",
          type_key: "output.writing.blog",
          state_key: "draft"
        }
      ]
    })
    ```

### Expected Results:

- ✅ **onto_projects**: 1 project (blog series)
- ✅ **onto_goals**: 1 goal (publish 10 articles)
- ✅ **onto_outputs**: 1 output (published series)
- ✅ **onto_documents**: 1 context document
- ✅ **Context shift**: `project_create` → `project`

---

## Test Prompt 3: Update Existing Project - Workspace Mode

**Scenario**: Author is now in project workspace and wants to add new tasks

**Context Type**: `project` (already in workspace mode)
**Entity ID**: [existing project_id]

### User Input:

"Add a task to research medieval blacksmithing techniques and another to write character profiles for the antagonist"

### Expected Agent Behavior:

1. **No Template Search** (already in project context)

2. **Create Tasks**:

    ```
    create_onto_task({
      project_id: "[current_project_id]",
      title: "Research medieval blacksmithing techniques",
      description: "Research historical blacksmithing for authenticity",
      priority: 3,
      state_key: "todo",
      plan_id: "[World Building plan_id]"
    })
    ```

    ```
    create_onto_task({
      project_id: "[current_project_id]",
      title: "Write character profile for The Shadow King (antagonist)",
      description: "Develop backstory and motivations for the antagonist",
      priority: 5,
      state_key: "todo",
      plan_id: "[Character Development plan_id]"
    })
    ```

### Expected Results:

- ✅ **onto_tasks**: 2 new tasks created
- ✅ **onto_edges**: New task→plan relationships
- ✅ **Context remains**: Still in `project` workspace
- ✅ **No context shift**: Stays focused on current project

---

## Test Prompt 4: Progress Update - Chapter Completion

**Scenario**: Author completed a chapter and wants to update progress

**Context Type**: `project`

### User Input:

"I finished chapter 2 - 4,500 words. The scene where Elena discovers the dragon forge went really well. Need to fix some dialogue issues and add more sensory details. Also need to start chapter 3."

### Expected Agent Behavior:

1. **Search for related task**:

    ```
    search_onto_tasks(
      search="chapter 2",
      project_id: "[current_project_id]"
    )
    ```

2. **Update task if found**:

    ```
    update_onto_task({
      task_id: "[chapter_2_task_id]",
      state_key: "done",
      props: {
        word_count: 4500,
        notes: "Scene with dragon forge discovery completed"
      }
    })
    ```

3. **Create new tasks**:

    ```
    create_onto_task({
      project_id: "[current_project_id]",
      title: "Revise Chapter 2 dialogue",
      priority: 4,
      state_key: "todo",
      plan_id: "[Chapter Outlines plan_id]",
      props: {
        description: "Strengthen dialogue, add sensory details"
      }
    })
    ```

    ```
    create_onto_task({
      project_id: "[current_project_id]",
      title: "Write Chapter 3",
      priority: 5,
      state_key: "todo",
      plan_id: "[Chapter Outlines plan_id]"
    })
    ```

4. **Create document for chapter**:
    ```
    create_onto_document({
      project_id: "[current_project_id]",
      title: "Chapter 2 - Draft",
      type_key: "document.writing.chapter",
      state_key: "review",
      props: {
        word_count: 4500,
        chapter_number: 2
      }
    })
    ```

### Expected Results:

- ✅ **onto_tasks**: 1 updated (chapter 2 → done), 2 new tasks created
- ✅ **onto_documents**: 1 new chapter document
- ✅ **Task state transitions**: todo → done
- ✅ **Context maintained**: Still in project workspace

---

## Test Prompt 5: Project Audit - Risk and Requirements

**Scenario**: Author wants to add project constraints and identify risks

**Context Type**: `project_audit` (specialized audit mode)

### User Input:

"I need to identify risks for this project. Main concerns: writer's block, losing motivation midway, and time management with my day job. Also add requirements: must finish first draft by March 31st, target 80,000 words."

### Expected Agent Behavior:

1. **Create Risks**:

    ```
    create_onto_risk({
      project_id: "[current_project_id]",
      title: "Writer's Block",
      impact: "high",
      probability: 0.6,
      state_key: "identified",
      props: {
        mitigation: "Daily writing habit, morning pages",
        category: "creative"
      }
    })
    ```

    ```
    create_onto_risk({
      project_id: "[current_project_id]",
      title: "Motivation Loss Mid-Project",
      impact: "high",
      probability: 0.5,
      state_key: "identified"
    })
    ```

    ```
    create_onto_risk({
      project_id: "[current_project_id]",
      title: "Time Management with Day Job",
      impact: "medium",
      probability: 0.7,
      state_key: "identified"
    })
    ```

2. **Create Requirements**:

    ```
    create_onto_requirement({
      project_id: "[current_project_id]",
      text: "Complete first draft by March 31st",
      type_key: "requirement.deadline",
      props: {
        deadline: "2026-03-31T00:00:00Z",
        priority: "critical"
      }
    })
    ```

    ```
    create_onto_requirement({
      project_id: "[current_project_id]",
      text: "Target manuscript length: 80,000 words",
      type_key: "requirement.metric",
      props: {
        target: 80000,
        unit: "words"
      }
    })
    ```

### Expected Results:

- ✅ **onto_risks**: 3 risks created
- ✅ **onto_requirements**: 2 requirements created
- ✅ **Risk assessment**: Each risk has impact, probability, mitigation
- ✅ **Requirements linked**: Deadline and word count tracked
- ✅ **Context**: `project_audit` mode maintained

---

## Test Prompt 6: Publishing Plan - Milestones and Decisions

**Scenario**: Author planning publication strategy

**Context Type**: `project`

### User Input:

"I'm planning to self-publish. Key milestones: First draft done by March 31, Beta readers by May 15, Professional edit by July 30, Cover design by August 15, Launch September 1st. I've decided to use Kindle Direct Publishing for distribution."

### Expected Agent Behavior:

1. **Create Milestones**:

    ```
    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "First Draft Complete",
      due_at: "2026-03-31T00:00:00Z",
      type_key: "milestone.draft"
    })
    ```

    ```
    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "Beta Readers Feedback Complete",
      due_at: "2026-05-15T00:00:00Z",
      type_key: "milestone.review"
    })
    ```

    ```
    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "Professional Edit Complete",
      due_at: "2026-07-30T00:00:00Z",
      type_key: "milestone.edit"
    })
    ```

    ```
    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "Cover Design Complete",
      due_at: "2026-08-15T00:00:00Z",
      type_key: "milestone.design"
    })
    ```

    ```
    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "Book Launch",
      due_at: "2026-09-01T00:00:00Z",
      type_key: "milestone.launch"
    })
    ```

2. **Create Decision Record**:

    ```
    create_onto_decision({
      project_id: "[current_project_id]",
      title: "Publishing Platform: Kindle Direct Publishing",
      rationale: "Self-publishing via KDP for maximum control and royalty rates",
      decision_at: "[current_date]",
      props: {
        alternatives_considered: ["Traditional publishing", "IngramSpark"],
        decision_maker: "author",
        impact: "high"
      }
    })
    ```

3. **Create Plan for Publishing**:
    ```
    create_onto_plan({
      project_id: "[current_project_id]",
      name: "Publishing & Launch",
      type_key: "plan.publishing.selfpub",
      state_key: "active"
    })
    ```

### Expected Results:

- ✅ **onto_milestones**: 5 milestones created with dates
- ✅ **onto_decisions**: 1 decision record (KDP selection)
- ✅ **onto_plans**: 1 new plan (Publishing & Launch)
- ✅ **Timeline visibility**: Clear project timeline established
- ✅ **Decision tracking**: Rationale and alternatives documented

---

## Edge Cases

### Edge Case 1: Vague Request - Needs Clarification

**Input**: "Create a writing project"

**Expected Behavior**:

- Agent calls `create_onto_project` with clarifications array
- Returns questions: "What type of writing project?", "What's the main topic or theme?"
- Waits for user answers before creating project

### Edge Case 2: Multi-Book Series

**Input**: "The Last Ember will be book 1 of a trilogy. Book 2 'The Forge Awakens' - Elena trains other smiths. Book 3 'Dragon's Return' - final battle."

**Expected Behavior**:

- Creates parent project for trilogy
- Creates 3 sub-projects (books) linked via onto_edges
- Uses `also_types` to mark books as part of series
- Creates requirements for series continuity

### Edge Case 3: Switching Between Projects

**Input**: "Switch to my blog project"

**Expected Behavior**:

- Searches for blog project: `search_onto_projects(search="blog")`
- Initiates context shift to found project
- Updates session with new entity_id
- Confirms switch to user

---

## Summary

This test suite validates:

1. ✅ **Project Creation**: Complete project with all entity types
2. ✅ **Template Selection**: Automatic template finding and application
3. ✅ **Facet Inference**: Intelligent context/scale/stage detection
4. ✅ **Context Shifting**: `project_create` → `project` → `project_audit`
5. ✅ **Multi-Entity Creation**: Goals, plans, tasks, documents, outputs in one call
6. ✅ **Workspace Operations**: Task updates, document creation in project mode
7. ✅ **Risk/Requirements**: Audit mode operations
8. ✅ **Milestones/Decisions**: Timeline and decision tracking
9. ✅ **Edge Cases**: Clarifications, series, context switching
