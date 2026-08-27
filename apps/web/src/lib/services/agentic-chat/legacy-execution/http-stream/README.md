<!-- apps/web/src/lib/services/agentic-chat/legacy-execution/http-stream/README.md -->

# Legacy Agentic Chat HTTP stream

This directory owns the compatibility HTTP/SSE composition root used only when
capability negotiation selects web-hosted legacy execution. The public
`/api/agent/v2/stream` route is a thin adapter into this boundary.

## Responsibilities

- authenticate the request and enforce project or daily-brief access;
- parse and normalize the admitted turn request;
- resolve server-owned context, prepared prompts, attachments, and history;
- run the synchronous provider/tool loop for explicitly retained capabilities;
- emit the established SSE protocol and persist turn lifecycle evidence;
- handle cancellation, timeout, recovery, checkpoints, and terminal state.

## Retained capabilities

Gmail, Calendar, browser OAuth handoff, and the worker-disabled image path stay
here until each replacement has reviewed worker parity or an explicit product
retirement decision. Infrastructure uncertainty must never select this host.

## Change rules

1. New worker-compatible behavior belongs in the runtime package or dedicated
   Agentic Chat worker, not in this directory.
2. Preserve the route characterization suite when extracting collaborators.
3. Extract one lifecycle seam at a time and keep provider requests, prompt
   snapshots, tool ordering, persistence records, and terminal SSE envelopes
   unchanged.
4. Remove a retained capability only with parity evidence and a reversible
   rollout plan.

The next useful seams are request/admission orchestration, stream lifecycle
construction, and finalization. Their existing collaborators already live under
`agentic-chat-v2/stream-route` and `agentic-chat-v2/stream-orchestrator`.
