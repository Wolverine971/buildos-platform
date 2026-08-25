# Agentic Chat web host

This tree contains the web host's remaining responsibilities: legacy synchronous execution, web-only service adapters, external account and MCP integration, dynamic domain sensing, and skill content used during admission.

The `tools/core/executors` classes are host adapters around authenticated web services; they are not the canonical tool catalog. Catalog consumers must import `@buildos/agentic-chat-runtime/catalog`, and shared deterministic behavior must import its public runtime subpath rather than a forwarding file in this tree.

New queued execution behavior belongs in the worker. Keep web authentication and per-request capability discovery here, while keeping portable definitions and policy out of the application boundary.
