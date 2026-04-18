// apps/web/src/lib/components/agent/agent-chat-voice.svelte.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceNote } from '$lib/types/voice-notes';
import { createVoiceAdapter, VoiceAdapter } from './agent-chat-voice.svelte';

function makeAdapter(): { voice: VoiceAdapter; toastError: ReturnType<typeof vi.fn> } {
	const toastError = vi.fn();
	return { voice: createVoiceAdapter({ toastError }), toastError };
}

function makeNote(overrides: Partial<VoiceNote> = {}): VoiceNote {
	return {
		id: crypto.randomUUID(),
		user_id: 'user-1',
		group_id: 'group-1',
		segment_index: 0,
		status: 'saved',
		transcript: 'hello',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	} as unknown as VoiceNote;
}

describe('VoiceAdapter — defaults', () => {
	it('initializes with empty state', () => {
		const { voice } = makeAdapter();
		expect(voice.ref).toBeNull();
		expect(voice.isRecording).toBe(false);
		expect(voice.isInitializing).toBe(false);
		expect(voice.isStopping).toBe(false);
		expect(voice.isTranscribing).toBe(false);
		expect(voice.errorMessage).toBe('');
		expect(voice.supportsLiveTranscript).toBe(false);
		expect(voice.recordingDuration).toBe(0);
		expect(voice.noteGroupId).toBeNull();
		expect(voice.notesByGroupId).toEqual({});
		expect(voice.pendingSendAfterTranscription).toBe(false);
	});

	it('reports isBusy when any voice operation flag is set', () => {
		const { voice } = makeAdapter();
		expect(voice.isBusy).toBe(false);
		voice.isRecording = true;
		expect(voice.isBusy).toBe(true);
		voice.isRecording = false;
		voice.isInitializing = true;
		expect(voice.isBusy).toBe(true);
		voice.isInitializing = false;
		voice.isTranscribing = true;
		expect(voice.isBusy).toBe(true);
		voice.isTranscribing = false;
		voice.isStopping = true;
		expect(voice.isBusy).toBe(true);
	});
});

describe('VoiceAdapter — upsertNoteInGroup', () => {
	let voice: VoiceAdapter;
	beforeEach(() => {
		voice = makeAdapter().voice;
	});

	it('is a no-op when group_id is missing', () => {
		voice.upsertNoteInGroup(makeNote({ group_id: undefined as any }));
		expect(voice.notesByGroupId).toEqual({});
	});

	it('appends the first note to a new group', () => {
		const note = makeNote();
		voice.upsertNoteInGroup(note);
		expect(voice.notesByGroupId['group-1']).toEqual([note]);
	});

	it('sorts by segment_index', () => {
		const a = makeNote({ segment_index: 2 });
		const b = makeNote({ segment_index: 0 });
		const c = makeNote({ segment_index: 1 });
		voice.upsertNoteInGroup(a);
		voice.upsertNoteInGroup(b);
		voice.upsertNoteInGroup(c);
		expect(voice.notesByGroupId['group-1']?.map((n) => n.segment_index)).toEqual([0, 1, 2]);
	});

	it('tie-breaks segment_index ties by created_at ascending', () => {
		const earlier = makeNote({
			segment_index: 0,
			created_at: '2026-01-01T00:00:00Z'
		});
		const later = makeNote({
			segment_index: 0,
			created_at: '2026-01-01T00:00:05Z'
		});
		voice.upsertNoteInGroup(later);
		voice.upsertNoteInGroup(earlier);
		expect(voice.notesByGroupId['group-1']?.map((n) => n.id)).toEqual([earlier.id, later.id]);
	});

	it('updates an existing note in place by id', () => {
		const note = makeNote({ transcript: 'first' });
		voice.upsertNoteInGroup(note);
		voice.upsertNoteInGroup({ ...note, transcript: 'updated' });
		expect(voice.notesByGroupId['group-1']).toHaveLength(1);
		expect(voice.notesByGroupId['group-1']?.[0]?.transcript).toBe('updated');
	});
});

describe('VoiceAdapter — removeNoteFromGroup', () => {
	let voice: VoiceAdapter;
	beforeEach(() => {
		voice = makeAdapter().voice;
	});

	it('is a no-op on a missing group', () => {
		voice.removeNoteFromGroup('nope', 'nope');
		expect(voice.notesByGroupId).toEqual({});
	});

	it('removes a matching note', () => {
		const note = makeNote();
		voice.upsertNoteInGroup(note);
		voice.removeNoteFromGroup('group-1', note.id);
		expect(voice.notesByGroupId['group-1']).toBeUndefined();
	});

	it('prunes empty groups from the map', () => {
		const note = makeNote();
		voice.upsertNoteInGroup(note);
		voice.removeNoteFromGroup('group-1', note.id);
		expect(Object.keys(voice.notesByGroupId)).toEqual([]);
	});

	it('keeps a group when other notes remain', () => {
		const a = makeNote({ segment_index: 0 });
		const b = makeNote({ segment_index: 1 });
		voice.upsertNoteInGroup(a);
		voice.upsertNoteInGroup(b);
		voice.removeNoteFromGroup('group-1', a.id);
		expect(voice.notesByGroupId['group-1']?.map((n) => n.id)).toEqual([b.id]);
	});
});

describe('VoiceAdapter — segment callbacks', () => {
	it('handleSegmentSaved proxies to upsertNoteInGroup', () => {
		const { voice } = makeAdapter();
		const note = makeNote();
		voice.handleSegmentSaved(note);
		expect(voice.notesByGroupId['group-1']).toEqual([note]);
	});

	it('handleSegmentError is a no-op on empty messages', () => {
		const { voice, toastError } = makeAdapter();
		voice.handleSegmentError('');
		voice.handleSegmentError('   ' as any); // only falsy-empty are no-op; whitespace passes through
		expect(toastError).toHaveBeenCalledTimes(1);
		expect(toastError).toHaveBeenCalledWith('   ');
	});

	it('handleSegmentError surfaces an error toast on a non-empty message', () => {
		const { voice, toastError } = makeAdapter();
		voice.handleSegmentError('Mic blocked');
		expect(toastError).toHaveBeenCalledWith('Mic blocked');
	});
});

describe('VoiceAdapter — reset', () => {
	it('clears the fields that resetConversation used to reset inline', () => {
		const { voice } = makeAdapter();
		voice.errorMessage = 'oops';
		voice.isStopping = true;
		voice.noteGroupId = 'group-1';
		voice.notesByGroupId = { 'group-1': [makeNote()] };
		voice.pendingSendAfterTranscription = true;

		voice.reset();

		expect(voice.errorMessage).toBe('');
		expect(voice.isStopping).toBe(false);
		expect(voice.noteGroupId).toBeNull();
		expect(voice.notesByGroupId).toEqual({});
		expect(voice.pendingSendAfterTranscription).toBe(false);
	});

	it('preserves fields the child component owns (recording flags, duration)', () => {
		const { voice } = makeAdapter();
		voice.isRecording = true;
		voice.isInitializing = true;
		voice.isTranscribing = true;
		voice.supportsLiveTranscript = true;
		voice.recordingDuration = 4200;

		voice.reset();

		expect(voice.isRecording).toBe(true);
		expect(voice.isInitializing).toBe(true);
		expect(voice.isTranscribing).toBe(true);
		expect(voice.supportsLiveTranscript).toBe(true);
		expect(voice.recordingDuration).toBe(4200);
	});
});

describe('VoiceAdapter — hydrateNotesByGroupId', () => {
	it('replaces notesByGroupId', () => {
		const { voice } = makeAdapter();
		const note = makeNote();
		voice.hydrateNotesByGroupId({ 'group-1': [note] });
		expect(voice.notesByGroupId).toEqual({ 'group-1': [note] });
	});

	it('maps null/undefined to an empty object', () => {
		const { voice } = makeAdapter();
		voice.hydrateNotesByGroupId(null);
		expect(voice.notesByGroupId).toEqual({});
		voice.hydrateNotesByGroupId(undefined);
		expect(voice.notesByGroupId).toEqual({});
	});
});

describe('VoiceAdapter — stop / cleanup', () => {
	it('awaits ref.stopRecording when present', async () => {
		const { voice } = makeAdapter();
		const stopRecording = vi.fn().mockResolvedValue(undefined);
		voice.ref = { stopRecording } as any;
		await voice.stop();
		expect(stopRecording).toHaveBeenCalledTimes(1);
	});

	it('swallows stopRecording errors via logWarn', async () => {
		const logWarn = vi.fn();
		const voice = createVoiceAdapter({
			toastError: vi.fn(),
			logWarn
		});
		voice.ref = {
			stopRecording: () => Promise.reject(new Error('boom'))
		} as any;
		await voice.stop();
		expect(logWarn).toHaveBeenCalled();
	});

	it('is a no-op when ref is null', async () => {
		const { voice } = makeAdapter();
		await voice.stop();
		await voice.cleanup();
	});

	it('awaits ref.cleanup when present', async () => {
		const { voice } = makeAdapter();
		const cleanup = vi.fn().mockResolvedValue(undefined);
		voice.ref = { cleanup } as any;
		await voice.cleanup();
		expect(cleanup).toHaveBeenCalledTimes(1);
	});
});
