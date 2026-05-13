# Daily Brief Voice Narration — Spec

**Status:** Draft, ready for review
**Author:** DJ (with Claude)
**Date:** 2026-05-13
**Target rollout:** Admin-gated alpha → wider opt-in beta

---

## 1. Summary

Add AI-narrated audio playback to BuildOS daily briefs. When a brief is generated, the worker also generates an MP3 of the brief content using a local open-source TTS model (Kokoro-TTS, `am_onyx` voice). The audio is stored in Supabase Storage and surfaced via a "🔊 Listen" button next to the brief in the UI.

For the alpha, only admin users can opt in. Audio generation is opt-in per user, not automatic.

## 2. Goals

- Users can hear their daily brief read aloud in a high-quality AI voice.
- Audio generation runs entirely on existing Railway infra — no third-party TTS API spend.
- Audio file generation is async (non-blocking) and does not delay brief delivery.
- Audio is gated to admins for the alpha so we can validate quality, cost, and UX before broader release.
- The "🔊 Listen" button only appears when an audio file actually exists.

## 3. Non-goals

- Voice cloning (DJ's voice or anyone else's). Single preset voice for v1.
- Multi-language support. English only for v1.
- Streaming audio (chunked). Pre-generated, fully-buffered MP3 only.
- Playing in the daily brief **email**. In-app only for v1.
- Audio for any content other than daily briefs (no brain dumps, projects, etc.).
- Per-user voice selection. `am_onyx` for everyone in alpha.

## 4. Locked decisions

| Decision | Value |
|---|---|
| Engine | **Kokoro-TTS v1.0** (`hexgrad/Kokoro-82M`, Apache 2.0 license) |
| Voice | **`am_onyx`** (American male, deep, audiobook-style) |
| Audio format | **MP3** (smaller than WAV; ~480KB vs ~2.8MB for a 60s clip) |
| Gating | **Admin-only** for alpha via `users.is_admin` |
| Opt-in | **User setting** `voice_narration_enabled` (default `false`) |
| Listen button location | **`DailyBriefModal.svelte`** + **`DashboardBriefWidget.svelte`**, only when `audio_url` is non-null |
| Generation timing | Async, after `generate_daily_brief` succeeds, via separate queue job |
| Auth on audio URLs | Supabase Storage signed URLs (1 hour TTL), bucket RLS scoped to owner |

## 5. Architecture

### 5.1 The Node-vs-Python question

`apps/worker` is Node.js. Kokoro's reference implementation is Python. Two paths:

**Recommended: `kokoro-js`** (npm, community port using ONNX runtime). Pros: same language as the rest of the worker, no Python dependency, single Railway service. Cons: less battle-tested than the Python original; need to verify it loads the `am_onyx` voice correctly with acceptable quality.

**Fallback: Python sidecar.** Either spawn `python` as a subprocess per-job, or run Kokoro as a small Flask/FastAPI service on Railway. Adds ops surface; reference-impl quality guaranteed.

**Plan:** Phase 1 smoke-tests `kokoro-js` end-to-end. If quality matches the local Python test or the package fails to load `am_onyx`, fall back to a Python sidecar.

### 5.2 Component diagram

```
┌─────────────────────────┐
│ scheduler / cron        │
│   schedules brief jobs  │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐    success    ┌──────────────────────────┐
│ queue: generate_daily_  │──────────────▶│ queue: generate_brief_   │
│   brief                 │               │   audio (NEW)            │
└───────────┬─────────────┘               └────────────┬─────────────┘
            │ writes                                   │ writes
            ▼                                          ▼
   ┌───────────────────┐                  ┌─────────────────────────┐
   │ daily_briefs row  │                  │ Supabase Storage:       │
   │   summary_content │                  │   briefs-audio/         │
   │   audio_url (NEW) │◀─────────────────│     {user_id}/          │
   └─────────┬─────────┘   updates row    │     {brief_id}.mp3      │
             │                            └─────────────────────────┘
             ▼
   ┌───────────────────┐
   │ Web UI:           │
   │   DailyBriefModal │
   │   + 🔊 Listen     │
   └───────────────────┘
```

### 5.3 Data flow

1. User opens BuildOS in the morning; scheduler enqueues `generate_daily_brief` as usual.
2. Worker processes brief, writes `summary_content` to `daily_briefs`.
3. **NEW**: On success, if the user has `is_admin = true` AND `voice_narration_enabled = true`, worker enqueues `generate_brief_audio` with `{ brief_id }`.
4. `generate_brief_audio` worker:
   - Loads brief row, fetches `summary_content`.
   - Cleans markdown to TTS-safe plain text.
   - Synthesizes via Kokoro (`am_onyx`).
   - Encodes to MP3.
   - Uploads to `briefs-audio/{user_id}/{brief_id}.mp3`.
   - Updates `daily_briefs` row with `audio_url`, `audio_generated_at`, `audio_duration_ms`, `audio_status='ready'`.
5. UI subscribes to brief updates (existing realtime channel or polling); when `audio_url` appears, "🔊 Listen" button renders.

## 6. Schema changes

### 6.1 Migration: `daily_briefs` table

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_add_brief_audio.sql

alter table public.daily_briefs
  add column audio_url text,
  add column audio_status text not null default 'none'
    check (audio_status in ('none', 'pending', 'generating', 'ready', 'failed')),
  add column audio_voice text,
  add column audio_duration_ms integer,
  add column audio_generated_at timestamptz,
  add column audio_error text;

-- For looking up pending audio jobs
create index if not exists daily_briefs_audio_status_idx
  on public.daily_briefs (audio_status)
  where audio_status in ('pending', 'generating');

comment on column public.daily_briefs.audio_url is
  'Storage path (briefs-audio/{user_id}/{brief_id}.mp3) when audio_status = ready. NULL otherwise.';
comment on column public.daily_briefs.audio_status is
  'none = not requested. pending = job queued. generating = job running. ready = audio_url valid. failed = see audio_error.';
```

### 6.2 Migration: `users` table

Add user opt-in flag.

```sql
alter table public.users
  add column voice_narration_enabled boolean not null default false;

comment on column public.users.voice_narration_enabled is
  'When true (and is_admin = true during alpha), daily briefs are narrated to MP3 and surfaced in-app.';
```

### 6.3 Regenerate types

After migration runs:

```bash
pnpm gen:all
```

This refreshes `packages/shared-types/src/database.types.ts` and `database.schema.ts`.

## 7. Storage

### 7.1 Bucket

- **Name:** `briefs-audio`
- **Privacy:** Private (no public read)
- **Path convention:** `{user_id}/{brief_id}.mp3`
- **Created via migration:**

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'briefs-audio',
  'briefs-audio',
  false,
  10485760,  -- 10 MB ceiling per file
  array['audio/mpeg']
)
on conflict (id) do nothing;
```

### 7.2 RLS policies

```sql
-- Users can read their own files
create policy "Users read own brief audio"
on storage.objects for select
to authenticated
using (
  bucket_id = 'briefs-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Only service role writes
create policy "Service role writes brief audio"
on storage.objects for insert
to service_role
with check (bucket_id = 'briefs-audio');

create policy "Service role updates brief audio"
on storage.objects for update
to service_role
using (bucket_id = 'briefs-audio');

create policy "Service role deletes brief audio"
on storage.objects for delete
to service_role
using (bucket_id = 'briefs-audio');
```

### 7.3 Signed URL flow

The `audio_url` column stores the **storage path**, not a signed URL. The web app generates a fresh signed URL on demand in the `+page.server.ts` loader (or a `+server.ts` endpoint) using `supabase.storage.from('briefs-audio').createSignedUrl(path, 3600)`. This keeps URLs short-lived and revocable.

## 8. Worker changes

### 8.1 New job type: `generate_brief_audio`

**File:** `apps/worker/src/workers/briefAudio/briefAudioWorker.ts` (new)

```typescript
import type { JobAdapter } from '../shared/jobAdapter';
import { synthesizeBrief } from '../../lib/tts/kokoro';
import { stripBriefMarkdown } from '../../lib/tts/textCleanup';
import { uploadBriefAudio } from '../../lib/storage/briefAudio';

interface BriefAudioJobData {
  briefId: string;
}

export async function processBriefAudio(job: JobAdapter<BriefAudioJobData>) {
  const { briefId } = job.data;
  const supabase = job.adminSupabase;

  // 1. Load brief
  const { data: brief, error } = await supabase
    .from('daily_briefs')
    .select('id, user_id, summary_content')
    .eq('id', briefId)
    .single();

  if (error || !brief) throw new Error(`brief ${briefId} not found`);

  // 2. Mark generating
  await supabase
    .from('daily_briefs')
    .update({ audio_status: 'generating' })
    .eq('id', briefId);

  try {
    // 3. Prepare text
    const plain = stripBriefMarkdown(brief.summary_content);

    // 4. Synthesize
    const t0 = Date.now();
    const mp3Buffer = await synthesizeBrief(plain, { voice: 'am_onyx' });
    const durationMs = Date.now() - t0;
    await job.log(`synthesis: ${durationMs}ms, ${mp3Buffer.length} bytes`);

    // 5. Upload
    const path = `${brief.user_id}/${brief.id}.mp3`;
    await uploadBriefAudio(supabase, path, mp3Buffer);

    // 6. Mark ready
    await supabase
      .from('daily_briefs')
      .update({
        audio_url: path,
        audio_status: 'ready',
        audio_voice: 'am_onyx',
        audio_duration_ms: durationMs,
        audio_generated_at: new Date().toISOString(),
        audio_error: null,
      })
      .eq('id', briefId);
  } catch (err) {
    await supabase
      .from('daily_briefs')
      .update({
        audio_status: 'failed',
        audio_error: (err as Error).message?.slice(0, 500),
      })
      .eq('id', briefId);
    throw err;
  }
}
```

### 8.2 Register in `apps/worker/src/worker.ts`

Add to the existing job registrations near line 378:

```typescript
queue.process('generate_brief_audio', processBriefAudio);
```

Add `'generate_brief_audio'` to the `jobTypes` array around line 488 (used for queue monitoring/health).

### 8.3 Enqueue from `generate_daily_brief`

In the existing brief processor (file containing the `processBrief` registered on line 378), after the brief is successfully written, add:

```typescript
// Trigger voice narration if user has it enabled.
const { data: user } = await supabase
  .from('users')
  .select('is_admin, voice_narration_enabled')
  .eq('id', userId)
  .single();

if (user?.is_admin && user?.voice_narration_enabled) {
  await supabase.rpc('add_queue_job', {
    job_type: 'generate_brief_audio',
    job_data: { briefId: brief.id },
    user_id: userId,
  });

  // Mark as queued so UI can show "generating audio..."
  await supabase
    .from('daily_briefs')
    .update({ audio_status: 'pending' })
    .eq('id', brief.id);
}
```

### 8.4 Kokoro service wrapper

**File:** `apps/worker/src/lib/tts/kokoro.ts` (new)

```typescript
import { KokoroTTS } from 'kokoro-js';

let pipelinePromise: Promise<KokoroTTS> | null = null;

function getPipeline(): Promise<KokoroTTS> {
  if (!pipelinePromise) {
    pipelinePromise = KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8',  // 8-bit quantized for smaller memory footprint
    });
  }
  return pipelinePromise;
}

export interface SynthesisOptions {
  voice: string;
  speed?: number;  // default 1.0
}

export async function synthesizeBrief(
  text: string,
  options: SynthesisOptions
): Promise<Buffer> {
  const tts = await getPipeline();
  const audio = await tts.generate(text, {
    voice: options.voice,
    speed: options.speed ?? 1.0,
  });

  // audio is a Float32Array of 24kHz PCM samples.
  // Convert to MP3 via lame.
  return encodeToMp3(audio, 24000);
}
```

The `encodeToMp3` helper uses `@breezystack/lamejs` (pure-JS) or shells out to `ffmpeg` (requires nixpacks install). See §9.

### 8.5 Text cleanup helper

**File:** `apps/worker/src/lib/tts/textCleanup.ts` (new)

Daily briefs are markdown. TTS engines will read markdown literally ("hash hash today's brief") unless cleaned. Rules:

| Rule | Example in → Example out |
|---|---|
| Strip header `#`/`##`/`###` | `## Today's brief` → `Today's brief.` |
| Strip emphasis `*`, `_`, `**` | `**important**` → `important` |
| Strip code fences and inline code | ` ``` ` blocks dropped; `` `var` `` → `var` |
| Convert link text, drop URL | `[click here](https://...)` → `click here` |
| Convert bullets to sentences | `- finish onboarding\n- review PR` → `First, finish onboarding. Next, review PR.` (or just punctuation joins) |
| Expand common symbols | `&` → "and", `@` → "at", `→` → "to", `%` → "percent" |
| Strip emojis | `🚀` → "" (or named substitution; v1: strip) |
| Strip horizontal rules | `---` → "" |
| Collapse whitespace | multiple newlines → single space, then `.` |

Implementation: lightweight regex pipeline. Avoid pulling in `remark`/`unified` for one file's worth of cleanup.

**Edge case to handle:** if cleaned text is empty (brief was entirely emoji/links), skip TTS and set `audio_status='failed'` with `audio_error='brief had no readable text content'`.

### 8.6 Storage upload helper

**File:** `apps/worker/src/lib/storage/briefAudio.ts` (new)

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

export async function uploadBriefAudio(
  supabase: SupabaseClient,
  path: string,
  buffer: Buffer
): Promise<void> {
  const { error } = await supabase.storage
    .from('briefs-audio')
    .upload(path, buffer, {
      contentType: 'audio/mpeg',
      upsert: true,  // re-runs overwrite
    });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
}
```

## 9. MP3 encoding

Two options:

**A. Pure-JS (`@breezystack/lamejs`)** — no system dependency, slower (~real-time at 64kbps), no Railway image changes. Recommended for v1.

**B. ffmpeg subprocess** — requires `ffmpeg` in nixpacks (`nixpacks.toml`), faster, more codec flexibility. Worth it later if encode time becomes a bottleneck.

**v1 target:** 64 kbps mono MP3. ~480KB for 60s of audio. Quality is fine for narration (it's not music).

## 10. Frontend changes

### 10.1 `DailyBriefModal.svelte`

**File:** `apps/web/src/lib/components/briefs/DailyBriefModal.svelte`

Add a Listen button row above the brief content. Render conditions:

- `displayBrief.audio_status === 'ready'` AND `displayBrief.audio_url` → show full player
- `displayBrief.audio_status === 'pending' || 'generating'` → show "Generating audio…" with spinner
- `displayBrief.audio_status === 'failed'` → show small "audio unavailable" notice
- `displayBrief.audio_status === 'none' || null` → render nothing

### 10.2 New component: `BriefAudioPlayer.svelte`

**File:** `apps/web/src/lib/components/briefs/BriefAudioPlayer.svelte` (new)

Self-contained Svelte 5 component:

```svelte
<script lang="ts">
  let { briefId, audioUrl, durationMs }: Props = $props();

  interface Props {
    briefId: string;
    audioUrl: string;       // storage path
    durationMs?: number;
  }

  let signedUrl = $state<string | null>(null);
  let loadError = $state<string | null>(null);

  $effect(() => {
    if (!audioUrl) return;
    fetch(`/api/briefs/${briefId}/audio-url`).then(async (r) => {
      if (!r.ok) {
        loadError = 'Could not load audio';
        return;
      }
      const { url } = await r.json();
      signedUrl = url;
    });
  });
</script>

{#if signedUrl}
  <audio controls preload="metadata" src={signedUrl} class="w-full"></audio>
{:else if loadError}
  <p class="text-muted-foreground text-sm">{loadError}</p>
{:else}
  <p class="text-muted-foreground text-sm">Loading audio…</p>
{/if}
```

Styling uses Inkprint tokens (`text-muted-foreground`, etc.). Wraps in `bg-card shadow-ink rounded` per design system.

### 10.3 New API route: `/api/briefs/[id]/audio-url`

**File:** `apps/web/src/routes/api/briefs/[id]/audio-url/+server.ts` (new)

```typescript
import { ApiResponse, requireAuth } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  const auth = await requireAuth(locals);
  if ('error' in auth) return auth.error;

  const { data: brief } = await locals.supabase
    .from('daily_briefs')
    .select('user_id, audio_url, audio_status')
    .eq('id', params.id)
    .single();

  if (!brief) return ApiResponse.notFound('Brief');
  if (brief.user_id !== auth.user.id) return ApiResponse.unauthorized();
  if (brief.audio_status !== 'ready' || !brief.audio_url) {
    return ApiResponse.badRequest('Audio not ready');
  }

  const { data: signed, error } = await locals.supabase.storage
    .from('briefs-audio')
    .createSignedUrl(brief.audio_url, 3600);

  if (error || !signed) return ApiResponse.databaseError(error);

  return ApiResponse.success({ url: signed.signedUrl });
};
```

### 10.4 `DashboardBriefWidget.svelte`

**File:** `apps/web/src/lib/components/dashboard/DashboardBriefWidget.svelte`

Same Listen button pattern as the modal, surfaced inline (smaller / compact variant).

### 10.5 Settings UI

**File:** `apps/web/src/routes/profile/+page.svelte` (or wherever current user settings live)

Add a toggle:

> **🔊 Read my daily brief aloud (alpha)**
> When enabled, BuildOS will generate an audio version of your daily brief. Admin-only during alpha.

The toggle is disabled (greyed) if `!user.is_admin`. Hovering shows: "Available to all users soon."

Persist via existing user-update endpoint or new `/api/user/preferences` PATCH.

## 11. Admin gating

Both checks must pass for audio to be generated:

1. `users.is_admin = true`  (admin alpha gate)
2. `users.voice_narration_enabled = true`  (user opt-in)

Enforced in **`generate_daily_brief`** when deciding whether to enqueue the audio job. Defense-in-depth: also re-check in `generate_brief_audio` so a stale enqueued job doesn't generate audio for a user who flipped admin off mid-flight.

When alpha → public, remove the `is_admin` check in §8.3 (one-line change). Schema stays the same.

## 12. Error handling & retries

- **Queue job retries:** Use the existing queue retry policy. Recommend `max_attempts=2`. Audio is non-critical; don't retry forever.
- **Brief still ships if audio fails.** The brief is already written before audio is enqueued. UI shows the brief regardless.
- **Kokoro model load failure** (e.g., HF download timeout): job fails, `audio_status='failed'`, `audio_error` captures message. Logs to worker stdout.
- **Long brief overflow:** Kokoro chunks internally up to its context. For briefs >~3000 tokens, chunk in `synthesizeBrief` by sentence and concatenate Float32Array buffers before MP3 encoding.
- **Storage upload failure:** Same as model failure path.
- **Missing user row mid-job:** Treat as success-no-op, mark `audio_status='failed'` with `audio_error='user not found'`. (Edge case: user deleted account between brief generation and audio job.)

## 13. Performance & cost

| Metric | Local M4 Pro (measured) | Railway worker (estimated) |
|---|---|---|
| Kokoro model load | ~3-5s | ~5-10s (cold start; loaded once at boot) |
| Synthesis (60s brief, ~600 chars) | ~10s CPU | ~15-25s CPU on standard Railway instance |
| MP3 encode (lamejs, 64kbps) | ~2-3s | ~3-5s |
| Storage upload | <1s | <1s |
| **Total per brief** | **~15s** | **~20-30s** |
| Audio file size | ~480KB | ~480KB |
| Storage cost @ Supabase | — | ~$0.021/GB/month → ~$0.0001 per brief per month |
| Compute cost | — | included in existing Railway worker plan |

**Memory:** Kokoro model is ~340MB on disk, ~600MB resident with q8 quantization. Railway worker plan must support this. Verify in Phase 1.

**Concurrency:** v1 ships single-threaded — one audio job at a time. If queue depth becomes a problem, evaluate either a second worker process or per-job model unload.

## 14. Open questions / risks

1. **`kokoro-js` quality at q8 quantization for `am_onyx`.** ONNX quantized models can sound slightly different from the PyTorch original. Need to A/B against the local Python sample. Mitigation: Phase 1 generates a comparison file from `kokoro-js` and we compare to `~/local-ai/kokoro-test/outputs/voices/am_onyx.wav`.

2. **Railway memory ceiling.** Confirm the current Railway plan supports ~700MB additional working set for the model. If not, model loading needs to be lazy + unloaded after a few minutes of idle.

3. **First-job cold start.** Model loads on first job after boot. That's a one-time 5-10s tax. Acceptable, but the brief job that triggers it will appear slow in logs. Could pre-warm at worker boot (`await getPipeline()` in `worker.ts` startup).

4. **Markdown cleanup completeness.** Briefs have non-trivial structure (lists of priorities, project names with special chars). Need a real corpus test against several recent briefs to validate the cleanup rules.

5. **Realtime UI update.** When the audio job finishes, the modal needs to know. Options: (a) Supabase realtime subscription on `daily_briefs` row, (b) polling every 5s while `audio_status='pending'`, (c) require user to close/reopen modal. Recommend (b) for simplicity; revisit if it gets gross.

6. **Brief content varies in length.** A 200-word brief is ~80s of audio; a 1000-word brief is ~6 minutes. UI player should show duration so users know what they're getting into.

7. **Re-generation policy.** If a user re-runs brief generation for the same day (does that exist?), audio is overwritten via `upsert: true`. Fine. But the old `audio_url` row pointer becomes stale only if the path changes — paths are deterministic on `brief_id`, so no orphans.

8. **Mobile playback.** iOS Safari requires user interaction to start audio playback; HTML5 `<audio controls>` handles this. No special work, but worth testing on iPhone.

## 15. Phased rollout

### Phase 1 — `kokoro-js` smoke test (~2 hours)

- [ ] `pnpm add kokoro-js @breezystack/lamejs` in `apps/worker`
- [ ] Write a one-off script `apps/worker/scripts/tts-smoke.ts` that loads kokoro-js, synthesizes the same sample text used in local audition, saves to `/tmp/smoke.wav` and `/tmp/smoke.mp3`
- [ ] A/B compare against `~/local-ai/kokoro-test/outputs/voices/am_onyx.wav`
- [ ] If quality is unacceptable, pivot to Python sidecar (separate spec)

### Phase 2 — DB + storage (~1 hour)

- [ ] Write the two migrations (§6.1, §6.2, §7.1, §7.2)
- [ ] `pnpm gen:all` to regenerate types
- [ ] Manually verify bucket + policies in Supabase studio

### Phase 3 — Worker integration (~3 hours)

- [ ] `apps/worker/src/lib/tts/kokoro.ts`
- [ ] `apps/worker/src/lib/tts/textCleanup.ts` (+ unit tests on existing brief samples)
- [ ] `apps/worker/src/lib/storage/briefAudio.ts`
- [ ] `apps/worker/src/workers/briefAudio/briefAudioWorker.ts`
- [ ] Register in `apps/worker/src/worker.ts:378` block
- [ ] Hook into `generate_daily_brief` success path
- [ ] Pre-warm pipeline at worker boot (defer; only if cold start becomes annoying)

### Phase 4 — Frontend (~3 hours)

- [ ] `BriefAudioPlayer.svelte` component
- [ ] `/api/briefs/[id]/audio-url/+server.ts`
- [ ] Wire into `DailyBriefModal.svelte`
- [ ] Wire into `DashboardBriefWidget.svelte`
- [ ] Settings toggle in profile page
- [ ] Polling for `audio_status='pending'` → `'ready'`

### Phase 5 — Deploy & verify (~1 hour)

- [ ] Deploy worker to Railway, watch memory metrics on first cold start
- [ ] Set `is_admin = true` and `voice_narration_enabled = true` for DJ's user
- [ ] Trigger a brief, verify audio appears within ~30s
- [ ] Play it. Does it sound right? Does the markdown cleanup actually work on a real brief?

### Phase 6 — Iterate before widening

- [ ] Run on DJ + 1-2 admin users for a week
- [ ] Look at: audio quality, file sizes, worker memory pressure, queue latency
- [ ] If green, remove `is_admin` gate (§8.3), keep `voice_narration_enabled` as the only check

## 16. Out of scope (future / parking lot)

- Voice cloning (DJ's voice — separate license/UX work)
- Per-user voice selection
- Faster/slower playback speed in the UI
- Audio embedded in the daily brief **email**
- Streaming partial audio while generating
- Multi-language support (Kokoro supports Spanish/French/etc. via different `lang_code`)
- Voice playback for project briefs, brain dumps, or other content types

## 17. Files touched (summary)

**New files:**
- `supabase/migrations/YYYYMMDDHHMMSS_add_brief_audio.sql`
- `apps/worker/src/lib/tts/kokoro.ts`
- `apps/worker/src/lib/tts/textCleanup.ts`
- `apps/worker/src/lib/storage/briefAudio.ts`
- `apps/worker/src/workers/briefAudio/briefAudioWorker.ts`
- `apps/worker/scripts/tts-smoke.ts` (one-off; can delete after Phase 1)
- `apps/web/src/lib/components/briefs/BriefAudioPlayer.svelte`
- `apps/web/src/routes/api/briefs/[id]/audio-url/+server.ts`

**Modified files:**
- `apps/worker/src/worker.ts` — register `generate_brief_audio` processor
- `apps/worker/package.json` — `kokoro-js`, `@breezystack/lamejs` deps
- `apps/worker/src/workers/brief/briefWorker.ts` (or wherever `processBrief` lives) — enqueue audio job on success
- `packages/shared-types/src/database.schema.ts` + `database.types.ts` — regenerated
- `apps/web/src/lib/components/briefs/DailyBriefModal.svelte` — Listen button
- `apps/web/src/lib/components/dashboard/DashboardBriefWidget.svelte` — Listen button (compact)
- `apps/web/src/routes/profile/+page.svelte` — opt-in toggle

## 18. Reviewer checklist

For the reviewing agent — please verify:

- [ ] Is `kokoro-js` the right Node port, or is there a better-maintained alternative I missed?
- [ ] Are the RLS policies tight? Specifically, can a non-owner authenticated user enumerate `briefs-audio/{their-id}/*`?
- [ ] Is the brief enqueue point in §8.3 the only one? (Could there be re-runs or other entry points that also need to trigger audio?)
- [ ] Does the worker have a brief processor file I missed? Path assumption is `apps/worker/src/workers/brief/briefWorker.ts` — needs verification.
- [ ] Are there existing user-settings endpoints/conventions to reuse for §10.5?
- [ ] Is markdown cleanup naïve enough to break on real briefs? Pull 5 recent briefs and dry-run the rules.
- [ ] Concurrency assumption (one audio job at a time): does the current `SupabaseQueue` config (`batchSize=5`) cause problems if 5 audio jobs claim simultaneously with one shared in-memory pipeline?
- [ ] Memory ceiling on current Railway plan vs ~700MB extra resident for Kokoro model?
- [ ] Anything else I'm missing about the existing brief flow that this spec contradicts or duplicates?
