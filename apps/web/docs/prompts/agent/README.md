<!-- apps/web/docs/prompts/agent/README.md -->

# Agent System Prompts

This directory contains automatically generated prompt audits from the BuildOS multi-agent system.

## Directory Structure

```
agent/
├── planner/        - Planner agent prompts (complexity analysis, synthesis, tool queries)
├── executor/       - Executor agent prompts (task execution)
└── conversation/   - Planner-Executor conversation prompts (turn management, questions)
```

## Purpose

These files are generated in **development mode only** to help you:

- **Debug** AI decision-making
- **Audit** prompts for quality and cost
- **Optimize** token usage
- **Understand** agent behavior

## Planner Agent Prompts

### `complexity-analysis-prompt.md`

- **When**: Every user message is analyzed for routing
- **Purpose**: Determines if query is "direct" (single-agent) or "complex" (multi-agent)
- **Metadata**: Available tools, context type, user message

### `tool-query-prompt.md`

- **When**: Direct queries that can use tools (search, update, etc.)
- **Purpose**: Initial state before multi-turn tool execution loop
- **Metadata**: Conversation history, available tools, session info

### `synthesis-prompt.md`

- **When**: After all executor steps complete in a complex plan
- **Purpose**: Combines executor results into natural language response
- **Metadata**: Plan statistics, step results, success/failure counts

## Executor Agent Prompts

### `task-execution-prompt.md`

- **When**: Executor spawned for a specific plan step
- **Purpose**: Single-shot task execution with read-only tools
- **Metadata**: Task description, goal, available tools, constraints

## Conversation Prompts

### `executor-turn-prompt.md`

- **When**: Each turn in iterative planner-executor conversation
- **Purpose**: Executor processes context and decides next action
- **Metadata**: Turn count, task state, conversation history

### `planner-response-prompt.md`

- **When**: Executor asks planner for clarification
- **Purpose**: Planner evaluates question and provides guidance
- **Metadata**: Question type, task context, turn count

## File Format

Each prompt file includes:

- **Timestamp**: When the prompt was generated
- **System Prompt**: Instructions given to the LLM
- **User Prompt**: The actual query or context
- **Metadata**: Session IDs, user info, available tools
- **Token Estimates**: Rough cost calculation

## Development Only

⚠️ **Important**: These files are only generated when `NODE_ENV !== 'production'`. They are automatically overwritten on each execution to show the latest prompt for each scenario type.
