# Prompt Audit: existing-project-dual-tasks

**Generated at:** 2025-10-17T04:18:06.097Z
**Environment:** Development


## Metadata

```json
{
  "userId": "255735ad-a34b-4ca9-942c-397ed8cc1435",
  "projectId": "19ddbf78-2e62-4bdf-bcb1-7e1a9626d5b4",
  "brainDumpLength": 174,
  "existingTasksCount": 20,
  "hasDisplayedQuestions": false,
  "timestamp": "2025-10-17T04:18:06.097Z"
}
```


## System Prompt

```
You are a task extraction engine that can CREATE new tasks or UPDATE existing ones.

Mode: Extract/Update for EXISTING project 19ddbf78-2e62-4bdf-bcb1-7e1a9626d5b4

**IMPORTANT CONTEXT:**
Current date and time: 2025-10-17T04:18:02.779Z

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
  "project_id": "19ddbf78-2e62-4bdf-bcb1-7e1a9626d5b4",
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
        "details": "Added implementation details, research notes, observations from brain dump. Include all context..."
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
        "project_id": "19ddbf78-2e62-4bdf-bcb1-7e1a9626d5b4",
        "priority": "medium",
        "status": "backlog",
        "task_type": "one_off",
        "duration_minutes": 60,
        "start_date": "2024-03-16T10:30:00"
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
        "project_id": "19ddbf78-2e62-4bdf-bcb1-7e1a9626d5b4",
        "priority": "medium",
        "status": "backlog",
        "task_type": "recurring",
        "duration_minutes": 15,
        "start_date": "2024-03-15T09:00:00",
        "recurrence_pattern": "daily",
        "recurrence_ends": null
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
[{"id":"4dba8e6d-dd0d-41b5-a57d-4a044e88e604","title":"Create series bible","status":"in_progress","priority":"medium","task_type":"one_off","duration_minutes":120,"description":"Develop a series bible if 'The Last Ember' becomes Book 1 of a series.","details":"Develop a series bible if 'The Last Ember' becomes Book 1 of a series. Include character profiles, plot outlines, and world-building details."},{"id":"72dd28a6-c708-4f5a-a86d-abededd9d5f2","title":"Write short stories in the same universe","status":"in_progress","priority":"medium","task_type":"one_off","duration_minutes":120,"description":"Create short stories set in the same universe as 'The Last Ember' for submission to magazines.","details":"Create short stories set in the same universe as 'The Last Ember' for submission to magazines. These stories can help build the author's profile and engage readers."},{"id":"8f5d4cca-8f80-4794-8344-3dcfeaa7715b","title":"Start building author platform on social media","status":"in_progress","priority":"medium","task_type":"one_off","duration_minutes":60,"description":"Begin establishing a presence on social media platforms relevant to the target audience.","details":"Begin establishing a presence on social media platforms relevant to the target audience. Focus on platforms like Twitter, Instagram, and Facebook to connect with readers and other authors."},{"id":"7bed4c78-aeb5-4c29-852f-9f497cdb91f8","title":"Set up author website and newsletter","status":"in_progress","priority":"medium","task_type":"one_off","duration_minutes":180,"description":"Create an author website and set up a newsletter to engage with readers.","details":"Create an author website and set up a newsletter to engage with readers. Include sections for book updates, blog posts, and a sign-up form for the newsletter."},{"id":"3777388b-9b13-4631-bae0-618564983be1","title":"Plan pre-launch marketing campaign","status":"in_progress","priority":"medium","task_type":"one_off","duration_minutes":120,"description":"Develop a marketing campaign to promote 'The Last Ember' before its launch.","details":"Develop a marketing campaign to promote 'The Last Ember' before its launch. Include strategies for social media, email newsletters, and potential book giveaways."},{"id":"13e6205b-e026-490e-8be0-7094401b58ba","title":"Find cover artist specializing in fantasy","status":"in_progress","priority":"medium","task_type":"one_off","duration_minutes":60,"description":"Research and hire a cover artist who specializes in fantasy book covers.","details":"Research and hire a cover artist who specializes in fantasy book covers. Look for artists with a portfolio that aligns with the vision for 'The Last Ember'."},{"id":"a9684c28-a8f7-41ea-894a-2ac1f38b1eb3","title":"Budget for professional editing","status":"in_progress","priority":"high","task_type":"one_off","duration_minutes":30,"description":"Allocate a budget of $3000 for professional editing services.","details":"Allocate a budget of $3000 for professional editing services. Research and select an editor who specializes in fantasy novels."},{"id":"483316c7-143d-40da-80be-965eb0824af4","title":"Prepare first 3 chapters as sample","status":"in_progress","priority":"high","task_type":"one_off","duration_minutes":180,"description":"Format and finalize the first three chapters for submission to agents.","details":"Format and finalize the first three chapters for submission to agents. Ensure that the chapters are polished and represent the best of the writing. Major revisions needed based on critique group feedback: Chapter 1 - Opening is too slow; start with action not description. Elena needs a stronger voice from page 1. Cut the 3 pages of world history and weave it in later. Chapter 2 - Master Thorne's dialogue is too modern; needs a more archaic feel. Add a scene showing Elena's daily forge work before the discovery. The dragon forge discovery happens too easily; add obstacles. Chapter 3 - Move the prophecy reveal to chapter 5. Focus on Elena's emotional journey. Add more conflict with Kai about her destiny."},{"id":"98161950-886b-4f28-bd26-0f5a230dd85a","title":"Research fantasy literary agents","status":"in_progress","priority":"medium","task_type":"one_off","duration_minutes":120,"description":"Identify and research literary agents who represent authors like Brandon Sanderson and Robin Hobb.","details":"Identify and research literary agents who represent authors like Brandon Sanderson and Robin Hobb. Focus on agents who specialize in fantasy and have a good track record with debut authors."},{"id":"035ba222-5fe4-4743-bb99-f82d12a917bf","title":"Create 1-page synopsis","status":"in_progress","priority":"high","task_type":"one_off","duration_minutes":60,"description":"Write a concise 1-page synopsis of 'The Last Ember'.","details":"Write a concise 1-page synopsis of 'The Last Ember'. This synopsis should capture the essence of the story, main characters, and key plot points."},{"id":"4fc9be18-42bd-404b-a261-498bc90949a1","title":"Write query letter","status":"in_progress","priority":"high","task_type":"one_off","duration_minutes":60,"description":"Draft a query letter for literary agents.","details":"Draft a query letter for literary agents. This letter should succinctly summarize the novel and entice agents to request more material."},{"id":"5b08e2a7-e1f3-4bd0-a243-46b6b382da9d","title":"Develop supporting cast profiles","status":"backlog","priority":"high","task_type":"one_off","duration_minutes":120,"description":"Create detailed profiles for supporting characters.","details":"Supporting cast includes: Kai, Elena's childhood friend, now city guard and potential love interest; Lady Morgana, court wizard who suspects Elena's powers; The Herald, Shadow King's servant, formerly Elena's thought-dead mother."},{"id":"116eff2f-1968-43c9-a7fc-a1b5da525999","title":"Develop The Shadow King's character profile","status":"backlog","priority":"high","task_type":"one_off","duration_minutes":120,"description":"Create a detailed profile for The Shadow King.","details":"The Shadow King was once a hero who saved the kingdom 500 years ago but was corrupted by the very magic he used to save everyone. He seeks Elena because only Dragon Smith weapons can free him from his curse."},{"id":"38566d91-a557-4a70-8a9b-d469f304466e","title":"Develop Master Thorne's character profile","status":"backlog","priority":"high","task_type":"one_off","duration_minutes":120,"description":"Create a detailed profile for Master Thorne.","details":"Master Thorne is a former royal blacksmith, exiled for refusing to make weapons for an unjust war. He knows Elena's true heritage but keeps it secret and is dying from lung disease from years at the forge."},{"id":"430fbaf5-3066-45af-a83a-4b4527ad4240","title":"Design the prophecy","status":"backlog","priority":"high","task_type":"one_off","duration_minutes":90,"description":"Create a prophecy that drives the plot.","details":"The prophecy should be integral to the story, hinting at the main character's journey and the conflict with The Shadow King."},{"id":"1ccfcc52-d6f7-4857-a715-14d358645832","title":"Research medieval blacksmithing techniques","status":"backlog","priority":"medium","task_type":"one_off","duration_minutes":120,"description":"Gather information on medieval blacksmithing.","details":"Focus on techniques that could be relevant to the main character's abilities and the creation of magical weapons."},{"id":"305558da-94ae-4d03-9b52-a6adee8b776e","title":"Outline first three chapters","status":"backlog","priority":"high","task_type":"one_off","duration_minutes":180,"description":"Create an outline for the first three chapters of the novel.","details":"Detail the main events, character introductions, and plot developments that will occur in these chapters. Address the following issues from chapter 2: strengthen the dialogue between Elena and Master Thorne, improve pacing in the middle, and add more sensory details about the forge. For chapter 3, include Elena's first attempt at magical forging, introduce the Shadow King's herald, and foreshadow the prophecy. Fix continuity issue regarding Elena's age, which is mentioned as 16 in chapter 1 and 17 in chapter 2. Additional writing style notes: too many adverbs - search and destroy; vary sentence structure more; stop using 'suddenly' as a crutch; better sensory details in action scenes."},{"id":"9e221f76-aa6a-4841-ab28-076302fc0f4d","title":"Write character profiles for the antagonist","status":"backlog","priority":"high","task_type":"one_off","duration_minutes":120,"description":"Develop detailed profiles for the antagonist.","details":"The antagonist is The Shadow King. Explore his motivations, backstory, and how he opposes the main character."},{"id":"7f8cf25f-db90-42fd-b931-5b099c411f1b","title":"Map out the kingdom of Aethermoor","status":"backlog","priority":"medium","task_type":"one_off","duration_minutes":240,"description":"Create a detailed map of the kingdom.","details":"Include key locations, geographical features, and any relevant lore that will enhance the story's setting. New world-building additions: The Forge Temples: ancient sites where dragon fire still burns, Smith's Guild hierarchy and traditions, The Quenching Ritual: how magical weapons are completed, Regional differences in forging techniques across Aethermoor."},{"id":"f4946f19-9bd1-4023-bd42-d8b923a710b8","title":"Create magic system","status":"backlog","priority":"high","task_type":"one_off","duration_minutes":180,"description":"Develop a unique magic system for the novel.","details":"The magic system should be based on metal and fire, detailing how it works, its limitations, and its impact on the world and characters. Found interesting parallels with Japanese sword-making traditions - the idea of the smith's spirit entering the blade. Could adapt this: Elena's emotions during forging affect the weapon's properties. Anger = fire damage, Sorrow = ice/frost, Joy = healing properties, Fear = defensive shields. Also researching Damascus steel patterns for visual descriptions, Celtic mythology about smith gods (Goibniu), and types of medieval weapons beyond swords."}]

---

Extract and update tasks from the following brain dump, also keep in mind that the brain dump may contain instructions for organizing the info:

Completely stuck on chapter 15. Can't figure out how Elena escapes the shadow realm. Maybe she shouldn't escape? Or someone else rescues her? Need to brainstorm alternatives.
```

## Token Estimates

- **System Prompt:** ~2113 tokens
- **User Prompt:** ~2643 tokens
- **Total Estimate:** ~4755 tokens


---
*This file is automatically generated in development mode for prompt auditing purposes.*
