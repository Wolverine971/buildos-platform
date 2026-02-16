// apps/web/src/lib/services/voice-notes.service.ts
import type {
	VoiceNote,
	VoiceNoteListResponse,
	VoiceNotePlaybackResponse
} from '$lib/types/voice-notes';
import { ApiError } from '$lib/utils/api-client';
import { extractApiErrorMessage } from '$lib/utils/api-client-helpers';

export interface UploadVoiceNoteOptions {
	audioBlob: Blob;
	durationSeconds?: number | null;
	linkedEntityType?: string | null;
	linkedEntityId?: string | null;
	groupId?: string | null;
	segmentIndex?: number | null;
	recordedAt?: string | null;
	transcript?: string | null;
	transcriptionStatus?: string | null;
	transcriptionSource?: string | null;
	transcriptionModel?: string | null;
	metadata?: Record<string, unknown> | null;
	transcribe?: boolean;
	onProgress?: (progress: number) => void;
}

const MIME_EXTENSION_MAP: Record<string, string> = {
	'audio/webm': 'webm',
	'audio/ogg': 'ogg',
	'audio/mp4': 'm4a',
	'audio/wav': 'wav',
	'audio/mpeg': 'mp3',
	'audio/mp3': 'mp3',
	'audio/aac': 'm4a'
};

function getExtensionForMimeType(mimeType: string): string {
	return MIME_EXTENSION_MAP[mimeType] || 'webm';
}

export async function uploadVoiceNote(options: UploadVoiceNoteOptions): Promise<VoiceNote> {
	const {
		audioBlob,
		durationSeconds,
		linkedEntityType,
		linkedEntityId,
		groupId,
		segmentIndex,
		recordedAt,
		transcript,
		transcriptionStatus,
		transcriptionSource,
		transcriptionModel,
		metadata,
		transcribe = false,
		onProgress
	} = options;

	const rawMimeType = audioBlob.type || 'audio/webm';
	const mimeType = rawMimeType.split(';')[0]?.trim().toLowerCase() || 'audio/webm';
	const extension = getExtensionForMimeType(mimeType);
	const audioFile = new File([audioBlob], `voice-note.${extension}`, { type: rawMimeType });

	const formData = new FormData();
	formData.append('audio', audioFile);

	if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds)) {
		formData.append('durationSeconds', durationSeconds.toString());
	}
	if (linkedEntityType) {
		formData.append('linkedEntityType', linkedEntityType);
	}
	if (linkedEntityId) {
		formData.append('linkedEntityId', linkedEntityId);
	}
	if (transcribe) {
		formData.append('transcribe', 'true');
	}
	if (groupId) {
		formData.append('groupId', groupId);
	}
	if (typeof segmentIndex === 'number' && Number.isFinite(segmentIndex)) {
		formData.append('segmentIndex', segmentIndex.toString());
	}
	if (recordedAt) {
		formData.append('recordedAt', recordedAt);
	}
	if (transcript) {
		formData.append('transcript', transcript);
	}
	if (transcriptionStatus) {
		formData.append('transcriptionStatus', transcriptionStatus);
	}
	if (transcriptionSource) {
		formData.append('transcriptionSource', transcriptionSource);
	}
	if (transcriptionModel) {
		formData.append('transcriptionModel', transcriptionModel);
	}
	if (metadata && typeof metadata === 'object') {
		formData.append('metadata', JSON.stringify(metadata));
	}

	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', '/api/voice-notes');
		xhr.responseType = 'json';

		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable && onProgress) {
				onProgress(event.loaded / event.total);
			}
		};

		xhr.onload = () => {
			const payload = xhr.response ?? null;
			if (xhr.status >= 200 && xhr.status < 300) {
				if (payload?.data) {
					resolve(payload.data as VoiceNote);
					return;
				}
				reject(new ApiError('Unexpected response from server', xhr.status, payload));
				return;
			}

			reject(
				new ApiError(
					extractApiErrorMessage(payload, 'Failed to upload voice note'),
					xhr.status,
					payload
				)
			);
		};

		xhr.onerror = () => {
			reject(new ApiError('Network error while uploading voice note', 0));
		};

		xhr.send(formData);
	});
}

export async function listVoiceNotes(params?: {
	linkedEntityType?: string;
	linkedEntityId?: string;
	groupId?: string;
	groupIds?: string[];
	limit?: number;
	offset?: number;
}): Promise<VoiceNote[]> {
	const searchParams = new URLSearchParams();
	if (params?.linkedEntityType) {
		searchParams.set('linkedEntityType', params.linkedEntityType);
	}
	if (params?.linkedEntityId) {
		searchParams.set('linkedEntityId', params.linkedEntityId);
	}
	if (params?.groupId) {
		searchParams.set('groupId', params.groupId);
	}
	if (params?.groupIds && params.groupIds.length > 0) {
		searchParams.set('groupIds', params.groupIds.join(','));
	}
	if (params?.limit) {
		searchParams.set('limit', params.limit.toString());
	}
	if (params?.offset) {
		searchParams.set('offset', params.offset.toString());
	}

	const response = await fetch(`/api/voice-notes?${searchParams.toString()}`);
	const payload = (await response.json()) as {
		success?: boolean;
		data?: VoiceNoteListResponse;
		error?: unknown;
	};

	if (!response.ok || !payload?.success) {
		throw new ApiError(
			extractApiErrorMessage(payload, 'Failed to load voice notes'),
			response.status,
			payload
		);
	}

	return payload?.data?.voiceNotes || [];
}

export async function getVoiceNotePlaybackUrl(id: string): Promise<VoiceNotePlaybackResponse> {
	const response = await fetch(`/api/voice-notes/${id}/play`);
	const payload = (await response.json()) as {
		success?: boolean;
		data?: VoiceNotePlaybackResponse;
		error?: unknown;
	};

	if (!response.ok || !payload?.success || !payload?.data) {
		throw new ApiError(
			extractApiErrorMessage(payload, 'Failed to load playback URL'),
			response.status,
			payload
		);
	}

	return payload.data;
}

export async function updateVoiceNote(
	id: string,
	payload: {
		transcript?: string | null;
		transcriptionStatus?: string | null;
		transcriptionSource?: string | null;
		transcriptionModel?: string | null;
		transcriptionError?: string | null;
		metadata?: Record<string, unknown> | null;
	}
): Promise<VoiceNote> {
	const response = await fetch(`/api/voice-notes/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
	const result = (await response.json()) as {
		success?: boolean;
		data?: VoiceNote;
		error?: unknown;
	};

	if (!response.ok || !result?.success || !result?.data) {
		throw new ApiError(
			extractApiErrorMessage(result, 'Failed to update voice note'),
			response.status,
			result
		);
	}

	return result.data;
}

export async function deleteVoiceNote(id: string): Promise<void> {
	const response = await fetch(`/api/voice-notes/${id}`, { method: 'DELETE' });
	const payload = (await response.json()) as { success?: boolean; error?: unknown };

	if (!response.ok || !payload?.success) {
		throw new ApiError(
			extractApiErrorMessage(payload, 'Failed to delete voice note'),
			response.status,
			payload
		);
	}
}
