# Agentic Chat web admission

This directory owns authenticated, request-scoped admission for queued Agentic Chat turns. It selects the per-turn surface, detects situational capabilities, enriches prompts with web-hosted skills, writes the immutable turn-input artifact, and hands a minimal reference to the queue.

It does not own canonical tool definitions, registry policy, static surface profiles, or worker execution. Import those through the public package boundaries:

- `@buildos/agentic-chat-runtime/catalog` for definitions, metadata, registry indexes, and static surfaces;
- `@buildos/agentic-chat-runtime/loop` for host-neutral loop semantics;
- `@buildos/shared-types` for queue and artifact contracts.

Do not add web-local catalog facades or import package source files directly. Worker availability must be checked before an artifact is admitted.
