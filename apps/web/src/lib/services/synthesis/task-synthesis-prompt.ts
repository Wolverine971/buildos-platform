// apps/web/src/lib/services/synthesis/task-synthesis-prompt.ts

import type { TaskSynthesisConfig } from '$lib/types/synthesis';

export class TaskSynthesisPrompt {
	static generate(projectData: string, projectId: string, config: TaskSynthesisConfig): string {
		const sections: string[] = [];

		// Base instruction
		sections.push(this.getBaseInstruction(projectId));

		// Add project data
		sections.push(projectData);

		// Add analysis instructions based on config
		const analysisInstructions = this.buildAnalysisInstructions(config);
		if (analysisInstructions) {
			sections.push(analysisInstructions);
		}

		// Add response format
		sections.push(this.getResponseFormat(projectId, config));

		return sections.join('\n\n');
	}

	private static getBaseInstruction(projectId: string): string {
		const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
		return `Your job is to synthesize and reorganize the tasks in this project to bring organization and clarity.

## ⚠️ IMPORTANT: Current Date
Today's date is: ${currentDate}
**NEVER** schedule any tasks with start_date in the past. All tasks must have start_date of ${currentDate} or later.
If a task already has a past start_date, update it to ${currentDate} or an appropriate future date. 

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

	private static buildAnalysisInstructions(config: TaskSynthesisConfig): string {
		const instructions: string[] = [];

		instructions.push('## Analysis Instructions');

		// Check if all major features are enabled for comprehensive reorganization
		const allFeaturesEnabled =
			config.consolidation.enabled &&
			config.sequencing.enabled &&
			config.grouping.enabled &&
			config.timeEstimation.enabled &&
			config.gapAnalysis.enabled;

		if (allFeaturesEnabled) {
			instructions.push(`### 🎯 COMPREHENSIVE TASK REORGANIZATION
You are performing a FULL PROJECT REORGANIZATION following the three-step process:

**STEP 1: SEQUENCE** 
Arrange all tasks in logical order based on:
- Natural workflow progression
- Dependencies and prerequisites  
- Minimizing context switching
- Building momentum from simple to complex

**STEP 2: GROUP & BATCH**
Identify and batch similar tasks for efficiency:
- Tasks using same tools/resources
- Tasks in same functional area
- Tasks requiring similar mindset
- Small tasks that can be knocked out together

**STEP 3: SCOPE & TIMEBLOCK**
Assign realistic time blocks based on true complexity:
- **Major Initiatives**: Multiple days/weeks for large efforts
- **Deep Work Blocks**: 2-4 hours for complex focused work
- **Standard Tasks**: 30-90 minutes for regular work
- **Quick Wins**: Batch 15-30 minute tasks together
- **CRITICAL**: Big/complex tasks MUST get longer durations!

This is a complete reorganization to transform chaos into an executable, time-blocked project plan.`);
		} else {
			instructions.push('Perform the following analyses based on the enabled features:');
		}

		if (config.consolidation.enabled) {
			instructions.push(this.getConsolidationInstructions(config.consolidation));
		}

		if (config.sequencing.enabled) {
			instructions.push(this.getSequencingInstructions(config.sequencing));
		}

		if (config.grouping.enabled) {
			instructions.push(this.getGroupingInstructions(config.grouping));
		}

		if (config.timeEstimation.enabled) {
			instructions.push(this.getTimeEstimationInstructions(config.timeEstimation));
		}

		if (config.gapAnalysis.enabled) {
			instructions.push(this.getGapAnalysisInstructions(config.gapAnalysis));
		}

		if (config.dependencies.enabled) {
			instructions.push(this.getDependenciesInstructions(config.dependencies));
		}

		return instructions.join('\n\n');
	}

	private static getConsolidationInstructions(config: any): string {
		const aggressivenessGuide = {
			conservative:
				'Only consolidate tasks that are clearly exact duplicates with identical goals',
			moderate:
				'Consolidate tasks with significant overlap (>70% similarity in purpose and scope)',
			aggressive:
				'Aggressively consolidate any related tasks that could reasonably be combined'
		};

		return `### Task Consolidation
Aggressiveness Level: ${config.aggressiveness}
Guideline: ${aggressivenessGuide[config.aggressiveness]}

Instructions:
1. Identify duplicate or highly similar tasks
2. Look for tasks that cover the same work from different angles
3. Find tasks that could be combined into a single comprehensive task

## CRITICAL: How to Write Consolidated Tasks

**For the DESCRIPTION field**:
- Write a clear, actionable description of what needs to be done
- Focus on the unified goal and deliverables
- DO NOT mention "combined", "merged", "consolidated" or reference original tasks
- Write it as if this was always a single, coherent task

**For the DETAILS field**:
- Organize ALL important details from original tasks into logical sections
- Structure information to help complete the task effectively
- Include all steps, requirements, and context in a coherent flow
- DO NOT say "from task A" or "from task B" - just present the information clearly
${config.preserveDetails ? '- IMPORTANT: Preserve ALL substantive details from original tasks' : '- Focus on essential details, summarize where appropriate'}

**For the REASONING field**:
- THIS is where you explain the consolidation logic
- Mention which tasks were combined and why
- Explain how consolidation improves the project organization

5. Mark redundant tasks as outdated after consolidation
6. Remember: Description and details should read naturally, reasoning explains the merge`;
	}

	private static getSequencingInstructions(config: any): string {
		return `### Task Sequencing & Logical Ordering (STEP 1 of Reorganization)
Consider Dependencies: ${config.considerDependencies}
Optimize for Parallel Execution: ${config.optimizeForParallel}

## 📋 SEQUENCING WORKFLOW:

1. **IDENTIFY NATURAL FLOW**:
   - What needs to happen first? (prerequisites)
   - What builds on what? (dependencies)
   - What can happen in parallel? (independent work)

2. **ARRANGE FOR EFFICIENCY**:
   - Minimize context switching between different types of work
   - Build momentum from simple → complex
   - Front-load high-energy tasks when possible
   
3. **CREATE LOGICAL PHASES**:
   - Research & Planning Phase
   - Setup & Configuration Phase
   - Core Implementation Phase
   - Testing & Validation Phase
   - Documentation & Handoff Phase

${config.considerDependencies ? '4. **MAP EXPLICIT DEPENDENCIES**: Document which tasks block others' : '4. **NATURAL PROGRESSION**: Focus on logical workflow without strict blocking'}
${config.optimizeForParallel ? '5. **PARALLEL TRACKS**: Identify independent work streams that can progress simultaneously' : '5. **LINEAR FLOW**: Create a clear sequential path through the project'}

6. **DAILY/WEEKLY STRUCTURE**:
   - Morning: Complex work requiring focus
   - Midday: Standard implementation tasks
   - Afternoon: Reviews, testing, and admin

7. **DATE VALIDATION**:
   - All start_date values must be today or in the future
   - Update any past dates to appropriate future dates
   - Consider realistic scheduling based on dependencies

Remember: Good sequencing prevents rework and reduces confusion!`;
	}

	private static getGroupingInstructions(config: any): string {
		const strategyGuide = {
			automatic: 'Use AI judgment to determine the best grouping approach',
			theme: 'Group tasks by similar topics or functional areas',
			resource: 'Group tasks that use the same tools, skills, or team members',
			timeline: 'Group tasks that should be executed in the same time period'
		};

		return `### Task Grouping & Batching (STEP 2 of Reorganization)
Strategy: ${config.strategy}
Approach: ${strategyGuide[config.strategy]}
Maximum Group Size: ${config.maxGroupSize}

## 🎯 BATCHING FOR EFFICIENCY:

1. **IDENTIFY BATCH OPPORTUNITIES**:
   - Tasks using same tools/environment
   - Tasks in same codebase area
   - Tasks requiring similar mental mode
   - Small tasks that can be knocked out together

2. **CREATE POWER BATCHES**:
   - **Tool Batches**: All tasks using same software/tools
   - **Context Batches**: Tasks in same functional area
   - **Energy Batches**: Group by required focus level
   - **Quick Win Batches**: Bundle all 15-30 min tasks

3. **BATCHING RULES**:
   - Maximum ${config.maxGroupSize} tasks per batch for manageability
   - Each batch should save 20-30% time vs individual execution
   - Create parent tasks to represent major batches
   - Schedule batches as single time blocks

4. **EFFICIENCY GAINS**:
   - Reduced setup/teardown time
   - Maintained mental context
   - Momentum from completing related work
   - Clear progress milestones

5. **Strategy**: ${strategyGuide[config.strategy]}

Remember: Good batching can cut project time by 30% or more!`;
	}

	private static getTimeEstimationInstructions(config: any): string {
		const confidenceGuide = {
			optimistic: 'Provide best-case scenario estimates assuming everything goes smoothly',
			realistic: 'Provide balanced estimates accounting for typical challenges',
			conservative: 'Provide conservative estimates with built-in contingency time'
		};

		return `### Time Estimation & Timeblocking
Confidence Level: ${config.confidenceLevel}
Approach: ${confidenceGuide[config.confidenceLevel]}
Include Buffer Time: ${config.includeBufferTime}

## 🕐 CRITICAL TIMEBLOCKING RULES:

1. **SIZE TASKS APPROPRIATELY**:
   - **Major Projects/Initiatives**: Multiple days or weeks
   - **Complex Features**: 4-8 hours (split across days)
   - **Deep Work Sessions**: 2-4 hours blocks
   - **Standard Tasks**: 30-90 minutes
   - **Quick Tasks**: 15-30 minutes (batch these!)
   
2. **RECOGNIZE BIG TASKS**: 
   - If it involves multiple steps → 2+ hours minimum
   - If it requires research + implementation → 4+ hours
   - If it spans multiple systems → Day(s) of work
   - **NEVER underestimate complex work!**

3. **BATCH SMALL TASKS**:
   - Group all 15-30 minute tasks together
   - Create "Quick Wins" time blocks
   - Schedule these for low-energy times

4. **REALISTIC DAILY PLANNING**:
   - Maximum 4-6 hours of deep focused work per day
   - Include transition time between context switches
   - ${config.includeBufferTime ? 'Add 15-20% buffer for unexpected issues' : 'Use direct estimates without buffers'}

5. **TIMEBLOCK STRUCTURE**:
   - Morning: High-focus complex work (2-4 hour blocks)
   - Midday: Standard tasks (30-90 minute blocks)  
   - Afternoon: Batched small tasks & admin (15-30 min each)
   
6. **Approach**: ${confidenceGuide[config.confidenceLevel]}

Remember: It's better to overestimate and finish early than underestimate and fall behind!`;
	}

	private static getGapAnalysisInstructions(config: any): string {
		return `### Gap Analysis & Task Steps
Include Prerequisites: ${config.includePrerequisites}
Include Follow-ups: ${config.includeFollowUps}
Suggest Milestones: ${config.suggestMilestones}

**IMPORTANT RESTRICTION**: 
Gap analysis should ONLY be performed when explicitly requested by the user in the braindump.
DO NOT proactively add preparatory, setup, or follow-up tasks unless the user specifically instructs you to do so.

Instructions (ONLY if user requests gap analysis):
${config.includePrerequisites ? '1. **Identify Prerequisites**: Find missing setup/preparation tasks ONLY if user asks for them' : ''}
${config.includeFollowUps ? '2. **Identify Follow-ups**: Determine post-work tasks ONLY if user requests them' : ''}
${config.suggestMilestones ? '3. **Add Milestones**: Create milestone markers ONLY if user asks for milestones' : ''}
4. **Check for Overlaps**: Identify tasks that cover similar ground (always allowed)
5. **DO NOT Fill Workflow Gaps**: Unless user explicitly asks to "add missing tasks" or similar
6. **Add Task Steps**: Break down complex tasks ONLY if user requests breakdown
7. **Prework & Postwork**: DO NOT create these unless user explicitly asks for:
   - "Add research tasks" or "Create planning tasks"
   - "Add setup tasks" or "Create configuration tasks"
   - "Add testing tasks" or "Create validation tasks"
   - "Add documentation tasks" or similar explicit requests
8. **Create Missing Tasks**: ONLY create new tasks if user explicitly mentions them or asks for gaps to be filled`;
	}

	private static getDependenciesInstructions(config: any): string {
		return `### Task Dependencies
Auto-detect Dependencies: ${config.autoDetect}
Strict Mode: ${config.strictMode}

Instructions:
${config.autoDetect ? '1. Analyze task descriptions to automatically identify dependencies' : '1. Respect only explicitly stated dependencies'}
2. Map relationships between interconnected tasks
${config.strictMode ? '3. Enforce strict dependency chains - dependent tasks cannot start until prerequisites are complete' : '3. Use soft dependencies - tasks are related but not strictly blocked'}
4. Update the dependencies array for tasks with clear prerequisites
5. Ensure no circular dependencies are created`;
	}

	private static getResponseFormat(projectId: string, config: TaskSynthesisConfig): string {
		return `## Required JSON Response Format
{
  "title": "Task Synthesis for Project",
  "summary": "Brief overview of the three-step reorganization: how tasks were sequenced, grouped, and timeblocked (2-3 sentences)",
  "insights": "Detailed explanation of the reorganization strategy: (1) How you sequenced tasks for logical flow, (2) How you grouped tasks for batching efficiency, (3) How you sized and timeblocked tasks based on complexity. Include specific examples of improvements made (2-3 paragraphs)",
  "operations": [
    {
      "table": "tasks",
      "operation": "update|create",
      "data": {
        // For updates, include the task ID:
        "id": "existing_task_id",
        // Required fields:
        "title": "Clear, actionable task title (required, max 255 chars)",
        "description": "Natural task description focusing on WHAT needs to be done - write as a coherent single task, NOT mentioning merging/combining",
        "details": "Well-organized details with all steps, requirements, context - present information logically to help complete the task, NOT as 'details from task A + details from task B'",
        "status": "backlog|in_progress|done|blocked",
        "priority": "low|medium|high", // Set based on logical prioritization
        "task_type": "one_off|recurring",
        "project_id": "${projectId}",
        // Time and scheduling:
        "duration_minutes": number, // IMPORTANT: Set realistic durations - longer for big tasks!
        "start_date": "YYYY-MM-DD", // Must be today (${new Date().toISOString().split('T')[0]}) or later - sequence tasks logically
        // Organization:
        "parent_task_id": "parent_id or null", // Use for grouping
        "dependencies": ["task_id_1", "task_id_2"], // Map logical dependencies
        "deleted_at": "ISO timestamp" | null // Set timestamp to soft delete
      },
      "reasoning": "Explain WHY: consolidation logic (which tasks merged), sequencing decisions, grouping rationale, timing justification - THIS is where you mention combining/merging, NOT in description/details"
    }
  ],
  "comparison": [
    {
      "type": "consolidated|sequenced|grouped|gap_filled|timeblocked",
      "originalTasks": ["task_id_1", "task_id_2"],
      "newTask": {
        "title": "Result task name",
        "description": "How this improves organization"
      },
      "reasoning": "Why this change creates better project organization"
    }
  ]
}

## 🎯 THREE-STEP REORGANIZATION CHECKLIST:
✅ **STEP 1 - SEQUENCED**: Tasks arranged in logical order with clear workflow
✅ **STEP 2 - GROUPED**: Similar tasks batched for 30% efficiency gain  
✅ **STEP 3 - TIMEBLOCKED**: Big tasks get big durations, small tasks batched

## Implementation Guidelines:
${config.consolidation.enabled ? '- Consolidate overlapping tasks to eliminate redundancy' : ''}
${config.sequencing.enabled ? '- Create a logical workflow that minimizes context switching' : ''}
${config.grouping.enabled ? '- Batch similar tasks for efficient execution' : ''}
${config.timeEstimation.enabled ? '- Assign realistic timeblocks - longer for complex tasks!' : ''}
${config.gapAnalysis.enabled ? '- Add missing prework, postwork, and intermediate steps' : ''}
${config.dependencies.enabled ? '- Map clear task dependencies and prerequisites' : ''}

- Transform chaos into organization
- Ensure every task has a clear place in the sequence
- Group tasks that can be done together efficiently
- Set durations that reflect actual task complexity
- Create an executable, time-blocked project plan
- NEVER schedule tasks in the past - use today's date or later

## ⚠️ IMPORTANT WRITING RULES:
**NEVER** write "this task combines X and Y" or "merged from tasks A and B" in the description or details fields.
**ALWAYS** write descriptions and details as natural, coherent content focused on the work itself.
**ONLY** mention consolidation/merging in the "reasoning" field where you explain your decisions.`;
	}
}
