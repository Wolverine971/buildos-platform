<!-- apps/web/docs/features/conversational-agent/README.md -->

# Conversational Agent System

## Overview

The Conversational Agent is an AI-powered system that helps users create and manage projects through natural conversation. Unlike traditional forms, users can describe their projects in natural language, and the agent intelligently extracts structured information.

## Status: 🚧 In Development (60% Complete)

**Target Release**: 10% rollout planned
**Implementation Started**: October 28, 2025

## Key Features

### 7 Agent Modes

1. **General** - Open-ended assistance
2. **Project Create** - Convert ideas into structured projects
3. **Project Update** - Modify existing projects conversationally
4. **Project Audit** - Critical review and improvement suggestions
5. **Project Forecast** - Scenario planning and risk analysis
6. **Task Update** - Quick task modifications
7. **Daily Brief Update** - Conversational daily planning

### Core Capabilities

- **Natural Language Processing**: Describe projects conversationally
- **Smart Dimension Detection**: Automatically identifies project aspects
- **Progressive Disclosure**: Asks clarifying questions as needed
- **Draft Management**: Work on projects before committing
- **Operation Approval**: Review changes before applying (manual by default)
- **Real-time Streaming**: See AI responses as they're generated

## Architecture

### Components

```
/lib/components/agent/
├── AgentModal.svelte         # Main 3-panel interface
├── ChatInterface.svelte      # Conversation UI with SSE
├── OperationsLog.svelte      # History of executed operations [TODO]
├── OperationsQueue.svelte    # Pending operations approval [TODO]
└── DraftsList.svelte         # Draft project management [TODO]
```

### Services

```
/lib/services/
├── agent-orchestrator.service.ts  # Main agent logic
└── draft.service.ts               # Draft project management
```

### API Endpoints

```
/routes/api/agent/
└── stream/+server.ts  # SSE streaming endpoint
```

## Database Schema

### New Tables

- `project_drafts` - Temporary project storage
- `draft_tasks` - Tasks within drafts
- `chat_operations` - Generated operations
- `chat_session_operations` - Session-operation mapping
- `operation_dependencies` - Operation relationships
- `chat_session_dimensions` - Detected project dimensions

### Extended Tables

- `chat_sessions` - Added agent metadata
- `chat_messages` - Added operation references

## Integration Points

The agent system integrates with:

1. **BrainDumpProcessor** - For dimension detection
2. **OperationsExecutor** - For executing approved operations
3. **SmartLLMService** - For AI interactions
4. **ParsedOperation** - Reuses existing operation interface

## User Flow

1. User opens agent modal and selects mode
2. User describes their project/task in natural language
3. Agent analyzes input and detects dimensions
4. Agent asks clarifying questions (3-5 for simple, 7-10 for complex)
5. User answers questions to provide more context
6. Agent generates operations for review
7. User approves/rejects operations (manual by default)
8. Approved operations execute and update the system
9. Draft can be finalized into a real project

## Configuration

### Default Settings

```typescript
{
  enabled: true,
  rollout_percentage: 10,
  default_auto_accept: false,  // Manual approval required
  max_questions_simple: 5,
  max_questions_complex: 10,
  audit_harshness: 7,          // 1-10 scale
}
```

## Implementation Progress

### ✅ Completed

- Database schema and migration
- Type definitions
- Backend services (DraftService, AgentOrchestrator)
- API streaming endpoint
- Basic UI components (AgentModal, ChatInterface)

### 🚧 In Progress

- Remaining UI components
- Integration testing
- Documentation

### ⏳ Planned

- User testing
- Performance optimization
- Feature announcement
- 10% rollout

## Usage Examples

### Creating a Project

```
User: "I want to build a mobile app for tracking fitness goals"

Agent: "I'll help you create a project for your fitness tracking app. Let me ask a few questions to better understand your vision:

1. What platforms are you targeting? (iOS, Android, or both?)
2. What are the main features you want to include?
3. Do you have a timeline in mind?
..."
```

### Auditing a Project

```
User: "Review my e-commerce project and tell me what's missing"

Agent: "I'll conduct a thorough audit of your e-commerce project. Based on my analysis:

Strengths:
- Clear product catalog structure
- Well-defined checkout flow

Areas for Improvement:
- Missing security considerations
- No performance metrics defined
- Customer support workflow needs detail
..."
```

## Testing

### Manual Testing Checklist

- [ ] Create project flow
- [ ] Update existing project
- [ ] Audit project with harsh feedback
- [ ] Forecast project scenarios
- [ ] Operation approval workflow
- [ ] Draft finalization
- [ ] Error handling
- [ ] Session persistence

### Automated Tests

Tests are located in:

- `/lib/services/__tests__/agent-orchestrator.test.ts` [TODO]
- `/lib/services/__tests__/draft.service.test.ts` [TODO]

## Security Considerations

- All operations use RLS policies for user isolation
- Operations require explicit approval by default
- Drafts are user-scoped and cannot be accessed by others
- Session tokens validated on each request

## Performance Considerations

- SSE streaming for real-time responses
- Progressive disclosure to manage token usage
- Caching of dimension detection results
- Efficient operation batching

## Related Documentation

- [Original Spec](../../../../thoughts/shared/ideas/conversational-project-agent.md)
- [Implementation Progress](../../../../thoughts/shared/research/2025-10-28_conversational-agent-implementation-progress.md)
- [Brain Dump System](../brain-dump/README.md)
- [Database Schema](../../technical/database/schema.md)

## Future Enhancements

- Voice input support
- Multi-language support
- Template suggestions
- Collaborative editing
- Mobile app integration
- Webhook notifications
- Advanced analytics
