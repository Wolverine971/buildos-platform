# LLM Tests

⚠️ **WARNING: These tests make real API calls to LLMs and cost money!** ⚠️

## Overview

This directory contains tests that validate LLM responses for the brain-dump-processor functionality. These tests are:

- **EXCLUDED** from regular test runs (`pnpm test`)
- **ONLY RUN** when explicitly called with `pnpm test:llm`
- **COST MONEY** because they make real API calls to OpenAI

## Running LLM Tests

```bash
# Run all LLM tests (costs money!)
pnpm test:llm

# Watch mode for development (costs money!)
pnpm test:llm:watch

# Run with verbose output
pnpm test:llm:verbose

# Run with minimal output
pnpm test:llm:fast
```

## Test Structure

```
llm/
├── __tests__/
│   ├── new-project-creation.test.ts     # Tests for new project scenarios
│   └── existing-project-updates.test.ts # Tests for existing project updates
├── helpers/
│   └── simple-runner.ts                 # Minimal test runner
├── schemas/
│   └── validators.ts                     # Flexible validation functions
└── README.md                            # This file
```

## Why Separate?

1. **Cost**: Each test run makes API calls that cost money
2. **Speed**: LLM tests are slow (10-20 seconds each)
3. **Dependencies**: Requires API keys to be configured
4. **Purpose**: Only needed when changing prompts or LLM logic

## Configuration

The LLM tests use a separate Vitest configuration (`vitest.config.llm.ts`) that:

- Only includes files in this directory
- Has longer timeouts (20 seconds)
- Runs tests sequentially to avoid rate limiting

## When to Run

Run LLM tests when:

- Modifying brain-dump-processor prompts
- Changing LLM response parsing logic
- Testing new operation types
- Before major releases

Do NOT run LLM tests:

- In CI/CD pipelines (unless explicitly needed)
- During regular development
- When working on unrelated features
