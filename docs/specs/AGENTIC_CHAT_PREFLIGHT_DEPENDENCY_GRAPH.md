<!-- docs/specs/AGENTIC_CHAT_PREFLIGHT_DEPENDENCY_GRAPH.md -->

# Agentic Chat Preflight Dependency Graph (2026-01-31)

This diagram reflects the current preflight flow in `apps/web/src/routes/api/agent/stream/+server.ts` and shows **exact dependencies** between session resolution, access checks, ontology loading, and message persistence.

## DAG (Nodes → Dependents)

```
A) authenticateRequest
  → B) rateLimiter.checkLimit
  → C) parseRequest

C) parseRequest
  → D) create services (sessionManager, ontologyCacheService, messagePersister, streamHandler)

D) services
  → E) resolveSession(streamRequest, userId)
      outputs: session, metadata, conversationHistory

E) resolveSession
  → F) resolveProjectFocus(streamRequest, session, metadata)
      outputs: focusResult.metadata (+ focus)

F) resolveProjectFocus
  → G1) access_check (fast RPC / lookup)
      (may deny access → abort flow)
  → G2) ontologyCacheService.loadWithSessionCache(streamRequest, focusResult.metadata)
      outputs: ontologyContext + cacheMetadata

G1) access_check OK
  → H) persistUserMessage(session.id, userId, request.message, metadata) [async]
      outputs: persistedUserMessage.id

H) persist user message
  → I) voice_note_group linkage (optional; uses persistedUserMessage.id) [async]

G2) ontology load complete
  → J) streamHandler.startAgentStream(...)
```

## ASCII Sketch

```
authenticate ──► rateLimit ──► parseRequest ──► createServices
                                          │
                                          ▼
                                   resolveSession
                                          │
                                          ▼
                                   resolveProjectFocus
                                          │
                                          ▼
                              access check (fast)
                                          │
                    ┌─────────────────────┴────────────────────┐
                    ▼                                          ▼
           persistUserMessage (async)                 ontology load (slow)
                    │                                          │
                    ▼                                          ▼
         (if voice_note) link (async)                  startAgentStream
```

## Notes on Dependency Reasons

- **resolveSession** must run first: it yields `session`, `metadata`, `conversationHistory`.
- **resolveProjectFocus** depends on `session` + `metadata`.
- **access check** is split from ontology load to allow parallelism.
- **message persistence** happens **after** access validation but is **non-blocking** for TTFR.
- **voice note linking** depends on persisted message id.

## Minimal Parallelism (Current Code)

- Only after `resolveSession`, you can run `resolveProjectFocus` and other _non-dependent_ work.
- After access is validated, `persistUserMessage` runs asynchronously and does not block streaming.

## Optional Parallelism (If Access Check Is Split)

Access check is now split and persistence is async, which removes it from the TTFR path.
