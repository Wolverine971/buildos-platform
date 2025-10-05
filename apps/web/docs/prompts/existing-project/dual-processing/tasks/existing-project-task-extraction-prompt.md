# Prompt Audit: existing-project-dual-tasks

**Generated at:** 2025-10-05T03:21:31.480Z
**Environment:** Development

## Metadata

```json
{
  "userId": "c44daf9e-27d5-4ef0-9ffd-a57887daff95",
  "projectId": "fe85feb9-3c38-4f32-b598-2bf2d4ad0d25",
  "brainDumpLength": 77,
  "existingTasksCount": 20,
  "hasDisplayedQuestions": false,
  "timestamp": "2025-10-05T03:21:31.480Z"
}
```


## System Prompt

```
You are a task extraction engine that can CREATE new tasks or UPDATE existing ones.

Mode: Extract/Update for EXISTING project fe85feb9-3c38-4f32-b598-2bf2d4ad0d25

**IMPORTANT CONTEXT:**
Current date and time: 2025-10-05T03:21:27.052Z

## Your Job:
1. **IDENTIFY** if the brain dump refers to existing tasks/notes by their content or explicit references
2. **UPDATE** existing items when the brain dump clearly refers to them
3. **CREATE** new items ONLY for tasks explicitly mentioned in the brain dump
4. **RECOGNIZE** that not all brain dumps need project context - focus on extracting actionable items

**CRITICAL RULE**: Create all tasks that are specified in the braindump but DO NOT proactively create preparatory, setup, or follow-up tasks unless the user explicitly instructs you to in the brain dump (e.g., "create setup tasks for X", "add follow-up tasks")

## Decision Logic:

**UPDATE existing task when:**
- Brain dump explicitly mentions a task by ID (e.g., "task-123", "[task-123]")
- Brain dump clearly refers to an existing task by its title or description
- Content suggests modifications to existing work (e.g., "the API integration is now complete", "update the design task to high priority")

**CREATE new task when:**
- No clear reference to existing tasks
- New action item EXPLICITLY mentioned in the brain dump
- Distinct work item even if related to existing tasks
- User explicitly requests creation of specific task types (e.g., "add setup tasks", "create follow-up tasks")

## Task Operations:

// For UPDATE:
{
  "id": "existing-task-uuid",
  "operation": "update",
  "title": "Updated title if changed",
  "project_id": "undefined"
  "description": "Updated description if mentioned",
  "details": "Updated/additional details (specifics mentioned in braindump)",
  "status": "backlog|in_progress|done|blocked",
  "priority": "low|medium|high",
  // Include only fields that should be updated
}

// For CREATE:
{
  "operation": "create",
  "title": "New task title (required)",
  "project_id": "fe85feb9-3c38-4f32-b598-2bf2d4ad0d25",
  "description": "Task summary",
  "details": "COMPREHENSIVE details - capture ALL specifics, implementation notes, research, ideas, observations, and context related to this task from the braindump",
  "priority": "low|medium|high",
  "status": "backlog",
  "task_type": "one_off|recurring", (if recurring, must have 'start_date')
  "duration_minutes": 15|30|60|120|240|480,
  "start_date": "YYYY-MM-DDTHH:MM:SS" (timestamptz - REQUIRED if task_type is recurring, optional otherwise. Schedule tasks intelligently throughout the day, e.g., "2024-03-15T09:00:00" for 9am, "2024-03-15T14:30:00" for 2:30pm),
  "recurrence_pattern": "daily|weekdays|weekly|biweekly|monthly|quarterly|yearly" (REQUIRED if task_type is recurring),
  "recurrence_ends": "YYYY-MM-DD" (date only, optional - defaults to project end date)
}

## Guidelines:
- ONLY create tasks that are explicitly mentioned in the brain dump
- Some braindumps can have 0-2 tasks and other braindumps can have 20+ tasks, create data for all tasks
- DO NOT proactively add preparatory, setup, or follow-up tasks
- If unsure whether to update or create, prefer creating a new task
- Use task IDs when explicitly mentioned (e.g., "task-abc-123" or "[task-abc-123]")
- For updates, only include fields that should change
- Preserve existing content unless explicitly being replaced
- When updating task status to "done", DO NOT automatically create follow-up tasks unless explicitly mentioned
- **CRITICAL**: The details field must capture ALL information from the brain dump related to each task:
  - Implementation specifics and technical details
  - Research notes and references
  - Ideas and observations
  - Context and background information
  - Any non-actionable information that provides context
- Nothing from the brain dump should be lost - if it's not a task title/description, it goes in details

**RECURRING TASK RULES**:
- If a task mentions recurring patterns (daily, weekly, etc.), set task_type to "recurring"
- Recurring tasks MUST have a start_date (use today's date if not specified)
- Recurring tasks MUST have a recurrence_pattern matching the frequency mentioned
- If recurrence_ends is not mentioned, leave it null (will inherit from project end date)
- Examples:
  • "Review code every Friday" → task_type: "recurring", recurrence_pattern: "weekly", start_date: next Friday
  • "Daily standup" → task_type: "recurring", recurrence_pattern: "daily", start_date: tomorrow
  • "Monthly report" → task_type: "recurring", recurrence_pattern: "monthly", start_date: first of next month

Extract ALL actionable tasks that are EXPLICITLY mentioned in the brain dump. DO NOT add preparatory, setup, or follow-up tasks unless the user specifically requests them. Capture ALL details, context, research, ideas, and observations in the task details field. Nothing from the brain dump should be lost.

## Generate Project Questions:
Generate 3-5 NEW questions that:
- Help the user think about the next steps based off of the project's current state and the new info coming from the braindump
- Help clarify vague aspects or ambiguous requirements
- Identify critical decisions that need to be made
- Break down complex problems into manageable steps
- Surface potential blockers, risks, or resource needs
- Move the project forward with concrete next steps

Questions should:
- Be specific and actionable and reference something specific in the project
- Spark creative thinking for productive future braindumps

Question categories:
- **clarification**: Define vague concepts
- **decision**: Force choices on open items
- **planning**: Break down large tasks
- **risk**: Identify potential obstacles
- **resource**: Clarify needs and constraints

Include these questions in your response within the main JSON structure:

## Complete Response Format:
```json
{
  "title": "Brief title for this extraction",
  "summary": "2-3 sentence summary of what was extracted",
  "insights": "Key insights from the braindump",
  "tags": ["relevant", "tags"],
  "metadata": {
    "processingNote": "Any notes about how the braindump was processed"
  },
  "operations": [
    {
      "id": "op-1234567890-task-update-1",
      "table": "tasks",
      "operation": "update",
      "data": {
        "id": "task-123",
        "status": "in_progress",
        "priority": "high",
        "duration_minutes": 120,
        "start_date": "2024-03-15T14:00:00",
        "details": "Added implementation details, research notes, observations from brain dump. Include all context...",
        "tags": ["urgent", "backend"]
      }
    },
    {
      "id": "op-1234567890-task-create-1",
      "table": "tasks",
      "operation": "create",
      "data": {
        "title": "New task from brain dump",
        "description": "Brief task summary",
        "details": "COMPREHENSIVE: All implementation details, research notes, ideas, observations, references, and any other context from the brain dump related to this task. Nothing should be lost.",
        "project_id": "fe85feb9-3c38-4f32-b598-2bf2d4ad0d25",
        "priority": "medium",
        "status": "backlog",
        "task_type": "one_off",
        "duration_minutes": 60,
        "start_date": "2024-03-16T10:30:00",
        "tags": ["feature", "api"]
      }
    },
    {
      "id": "op-1234567890-task-create-2",
      "table": "tasks",
      "operation": "create",
      "data": {
        "title": "Daily standup meeting",
        "description": "Morning team sync",
        "details": "Quick 15-minute sync to share updates and blockers",
        "project_id": "fe85feb9-3c38-4f32-b598-2bf2d4ad0d25",
        "priority": "medium",
        "status": "backlog",
        "task_type": "recurring",
        "duration_minutes": 15,
        "start_date": "2024-03-15T09:00:00",
        "recurrence_pattern": "daily",
        "recurrence_ends": null,
        "tags": ["meeting", "daily"]
      }
    }
  ],
  "questionAnalysis": {
    // Only if questions were displayed before braindump
    "[questionId]": {
      "wasAnswered": boolean,
      "answerContent": "extracted answer or null"
    }
  },
  "projectQuestions": [
    {
      "question": "Specific, actionable question text",
      "category": "clarification|decision|planning|risk|resource",
      "priority": "high|medium|low",
      "context": "Why this question matters now",
      "expectedOutcome": "What information or decision this should produce"
    }
  ]
}
```

Respond with valid JSON matching the complete structure above.
```

## User Prompt

```
## Current Project Data:

**EXISTING TASKS (20):**
[{"id":"6d14404f-48d3-451c-a083-6bbee7183aad","title":"Revise Writing Style","status":"backlog","priority":"high","task_type":"one_off","start_date":"2025-10-20T13:00:00+00:00","duration_minutes":120,"description":"Implement writing style improvements based on critique group feedback.","details":"Search and destroy excessive adverbs, vary sentence structure, avoid using 'suddenly' as a crutch, and enhance sensory details in action scenes."},{"id":"20f048ce-84cf-4285-b7d0-329482816f45","title":"Create Series Bible","status":"backlog","priority":"medium","task_type":"one_off","start_date":"2025-10-07T15:00:00+00:00","duration_minutes":90,"description":"Develop a series bible if 'The Last Ember' becomes Book 1.","details":"This document will outline characters, settings, and plot arcs for future books."},{"id":"8e44df73-95a7-43b4-9275-7b2c7f0a0c0f","title":"Write Short Stories in Same Universe for Magazines","status":"backlog","priority":"medium","task_type":"one_off","start_date":"2025-10-07T13:00:00+00:00","duration_minutes":120,"description":"Create short stories set in the same universe as 'The Last Ember' for submission to magazines.","details":"These stories will help build the author's portfolio and audience."},{"id":"f974b88b-4891-4294-a7da-f4d098d06a60","title":"Start Building Author Platform on Social Media","status":"backlog","priority":"medium","task_type":"recurring","start_date":"2025-10-04T00:00:00+00:00","duration_minutes":60,"description":"Begin establishing a presence on social media platforms.","details":"Focus on platforms that resonate with the target audience for 'The Last Ember'."},{"id":"2b7180ac-def3-4d84-9c1f-5b60df3b2542","title":"Set Up Author Website and Newsletter","status":"backlog","priority":"medium","task_type":"one_off","start_date":"2025-10-06T13:00:00+00:00","duration_minutes":180,"description":"Create an author website and set up a newsletter for 'The Last Ember'.","details":"Include sections for book information, blog posts, and newsletter sign-up."},{"id":"de0e578f-4bde-4384-b24f-1ada3659d1cf","title":"Plan Pre-Launch Marketing Campaign","status":"backlog","priority":"medium","task_type":"one_off","start_date":"2025-10-07T18:30:00+00:00","duration_minutes":120,"description":"Develop a marketing campaign for the pre-launch of 'The Last Ember'.","details":"Outline strategies for social media, email newsletters, and other promotional activities."},{"id":"c28149b3-2857-4789-913e-df6a05e094ac","title":"Find Cover Artist Specializing in Fantasy","status":"backlog","priority":"medium","task_type":"one_off","start_date":"2025-10-07T15:30:00+00:00","duration_minutes":60,"description":"Research and contact cover artists who specialize in fantasy book covers.","details":"Select an artist whose style aligns with 'The Last Ember'."},{"id":"0a8e1b0a-7df8-44e2-9077-233d34fe5cc9","title":"Budget for Professional Editing","status":"backlog","priority":"high","task_type":"one_off","start_date":"2025-10-06T15:00:00+00:00","duration_minutes":30,"description":"Allocate a budget of $3000 for professional editing.","details":"This budget will cover the costs associated with hiring an editor for 'The Last Ember'."},{"id":"46ccd838-ebdd-4ace-9403-54e091f83792","title":"Prepare First 3 Chapters as Sample","status":"in_progress","priority":"high","task_type":"one_off","start_date":"2025-10-06T16:00:00+00:00","duration_minutes":120,"description":"Select and format the first 3 chapters of 'The Last Ember' as a sample for agents.","details":"Select and format the first 3 chapters of 'The Last Ember' as a sample for agents. Major revisions needed based on critique group feedback: Chapter 1 - Open with action, strengthen Elena's voice, cut 3 pages of world history. Chapter 2 - Make Master Thorne's dialogue more archaic, add scene showing Elena's daily forge work, add obstacles to the dragon forge discovery. Chapter 3 - Move prophecy reveal to chapter 5, focus on Elena's emotional journey, add conflict with Kai about her destiny."},{"id":"e0578f40-d417-4ef4-aebd-d3cbb08fb28e","title":"Research Fantasy Literary Agents","status":"backlog","priority":"medium","task_type":"one_off","start_date":"2025-10-06T14:00:00+00:00","duration_minutes":60,"description":"Compile a list of literary agents who represent fantasy authors.","details":"Focus on agents who have represented authors like Brandon Sanderson and Robin Hobb."},{"id":"dc16fb6f-7910-4771-b106-58fb5f18cca8","title":"Create 1-Page Synopsis","status":"backlog","priority":"high","task_type":"one_off","start_date":"2025-10-03T15:00:00+00:00","duration_minutes":60,"description":"Draft a concise 1-page synopsis of 'The Last Ember'.","details":"This synopsis will summarize the plot and main characters for agents."},{"id":"b033757a-fc7d-4565-88c3-fa4ece8fca8e","title":"Write Query Letter","status":"backlog","priority":"high","task_type":"one_off","start_date":"2025-10-03T13:00:00+00:00","duration_minutes":120,"description":"Draft a query letter for literary agents.","details":"This letter will be used to pitch 'The Last Ember' to agents."},{"id":"a12e36fd-0084-40ab-8070-a1c7321627a5","title":"Write character profiles for the antagonist","status":"backlog","priority":"high","task_type":"one_off","start_date":"2025-10-27T13:00:00+00:00","duration_minutes":60,"description":"Develop a detailed profile for the antagonist.","details":"The antagonist is The Shadow King. Explore his motivations, background, and how he opposes the main character. He was once a hero who saved the kingdom 500 years ago but was corrupted by the very magic he used to save everyone. He seeks Elena because only Dragon Smith weapons can free him from his curse."},{"id":"50662999-4861-4037-a195-63add9925786","title":"Develop main character backstory","status":"backlog","priority":"high","task_type":"one_off","start_date":"2025-10-23T13:00:00+00:00","duration_minutes":60,"description":"Create a detailed backstory for the main character.","details":"The main character is an orphan raised by a master blacksmith. Explore her childhood, motivations, and how her upbringing influences her abilities and personality. Elena lost her parents in a dragon attack at age 5 and was raised by Master Thorne, who found her in the ruins. She has recurring nightmares about fire and a secret: she is actually descended from the original Dragon Smiths. Master Thorne, a former royal blacksmith, is dying from lung disease from years at the forge and knows Elena's true heritage but keeps it secret."},{"id":"61e9b969-6465-498e-b6da-86657d0f94cc","title":"Outline first three chapters","status":"in_progress","priority":"high","task_type":"one_off","start_date":"2025-10-21T13:00:00+00:00","duration_minutes":60,"description":"Create an outline for the initial chapters of the novel.","details":"Create an outline for the initial chapters of the novel. Incorporate feedback from the critique group: Chapter 1 - Opening too slow, start with action; Chapter 2 - Add scene showing Elena's daily forge work; Chapter 3 - Restructure to focus on emotional journey and conflict with Kai. Additionally, brainstorm alternatives for how Elena escapes the shadow realm in Chapter 15. Consider options where she doesn't escape or is rescued by someone else."},{"id":"d7de131a-6f7a-4ac2-bc08-8a87daced7cb","title":"Research Literary Agents for Fantasy Genre","status":"backlog","priority":"medium","task_type":"one_off","start_date":"2025-10-24T13:00:00+00:00","duration_minutes":60,"description":"Compile a list of literary agents who represent fantasy authors.","details":"Focus on agents who have a good track record with fantasy novels."},{"id":"5d42af49-1fb0-499e-b508-3f15034d509b","title":"Research medieval blacksmithing techniques","status":"backlog","priority":"medium","task_type":"one_off","start_date":"2025-10-22T13:00:00+00:00","duration_minutes":60,"description":"Gather information on blacksmithing techniques from the medieval period.","details":"Focus on tools, methods, and materials used in blacksmithing to ensure authenticity in the novel's portrayal of the main character's craft."},{"id":"85569ced-d948-43e8-b683-851b17cc4e1e","title":"Map out the kingdom of Aethermoor","status":"backlog","priority":"medium","task_type":"one_off","start_date":"2025-10-20T13:00:00+00:00","duration_minutes":60,"description":"Create a detailed map of the kingdom.","details":"Include key locations, geographical features, and any significant landmarks that will play a role in the story."},{"id":"8fb923f2-dba0-4dbe-9779-f7c900c0fc30","title":"Design the prophecy","status":"in_progress","priority":"high","task_type":"one_off","start_date":"2025-10-21T13:00:00+00:00","duration_minutes":60,"description":"Create a prophecy that drives the plot of the novel.","details":"Create a prophecy that drives the plot of the novel. Additionally, strengthen the dialogue between Elena and Master Thorne, address the slow pacing in the middle of chapter 2, and add more sensory details about the forge."},{"id":"a658aa07-23e0-49d0-9693-98ec377ef498","title":"Create magic system","status":"backlog","priority":"high","task_type":"one_off","start_date":"2025-10-20T15:00:00+00:00","duration_minutes":60,"description":"Develop a unique magic system for the novel.","details":"The magic system should be based on metal and fire, detailing how it works, its limitations, and its impact on the world and characters."}]

---

Extract and update tasks from the following brain dump, also keep in mind that the brain dump may contain instructions for organizing the info:

need to fix chapter 4. Chapter 4 is about tim the cat. need to flesh that out
```

## Token Estimates

- **System Prompt:** ~2141 tokens
- **User Prompt:** ~2422 tokens
- **Total Estimate:** ~4563 tokens

---
*This file is automatically generated in development mode for prompt auditing purposes.*
