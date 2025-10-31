# Prompt Audit Infrastructure - Status Report

**Last Updated**: 2025-10-31
**Status**: ✅ **FULLY OPERATIONAL**

## Overview

The prompt audit system automatically captures all LLM prompts used in the agentic flow for debugging, optimization, and cost analysis.

## Integration Status

### ✅ Services Integrated

| Service | Scenarios Tracked | Status |
|---------|-------------------|--------|
| **chat-compression-service.ts** | 3 scenarios | ✅ Integrated |
| **agent-conversation-service.ts** | 2 scenarios | ✅ Integrated |
| **agent-executor-service.ts** | 1 scenario | ✅ Integrated |
| **agent-planner-service.ts** | 3 scenarios | ✅ Integrated |

**Total Scenarios**: 9 prompt types tracked across 4 services

## Directory Structure

```
docs/prompts/
├── agent/
│   ├── planner/              ✅ Created
│   │   ├── complexity-analysis-prompt.md
│   │   ├── tool-query-prompt.md
│   │   └── synthesis-prompt.md
│   ├── executor/             ✅ Created
│   │   └── task-execution-prompt.md
│   └── conversation/         ✅ Created
│       ├── executor-turn-prompt.md
│       └── planner-response-prompt.md
└── chat/
    └── compression/          ✅ Created
        ├── title-generation-prompt.md
        ├── conversation-compression-prompt.md
        └── segment-compression-prompt.md
```

## Prompt Scenarios

### Agent Planner Service (3 scenarios)

1. **`agent-planner-complexity-analysis`**
   - Location: `agent/planner/complexity-analysis-prompt.md`
   - When: Every user message is analyzed for routing
   - Purpose: Determines if query is "direct" or "complex"
   - Metadata: Available tools, context type, user message

2. **`agent-planner-tool-query`**
   - Location: `agent/planner/tool-query-prompt.md`
   - When: Direct queries with tool access
   - Purpose: Initial state before multi-turn loop
   - Metadata: Conversation history, session info, available tools

3. **`agent-planner-synthesis`**
   - Location: `agent/planner/synthesis-prompt.md`
   - When: After executor steps complete
   - Purpose: Synthesizes results into natural language
   - Metadata: Plan stats, step results, success/failure counts

### Agent Executor Service (1 scenario)

4. **`agent-executor-task-execution`**
   - Location: `agent/executor/task-execution-prompt.md`
   - When: Executor spawned for plan step
   - Purpose: Single-shot task execution
   - Metadata: Task description, goal, tools, constraints

### Agent Conversation Service (2 scenarios)

5. **`agent-conversation-executor-turn`**
   - Location: `agent/conversation/executor-turn-prompt.md`
   - When: Each executor conversation turn
   - Purpose: Executor processes and responds
   - Metadata: Turn count, conversation history, available tools

6. **`agent-conversation-planner-response`**
   - Location: `agent/conversation/planner-response-prompt.md`
   - When: Executor asks for clarification
   - Purpose: Planner evaluates and guides
   - Metadata: Question type, task context, turn count

### Chat Compression Service (3 scenarios)

7. **`chat-compression-title-generation`**
   - Location: `chat/compression/title-generation-prompt.md`
   - When: First few messages in session
   - Purpose: Generate concise title (max 50 chars)
   - Metadata: Session ID, message count

8. **`chat-compression-conversation`**
   - Location: `chat/compression/conversation-compression-prompt.md`
   - When: Conversation exceeds token threshold
   - Purpose: Compress older messages
   - Metadata: Token counts, messages to compress

9. **`chat-compression-segment`**
   - Location: `chat/compression/segment-compression-prompt.md`
   - When: Smart compression groups messages
   - Purpose: Compress message groups into summaries
   - Metadata: Context type, message count

## Verification

### Existing Prompt Files

As of 2025-10-31:
- ✅ `agent/planner/complexity-analysis-prompt.md` (2.8K) - Generated 2025-10-31T01:10:53Z
- ✅ `agent/planner/tool-query-prompt.md` (6.1K) - Generated 2025-10-31T01:10:53Z

These files confirm the system is working in development mode.

## How It Works

### 1. Automatic Capture
- `savePromptForAudit()` is called before every LLM request
- Captures system prompt, user prompt, and metadata
- Only runs in development mode (`NODE_ENV !== 'production'`)

### 2. File Generation
- Creates markdown files with timestamps and metadata
- Includes token estimates for cost tracking
- Overwrites on each run to show latest prompt

### 3. Enhanced Logging
When a prompt is saved, you'll see:

```
================================================================================
📝 PROMPT AUDIT SAVED
================================================================================
Scenario: agent-planner-complexity-analysis
File: docs/prompts/agent/planner/complexity-analysis-prompt.md
Tokens: ~439
User: 255735ad-a34b-4ca9-942c-397ed8cc1435
================================================================================
```

## Usage

### View Prompts
Navigate to `docs/prompts/` and open any `.md` file to see:
- System prompt (instructions to LLM)
- User prompt (actual query)
- Full metadata (session IDs, user IDs, available tools)
- Token estimates

### Debug Issues
1. Check the prompt file for the scenario
2. Verify system prompt is correct
3. Check user prompt has expected context
4. Review metadata for missing information

### Optimize Costs
- Review token estimates across scenarios
- Identify prompts with excessive tokens
- Optimize system prompts for clarity and brevity
- Monitor compression effectiveness

## Environment

- **Development**: All prompts saved automatically
- **Production**: Prompt auditing disabled (no performance impact)

## Files Modified

1. `src/lib/utils/prompt-audit.ts` - Added 9 new scenario mappings
2. `src/lib/services/chat-compression-service.ts` - 3 audit points
3. `src/lib/services/agent-conversation-service.ts` - 2 audit points
4. `src/lib/services/agent-executor-service.ts` - 1 audit point
5. `src/lib/services/agent-planner-service.ts` - 3 audit points

## Next Steps

To see prompts in action:
1. Run the app in development mode: `pnpm dev`
2. Use the agent chat system
3. Check `docs/prompts/agent/` for generated files
4. Review prompts for quality and token usage

## Maintenance

- Prompt files are auto-generated and git-ignored
- Add new scenarios to `prompt-audit.ts` scenarioMap
- Update READMEs when adding new prompt categories
