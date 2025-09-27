# BuildOS Prompt Architecture

## Overview

The prompt generation system has been reorganized for better separation of concerns and maintainability. All prompt generation code now uses regular functions instead of classes with static methods, making the code more modular and easier to test.

## File Structure

```
src/lib/services/
├── promptTemplate.service.ts      # Main service with braindump prompts and template methods
└── prompts/
    └── core/
        ├── prompt-components.ts    # Atomic prompt building blocks (functions)
        ├── data-formatter.ts       # Data formatting utilities (functions)
        ├── task-extraction.ts      # Task extraction prompts (functions)
        └── question-generation.ts  # Question generation prompts (functions)
```

## Architecture Changes

### Before

- Multiple service classes with static methods scattered across `generators/` and `core/` directories
- `BrainDumpPromptService` in generators directory despite being core functionality
- Inconsistent naming conventions (`.service.ts` suffix for some files)
- Class-based architecture with only static methods (no instantiation benefits)

### After

- Clean separation between main service and utility functions
- All braindump prompts consolidated in `promptTemplate.service.ts`
- Supporting functions organized in `core/` directory
- Regular function exports with backward compatibility exports for smooth migration
- Removed unnecessary `generators/` directory

## Module Organization

### 1. promptTemplate.service.ts

**Purpose**: Main service that orchestrates prompt generation
**Contents**:

- `getOptimizedNewProjectPrompt()` - New project braindump prompt
- `getOptimizedExistingProjectPrompt()` - Existing project update prompt
- `getProjectContextPromptForShortBrainDump()` - Short braindump context update
- Phase generation prompts
- Daily brief templates
- Template variable substitution
- User/project template management

### 2. prompt-components.ts

**Purpose**: Reusable prompt building blocks
**Key Functions**:

- `generatePreprocessingSteps()` - Standard preprocessing instructions
- `generateDateParsing()` - Date parsing rules and examples
- `generateRecurringTaskRules()` - Recurring task validation
- `generateProjectContextFramework()` - Context structure guidelines
- `getProjectModel()`, `getTaskModel()` - Data model definitions
- `generateDecisionMatrix()` - Decision criteria for updates
- `generateOperationId()` - Operation ID generation

**Backward Compatibility**: Each function group has a compatibility export object (e.g., `PreprocessingStepsComponent`) for gradual migration.

### 3. data-formatter.ts

**Purpose**: Format data for inclusion in prompts
**Key Functions**:

- `formatProject()` - Format project data for prompts
- `formatTasks()` - Format task lists with grouping
- `formatUserContext()` - Format user context information
- `formatExistingTasksForPrompt()` - Format tasks for task extraction
- `truncateContent()` - Safely truncate long content

### 4. task-extraction.ts

**Purpose**: Task extraction prompt generation
**Key Functions**:

- `getTaskExtractionWithContextDecisionPrompt()` - Short braindump task extraction
- `getTaskExtractionWithQuestionsPrompt()` - Combined extraction and questions
- `getIntegratedQuestionsPrompt()` - Questions for longer braindumps

### 5. question-generation.ts

**Purpose**: Project question generation prompts
**Key Functions**:

- `getProjectQuestionsSystemPrompt()` - System prompt for question generation
- `getProjectQuestionsUserPrompt()` - User prompt with project context
- `formatQuestionsForStorage()` - Format questions for database

## Usage Patterns

### Direct Function Import

```typescript
import { generatePreprocessingSteps, getProjectModel } from './prompts/core/prompt-components';

const prompt = `
${generatePreprocessingSteps()}
${getProjectModel(true)}
`;
```

### Backward Compatibility Import

```typescript
import { PreprocessingStepsComponent } from './prompts/core/prompt-components';

const prompt = `
${PreprocessingStepsComponent.generate()}
`;
```

### Service Usage

```typescript
const promptService = new PromptTemplateService(supabase);
const newProjectPrompt = promptService.getOptimizedNewProjectPrompt();
```

## Benefits of New Architecture

1. **Modularity**: Each file has a clear, single responsibility
2. **Testability**: Regular functions are easier to test than static class methods
3. **Tree Shaking**: Modern bundlers can better optimize regular function imports
4. **Clarity**: Function names directly describe what they do
5. **Flexibility**: Functions can be composed more easily than class methods
6. **Maintainability**: Related functionality is grouped logically

## Migration Notes

- All existing imports continue to work through backward compatibility exports
- Gradual migration is possible - update imports as you touch files
- No functional changes - only organizational improvements
- All prompts remain exactly the same

## Future Improvements

1. Consider extracting phase generation prompts to separate module
2. Add unit tests for individual prompt generation functions
3. Create prompt validation utilities
4. Add prompt versioning for A/B testing
5. Consider extracting common patterns into higher-order functions
