// apps/web/src/lib/utils/playback-speed-storage.ts
export const PLAYBACK_SPEEDS = [1, 1.2, 1.5, 1.7, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

const STORAGE_KEY = 'voice_note_playback_speed';

export function getStoredPlaybackSpeed(): PlaybackSpeed {
	if (typeof window === 'undefined') return 1;
	const stored = window.localStorage.getItem(STORAGE_KEY);
	if (!stored) return 1;
	const parsed = Number(stored);
	if (PLAYBACK_SPEEDS.includes(parsed as PlaybackSpeed)) {
		return parsed as PlaybackSpeed;
	}
	return 1;
}

export function storePlaybackSpeed(speed: PlaybackSpeed): void {
	if (typeof window === 'undefined') return;
	window.localStorage.setItem(STORAGE_KEY, speed.toString());
}
