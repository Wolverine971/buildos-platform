<!-- apps/web/docs/features/phase-generation/README.md -->

# Phase Generation

Procedural phase generation system for organizing brain dump output into logical project phases.

## Overview

The phase generation system takes extracted tasks from brain dumps and organizes them into phases with optional calendar scheduling. Multiple strategies are available depending on user preferences.

## Status

**Partially Implemented** (October 2025) - Core generation works, calendar-optimized strategy in progress.

## Key Documents

- [Procedural Phase Generation Status](PROCEDURAL_PHASE_GENERATION_STATUS.md) - Current implementation status and remaining work

## Key Files

- `src/lib/services/phase-generation/orchestrator.ts` - Phase generation orchestrator
- `src/lib/services/phase-generation/strategies/` - Generation strategies
    - `base-strategy.ts` - Abstract base class
    - `phases-only.strategy.ts` - Simple phase generation
    - `schedule-in-phases.strategy.ts` - With calendar integration
    - `calendar-optimized.strategy.ts` - Calendar-aware generation

## Related

- `/apps/web/docs/features/braindump-context/` - Brain dump processing (upstream)
- `/apps/web/docs/features/calendar-integration/` - Calendar integration (downstream)
