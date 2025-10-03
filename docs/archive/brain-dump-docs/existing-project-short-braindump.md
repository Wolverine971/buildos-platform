---
purpose: Update existing project from braindump <500 chars
decision_path: Project selected → Length <500 → Dual processing
system_prompt_source: Uses dual processing prompts
user_prompt_source: See dual-processing docs
tokens_total: ~2500-4000 (combined)
processing_mode: Dual processing (task extraction + context update)
---

# Existing Project - Short Braindump Prompt (<500 chars)

## Overview

Short braindumps (<500 chars) for existing projects trigger **dual processing mode**, which runs two separate prompts:

1. **Task Extraction** - Extract tasks and generate questions
2. **Context Update** - Update project context if needed

## Processing Flow

```mermaid
graph TD
    A[Short Braindump <500 chars] --> B[Dual Processing]
    B --> C[Task Extraction]
    B --> D[Context Update]
    C --> E[Tasks + Questions]
    D --> F[Updated Context]
    E --> G[Merge Results]
    F --> G
```

## Prompts Used

### Part 1: Task Extraction

See `/docs/prompts/dual-processing/dual-processing-task-extraction.md`

### Part 2: Context Update

**For dual processing**: See `/docs/prompts/dual-processing/dual-processing-context-update.md`
**For stream processing**: See `/docs/prompts/existing-project/existing-project-short-context-update.md`

## Key Characteristics

- **Parallel Execution**: Both prompts run simultaneously for existing projects
- **Question Generation**: Only happens in task extraction
- **Context Decision**: Context update may return null if no update needed
- **Threshold-Based**: Automatically triggered for short content
