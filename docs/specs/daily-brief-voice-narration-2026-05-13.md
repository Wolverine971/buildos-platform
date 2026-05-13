<!-- docs/specs/daily-brief-voice-narration-2026-05-13.md -->

# Daily Brief Voice Narration - Spec

**Status:** Draft, revised after code review
**Author:** DJ (with Claude), reviewed and revised by Codex
**Date:** 2026-05-13
**Target rollout:** Admin-gated alpha -> wider opt-in beta

---

## 1. Summary

Add AI-narrated audio playback to BuildOS daily briefs. When an **ontology daily brief** is generated, the worker enqueues a separate `generate_brief_audio` job. That job generates an MP3 narration with Kokoro-TTS using the `am_onyx` voice, uploads it to private Supabase Storage, and writes audio metadata back to `ontology_daily_briefs`.

For alpha, only admin users can opt in. Audio generation is opt-in per user, not automatic.

Important correction from review: the active daily brief flow uses `ontology_daily_briefs`, not the legacy `daily_briefs` table. This spec targets `ontology_daily_briefs` everywhere unless explicitly stated otherwise.

## 2. Goals

- Users can hear their daily brief read aloud in a high-quality AI voice.
- Audio generation runs on BuildOS-controlled worker infra with no third-party TTS API spend.
- Audio generation is async and does not block brief creation or notification delivery.
- Audio is admin-gated for alpha so quality, memory, queue latency, and UX can be validated.
- The Listen UI only appears when a ready audio file exists for the current brief content.
- Regenerating a brief does not leave stale audio attached to the updated brief.

## 3. Non-goals

- Voice cloning.
- Multi-language support.
- Streaming audio playback while synthesis is still running.
- Playing audio inside the daily brief email.
- Audio for project briefs, brain dumps, notes, tasks, or other content types.
- Per-user voice selection.

## 4. Locked Decisions

| Decision              | Value                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| Canonical brief table | `ontology_daily_briefs`                                                   |
| Narrated text source  | `ontology_daily_briefs.executive_summary` fallback to `llm_analysis`      |
| Engine                | `kokoro-js` alpha smoke test against Kokoro v1.0 ONNX                     |
| Model                 | `onnx-community/Kokoro-82M-v1.0-ONNX`                                     |
| Voice                 | `am_onyx`                                                                 |
| Audio format          | MP3, 64 kbps mono                                                         |
| Storage bucket        | `briefs-audio`                                                            |
| Storage path          | `{user_id}/{ontology_daily_brief_id}.mp3`                                 |
| Auth on playback      | Server-created Supabase signed URL after row ownership check              |
| Gating                | `users.is_admin = true` during alpha                                      |
| Opt-in                | `users.voice_narration_enabled = true`, default `false`                   |
| Generation timing     | Separate `generate_brief_audio` queue job after brief generation succeeds |
| Audio concurrency     | One TTS synthesis at a time for alpha                                     |
| Alpha deployment      | Existing worker, one Railway replica, in-process audio serialization      |
| MP3 encoder           | `@breezystack/lamejs`; license accepted for alpha                         |

## 5. Current Repo Constraints

The implementation has to respect these current codebase facts:

- `apps/worker/src/workers/brief/briefWorker.ts` calls `generateOntologyDailyBrief(...)`.
- `generateOntologyDailyBrief(...)` writes final brief content to `ontology_daily_briefs.executive_summary`.
- `apps/web/src/routes/api/daily-briefs/*`, `apps/web/src/routes/briefs/+server.ts`, `DashboardBriefWidget.svelte`, and `DailyBriefModal.svelte` read ontology briefs.
- `apps/web/src/lib/services/dailyBrief/ontology-mappers.ts` maps ontology rows into the UI-facing `DailyBrief` shape.
- The queue job type is a Postgres enum (`queue_type`). A new job cannot be inserted until the enum includes `generate_brief_audio`.
- The repo's `add_queue_job` RPC uses `p_user_id`, `p_job_type`, `p_metadata`, `p_priority`, `p_scheduled_for`, and `p_dedup_key`. It does not accept `job_type`, `job_data`, or `user_id`.
- `SupabaseQueue` claims up to `QUEUE_BATCH_SIZE` jobs and runs them concurrently with `Promise.allSettled`. Registering audio on the normal worker does not by itself serialize audio jobs.
- Current worker processors receive `ProcessingJob<T>` or a legacy adapter. They do not receive `job.adminSupabase`; service-role access comes from `apps/worker/src/lib/supabase.ts` or `createServiceClient()`.

## 6. Architecture

### 6.1 Node vs Python

Use `kokoro-js` first. It keeps the worker in Node, avoids Python packaging in the alpha path, and supports `KokoroTTS.from_pretrained(...)` with Node `device: 'cpu'`.

The smoke test must verify:

- `tts.list_voices()` or the exposed voice metadata includes `am_onyx`.
- `tts.generate(...)` returns a `RawAudio` object from `@huggingface/transformers`.
- We can extract sample data and sample rate from that object.
- The generated voice quality is acceptable compared with the local Python sample.
- Cold model download works in the same runtime family that Railway will use.

Fallback remains a Python sidecar if `kokoro-js` quality, memory, model download behavior, or audio extraction is not reliable.

### 6.2 Component Diagram

```text
scheduler / API
  |
  v
queue: generate_daily_brief
  |
  v
worker: processBriefJob
  |
  v
ontology_daily_briefs row
  - executive_summary
  - audio_status
  - audio_storage_path
  |
  | if admin + opted in
  v
queue: generate_brief_audio
  |
  v
worker: processBriefAudio
  |
  v
Supabase Storage private bucket
  briefs-audio/{user_id}/{brief_id}.mp3
  |
  v
UI fetches /api/daily-briefs/{id}/audio-url
  |
  v
HTML audio player
```

### 6.3 Data Flow

1. Scheduler or API enqueues `generate_daily_brief`.
2. Worker generates the ontology daily brief and writes final markdown to `ontology_daily_briefs.executive_summary`.
3. The brief generation path clears stale audio fields for the row because the content may have changed.
4. If the user is an admin and has `voice_narration_enabled = true`, the worker marks the row `audio_status = 'pending'` and enqueues `generate_brief_audio` with `{ briefId }`.
5. `generate_brief_audio` re-checks the user gate, loads the brief row, strips markdown to TTS-safe text, synthesizes audio, MP3-encodes it, uploads it to storage, and marks the row `audio_status = 'ready'`.
6. UI polling or refresh sees the updated audio fields. The player asks the server for a signed URL and renders only when audio is ready.

## 7. Schema and Storage Changes

### 7.1 Queue Type Migration

The queue enum must be updated before any code can enqueue or process `generate_brief_audio`.

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_add_brief_audio_queue_type.sql
alter type public.queue_type add value if not exists 'generate_brief_audio';
```

After this migration, regenerate shared types so `QueueJobType` includes the new value.

### 7.2 `ontology_daily_briefs` Migration

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_add_ontology_brief_audio.sql

alter table public.ontology_daily_briefs
  add column if not exists audio_status text not null default 'none',
  add column if not exists audio_storage_path text,
  add column if not exists audio_voice text,
  add column if not exists audio_model text,
  add column if not exists audio_duration_ms integer,
  add column if not exists audio_generation_ms integer,
  add column if not exists audio_requested_at timestamptz,
  add column if not exists audio_generation_started_at timestamptz,
  add column if not exists audio_generated_at timestamptz,
  add column if not exists audio_error text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ontology_daily_briefs_audio_status_check'
  ) then
    alter table public.ontology_daily_briefs
      add constraint ontology_daily_briefs_audio_status_check
      check (audio_status in ('none', 'pending', 'generating', 'ready', 'failed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ontology_daily_briefs_audio_duration_nonnegative'
  ) then
    alter table public.ontology_daily_briefs
      add constraint ontology_daily_briefs_audio_duration_nonnegative
      check (audio_duration_ms is null or audio_duration_ms >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ontology_daily_briefs_audio_generation_nonnegative'
  ) then
    alter table public.ontology_daily_briefs
      add constraint ontology_daily_briefs_audio_generation_nonnegative
      check (audio_generation_ms is null or audio_generation_ms >= 0);
  end if;
end $$;

create index if not exists ontology_daily_briefs_audio_status_idx
  on public.ontology_daily_briefs (audio_status)
  where audio_status in ('pending', 'generating', 'failed');

comment on column public.ontology_daily_briefs.audio_storage_path is
  'Private Supabase Storage path in briefs-audio bucket. Example: {user_id}/{ontology_daily_brief_id}.mp3';

comment on column public.ontology_daily_briefs.audio_duration_ms is
  'Playback duration of the generated audio, not synthesis latency.';

comment on column public.ontology_daily_briefs.audio_generation_ms is
  'Worker wall-clock time spent generating and encoding audio.';
```

Do not add these columns only to `daily_briefs`. That table is legacy for the current UI path.

### 7.3 `users` Migration

```sql
alter table public.users
  add column if not exists voice_narration_enabled boolean not null default false;

comment on column public.users.voice_narration_enabled is
  'When true, daily briefs are narrated to MP3. During alpha, users.is_admin must also be true.';
```

### 7.4 Storage Bucket

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'briefs-audio',
  'briefs-audio',
  false,
  10485760,
  array['audio/mpeg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
```

### 7.5 Storage RLS Policies

Playback should normally go through the signed URL endpoint, not direct client storage calls. These policies are still useful defense-in-depth for authenticated users browsing their own bucket prefix.

```sql
drop policy if exists "Users read own brief audio" on storage.objects;
create policy "Users read own brief audio"
on storage.objects for select
to authenticated
using (
  bucket_id = 'briefs-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Service role writes brief audio" on storage.objects;
create policy "Service role writes brief audio"
on storage.objects for insert
to service_role
with check (bucket_id = 'briefs-audio');

drop policy if exists "Service role updates brief audio" on storage.objects;
create policy "Service role updates brief audio"
on storage.objects for update
to service_role
using (bucket_id = 'briefs-audio')
with check (bucket_id = 'briefs-audio');

drop policy if exists "Service role deletes brief audio" on storage.objects;
create policy "Service role deletes brief audio"
on storage.objects for delete
to service_role
using (bucket_id = 'briefs-audio');
```

Notes:

- A signed URL can be used by anyone holding the URL until expiry, so only the server should create it after checking `ontology_daily_briefs.user_id`.
- Non-owner users should not be able to get another user's signed URL because the API route filters by authenticated user id.
- Users can list/select their own files if a direct storage call is added later. That is acceptable for their own account data.

### 7.6 Regenerate Types

Run after migrations:

```bash
pnpm gen:all
```

This refreshes `packages/shared-types/src/database.types.ts`, `database.schema.ts`, and web generated types.

## 8. Worker Changes

### 8.1 Queue Metadata Types

Add a metadata interface to `packages/shared-types/src/queue-types.ts`:

```typescript
export interface GenerateBriefAudioJobMetadata {
	briefId: string;
}

export interface GenerateBriefAudioJobResult {
	success?: boolean;
	skipped?: boolean;
	reason?: string;
	path?: string;
	durationMs?: number;
	generationMs?: number;
	error?: string;
}

export interface JobMetadataMap {
	// existing entries...
	generate_brief_audio: GenerateBriefAudioJobMetadata;
}

export interface JobResultMap {
	// existing entries...
	generate_brief_audio: GenerateBriefAudioJobResult;
}
```

Regenerated database enum types must also include `generate_brief_audio`.

Also add a validator case in `packages/shared-types/src/validation.ts` so any code path using `validateJobMetadata(...)` accepts `{ briefId }`.

### 8.2 Enqueue Audio After Brief Generation

Add an enqueue helper, for example:

**File:** `apps/worker/src/workers/briefAudio/enqueueBriefAudio.ts`

```typescript
import { supabase } from '../../lib/supabase';

export async function enqueueBriefAudioIfEnabled(params: {
	briefId: string;
	userId: string;
}): Promise<void> {
	const { briefId, userId } = params;

	const { data: user, error: userError } = await supabase
		.from('users')
		.select('is_admin, voice_narration_enabled')
		.eq('id', userId)
		.single();

	if (userError || !user) {
		console.warn(`[BriefAudio] user ${userId} not found; skipping audio`);
		return;
	}

	if (!user.is_admin || !user.voice_narration_enabled) {
		await supabase
			.from('ontology_daily_briefs')
			.update({
				audio_status: 'none',
				audio_storage_path: null,
				audio_error: null,
				audio_voice: null,
				audio_model: null,
				audio_duration_ms: null,
				audio_generation_ms: null,
				audio_requested_at: null,
				audio_generation_started_at: null,
				audio_generated_at: null
			})
			.eq('id', briefId)
			.eq('user_id', userId);
		return;
	}

	await supabase
		.from('ontology_daily_briefs')
		.update({
			audio_status: 'pending',
			audio_storage_path: null,
			audio_voice: 'am_onyx',
			audio_model: 'onnx-community/Kokoro-82M-v1.0-ONNX',
			audio_duration_ms: null,
			audio_generation_ms: null,
			audio_requested_at: new Date().toISOString(),
			audio_generation_started_at: null,
			audio_generated_at: null,
			audio_error: null
		})
		.eq('id', briefId)
		.eq('user_id', userId);

	const { error: queueError } = await supabase.rpc('add_queue_job', {
		p_user_id: userId,
		p_job_type: 'generate_brief_audio',
		p_metadata: { briefId },
		p_priority: 20,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: `brief-audio-${briefId}`
	});

	if (queueError) {
		await supabase
			.from('ontology_daily_briefs')
			.update({
				audio_status: 'failed',
				audio_error: `failed to queue audio job: ${queueError.message}`.slice(0, 500)
			})
			.eq('id', briefId)
			.eq('user_id', userId);
		throw new Error(`Failed to queue brief audio: ${queueError.message}`);
	}
}
```

Call this from `processBriefJob` immediately after `generateOntologyDailyBrief(...)` returns successfully:

```typescript
const ontologyBrief = await generateOntologyDailyBrief(...);

try {
  await enqueueBriefAudioIfEnabled({
    briefId: ontologyBrief.id,
    userId: job.data.userId
  });
} catch (audioQueueError) {
  console.error('[BriefAudio] Failed to enqueue audio job:', audioQueueError);
  // Do not fail the daily brief job.
}
```

Critical behavior:

- The enqueue helper must clear old audio fields before queueing. The ontology brief row is upserted by user/date, so regeneration can reuse the same row id.
- Audio enqueue failure must not fail the daily brief.
- The helper must use the correct `add_queue_job` RPC argument names.
- Use `p_dedup_key = brief-audio-${briefId}` to avoid duplicate pending/processing audio jobs.

### 8.3 Process Audio Job

**File:** `apps/worker/src/workers/briefAudio/briefAudioWorker.ts`

```typescript
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { supabase } from '../../lib/supabase';
import { uploadBriefAudio } from '../../lib/storage/briefAudio';
import { synthesizeBrief } from '../../lib/tts/kokoro';
import { stripBriefMarkdown } from '../../lib/tts/textCleanup';

interface BriefAudioJobData {
	briefId: string;
}

let audioChain: Promise<unknown> = Promise.resolve();

export function processBriefAudio(job: ProcessingJob<BriefAudioJobData>) {
	const next = audioChain.then(() => processBriefAudioInner(job));
	audioChain = next.catch(() => undefined);
	return next;
}

async function processBriefAudioInner(job: ProcessingJob<BriefAudioJobData>) {
	const briefId = job.data?.briefId;
	if (!briefId) throw new Error('generate_brief_audio missing briefId');

	const { data: brief, error: briefError } = await supabase
		.from('ontology_daily_briefs')
		.select('id, user_id, executive_summary, llm_analysis, audio_status, audio_storage_path')
		.eq('id', briefId)
		.single();

	if (briefError || !brief) {
		throw new Error(`ontology daily brief ${briefId} not found`);
	}

	const { data: user, error: userError } = await supabase
		.from('users')
		.select('is_admin, voice_narration_enabled')
		.eq('id', brief.user_id)
		.single();

	if (userError || !user) {
		await markAudioFailed(briefId, 'user not found');
		return { skipped: true, reason: 'user not found' };
	}

	if (!user.is_admin || !user.voice_narration_enabled) {
		await supabase
			.from('ontology_daily_briefs')
			.update({
				audio_status: 'none',
				audio_storage_path: null,
				audio_error: null,
				audio_duration_ms: null,
				audio_generation_ms: null,
				audio_generation_started_at: null
			})
			.eq('id', briefId);
		return { skipped: true, reason: 'voice narration disabled' };
	}

	if (brief.audio_status === 'ready' && brief.audio_storage_path) {
		return { skipped: true, reason: 'audio already ready' };
	}

	const { data: claimed, error: claimError } = await supabase
		.from('ontology_daily_briefs')
		.update({
			audio_status: 'generating',
			audio_generation_started_at: new Date().toISOString(),
			audio_error: null
		})
		.eq('id', briefId)
		.in('audio_status', ['pending', 'failed', 'none'])
		.select('id')
		.maybeSingle();

	if (claimError) throw claimError;
	if (!claimed) {
		return { skipped: true, reason: 'audio job already claimed or ready' };
	}

	const sourceMarkdown = brief.executive_summary || brief.llm_analysis || '';
	const plain = stripBriefMarkdown(sourceMarkdown);
	if (!plain.trim()) {
		await markAudioFailed(briefId, 'brief had no readable text content');
		return { skipped: true, reason: 'no readable text' };
	}

	const startedAt = Date.now();

	try {
		const result = await synthesizeBrief(plain, { voice: 'am_onyx', speed: 1.0 });
		const generationMs = Date.now() - startedAt;
		const path = `${brief.user_id}/${brief.id}.mp3`;

		await uploadBriefAudio(supabase, path, result.mp3Buffer);

		await supabase
			.from('ontology_daily_briefs')
			.update({
				audio_status: 'ready',
				audio_storage_path: path,
				audio_voice: 'am_onyx',
				audio_model: 'onnx-community/Kokoro-82M-v1.0-ONNX',
				audio_duration_ms: result.durationMs,
				audio_generation_ms: generationMs,
				audio_generated_at: new Date().toISOString(),
				audio_error: null
			})
			.eq('id', briefId);

		await job.log(`audio ready: ${path}, ${result.durationMs}ms playback`);
		return { success: true, path, durationMs: result.durationMs, generationMs };
	} catch (error) {
		await markAudioFailed(briefId, error instanceof Error ? error.message : String(error));
		throw error;
	}
}

async function markAudioFailed(briefId: string, message: string) {
	await supabase
		.from('ontology_daily_briefs')
		.update({
			audio_status: 'failed',
			audio_error: message.slice(0, 500),
			audio_generation_started_at: null
		})
		.eq('id', briefId);
}
```

The module-level `audioChain` serializes audio generation within one Node process. If Railway runs multiple worker instances, this does not provide global serialization; use a dedicated single-instance audio worker or add a DB advisory lock.

### 8.4 Register Processor

In `apps/worker/src/worker.ts`:

```typescript
import { processBriefAudio } from './workers/briefAudio/briefAudioWorker';

// Register processors
queue.process('generate_daily_brief', processBrief);
queue.process('generate_brief_audio', processBriefAudio);
```

Also add `generate_brief_audio` to the job type log list.

### 8.5 Audio Concurrency Requirement

Alpha must not let multiple Kokoro syntheses run at once.

Locked alpha deployment:

- Keep `generate_brief_audio` registered in the worker.
- Keep only one Railway worker replica during alpha.
- Keep the `audioChain` in-process serialization.
- Lazy-load Kokoro on first audio job.
- Do not pre-warm Kokoro at boot.
- Watch queue latency and worker memory.

Tradeoff: if several audio jobs are claimed in one batch, jobs waiting behind `audioChain` still occupy queue slots. This is acceptable only for the small admin alpha. If queue latency rises, move to the audio-only worker.

Stronger deployment if more than one worker replica is needed:

- Add an audio-only worker entry point that registers only `generate_brief_audio`.
- Deploy it as one Railway instance with `QUEUE_BATCH_SIZE=1`.
- Remove or feature-flag audio processing from the general worker.

Do not claim "single-threaded audio" unless one of these is implemented.

## 9. TTS and MP3 Implementation

### 9.1 Dependencies

Add to `apps/worker/package.json`:

```bash
pnpm --filter=@buildos/worker add kokoro-js @breezystack/lamejs
```

Notes:

- `kokoro-js` is Apache-2.0.
- `@breezystack/lamejs` is LGPL-3.0. DJ has accepted this for alpha.
- `kokoro-js` downloads model files from Hugging Face unless a local model path/cache is configured. Railway cold-start behavior must be tested before alpha.

### 9.2 Kokoro Wrapper

**File:** `apps/worker/src/lib/tts/kokoro.ts`

```typescript
import { KokoroTTS } from 'kokoro-js';
import { encodeMonoMp3 } from './mp3';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const SAMPLE_RATE = 24000;

let pipelinePromise: Promise<KokoroTTS> | null = null;

function getPipeline(): Promise<KokoroTTS> {
	if (!pipelinePromise) {
		pipelinePromise = KokoroTTS.from_pretrained(MODEL_ID, {
			dtype: 'q8',
			device: 'cpu'
		});
	}
	return pipelinePromise;
}

export interface SynthesisOptions {
	voice: 'am_onyx';
	speed?: number;
}

export interface SynthesisResult {
	mp3Buffer: Buffer;
	durationMs: number;
	sampleRate: number;
	sampleCount: number;
}

export async function synthesizeBrief(
	text: string,
	options: SynthesisOptions
): Promise<SynthesisResult> {
	const tts = await getPipeline();

	const chunks: Float32Array[] = [];
	let sampleRate = SAMPLE_RATE;

	for await (const chunk of tts.stream(text, {
		voice: options.voice,
		speed: options.speed ?? 1.0
	})) {
		const normalized = normalizeRawAudio(chunk.audio);
		chunks.push(normalized.samples);
		sampleRate = normalized.sampleRate;
	}

	const samples = concatFloat32(chunks);
	const durationMs = Math.round((samples.length / sampleRate) * 1000);
	const mp3Buffer = encodeMonoMp3(samples, sampleRate, 64);

	return {
		mp3Buffer,
		durationMs,
		sampleRate,
		sampleCount: samples.length
	};
}
```

`normalizeRawAudio(...)` must be implemented against the actual `RawAudio` shape observed in Phase 1. The `kokoro-js` type says `generate(...)` and stream chunks return `RawAudio` from `@huggingface/transformers`; do not assume it is a bare `Float32Array`.

### 9.3 MP3 Encoding

Recommended v1: `@breezystack/lamejs`.

Implementation requirements:

- Convert float samples in `[-1, 1]` to signed 16-bit PCM before passing to lame.
- Encode mono, sample rate from Kokoro output, target 64 kbps.
- Process in 1152-sample blocks.
- Return a Node `Buffer`.

If using `ffmpeg` instead:

- Add `ffmpeg` to root and worker `nixpacks.toml`.
- Write PCM/WAV to a temp file or pipe stdin/stdout.
- Keep temp files under `/tmp` and clean them up.

### 9.4 Text Cleanup

**File:** `apps/worker/src/lib/tts/textCleanup.ts`

Use the existing `marked` dependency rather than a regex-only markdown stripper.

Rules:

| Rule             | Behavior                                          |
| ---------------- | ------------------------------------------------- |
| Headings         | Keep text, add sentence pause                     |
| Paragraphs       | Keep text                                         |
| Lists            | Convert items into natural sentences              |
| Links            | Keep link text, drop URL                          |
| Code blocks      | Drop                                              |
| Inline code      | Keep text content without backticks               |
| Tables           | Flatten cell text or drop if noisy                |
| Blockquotes      | Keep text                                         |
| Horizontal rules | Drop                                              |
| Emoji            | Strip for v1                                      |
| Symbols          | Expand common symbols such as `&`, `%`, `@`, `->` |
| Whitespace       | Collapse and normalize punctuation                |

Add tests with real or anonymized brief samples. The goal is not perfect prose; it is avoiding literal markdown narration.

## 10. Storage Upload Helper

**File:** `apps/worker/src/lib/storage/briefAudio.ts`

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

export async function uploadBriefAudio(
	supabase: SupabaseClient,
	path: string,
	buffer: Buffer
): Promise<void> {
	const { error } = await supabase.storage.from('briefs-audio').upload(path, buffer, {
		contentType: 'audio/mpeg',
		cacheControl: '3600',
		upsert: true
	});

	if (error) {
		throw new Error(`storage upload failed: ${error.message}`);
	}
}
```

Deterministic paths plus `upsert: true` make retries and brief regeneration idempotent.

## 11. Frontend Changes

### 11.1 UI Type and Mapper

Update `apps/web/src/lib/types/daily-brief.ts`:

```typescript
audio_status?: 'none' | 'pending' | 'generating' | 'ready' | 'failed' | null;
audio_storage_path?: string | null;
audio_voice?: string | null;
audio_duration_ms?: number | null;
audio_generation_ms?: number | null;
audio_requested_at?: string | null;
audio_generation_started_at?: string | null;
audio_generated_at?: string | null;
audio_error?: string | null;
```

Update `apps/web/src/lib/services/dailyBrief/ontology-mappers.ts` to map these fields from `ontology_daily_briefs`.

Also update the manual mapping in `DashboardBriefWidget.svelte`, which currently constructs a `DailyBrief` directly from `ontologyBrief`.

### 11.2 Signed URL API Route

Use the existing daily brief route namespace:

**File:** `apps/web/src/routes/api/daily-briefs/[id]/audio-url/+server.ts`

```typescript
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const GET: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const { data: brief, error } = await supabase
		.from('ontology_daily_briefs')
		.select('user_id, audio_status, audio_storage_path')
		.eq('id', params.id)
		.eq('user_id', user.id)
		.single();

	if (error || !brief) return ApiResponse.notFound('Brief');

	if (brief.audio_status !== 'ready' || !brief.audio_storage_path) {
		return ApiResponse.badRequest('Audio not ready');
	}

	const { data: signed, error: signedError } = await supabase.storage
		.from('briefs-audio')
		.createSignedUrl(brief.audio_storage_path, SIGNED_URL_TTL_SECONDS);

	if (signedError || !signed?.signedUrl) {
		return ApiResponse.internalError(signedError, 'Failed to create signed URL');
	}

	return ApiResponse.success({
		url: signed.signedUrl,
		expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString()
	});
};
```

Do not accept a storage path from the client. The route must derive the path from the owned brief row.

### 11.3 Audio Player Component

**File:** `apps/web/src/lib/components/briefs/BriefAudioPlayer.svelte`

Requirements:

- Props: `briefId`, `audioStatus`, `audioStoragePath`, `durationMs`.
- Fetch `/api/daily-briefs/${briefId}/audio-url` only when status is `ready` and path exists.
- Render an HTML `<audio controls preload="metadata">`.
- If signed URL creation fails, show a small non-blocking error.
- Do not expose the private storage path in visible UI.
- Refresh the signed URL if playback starts after expiry.

### 11.4 `DailyBriefModal.svelte`

Render above the markdown content:

- `audio_status === 'ready' && audio_storage_path` -> audio player.
- `audio_status === 'pending' || audio_status === 'generating'` -> compact "Generating audio..." row with spinner.
- `audio_status === 'failed'` -> small "Audio unavailable" notice; do not show raw `audio_error` to normal users.
- `audio_status === 'none' || null` -> render nothing.

Poll `/api/daily-briefs/[id]` every 5 seconds while modal is open and audio status is `pending` or `generating`. Stop polling when status becomes `ready`, `failed`, or modal closes.

### 11.5 `DashboardBriefWidget.svelte`

Keep this compact. Either:

- show a small headphones/listen icon when audio is ready, and open the existing modal for playback, or
- include a compact inline player only if it does not disrupt the widget height.

Do not put a full audio control inside the main dashboard card unless the layout is tested on mobile.

### 11.6 Settings UI

Add `voice_narration_enabled` to profile page load data:

- Update `apps/web/src/routes/profile/+page.server.ts` to select `is_admin, voice_narration_enabled`.
- Add a toggle in the profile/preferences area.
- If `!isAdmin`, disable enabling and explain that it is alpha-only.

Add a narrow endpoint instead of overloading `api/users/preferences`, because that endpoint currently sanitizes JSON preference keys and stores them under `users.preferences`.

**New route:** `apps/web/src/routes/api/users/voice-narration/+server.ts`

Behavior:

- `PATCH { enabled: boolean }`
- Require auth.
- If `enabled === true`, require current `users.is_admin = true` during alpha.
- Update `users.voice_narration_enabled`.
- Return `{ voice_narration_enabled }`.

## 12. Admin Gating

Both checks must pass:

1. `users.is_admin = true`
2. `users.voice_narration_enabled = true`

Enforce this in two places:

- Enqueue helper after brief generation.
- `generate_brief_audio` worker before synthesis.

If the user disables narration or loses admin status after a job was queued, the audio job must skip synthesis and clear pending audio state.

When alpha ends, remove the `is_admin` check in both places. Keep `voice_narration_enabled`.

## 13. Error Handling and Retries

- Brief generation succeeds even if audio enqueue or synthesis fails.
- Queue retries use the existing queue retry policy. The current `add_queue_job` RPC does not expose `max_attempts`, so do not claim `max_attempts = 2` unless the RPC is extended.
- Retry behavior is idempotent because storage path is deterministic and upload uses `upsert: true`.
- If synthesis fails, mark `audio_status = 'failed'` and store a truncated internal error.
- If the user row disappears, mark failed with `user not found`.
- If the user is no longer eligible, set `audio_status = 'none'` and do not fail the queue job.
- If cleaned text is empty, mark failed with `brief had no readable text content`.
- If the worker crashes after setting `generating`, the row can get stuck. Mitigation: either allow a retry to reclaim stale `generating` rows older than 15 minutes or add a small cleanup query that moves old `generating` audio rows back to `pending`.

## 14. Performance and Ops

| Metric                          | Local M4 Pro measured/expected |           Railway estimate |
| ------------------------------- | -----------------------------: | -------------------------: |
| Model download/cache cold start |             3-10s plus network | 5-30s depending HF/network |
| Model memory resident           |                      500-800MB |                  500-900MB |
| Synthesis for short brief       |                     10-20s CPU |                 20-45s CPU |
| MP3 encode                      |                           2-5s |                       3-8s |
| Upload                          |                            <1s |                        <1s |
| 60s MP3 at 64 kbps              |                         ~480KB |                     ~480KB |

Operational requirements:

- Confirm Railway memory headroom before deploying.
- Confirm model downloads work from Railway. If not, pre-bake/cache model files or use a Python sidecar/container with known assets.
- Do not pre-warm the model at boot until memory is measured; lazy load is safer for alpha.
- On Railway Hobby, keep one worker replica for alpha. The current Hobby limits are large enough for Kokoro, but keeping the model resident can increase monthly memory usage. Set a Railway usage alert or hard limit before enabling narration for more than DJ.
- After the smoke test, check whether clearing the Kokoro pipeline and forcing GC actually releases resident memory. If it does, unload the model after 10-15 minutes of audio inactivity. If it does not, rely on one-replica alpha and monitor cost.
- If the general worker also processes daily briefs, monitor whether audio jobs starve normal work.
- If using `ffmpeg`, update both root and worker Nixpacks files because the repo currently installs only Node and pnpm.

## 15. Tests and Verification

### 15.1 Unit Tests

- `stripBriefMarkdown` against real/anonymized brief markdown.
- MP3 encoder with a generated sine/silence Float32Array.
- `normalizeRawAudio` using the observed Kokoro `RawAudio` object shape.
- `enqueueBriefAudioIfEnabled` with mocked Supabase calls for admin enabled, admin disabled, non-admin, missing user, queue failure.

### 15.2 Worker Integration Tests

- Audio job skips when user is not eligible.
- Audio job marks `generating` then `ready`.
- Audio job marks `failed` on synthesis failure.
- Duplicate job sees ready or claimed status and exits without second upload.

### 15.3 API Tests

- Signed URL route rejects unauthenticated users.
- Signed URL route rejects non-owned brief id.
- Signed URL route rejects not-ready audio.
- Signed URL route returns signed URL for owned ready audio.

### 15.4 Manual Verification

- Generate a fresh ontology daily brief with narration disabled: no audio job, no stale audio.
- Enable narration for an admin and generate a brief: row moves `pending -> generating -> ready`.
- Regenerate the same date: old audio disappears while pending and is overwritten when ready.
- Play audio in desktop Chrome and mobile Safari.
- Check worker memory and queue latency during first model load.

## 16. Phased Rollout

### Phase 1 - `kokoro-js` Smoke Test

- Add temporary smoke dependencies in worker.
- Write `apps/worker/scripts/tts-smoke.ts`.
- Load `onnx-community/Kokoro-82M-v1.0-ONNX` with `dtype: 'q8'` and `device: 'cpu'`.
- Verify `am_onyx` exists.
- Generate WAV and MP3 from a short sample and one real/anonymized brief.
- Inspect the actual `RawAudio` object shape and finalize `normalizeRawAudio`.
- Compare quality against the local Python sample.
- Use `@breezystack/lamejs` for MP3 encoding.
- Measure process RSS before model load, after synthesis, and 15 minutes later.

### Phase 2 - DB, Storage, Types

- Add `queue_type` migration.
- Add `ontology_daily_briefs` audio columns.
- Add `users.voice_narration_enabled`.
- Add `briefs-audio` bucket and policies.
- Run `pnpm gen:all`.
- Confirm generated types include audio fields and `generate_brief_audio`.

### Phase 3 - Worker Integration

- Add `enqueueBriefAudioIfEnabled`.
- Call it from `processBriefJob` after `generateOntologyDailyBrief`.
- Add `briefAudioWorker`.
- Add TTS, text cleanup, MP3, and storage helpers.
- Register `generate_brief_audio`.
- Enforce alpha audio concurrency.
- Add focused tests.

### Phase 4 - Frontend

- Extend `DailyBrief` type.
- Extend ontology mapper and dashboard manual mapping.
- Add signed URL endpoint.
- Add `BriefAudioPlayer`.
- Wire modal and dashboard states.
- Add profile toggle and API endpoint.
- Add polling for pending/generating audio.

### Phase 5 - Deploy and Verify

- Deploy with the existing one-replica worker first. Move to an audio-only worker with `QUEUE_BATCH_SIZE=1` only if queue latency or memory behavior is bad.
- Enable admin opt-in for DJ.
- Trigger a brief and verify audio appears.
- Regenerate the same brief date and confirm old audio is cleared/replaced.
- Watch Railway memory and Supabase queue latency.

### Phase 6 - Widen

- Run DJ plus 1-2 admins for a week.
- Review audio quality, markdown cleanup misses, file sizes, queue latency, and memory.
- If stable, remove `is_admin` gating in both enqueue and process paths.

## 17. Known Risks / Things That Can Make This Fail

1. **Wrong table target.** Any implementation that writes only to `daily_briefs` will not appear in the current UI. Use `ontology_daily_briefs`.
2. **Queue enum not migrated.** `add_queue_job` will fail until `queue_type` includes `generate_brief_audio`.
3. **Queue argument names.** Use `p_user_id`, `p_job_type`, `p_metadata`, etc.
4. **Concurrency.** The current queue processes batches concurrently. Add serialization or a dedicated audio worker.
5. **Stale audio on regeneration.** The ontology row is upserted by user/date. Clear old audio fields whenever brief content is regenerated.
6. **Playback duration bug.** Store audio duration from sample count/sample rate, not synthesis wall-clock time.
7. **Kokoro output shape.** `kokoro-js` returns `RawAudio`, not guaranteed `Float32Array`. Verify in Phase 1.
8. **Runtime model downloads.** Railway may be slow or fail when downloading HF model files. Test before alpha.
9. **Memory ceiling.** Kokoro may add 500-900MB resident memory. Confirm the Railway plan.
10. **MP3 encoder license.** `@breezystack/lamejs` is LGPL-3.0 and accepted for alpha. Revisit before broader commercial rollout if needed.
11. **Multiple worker replicas.** In-process locking only serializes within one Node process. Use a single audio worker or DB lock if scaling out.
12. **Signed URL leakage.** URLs are bearer links for their TTL. Keep TTL short and only mint from the server after ownership checks.

## 18. Files Touched

**New files:**

- `supabase/migrations/YYYYMMDDHHMMSS_add_brief_audio_queue_type.sql`
- `supabase/migrations/YYYYMMDDHHMMSS_add_ontology_brief_audio.sql`
- `apps/worker/src/workers/briefAudio/enqueueBriefAudio.ts`
- `apps/worker/src/workers/briefAudio/briefAudioWorker.ts`
- `apps/worker/src/lib/tts/kokoro.ts`
- `apps/worker/src/lib/tts/mp3.ts`
- `apps/worker/src/lib/tts/textCleanup.ts`
- `apps/worker/src/lib/storage/briefAudio.ts`
- `apps/worker/scripts/tts-smoke.ts`
- `apps/web/src/routes/api/daily-briefs/[id]/audio-url/+server.ts`
- `apps/web/src/routes/api/users/voice-narration/+server.ts`
- `apps/web/src/lib/components/briefs/BriefAudioPlayer.svelte`

**Modified files:**

- `apps/worker/package.json`
- `apps/worker/src/worker.ts`
- `apps/worker/src/workers/brief/briefWorker.ts`
- `packages/shared-types/src/queue-types.ts`
- `packages/shared-types/src/validation.ts`
- `packages/shared-types/src/database.schema.ts`
- `packages/shared-types/src/database.types.ts`
- `apps/web/src/lib/types/daily-brief.ts`
- `apps/web/src/lib/services/dailyBrief/ontology-mappers.ts`
- `apps/web/src/lib/components/briefs/DailyBriefModal.svelte`
- `apps/web/src/lib/components/dashboard/DashboardBriefWidget.svelte`
- `apps/web/src/routes/profile/+page.server.ts`
- `apps/web/src/routes/profile/+page.svelte`
