---
purpose: Question analysis and generation component
type: Prompt component (integrated into main prompts)
source: promptTemplate.service.ts::getIntegratedQuestionsPrompt()
tokens: ~200-400
integration: Added to long braindump prompts when questions exist
path: apps/web/docs/prompts/components/integrated-questions-prompt.md
---

# Integrated Questions Prompt Component

## Overview

This prompt component is **integrated** into the main braindump processing prompts when displayed questions exist. It handles:

1. Analyzing if displayed questions were answered
2. Generating new questions for future braindumps

## System Prompt Addition

```
// Source: src/lib/services/prompts/generators/task-extraction.service.ts::getIntegratedQuestionsPrompt()
// Lines: 232-270
// This is APPENDED to the main system prompt

## Project Questions Analysis & Generation

[If displayedQuestions exist:]
The user was shown these questions before recording:
- Question [ID]: "[QUESTION_TEXT]"
[Additional questions...]

For each question, determine if it was addressed in the braindump.
Include in your response:
"questionAnalysis": {
  "[questionId]": {
    "wasAnswered": boolean,
    "answerContent": "extracted answer if addressed, null otherwise"
  }
}

Additionally, generate 3-5 new targeted questions based on the braindump content that will:
- Help clarify vague aspects of the project
- Identify critical decisions that need to be made
- Break down complex tasks into manageable steps
- Surface potential blockers or risks
- Move the project forward concretely

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

Make questions specific to what was shared, actionable, and progressive.
```

## Integration Points

### Long Braindump Prompts (≥500 chars)

- **New Project**: Added via `getIntegratedQuestionsPrompt(displayedQuestions)`
- **Existing Project**: Added via `getIntegratedQuestionsPrompt(displayedQuestions)`

### Dual Processing (Short Braindumps)

- **Task Extraction**: Questions handled directly in `getTaskExtractionPrompt()`
- **Context Update**: NEVER generates questions (avoid duplication)

## Response Structure

### Question Analysis (when displayedQuestions provided)

```json
{
  "questionAnalysis": {
    "[questionId]": {
      "wasAnswered": boolean,
      "answerContent": "string|null"
    }
  }
}
```

### Generated Questions

```json
{
	"projectQuestions": [
		{
			"question": "string",
			"category": "clarification|decision|planning|risk|resource",
			"priority": "high|medium|low",
			"context": "string",
			"expectedOutcome": "string"
		}
	]
}
```

## Question Categories

- **clarification**: Define vague concepts or requirements
- **decision**: Force choices on open items or alternatives
- **planning**: Break down large tasks or define approach
- **risk**: Identify potential obstacles or blockers
- **resource**: Clarify needs, constraints, or dependencies

## Important Notes

1. **No Duplication**: Questions are ONLY generated in task extraction during dual processing
2. **Status Updates**: Answered questions are marked in database via `updateQuestionStatus()`
3. **Validation**: Questions are validated via `validateProjectQuestions()` before storage
4. **Progressive**: Each braindump generates new questions based on current state
