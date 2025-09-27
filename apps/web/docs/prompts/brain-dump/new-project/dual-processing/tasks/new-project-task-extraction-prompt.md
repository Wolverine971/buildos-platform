# Prompt Audit: new-project-dual-tasks

**Generated at:** 2025-09-27T00:04:59.031Z
**Environment:** Development

## Metadata

```json
{
	"userId": "255735ad-a34b-4ca9-942c-397ed8cc1435",
	"projectId": null,
	"brainDumpLength": 4080,
	"existingTasksCount": 0,
	"hasDisplayedQuestions": false,
	"timestamp": "2025-09-27T00:04:59.031Z"
}
```

## System Prompt

````
A user just brain dumped information about a project and you are a task extraction engine.

## Your Job:
Create all tasks that are specified in the braindump but DO NOT proactively create preparatory, setup, or follow-up tasks unless the user explicitly instructs you to in the brain dump (e.g., "create setup tasks for X", "add follow-up tasks")

## Task Creation Model:

// For CREATE:
{
  "operation": "create",
  "title": "New task title (required)",
  "project_ref": "new-project-1",
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
- Nothing from the brain dump should be lost - if it's not a task title/description, it goes in details
- All tasks will use project_ref: "new-project-1" to link to the project being created

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
      "id": "op-1234567890-task-create-1",
      "table": "tasks",
      "operation": "create",
      "data": {
        "title": "Task title from brain dump",
        "description": "Brief task summary",
        "details": "COMPREHENSIVE: All implementation details, research notes, ideas, observations, references, and any other context from the brain dump related to this task. Nothing should be lost.",
        "project_ref": "new-project-1",
        "priority": "medium",
        "status": "backlog",
        "task_type": "one_off"
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

Extract and update tasks from the following brain dump, also keep in mind that the brain dump may contain instructions for organizing the info:

# BuildOS CEO Training Sprint

**Start Date:** September 13, 2025 | **Daily Sessions:** 7:00 AM | **Duration:** 30 Days

## 📎 PURPOSE

Transform DJ from founder to world-class CEO capable of raising Series A and scaling BuildOS to unicorn status.

## 🎯 OBJECTIVE

In 30 days, achieve complete fluency in investor communications, metrics mastery, and strategic vision required to close a $5M+ round at a $25M+ valuation.

## 🔥 OVERVIEW

Daily 90-minute sprint sessions combining knowledge transfer, practical exercises, and real-world application. Each day builds on the previous, culminating in a pitch-ready CEO who can command any room.

## 📅 30-DAY TRAINING CALENDAR

### **WEEK 1: NUMBERS & NARRATIVE** (Sept 13-19)

**Day 1 - Sat 9/13:** TAM/SAM/SOM Calculation + BuildOS Market Sizing Exercise  
**Day 2 - Sun 9/14:** Unit Economics Mastery (CAC, LTV, Payback, Burn Rate)  
**Day 3 - Mon 9/15:** Financial Modeling - Build 3 Scenarios (Bear/Base/Bull)  
**Day 4 - Tue 9/16:** The Perfect Problem Statement - 10 Variations  
**Day 5 - Wed 9/17:** Solution Positioning - "Why BuildOS Wins" Thesis  
**Day 6 - Thu 9/18:** Traction Story - Turn Your Beta Users into Proof Points  
**Day 7 - Fri 9/19:** 2-Minute Pitch Recording + Self-Review Session

### **WEEK 2: INVESTOR INTELLIGENCE** (Sept 20-26)

**Day 8 - Sat 9/20:** VC Pattern Matching - Study 20 Productivity Investments  
**Day 9 - Sun 9/21:** Competitive Analysis - Notion/Monday/Asana Teardown  
**Day 10 - Mon 9/22:** Building Your Moat - Context Accumulation Defense  
**Day 11 - Tue 9/23:** Growth Loops Design - Viral Mechanics for BuildOS  
**Day 12 - Wed 9/24:** Metrics Dashboard Build - Screenshot-Ready Analytics  
**Day 13 - Thu 9/25:** Objection Handling - 20 Tough Questions + Answers  
**Day 14 - Fri 9/26:** Mock Pitch #1 with Recorded Feedback

### **WEEK 3: GROWTH & EXECUTION** (Sept 27 - Oct 3)

**Day 15 - Sat 9/27:** Distribution Strategy - Own One Channel First  
**Day 16 - Sun 9/28:** Content Marketing Plan - SEO + Thought Leadership  
**Day 17 - Mon 9/29:** Customer Success Stories - 5 Case Studies  
**Day 18 - Tue 9/30:** Product Roadmap Presentation - 12-Month Vision  
**Day 19 - Wed 10/1:** Team Slide Perfection - Why You'll Win  
**Day 20 - Thu 10/2:** The Ask - Funding Amount, Use of Funds, Milestones  
**Day 21 - Fri 10/3:** Mock Pitch #2 with Partner Meeting Simulation

### **WEEK 4: MASTERY & MOMENTUM** (Oct 4-10)

**Day 22 - Sat 10/4:** Advanced Metrics - Cohorts, Retention, Engagement  
**Day 23 - Sun 10/5:** Platform Vision - BuildOS as Infrastructure Play  
**Day 24 - Mon 10/6:** PR & Storytelling - Your Founder Narrative  
**Day 25 - Tue 10/7:** Investor Update Template + First Monthly Update  
**Day 26 - Wed 10/8:** Term Sheet Basics - Valuation, Dilution, Control  
**Day 27 - Thu 10/9:** Building Your Target List - 100 Investors Ranked  
**Day 28 - Fri 10/10:** Mock Pitch #3 - Full Partner Meeting Format

### **FINAL SPRINT** (Oct 11-12)

**Day 29 - Sat 10/11:** Data Room Completion + Due Diligence Prep  
**Day 30 - Sun 10/12:** Final Pitch Recording + Outreach Strategy Launch

---

## 🎯 DAILY FORMAT (90 Minutes)

**7:00-7:15 AM:** Concept Download (Read/Watch provided materials)  
**7:15-7:45 AM:** Practice Exercise (Calculations, writing, recording)  
**7:45-8:15 AM:** Application to BuildOS (Customize for your specific context)  
**8:15-8:30 AM:** Output Creation (Deck slide, metric, story, or document)

## 📊 SUCCESS METRICS

- [ ] Complete pitch deck with 12-15 slides
- [ ] 2-minute pitch delivered flawlessly from memory
- [ ] Financial model with 3-year projections
- [ ] 50+ investor connections identified
- [ ] 10+ practice pitches completed
- [ ] Data room 100% ready

## 🚀 WEEK 1 KICKOFF CHECKLIST

- [ ] Block calendar 7:00-8:30 AM daily
- [ ] Set up recording equipment for pitch practice
- [ ] Create BuildOS metrics tracking spreadsheet
- [ ] Gather existing user feedback and testimonials
- [ ] Clear all distractions during training time

**COMMITMENT:** "I will become the CEO BuildOS needs to reach $1B+ valuation."

```

## Token Estimates

- **System Prompt:** ~1307 tokens
- **User Prompt:** ~1056 tokens
- **Total Estimate:** ~2363 tokens

---
*This file is automatically generated in development mode for prompt auditing purposes.*
```
