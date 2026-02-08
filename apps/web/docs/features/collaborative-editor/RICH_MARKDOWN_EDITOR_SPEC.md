# Rich Markdown Editor - Assessment & Implementation Spec

> **Status:** Draft
> **Created:** 2026-02-07
> **Scope:** `RichMarkdownEditor.svelte`, `DocumentModal.svelte`, and supporting infrastructure
> **Goal:** Transform the document editor into a state-of-the-art collaborative markdown editing experience with live voice transcription at cursor, multi-user presence, and real-time sync.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Architecture Overview](#2-architecture-overview)
3. [Tier 1 - Immediate Improvements](#3-tier-1--immediate-improvements)
4. [Tier 2 - CodeMirror 6 Migration](#4-tier-2--codemirror-6-migration)
5. [Tier 3 - Real-Time Collaboration](#5-tier-3--real-time-collaboration)
6. [Voice Transcription at Cursor](#6-voice-transcription-at-cursor)
7. [Package Dependencies](#7-package-dependencies)
8. [Migration Strategy](#8-migration-strategy)
9. [Open Questions](#9-open-questions)

---

## 1. Current State Assessment

### 1.1 RichMarkdownEditor.svelte

**Location:** `apps/web/src/lib/components/ui/RichMarkdownEditor.svelte` (~1640 lines)

**What it is:** A markdown editing component built on a plain HTML `<textarea>` with a formatting toolbar, edit/preview toggle, and voice recording integration.

**What works well:**

| Feature | Implementation | Notes |
|---------|---------------|-------|
| Markdown toolbar | Bold, italic, H1/H2, lists, quote, code, link | Uses `execCommand('insertText')` for undo support |
| Edit/Preview toggle | Segmented control switches between textarea and rendered HTML | Preview uses `marked` + `sanitize-html` |
| Voice recording | Start/stop via mic button, live transcript in footer | Dual-pipeline: MediaRecorder (accuracy) + Web Speech API (live preview) |
| Cursor-aware insertion | Captures cursor position before recording, inserts transcript there | `cursorPositionBeforeRecording: { start, end }` |
| Voice note storage | Groups, segments, upload queue (max 2 concurrent) | Persists audio blobs with transcription metadata |
| Mobile responsive | Overflow toolbar menu, compact footer, touch-optimized buttons | Mobile-first with `sm:` breakpoints |
| Inkprint design | Semantic tokens, textures, pressable interactions | Consistent with BuildOS design system |

**Current limitations:**

| Limitation | Impact | Details |
|-----------|--------|---------|
| Plain `<textarea>` | No syntax highlighting, no line numbers, no inline decorations | Cannot show widgets or styled content inline |
| Transcript shows in footer only | Users don't see where text will land | Live transcript appears in a small `max-w-[200px]` box in the footer bar, not at the cursor position in the document |
| Stale cursor position | If user scrolls/moves cursor during recording, insertion uses pre-recording position | `cursorPositionBeforeRecording` captured once at recording start, never updated |
| No autosave | Manual save only, risk of lost work | Save triggered by clicking "Save" button in DocumentModal footer |
| No conflict detection | Last-write-wins on concurrent edits | PATCH endpoint sets `updated_at` but doesn't check it |
| No collaboration | Single-user only | No presence, no shared cursors, no real-time sync |
| `insertTranscriptionAtCursor` bypasses undo | Uses `setValue()` instead of `insertTextWithUndo()` | Toolbar actions use `execCommand` for undo; voice insertion does not |

### 1.2 DocumentModal.svelte

**Location:** `apps/web/src/lib/components/ontology/DocumentModal.svelte` (~1534 lines)

**What it is:** A full-featured modal for viewing and editing documents, with a two-column layout (metadata sidebar + editor).

**Key features:**
- Two-column layout: left sidebar (metadata, linked entities, version history, voice notes, activity log) + main content area (RichMarkdownEditor)
- Version history with diff viewer and restore functionality
- Breadcrumb navigation for nested document trees
- Mobile-responsive with collapsible metadata section
- Lazy-loaded AgentChatModal for "chat about this document"
- Document tree operations (move, create child)

**Integration with editor:**
```svelte
<RichMarkdownEditor
    bind:value={body}
    maxLength={50000}
    fillHeight={true}
    voiceNoteSource="document-modal"
    voiceNoteLinkedEntityType={activeDocumentId ? 'document' : ''}
    voiceNoteLinkedEntityId={activeDocumentId ?? ''}
    onVoiceNoteSegmentSaved={handleVoiceNoteSegmentSaved}
    onVoiceNoteSegmentError={handleVoiceNoteSegmentError}
/>
```

### 1.3 Document Save Pipeline

**Current flow:**
```
User clicks Save → handleSave() → PATCH /api/onto/documents/{id}
    → Server updates content column
    → Server calls createOrMergeDocumentVersion()
    → Version created or merged (same actor within 60-min window)
```

**Version system:** `onto_document_versions` table stores snapshots with SHA256 hashes. Versions merge when the same actor edits within a configurable window (default 60 minutes). Skips versioning if content hash is unchanged.

**No conflict detection:** The PATCH endpoint does not check `updated_at` before writing. Two users saving simultaneously results in last-write-wins.

### 1.4 Existing Real-Time Patterns

BuildOS already uses Supabase Realtime in three services:

| Service | Channel Pattern | Event Type | Use Case |
|---------|----------------|------------|----------|
| `realtimeProject.service.ts` | `project:{id}` | `postgres_changes` | Live sync of tasks, phases, notes |
| `realtimeBrief.service.ts` | `brief:{date}:{userId}` | `postgres_changes` | Daily brief generation status |
| `treeAgentRealtime.service.ts` | `tree-agent:run:{runId}` | `broadcast` | Agent execution events |

**Common patterns:** Channel subscription with status callbacks, deduplication of local events (2-3 second window), cleanup via `removeChannel()`, browser-only guards.

### 1.5 Voice Transcription Pipeline

```
Recording starts:
    1. Capture cursor position (selectionStart/selectionEnd)
    2. Start MediaRecorder (audio capture)
    3. Start Web Speech API (live transcript)
    4. Display live transcript in footer bar

Recording stops:
    1. Capture live transcript string
    2. Stop MediaRecorder → get audio Blob
    3. Insert live transcript at captured cursor position (immediate)
    4. Upload audio blob to voice notes storage (async, queued)
    5. Send audio to /api/transcribe for server transcription (async)
    6. If server transcript differs significantly, update stored voice note
```

**Key insight:** The live transcript (Web Speech API) is used for immediate insertion. The server transcription (Whisper/Deepgram) is used to update the stored voice note metadata but does NOT replace the already-inserted text.

---

## 2. Architecture Overview

### Target State (All Tiers Complete)

```
                    +-----------------------+
                    |   DocumentModal.svelte |
                    |   (metadata sidebar)   |
                    +-----------+-----------+
                                |
                    +-----------v-----------+
                    | RichMarkdownEditor.svelte |
                    |  (CodeMirror 6 based)     |
                    +--------+------+----------+
                             |      |
              +--------------+      +---------------+
              |                                     |
    +---------v---------+              +------------v-----------+
    | Voice Transcription|              | Yjs Collaboration      |
    | - Cursor widget    |              | - Y.Doc shared state   |
    | - Live preview     |              | - Awareness (cursors)  |
    | - Insert at cursor |              | - Supabase transport   |
    +-------------------+              +------------------------+
                                                |
                                    +-----------v-----------+
                                    | Supabase Realtime      |
                                    | broadcast channel      |
                                    | per document           |
                                    +-----------------------+
```

### Evolution Path

```
CURRENT          TIER 1              TIER 2              TIER 3
textarea     →   textarea +       →  CodeMirror 6 +   →  CM6 + Yjs +
manual save      autosave +          cursor widgets +     presence cursors +
no conflicts     conflict detect     voice at cursor      real-time sync
```

Each tier is independently shippable and builds on the previous one.

---

## 3. Tier 1 - Immediate Improvements

**Effort:** ~3-5 days
**Risk:** Low (no editor framework change)
**Prerequisite for:** Tiers 2 and 3

### 3.1 Autosave with Debounce

Add debounced autosave to DocumentModal that PATCHes content after the user stops typing.

**Behavior:**
- 2-second debounce after last keystroke
- Only saves if content has actually changed (compare with last-saved value)
- Show save status indicator in header: "Saving..." / "Saved" / "Unsaved changes"
- Disable manual Save button while autosave is in flight
- On modal close with unsaved changes, warn user or force-save

**Implementation location:** `DocumentModal.svelte` (new `$effect` watching `body`, `title`, `description`, `stateKey`)

**Save status states:**
```
idle        → User hasn't changed anything since last save
dirty       → User has unsaved changes
saving      → PATCH request in flight
saved       → Successfully saved (show for 2 seconds, then → idle)
error       → Save failed (show error, allow retry)
conflict    → Server version is newer (see 3.2)
```

### 3.2 Conflict Detection

Add optimistic concurrency control to the document PATCH endpoint.

**Mechanism:**
- Include `expected_updated_at` in PATCH request body (the `updated_at` value from when the document was loaded)
- Server compares `expected_updated_at` against current `updated_at` in database
- If mismatch: return `409 Conflict` with the current server document
- Client shows conflict UI: "This document was modified. Reload latest or overwrite?"

**Server change:** `apps/web/src/routes/api/onto/documents/[id]/+server.ts` PATCH handler.

**Client change:** `DocumentModal.svelte` - track `loadedUpdatedAt` and include in save requests.

### 3.3 Fix Voice Insertion Undo Support

Replace `setValue()` in `insertTranscriptionAtCursor()` with `insertTextWithUndo()` (which already exists and uses `execCommand`). This makes voice-inserted text part of the browser's undo stack.

**Current (broken):**
```typescript
const newValue = value.slice(0, start) + finalTranscript + value.slice(end);
setValue(newValue); // Bypasses undo stack
```

**Fixed:**
```typescript
insertTextWithUndo(start, end, finalTranscript, newCursorPos, newCursorPos);
```

### 3.4 Keyboard Shortcuts for Toolbar

Add standard keyboard shortcuts to the textarea:

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+B` | Bold |
| `Cmd/Ctrl+I` | Italic |
| `Cmd/Ctrl+K` | Insert link |
| `Cmd/Ctrl+S` | Save (trigger autosave immediately) |
| `Tab` | Indent (insert 2 spaces or indent list) |
| `Shift+Tab` | Outdent |

---

## 4. Tier 2 - CodeMirror 6 Migration

**Effort:** ~2-3 weeks
**Risk:** Medium (replaces core editing component)
**Prerequisite for:** Tier 3

### 4.1 Why CodeMirror 6

| Criteria | textarea (current) | CodeMirror 6 | TipTap/ProseMirror |
|----------|-------------------|-------------|-------------------|
| Markdown fidelity | Lossless (plain text) | Lossless (plain text) | Lossy (schema conversion) |
| Syntax highlighting | None | Built-in via `@codemirror/lang-markdown` | N/A (rich text) |
| Inline widgets | Impossible | `Decoration.widget()` API | NodeViews |
| Collaboration | None | `y-codemirror.next` (mature) | `y-prosemirror` (mature) |
| Svelte 5 support | Native | `svelte-codemirror-editor` v2.x | No official binding |
| Line numbers | None | Built-in | N/A |
| Performance (large docs) | Good | Excellent (virtual rendering) | Good |
| Undo/redo | Browser native (fragile) | Built-in history extension | Built-in |
| Best comparison | Notepad | VS Code | Notion |

**Decision: CodeMirror 6** - aligns with "VS Code Live" vision, markdown-native, clean Yjs integration path.

### 4.2 Component Architecture

Replace the `<textarea>` inside `RichMarkdownEditor.svelte` with a CodeMirror 6 `EditorView`.

**Key decision:** Use CodeMirror 6 directly (not the `svelte-codemirror-editor` wrapper) for full control over extensions, especially for Yjs integration and custom decorations. The wrapper is convenient but limiting for advanced use cases.

**New internal structure:**

```
RichMarkdownEditor.svelte
├── CodeMirror EditorView (mounted in $effect)
├── Extensions:
│   ├── @codemirror/lang-markdown (syntax + highlighting)
│   ├── @codemirror/theme-one-dark (dark mode) + custom light theme
│   ├── Custom toolbar keybindings (Cmd+B, Cmd+I, etc.)
│   ├── Custom voice transcription widget (StateField + Decoration)
│   ├── Line wrapping
│   ├── Placeholder
│   └── [Tier 3] yCollab extension
├── Toolbar (existing, rewired to dispatch CM6 transactions)
├── Preview mode (existing, unchanged)
├── Voice footer (existing, enhanced with cursor widget)
└── Props interface (unchanged - value bindable, voice props, etc.)
```

### 4.3 Markdown Syntax Highlighting

Use `@codemirror/lang-markdown` for:
- Headings styled with larger/bolder text
- Bold/italic rendered inline
- Code blocks with language-specific highlighting
- Links styled distinctly
- List markers highlighted

**Future enhancement (optional):** Obsidian-style live preview where markdown syntax characters hide when cursor is not on that line. This requires a custom `ViewPlugin` with `Decoration.replace()`. Reference implementation: `codemirror-rich-markdoc`.

### 4.4 Theme Integration

Create two CodeMirror themes that match Inkprint design tokens:

```typescript
// Light theme
const inkprintLight = EditorView.theme({
  '&': {
    backgroundColor: 'var(--card)',
    color: 'var(--foreground)',
  },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--accent)/.15' },
  '.cm-gutters': {
    backgroundColor: 'var(--muted)',
    color: 'var(--muted-foreground)',
    borderRight: '1px solid var(--border)',
  },
  // ... markdown-specific styles
})
```

Dark theme follows the same pattern with `dark:` semantic tokens.

### 4.5 Toolbar Rewiring

The existing toolbar buttons currently call functions like `surroundSelection('**')` which manipulate the textarea directly. These need to be rewritten as CodeMirror commands:

```typescript
function toggleBold(view: EditorView): boolean {
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const replacement = `**${selected || 'text'}**`;
    view.dispatch({
        changes: { from, to, insert: replacement },
        selection: { anchor: from + 2, head: from + 2 + (selected || 'text').length }
    });
    return true;
}
```

### 4.6 Value Binding

CodeMirror 6 manages its own state. We need bidirectional sync with the `value` prop:

- **Inbound (prop to editor):** When `value` prop changes externally (e.g., document load), update the editor via `view.dispatch({ changes: { from: 0, to: doc.length, insert: newValue } })`
- **Outbound (editor to prop):** On each transaction with `docChanged`, update the bound `value` prop
- **Guard against loops:** Use a flag to prevent prop-change-from-editor from triggering an inbound update

---

## 5. Tier 3 - Real-Time Collaboration

**Effort:** ~3-5 weeks
**Risk:** High (new infrastructure, distributed systems concerns)
**Prerequisite:** Tier 2 complete

### 5.1 CRDT Layer (Yjs)

Each document gets a `Y.Doc` containing a `Y.Text` type that syncs with the CodeMirror editor.

**Setup per document session:**
```
1. Open DocumentModal for document {id}
2. Create Y.Doc
3. Create Y.Text: ydoc.getText('content')
4. Initialize Y.Text from loaded document content
5. Create Yjs provider (connects to Supabase Realtime channel)
6. Create Y.UndoManager(ytext) for collaborative undo
7. Add yCollab(ytext, provider.awareness, { undoManager }) to CM6 extensions
8. On close: destroy provider, cleanup Y.Doc
```

### 5.2 Transport: Supabase Realtime Broadcast

Use Supabase Realtime broadcast channels as the Yjs sync transport. This avoids running a separate WebSocket server.

**Channel pattern:** `document:{documentId}`

**Custom Yjs provider (build from scratch, ~200 lines):**

```
SupabaseYjsProvider
├── Connects to Supabase channel `document:{docId}`
├── Broadcasts Yjs update messages via channel.send()
├── Receives updates from other clients via channel.on('broadcast')
├── Encodes/decodes Yjs updates as base64 (broadcast payloads are JSON)
├── Implements Awareness protocol for cursor presence
├── Handles reconnection (Supabase manages WebSocket lifecycle)
└── Persists Y.Doc state to database on interval (every 30s) or on disconnect
```

**Why not `y-supabase` package:** The existing package is explicitly marked as unstable and has known performance issues. A custom provider scoped to our needs is more reliable and ~200 lines of code.

**Why not `y-websocket`:** Would require running a separate WebSocket server on Railway. Adds operational complexity. Supabase Realtime already provides the WebSocket infrastructure.

### 5.3 Presence & Awareness (Colored Cursors)

Yjs includes an Awareness protocol that the `yCollab` extension renders automatically:

- Each connected user gets a colored cursor in the document
- Cursor label shows user's display name
- Selection ranges are highlighted in the user's color
- Awareness state includes: `{ user: { name, color }, cursor: { anchor, head } }`

**Color assignment:** Assign colors from a predefined palette based on user index in the session. Store in Awareness state.

**User identity:** Pull from Supabase Auth session (`user.email`, `user.user_metadata.name`).

### 5.4 Persistence Strategy

The Yjs document state needs to survive all clients disconnecting:

**Option A - Inline snapshot (recommended for v1):**
- On every autosave (debounced), also persist `Y.encodeStateAsUpdate(ydoc)` as a base64 string in a new `yjs_state` column on `onto_documents`
- On document load: if `yjs_state` exists, apply it to a fresh `Y.Doc` instead of setting plain text
- Fallback: if `yjs_state` is missing/corrupt, initialize from `content` column

**Option B - Separate storage (future):**
- Store Yjs state in a dedicated `document_yjs_state` table
- Enables incremental updates instead of full snapshots
- Better for large documents with many collaborators

### 5.5 Conflict Resolution

With Yjs, conflicts are resolved automatically by the CRDT algorithm. However, we need to handle the transition:

**Existing documents (no Yjs state):**
1. Load `content` from database
2. Initialize `Y.Doc` with content as initial text
3. First edit creates Yjs state going forward
4. Autosave writes both `content` (plain text) and `yjs_state` (CRDT)

**Mixed clients (one with Yjs, one without):**
- The `content` column always reflects the latest plain text (written by autosave)
- Non-collaborative clients (older code, API writes) can still read/write `content`
- On next collaborative session open, `yjs_state` is rehydrated and content is reconciled

### 5.6 Document Locking (Optional Safety Net)

For the transition period, consider lightweight document locking:
- When a user opens a document for editing, register a "presence" record
- Show other users who is currently editing: "Alice is also editing this document"
- No hard locks - just awareness

This can use Supabase Realtime presence (track/untrack) without any database changes.

---

## 6. Voice Transcription at Cursor

This is the "nice little character with a description saying it's transcribing right where the cursor is" feature. It spans Tiers 1 and 2 with different implementations.

### 6.1 Tier 1 Implementation (Textarea Overlay)

Since Tier 1 keeps the `<textarea>`, we use an overlay approach:

**Mechanism:**
1. When recording starts, capture cursor position (already done)
2. Create a hidden mirror `<div>` with identical styling to the textarea
3. Copy text up to cursor position into the mirror
4. Measure the position of the cursor in the mirror using a marker `<span>`
5. Position an absolutely-placed indicator element at those coordinates, overlaying the textarea
6. Show: small animated dot + "Transcribing..." label
7. As live transcript arrives, show preview text flowing from the indicator
8. When recording stops, remove indicator and insert final text

**Limitations:** This is inherently hacky. The mirror div must perfectly match the textarea's font, padding, line-height, and scroll position. It works but is fragile across browsers and zoom levels.

### 6.2 Tier 2 Implementation (CodeMirror Widget)

With CodeMirror 6, this becomes clean and native:

**Mechanism:**
1. Define a `TranscribingWidget` extending `WidgetType`
2. Create a `StateField` that manages a `DecorationSet` containing the widget
3. When recording starts: dispatch `addTranscribingWidget` effect at cursor position
4. Widget renders as an inline element: animated indicator + "Transcribing..." label
5. As live transcript arrives: dispatch `updateTranscriptPreview` effect - widget shows growing text
6. When recording stops: dispatch `removeTranscribingWidget` effect, insert final text via CM6 transaction

**Widget appearance:**
```
... existing document text |[cursor] [animated-dot] Transcribing... "partial transcript here" | more text ...
```

The widget sits inline with the text at the exact cursor position. It's visible to the user exactly where their text will appear.

**StateField definition (conceptual):**
```
StateField<DecorationSet>
├── Effects:
│   ├── startTranscribing: { pos: number }  → add widget at pos
│   ├── updatePreview: { text: string }      → update widget content
│   └── stopTranscribing: null               → remove widget
├── update(): map decorations through changes, apply effects
└── provide: EditorView.decorations
```

### 6.3 Widget Visual Design

The transcribing indicator should follow Inkprint design language:

```
┌─────────────────────────────────────────────┐
│  ... document text here                     │
│                                             │
│  The quick brown fox |● Transcribing...     │
│  "jumped over the lazy"                     │
│                                             │
│  More document text below...                │
└─────────────────────────────────────────────┘
```

- `●` = small pulsing dot in accent color
- "Transcribing..." = micro-label style text in `text-muted-foreground`
- Live transcript preview = shown in `text-accent` with `bg-accent/10` background
- Whole widget has a subtle left border in accent color
- Smooth fade-in on appear, fade-out on complete
- On completion: brief green checkmark flash, then widget removed and text inserted

---

## 7. Package Dependencies

### Tier 1 (No New Dependencies)

No new packages needed. All changes are within existing components.

### Tier 2

| Package | Version | Purpose | Size |
|---------|---------|---------|------|
| `codemirror` | ^6.0.0 | Core editor bundle | ~150KB min+gz |
| `@codemirror/lang-markdown` | ^6.5.0 | Markdown language support | ~15KB |
| `@codemirror/theme-one-dark` | ^6.0.0 | Dark theme (base for Inkprint dark) | ~3KB |
| `@lezer/markdown` | (peer dep) | Markdown parser | ~12KB |

**Total added bundle:** ~180KB min+gzip (loaded only when editor is mounted, can be code-split)

### Tier 3 (Additional)

| Package | Version | Purpose | Size |
|---------|---------|---------|------|
| `yjs` | ^13.6.0 | CRDT library | ~30KB min+gz |
| `y-codemirror.next` | ^0.3.5 | Yjs <-> CM6 binding | ~5KB |
| `lib0` | (peer dep of yjs) | Utility library | ~10KB |

**Total added bundle (Tier 3):** ~45KB min+gzip on top of Tier 2

**Not needed:**
- `svelte-codemirror-editor` - we'll integrate CM6 directly for full extension control
- `y-supabase` - we'll write a custom ~200-line provider
- `y-websocket` / `y-webrtc` - using Supabase Realtime instead

---

## 8. Migration Strategy

### 8.1 Component Boundary

`RichMarkdownEditor.svelte` is the migration boundary. Its external interface (props, events, bindables) stays the same across all tiers. DocumentModal and other consumers should not need changes.

**Contract to preserve:**
```typescript
interface Props {
    value?: string;              // Two-way bindable, markdown string
    maxLength?: number;
    fillHeight?: boolean;
    enableVoice?: boolean;
    voiceNoteSource?: string;
    voiceNoteLinkedEntityType?: string;
    voiceNoteLinkedEntityId?: string;
    onVoiceNoteSegmentSaved?: (note: VoiceNote) => void;
    onVoiceNoteSegmentError?: (error: string) => void;
    isRecording?: boolean;       // Bindable
    isTranscribing?: boolean;    // Bindable
    // ... other existing props unchanged
}
```

### 8.2 Phased Rollout

**Tier 1:** Ship directly. Low risk, no framework change.

**Tier 2:** Build the CM6 editor as an alternative component (`CodeMirrorEditor.svelte`), then swap it into `RichMarkdownEditor` behind a feature flag. Once stable, remove the textarea code path.

**Tier 3:** Build collaboration as an optional extension. Documents open in single-user mode by default. Collaboration activates when a second user opens the same document (lazy Yjs initialization).

### 8.3 Rollback Plan

- **Tier 1:** Revert autosave logic; manual save still works
- **Tier 2:** Feature flag switches back to textarea
- **Tier 3:** Disable Yjs provider; editor falls back to single-user CM6 mode; `content` column always has latest plain text

### 8.4 File Changes by Tier

**Tier 1:**
```
MODIFY  apps/web/src/lib/components/ui/RichMarkdownEditor.svelte
            - Fix insertTranscriptionAtCursor to use insertTextWithUndo
            - Add keyboard shortcuts
MODIFY  apps/web/src/lib/components/ontology/DocumentModal.svelte
            - Add autosave debounce logic
            - Add save status indicator
            - Add conflict detection on save
MODIFY  apps/web/src/routes/api/onto/documents/[id]/+server.ts
            - Add expected_updated_at conflict check to PATCH
```

**Tier 2:**
```
CREATE  apps/web/src/lib/components/ui/CodeMirrorEditor.svelte
            - New CM6-based editor component
CREATE  apps/web/src/lib/components/ui/codemirror/
            - extensions.ts (markdown, themes, keybindings)
            - voice-widget.ts (transcribing indicator StateField)
            - inkprint-theme.ts (light + dark themes)
MODIFY  apps/web/src/lib/components/ui/RichMarkdownEditor.svelte
            - Swap textarea for CodeMirrorEditor
            - Rewire toolbar to dispatch CM6 commands
            - Rewire voice insertion to use CM6 transactions
```

**Tier 3:**
```
CREATE  apps/web/src/lib/services/collaboration/
            - supabase-yjs-provider.ts (custom Yjs provider)
            - document-presence.service.ts (who's editing what)
            - collaboration.types.ts (shared types)
MODIFY  apps/web/src/lib/components/ui/codemirror/extensions.ts
            - Add yCollab extension (conditional)
MODIFY  apps/web/src/lib/components/ontology/DocumentModal.svelte
            - Initialize collaboration when document opens
            - Show presence indicators
MIGRATE  Database: add yjs_state column to onto_documents
```

---

## 9. Open Questions

| # | Question | Context | Impact |
|---|----------|---------|--------|
| 1 | **Should Tier 2 include Obsidian-style live preview?** | Hiding markdown syntax on unfocused lines. Adds ~1 week of custom ViewPlugin work. | UX polish vs. scope |
| 2 | **Yjs state persistence: inline or separate table?** | Inline (`yjs_state` column) is simpler. Separate table allows incremental updates. | Database design |
| 3 | **Max concurrent collaborators per document?** | Supabase Realtime broadcast supports ~100 clients per channel. Yjs itself has no hard limit. | Architecture constraints |
| 4 | **Should non-CM6 clients (API, agents) be able to write to collaborative documents?** | If yes, need reconciliation logic when Yjs state and content column diverge. | Complexity |
| 5 | **Voice transcription during collaboration: should other users see the "Transcribing..." widget?** | Requires broadcasting voice state via Awareness protocol. Cool but adds complexity. | Feature scope |
| 6 | **Should we pursue Tier 1 textarea overlay for voice-at-cursor, or skip to Tier 2?** | Tier 1 overlay is hacky and fragile. Tier 2 does it cleanly. If Tier 2 is happening soon, maybe skip Tier 1 overlay. | Prioritization |
| 7 | **Line numbers: always on, or toggleable?** | VS Code shows them by default. Some markdown editors hide them. | UX preference |
| 8 | **Code-split the CM6 bundle?** | ~180KB is significant. Could lazy-load when editor mounts. DocumentModal already lazy-loads AgentChatModal. | Performance |

---

## Appendix A: Reference Implementations

| Project | Stack | Relevance |
|---------|-------|-----------|
| [Obsidian](https://obsidian.md/) | CodeMirror 6 + custom decorations | Live preview markdown editing |
| [Yjs CodeMirror Demo](https://demos.yjs.dev/codemirror.next/codemirror.next.html) | CM6 + y-codemirror.next + y-websocket | Minimal collaborative CM6 setup |
| [codemirror-rich-markdoc](https://github.com/segphault/codemirror-rich-markdoc) | CM6 + custom ViewPlugin | Hybrid rich-text/markdown editing |
| [HackMD](https://hackmd.io/) | CodeMirror + collaborative | Production collaborative markdown |

## Appendix B: Database Schema Reference

**`onto_documents` (current columns):**
```sql
id              uuid PRIMARY KEY
project_id      uuid REFERENCES onto_projects(id)
title           text NOT NULL
description     text
content         text                    -- markdown body
type_key        text NOT NULL
state_key       text NOT NULL DEFAULT 'draft'
props           jsonb                   -- legacy body_markdown, tags, etc.
created_at      timestamptz
created_by      uuid
updated_at      timestamptz
deleted_at      timestamptz
children        jsonb
search_vector   tsvector
```

**`onto_document_versions` (current columns):**
```sql
id              uuid PRIMARY KEY
document_id     uuid REFERENCES onto_documents(id)
number          integer                 -- auto-incremented per document
created_by      uuid
props           jsonb                   -- snapshot, hash, change_count, window
storage_uri     text                    -- always 'inline://document-snapshot'
created_at      timestamptz
```

**Tier 3 addition:**
```sql
ALTER TABLE onto_documents ADD COLUMN yjs_state bytea;
-- Binary Yjs document state, used to hydrate Y.Doc on load
-- Null for documents that have never been collaboratively edited
```
