// apps/worker/src/workers/voice-notes/voiceNoteStorage.ts

/**
 * A voice note row names its own Storage object, and users write those rows.
 * Service-role readers only follow it when it is the user's own object in the
 * voice_notes bucket ("<user_id>/<file>"), as the upload route writes it.
 */
export function isOwnVoiceNoteObject(
	userId: string,
	bucket: string | null | undefined,
	path: string | null | undefined
): boolean {
	return (
		bucket === 'voice_notes' &&
		typeof path === 'string' &&
		path.startsWith(`${userId}/`) &&
		path.length > userId.length + 1 &&
		!path.includes('..')
	);
}
