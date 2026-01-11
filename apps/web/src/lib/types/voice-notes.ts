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
	group_id: string | null;
	segment_index: number | null;
	recorded_at: string | null;
	metadata: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
};

export type VoiceNoteGroup = {
	id: string;
	user_id: string;
	linked_entity_type: string | null;
	linked_entity_id: string | null;
	chat_session_id: string | null;
	status: string;
	metadata: Record<string, unknown> | null;
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
