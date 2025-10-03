---
purpose: Create new project from braindump <500 chars
decision_path: No project → Length <500 → Combined processing
system_prompt_source: promptTemplate.service.ts::getOptimizedNewProjectPrompt()
user_prompt_source: braindump-processor.ts::processWithStrategy() L342-344
tokens_system: ~1800
tokens_user: <125
tokens_total: ~1925-2000
note: Uses same prompt as long braindump
---

# New Project - Short Braindump Prompt (<500 chars)

## Overview

Short braindumps for new projects use the **same prompt** as long braindumps. The only difference is the braindump content length.

## System Prompt

```
// IDENTICAL to new-project-long-braindump.md
// See that file for the complete system prompt
```

## User Prompt

```
// Source: src/lib/utils/braindump-processor.ts::processWithStrategy() lines 342-344

Process this brain dump (occurred on [CURRENT_DATE]) into CRUD operations also keep in mind that the brain dump may contain instructions for organizing the info:

[BRAINDUMP_CONTENT - less than 500 characters]
```

## Key Differences from Long Braindump

- **Content Length**: <500 characters
- **Token Usage**: Lower due to shorter input
- **Processing**: May trigger dual processing based on thresholds
- **Otherwise identical**: Same prompt structure and response format
