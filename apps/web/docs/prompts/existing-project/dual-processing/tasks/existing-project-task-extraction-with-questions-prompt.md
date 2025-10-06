# Prompt Audit: existing-project-dual-tasks-with-questions

**Generated at:** 2025-10-06T00:29:17.444Z
**Environment:** Development

## Metadata

```json
{
	"userId": "255735ad-a34b-4ca9-942c-397ed8cc1435",
	"projectId": "795ef317-aaae-4365-957d-ec443b11c83b",
	"brainDumpLength": 527,
	"existingTasksCount": 20,
	"hasDisplayedQuestions": true,
	"timestamp": "2025-10-06T00:29:17.444Z"
}
```

## System Prompt

````
You are a task extraction engine that can CREATE new tasks or UPDATE existing ones.

Mode: Extract/Update for EXISTING project 795ef317-aaae-4365-957d-ec443b11c83b

**IMPORTANT CONTEXT:**
Current date and time: 2025-10-06T00:29:13.596Z

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
  "project_id": "795ef317-aaae-4365-957d-ec443b11c83b",
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

**CRITICAL - TASK DETAILS CAPTURE**:
The `details` field is the user's memory and context repository. Capture EVERYTHING related to each task:
- **ALL implementation specifics**: Technical approaches, code patterns, libraries, frameworks mentioned
- **ALL research notes**: Links, references, inspiration, examples from the brain dump
- **ALL ideas and observations**: User's thoughts, concerns, questions, "maybes"
- **ALL context and background**: Why this task matters, dependencies, constraints
- **ALL rationale**: The "why" behind decisions or approaches
- **User's emotional context**: Excitement, concerns, uncertainties ("worried about...", "excited to...")
- **Timeline thoughts**: When they want it done, urgency, deadlines mentioned
- **Non-actionable info**: Anything that provides context even if not directly actionable

**RULE**: Nothing from the brain dump should be lost. If it's not a task title/description, it MUST go in the details field. Err on the side of including TOO MUCH rather than too little. The details field can be long - that's good!

**FOR UPDATES**: When updating existing tasks, ADD new details from the brain dump to the existing details field - don't replace unless the user explicitly says to replace

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

## Questions to Analyze:
- Question 146b7d4a-0db3-4d0d-afec-127cb1fea85a: "Are there any specific goals or outcomes expected from reaching out to Carl and EZ?"
- Question a039f774-5a0c-429c-a953-438172edf28c: "How will the context chooser integrate with existing BuildOS features?"
- Question 53c3c3a6-e093-4ba2-a0a4-9f75b04a2214: "What criteria should the context chooser use to identify relevant bits from a brain dump?"

Determine if each question was addressed in the braindump. Include in your response:
"questionAnalysis": {
  "[questionId]": {
    "wasAnswered": boolean,
    "answerContent": "extracted answer if addressed, null otherwise"
  }
}


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
        "project_id": "795ef317-aaae-4365-957d-ec443b11c83b",
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
        "project_id": "795ef317-aaae-4365-957d-ec443b11c83b",
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
````

Respond with valid JSON matching the complete structure above.

```

## User Prompt

```

## Current Project Data:

**EXISTING TASKS (18):**
[{"id":"a4ba6ac4-6fc3-4128-8677-f0c6854a7ed3","title":"Create basic chat interface for LLM","status":"backlog","priority":"high","task_type":"one_off","duration_minutes":30,"description":"Develop a basic chat interface to enable interaction with an LLM.","details":"This chat interface is a prerequisite for progressing to the Project World War."},{"id":"51abc3cd-50a0-492e-8285-222a5a27ee1e","title":"Create context chooser for brain dump","status":"backlog","priority":"medium","task_type":"one_off","duration_minutes":30,"description":"Develop a context chooser feature to help users select relevant bits from their brain dump prompts.","details":"Based on the user's prompt, identify and synthesize relevant bits to create a context chooser for brain dumps."},{"id":"9ef29ef9-cb11-419e-9c21-60a31be6cfb6","title":"Reach out to Carl and EZ","status":"backlog","priority":"medium","task_type":"one_off","start_date":"2025-09-27T00:00:00+00:00","duration_minutes":30,"description":"Contact Carl and EZ to discuss BuildOS.","details":"Need to reach out to Carl and EZ."},{"id":"d6622f87-a5c2-414a-aaac-4db6b259c255","title":"Reach out to Tim Hissa","status":"backlog","priority":"medium","task_type":"one_off","start_date":"2025-09-27T00:00:00+00:00","duration_minutes":30,"description":"Send a message to Tim Hissa."},{"id":"bfb2d116-70c3-491c-bbdc-ba14ee342f49","title":"Restructure project architecture","status":"backlog","priority":"high","task_type":"one_off","start_date":"2025-09-26T00:00:00+00:00","duration_minutes":60,"description":"Reorganize project components including BuildOS app, worker, and Twilio client","details":"Restructure project to separate BuildOS app, worker, and Twilio client components for message sending functionality"},{"id":"84c16256-24e6-473d-8052-f2198c332d97","title":"Build notification center for to-do list reminders","status":"backlog","priority":"medium","task_type":"one_off","start_date":"2025-09-26T00:00:00+00:00","duration_minutes":60,"description":"Create a notification center that texts users information about their to-do list with opt-in reminders","details":"Use Twilio for messaging. Estimated cost: $3-$4 to send 10 messages per day, approximately $3 per month per user."},{"id":"4df7e2a2-2ed6-4586-9a2c-8c44c014a7f1","title":"Comprehensive Security Enhancements for BuildOS","status":"backlog","priority":"high","task_type":"one_off","start_date":"2025-09-26T19:00:00+00:00","duration_minutes":60,"description":"Develop and integrate robust security measures across the platform, focusing on user profile protection and overall system security."},{"id":"5678bf3f-f561-4337-83be-beabd282aaf2","title":"Implement 'focus for the day' data model & UI","status":"backlog","priority":"high","task_type":"one_off","start_date":"2025-09-26T00:00:00+00:00","duration_minutes":30,"description":"Add support for per-user daily focus state and integrate with task movement."},{"id":"b976c390-ba5f-4656-bcde-3aebf1989988","title":"Finish Project War Room feature","status":"in_progress","priority":"high","task_type":"one_off","start_date":"2025-09-25T23:40:00+00:00","duration_minutes":60,"description":"Complete the development of the Project War Room feature.","details":"Need to finish up the Project War Room feature. The Project War Room is where users can stress test their ideas and projects. It will be a separate page, and most of the specification is already filled out. Building needs to start soon. This feature will be a major offering for BuildOS, contributing to a higher tier paid offering. Users will pay to enter the War Room."},{"id":"a71adda5-f4bb-4b9e-b572-f75e0caf3b98","title":"Update public page lingo for ADHD users and AI-first focus","status":"backlog","priority":"high","task_type":"one_off","start_date":"2025-09-23T00:00:00+00:00","duration_minutes":30,"description":"Revise public page content to center around ADHD users and emphasize AI-first project organization","details":"Update lingo on public pages to focus on ADHD users and highlight BuildOS as an AI-first project organization tool"},{"id":"60c3505e-beff-4fae-b3b5-1a693e811509","title":"Clean up lingo on public pages","status":"backlog","priority":"high","task_type":"one_off","start_date":"2025-09-23T00:00:00+00:00","duration_minutes":30,"description":"Revise and clean up the language on public pages including the investor page and about page.","details":"I need to clean up the lingo inside my public Pages like the investor page and the about page"},{"id":"84cffc7e-3d51-49a1-81bc-9e1d1222e757","title":"Finish pitch deck for investor Tim Hissa","status":"backlog","priority":"high","task_type":"one_off","start_date":"2025-09-23T00:00:00+00:00","duration_minutes":30,"description":"Complete the pitch deck to present to investor Tim Hissa.","details":"I need to finish the pitch deck to pitch the investor Tim hissa"},{"id":"95ebf5f0-c7d7-4d81-b494-4e0775fdd1eb","title":"Retest everything in BuildOS for stabilization","status":"backlog","priority":"high","task_type":"one_off","start_date":"2025-09-23T00:00:00+00:00","duration_minutes":30,"description":"Conduct comprehensive testing to ensure all components of BuildOS are stable.","details":"Retest everything make sure everything is stabilized within build OS"},{"id":"eec11dff-ee8b-4f53-913c-365ee4f5cb0f","title":"Test BuildLS context updates","status":"backlog","priority":"medium","task_type":"one_off","start_date":"2025-09-22T00:00:00+00:00","duration_minutes":30,"description":"Ensure context updates properly preserve and update context","details":"Test the BuildLS context updates to verify proper context preservation and updating"},{"id":"9d45bcc7-d9dd-43b6-af27-23faf951bfaf","title":"Create template ontologies for different project types in BuildOS","status":"backlog","priority":"medium","task_type":"one_off","duration_minutes":30,"description":"Develop template ontologies to standardize various project types within BuildOS.","details":"Identify key project types and create structured ontologies for each to enhance organization and usability within BuildOS."},{"id":"b2a55e12-e2f1-43d2-97f6-b71462674941","title":"Message Tim","status":"backlog","priority":"medium","task_type":"one_off","start_date":"2025-09-26T00:00:00+00:00","duration_minutes":30,"description":"Send a message to Tim.","details":"Need to message Tim hisa late next week."},{"id":"7b971fff-2170-439e-9d40-34f5c6ac69ac","title":"Create detailed BuildOS guide for people with ADHD","status":"backlog","priority":"high","task_type":"one_off","start_date":"2025-09-19T00:00:00+00:00","duration_minutes":30,"description":"Draft a BuildOS user guide targeted at people with ADHD, as the top-priority audience for the guides release.","details":"Priority order for BuildOS guides release: 1) people with ADHD (this guide), 2) Tech project managers, 3) riders in high school students. Create a focused guide that addresses ADHD-specific workflows and pain points."},{"id":"4edf971f-f32c-4684-bc8b-0d694a82548b","title":"Create detailed BuildOS guide for people with ADHD","status":"backlog","priority":"high","task_type":"one_off","duration_minutes":60,"description":"Design and publish a BuildOS guide tailored to people with ADHD — this is the first guide to release.","details":"COMPREHENSIVE: This guide is the top-priority release. Focus on ADHD-friendly structure and UX: short, bite-sized steps; clear (plain) language; prioritized checklists; templates for timeboxing and Pomodoro-style work; visual cues and progress indicators; instructions for setting and using the 'focus for the day' feature; examples of ruthless prioritization mode applied to common ADHD workflows; quick-start walkthrough, 1-page cheat-sheets, and short video screencasts. Include accessibility considerations (readability, font choices, contrast), suggestions for notifications and reminders, and sample daily routines tailored to typical ADHD challenges (e.g., overwhelm, task initiation). Provide explicit examples: how to take a large project and break it into 15–60 minute tasks, how to set the day's focus and move tasks into focus, templates for repeatable workflows, and troubleshooting tips..."}]

---

Extract and update tasks from the following brain dump, also keep in mind that the brain dump may contain instructions for organizing the info:

These are dashboard ideas and notes on adhd

I want to create an “i did a thing” log bar on the dashboard.

Also rings are better than bars

Give nudges not nags

Optional reminders phrased as questions: “Ready to look at tasks?”

Snooze tasks

The golden rule: Every feature should answer “Does this make it EASIER to start?” If it adds friction, cut it. ADHD brains need momentum, not perfection.

“You haven’t checked in today” vs “YOU HAVE 47 OVERDUE TASKS”

https://claude.ai/share/f8ef480a-090b-49d9-88b5-50f111d7ae5e

```

## Token Estimates

- **System Prompt:** ~2305 tokens
- **User Prompt:** ~2226 tokens
- **Total Estimate:** ~4531 tokens

---
*This file is automatically generated in development mode for prompt auditing purposes.*
```
