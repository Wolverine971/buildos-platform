# Brain Dump Feature

The brain dump is BuildOS's core innovation - users write stream-of-consciousness thoughts, and AI automatically extracts projects, tasks, and context.

## Documentation in This Folder

- `build-os-prep-braindump-llm-call-plan.md` - LLM call architecture and optimization plan

## Overview

The brain dump allows users to dump their thoughts without structure. The system then:
1. Analyzes the content
2. Determines if it's a new project or update to existing
3. Extracts tasks and project context
4. Optionally generates phases and schedules

## Processing Modes

### Short Processing
- < 500 characters or simple updates to existing projects
- Single-pass extraction
- Faster processing
- Endpoint: `/api/braindumps/stream-short`

### Dual Processing
- ≥ 500 characters or new projects
- Parallel context + tasks extraction
- Higher accuracy
- Endpoint: `/api/braindumps/stream`

## Key Files

**Components:**
- `/src/lib/components/brain-dump/BrainDumpModal.svelte` - Main interface
- `/src/lib/components/brain-dump/RecordingView.svelte` - Voice/text input
- `/src/lib/components/brain-dump/BrainDumpProcessingNotification.svelte` - Progress display

**Services:**
- `/src/lib/services/braindump-api.service.ts` - API client
- `/src/lib/services/braindump-background.service.ts` - Background processing
- `/src/lib/services/voiceRecording.service.ts` - Voice input

**Processors:**
- `/src/lib/utils/braindump-processor.ts` - Dual processing logic
- `/src/lib/utils/braindump-processor-stream-short.ts` - Short processing

**API:**
- `/src/routes/api/braindumps/stream/+server.ts` - Long brain dump endpoint
- `/src/routes/api/braindumps/stream-short/+server.ts` - Short brain dump endpoint

## Related Documentation

- Complete flow: `/apps/web/docs/technical/architecture/brain-dump-flow.md`
- Prompts: `/apps/web/docs/prompts/brain-dump/`
- Store architecture: `/apps/web/docs/technical/components/brain-dump/`
