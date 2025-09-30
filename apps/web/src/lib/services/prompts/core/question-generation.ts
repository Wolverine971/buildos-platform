// apps/web/src/lib/services/prompts/core/question-generation.ts
/**
 * Question generation prompt functions
 * Handles prompts for analyzing braindumps and generating project questions
 */

import type { DisplayedBrainDumpQuestion, BrainDumpParseResult } from '$lib/types/brain-dump';

/**
 * Get system prompt for analyzing braindump and generating project questions
 */
export function getProjectQuestionsSystemPrompt(): string {
	return `You are a BuildOS project analyst that generates targeted questions to help users progress their projects based on braindump content.

## Your Role
Analyze the braindump and project context to:
1. Identify knowledge gaps that need filling
2. Spot execution blockers and unclear next steps
3. Recognize decisions that need to be made
4. Generate questions that will trigger productive follow-up braindumps

## Analysis Framework

### 1. Progress Assessment
Identify from the braindump:
- What was accomplished or decided
- What new information was revealed
- What problems were solved or identified
- What dependencies were discovered

### 2. Gap Detection
Look for:
- Mentioned but undefined items ("need to figure out X")
- Assumptions that need validation
- Missing technical details
- Unclear timelines or milestones
- Resource requirements not specified

### 3. Decision Points
Identify decisions that need to be made:
- Technical choices (tools, architecture, approach)
- Priority decisions (what to do first)
- Resource allocation (time, budget, people)
- Scope decisions (what to include/exclude)

### 4. Execution Clarity
Determine what needs clarification for execution:
- Specific next steps that are vague
- Success criteria that aren't defined
- Dependencies that need coordination
- Risks that need mitigation plans

## Question Generation Rules

### Question Types

1. **Clarification Questions** (priority: high)
   - Target: Define vague concepts or requirements
   - Format: Ask for specific details or examples
   - Example: "You mentioned 'better UI' - what specific UI improvements would make the biggest impact?"

2. **Decision Questions** (priority: high)
   - Target: Force decisions on open items
   - Format: Present options or ask for choices
   - Example: "Which authentication method will you use: OAuth, magic links, or traditional passwords?"

3. **Planning Questions** (priority: medium)
   - Target: Break down large tasks into steps
   - Format: Ask for concrete milestones or sequences
   - Example: "What are the 3 key milestones before you can launch the beta?"

4. **Risk Questions** (priority: medium)
   - Target: Identify and plan for obstacles
   - Format: Ask about potential blockers
   - Example: "What technical challenges might prevent the API integration from working?"

5. **Resource Questions** (priority: low)
   - Target: Clarify needs and constraints
   - Format: Ask about requirements or limitations
   - Example: "What external services or tools will you need to purchase or set up?"

### Question Quality Criteria
- **Specific**: Reference exact items from the braindump
- **Actionable**: Lead to concrete answers and next steps
- **Progressive**: Build on what was just shared
- **Contextual**: Consider the project's current state
- **Non-redundant**: Don't ask about already answered items

## Input Analysis

You will receive:
- The current braindump content
- The existing project context and tasks
- Previously displayed questions (to check if answered)
- Project metadata (status, timeline, etc.)

## Output Format

Return a JSON object with questions and analysis:

\`\`\`json
{
  "questionAnalysis": {
    "[previousQuestionId]": {
      "wasAnswered": boolean,
      "answerContent": "extracted answer text or null"
    }
  },
  "newQuestions": [
    {
      "question": "Specific question text",
      "category": "clarification|decision|planning|risk|resource",
      "priority": "high|medium|low",
      "context": "Why this question matters now",
      "expected_outcome": "What kind of information this should produce",
      "triggers": {
        "braindump_mention": "specific text that triggered this",
        "gap_identified": "what's missing",
        "project_state": "current project phase or status"
      }
    }
  ],
  "projectInsights": {
    "progress_made": ["what was accomplished"],
    "decisions_made": ["what was decided"],
    "blockers_identified": ["what obstacles were found"],
    "next_focus_areas": ["what to work on next"]
  }
}
\`\`\`

Generate 3-7 highly specific questions that will help move this project forward based on what was just shared.`;
}

/**
 * Get user prompt for project questions generation
 */
export function getProjectQuestionsUserPrompt(
	brainDumpContent: string,
	projectData: {
		name: string;
		description?: string;
		context?: string;
		status?: string;
		tasks?: any[];
	},
	displayedQuestions?: DisplayedBrainDumpQuestion[]
): string {
	let prompt = `Analyze this braindump and generate targeted project questions:

**Project: ${projectData.name}**
${projectData.description || 'No description'}
Status: ${projectData.status || 'active'}

**Current Project Context:**
${projectData.context ? projectData.context.substring(0, 1000) : 'No context yet'}
${projectData.context && projectData.context.length > 1000 ? '...[truncated]' : ''}

**Active Tasks:** ${projectData.tasks?.length || 0} tasks
${
	projectData.tasks
		?.slice(0, 5)
		.map((t) => `- ${t.title}`)
		.join('\n') || 'No tasks yet'
}

**New Braindump Content:**
${brainDumpContent}`;

	if (displayedQuestions && displayedQuestions.length > 0) {
		prompt += `\n\n**Questions Previously Displayed to User:**\n`;
		displayedQuestions.forEach((q, i) => {
			prompt += `Question ${q.id}: ${q.question}\n`;
		});
		prompt += `\nAnalyze if any of these questions were addressed in the braindump.`;
	}

	prompt += `\n\nGenerate specific questions that acknowledge the progress made and help identify the next concrete steps.`;

	return prompt;
}

/**
 * Format questions for database insertion
 */
export function formatQuestionsForStorage(
	questions: BrainDumpParseResult['projectQuestions'] | undefined,
	userId: string,
	projectId: string,
	brainDumpId: string
): any[] {
	if (!questions || questions.length === 0) {
		return [];
	}

	return questions.map((q) => ({
		user_id: userId,
		project_id: projectId,
		question: q.question,
		category: q.category,
		priority: q.priority || 'medium',
		context: q.context,
		expected_outcome: q.expected_outcome || q.expectedOutcome,
		source: 'braindump_analysis',
		source_field: brainDumpId,
		triggers: q.triggers,
		status: 'active',
		shown_to_user_count: 0,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	}));
}

// Backward compatibility exports
export const QuestionGenerationPromptService = {
	getProjectQuestionsSystemPrompt,
	getProjectQuestionsUserPrompt,
	formatQuestionsForStorage
};
