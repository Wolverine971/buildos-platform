# Agentic Chat Test Prompts

> **Purpose:** Manual testing prompts to validate agentic chat capabilities
> **Created:** 2025-12-12
> **Context:** Post-template removal, ontology-first architecture

---

## Quick Reference: Context Types

| Context Type | Trigger | Expected Behavior |
|--------------|---------|-------------------|
| `global` | No entity selected | Full ontology access, can browse all projects |
| `project` | Project selected | Scoped to project, sees tasks/goals/plans |
| `project_create` | "New project" flow | Clarifying questions, guided creation |
| `brain_dump` | Brain dump entity | Exploration mode, gentle structuring |
| `ontology` | Element focus (task, goal, etc.) | Scoped to specific element + parent project |

---

## 1. Global Context Tests

### 1.1 Project Discovery

```
Show me my projects
```
**Expected:** Uses `list_onto_projects`, returns project list with names/states

```
What projects do I have that are active?
```
**Expected:** Uses `list_onto_projects` with state filter

```
How many projects do I have?
```
**Expected:** Uses `list_onto_projects`, provides count

### 1.2 Cross-Project Search

```
Find all my tasks that are due this week
```
**Expected:** May need to iterate projects or use global task query

```
What's overdue across all my projects?
```
**Expected:** Searches for tasks with past due dates

### 1.3 Project Creation Intent

```
I want to start a new project for my home renovation
```
**Expected:** Should trigger project creation flow with clarifying questions

```
Create a project called "Q1 Marketing Campaign"
```
**Expected:** Uses `create_onto_project` with the name provided

---

## 2. Project Context Tests

> **Setup:** Navigate to a project first, then open chat

### 2.1 Project Overview

```
Give me an overview of this project
```
**Expected:** Uses `get_onto_project_details`, summarizes project state

```
What's the status of this project?
```
**Expected:** Returns project state_key and summary

```
Show me the context document for this project
```
**Expected:** Returns context_document content if exists

### 2.2 Task Management

```
Show me all tasks in this project
```
**Expected:** Uses `list_onto_tasks` scoped to project

```
What tasks are not started yet?
```
**Expected:** Filters tasks by state (e.g., `task.not_started`)

```
Create a task to review the budget
```
**Expected:** Uses `create_onto_task` with project_id from context

```
Mark the "review budget" task as in progress
```
**Expected:** Uses `update_onto_task` to change state

### 2.3 Goal Management

```
What are the goals for this project?
```
**Expected:** Uses `list_onto_goals` scoped to project

```
Add a goal: Launch by end of Q1
```
**Expected:** Uses `create_onto_goal` with project context

### 2.4 Plan Management

```
Show me the plans for this project
```
**Expected:** Uses `list_onto_plans`

```
Create a plan for the first phase of work
```
**Expected:** May trigger planning flow or direct creation

### 2.5 Relationships

```
What tasks are related to the main goal?
```
**Expected:** Uses `get_entity_relationships` or navigates relationships

```
Show me the project hierarchy
```
**Expected:** Displays structure of goals, plans, tasks

---

## 3. Element Context Tests

> **Setup:** Click into a specific task/goal/plan, then open chat

### 3.1 Task Focus

```
Tell me about this task
```
**Expected:** Uses `get_onto_task_details`, returns full task info

```
What's blocking this task?
```
**Expected:** Checks dependencies via relationships

```
Update the description to include acceptance criteria
```
**Expected:** Uses `update_onto_task` to modify description

```
Change the due date to next Friday
```
**Expected:** Uses `update_onto_task` to modify due_at

### 3.2 Goal Focus

```
What tasks are under this goal?
```
**Expected:** Gets related tasks via relationships

```
How much progress has been made on this goal?
```
**Expected:** Calculates based on child task states

### 3.3 Plan Focus

```
What are the steps in this plan?
```
**Expected:** Lists plan steps/tasks

```
Add a step to this plan
```
**Expected:** Creates task linked to plan

---

## 4. Project Creation Flow Tests

> **Setup:** Trigger project_create context

### 4.1 Minimal Input

```
I need to plan a wedding
```
**Expected:** Asks clarifying questions (date, budget, venue, etc.)

### 4.2 Rich Input

```
I'm launching a mobile app for my startup. We have 3 developers, a designer, and a PM. Budget is $50k, timeline is 6 months. We need iOS and Android versions, with a backend API. Key features are user auth, payment processing, and push notifications.
```
**Expected:** Has enough context, may proceed directly to creation

### 4.3 Follow-up Clarification

After initial prompt, respond:
```
The wedding is in June next year, budget around $30k, about 100 guests
```
**Expected:** Accumulates context, may ask more or proceed

### 4.4 Type Classification

```
Create a software development project for building a REST API
```
**Expected:** Should classify as `project.software.api` or similar type_key

---

## 5. Brain Dump Context Tests

> **Setup:** Open chat from a brain dump entity

### 5.1 Exploration

```
What did I capture in this brain dump?
```
**Expected:** Summarizes brain dump content

```
Are there any actionable items in here?
```
**Expected:** Identifies potential tasks without being too aggressive

### 5.2 Gentle Structuring

```
Help me make sense of this
```
**Expected:** Offers to organize thoughts, asks about priorities

```
Can you find any themes?
```
**Expected:** Analyzes content for patterns

### 5.3 Project Extraction

```
Turn this into a project
```
**Expected:** Transitions to project creation with brain dump as context

---

## 6. Tool Capability Tests

### 6.1 List Operations

```
List all projects with their states
```
```
Show tasks due this week
```
```
What goals exist in project X?
```

### 6.2 Detail Operations

```
Get full details for project "Marketing Campaign"
```
```
Show me everything about the task "Review budget"
```

### 6.3 Create Operations

```
Create a new project called "Personal Goals 2025"
```
```
Add a task "Schedule dentist appointment" to my personal project
```
```
Create a goal "Improve fitness" with target date end of March
```

### 6.4 Update Operations

```
Mark task X as completed
```
```
Update the project description to include the new scope
```
```
Change the goal target date to April
```

### 6.5 Relationship Operations

```
What entities are related to this task?
```
```
Show the dependency chain for this milestone
```

---

## 7. Edge Cases & Error Handling

### 7.1 Ambiguous References

```
Update the task
```
**Expected:** Asks which task (if multiple exist or none in focus)

```
Complete it
```
**Expected:** Asks what "it" refers to

### 7.2 Invalid Operations

```
Delete all my projects
```
**Expected:** Should refuse or require confirmation (no delete tool)

```
Create a task without a project
```
**Expected:** Tasks require project_id, should ask or use context

### 7.3 Missing Context

```
What's the status?
```
**Expected:** Asks "of what?" if no context

### 7.4 Nonexistent Entities

```
Show me project "ThisDoesNotExist123"
```
**Expected:** Gracefully reports not found

### 7.5 Permission Boundaries

```
Show me another user's projects
```
**Expected:** Only shows user's own data (RLS enforced)

---

## 8. Multi-Step Operations

### 8.1 Sequential Tasks

```
Find my marketing project, then show me all incomplete tasks, and create a summary
```
**Expected:** Executes steps in order, synthesizes result

### 8.2 Conditional Logic

```
If the project has more than 10 incomplete tasks, create a milestone to track progress
```
**Expected:** Checks condition, acts accordingly

### 8.3 Bulk Operations

```
Mark all tasks in the "Planning" phase as complete
```
**Expected:** May need to iterate or batch update

---

## 9. Conversational Quality

### 9.1 Natural Language Variations

All should work similarly:
```
Show my tasks
```
```
What tasks do I have?
```
```
List tasks please
```
```
Tasks?
```

### 9.2 Typos & Informal Language

```
Shoe me the prjects
```
**Expected:** Understands intent despite typos

```
gimme the tasks
```
**Expected:** Informal but understood

### 9.3 Context Carry-Over

First message:
```
Show me the marketing project
```
Follow-up:
```
What tasks does it have?
```
**Expected:** "It" refers to marketing project from context

---

## 10. Response Quality Checks

### 10.1 Conciseness

- Responses should be brief but complete
- Avoid unnecessary preamble ("I'd be happy to help you with...")
- Get to the point

### 10.2 Accuracy

- Tool results should be faithfully reported
- No hallucinated data
- Admits when information not found

### 10.3 Actionability

- Suggests next steps when appropriate
- Offers to help further
- Provides IDs when useful for follow-up

---

## Test Recording Template

| Test | Context | Prompt | Expected | Actual | Pass/Fail |
|------|---------|--------|----------|--------|-----------|
| 1.1a | global | "Show me my projects" | list_onto_projects called | | |
| 2.1a | project | "Give me an overview" | project details returned | | |
| ... | | | | | |

---

## Known Limitations

1. **No delete operations** - Ontology tools don't expose delete
2. **Calendar integration** - Scheduling tools may require additional setup
3. **Executor spawning** - Complex plans may not spawn sub-executors yet
4. **Real-time updates** - Changes may not reflect immediately in UI

---

## Notes for Testers

1. **Check the browser console** for tool call logs
2. **Network tab** shows actual API requests
3. **SSE stream** visible in Network as EventSource
4. **Error messages** should be user-friendly, not technical

