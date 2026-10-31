// packages/agentic-chat-client/src/index.ts
/**
 * @buildos/agentic-chat-client — the browser/phone side of agentic chat, host-neutral.
 *
 * The worker streams a turn over a private Supabase realtime channel; this package turns
 * that into UI state: the inbox orders events and buffers gaps, the coordinator reconciles
 * against the durable log, turn adoption re-attaches to turns still running, and the UI
 * adapter drives a small port (begin/append/finish) a Svelte or React screen implements.
 * Hosts own the socket (a Supabase client), fetch (bearer or cookie) and rendering.
 */
export * from './worker-realtime-inbox';
export * from './worker-realtime-coordinator';
export * from './worker-realtime-preview';
export * from './worker-realtime-channel';
export * from './worker-realtime-runtime';
export * from './worker-turn-adoption';
export * from './agent-chat-worker-status';
export * from './agent-chat-workflow';
export * from './agent-chat-thinking-state';
export * from './agent-chat.types';
export * from './agent-chat-worker-ui-adapter';
