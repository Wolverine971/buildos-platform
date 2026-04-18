// apps/web/src/lib/components/agent/agent-chat-voice.svelte.ts
//
// VoiceAdapter — encapsulates the voice-recording state and callbacks
// used by AgentChatModal + AgentComposer. Exposes reactive $state fields
// so the Svelte template can bind to them via `bind:field={voice.field}`.
//
// See: apps/web/docs/features/agentic-chat/PROPOSAL_2026-04-18_GOD-COMPONENT-DECOMPOSITION.md

import type TextareaWithVoiceComponent from '$lib/components/ui/TextareaWithVoice.svelte';
import type { VoiceNote } from '$lib/types/voice-notes';

export interface VoiceAdapterDeps {
	/** Surface a user-visible error (typically `toastService.error`). */
	toastError(message: string): void;
	/** Dev-mode logger used when the underlying voice ref throws. */
	logWarn?(msg: string, err: unknown): void;
}

export class VoiceAdapter {
	ref = $state<TextareaWithVoiceComponent | null>(null);
	isRecording = $state(false);
	isInitializing = $state(false);
	isStopping = $state(false);
	isTranscribing = $state(false);
	errorMessage = $state('');
	supportsLiveTranscript = $state(false);
	recordingDuration = $state(0);
	noteGroupId = $state<string | null>(null);
	notesByGroupId = $state<Record<string, VoiceNote[]>>({});
	pendingSendAfterTranscription = $state(false);

	#toastError: (message: string) => void;
	#logWarn: (msg: string, err: unknown) => void;

	constructor(deps: VoiceAdapterDeps) {
		this.#toastError = deps.toastError;
		this.#logWarn =
			deps.logWarn ??
			((_msg, _err) => {
				/* no-op */
			});
	}

	/** True while any asynchronous voice operation is in flight. */
	get isBusy(): boolean {
		return this.isRecording || this.isInitializing || this.isStopping || this.isTranscribing;
	}

	async stop(): Promise<void> {
		try {
			await this.ref?.stopRecording?.();
		} catch (error) {
			this.#logWarn('Failed to stop voice input', error);
		}
	}

	async cleanup(): Promise<void> {
		try {
			await this.ref?.cleanup?.();
		} catch (error) {
			this.#logWarn('Failed to cleanup voice input', error);
		}
	}

	upsertNoteInGroup(note: VoiceNote): void {
		if (!note.group_id) return;
		const groupId = note.group_id;
		const existing = this.notesByGroupId[groupId] ?? [];
		const next = [...existing.filter((entry) => entry.id !== note.id), note].sort((a, b) => {
			const aIndex = a.segment_index ?? 0;
			const bIndex = b.segment_index ?? 0;
			if (aIndex !== bIndex) return aIndex - bIndex;
			return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
		});
		this.notesByGroupId = { ...this.notesByGroupId, [groupId]: next };
	}

	removeNoteFromGroup(groupId: string, noteId: string): void {
		const existing = this.notesByGroupId[groupId];
		if (!existing) return;
		const next = existing.filter((entry) => entry.id !== noteId);
		if (next.length === 0) {
			const { [groupId]: _removed, ...rest } = this.notesByGroupId;
			this.notesByGroupId = rest;
			return;
		}
		this.notesByGroupId = { ...this.notesByGroupId, [groupId]: next };
	}

	handleSegmentSaved(note: VoiceNote): void {
		this.upsertNoteInGroup(note);
	}

	handleSegmentError(message: string): void {
		if (!message) return;
		this.#toastError(message);
	}

	/**
	 * Reset fields cleared by `resetConversation`. Preserves `ref`,
	 * `isRecording`, `isInitializing`, `isTranscribing`, `supportsLiveTranscript`,
	 * and `recordingDuration` since those are managed by the child component.
	 */
	reset(): void {
		this.errorMessage = '';
		this.isStopping = false;
		this.noteGroupId = null;
		this.notesByGroupId = {};
		this.pendingSendAfterTranscription = false;
	}

	/** Rehydrate the note groups from a saved session snapshot. */
	hydrateNotesByGroupId(notes: Record<string, VoiceNote[]> | null | undefined): void {
		this.notesByGroupId = notes ?? {};
	}
}

export function createVoiceAdapter(deps: VoiceAdapterDeps): VoiceAdapter {
	return new VoiceAdapter(deps);
}
