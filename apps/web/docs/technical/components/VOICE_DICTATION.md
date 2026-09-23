<!-- apps/web/docs/technical/components/VOICE_DICTATION.md -->

# Voice Dictation

> **Status:** Current (2026-09-23)
> **Supersedes:** the voice sections of `TEXTAREA_WITH_VOICE_REFINEMENTS.md`,
> `TEXTAREA_WITH_VOICE_MOBILE_OPTIMIZATION.md`, and the pipeline described in
> `../../features/ontology/DOCUMENT_EDITOR_VOICE_SPEC.md` (old `voiceRecording.service` /
> `utils/voice` were removed).

Every voice surface (agent chat composer, `/today` capture, onboarding brain dump, document
"Ask" box, comments, document/plan editor, `/voice-notes` recorder) runs on one engine in
`apps/web/src/lib/voice/`.

## What the user experiences

1. Tap the mic. The level meter moves with their voice within ~300ms.
2. Words land in the field at the caret as they talk: server-confirmed words solid, the
   browser's live draft grey, a pulsing caret where new words arrive.
3. Every ~8–28s, at a pause, the audio recorded so far is transcribed in the background, so
   confirmed text grows while they keep talking. There is no length cap.
4. Stop (mic, send, or Enter): only the last short piece still needs transcribing, so the final
   text settles in ~1–3s however long they talked.
5. Failures degrade in order: retry (3 attempts) → the live draft for that piece (with a notice)
   → hold with **Retry / Keep what's there** when there is no draft. The audio is always saved as
   a voice note.

## Engine (`lib/voice/`)

| File                          | Role                                                                                                                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audio-capture.ts`            | Mic stream → analyser (level + pause detection), a full-length recorder (saved as the voice note), and rolling segment recorders. The next segment recorder starts before the previous stops, so no audio is dropped. |
| `speech-activity.ts`          | Pure pause detection and cut policy (`DEFAULT_SEGMENT_POLICY`). Segments with no speech skip transcription entirely (no silent-audio hallucinations).                                                                 |
| `transcription-queue.ts`      | Transcribes segments with concurrency 2, retries transient failures, and passes the previous segment's text as context.                                                                                               |
| `transcribe-client.ts`        | One `POST /api/transcribe` with a client-side ceiling and retryable/permanent error classification.                                                                                                                   |
| `live-draft.ts`               | Web Speech API draft. Restarts across the browser's pause-driven session ends and gives up quietly when refused.                                                                                                      |
| `draft-alignment.ts`          | Maps draft words onto segments, so each segment's grey words are replaced by its server text.                                                                                                                         |
| `dictation-session.svelte.ts` | `VoiceDictation`: the reactive state machine (`idle → starting → recording → finishing`) every surface renders from. Only one dictation captures at a time.                                                           |
| `textarea-dictation.ts`       | Anchors dictation at a plain textarea's caret and commits in place.                                                                                                                                                   |
| `voice-note-sink.ts`          | Uploads the full recording as a voice note, then adds the transcript. Groups linked to an entity are created `attached`, so the 24h draft cleanup never deletes them.                                                 |
| `test-fakes.ts`               | Fake mic, draft, and transcriber for component tests.                                                                                                                                                                 |

UI pieces live in `lib/components/voice/`: `VoiceMicButton`, `VoiceStatusLine` (recording,
finishing, and error states, readable at every width), `VoiceLevelMeter`, and `DictationMirror`.
`DictationMirror` overlays a textarea with identical typography while its own glyphs are
transparent. CodeMirror uses an inline widget instead (`ui/codemirror/voice-widget.ts`).

## Server

`/api/transcribe` accepts `audio`, `vocabularyTerms`, `context` (the previous segment's text),
and `allowEmpty`.

`SmartLLMService.transcribeAudio` passes vocabulary and context to the model as
`provider.options.{openai,groq}.prompt`. If a provider rejects the prompt, it retries once
without it. It also enforces a 100s total deadline (the function's `maxDuration` is 120s).

The `transcribe` rate-limit policy allows 90 starts per 10 minutes and 3 concurrent requests,
because one long dictation makes many small requests. The byte budget is the spend guard.

## Host contract

Hosts keep their existing bindings on `TextareaWithVoice` and `CommentTextareaWithVoice`.

- `isTranscribing` now means "finishing". `isStopping` is always false.
- Anything that submits the field must wait until recording **and** finishing are both false.
  Use `isVoiceBusy` on `CommentTextareaWithVoice`, or `isRecording || isTranscribing` on
  `TextareaWithVoice`.
- In agent chat, the mic works mid-response. A dictated follow-up queues with its voice-note
  group (`queuedVoiceNoteGroupId`) and sends when the response finishes.

## Verification

- Unit tests:
    - `lib/voice/*.test.ts`
    - `ui/TextareaWithVoice.test.ts`
    - `ui/CommentTextareaWithVoice.test.ts`
    - `ui/codemirror/*voice*.test.ts`
    - `ontology/DocumentProposalReview.test.ts`
    - `agent-chat-stream-controller.svelte.test.ts`
- Browser: headless Chromium with a fake mic (`--use-file-for-fake-audio-capture`) on
  `/today/preview`, with `/api/transcribe` mocked. Results:
    - start took 283ms
    - segments were cut at pauses (11.0s and 25.0s), and each decoded as standalone audio with no gaps
    - the final text landed ~60ms after the mocked transcription returned
- Not verified: Safari/iOS segment rotation. If Safari refuses a second recorder, the engine
  falls back to transcribing the whole recording once, at the end.
