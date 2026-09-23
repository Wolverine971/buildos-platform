// apps/web/src/lib/voice/voice-note-sink.ts
//
// Saves each dictation's audio as a voice note, then fills in its transcript
// once the dictation commits. Recordings tied to a document or plan are
// created as "attached" so the 24h draft cleanup never deletes them.

import {
	cleanupVoiceNoteGroups,
	createVoiceNoteGroup
} from '$lib/services/voice-note-groups.service';
import { updateVoiceNote, uploadVoiceNote } from '$lib/services/voice-notes.service';
import type { VoiceNote } from '$lib/types/voice-notes';
import type { DictationResult } from './dictation-session.svelte';

export interface VoiceNoteSinkOptions {
	/** Where the recording came from (stored as metadata.source_component). */
	source: string | (() => string);
	getGroupId: () => string | null;
	setGroupId: (groupId: string) => void;
	linkedEntity?: () => { type: string; id: string } | null;
	onSaved?: (note: VoiceNote) => void;
	onError?: (message: string) => void;
}

export interface SavedRecording {
	/** Attach the final transcript (safe to call before the upload finishes). */
	complete(result: DictationResult): void;
}

const MAX_CONCURRENT_UPLOADS = 2;
let activeUploads = 0;
const uploadQueue: Array<() => Promise<void>> = [];
let draftCleanupScheduled = false;

function pumpUploads() {
	while (activeUploads < MAX_CONCURRENT_UPLOADS && uploadQueue.length > 0) {
		const task = uploadQueue.shift();
		if (!task) return;
		activeUploads += 1;
		void task()
			.catch(() => undefined)
			.finally(() => {
				activeUploads -= 1;
				pumpUploads();
			});
	}
}

/** Unattached drafts older than a day are removed once per page load. */
export function scheduleVoiceDraftCleanup(): void {
	if (draftCleanupScheduled || typeof window === 'undefined') return;
	draftCleanupScheduled = true;
	const run = () => {
		cleanupVoiceNoteGroups({ maxAgeHours: 24 }).catch(() => undefined);
	};
	const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void })
		.requestIdleCallback;
	if (idle) idle(run);
	else setTimeout(run, 1500);
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

export function createVoiceNoteSink(options: VoiceNoteSinkOptions) {
	const sourceOf = () =>
		typeof options.source === 'function' ? options.source() : options.source;
	const groupCreations = new Map<string, Promise<void>>();
	const segmentCounters = new Map<string, number>();

	function ensureGroup(): string {
		const existing = options.getGroupId();
		const linked = options.linkedEntity?.() ?? null;
		const groupId = existing ?? crypto.randomUUID();
		if (!existing) options.setGroupId(groupId);
		if (!existing && !groupCreations.has(groupId)) {
			const creation = createVoiceNoteGroup({
				id: groupId,
				metadata: { source_component: sourceOf() },
				...(linked
					? {
							linkedEntityType: linked.type,
							linkedEntityId: linked.id,
							status: 'attached'
						}
					: {})
			}).then(
				() => undefined,
				(error) => {
					groupCreations.delete(groupId);
					throw error;
				}
			);
			groupCreations.set(groupId, creation);
		}
		return groupId;
	}

	function save(audio: Blob, durationSeconds: number): SavedRecording {
		const groupId = ensureGroup();
		const segmentIndex = (segmentCounters.get(groupId) ?? 0) + 1;
		segmentCounters.set(groupId, segmentIndex);
		const recordedAt = new Date().toISOString();
		const linked = options.linkedEntity?.() ?? null;

		let noteId: string | null = null;
		let pendingResult: DictationResult | null = null;

		const applyResult = async (result: DictationResult) => {
			if (!noteId) return;
			try {
				const updated = await updateVoiceNote(noteId, {
					transcript: result.text || null,
					transcriptionStatus: result.text ? 'complete' : 'failed',
					transcriptionSource:
						result.transcriptionSource === 'none' ? null : result.transcriptionSource,
					transcriptionModel: result.transcriptionModel,
					transcriptionError: result.text ? null : 'No speech was transcribed',
					metadata:
						result.failedSegments > 0 ? { failed_segments: result.failedSegments } : null
				});
				options.onSaved?.(updated);
			} catch (error) {
				options.onError?.(errorMessage(error, 'Failed to save the voice note transcript'));
			}
		};

		uploadQueue.push(async () => {
			try {
				await (groupCreations.get(groupId) ?? Promise.resolve());
				const note = await uploadVoiceNote({
					audioBlob: audio,
					durationSeconds,
					groupId,
					segmentIndex,
					recordedAt,
					linkedEntityType: linked?.type ?? null,
					linkedEntityId: linked?.id ?? null,
					transcriptionStatus: 'pending',
					transcribe: false,
					metadata: { source_component: sourceOf() }
				});
				noteId = note.id;
				options.onSaved?.(note);
				if (pendingResult) await applyResult(pendingResult);
			} catch (error) {
				options.onError?.(errorMessage(error, 'Failed to save the voice recording'));
			}
		});
		pumpUploads();

		return {
			complete(result: DictationResult) {
				if (noteId) void applyResult(result);
				else pendingResult = result;
			}
		};
	}

	return { save, ensureGroup };
}

export type VoiceNoteSink = ReturnType<typeof createVoiceNoteSink>;
