<!-- apps/web/src/lib/services/agentic-chat/README.md -->

# Agentic Chat web host

This tree contains the web host's remaining responsibilities: synchronous execution for capabilities the dedicated worker cannot yet execute, web-only service adapters, external account and MCP integration, dynamic domain sensing, and skill content used during admission. The synchronous SSE runtime is intentionally isolated under `legacy-execution/`; it is a capability boundary, not a global transport rollback or the home for new agent behavior.

The `tools/core/executors` classes are host adapters around authenticated web services; they are not the canonical tool catalog. Catalog consumers must import `@buildos/agentic-chat-runtime/catalog`, and shared deterministic behavior must import its public runtime subpath rather than a forwarding file in this tree.

New queued execution behavior belongs in the dedicated worker. Keep web authentication and per-request capability discovery here, while keeping portable definitions and policy out of the application boundary. Remove a legacy capability path only after its worker replacement has reviewed parity or the product intentionally retires that capability.
