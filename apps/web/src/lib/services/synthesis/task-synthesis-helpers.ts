// apps/web/src/lib/services/synthesis/task-synthesis-helpers.ts
// Helper functions for task synthesis prompt generation
// These are extracted for testing purposes

import type { CompositeTask } from '$lib/types';
import type { TaskSynthesisConfig } from '$lib/types/synthesis';

export function getBaseInstruction(): string {
	return `Your job is to synthesize and reorganize the tasks in this project to bring organization and clarity. 

## 🎯 Three-Step Reorganization Process

### Step 1: LOGICAL SEQUENCING
Put tasks in a logical order that respects dependencies and natural workflow progression.

### Step 2: LOGICAL GROUPING  
Group like tasks together so they can be done in batches for maximum efficiency.

### Step 3: LOGICAL SCOPING & TIMEBLOCKING
Properly weight and scope each task - assign realistic durations based on complexity:
- **Big/Complex Tasks**: Assign LONGER durations (2+ hours or multiple days)
- **Medium Tasks**: Standard timeblocks (30-90 minutes)
- **Small Tasks**: Batch together (15-30 minutes each)

## Core Analysis Areas
- **Task Overlaps**: Identify and consolidate redundant work
- **Task Gaps**: Add missing prework, postwork, and intermediate steps
- **Task Timeframes**: Adjust durations based on actual complexity
- **Task Dependencies**: Map logical prerequisites and sequences

Your goal is to transform a potentially chaotic task list into a well-organized, executable project plan with proper timeblocking that reflects the true scope of work.`;
}

export function buildAnalysisInstructions(): string {
	return `## COMPREHENSIVE REORGANIZATION

### 1. Dependency Management
- Identify tasks that block others
- Create logical chains of work
- Flag prerequisites that must complete first
- Suggest parallel work streams where possible

### 2. Efficient Grouping
- Group similar small tasks that use the same tools or context
- Bundle related work that can be done in one sitting
- Create "batch days" for similar activities
- Identify tasks that share knowledge or resources

### 3. Time Estimation
- Be realistic about time - complex tasks need more time!
- Don't underestimate research, planning, or review time
- Account for context switching between different types of work
- Add buffer time for unexpected complexity

### 4. Prioritization
- High-priority blockers first
- Quick wins early to build momentum
- Deep work blocks when energy is highest
- Batch administrative tasks together`;
}

export function getConsolidationInstructions(): string {
	return `## When Consolidating Tasks

### CRITICAL: How to Write Consolidated Task Descriptions

When you combine multiple tasks into one, DO NOT mention "combined", "merged", "consolidated", or reference the original tasks in the description or details fields. The description should read as if it was always one task.

**BAD Examples (Never do this)**:
- Description: "This combines task A and task B into a single effort"
- Details: "Merged from: Task A (implement login) and Task B (implement logout)"
- Description: "Consolidated authentication tasks"

**GOOD Examples (Do this instead)**:
- Description: "Implement comprehensive test coverage for authentication module"
- Details: "Build login flow with email/password validation, session management, logout functionality, and password reset capability. Include error handling and user feedback."

### Where to Explain Consolidation

The ONLY place to explain that tasks were consolidated is in the reasoning field:
- reasoning: "Combined the login and logout tasks since they share the same authentication context and codebase"

### Writing Rules for Consolidated Tasks

1. **Title**: Write a natural title that encompasses all the work
2. **Description**: Write as if planning this scope from the start
3. **Details**: Include all important details from original tasks, organized logically
4. **Duration**: Sum up the time appropriately (may be less than total due to efficiency)
5. **Reasoning**: This is WHERE you explain the consolidation logic`;
}

export function buildPrompt(tasks: CompositeTask[], projectContext?: any): string {
	const sections: string[] = [];

	// Add base instruction
	sections.push(getBaseInstruction());

	// Add project context
	if (projectContext) {
		sections.push(`## Project Context
Name: ${projectContext.name || 'Unnamed Project'}
Description: ${projectContext.description || 'No description provided'}
Goals: ${projectContext.goals || 'No specific goals provided'}
Constraints: ${projectContext.constraints || 'No constraints specified'}`);
	} else {
		sections.push(`## Project Context
No specific project context provided. Analyze tasks based on their content and relationships.`);
	}

	// Add current tasks
	sections.push(`## Current Tasks (${tasks.length} tasks)
${JSON.stringify(tasks, null, 2)}`);

	// Add analysis instructions
	sections.push(buildAnalysisInstructions());

	// Add consolidation instructions
	sections.push(getConsolidationInstructions());

	// Add response format
	sections.push(`## Response Format

Provide your synthesis as a JSON object with this structure:

{
  "operations": [
    {
      "id": "synthesis-op-[timestamp]-[index]",
      "table": "tasks",
      "operation": "update" | "create",
      "data": {
        // Task data fields
        "id": "existing-task-id", // For updates only
        "title": "Task title",
        "description": "Clear description",
        "details": "Detailed information",
        "status": "backlog" | "in_progress" | "done",
        "priority": "low" | "medium" | "high",
        "duration_minutes": number,
        "deleted_at": "ISO timestamp" | null // Set timestamp to soft delete
      },
      "enabled": true,
      "reasoning": "Explanation for this change"
    }
  ],
  "comparison": [
    {
      "type": "consolidated" | "sequenced" | "grouped",
      "originalTasks": ["task-id-1", "task-id-2"],
      "newTask": {
        "title": "New task title",
        "description": "What changed"
      },
      "reasoning": "Why this transformation"
    }
  ],
  "insights": "Key observations about the project organization",
  "summary": "Brief summary of changes made"
}`);

	// Add important writing rules reminder
	sections.push(`## IMPORTANT WRITING RULES

Never use words like "combined", "merged", "consolidated", "integrated", or "unified" in task descriptions and details. These should read naturally as if they were always planned that way. Only use such explanatory language in the reasoning field.`);

	return sections.join('\n\n');
}
