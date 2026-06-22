<!-- docs/plans/AGENTIC_CHAT_IMAGE_OCR_ATTACHMENT_PIPELINE_TASKER_2026-06-22.md -->

# Agentic Chat Image/OCR Attachment Pipeline Tasker

Status: implemented
Created: 2026-06-22
Owner: BuildOS agentic chat
Workstream: frontend decomposition / DRY / modal cleanup

## Purpose

Give one agent enough context to extract the image attachment and OCR polling pipeline out of `AgentChatModal.svelte`.

The modal already has successful extraction patterns: voice, prewarm, SSE handling, and tool presentation live in separate modules with focused tests. The remaining image pipeline is similarly cohesive and should become its own controller before the riskier send/stream controller extraction.

## Goal

Create a Svelte-runes controller module for draft image attachments and OCR state, then wire `AgentChatModal.svelte` to it with no user-visible behavior change.

Recommended new file:

```text
apps/web/src/lib/components/agent/agent-chat-attachments.svelte.ts
```

Recommended test file:

```text
apps/web/src/lib/components/agent/agent-chat-attachments.svelte.test.ts
```

## Required Reading

Read these before editing:

1. `apps/web/src/lib/components/agent/AgentChatModal.svelte`
    - Current image pipeline lives mostly around the `imageAttachments` state and helper functions.
2. `apps/web/src/lib/components/agent/agent-chat.types.ts`
    - Defines `AgentChatImageAttachment` and attachment status types.
3. `apps/web/src/lib/components/agent/AgentComposer.svelte`
    - Renders attachment chips and calls attachment callbacks.
4. `apps/web/src/lib/components/agent/agent-chat-voice.svelte.ts`
    - Existing small controller pattern.
5. `apps/web/src/lib/components/agent/agent-chat-prewarm.svelte.ts`
    - Existing larger controller pattern with deps and `$state` fields.
6. `apps/web/src/routes/api/agent/chat-attachments/+server.ts`
    - Draft attachment upload/create/complete path.
7. `apps/web/src/routes/api/agent/v2/stream/+server.ts`
    - Server-side attachment validation and normalization for stream requests.
8. `docs/specs/AGENTIC_CHAT_MULTIMODAL_SUPPORT_SPEC.md`
    - Background intent for multimodal chat support, if needed.

## Current State

`AgentChatModal.svelte` owns all of this directly:

- `imageAttachments` state
- active preview URL tracking and cleanup
- upload generation guard
- max attachment limit enforcement
- file type filtering
- SHA-256 checksum computation
- duplicate checksum handling
- image dimensions extraction
- upload to `/api/agent/chat-attachments`
- existing asset attachment
- OCR status labels
- OCR polling for draft attachments
- OCR polling for persisted message attachments
- applying asset snapshots back into draft and message state
- conversion from draft attachment to `ChatAttachmentRef`
- ready attachment filtering for stream request and optimistic user message

This is cohesive state-machine logic. Keeping it in the modal makes the later send/stream extraction harder because `sendMessage()` has to know too much about attachment internals.

## Recommended Design

Create an `AttachmentController` class that follows the existing `VoiceAdapter` / `PrewarmController` style:

```ts
export interface AttachmentControllerDeps {
	getBrowser(): boolean;
	getProjectId(): string | null | undefined;
	getMessages(): UIMessage[];
	setMessages(updater: (messages: UIMessage[]) => UIMessage[]): void;
	toastError(message: string): void;
	logWarn?(message: string, error: unknown): void;
	fetchImpl?: typeof fetch;
	createObjectUrl?(file: File): string;
	revokeObjectUrl?(url: string | null | undefined): void;
	randomUUID?(): string;
}

export class AttachmentController {
	imageAttachments = $state<AgentChatImageAttachment[]>([]);
	get hasSendableImageAttachments(): boolean;
	get hasPendingOrFailedImageAttachments(): boolean;
	handleFiles(files: File[]): void;
	attachExistingImage(asset: OntologyImageAsset): void;
	remove(attachmentId: string): void;
	clearDraft(): void;
	restoreDraft(attachments: AgentChatImageAttachment[]): void;
	buildReadyRefs(includePreviewUrl?: boolean): ChatAttachmentRef[];
	scheduleMessageOcrPoll(messageId: string, assetId: string, status: unknown): void;
	cleanup(): void;
}
```

Names are flexible. The important boundary is that the modal should ask the controller for state and commands, not manipulate attachment internals directly.

## Implementation Tasks

1. Move pure helpers first:
    - `shouldPollOcrStatus`
    - `describeAttachmentOcrStatus`
    - attachment-to-ref conversion
    - duplicate checksum detection
2. Move stateful draft attachment logic:
    - update/remove/clear
    - preview URL lifecycle
    - upload generation guard
    - max count / file validation / duplicate asset checks
3. Move upload logic:
    - hash and dimensions
    - create temporary attachment
    - complete/queue OCR
    - apply returned asset snapshot
4. Move OCR polling:
    - draft attachment polling
    - persisted message attachment polling
    - max attempt/delay constants
5. Wire `AgentChatModal.svelte` to the controller:
    - replace `imageAttachments` reads with `attachments.imageAttachments`
    - replace `handleImageAttachmentFiles` with `attachments.handleFiles`
    - replace `handleAttachExistingImage` with `attachments.attachExistingImage`
    - replace `removeImageAttachment` with `attachments.remove`
    - replace `buildReadyImageAttachmentRefs` with `attachments.buildReadyRefs`
6. Preserve send behavior:
    - stream request uses refs without preview URLs
    - optimistic UI message uses refs with preview URLs
    - on send success, clear draft attachments
    - on send failure, restore sent draft attachments
    - attachment-only messages still get generated text like `Attached 1 image`
7. Preserve session reset/close behavior:
    - reset conversation clears draft attachments
    - preview URLs are revoked on removal and cleanup
    - existing image picker closes after successful send
8. Add focused unit tests for the controller.
9. Update this doc after implementation with final files changed and any intentionally retained modal logic.

## Non-Goals

Do not do these in this task:

- Do not change upload API contracts.
- Do not change server-side attachment validation.
- Do not change image picker UI.
- Do not extract `sendMessage()` yet.
- Do not rewrite `AgentComposer.svelte` beyond prop names needed for wiring.
- Do not change OCR behavior or polling intervals except to make them testable constants.

## Risk Areas

- Browser APIs: `File`, `crypto.subtle`, `Image`, `URL.createObjectURL`, and timers need injectable or mockable wrappers for tests.
- Preview URL leaks: revocation must still happen on remove, reset, and controller cleanup.
- Race protection: keep the upload generation guard so stale uploads do not repopulate after reset.
- Temporary vs onto asset refs: preserve the existing `temporary_attachment_id` vs `asset_id` distinction.
- Message OCR polling: this mutates already-sent optimistic message attachments and must continue after draft state clears.

## Acceptance Criteria

- `AgentChatModal.svelte` no longer contains the image upload/OCR state machine.
- The modal still passes `imageAttachments`, attachment limit, and callbacks to `AgentComposer.svelte`.
- Users can attach local images, attach existing project images, remove images, send attachment-only messages, and see OCR status changes.
- Failed send restores draft image attachments.
- Preview URLs are revoked.
- Controller tests cover validation, duplicate handling, clear/restore, ready refs, and OCR polling behavior.

## Suggested Verification

Run focused frontend tests:

```bash
pnpm --filter @buildos/web test -- \
  src/lib/components/agent/agent-chat-attachments.svelte.test.ts \
  src/lib/components/agent/AgentComposer.test.ts
```

Then run the stream route tests that cover attachment request handling:

```bash
pnpm --filter @buildos/web test -- src/routes/api/agent/v2/stream/server.test.ts
```

If browser smoke is practical, manually verify:

- drag/drop image
- paste image
- attach existing project image
- remove image before send
- send with image only
- send with text plus image
- force a failed stream send and confirm draft attachments restore

## Implementation Notes

Implemented: 2026-06-22

Files changed:

- `apps/web/src/lib/components/agent/agent-chat-attachments.svelte.ts`
- `apps/web/src/lib/components/agent/agent-chat-attachments.svelte.test.ts`
- `apps/web/src/lib/components/agent/AgentChatModal.svelte`

The attachment upload/OCR state machine now lives in `AttachmentController`.
`AgentChatModal.svelte` retains only composer/image-picker wiring, send-time ref
selection, draft clear/restore calls, and close/reset cleanup calls. The modal
still owns `showExistingImagePicker` because that is image-picker UI state rather
than attachment pipeline state.

Verification run:

```bash
pnpm --filter @buildos/web test -- src/lib/components/agent/agent-chat-attachments.svelte.test.ts src/lib/components/agent/AgentComposer.test.ts
pnpm --filter @buildos/web test -- src/routes/api/agent/v2/stream/server.test.ts
pnpm --filter @buildos/web check
```
