# Prompt Audit: existing-project-dual-context

**Generated at:** 2025-10-17T03:58:14.180Z
**Environment:** Development

## Metadata

```json
{
	"userId": "255735ad-a34b-4ca9-942c-397ed8cc1435",
	"projectId": "19ddbf78-2e62-4bdf-bcb1-7e1a9626d5b4",
	"brainDumpLength": 792,
	"hasExistingProject": true,
	"existingContextLength": 3079,
	"timestamp": "2025-10-17T03:58:14.180Z"
}
```

## System Prompt

````
You are a context synthesis engine specializing in project context enrichment.

Mode: UPDATE EXISTING PROJECT CONTEXT

**IMPORTANT CONTEXT:**
Current date and time: 2025-10-17T03:58:02.159Z

Your Job is to update the project context document based on the user's brain dump.
The project context document is a comprehensive markdown doc that brings anyone up to speed on the project.
DO NOT include task lists or specific task details - those are handled separately.

**Context Update Criteria** (Update context when):
1. Strategic insights or learnings emerge
2. Scope or boundaries change
3. New stakeholders or dependencies identified
4. Approach or methodology evolves
5. Risks or assumptions change
6. External factors shift
7. Major decisions made
8. **Project structure needs evolution** (add new sections, reorganize existing ones to better communicate the project's story)

**Don't Update Context For**:
- Simple task completions
- Minor status changes
- Day-to-day progress
- Temporary blockers

**Remember**: Context structure should evolve with the project. Don't be constrained by the initial framework - adapt it as the project's needs become clearer.

## Update Rules:
1. **PRESERVE** ALL existing context - never delete or truncate existing content
2. **MERGE** new insights appropriately within existing structure
3. **ADD** timestamps for significant updates: **[2025-10-17]** New info...
4. **MAINTAIN** existing markdown structure and formatting
5. **OUTPUT** the COMPLETE context document with all existing + new content
6. **FOCUS** on strategic information, not tactical task details

## When to Update Context:
Update context ONLY when the brain dump contains strategic project information that affects the dimensions in the decision matrix above.

## Update the Executive Summary:
Update the executive summary to describe the current state and direction of the project when there are significant changes.

## When NOT to Update Context:
- Brain dump is ONLY about specific tasks or bug fixes
- Simple status updates or progress reports
- Day-to-day tactical information
- Information that belongs in task details instead
- Pure task lists or action items

## Output JSON for Context Update:
```json
{
  "title": "Short title for brain dump",
  "summary": "2-3 sentence summary of what was extracted from the braindump",
  "insights": "Key insights or highlights from this braindump",
  "tags": ["relevant", "tags"],
  "metadata": {
    "processingNote": "Explain why context was or wasn't updated"
  },
  "operations": [
    {
      "id": "op-[timestamp]-project-update",
      "table": "projects",
      "operation": "update",
      "data": {
        "id": "[PROJECT_ID]",
        "context": "COMPLETE markdown with ALL existing content PLUS new updates...",
        "executive_summary": "Updated executive summary (only if project vision/scope changed)",
        "tags": ["updated", "tags", "if", "changed"],
        "status": "active|paused|completed|archived"
      }
    }
  ]
}
````

## Output JSON for No Context Update Needed:

```json
{
	"title": "Title for the braindump",
	"summary": "Summary of the braindump content",
	"insights": "Key insights from the content",
	"tags": ["relevant", "tags"],
	"metadata": {
		"processingNote": "No context update needed - [explain why: task-focused, progress update, etc.]"
	},
	"operations": []
}
```

Focus on strategic project information. Transform the brain dump into context updates or explain why no update is needed.

```

## User Prompt

```

## Current Project Data:

{"id":"19ddbf78-2e62-4bdf-bcb1-7e1a9626d5b4","name":"The Last Ember","status":"active","description":"A fantasy novel about a young blacksmith who forges magical weapons to combat darkness in her kingdom.","start_date":"2025-10-17","end_date":null,"tags":["fantasy","novel","world-building","character development"],"executive_summary":"This project aims to develop a fantasy novel centered around a young blacksmith who discovers her magical abilities in a kingdom facing darkness. Key elements include character backstories, a unique magic system, and a detailed world.","context":"## 1. Situation & Environment\n- **Current State**:..."}

**Full Context:**

##### 1. Situation & Environment

- **Current State**: The project is in the initial stages of development, focusing on character and world-building.
- **Pain Points**: Need to establish a coherent magic system and character backstories.
- **Historical Context**: The story begins with the death of the last dragon, which serves as a catalyst for the protagonist's journey.
- **External Factors**: The fantasy genre is competitive, with a demand for unique magic systems and strong character arcs.
- **Stakeholder Landscape**: The primary stakeholder is the author, with potential feedback from beta readers and editors.

##### 2. Purpose & Vision & Framing

- **Vision**: To create an engaging fantasy narrative that explores themes of resilience, identity, and the struggle against darkness.
- **Framing**: "A young blacksmith discovers her true potential in a world where magic and darkness collide."
- **Core Purpose**: To tell a compelling story that captivates readers and immerses them in the world of Aethermoor.
- **Success Criteria**: Completion of the manuscript, positive feedback from beta readers, and eventual publication.
- **Desired Future State**: A completed novel that resonates with readers and establishes a fanbase.
- **Strategic Alignment**: Aligns with the growing interest in fantasy literature and the author's personal goals as a writer.

##### 3. Scope & Boundaries

- **Deliverables**: Completed character profiles, magic system, kingdom map, chapter outlines, and research documentation.
- **Exclusions**: No illustrations or marketing materials at this stage.
- **Constraints**: Limited by the author's writing schedule and research availability.
- **Assumptions**: Assumes familiarity with fantasy tropes and storytelling techniques.
- **Key Risks**: Potential for writer's block or lack of clarity in the magic system.

##### 4. Approach & Execution

- **Strategy**: Focus on iterative writing and world-building, with regular reviews of character and plot development.
- **Methodology**: Use of outlines and character profiles to guide the writing process.
- **Workstreams**: Parallel development of character backstories, magic system, and plot outlines.
- **Milestones**: Completion of character profiles, magic system, and first draft of the first three chapters.
- **Resource Plan**: Author's time, writing tools, and research materials.

##### 5. Coordination & Control

- **Governance**: The author will make all creative decisions, with input from trusted readers.
- **Decision Rights**: The author retains full creative control over the project.
- **Communication Flow**: Regular updates to beta readers and writing groups for feedback.
- **Risk/Issue Management**: Address creative blocks through brainstorming sessions and research.

##### 6. Knowledge & Learning

- **Lessons Applied**: Previous writing experiences and feedback will inform character development and plot structure.
- **Documentation Practices**: Maintain a writing journal for notes and ideas.
- **Continuous Improvement**: Regularly seek feedback and adjust the writing process as needed.

---

Process this brain dump for project context:

Starting to think about publication options for The Last Ember.

Traditional publishing route:

- Need to write query letter
- Create 1-page synopsis
- Research fantasy literary agents (looking at agents who rep Brandon Sanderson, Robin Hobb)
- Prepare first 3 chapters as sample

Self-publishing considerations:

- Budget $3000 for professional editing
- Find cover artist specializing in fantasy
- Plan pre-launch marketing campaign
- Set up author website and newsletter

Timeline:

- Finish first draft: March 31
- Self-edit: April
- Beta readers: May
- Professional edit: June-July
- Query agents or launch self-pub: August

Also want to:

- Start building author platform on social media
- Write short stories in same universe for magazines
- Create series bible if this becomes Book 1"

```

## Token Estimates

- **System Prompt:** ~876 tokens
- **User Prompt:** ~1157 tokens
- **Total Estimate:** ~2033 tokens


---
*This file is automatically generated in development mode for prompt auditing purposes.*
```
