<!-- packages/agentic-chat-client/README.md -->

# @buildos/agentic-chat-client

The client side of agentic chat, shared by `apps/web` and `apps/mobile`. It was lifted out of
`apps/web/src/lib/{services/agentic-chat-v2,components/agent}` on 2026-10-30; the old paths are
one-line re-exports, so web imports did not change.

What it owns, in the order a turn flows:

- `worker-realtime-channel` — subscribes a Supabase client to the person's private
  `chat-user:<id>` channel and feeds the inbox. The host passes its own Supabase client.
- `worker-realtime-inbox` — orders stream events per turn, buffers gaps, asks for reconciliation.
- `worker-realtime-coordinator` — reconciles against the durable log (`/api/agent/v2/turns/[id]/reconcile`)
  with watchdogs and backoff. Pass `fetchImpl` to add a bearer header on the phone.
- `worker-realtime-runtime` — wires channel + coordinator for one signed-in person.
- `worker-turn-adoption` — re-attaches to turns still running after a reopen or relaunch.
- `agent-chat-worker-ui-adapter` — turns events into calls on a small port
  (`beginGeneration`, `appendAssistantText`, `applySemanticEvent`, `finishTurn`, …) that a
  Svelte or React screen implements. `agent-chat-worker-status`, `agent-chat-workflow`,
  `agent-chat-thinking-state` and `agent-chat.types` are its vocabulary.

Rules: imports only `@buildos/shared-types`; no SvelteKit aliases, DOM, React Native or
Node-only APIs (it runs on Hermes, browsers and Node); keep changes additive, both apps ship
from it. Validate with `pnpm --filter @buildos/agentic-chat-client typecheck`,
`pnpm --filter @buildos/agentic-chat-client exec vitest run` and `… build`.
