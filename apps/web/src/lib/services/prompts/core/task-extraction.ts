// src/lib/services/prompts/core/task-extraction.ts
/**
 * Task extraction prompt generation functions
 * Handles prompts for extracting tasks from brain dumps with context decision
 */

import { ProjectWithRelations } from '$lib/types/project';
import type { DisplayedBrainDumpQuestion } from '$lib/types/brain-dump';
import {
	DataModelsComponent,
	generateQuestionGenerationInstructions,
	generateQuestionAnalysisInstructions,
	generateDateParsing,
	generateRecurringTaskRules,
	getDecisionMatrixUpdateCriteria
} from './prompt-components';

/**
 * Get task extraction prompt with context decision for short braindumps
 * For braindumps < 500 characters on existing projects
 */
export function getTaskExtractionWithContextDecisionPrompt(
	projectId: string,
	projectData: string,
	displayedQuestions?: DisplayedBrainDumpQuestion[]
): string {
	const today = new Date().toISOString().split('T')[0];
	const sections: string[] = [];

	sections.push(`You are a BuildOS task extraction engine for short braindumps (< 500 characters).


Mode: TASK-FIRST EXTRACTION with optional context update for project ${projectId}

## Current Project Data:
${projectData}

## Primary Job: Extract Tasks
1. **IDENTIFY** all actionable items EXPLICITLY mentioned in the braindump
2. **CREATE** tasks ONLY for items directly stated - DO NOT add preparatory or follow-up tasks
3. **ANALYZE** if displayed questions were answered
4. **DETERMINE** if project context needs updating based on decision matrix

**CRITICAL RULES**:
- Extract ONLY tasks that are explicitly mentioned
- DO NOT proactively create setup, preparatory, or follow-up tasks
- DO NOT fill gaps or add "missing" tasks
- ONLY exception: If user explicitly says "create setup tasks" or "add follow-up tasks"
- Consider existing tasks to avoid duplicates and understand project context

${getDecisionMatrixUpdateCriteria()}

Otherwise, treat it as task-level updates only.

## Task Model:
${DataModelsComponent.getTaskModel({
	includeRecurring: true,
	projectId: projectId
})}

## Date Parsing:
${generateDateParsing(today)}

${generateRecurringTaskRules()}`);

	// Add question analysis if questions were displayed
	const questionAnalysis = generateQuestionAnalysisInstructions(displayedQuestions);
	if (questionAnalysis) {
		sections.push(questionAnalysis);
	}

	// Add question generation instructions for short brain dumps
	sections.push(`## Generate Project Questions:
${generateQuestionGenerationInstructions({ includeFormat: false })}

Generate 3-5 NEW questions that help move the project forward based on the current state and new information from this braindump.`);

	// Build output JSON structure
	let outputJson = `## Output JSON:
{
  "tasks": [
    // Array of task objects to create
  ],
  "requiresContextUpdate": boolean,
  "contextUpdateReason": "Which decision matrix criteria triggered update need (or null)"`;

	if (displayedQuestions && displayedQuestions.length > 0) {
		outputJson += `,
  "questionAnalysis": {
    "[questionId]": {
      "wasAnswered": boolean,
      "answerContent": "extracted answer or null"
    }
  }`;
	}

	outputJson += `,
  "projectQuestions": [
    {
      "question": "specific question text",
      "category": "clarification|decision|planning|risk|resource",
      "priority": "high|medium|low",
      "context": "why this matters now",
      "expectedOutcome": "what info this should produce"
    }
  ]
}

Focus on extracting actionable items. Only flag for context update if the braindump contains strategic changes matching the decision matrix.

Respond with valid JSON matching the Output JSON structure above.`;

	sections.push(outputJson);

	return sections.join('\n\n');
}

/**
 * Get integrated question prompt for braindump processing (for longer braindumps >= 500 chars)
 * This is added to the main processing prompt to avoid separate LLM calls
 */
export function getIntegratedQuestionsPrompt(
	displayedQuestions?: DisplayedBrainDumpQuestion[]
): string {
	const sections: string[] = [];

	sections.push('## Project Questions Analysis & Generation');

	// Add question analysis section if questions were displayed
	if (displayedQuestions && displayedQuestions.length > 0) {
		const questionsText = displayedQuestions
			.map((q) => `- Question ${q.id}: "${q.question}"`)
			.join('\n');

		sections.push(`The user was shown these questions before recording:
${questionsText}

For each question, determine if it was addressed in the braindump.
Include in your response:
"questionAnalysis": {
  "[questionId]": {
    "wasAnswered": boolean,
    "answerContent": "extracted answer if addressed, null otherwise"
  }
}`);
	}

	// Add question generation instructions
	sections.push(`Additionally, ${generateQuestionGenerationInstructions({ includeCategories: false, includeFormat: false })}

Include these new questions in your response as:
"projectQuestions": [
  {
    "question": "specific question text",
    "category": "clarification|decision|planning|risk|resource",
    "priority": "high|medium|low",
    "context": "why this matters now",
    "expectedOutcome": "what info this should produce"
  }
]

Make questions specific to what was shared, actionable, and progressive.`);

	return '\n\n' + sections.join('\n\n');
}

// Backward compatibility exports
export const TaskExtractionPromptService = {
	getTaskExtractionWithContextDecisionPrompt,
	getIntegratedQuestionsPrompt
};
