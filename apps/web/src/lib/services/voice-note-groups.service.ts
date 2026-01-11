// apps/web/src/lib/services/voice-note-groups.service.ts
import type { VoiceNoteGroup } from '$lib/types/voice-notes';
import { ApiError } from '$lib/utils/api-client';

function extractErrorMessage(payload: any, fallback: string): string {
	if (!payload) return fallback;
	return payload.error || payload.message || fallback;
}

export async function createVoiceNoteGroup(options?: {
	id?: string;
	metadata?: Record<string, unknown>;
	status?: string;
	linkedEntityType?: string;
	linkedEntityId?: string;
	chatSessionId?: string;
}): Promise<VoiceNoteGroup> {
	const response = await fetch('/api/voice-note-groups', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(options ?? {})
	});
	const payload = (await response.json()) as {
		success?: boolean;
		data?: VoiceNoteGroup;
		error?: string;
		message?: string;
	};

	if (!response.ok || !payload?.data) {
		throw new ApiError(
			extractErrorMessage(payload, 'Failed to create voice note group'),
			response.status,
			payload
		);
	}

	return payload.data;
}

export async function attachVoiceNoteGroup(
	id: string,
	payload: {
		linkedEntityType: string;
		linkedEntityId: string;
		chatSessionId?: string;
		status?: string;
		metadata?: Record<string, unknown>;
	}
): Promise<VoiceNoteGroup> {
	const response = await fetch(`/api/voice-note-groups/${id}/attach`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
	const result = (await response.json()) as {
		success?: boolean;
		data?: VoiceNoteGroup;
		error?: string;
		message?: string;
	};

	if (!response.ok || !result?.data) {
		throw new ApiError(
			extractErrorMessage(result, 'Failed to attach voice note group'),
			response.status,
			result
		);
	}

	return result.data;
}

export async function cleanupVoiceNoteGroups(options?: {
	maxAgeHours?: number;
	limit?: number;
}): Promise<{ deletedGroupIds: string[]; deletedVoiceNotes: number }> {
	const response = await fetch('/api/voice-note-groups/cleanup', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(options ?? {})
	});
	const payload = (await response.json()) as {
		success?: boolean;
		data?: { deletedGroupIds: string[]; deletedVoiceNotes: number };
		error?: string;
		message?: string;
	};

	if (!response.ok || !payload?.data) {
		throw new ApiError(
			extractErrorMessage(payload, 'Failed to cleanup voice note groups'),
			response.status,
			payload
		);
	}

	return payload.data;
}
