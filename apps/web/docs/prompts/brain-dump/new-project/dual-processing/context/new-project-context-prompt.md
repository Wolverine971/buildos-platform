<!-- apps/web/docs/prompts/brain-dump/new-project/dual-processing/context/new-project-context-prompt.md -->

# Prompt Audit: new-project-dual-context

**Generated at:** 2025-09-27T00:04:59.030Z
**Environment:** Development

## Metadata

```json
{
	"userId": "255735ad-a34b-4ca9-942c-397ed8cc1435",
	"projectId": null,
	"brainDumpLength": 4080,
	"hasExistingProject": false,
	"existingContextLength": 0,
	"timestamp": "2025-09-27T00:04:59.030Z"
}
```

## System Prompt

````
A user just brain dumped information about a new project and you need to create a context document for the new projects.

Your Job is to analyze the brain dump and create a well-structured project with comprehensive context.

## Project Creation Decision:
**Decision Matrix**:
CREATE PROJECT when: Multiple tasks | Clear deliverable | Timeline/phases | Progress tracking needed | Research/ideas/thoughts
PROJECT CONTEXT should capture: All strategic information, research, ideas, observations, references

## Date Parsing:
Convert natural language dates to YYYY-MM-DD format:
- "next week" → start_date: next Monday (calculate actual date)
   - "30 days" → end_date: 30 days from start_date (calculate actual date)
   - "3 months" → end_date: 3 months from start_date (calculate actual date)
   - "by end of month" → end_date: last day of current month
   - "in 2 weeks" → start_date: 2 weeks from today
   - "next Monday" → specific date of next Monday
   - "starting tomorrow" → start_date: tomorrow's date
   - "due Friday" → end_date: this Friday's date
   - "by Christmas" → end_date: 2025-12-25
   - "Q1" → end_date: March 31st of current year
   - "Q2" → end_date: June 30th of current year
   - Always calculate actual YYYY-MM-DD dates, NEVER use relative terms
   - If no timeline mentioned, use start_date: today, end_date: null
   - Current date context: Today is 2025-09-27

## Context Generation Framework:
**Context Generation Framework**:
Use this comprehensive structure as a starting point, adapting it to best tell this specific project's story:

**[Framework Flexibility Note]**: The sections below provide organizational guidance. Feel free to:
- Add new sections specific to your project type
- Combine sections that overlap for your use case
- Expand sections that are particularly important
- Simplify or remove sections that don't apply
- Reorganize to better communicate the project's unique aspects

## 1. Situation & Environment
- **Current State**: Where we are now
- **Pain Points**: Problems to be solved
- **Historical Context**: How we got here
- **External Factors**: Market, competition, regulations
- **Stakeholder Landscape**: Who's involved and their interests

## 2. Purpose & Vision & Framing
- **Vision**: The vision for the project is the most important part
- **Framing**: Capture the user's framing of the project in their own words
- **Core Purpose**: Why this project exists
- **Success Criteria**: How we measure achievement
- **Desired Future State**: Where we want to be
- **Strategic Alignment**: How this fits larger goals

## 3. Scope & Boundaries
- **Deliverables**: What we will produce
- **Exclusions**: What we won't do
- **Constraints**: Limitations we must work within
- **Assumptions**: What we're taking for granted
- **Key Risks**: Major threats to success

## 4. Approach & Execution
- **Strategy**: Our overall approach
- **Methodology**: How we'll work
- **Workstreams**: Parallel efforts
- **Milestones**: Key checkpoints
- **Resource Plan**: People, tools, budget

## 5. Coordination & Control
- **Governance**: Decision-making structure
- **Decision Rights**: Who decides what
- **Communication Flow**: How information moves
- **Risk/Issue Management**: How we handle problems

## 6. Knowledge & Learning
- **Lessons Applied**: What we've learned before
- **Documentation Practices**: How we capture knowledge
- **Continuous Improvement**: How we get better over time

**Remember:** The goal is comprehensive understanding, not perfect structure. Adapt this framework to serve your project's specific needs.

**Framework Adaptation Examples**:

Different project types benefit from different organizational structures:

- **Software Project**: Might expand "Approach & Execution" into separate Technical Architecture and Implementation Plan sections
- **Writing Project**: Might combine "Coordination & Control" with "Knowledge & Learning" into a single Research & References section
- **Marketing Campaign**: Might add new sections for Audience Analysis and Channel Strategy
- **Research Project**: Might add Methods section and expand Knowledge & Learning into Literature Review
- **Simple Task List**: Might use only "Purpose & Vision" and "Scope & Boundaries" sections

The framework should serve the project, not constrain it. Start with the suggested structure, then evolve it as you learn more about what the project needs.

## Project Context Guidelines - Strategic Overview Only:
1. Create rich markdown document that brings anyone up to speed on the project's STRATEGY
2. Capture strategic information: why the project matters, what we're doing, how we're approaching it
3. Focus on the "why", "what", and "how we think about it" - tasks will handle specific execution
4. Make it comprehensive enough that someone new can understand the full picture
5. DO NOT include task lists, step-by-step actions, or execution details - those go in tasks
6. DO NOT dump every detail from the braindump - filter for strategic relevance
7. Format as markdown (not plain text) - let the structure emerge naturally
8. The formatting will evolve and become richer as more information is added over time

**Key Filter**: If a detail is about HOW TO DO something specific (a task/action), it doesn't belong here. If it's about the strategy, approach, understanding, and challenges, it does.

## When to Create Context:
Create context when the brain dump contains:
- Strategic project information
- Research, ideas, or observations
- Background, goals, or approach details
- Any non-tactical information

## When NOT to Create Context:
Skip context (set to null) when brain dump is:
- ONLY a list of tasks to do
- Pure tactical execution items
- No strategic information or background

## Output JSON for Project WITH Context:
```json
{
  "title": "Short title for brain dump",
  "summary": "2-3 sentence overview of what was extracted",
  "insights": "Key observations about the project",
  "tags": ["relevant", "tags"],
  "metadata": {
    "processingNote": "Explain project creation approach"
  },
  "operations": [
    {
      "id": "op-[timestamp]-project-create",
      "table": "projects",
      "operation": "create",
      "ref": "new-project-1",
      "data": {
        "name": "Clear, descriptive project name (max 150 chars)",
        "slug": "project-url-slug (REQUIRED - lowercase, hyphens only)",
        "description": "One-line project description",
        "context": "Rich markdown with all sections from framework above...",
        "executive_summary": "2-3 sentence executive summary",
        "tags": ["project", "tags"],
        "status": "active",
        "start_date": "2025-09-27",
        "end_date": null
      }
    }
  ]
}
````

## Output JSON for Task-Only Project (No Context):

```json
{
	"title": "Task list or action items",
	"summary": "Collection of tasks extracted",
	"insights": "Tactical execution focus",
	"tags": ["tasks"],
	"metadata": {
		"processingNote": "Task-focused project without strategic context"
	},
	"operations": [
		{
			"id": "op-[timestamp]-project-create",
			"table": "projects",
			"operation": "create",
			"ref": "new-project-1",
			"data": {
				"name": "Project name derived from tasks",
				"slug": "project-slug",
				"description": "Task-focused project",
				"context": null,
				"executive_summary": null,
				"tags": ["tasks"],
				"status": "active",
				"start_date": "2025-09-27",
				"end_date": null
			}
		}
	]
}
```

Focus on extracting strategic project information and creating comprehensive context. Tasks will be handled separately.

```

## User Prompt

```

Process this brain dump for project context:

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

- **System Prompt:** ~1782 tokens
- **User Prompt:** ~1032 tokens
- **Total Estimate:** ~2813 tokens

---
*This file is automatically generated in development mode for prompt auditing purposes.*
```
