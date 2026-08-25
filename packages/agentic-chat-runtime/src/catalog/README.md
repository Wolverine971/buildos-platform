# Agentic Chat runtime catalog

This directory is the canonical, host-neutral catalog boundary for Agentic Chat. It owns model-facing definitions, metadata, immutable indexes, registry/op mappings, context taxonomy, entity-result materialization policy, and static surface profiles.

The catalog must remain deterministic and portable: no web or worker imports, no authentication, no database clients, and no network or filesystem I/O. Application consumers import `@buildos/agentic-chat-runtime/catalog`; they must not reach into this source directory or recreate application-local re-export facades.

Dynamic per-turn selection, external-account availability, and skill enrichment remain web admission concerns. Provider composition, queue lifecycle, and mutation execution remain worker concerns.
