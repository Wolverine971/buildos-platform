<!-- apps/web/docs/features/document-service/STEP_2_EDITOR_ACCEPTANCE_2026-09-07.md -->

# Step 2 editor interaction: acceptance and remaining rollout

**Date:** 2026-09-07. Follow-up to the
[editor status and autosave recovery review](./EDITOR_STATUS_AND_RECOVERY_2026-09-07.md).

The selected-passage interaction is now more reliable through save → ask → review → apply.
This pass fixes the client interaction and adds regression coverage. It does not mark the full
production interaction, history/restore, or microphone acceptance gate complete.

## Changes

- **Ask waits for the current save.** A click during an in-flight save waits for its result and
  checks that the captured passage is still current. Apply also waits, then flushes subsequent
  local edits before sending the proposal request. Unrelated document edits survive apply.
- **Apply owns the editor until refresh finishes.** Body, metadata, ordinary Save, and close
  controls stay locked while applying and reloading. Autosave cannot race the apply request.
  Closing the completed review does not prematurely release that lock.
- **Reselection works.** A stale selection closes the old review and returns focus to the editor.
  The next Ask retains the user's instruction but uses a new selection and a fresh proposal.
- **Keyboard focus follows the work.** Ask focuses the instruction field, so typing an instruction
  cannot accidentally replace the selected document text. Cancel and reselect focus the editor;
  Apply restores the editor selection and focus after refresh.
- **Cancelled and stale requests cannot update a replacement review.** Each captured selection
  has its own keyed review. Closing it aborts its request; late responses and callbacks are ignored.
  Proposal payloads are checked for a valid patch and the expected document before showing Apply.
- **Voice instructions finish before generation.** Initialization, recording, stopping, and
  transcription block generation and dismissal. Document-body recording also blocks proposal
  selection/apply. The voice service is mocked in the regression test; physical microphone and
  permission behavior still need device acceptance.
- **History warnings are truthful.** A successful apply with a version-write warning displays that
  warning, including on an idempotent receipt, without claiming the edit was added to history.
  A successful apply followed by a failed document reload reports both outcomes clearly.

## Verification

### Automated interaction and service coverage

**38 tests passed** across these focused files:

```sh
pnpm --filter @buildos/web exec vitest run \
  src/lib/components/ontology/DocumentProposalReview.test.ts \
  src/lib/components/ontology/DocumentModal.test.ts \
  src/lib/server/document-proposal.service.test.ts \
  src/lib/components/ui/codemirror/CodeMirrorEditor.voice.test.ts
```

Coverage includes exact selection/hash submission, save serialization, conflict recovery,
instruction preservation, close/abort races, invalid proposals, revision linkage, version warnings,
recording/transcription gating, apply/refresh locking, and editor selection/focus restoration.
The existing proposal service tests retain guarded apply, idempotency, and revision coverage.

Required Svelte check: **0 errors, 0 warnings**. Svelte component analysis and formatting were also
run. The modal/editor retain their existing sanitized Markdown rendering advisories and structural
suggestions; those are not new raw HTML rendering paths.

### Browser acceptance

The real document modal, CodeMirror editor, proposal review, diff, and toast components were mounted
locally with synthetic API responses. The fixture uses the shared patch construction/resolution
code and blocks external API traffic. No real document, model request, or production history row
was modified.

- Desktop at **1440 × 1000**: select passage, Ask, enter instruction, generate, inspect split diff.
- Phone-sized viewport at **390 × 844**: instruction and diff remain usable; Apply is reachable.
- While reviewing, append an unrelated note, then Apply: the original paragraph is replaced and
  the extra note remains. The request sequence saves local changes before applying the proposal.
- After Apply: the review closes, the editor receives keyboard focus, and the page has no
  horizontal overflow. Browser console: no errors in the final acceptance run.

Local screenshots are in `output/playwright/document-flow/`: `desktop-proposal.png`,
`mobile-proposal.png`, and `mobile-applied.png`. The synthetic fixture is archived there as well;
it is not included in the application's source or static assets.

## Next bounded pass

1. Roll out the prepared recency-trigger migration and web fixes through the normal deployment
   flow. Verify consecutive real autosaves and a genuine second-editor conflict. This pass made
   no production deployment.
2. Exercise the same interaction against the live model and database, including real voice input,
   generated history, comparison, and restore. Observe proposal latency/conflict/failure telemetry.
   These are the remaining Step 2 acceptance gates, not implied by the synthetic browser test.
3. Then extract the session/save controller from the modal using these regression cases as the
   contract, following the deferred modal-decomposition plan. Resume Step 3's atomic START HERE
   creation/index work after the editor trust gate is closed.
