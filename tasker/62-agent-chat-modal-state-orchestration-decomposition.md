<!-- tasker/62-agent-chat-modal-state-orchestration-decomposition.md -->

# 62 — Agent Chat modal state/orchestration decomposition

**Created:** 2026-08-25

**Status:** Open

**Priority:** P2
**Type:** Frontend simplification investigation

## Why this exists

The queue-first UI change found the same worker status copy in three places. That copy is now one
shared projection, but `AgentChatModal.svelte` still owns a large amount of subscription, lifecycle,
attachment, parked-session, keyboard, and worker-state orchestration. The required Svelte analyzer
reported no errors, but it flagged many state mutations inside effects plus mutable `Map`/`Set`
instances. Those are existing risks, especially during queued → running → terminal transitions.

## Investigation

- Inventory which state belongs to rendering, worker-turn adoption, session lifecycle, attachments,
  parked-chat lifecycle, keyboard behavior, and agent-run fallbacks.
- Extract one boundary at a time into testable `.svelte.ts` controllers with explicit inputs/events.
- Replace effect-driven synchronization with derived state only where behavior is provably preserved.
- Evaluate `SvelteMap`/`SvelteSet` for collections whose mutations should be reactive; retain plain
  collections where they are intentionally nonreactive and document that decision.
- Add a transition fixture covering waiting, processing, reconnect, cancel, and terminal hydration.

## Acceptance criteria

1. The modal becomes primarily composition/rendering rather than transport orchestration.
2. Queued/running copy and status projection have a single source of truth.
3. No new API calls or Realtime subscriptions are introduced.
4. Svelte autofixer, full Svelte check, and the worker UI transition fixture are clean.
5. Each extraction lands independently with behavior-preserving tests.

## Non-goals

- A visual redesign of the chat.
- Replacing Supabase Realtime.
- A one-shot rewrite of the modal.
