// apps/web/src/lib/types/voice-notes.ts
export type VoiceNote = {
	id: string;
	user_id: string;
	storage_path: string;
	storage_bucket: string;
	file_size_bytes: number;
	duration_seconds: number | null;
	mime_type: string;
	transcript: string | null;
	transcription_model: string | null;
	transcription_status: string;
	transcription_error: string | null;
	linked_entity_type: string | null;
	linked_entity_id: string | null;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
};

export type VoiceNoteListResponse = {
	voiceNotes: VoiceNote[];
};

export type VoiceNotePlaybackResponse = {
	url: string;
	expiresAt: string;
};
