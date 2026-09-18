<!-- tasker/88-chat-workflow-ordinary-chat.md -->

# 88 — Bring project review into ordinary chat

**Created:** 2026-09-12  
**Status:** New-state code can start; 85's interface is frozen (2026-09-14). Render from `projection.workflow` (`AgenticChatWorkflowProjectionV1`) through reconciliation, with no table grants.  
**Depends on:** 85 event/request contract; 86 and 87 accepted before live activation.  
**Parallel with:** 86 admission and 87 runner in isolated worktrees.  
**Unblocks:** 89's final ordinary-chat browser acceptance.

## Outcome

An enabled user can choose **Review project** in the ordinary project-chat composer,
send a question, and follow the work in the same conversation. They do not need to
type `/workflow`, visit a lab, or understand worker/agent internals. The interface
makes it obvious whether work is submitting, waiting, preparing, progressing,
recovering, finished, partial, failed, or cancelled.

Read [81](81-chat-workflow-implementation-program.md), 85's frozen request/events,
and [the current prototype](../apps/worker/src/workers/agentic-chat/djflow-prototype.md).
Reuse `WorkflowProgressCard.svelte`, existing findings metadata and durable stream
reconciliation. The current lab already proves progress/streamed synthesis; build
the ordinary-chat entry and missing states instead of a second chat implementation.

## Work

1. Add a compact, explicit review action to the project composer for the server-enabled
   cohort. Bind review intent to the next immutable submission, show that choice
   clearly, and reset it after acceptance. An ordinary following message stays ordinary.
   Retrying an uncertain submission keeps its original identity and intent; changing
   intent requires a new submission, not rewriting an in-flight turn.
2. Reuse the message/composer lifecycle. Show **Sending** immediately while admission
   is pending, **Queued** only after durable acceptance, then actual worker progress.
   Avoid a second setup modal, agent configuration form, new conversation, or mandatory
   confirmation for a read-only review.
3. Present one compact progress summary with expandable accepted findings. Stream only
   the editor's answer as assistant text. Hide specialist drafts and implementation
   terminology; users need progress, evidence, coverage gaps and outcomes.
4. Map 84/85/87 states to truthful copy. Delivery disconnected is **Reconnecting**,
   not execution failed; a recovering worker says work is being resumed and retains
   completed steps. A long phase displays elapsed time and available actions without
   inventing an ETA or claiming progress that has not occurred.
5. Make completed, partial, failed and cancelled outcomes visually/textually distinct.
   Partial review names missing coverage. Remove the active Stop control after terminal
   truth arrives. If starting over is appropriate, make it an explicit new turn;
   never automatically replay a paid review because the user refreshes.
6. Preserve one answer through remount, session switching, out-of-order events,
   reconnect and saved-message hydration. Durable terminal/checkpoint state takes
   precedence over stale local optimistic state.
7. Keep normal chat, attachments, unsupported/global contexts, keyboard submission,
   mobile layout, focus and screen-reader announcements working. Cohort visibility
   is a convenience; server admission is the permission boundary. Do not expose raw
   provider prompts, private execution receipts or cost ledger internals in the UI.

## Ownership and parallel work

Own narrow changes in `apps/web/src/lib/components/agent/`:
`WorkflowProgressCard.svelte`, `ThinkingBlock.svelte`, `AgentChatModal.svelte`,
`agent-chat-session.ts`, `agent-chat-sse-handler.ts` and related tests. Reuse existing
styling/components. Load the installed Svelte writing and best-practice skills
before analyzing/editing components, and run their required analyzer.

85 owns shared event types; 86 owns server admission. Do not invent a browser-only
workflow flag that grants access or edit the server contract independently. 62 owns
broader modal decomposition: coordinate file ownership and avoid folding that
refactor into this feature. Existing-state fixtures may be built before the contract
freeze; new-state fixtures wait for its real types. Live activation waits for 86/87.

## Acceptance and handoff

- Component/controller fixtures cover sending → queued → preparation → parallel work
  → streamed answer → full/partial completion; failed/cancelled/reconnecting/recovering
  branches; Stop races; refresh; switching away/back; duplicate and stale events.
- An ordinary follow-up does not inherit review mode. Double submit is deduplicated;
  changed mode cannot mutate the accepted request. Non-cohort callers cannot activate
  a review by tampering with client state.
- Existing normal-chat tests pass. No extra subscription per step, page polling loop,
  or duplicate answer renderer is introduced.
- Run narrow session/SSE/ThinkingBlock/progress tests through `test-gate`, the Svelte
  analyzer and relevant web check serially. Coordinator runs the complete gate.
- In the real ordinary-chat browser, submit without `/workflow`, observe actual
  incremental answer text, Stop one review, reload one, and view an intentionally
  partial result. Record first UI feedback, first progress, first visible answer and
  terminal times separately. Browser screenshots supplement durable readback.

Return an inspectable UI, transition fixtures, accessibility/keyboard results,
source identity and browser evidence. Leave Workflow Lab as the internal diagnostic
path during acceptance. This task does not enable general production access or remove
the rollback lane. Completion requires the real chat journey, not only mocked states.
